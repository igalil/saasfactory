// Deliberately opt-in: this uses the connected account's real subscription allowance.
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { SubscriptionProviders } from "../src/desktop/providers.js";
import { parseAnalysis } from "../src/desktop/analysis.js";
import {
  AnalysisSchema,
  Mode,
  ProviderId,
  SettingsSchema,
} from "../src/desktop/shared.js";

const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    mode: { type: "string" },
    "providers-dir": { type: "string" },
    output: { type: "string" },
    "prior-report": { type: "string" },
  },
  strict: true,
});
if (!values["providers-dir"] || !values.provider || !values.mode)
  throw new Error(
    "Usage: bun run test:provider --provider codex --mode quick --providers-dir /path/to/SaasFactory/providers [--output /path/report.json]. Uses real subscription allowance.",
  );
const provider = ProviderId.parse(values.provider);
const mode = Mode.parse(values.mode);
if (mode === "challenge" && !values["prior-report"])
  throw new Error(
    "Challenge smoke checks require --prior-report pointing to a previous smoke report JSON file.",
  );
const previousAnalysis = values["prior-report"]
  ? AnalysisSchema.parse(
      JSON.parse(await readFile(values["prior-report"], "utf8")).analysis,
    )
  : undefined;
const gateway = new SubscriptionProviders(values["providers-dir"]);
const controller = new AbortController();
const timer = setTimeout(
  () => controller.abort(),
  mode === "quick" ? 90000 : 600000,
);
process.once("SIGINT", () => controller.abort());
const start = performance.now();
try {
  const status = await gateway.statusFor(provider);
  if (status.state !== "ready") throw new Error(status.detail);
  console.log(
    `${provider}: subscription login confirmed; starting ${mode} smoke check.`,
  );
  const result = await gateway.generate({
    provider,
    mode,
    ...(previousAnalysis ? { previousAnalysis } : {}),
    controller,
    settings: SettingsSchema.parse({ provider }),
    body: "A small SaaS for independent residential cleaning companies with 2–10 staff: clients confirm scheduled visits by text and upload access instructions; owners see a daily exception list for missing confirmations. Start with reminders and a shared schedule, not a full CRM.",
    progress: (message) => console.log(message),
  });
  const analysis = parseAnalysis(result.text, mode, result.searched);
  const summary = {
    provider,
    mode,
    model: result.model,
    reasoningEffort: result.reasoningEffort,
    elapsedSeconds: Math.round((performance.now() - start) / 1000),
    searched: result.searched,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    score: analysis.score,
    competitors: analysis.competitors.length,
    sources: analysis.sources.length,
    hosts: [
      ...new Set(
        analysis.sources.map((source) =>
          new URL(source.url).hostname.replace(/^www\./, ""),
        ),
      ),
    ],
  };
  console.log(JSON.stringify(summary, null, 2));
  if (values.output)
    await writeFile(
      values.output,
      JSON.stringify({ summary, analysis }, null, 2),
      { mode: 0o600 },
    );
  if (mode !== "quick" && (!result.searched || summary.hosts.length < 2))
    throw new Error(
      "Research check did not produce sufficient live-search evidence. Treat this as a failed research smoke check.",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Provider smoke check failed.",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
