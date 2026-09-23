import { currentReport, type Idea } from "./shared.js";

export function exportMarkdown(idea: Idea): string {
  const report = currentReport(idea);
  const lines = [
    `# ${idea.title}`,
    "",
    idea.body,
    "",
    `Saved: ${idea.createdAt}`,
    `Stage: ${idea.stage}`,
    "",
    "## Notes",
    idea.notes || "No notes yet.",
  ];
  if (report) {
    const a = report.analysis;
    lines.push(
      "",
      `## ${report.mode === "quick" ? "Preliminary check — not market validation" : report.mode === "challenge" ? "Challenge review" : "Market research"}`,
      `Provider: ${report.provider} · ${report.createdAt}`,
      ...(report.model
        ? [
            `Model: ${report.model}${report.reasoningEffort ? ` · ${report.reasoningEffort} reasoning` : ""}`,
          ]
        : []),
      ...(report.basedOnReportId
        ? [`Reviews report: ${report.basedOnReportId}`]
        : []),
      "",
      `**Verdict:** ${a.verdict} · **Opportunity rating:** ${a.score === null ? "Unrated" : `${a.score}/100`} · **Evidence confidence:** ${a.confidence}`,
      "The rating is not a probability of business success.",
      "",
      a.reasoning,
      "",
      "## Refined idea",
      a.improvedIdea,
      "",
      "## Buyer and problem",
      a.audience,
      a.problem,
      "",
      "## Market",
      a.market,
      a.wedge,
      "",
      "## Strengths",
      ...a.strengths.map((s) => `- ${s}`),
      "",
      "## Risks",
      ...a.risks.map((s) => `- ${s}`),
      "",
      "## Unknowns",
      ...a.unknowns.map((s) => `- ${s}`),
      "",
      "## MVP",
      ...a.features.map((s) => `- ${s}`),
      "",
      "## Implementation",
      `${a.effort.level} · ${a.effort.estimate}`,
      a.effort.reasoning,
      ...a.effort.dependencies.map((s) => `- ${s}`),
      "",
      "## Competitors",
      ...a.competitors.map(
        (c) =>
          `- ${c.name} — ${c.url}\n  ${c.description}\n  Pricing: ${c.pricing}`,
      ),
      "",
      "## Business model",
      a.monetization,
      "",
      "## Distribution",
      a.acquisition,
      "",
      "## Next experiment",
      a.experiment.action,
      `Success criterion: ${a.experiment.successCriteria}`,
      "",
      "## Name ideas (availability separate)",
      ...a.names.map((n) => `- ${n.name} (${n.domain}): ${n.rationale}`),
      "",
      "## Sources",
      ...a.sources.map((s) => `- ${s.title} — ${s.url}\n  ${s.finding}`),
    );
  }
  lines.push(
    "",
    "## Domain checks",
    ...idea.domains.map(
      (d) => `- ${d.domain}: ${d.status} (${d.checkedAt}) — ${d.detail}`,
    ),
    "",
  );
  return lines.join("\n");
}
