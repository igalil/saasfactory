import { execa } from "execa";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { codexSelection } from "./model-routing.js";
import { analysisPrompt } from "./analysis.js";
import {
  subscriptionEnvironment,
  providerExecutable,
} from "./provider-runtime.js";
import { reportOutputSchema } from "./provider-schema.js";
import { ProviderFailure, providerFailure } from "./provider-errors.js";
import { abortable } from "./provider-abort.js";
export {
  subscriptionEnvironment,
  providerExecutable,
  findExecutable,
} from "./provider-runtime.js";
import type {
  Analysis,
  Mode,
  ProviderId,
  ProviderStatus,
  Settings,
} from "./shared.js";

export interface GenerateRequest {
  provider: ProviderId;
  body: string;
  mode: Mode;
  settings: Settings;
  previousAnalysis?: Analysis;
  controller: AbortController;
  progress: (message: string) => void;
}
export interface GenerateResult {
  text: string;
  searched: boolean;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
}
export interface ProviderGateway {
  generate(request: GenerateRequest): Promise<GenerateResult>;
  status(): Promise<ProviderStatus[]>;
  statusFor?(id: ProviderId): Promise<ProviderStatus>;
}

export class SubscriptionProviders implements ProviderGateway {
  constructor(private readonly directory: string) {}
  private env(provider: "claude" | "codex") {
    return {
      ...subscriptionEnvironment(),
      [provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"]: path.join(
        this.directory,
        provider,
      ),
    };
  }

  async status(): Promise<ProviderStatus[]> {
    return Promise.all(
      (["codex", "claude", "cursor", "xai"] as const).map((id) =>
        this.statusFor(id),
      ),
    );
  }

  async statusFor(id: ProviderId): Promise<ProviderStatus> {
    if (id === "xai")
      return {
        id,
        state: "unsupported" as const,
        detail:
          "Grok / SpaceXAI has API SDKs, but no verified consumer-subscription SDK route. API billing is disabled in this app.",
      };
    try {
      if (id === "cursor") {
        const { Cursor } = await import("@cursor/sdk");
        assertCursorEnvironment();
        const status = await Cursor.auth.status();
        if (
          status.status === "logged-in" &&
          status.backendUrl !== CURSOR_BACKEND
        )
          throw new ProviderFailure(
            "configuration",
            "Connect Cursor through its official service. Custom endpoints are disabled.",
          );
        return {
          id,
          state:
            status.status === "logged-in"
              ? ("ready" as const)
              : ("setup" as const),
          detail:
            status.status === "logged-in"
              ? "Cursor SDK account connected. Your plan pools and overage settings apply."
              : "Connect your Cursor account using the official SDK browser login.",
        };
      }
      await mkdir(path.join(this.directory, id), {
        recursive: true,
        mode: 0o700,
      });
      const executable = await providerExecutable(id);
      const result = await execa(
        executable,
        id === "codex" ? ["login", "status"] : ["auth", "status", "--json"],
        {
          env: this.env(id),
          extendEnv: false,
          timeout: 10000,
          reject: false,
        },
      );
      let ready = false;
      if (id === "codex")
        ready =
          result.exitCode === 0 &&
          /ChatGPT/i.test(result.stdout + result.stderr);
      else {
        try {
          const auth = JSON.parse(result.stdout) as {
            loggedIn?: boolean;
            authMethod?: string;
            subscriptionType?: string;
          };
          ready = auth.loggedIn === true && auth.authMethod === "claude.ai";
        } catch {
          /* not logged in */
        }
      }
      return {
        id,
        state: ready ? ("ready" as const) : ("setup" as const),
        detail: ready
          ? "Subscription login found. Provider limits and any enabled extra usage still apply."
          : `Sign in to ${id === "codex" ? "ChatGPT" : "Claude"} for SaasFactory. API-key sessions are not accepted.`,
      };
    } catch (error) {
      return {
        id,
        state: "setup" as const,
        detail: providerFailure(id, error).message,
      };
    }
  }

  async connect(
    provider: ProviderId,
    openBrowser: (url: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<string> {
    const stop = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
    ]);
    try {
      stop.throwIfAborted();
      if (provider === "xai")
        throw new ProviderFailure(
          "configuration",
          "No verified subscription route is available for Grok. Choose another provider.",
        );
      if (provider === "cursor") {
        assertCursorEnvironment();
        const { Cursor } = await import("@cursor/sdk");
        await Cursor.auth.login({
          openBrowser,
          signal: stop,
          apiKeyName: "SaasFactory desktop",
          backendUrl: CURSOR_BACKEND,
          websiteUrl: "https://cursor.com",
        });
      } else {
        await mkdir(path.join(this.directory, provider), {
          recursive: true,
          mode: 0o700,
        });
        const executable = await providerExecutable(provider);
        await execa(
          executable,
          provider === "codex"
            ? ["login", "-c", 'forced_login_method="chatgpt"']
            : ["auth", "login", "--claudeai"],
          {
            env: this.env(provider),
            extendEnv: false,
            timeout: 180000,
            stdin: "ignore",
            cancelSignal: stop,
          },
        );
      }
      stop.throwIfAborted();
      const status = await this.statusFor(provider);
      if (status.state !== "ready")
        throw new ProviderFailure("auth", status.detail);
      return "Subscription account connected.";
    } catch (error) {
      throw providerFailure(provider, stop.aborted ? stop.reason : error);
    }
  }

  async disconnect(provider: ProviderId): Promise<void> {
    try {
      if (provider === "xai") return;
      if (provider === "cursor") {
        const { Cursor } = await import("@cursor/sdk");
        await Cursor.auth.logout();
      } else {
        await execa(
          await providerExecutable(provider),
          provider === "codex" ? ["logout"] : ["auth", "logout"],
          {
            env: this.env(provider),
            extendEnv: false,
            timeout: 15000,
          },
        );
      }
      if ((await this.statusFor(provider)).state === "ready")
        throw new ProviderFailure(
          "auth",
          "The provider still reports a login. Try disconnecting again.",
        );
    } catch (error) {
      throw providerFailure(provider, error);
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    try {
      return await this.execute(request);
    } catch (error) {
      throw providerFailure(request.provider, error);
    }
  }

  private async execute(request: GenerateRequest): Promise<GenerateResult> {
    const { provider, mode, controller, progress, settings, body } = request;
    if (
      mode === "challenge" &&
      (provider !== "codex" || !request.previousAnalysis)
    )
      throw new ProviderFailure(
        "configuration",
        "Challenge requires Codex and a current report to review.",
      );
    if (provider === "xai")
      throw new ProviderFailure(
        "configuration",
        "Grok subscription access is not supported. Choose another connected provider.",
      );
    const status = await this.statusFor(provider);
    if (status?.state !== "ready")
      throw new ProviderFailure("auth", status.detail);
    controller.signal.throwIfAborted();
    const cwd = path.join(this.directory, "research-workspace");
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    const prompt = analysisPrompt(
      body,
      mode,
      settings.founder,
      request.previousAnalysis,
    );
    const selection = codexSelection(settings, mode);
    const model =
      provider === "codex" ? selection.model : settings.models[provider].trim();
    let usedModel = model || undefined;
    let searched = false;
    let text = "";
    progress(
      mode === "quick"
        ? "Considering the problem, buyer, and smallest useful product…"
        : mode === "challenge"
          ? "Challenging the prior verdict and checking its evidence…"
          : "Looking for competitors and evidence of customer demand…",
    );

    if (provider === "claude") {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const permitted = mode !== "quick" ? ["WebSearch", "WebFetch"] : [];
      const searches = new Set<string>();
      const stream = query({
        prompt,
        options: {
          cwd,
          env: this.env("claude"),
          pathToClaudeCodeExecutable: await providerExecutable("claude"),
          tools: permitted,
          allowedTools: permitted,
          settingSources: [],
          mcpServers: {},
          extraArgs: { "strict-mcp-config": null },
          maxTurns: mode === "quick" ? 3 : 16,
          outputFormat: { type: "json_schema", schema: reportOutputSchema },
          abortController: controller,
          ...(model ? { model } : {}),
          canUseTool: async (name, input) =>
            permitted.includes(name)
              ? { behavior: "allow" as const, updatedInput: input }
              : {
                  behavior: "deny" as const,
                  message: "SaasFactory only permits web research tools.",
                },
        },
      });
      for await (const event of stream) {
        if (event.type === "assistant" && event.error)
          throw new Error(event.error);
        if (
          event.type === "rate_limit_event" &&
          event.rate_limit_info.status === "rejected"
        )
          throw new Error("rate_limit");
        if (event.type === "assistant")
          for (const item of event.message.content) {
            if (item.type === "tool_use" && item.name === "WebSearch") {
              searches.add(item.id);
              progress("Searching the web for market evidence…");
            }
          }
        if (event.type === "user" && Array.isArray(event.message.content)) {
          for (const item of event.message.content) {
            if (
              item.type === "tool_result" &&
              searches.has(item.tool_use_id) &&
              !item.is_error
            )
              searched = true;
          }
        }
        if (event.type === "result") {
          if (event.is_error || event.subtype !== "success")
            throw new Error(
              event.subtype +
                " " +
                ("errors" in event ? event.errors.join(" ") : ""),
            );
          if (!event.structured_output)
            throw new Error("Missing structured_output");
          text = JSON.stringify(event.structured_output);
        }
      }
    } else if (provider === "codex") {
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex({
        codexPathOverride: await providerExecutable("codex"),
        env: this.env("codex"),
        config: {
          forced_login_method: "chatgpt",
          model_provider: "openai",
          features: {
            shell_tool: false,
            exec_tool: false,
            apply_patch_freeform: false,
            multi_agent: false,
          },
          mcp_servers: {},
          project_doc_max_bytes: 0,
        },
      });
      const thread = codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        webSearchMode: mode !== "quick" ? "live" : "disabled",
        modelReasoningEffort: selection.reasoningEffort,
        model: selection.model,
      });
      const stream = await thread.runStreamed(prompt, {
        signal: controller.signal,
        outputSchema: reportOutputSchema,
      });
      let completed = false;
      for await (const event of stream.events) {
        if (event.type === "turn.completed") completed = true;
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "turn.failed") throw new Error(event.error.message);
        if (event.type === "item.completed") {
          if (event.item.type === "web_search") {
            searched = true;
            progress("Reviewing live search results…");
          }
          if (event.item.type === "agent_message") text = event.item.text;
        }
      }
      if (!completed)
        throw new ProviderFailure(
          "invalid_output",
          "Codex stopped before completing the report. Your idea is saved; try again.",
        );
    } else {
      assertCursorEnvironment();
      const { Agent, Cursor, FileCredentialStore, JsonlLocalAgentStore } =
        await import("@cursor/sdk");
      // Explicit stored end-user credential prevents an inherited team API key taking precedence.
      const credentials = await new FileCredentialStore().load();
      if (!credentials)
        throw new ProviderFailure("auth", "Connect your Cursor account first.");
      if (credentials.backendUrl !== CURSOR_BACKEND)
        throw new ProviderFailure(
          "configuration",
          "Custom Cursor endpoints are disabled. Reconnect through Cursor's official service.",
        );
      const models = model
        ? []
        : await abortable(
            Cursor.models.list({ apiKey: credentials.apiKey }),
            controller.signal,
          );
      const selectedModel = model || models[0]?.id;
      if (!selectedModel)
        throw new ProviderFailure(
          "model",
          "No models available on your Cursor account. Set a model in Settings.",
        );
      usedModel = selectedModel;
      controller.signal.throwIfAborted();
      const agent = await abortable(
        Agent.create({
          apiKey: credentials.apiKey,
          model: { id: selectedModel },
          local: {
            cwd,
            settingSources: [],
            enableAgentRetries: false,
            store: new JsonlLocalAgentStore(
              path.join(this.directory, "cursor-runs"),
            ),
          },
          tools: mode !== "quick" ? ["webSearch", "webFetch"] : [],
          mcpServers: {},
        }),
        controller.signal,
        (lateAgent) => lateAgent.close(),
      );
      // Also close if cancellation happens before send() returns its Run.
      const close = () => agent.close();
      controller.signal.addEventListener("abort", close, { once: true });
      try {
        controller.signal.throwIfAborted();
        const run = await abortable(
          agent.send(prompt),
          controller.signal,
          (lateRun) => lateRun.cancel(),
        );
        const abort = () => {
          void run.cancel().catch(() => {});
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        try {
          const events = run.stream();
          while (true) {
            const item = await abortable(events.next(), controller.signal);
            if (item.done) break;
            const event = item.value;
            if (
              event.type === "tool_call" &&
              event.status === "completed" &&
              /web.?search/i.test(event.name)
            ) {
              searched = true;
              progress("Reviewing live search results…");
            }
          }
          const result = await abortable(run.wait(), controller.signal);
          if (result.status !== "finished")
            throw new Error(
              result.error?.message ?? result.error?.code ?? result.status,
            );
          text = result.result ?? "";
        } finally {
          controller.signal.removeEventListener("abort", abort);
        }
      } finally {
        controller.signal.removeEventListener("abort", close);
        agent.close();
      }
    }
    controller.signal.throwIfAborted();
    if (!text.trim())
      throw new ProviderFailure(
        "invalid_output",
        "The provider returned an empty report. Your idea is saved; try again.",
      );
    return {
      text,
      searched,
      ...(usedModel ? { model: usedModel } : {}),
      ...(provider === "codex"
        ? { reasoningEffort: selection.reasoningEffort }
        : {}),
    };
  }
}

const CURSOR_BACKEND = "https://api2.cursor.sh";
function assertCursorEnvironment() {
  // Some SDK calls read process.env internally. Refuse overrides instead of
  // mutating global environment while another operation may be using it.
  if (process.env["CURSOR_BACKEND_URL"] || process.env["CURSOR_WEBSITE_URL"])
    throw new ProviderFailure(
      "configuration",
      "Custom Cursor endpoints are disabled. Remove CURSOR_BACKEND_URL and CURSOR_WEBSITE_URL before starting SaasFactory.",
    );
}
