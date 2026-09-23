import type { Mode, Settings } from "./shared.js";

/** Explicit task defaults; provider CLI defaults must not silently change the app. */
export const CODEX_TASKS = {
  quick: { label: "Quick check", model: "gpt-6-luna", effort: "high" },
  deep: { label: "Research", model: "gpt-6-sol", effort: "medium" },
  challenge: { label: "Challenge", model: "gpt-6-astra", effort: "high" },
} as const;

export const CODEX_MODELS = {
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-6-sol": "GPT-6 Sol",
  "gpt-6-astra": "GPT-6 Astra",
} as const;

export function modelLabel(model: string): string {
  return CODEX_MODELS[model as keyof typeof CODEX_MODELS] ?? model;
}

export function codexSelection(settings: Settings, mode: Mode) {
  return {
    model: settings.codexModels[mode],
    reasoningEffort: CODEX_TASKS[mode].effort,
  };
}
