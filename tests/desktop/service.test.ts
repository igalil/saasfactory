import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { IdeaService } from "../../src/desktop/service.js";
import { LibraryStore } from "../../src/desktop/store.js";
import {
  currentReport,
  emptyLibrary,
  recommended,
} from "../../src/desktop/shared.js";
import type {
  GenerateRequest,
  ProviderGateway,
} from "../../src/desktop/providers.js";
import { analysis } from "./fixtures.js";

let directory: string;
let service: IdeaService;
let gateway: ProviderGateway;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "saasfactory-test-"));
  gateway = {
    status: vi.fn(async () => [
      { id: "codex" as const, state: "ready" as const, detail: "Test account" },
    ]),
    generate: vi.fn(async () => ({
      text: JSON.stringify(analysis()),
      searched: true,
    })),
  };
  service = new IdeaService(
    new LibraryStore(path.join(directory, "ideas.json")),
    gateway,
  );
});
afterEach(async () => {
  await service.cancel();
  await rm(directory, { recursive: true, force: true });
});

describe("capture and persistence", () => {
  it("saves ideas without starting any provider work and survives reopening", async () => {
    const idea = await service.capture({ body: "A client handoff tool." });
    expect(gateway.status).not.toHaveBeenCalled();
    expect(gateway.generate).not.toHaveBeenCalled();
    const reloaded = await new LibraryStore(service.store.file).read();
    expect(reloaded.ideas[0]).toEqual(idea);
    expect(reloaded.runs).toEqual([]);
  });
  it("serializes simultaneous captures without losing any and accepts punctuation first", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.capture({ body: `...Idea ${i}` }),
      ),
    );
    expect((await service.snapshot()).ideas).toHaveLength(12);
    expect((await service.snapshot()).ideas[0]?.title).toContain("Idea");
  });
  it("does not overwrite a damaged library", async () => {
    await writeFile(service.store.file, "{broken");
    await expect(service.capture({ body: "New idea" })).rejects.toThrow(
      "original file is untouched",
    );
    expect(await readFile(service.store.file, "utf8")).toBe("{broken");
  });
  it("imports only new ideas, deduplicates a backup, and preserves local settings and edits", async () => {
    const original = await service.capture({ body: "Original" });
    const backup = await service.snapshot();
    backup.settings.autoQuick = true;
    const imported = { ...original, id: randomUUID(), body: "Imported" };
    backup.ideas.push(imported, imported);
    await service.edit(original.id, { notes: "Keep this note" });
    expect(await service.restore(backup)).toBe(1);
    const state = await service.snapshot();
    expect(state.settings.autoQuick).toBe(false);
    expect(state.ideas[0]?.notes).toBe("Keep this note");
    expect(await service.restore(backup)).toBe(0);
    expect(gateway.generate).not.toHaveBeenCalled();
  });
});

describe("deliberate analysis", () => {
  it("requires an existing current report before spending usage on a challenge", async () => {
    const idea = await service.capture({ body: "Original idea" });
    await expect(service.analyze(idea.id, "challenge")).rejects.toThrow(
      "before challenging",
    );
    expect(gateway.status).not.toHaveBeenCalled();
    expect(gateway.generate).not.toHaveBeenCalled();
    await service.analyze(idea.id, "quick");
    await service.idle();
    await service.edit(idea.id, { body: "New version" });
    await expect(service.analyze(idea.id, "challenge")).rejects.toThrow(
      "this version",
    );
    expect(gateway.generate).toHaveBeenCalledTimes(1);
  });
  it("sends only the current idea's report for a deliberate challenge and preserves its history", async () => {
    const idea = await service.capture({ body: "Original idea" });
    await service.analyze(idea.id, "deep");
    await service.idle();
    const original = (await service.snapshot()).ideas[0]!.reports[0]!;
    expect(gateway.generate).toHaveBeenCalledTimes(1);
    await service.analyze(idea.id, "challenge");
    await service.idle();
    const state = await service.snapshot();
    const report = state.ideas[0]!.reports[0]!;
    expect(gateway.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: "challenge",
        previousAnalysis: original.analysis,
      }),
    );
    expect(report).toMatchObject({
      mode: "challenge",
      basedOnReportId: original.id,
      model: "gpt-6-astra",
      reasoningEffort: "high",
    });
    expect(state.ideas[0]!.reports[1]).toEqual(original);
    expect(state.ideas[0]!.stage).toBe("inbox");
    expect(state.runs[0]).toMatchObject({
      model: "gpt-6-astra",
      reasoningEffort: "high",
      status: "completed",
    });
  });
  it("never escalates or discards an idea after an automatic quick rejection", async () => {
    const settings = (await service.snapshot()).settings;
    await service.settings({ ...settings, autoQuick: true });
    vi.mocked(gateway.generate).mockResolvedValueOnce({
      text: JSON.stringify(analysis({ verdict: "pass", score: 10 })),
      searched: false,
    });
    await service.capture({ body: "A questionable idea" });
    await service.idle();
    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "quick" }),
    );
    const state = await service.snapshot();
    expect(state.ideas[0]!.stage).toBe("inbox");
    expect(state.ideas[0]!.reports[0]).toMatchObject({
      model: "gpt-6-luna",
      reasoningEffort: "high",
      analysis: { confidence: "low" },
    });
  });
  it("preserves the prior verdict when a challenge fails", async () => {
    const idea = await service.capture({ body: "Original" });
    await service.analyze(idea.id, "quick");
    await service.idle();
    const report = (await service.snapshot()).ideas[0]!.reports[0]!;
    vi.mocked(gateway.generate).mockRejectedValueOnce(
      new Error("Provider unavailable"),
    );
    await service.analyze(idea.id, "challenge");
    await service.idle();
    expect((await service.snapshot()).ideas[0]!.reports).toEqual([report]);
  });
  it("waits for cancellation during readiness checks and starts no paid work", async () => {
    let ready!: () => void;
    vi.mocked(gateway.status).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          ready = () =>
            resolve([{ id: "codex", state: "ready", detail: "Connected" }]);
        }),
    );
    const idea = await service.capture({ body: "An idea" });
    const starting = service.analyze(idea.id, "quick");
    const rejected = expect(starting).rejects.toThrow();
    await vi.waitFor(() => expect(ready).toBeDefined());
    let stopped = false;
    const stopping = service.cancel().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    ready();
    await rejected;
    await stopping;
    expect(gateway.generate).not.toHaveBeenCalled();
    expect((await service.snapshot()).runs).toEqual([]);
  });
  it("keeps capture available during sign-in but blocks analysis and competing account changes", async () => {
    let finish!: () => void;
    const changing = service.changeAccount(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const idea = await service.capture({ body: "An idea during sign-in" });
    await expect(service.analyze(idea.id, "quick")).rejects.toThrow(
      "Finish or cancel sign-in",
    );
    const otherChange = vi.fn();
    await expect(service.changeAccount(otherChange)).rejects.toThrow(
      "already in progress",
    );
    expect(otherChange).not.toHaveBeenCalled();
    finish();
    await changing;
    await service.analyze(idea.id, "quick");
    await service.idle();
    expect(gateway.generate).toHaveBeenCalledTimes(1);
  });
  it("does not disconnect an account while a check is starting", async () => {
    const idea = await service.capture({ body: "An idea" });
    const starting = service.analyze(idea.id, "quick");
    const disconnect = vi.fn();
    await expect(service.changeAccount(disconnect)).rejects.toThrow(
      "Stop the current check",
    );
    expect(disconnect).not.toHaveBeenCalled();
    await starting;
    await service.idle();
  });
  it("stores a versioned report and excludes it from ranking after the idea changes", async () => {
    const idea = await service.capture({ body: "Client handoffs" });
    await service.analyze(idea.id, "quick");
    await service.idle();
    let saved = (await service.snapshot()).ideas[0]!;
    expect(currentReport(saved)?.analysis.confidence).toBe("low");
    expect(recommended(saved, 65)).toBe(true);
    await service.edit(idea.id, { body: "A completely different buyer" });
    saved = (await service.snapshot()).ideas[0]!;
    expect(saved.reports).toHaveLength(1);
    expect(currentReport(saved)).toBeUndefined();
    expect(recommended(saved, 65)).toBe(false);
  });
  it("reserves the run slot before async provider checks", async () => {
    const idea = await service.capture({ body: "An idea" });
    const results = await Promise.allSettled([
      service.analyze(idea.id, "quick"),
      service.analyze(idea.id, "deep"),
    ]);
    await service.idle();
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(gateway.generate).toHaveBeenCalledTimes(1);
  });
  it("enforces daily limits for quick and deep work while allowing captures", async () => {
    const settings = (await service.snapshot()).settings;
    await service.settings({ ...settings, dailyRunLimit: 1 });
    const idea = await service.capture({ body: "An idea" });
    await service.analyze(idea.id, "quick");
    await service.idle();
    await expect(service.analyze(idea.id, "deep")).rejects.toThrow(
      "daily check limit",
    );
    await expect(
      service.capture({ body: "Still capturing" }),
    ).resolves.toBeDefined();
    expect(gateway.generate).toHaveBeenCalledTimes(1);
  });
  it("leaves existing reports intact after an invalid provider response", async () => {
    const idea = await service.capture({ body: "An idea" });
    await service.analyze(idea.id, "quick");
    await service.idle();
    vi.mocked(gateway.generate).mockResolvedValueOnce({
      text: "{}",
      searched: false,
    });
    await service.analyze(idea.id, "deep");
    await service.idle();
    const state = await service.snapshot();
    expect(state.ideas[0]?.reports).toHaveLength(1);
    expect(state.runs[0]?.status).toBe("failed");
  });
  it("aborts a running check and saves no fabricated report", async () => {
    vi.mocked(gateway.generate).mockImplementationOnce(
      ({ controller }: GenerateRequest) =>
        new Promise((_, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Cancelled")),
            { once: true },
          );
        }),
    );
    const idea = await service.capture({ body: "An idea" });
    await service.analyze(idea.id, "deep");
    await service.cancel();
    const state = await service.snapshot();
    expect(state.runs[0]?.status).toBe("cancelled");
    expect(state.ideas[0]?.reports).toEqual([]);
  });
  it("marks interrupted runs on startup without restarting paid work", async () => {
    const state = emptyLibrary();
    state.runs.push({
      id: randomUUID(),
      ideaId: randomUUID(),
      provider: "codex",
      mode: "deep",
      status: "running",
      startedAt: new Date().toISOString(),
      message: "Searching",
    });
    await writeFile(service.store.file, JSON.stringify(state));
    await service.store.recover();
    expect((await service.snapshot()).runs[0]?.status).toBe("interrupted");
    expect(gateway.generate).not.toHaveBeenCalled();
  });
  it("does not accept unsupported or disconnected provider work", async () => {
    vi.mocked(gateway.status).mockResolvedValueOnce([
      { id: "codex", state: "setup", detail: "Sign in first" },
    ]);
    const idea = await service.capture({ body: "An idea" });
    await expect(service.analyze(idea.id, "quick")).rejects.toThrow(
      "Sign in first",
    );
    expect((await service.snapshot()).runs).toEqual([]);
  });
});
