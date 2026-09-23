import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("floating focus, edge dragging, immediate expansion, and saved placement", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "saasfactory-window-"),
  );
  const env = { ...process.env, SAASFACTORY_DATA_DIR: directory };
  delete env["ELECTRON_RUN_AS_NODE"];
  delete env["SAASFACTORY_DEV_URL"];
  let app = await electron.launch({ args: ["dist-desktop/main/main.js"], env });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const island = () =>
      page.getByRole("button", { name: "Capture an idea", exact: true });
    const geometry = () =>
      app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        return {
          bounds: window.getBounds(),
          work: screen.getDisplayMatching(window.getBounds()).workArea,
        };
      });
    await expect(island()).toBeVisible();
    await app.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]!.focus();
    });
    await expect(island()).toHaveCSS("opacity", "1");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.blur(),
    );
    await expect(island()).toHaveCSS("opacity", "0.6");

    // Inject off-window pointer coordinates without moving the user's OS cursor.
    // Pointer capture, IPC, geometry and persistence use the production paths.
    const dragTo = async (point: { x: number; y: number }) => {
      await page.mouse.move(32, 80);
      await page.mouse.down();
      const event = {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        screenX: point.x,
        screenY: point.y,
      };
      await island().dispatchEvent("pointermove", { ...event, buttons: 1 });
      await island().dispatchEvent("pointerup", { ...event, buttons: 0 });
      await page.mouse.up();
    };
    const { work } = await geometry();
    await dragTo({ x: work.x + 32, y: work.y - 200 });
    await expect
      .poll(async () => (await geometry()).bounds.x)
      .toBe(work.x + 10);
    await expect
      .poll(async () => (await geometry()).bounds.y)
      .toBe(work.y + 10);
    await expect(island()).toBeVisible(); // Releasing a drag must not open capture.
    await expect(page.locator("body")).toHaveAttribute(
      "data-dragging",
      "false",
    );
    await expect(page.locator("body")).toHaveAttribute("data-edge", "left");

    await dragTo({ x: work.x + 32, y: work.y + work.height + 200 });
    const bottomY = work.y + work.height - 172 - 10;
    await expect.poll(async () => (await geometry()).bounds.y).toBe(bottomY);
    await expect(island()).toBeVisible();

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      const original = window.setBounds.bind(window);
      (globalThis as any).animatedBounds = [];
      window.setBounds = (bounds, animate) => {
        (globalThis as any).animatedBounds.push(animate);
        original(bounds, animate);
      };
    });
    // Assistive technology can activate a button without a pointer-down/up pair.
    await island().dispatchEvent("click", { detail: 1 });
    await expect(
      page.getByRole("textbox", { name: "Your SaaS idea", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".mode-capture")).toHaveCSS("opacity", "1");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.blur(),
    );
    await expect(page.locator(".mode-capture")).toHaveCSS("opacity", "0.8");
    expect((await geometry()).bounds.x).toBe(work.x + 10);
    await page
      .getByRole("button", { name: "Collapse to island", exact: true })
      .click();
    await expect(island()).toBeVisible();
    expect((await geometry()).bounds.y).toBe(bottomY);
    const animated = await app.evaluate(
      () => (globalThis as any).animatedBounds,
    );
    expect(animated.length).toBeGreaterThan(0);
    expect(animated.every((value: boolean) => value === false)).toBe(true);

    await app.close();
    app = await electron.launch({ args: ["dist-desktop/main/main.js"], env });
    page = await app.firstWindow();
    await expect(island()).toBeVisible();
    expect((await geometry()).bounds).toMatchObject({
      x: work.x + 10,
      y: bottomY,
    });
    await island().focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect
      .poll(async () => (await geometry()).bounds.x)
      .toBe(work.x + work.width - 64 - 10);
    await page.keyboard.press("Alt+ArrowUp");
    await expect
      .poll(async () => (await geometry()).bounds.y)
      .toBe(bottomY - 24);
    await page.screenshot({ path: "test-results/native-floating-island.png" });
    expect(errors).toEqual([]);
    // Activation can arrive while macOS is tearing down the last native window.
    // It must be ignored instead of accessing a destroyed BrowserWindow.
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.destroy();
      app.emit("activate", {}, false);
    });
    const nativeProcess = app.process();
    await app.evaluate(({ app }) => {
      setTimeout(() => app.quit(), 50);
    });
    await expect.poll(() => nativeProcess.exitCode).toBe(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

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
