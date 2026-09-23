import type { Analysis } from "../../src/desktop/shared.js";
export function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    title: "A focused client handoff tool",
    summary: "Help small agencies finish client handoffs.",
    improvedIdea:
      "A checklist for two-person web agencies handing sites to clients.",
    audience: "Small web agencies",
    problem: "Handoffs create repeated support requests.",
    verdict: "pursue",
    score: 72,
    confidence: "medium",
    market: "healthy",
    reasoning: "Recurring pain, but willingness to pay is untested.",
    wedge: "One repeatable handoff workflow.",
    strengths: ["Specific buyer"],
    risks: ["Existing tools may suffice"],
    unknowns: ["Willingness to pay"],
    features: ["Reusable checklist"],
    effort: {
      level: "small",
      estimate: "2–4 weeks",
      reasoning: "Small scope",
      dependencies: ["Email integration"],
    },
    competitors: [],
    sources: [
      {
        title: "Primary source",
        url: "https://example.com/product",
        finding: "A competing workflow exists.",
      },
      {
        title: "Buyer evidence",
        url: "https://example.org/research",
        finding: "Buyers describe repeated handoffs.",
      },
    ],
    names: [
      {
        name: "Handoff Nest",
        domain: "handoffnest.com",
        rationale: "A place to organize the transition.",
      },
    ],
    monetization: "Test a monthly fee",
    acquisition: "Interview agency owners",
    experiment: {
      action: "Run five interviews",
      successCriteria: "Three agree to a paid pilot",
    },
    ...overrides,
  };
}
