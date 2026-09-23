import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("native island, preload bridge, durable capture, provider guard, and restart", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "saasfactory-native-"),
  );
  const env = { ...process.env, SAASFACTORY_DATA_DIR: directory };
  delete env["ELECTRON_RUN_AS_NODE"];
  delete env["SAASFACTORY_DEV_URL"];
  let app = await electron.launch({ args: ["dist-desktop/main/main.js"], env });
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "Capture an idea", exact: true }),
    ).toBeVisible();
    const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      return {
        bounds: window.getBounds(),
        work: screen.getDisplayMatching(window.getBounds()).workArea,
        alwaysOnTop: window.isAlwaysOnTop(),
      };
    });
    expect(geometry.bounds.width).toBe(64);
    expect(geometry.bounds.x + geometry.bounds.width).toBe(
      geometry.work.x + geometry.work.width - 10,
    );
    expect(geometry.alwaysOnTop).toBe(true);
    await page
      .getByRole("button", { name: "Capture an idea", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your SaaS idea", exact: true })
      .fill("Native app persistence test");
    await page.getByRole("button", { name: "Save idea", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Your SaaS idea", exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("button", { name: "Open idea library", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Native app persistence test",
        level: 1,
      }),
    ).toBeVisible();
    const data = JSON.parse(
      await readFile(path.join(directory, "ideas.json"), "utf8"),
    );
    expect(data.ideas).toHaveLength(1);
    expect(data.runs).toEqual([]);
    expect(data.settings.codexModels).toEqual({
      quick: "gpt-6-luna",
      deep: "gpt-6-sol",
      challenge: "gpt-6-astra",
    });
    await expect(
      page.getByRole("button", { name: "Challenge this idea", exact: true }),
    ).toBeDisabled();
    const challengeGuard = await page.evaluate(async () => {
      const api = (window as any).saasfactory;
      const state = await api.snapshot();
      try {
        await api.analyze(state.ideas[0].id, "challenge");
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    });
    expect(challengeGuard).toContain("before challenging");
    const bridge = await page.evaluate(async () => {
      const api = (window as any).saasfactory;
      const state = await api.snapshot();
      await api.settings({ ...state.settings, provider: "xai" });
      try {
        await api.analyze(state.ideas[0].id, "quick");
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    });
    expect(bridge).toContain("no verified consumer-subscription");
    await page.screenshot({ path: "test-results/native-library.png" });
    await app.close();
    app = await electron.launch({ args: ["dist-desktop/main/main.js"], env });
    page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Capture an idea", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Native app persistence test",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/native-capture.png" });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
