import { describe, expect, it } from "vitest";
import { codexSelection } from "../../src/desktop/model-routing.js";
import {
  ReportSchema,
  SettingsSchema,
  emptyLibrary,
} from "../../src/desktop/shared.js";
import { exportMarkdown } from "../../src/desktop/export.js";
import { analysis } from "./fixtures.js";
import { randomUUID } from "node:crypto";

describe("Codex routing and existing libraries", () => {
  it.each([
    ["quick", "gpt-6-luna", "high"],
    ["deep", "gpt-6-sol", "medium"],
    ["challenge", "gpt-6-astra", "high"],
  ] as const)(
    "uses %s's explicit model and effort",
    (mode, model, reasoningEffort) => {
      expect(codexSelection(SettingsSchema.parse({}), mode)).toEqual({
        model,
        reasoningEffort,
      });
    },
  );
  it("migrates a legacy global override for existing check types without changing other settings", () => {
    const migrated = SettingsSchema.parse({
      models: { codex: "custom-account-model", claude: "sonnet", cursor: "" },
      autoQuick: true,
    });
    expect(migrated.codexModels).toEqual({
      quick: "custom-account-model",
      deep: "custom-account-model",
      challenge: "gpt-6-astra",
    });
    expect(migrated.models).toEqual({ claude: "sonnet", cursor: "" });
    expect(migrated.autoQuick).toBe(true);
  });
  it("uses recommended routing for old settings with a blank model", () => {
    const migrated = SettingsSchema.parse({
      models: { codex: "", claude: "", cursor: "" },
    });
    expect(migrated.codexModels.quick).toBe("gpt-6-luna");
    expect(migrated.codexModels.deep).toBe("gpt-6-sol");
    expect(migrated.autoQuick).toBe(false);
  });
  it("prefers an explicit per-task choice over a legacy override", () => {
    const settings = SettingsSchema.parse({
      models: { codex: "old-model", claude: "", cursor: "" },
      codexModels: { quick: "gpt-6-sol" },
    });
    expect(settings.codexModels).toEqual({
      quick: "gpt-6-sol",
      deep: "gpt-6-sol",
      challenge: "gpt-6-astra",
    });
    expect(
      SettingsSchema.safeParse({ codexModels: { quick: " " } }).success,
    ).toBe(false);
  });
  it("keeps historical reports readable without inventing their model", () => {
    const old = ReportSchema.parse({
      id: randomUUID(),
      provider: "codex",
      mode: "deep",
      createdAt: new Date().toISOString(),
      input: "Example",
      analysis: analysis(),
      searched: true,
    });
    expect(old.model).toBeUndefined();
    expect(old.reasoningEffort).toBeUndefined();
  });
  it("exports challenge provenance and model settings", () => {
    const state = emptyLibrary();
    const now = new Date().toISOString();
    const prior = randomUUID();
    state.ideas.push({
      id: randomUUID(),
      title: "Example",
      body: "Example",
      notes: "",
      stage: "inbox",
      createdAt: now,
      updatedAt: now,
      domains: [],
      reports: [
        {
          id: randomUUID(),
          provider: "codex",
          mode: "challenge",
          input: "Example",
          createdAt: now,
          model: "gpt-6-astra",
          reasoningEffort: "high",
          basedOnReportId: prior,
          searched: true,
          analysis: analysis(),
        },
      ],
    });
    const markdown = exportMarkdown(state.ideas[0]!);
    expect(markdown).toContain("Challenge review");
    expect(markdown).toContain("gpt-6-astra · high reasoning");
    expect(markdown).toContain(prior);
  });
});
