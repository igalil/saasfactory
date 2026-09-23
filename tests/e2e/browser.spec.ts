import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { analysis } from "../desktop/fixtures";
import { emptyLibrary } from "../../src/desktop/shared";

test("capture, refresh, shortlist, notes, edit, archive, and settings persist without starting AI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Settings & connections", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("textbox", { name: "Your SaaS idea", exact: true })
    .fill("A client handoff checklist for tiny agencies.");
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A client handoff checklist for tiny agencies",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add to shortlist", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your notes" })
    .fill("Interview five agency owners.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Shortlist 1", exact: true }).click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", {
        name: "A client handoff checklist for tiny agencies",
        level: 3,
      }),
    })
    .click();
  await expect(page.getByRole("textbox", { name: "Your notes" })).toHaveValue(
    "Interview five agency owners.",
  );
  await page.getByRole("button", { name: "Edit thought", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Agency handoff");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "Put on the shelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "On the shelf 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agency handoff", level: 3 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Settings & connections", exact: true })
    .click();
  await expect(
    page.getByText("No model API-key fallback.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Codex Quick check model", { exact: true }),
  ).toHaveValue("gpt-6-luna");
  await expect(
    page.getByLabel("Codex Research model", { exact: true }),
  ).toHaveValue("gpt-6-sol");
  await expect(
    page.getByLabel("Codex Challenge model", { exact: true }),
  ).toHaveValue("gpt-6-astra");
  await page
    .getByLabel("Codex Quick check model", { exact: true })
    .fill("gpt-6-sol");
  await page.getByLabel("Daily check limit", { exact: false }).fill("7");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Settings & connections", exact: true })
    .click();
  await expect(
    page.getByLabel("Daily check limit", { exact: false }),
  ).toHaveValue("7");
  await expect(
    page.getByLabel("Codex Quick check model", { exact: true }),
  ).toHaveValue("gpt-6-sol");
  await page
    .getByRole("button", {
      name: "Restore recommended Codex models",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Codex Quick check model", { exact: true }),
  ).toHaveValue("gpt-6-luna");
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("saasfactory-browser-preview-v1")!),
  );
  expect(data.runs).toEqual([]);
  expect(errors).toEqual([]);
});

test("challenge is deliberate, names its model, and preserves access to the earlier report", async ({
  page,
}) => {
  const seed = emptyLibrary();
  const now = new Date().toISOString();
  seed.ideas.push({
    id: randomUUID(),
    title: "Challenge example",
    body: "Handoffs for small agencies",
    notes: "",
    stage: "inbox",
    createdAt: now,
    updatedAt: now,
    domains: [],
    reports: [
      {
        id: randomUUID(),
        provider: "codex",
        mode: "deep",
        input: "Handoffs for small agencies",
        createdAt: now,
        model: "gpt-6-sol",
        reasoningEffort: "medium",
        searched: true,
        analysis: analysis(),
      },
    ],
  });
  // Controlled preload contract for UI behavior only; service and SDK tests verify execution.
  await page.addInitScript((state) => {
    const listeners = new Set<() => void>();
    const windows = new Set<(mode: string) => void>();
    (window as any).requestedChecks = [];
    (window as any).saasfactory = {
      platform: "test",
      snapshot: async () => state,
      providers: async () => [
        { id: "codex", state: "ready", detail: "Test account" },
      ],
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onWindow: (listener: (mode: string) => void) => {
        windows.add(listener);
        return () => windows.delete(listener);
      },
      setWindow: async (mode: string) =>
        windows.forEach((listener) => listener(mode)),
      analyze: async (id: string, mode: "challenge") => {
        (window as any).requestedChecks.push({ id, mode });
        const idea = state.ideas.find((item) => item.id === id)!;
        const previous = idea.reports[0]!;
        idea.reports.unshift({
          ...previous,
          id: crypto.randomUUID(),
          mode,
          model: "gpt-6-astra",
          reasoningEffort: "high",
          basedOnReportId: previous.id,
        });
        listeners.forEach((listener) => listener());
      },
    };
  }, seed);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Capture an idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open idea library", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Challenge example", level: 3 }),
    })
    .click();
  await expect(
    page.getByText("GPT-6 Sol · medium reasoning", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Challenge this idea", exact: true })
    .click();
  await expect(
    page.getByText("Does this idea stand up to scrutiny?", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".research-confirm")).toContainText(
    "GPT-6 Astra · high reasoning",
  );
  expect(await page.evaluate(() => (window as any).requestedChecks)).toEqual(
    [],
  );
  await page.getByRole("button", { name: "Later", exact: true }).click();
  expect(await page.evaluate(() => (window as any).requestedChecks)).toEqual(
    [],
  );
  await page
    .getByRole("button", { name: "Challenge this idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start challenge", exact: true })
    .click();
  await expect(
    page.getByText("Challenge review", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".report-model")).toContainText(
    "GPT-6 Astra · high reasoning",
  );
  expect(await page.evaluate(() => (window as any).requestedChecks)).toEqual([
    { id: seed.ideas[0]!.id, mode: "challenge" },
  ]);
  await page
    .getByLabel("Report history")
    .selectOption(seed.ideas[0]!.reports[0]!.id);
  await expect(
    page.getByText("Research report", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".report-model")).toContainText(
    "GPT-6 Sol · medium reasoning",
  );
});

test("reports show evidence limits, domains, build scope, stale history, and confidence filters", async ({
  page,
}) => {
  const state = emptyLibrary();
  const now = new Date().toISOString();
  state.ideas.push({
    id: randomUUID(),
    title: "Agency handoff",
    body: "Handoffs for small agencies",
    notes: "",
    stage: "inbox",
    createdAt: now,
    updatedAt: now,
    domains: [],
    reports: [
      {
        id: randomUUID(),
        provider: "codex",
        mode: "deep",
        input: "Handoffs for small agencies",
        createdAt: now,
        searched: true,
        analysis: analysis(),
      },
    ],
  });
  await page.addInitScript(
    (data) =>
      localStorage.setItem(
        "saasfactory-browser-preview-v1",
        JSON.stringify(data),
      ),
    state,
  );
  await page.goto("/");
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Agency handoff", level: 3 }),
    })
    .click();
  await expect(
    page.getByText("Worth exploring", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "The market", exact: true }).click();
  await expect(
    page.getByText("This does not establish an empty market.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "The build", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Reusable checklist" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Names & domains", exact: true })
    .click();
  await expect(
    page.getByText("handoffnest.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Promising" }).check();
  await expect(
    page.getByRole("heading", { name: "Agency handoff", level: 3 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit thought", exact: true }).click();
  await page
    .getByLabel("Original idea", { exact: true })
    .fill("A different audience and problem");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("This report analyzed an older version", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No ideas match these filters.", { exact: true }),
  ).toBeVisible();
});

test("floating capture preserves a draft and gives access back to the full library", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open quick capture", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your SaaS idea", exact: true })
    .fill("A passing thought");
  await page
    .getByRole("button", { name: "Collapse to island", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture an idea", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your SaaS idea", exact: true }),
  ).toHaveValue("A passing thought");
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your SaaS idea", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Open idea library", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A passing thought", level: 1 }),
  ).toBeVisible();
});
