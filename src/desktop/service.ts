import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LibraryStore } from "./store.js";
import { codexSelection } from "./model-routing.js";
import { parseAnalysis } from "./analysis.js";
import { checkDomain } from "./domains.js";
import {
  CaptureSchema,
  currentReport,
  type Report,
  EditSchema,
  SettingsSchema,
  Mode,
  DomainName,
  LibrarySchema,
  type Idea,
  type Library,
  type Settings,
  type Run,
  type DomainResult,
} from "./shared.js";
import type { ProviderGateway } from "./providers.js";

const idSchema = z.string().uuid();
function requireIdea(state: Library, id: string): Idea {
  const idea = state.ideas.find((item) => item.id === id);
  if (!idea) throw new Error("This idea could not be found.");
  return idea;
}
const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : "The check failed.").slice(0, 2000);

export class IdeaService extends EventEmitter {
  private active:
    | { id: string; controller: AbortController; done: Promise<void> }
    | undefined;
  constructor(
    readonly store: LibraryStore,
    private readonly providers: ProviderGateway,
    private readonly domainLookup: (
      domain: string,
    ) => Promise<DomainResult> = checkDomain,
  ) {
    super();
  }

  private accountChanging = false;
  async changeAccount<T>(action: () => Promise<T>): Promise<T> {
    if (this.active)
      throw new Error(
        "Stop the current check before changing provider accounts.",
      );
    if (this.accountChanging)
      throw new Error("An account change is already in progress.");
    this.accountChanging = true;
    try {
      return await action();
    } finally {
      this.accountChanging = false;
    }
  }

  snapshot() {
    return this.store.read();
  }
  private changed() {
    this.emit("changed");
  }

  async capture(input: unknown): Promise<Idea> {
    const data = CaptureSchema.parse(input);
    const now = new Date().toISOString();
    const idea: Idea = {
      id: randomUUID(),
      title:
        data.title ||
        (data.body.split(/\n|[.!?]/)[0]!.trim() || data.body).slice(0, 90),
      body: data.body,
      stage: "inbox",
      notes: "",
      createdAt: now,
      updatedAt: now,
      reports: [],
      domains: [],
    };
    const auto = await this.store.update((state) => {
      state.ideas.unshift(idea);
      return state.settings.autoQuick;
    });
    this.changed();
    if (auto)
      void this.analyze(idea.id, "quick").catch((error) =>
        this.emit(
          "notice",
          `Idea saved. Quick check did not start: ${errorText(error)}`,
        ),
      );
    return idea;
  }

  async edit(id: string, input: unknown): Promise<void> {
    idSchema.parse(id);
    const data = EditSchema.parse(input);
    await this.store.update((state) =>
      Object.assign(requireIdea(state, id), data, {
        updatedAt: new Date().toISOString(),
      }),
    );
    this.changed();
  }

  async settings(input: Settings): Promise<void> {
    const settings = SettingsSchema.parse(input);
    await this.store.update((state) => {
      state.settings = settings;
    });
    this.changed();
  }

  async analyze(id: string, modeInput: unknown): Promise<void> {
    idSchema.parse(id);
    const mode = Mode.parse(modeInput);
    if (this.accountChanging)
      throw new Error("Finish or cancel sign-in before starting a check.");
    if (this.active)
      throw new Error(
        "A check is already running. You can keep capturing ideas, or stop that check first.",
      );
    const controller = new AbortController();
    const runId = randomUUID();
    // Reserve before the first await, so two clicks cannot start parallel paid work.
    let finished!: () => void;
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const active = { id: runId, controller, done };
    this.active = active;
    try {
      const state = await this.snapshot();
      const idea = requireIdea(state, id);
      const provider = state.settings.provider;
      const previous = mode === "challenge" ? currentReport(idea) : undefined;
      if (mode === "challenge" && provider !== "codex")
        throw new Error("Choose Codex in Settings to challenge an idea.");
      if (mode === "challenge" && !previous)
        throw new Error(
          "Run a quick check or research on this version of the idea before challenging it.",
        );
      const status = this.providers.statusFor
        ? await this.providers.statusFor(provider)
        : (await this.providers.status()).find((item) => item.id === provider);
      if (status?.state !== "ready")
        throw new Error(
          status?.detail ?? "Connect a provider in Settings first.",
        );
      controller.signal.throwIfAborted();
      const run: Run = {
        id: runId,
        ideaId: id,
        provider,
        mode,
        ...(provider === "codex" ? codexSelection(state.settings, mode) : {}),
        status: "running",
        startedAt: new Date().toISOString(),
        message: "Starting analysis…",
      };
      await this.store.update((library) => {
        controller.signal.throwIfAborted();
        const today = new Date().toISOString().slice(0, 10);
        if (
          library.runs.filter((item) => item.startedAt.startsWith(today))
            .length >= library.settings.dailyRunLimit
        )
          throw new Error(
            "Your daily check limit is reached (resets at midnight UTC). You can still capture ideas. Adjust the limit in Settings.",
          );
        library.runs.unshift(run);
        library.runs = library.runs.slice(0, 5000);
      });
      this.changed();
      void this.execute(run, idea.body, state.settings, controller, previous)
        .finally(() => {
          if (this.active?.id === runId) this.active = undefined;
          finished();
          this.changed();
        })
        .catch(() => {});
    } catch (error) {
      if (this.active?.id === runId) this.active = undefined;
      finished();
      throw error;
    }
  }

  private async execute(
    run: Run,
    body: string,
    settings: Settings,
    controller: AbortController,
    previous?: Report,
  ): Promise<void> {
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      run.mode === "quick" ? 90000 : 600000,
    );
    let lastProgress = 0;
    try {
      const response = await this.providers.generate({
        provider: run.provider,
        body,
        mode: run.mode,
        settings,
        ...(previous ? { previousAnalysis: previous.analysis } : {}),
        controller,
        progress: (message) => {
          if (Date.now() - lastProgress < 700) return;
          lastProgress = Date.now();
          void this.store
            .update((state) => {
              const record = state.runs.find((item) => item.id === run.id);
              if (record?.status === "running")
                record.message = message.slice(0, 1000);
            })
            .then(() => this.changed())
            .catch(() => {});
        },
      });
      controller.signal.throwIfAborted();
      const analysis = parseAnalysis(
        response.text,
        run.mode,
        response.searched,
      );
      await this.store.update((state) => {
        const idea = requireIdea(state, run.ideaId);
        idea.reports.unshift({
          id: randomUUID(),
          provider: run.provider,
          mode: run.mode,
          input: body,
          createdAt: new Date().toISOString(),
          searched: response.searched,
          model: response.model ?? run.model,
          reasoningEffort: response.reasoningEffort ?? run.reasoningEffort,
          ...(previous ? { basedOnReportId: previous.id } : {}),
          analysis,
        });
        idea.reports = idea.reports.slice(0, 20);
        idea.updatedAt = new Date().toISOString();
        const record = state.runs.find((item) => item.id === run.id)!;
        record.model = response.model ?? run.model;
        record.reasoningEffort =
          response.reasoningEffort ?? run.reasoningEffort;
        record.status = "completed";
        record.finishedAt = new Date().toISOString();
        record.message = "Report ready";
      });
    } catch (error) {
      await this.store
        .update((state) => {
          const record = state.runs.find((item) => item.id === run.id);
          if (!record) return;
          record.status =
            controller.signal.aborted && !timedOut ? "cancelled" : "failed";
          record.finishedAt = new Date().toISOString();
          record.message = timedOut
            ? "This check reached its time limit. Your idea and previous reports are safe."
            : controller.signal.aborted
              ? "Check stopped. Your idea is saved."
              : errorText(error);
        })
        .catch((error) =>
          this.emit("notice", `Could not save run status: ${errorText(error)}`),
        );
    } finally {
      clearTimeout(timer);
      this.changed();
    }
  }

  async cancel(): Promise<void> {
    this.active?.controller.abort();
    await this.active?.done;
  }
  async idle(): Promise<void> {
    await this.active?.done;
  }

  async domains(id: string, input: unknown): Promise<void> {
    idSchema.parse(id);
    const names = [...new Set(z.array(DomainName).min(1).max(8).parse(input))];
    requireIdea(await this.snapshot(), id);
    const results = await Promise.all(
      names.map((domain) => this.domainLookup(domain)),
    );
    await this.store.update((state) => {
      const idea = requireIdea(state, id);
      idea.domains = [
        ...results,
        ...idea.domains.filter((item) => !names.includes(item.domain)),
      ].slice(0, 50);
    });
    this.changed();
  }

  async restore(input: unknown): Promise<number> {
    const imported = LibrarySchema.parse(input);
    const count = await this.store.update((state) => {
      const ids = new Set(state.ideas.map((idea) => idea.id));
      const additions = imported.ideas.filter((idea) => {
        if (ids.has(idea.id)) return false;
        ids.add(idea.id);
        return true;
      });
      state.ideas.push(...additions);
      return additions.length;
    });
    this.changed();
    return count;
  }
}
