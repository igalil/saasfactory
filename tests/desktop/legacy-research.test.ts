import { describe, expect, it, vi } from "vitest";
import {
  conductResearch,
  parseResearch,
  shouldProceedWithIdea,
} from "../../src/ai/research.js";
import { claudeGenerateWithProgress } from "../../src/ai/claude-cli.js";
vi.mock("../../src/ai/claude-cli.js", () => ({
  isClaudeCodeAvailable: vi.fn(async () => true),
  claudeGenerateWithProgress: vi.fn(async () => {
    throw new Error("Quota exhausted");
  }),
}));
describe("preserved CLI research", () => {
  it("fills omitted quick-mode arrays without inventing results", () => {
    const parsed = parseResearch({
      ideaSummary: "An idea",
      marketValidation: {
        score: 6,
        verdict: "moderate",
        reasoning: "Some evidence",
      },
      competitors: [
        {
          name: "Example",
          url: "https://example.com",
          description: "A competitor",
        },
      ],
    });
    expect(parsed.featureIdeas).toEqual([]);
    expect(parsed.competitors[0]?.features).toEqual([]);
    expect(() => parseResearch({ ideaSummary: "Missing evidence" })).toThrow();
  });
  it("does not recommend proceeding after a failed provider call", async () => {
    const result = await conductResearch("An idea", { mode: "quick" });
    expect(result?.research.marketValidation).toMatchObject({
      score: 0,
      verdict: "unproven",
    });
    expect(shouldProceedWithIdea(result!.research).proceed).toBe(false);
  });
  it("rejects a plausible report that did not actually use research tools", async () => {
    vi.mocked(claudeGenerateWithProgress).mockResolvedValueOnce({
      result: JSON.stringify({
        ideaSummary: "An idea",
        marketValidation: {
          score: 9,
          verdict: "strong",
          reasoning: "Plausible claim",
        },
        competitors: [],
      }),
    });
    expect(
      (await conductResearch("An idea", { mode: "quick" }))?.isFallback,
    ).toBe(true);
  });
});
