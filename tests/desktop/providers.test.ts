import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  SubscriptionProviders,
  type GenerateRequest,
} from "../../src/desktop/providers.js";
import { SettingsSchema } from "../../src/desktop/shared.js";
import { providerFailure } from "../../src/desktop/provider-errors.js";
import { reportOutputSchema } from "../../src/desktop/provider-schema.js";
import { analysis } from "./fixtures.js";

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  query: vi.fn(),
  codex: vi.fn(),
  thread: vi.fn(),
  run: vi.fn(),
  cursorStatus: vi.fn(),
  cursorLogin: vi.fn(),
  cursorLogout: vi.fn(),
  credentials: vi.fn(),
  models: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  cancel: vi.fn(),
  wait: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("execa", () => ({ execa: mocks.execa }));
vi.mock("../../src/desktop/provider-runtime.js", async (original) => ({
  ...(await original<typeof import("../../src/desktop/provider-runtime.js")>()),
  providerExecutable: async (provider: string) => `/bundled/${provider}`,
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: mocks.query }));
vi.mock("@openai/codex-sdk", () => ({ Codex: mocks.codex }));
vi.mock("@cursor/sdk", () => ({
  Cursor: {
    auth: {
      status: mocks.cursorStatus,
      login: mocks.cursorLogin,
      logout: mocks.cursorLogout,
    },
    models: { list: mocks.models },
  },
  FileCredentialStore: class {
    load = mocks.credentials;
  },
  JsonlLocalAgentStore: class {},
  Agent: { create: mocks.create },
}));
async function* events(items: unknown[]) {
  yield* items;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let directory: string;
let providers: SubscriptionProviders;
const request = (
  provider: GenerateRequest["provider"],
  mode: GenerateRequest["mode"] = "quick",
): GenerateRequest => ({
  provider,
  mode,
  body: "A deliberately private idea",
  settings: SettingsSchema.parse({ provider }),
  controller: new AbortController(),
  progress: vi.fn(),
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("CURSOR_BACKEND_URL", "");
  vi.stubEnv("CURSOR_WEBSITE_URL", "");
  directory = await mkdtemp(path.join(os.tmpdir(), "saasfactory-provider-"));
  providers = new SubscriptionProviders(directory);
  mocks.execa.mockImplementation(async (executable: string) => ({
    exitCode: 0,
    stderr: "",
    stdout: executable.endsWith("codex")
      ? "Logged in using ChatGPT"
      : JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }),
  }));
  mocks.codex.mockImplementation(() => ({ startThread: mocks.thread }));
  mocks.thread.mockReturnValue({ runStreamed: mocks.run });
  mocks.run.mockResolvedValue({
    events: events([
      {
        type: "item.completed",
        item: { type: "agent_message", text: JSON.stringify(analysis()) },
      },
      { type: "turn.completed", usage: {} },
    ]),
  });
  mocks.query.mockImplementation(() =>
    events([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Report is ready",
        structured_output: analysis(),
      },
    ]),
  );
  mocks.cursorStatus.mockResolvedValue({
    status: "logged-in",
    backendUrl: "https://api2.cursor.sh",
  });
  mocks.credentials.mockResolvedValue({
    backendUrl: "https://api2.cursor.sh",
    apiKey: "stored-user-key",
  });
  mocks.models.mockResolvedValue([{ id: "available-model" }]);
  mocks.create.mockResolvedValue({ send: mocks.send, close: mocks.close });
  mocks.send.mockResolvedValue({
    stream: mocks.stream,
    wait: mocks.wait,
    cancel: mocks.cancel,
  });
  mocks.stream.mockImplementation(() => events([]));
  mocks.wait.mockResolvedValue({
    status: "finished",
    result: JSON.stringify(analysis()),
  });
  mocks.cancel.mockResolvedValue(undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("subscription boundaries", () => {
  it.each([
    ["quick", "gpt-6-luna", "high", "disabled"],
    ["deep", "gpt-6-sol", "medium", "live"],
    ["challenge", "gpt-6-astra", "high", "live"],
  ] as const)(
    "routes %s to the configured SDK model and web mode",
    async (mode, model, effort, search) => {
      const input = request("codex", mode);
      if (mode === "challenge") input.previousAnalysis = analysis();
      expect(await providers.generate(input)).toMatchObject({
        model,
        reasoningEffort: effort,
      });
      expect(mocks.thread).toHaveBeenCalledWith(
        expect.objectContaining({
          model,
          modelReasoningEffort: effort,
          webSearchMode: search,
        }),
      );
      if (mode === "challenge") {
        expect(mocks.run.mock.calls[0]![0]).toContain("CHALLENGE REVIEW");
        expect(mocks.run.mock.calls[0]![0]).toContain("PRIOR ASSESSMENT DATA");
      }
    },
  );
  it("honors a per-task model override without switching models after an error", async () => {
    const input = request("codex", "deep");
    input.settings.codexModels.deep = "account-specific-model";
    mocks.run.mockRejectedValue(new Error("model_not_found"));
    await expect(providers.generate(input)).rejects.toMatchObject({
      code: "model",
    });
    expect(mocks.thread).toHaveBeenCalledTimes(1);
    expect(mocks.thread).toHaveBeenCalledWith(
      expect.objectContaining({ model: "account-specific-model" }),
    );
  });
  it("refuses an unsupported challenge before any account or model request", async () => {
    await expect(
      providers.generate({
        ...request("claude", "challenge"),
        previousAnalysis: analysis(),
      }),
    ).rejects.toMatchObject({ code: "configuration" });
    await expect(
      providers.generate(request("codex", "challenge")),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(mocks.execa).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["codex", "claude"] as const)(
    "rejects %s API-key sessions before starting work",
    async (id) => {
      mocks.execa.mockResolvedValue({
        exitCode: 0,
        stderr: "",
        stdout:
          id === "codex"
            ? "Logged in using an API key"
            : JSON.stringify({ loggedIn: true, authMethod: "api_key" }),
      });
      await expect(providers.generate(request(id))).rejects.toMatchObject({
        code: "auth",
      });
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.codex).not.toHaveBeenCalled();
    },
  );
  it("checks only the selected provider and forces Codex's account route", async () => {
    vi.stubEnv("OPENAI_API_KEY", "secret-api-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://unexpected.test");
    await providers.generate(request("codex"));
    expect(mocks.cursorStatus).not.toHaveBeenCalled();
    expect(mocks.execa).toHaveBeenCalledTimes(1);
    const options = mocks.codex.mock.calls[0]![0];
    expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
    expect(options.env).not.toHaveProperty("OPENAI_BASE_URL");
    expect(options.env.CODEX_HOME).toBe(path.join(directory, "codex"));
    expect(options.config.forced_login_method).toBe("chatgpt");
    expect(mocks.thread).toHaveBeenCalledWith(
      expect.objectContaining({
        webSearchMode: "disabled",
        sandboxMode: "read-only",
        approvalPolicy: "never",
      }),
    );
    expect(mocks.run.mock.calls[0]![1].outputSchema).toEqual(
      reportOutputSchema,
    );
  });
  it.each(["codex", "claude"] as const)(
    "forces subscription browser sign-in for %s and verifies it",
    async (id) => {
      await expect(providers.connect(id, vi.fn())).resolves.toBe(
        "Subscription account connected.",
      );
      expect(mocks.execa.mock.calls[0]![1]).toEqual(
        id === "codex"
          ? ["login", "-c", 'forced_login_method="chatgpt"']
          : ["auth", "login", "--claudeai"],
      );
      expect(mocks.execa.mock.calls[0]![2]).toMatchObject({
        extendEnv: false,
        cancelSignal: expect.any(AbortSignal),
      });
      expect(mocks.execa).toHaveBeenCalledTimes(2);
    },
  );
  it("does not report successful connection when login exits without a subscription", async () => {
    mocks.execa.mockResolvedValue({
      exitCode: 0,
      stdout: "Logged in using an API key",
      stderr: "",
    });
    await expect(providers.connect("codex", vi.fn())).rejects.toMatchObject({
      code: "auth",
    });
  });
  it("never starts an already-cancelled login", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      providers.connect("codex", vi.fn(), controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(mocks.execa).not.toHaveBeenCalled();
  });
  it("logs out using only the app's dedicated Codex configuration", async () => {
    mocks.execa.mockResolvedValue({
      exitCode: 0,
      stdout: "Not logged in",
      stderr: "",
    });
    await providers.disconnect("codex");
    expect(mocks.execa.mock.calls[0]![1]).toEqual(["logout"]);
    expect(mocks.execa.mock.calls[0]![2].env.CODEX_HOME).toBe(
      path.join(directory, "codex"),
    );
  });
  it("does not start unsupported Grok work", async () => {
    await expect(providers.generate(request("xai"))).rejects.toMatchObject({
      code: "configuration",
    });
    expect(mocks.execa).not.toHaveBeenCalled();
  });
});

describe("report completion and observed research", () => {
  it("uses Claude's structured result, not its conversational summary", async () => {
    expect(
      JSON.parse((await providers.generate(request("claude"))).text),
    ).toEqual(analysis());
    const options = mocks.query.mock.calls[0]![0].options;
    expect(options.outputFormat).toEqual({
      type: "json_schema",
      schema: reportOutputSchema,
    });
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(await options.canUseTool("Bash", {})).toMatchObject({
      behavior: "deny",
    });
  });
  it("requires Claude's final structured result", async () => {
    mocks.query.mockImplementation(() =>
      events([
        { type: "result", subtype: "success", result: "No structured result" },
      ]),
    );
    await expect(providers.generate(request("claude"))).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
  it.each([true, false])(
    "marks Claude search evidence only when a search tool succeeds (is_error=%s)",
    async (isError) => {
      mocks.query.mockImplementation(() =>
        events([
          {
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "WebSearch", id: "search1" }],
            },
          },
          {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "search1",
                  is_error: isError,
                },
              ],
            },
          },
          { type: "result", subtype: "success", structured_output: analysis() },
        ]),
      );
      expect(
        (await providers.generate(request("claude", "deep"))).searched,
      ).toBe(!isError);
    },
  );
  it("reports Claude quota failures with an actionable message", async () => {
    mocks.query.mockImplementation(() =>
      events([
        {
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          errors: ["rate_limit exceeded"],
        },
      ]),
    );
    await expect(providers.generate(request("claude"))).rejects.toMatchObject({
      code: "quota",
    });
  });
  it("rejects an interrupted Codex stream even if it emitted a JSON message", async () => {
    mocks.run.mockResolvedValue({
      events: events([
        {
          type: "item.completed",
          item: { type: "agent_message", text: JSON.stringify(analysis()) },
        },
      ]),
    });
    await expect(providers.generate(request("codex"))).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
  it("does not persist a Codex failure containing a command, credential, or prompt", async () => {
    mocks.run.mockResolvedValue({
      events: events([
        {
          type: "turn.failed",
          error: {
            message:
              "401 unauthorized --api-key secret-api-key --prompt A deliberately private idea",
          },
        },
      ]),
    });
    await expect(providers.generate(request("codex"))).rejects.toMatchObject({
      code: "auth",
      message: expect.not.stringContaining("secret-api-key"),
    });
  });
  it("requires complete closed object schemas including all nested report fields", () => {
    const check = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(node.required.slice().sort()).toEqual(
          Object.keys(node.properties).sort(),
        );
      }
      Object.values(node).forEach(check);
    };
    check(reportOutputSchema);
    expect(JSON.stringify(reportOutputSchema)).not.toContain('"$ref"');
  });
});

describe("Cursor user authentication and cancellation", () => {
  it("passes the stored user key explicitly and gives quick checks no tools", async () => {
    vi.stubEnv("CURSOR_API_KEY", "unrelated-team-key");
    await providers.generate(request("cursor"));
    expect(mocks.models).toHaveBeenCalledWith({ apiKey: "stored-user-key" });
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      apiKey: "stored-user-key",
      tools: [],
      mcpServers: {},
      local: { settingSources: [], enableAgentRetries: false },
    });
    expect(mocks.close).toHaveBeenCalled();
  });
  it("blocks inherited endpoint overrides before credentials are sent", async () => {
    vi.stubEnv("CURSOR_BACKEND_URL", "https://unexpected.test");
    await expect(providers.generate(request("cursor"))).rejects.toThrow(
      "Custom Cursor endpoints",
    );
    expect(mocks.cursorStatus).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("blocks stored nonproduction credentials", async () => {
    mocks.credentials.mockResolvedValue({
      backendUrl: "https://unexpected.test",
      apiKey: "secret",
    });
    await expect(providers.generate(request("cursor"))).rejects.toMatchObject({
      code: "configuration",
    });
    expect(mocks.models).not.toHaveBeenCalled();
  });
  it("returns promptly on abort during agent creation and closes a late agent", async () => {
    const pending = deferred<any>();
    mocks.create.mockReturnValue(pending.promise);
    const input = request("cursor");
    const result = providers.generate(input);
    const rejected = expect(result).rejects.toMatchObject({
      code: "cancelled",
    });
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    input.controller.abort();
    await rejected;
    pending.resolve({ close: mocks.close });
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalled());
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("closes immediately and cancels a late Run when aborted during send", async () => {
    const pending = deferred<any>();
    mocks.send.mockReturnValue(pending.promise);
    const input = request("cursor");
    const result = providers.generate(input);
    const rejected = expect(result).rejects.toMatchObject({
      code: "cancelled",
    });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalled());
    input.controller.abort();
    await rejected;
    expect(mocks.close).toHaveBeenCalled();
    pending.resolve({ cancel: mocks.cancel });
    await vi.waitFor(() => expect(mocks.cancel).toHaveBeenCalled());
  });
  it("cancels an unresponsive stream without waiting forever for another event", async () => {
    const pending = deferred<any>();
    mocks.stream.mockReturnValue({ next: vi.fn(() => pending.promise) });
    const input = request("cursor");
    const result = providers.generate(input);
    const rejected = expect(result).rejects.toMatchObject({
      code: "cancelled",
    });
    await vi.waitFor(() => expect(mocks.stream).toHaveBeenCalled());
    input.controller.abort();
    await rejected;
    expect(mocks.cancel).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });
  it("surfaces the actual Cursor failure category", async () => {
    mocks.wait.mockResolvedValue({
      status: "error",
      error: { message: "model_not_found" },
    });
    await expect(providers.generate(request("cursor"))).rejects.toMatchObject({
      code: "model",
    });
  });
});

describe("safe actionable errors", () => {
  it.each([
    ["account_on_hold", "quota"],
    ["ECONNRESET", "network"],
    ["ENOENT spawn /bin/codex", "runtime"],
    ["error_max_structured_output_retries", "invalid_output"],
    ["Request timed out", "timeout"],
  ])("classifies %s as %s", (message, code) => {
    expect(providerFailure("codex", new Error(message)).code).toBe(code);
  });
  it("does not expose unknown exception contents", () => {
    const error = providerFailure(
      "cursor",
      new Error("Something odd: SECRET_PRIVATE_IDEA_AND_TOKEN"),
    );
    expect(error.code).toBe("unknown");
    expect(error.message).not.toContain("SECRET_PRIVATE");
  });
});
