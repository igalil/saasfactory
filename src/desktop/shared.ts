import { z } from "zod";
import { CODEX_TASKS } from "./model-routing.js";

export const ProviderId = z.enum(["claude", "codex", "cursor", "xai"]);
export type ProviderId = z.infer<typeof ProviderId>;
export const Mode = z.enum(["quick", "deep", "challenge"]);
export type Mode = z.infer<typeof Mode>;
const text = z.string().trim().min(1).max(8000);
const list = z.array(text).max(15);
const modelId = z.string().trim().min(1).max(100);
const reasoningEffort = z.enum(["low", "medium", "high"]);
export const WebUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an http or https URL");
export const DomainName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Enter a domain such as littleidea.com",
  );

export const AnalysisSchema = z.object({
  title: text.max(100),
  summary: text,
  improvedIdea: text,
  audience: text,
  problem: text,
  verdict: z.enum(["pursue", "pivot", "pass", "unproven"]),
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  market: z.enum(["saturated", "healthy", "unexplored", "unknown"]),
  reasoning: text,
  wedge: text,
  strengths: list,
  risks: list,
  unknowns: list,
  features: list,
  effort: z.object({
    level: z.enum(["small", "medium", "large"]),
    estimate: text,
    reasoning: text,
    dependencies: list,
  }),
  competitors: z
    .array(
      z.object({ name: text, url: WebUrl, description: text, pricing: text }),
    )
    .max(12),
  sources: z
    .array(z.object({ title: text, url: WebUrl, finding: text }))
    .max(25),
  names: z
    .array(
      z.object({ name: text.max(100), domain: DomainName, rationale: text }),
    )
    .max(8),
  monetization: text,
  acquisition: text,
  experiment: z.object({ action: text, successCriteria: text }),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export const ReportSchema = z.object({
  id: z.string().uuid(),
  provider: ProviderId,
  mode: Mode,
  createdAt: z.string().datetime(),
  input: text,
  analysis: AnalysisSchema,
  searched: z.boolean(),
  model: modelId.optional(),
  reasoningEffort: reasoningEffort.optional(),
  basedOnReportId: z.string().uuid().optional(),
});
export type Report = z.infer<typeof ReportSchema>;
export const DomainResultSchema = z.object({
  domain: DomainName,
  status: z.enum(["available", "registered", "unknown"]),
  checkedAt: z.string().datetime(),
  detail: z.string(),
  price: z
    .object({
      registration: z.number(),
      renewal: z.number(),
      currency: z.string(),
    })
    .optional(),
});
export type DomainResult = z.infer<typeof DomainResultSchema>;
export const IdeaSchema = z.object({
  id: z.string().uuid(),
  title: text.max(120),
  body: text,
  stage: z.enum(["inbox", "shortlist", "archive"]),
  notes: z.string().max(20000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reports: z.array(ReportSchema).max(20),
  domains: z.array(DomainResultSchema).max(50),
});
export type Idea = z.infer<typeof IdeaSchema>;
export const SettingsSchema = z.preprocess(
  (input) => {
    // Migrate the previous single Codex override without losing the user's choice.
    if (input && typeof input === "object") {
      const legacy = input as {
        codexModels?: unknown;
        models?: { codex?: unknown };
      };
      if (
        legacy.codexModels === undefined &&
        typeof legacy.models?.codex === "string" &&
        legacy.models.codex.trim()
      )
        return {
          ...input,
          codexModels: {
            quick: legacy.models.codex,
            deep: legacy.models.codex,
            challenge: CODEX_TASKS.challenge.model,
          },
        };
    }
    return input;
  },
  z.object({
    provider: ProviderId.default("codex"),
    autoQuick: z.boolean().default(false),
    dailyRunLimit: z.number().int().min(1).max(100).default(20),
    shortlistThreshold: z.number().int().min(0).max(100).default(65),
    models: z
      .object({
        claude: z.string().max(100),
        cursor: z.string().max(100),
      })
      .default({ claude: "", cursor: "" }),
    codexModels: z
      .object({
        quick: modelId.default(CODEX_TASKS.quick.model),
        deep: modelId.default(CODEX_TASKS.deep.model),
        challenge: modelId.default(CODEX_TASKS.challenge.model),
      })
      .default({}),
    founder: z
      .object({
        skills: z.string().max(1000),
        hoursPerWeek: z.number().min(1).max(100),
        budget: z.string().max(200),
      })
      .default({ skills: "", hoursPerWeek: 10, budget: "" }),
    voice: z
      .object({
        whisperPath: z.string().max(1000),
        ffmpegPath: z.string().max(1000),
        modelPath: z.string().max(1000),
      })
      .default({
        whisperPath: "whisper-cli",
        ffmpegPath: "ffmpeg",
        modelPath: "",
      }),
  }),
);
export type Settings = z.infer<typeof SettingsSchema>;
export const RunSchema = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  provider: ProviderId,
  mode: Mode,
  model: modelId.optional(),
  reasoningEffort: reasoningEffort.optional(),
  status: z.enum([
    "running",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  message: z.string().max(8000),
});
export type Run = z.infer<typeof RunSchema>;
export const LibrarySchema = z.object({
  version: z.literal(1),
  ideas: z.array(IdeaSchema).max(20000),
  settings: SettingsSchema,
  runs: z.array(RunSchema).max(5000),
});
export type Library = z.infer<typeof LibrarySchema>;
export const emptyLibrary = (): Library => ({
  version: 1,
  ideas: [],
  settings: SettingsSchema.parse({}),
  runs: [],
});
export const CaptureSchema = z.object({
  body: text,
  title: z.string().trim().max(120).optional(),
});
export const EditSchema = z
  .object({
    title: text.max(120).optional(),
    body: text.optional(),
    stage: IdeaSchema.shape.stage.optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict();
export type ProviderStatus = {
  id: ProviderId;
  state: "ready" | "setup" | "unsupported";
  detail: string;
};
export type WindowMode = "island" | "capture" | "workspace";
export const WindowPointSchema = z
  .object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
  })
  .strict();
export type WindowPoint = z.infer<typeof WindowPointSchema>;
export type WindowState = {
  mode: WindowMode;
  edge: "left" | "right";
  focused: boolean;
  dragging: boolean;
};
export interface DesktopAPI {
  snapshot(): Promise<Library>;
  capture(input: z.infer<typeof CaptureSchema>): Promise<Idea>;
  edit(id: string, input: z.infer<typeof EditSchema>): Promise<void>;
  settings(input: Settings): Promise<void>;
  analyze(id: string, mode: Mode): Promise<void>;
  cancel(): Promise<void>;
  providers(): Promise<ProviderStatus[]>;
  connect(provider: ProviderId): Promise<string>;
  cancelConnect(): Promise<void>;
  disconnect(provider: ProviderId): Promise<void>;
  domains(id: string, domains: string[]): Promise<void>;
  exportIdea(id: string): Promise<string | null>;
  backup(): Promise<string | null>;
  restore(): Promise<number | null>;
  setWindow(mode: WindowMode): Promise<void>;
  windowState(): Promise<WindowState>;
  beginWindowDrag(point: WindowPoint): Promise<void>;
  moveWindowDrag(point: WindowPoint): Promise<void>;
  endWindowDrag(point?: WindowPoint): Promise<boolean>;
  nudgeWindow(direction: "up" | "down" | "left" | "right"): Promise<void>;
  openExternal(url: string): Promise<void>;
  transcribe(audio: ArrayBuffer): Promise<string>;
  chooseVoiceFile(
    kind: "modelPath" | "whisperPath" | "ffmpegPath",
  ): Promise<string | null>;
  subscribe(listener: () => void): () => void;
  onWindow(listener: (state: WindowState) => void): () => void;
  platform: string;
}

export function currentReport(idea: Idea): Report | undefined {
  return idea.reports.find((report) => report.input === idea.body);
}
export function recommended(idea: Idea, threshold: number): boolean {
  const report = currentReport(idea);
  return (
    !!report &&
    report.analysis.verdict === "pursue" &&
    (report.analysis.score ?? 0) >= threshold
  );
}
