import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ISLAND_HEIGHT, ISLAND_WIDTH } from "../../src/desktop/island-motion";

test("macOS Dock presence survives mode changes, window close, and activation", async () => {
  test.skip(process.platform !== "darwin", "macOS Dock behavior");
  const directory = await mkdtemp(path.join(os.tmpdir(), "saasfactory-dock-"));
  const env = { ...process.env, SAASFACTORY_DATA_DIR: directory };
  delete env["ELECTRON_RUN_AS_NODE"];
  delete env["SAASFACTORY_DEV_URL"];
  const app = await electron.launch({
    args: ["dist-desktop/main/main.js"],
    env,
  });
  try {
    const page = await app.firstWindow();
    const dockVisible = () => app.evaluate(({ app }) => app.dock!.isVisible());
    await expect(page.locator("body")).toHaveAttribute("data-mode", "island");
    await expect.poll(dockVisible).toBe(true);
    for (const mode of ["capture", "workspace", "island"] as const) {
      await page.evaluate((mode) => window.saasfactory!.setWindow(mode), mode);
      await expect(page.locator("body")).toHaveAttribute("data-mode", mode);
      await expect.poll(dockVisible).toBe(true);
    }
    await app.evaluate(({ app }) => app.emit("activate", {}, false));
    await expect(page.locator("body")).toHaveAttribute("data-mode", "capture");
    await expect(page.locator("body")).toHaveAttribute("data-focused", "true");
    await expect.poll(dockVisible).toBe(true);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.close(),
    );
    await expect(page.locator("body")).toHaveAttribute("data-mode", "island");
    await expect.poll(dockVisible).toBe(true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("sticky island returns from small pulls and flies past the held pointer on release", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "saasfactory-sticky-"),
  );
  const env = { ...process.env, SAASFACTORY_DATA_DIR: directory };
  delete env["ELECTRON_RUN_AS_NODE"];
  delete env["SAASFACTORY_DEV_URL"];
  const app = await electron.launch({
    args: ["dist-desktop/main/main.js"],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const island = page.getByRole("button", {
      name: "Capture an idea",
      exact: true,
    });
    const stage = page.locator(".island-stage");
    await expect(island).toBeVisible();
    await app.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]!.focus();
    });
    await expect(page.locator("body")).toHaveAttribute("data-focused", "true");
    await app.evaluate(({ systemPreferences }) => {
      const original =
        systemPreferences.getAnimationSettings.bind(systemPreferences);
      systemPreferences.getAnimationSettings = () => ({
        ...original(),
        prefersReducedMotion: false,
      });
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const geometry = () =>
      app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        return {
          bounds: window.getBounds(),
          work: screen.getDisplayMatching(window.getBounds()).workArea,
          display: screen.getDisplayMatching(window.getBounds()).bounds,
        };
      });
    const original = await geometry();
    const point = {
      x: original.bounds.x + ISLAND_WIDTH / 2,
      y: original.bounds.y + ISLAND_HEIGHT / 2,
    };
    const move = async (x: number, type = "pointermove") =>
      island.dispatchEvent(type, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        screenX: x,
        screenY: point.y,
      });
    await page.mouse.move(ISLAND_WIDTH / 2, ISLAND_HEIGHT / 2);
    await page.mouse.down();
    await move(point.x - 48);
    await expect(stage).toHaveAttribute("data-phase", "pull");
    await expect(page.getByText("Pull to switch sides")).toHaveCount(0);
    expect((await geometry()).bounds.width).toBe(original.display.width);
    await page.screenshot({ path: "test-results/island-sticky-pull.png" });
    await move(point.x - 48, "pointerup");
    await page.mouse.up();
    await expect(stage).toHaveAttribute("data-phase", "idle");
    expect((await geometry()).bounds).toEqual(original.bounds);

    await page.mouse.move(ISLAND_WIDTH / 2, ISLAND_HEIGHT / 2);
    await page.mouse.down();
    await move(point.x - 110); // Only a short pull; mouse is still at the original side.
    await expect(stage).toHaveAttribute("data-phase", "flight");
    await expect
      .poll(() =>
        page
          .locator(".island-traveler")
          .evaluate((element) =>
            element
              .getAnimations()
              .some((animation) => animation.playState === "running"),
          ),
      )
      .toBe(true);
    // Inspect a real compositor frame and retain a screenshot of the airborne shape.
    await page.locator(".island-traveler").evaluate((element) => {
      const animation = element.getAnimations()[0]!;
      animation.pause();
      animation.currentTime = 250;
      return new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const airborne = await island.boundingBox();
    expect(airborne!.x).toBeLessThan(original.display.width * 0.7);
    expect(airborne!.x).toBeGreaterThan(ISLAND_WIDTH);
    const flightShape = await island.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const inside = (x: number, y: number) =>
        element.contains(
          document.elementFromPoint(
            bounds.x + bounds.width * x,
            bounds.y + bounds.height * y,
          ),
        );
      return {
        // All four detached corners must be cut away symmetrically.
        corners: [
          inside(0.03, 0.12),
          inside(0.97, 0.12),
          inside(0.03, 0.88),
          inside(0.97, 0.88),
        ],
        edges: [
          inside(0.5, 0.12),
          inside(0.5, 0.88),
          inside(0.03, 0.5),
          inside(0.97, 0.5),
        ],
      };
    });
    expect(flightShape).toEqual({
      corners: [false, false, false, false],
      edges: [true, true, true, true],
    });
    await page.screenshot({
      path: "test-results/island-sticky-flight.png",
      omitBackground: true,
    });
    await page
      .locator(".island-traveler")
      .evaluate((element) => element.getAnimations()[0]!.play());
    await move(point.x + 5); // Late pointer events must not take the island back.
    await expect(stage).toHaveAttribute("data-phase", "idle");
    await page.mouse.up();
    expect((await geometry()).bounds).toMatchObject({
      x: original.display.x,
      width: ISLAND_WIDTH,
      y: original.bounds.y,
    });
    await expect(island).toBeVisible();

    await app.evaluate(({ systemPreferences }) => {
      const original =
        systemPreferences.getAnimationSettings.bind(systemPreferences);
      systemPreferences.getAnimationSettings = () => ({
        ...original(),
        prefersReducedMotion: true,
      });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(ISLAND_WIDTH / 2, ISLAND_HEIGHT / 2);
    await page.mouse.down();
    await move(original.display.x + ISLAND_WIDTH / 2 + 110);
    await move(original.display.x + ISLAND_WIDTH / 2 + 110, "pointerup");
    await page.mouse.up();
    await expect(stage).toHaveAttribute("data-phase", "idle");
    expect((await geometry()).bounds).toEqual(original.bounds);
    await island.click();
    await expect(
      page.getByRole("textbox", { name: "Your SaaS idea", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

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
          display: screen.getDisplayMatching(window.getBounds()).bounds,
        };
      });
    await expect(island()).toBeVisible();
    await app.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]!.focus();
    });
    await expect(page.locator(".island-idea")).toHaveCSS("opacity", "1");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.blur(),
    );
    await expect(page.locator(".island-idea")).toHaveCSS("opacity", "0.6");
    await expect(island()).toHaveCSS("opacity", "1");

    // Inject off-window pointer coordinates without moving the user's OS cursor.
    // Pointer capture, IPC, geometry and persistence use the production paths.
    const dragTo = async (point: { x: number; y: number }) => {
      await page.mouse.move(ISLAND_WIDTH / 2, ISLAND_HEIGHT / 2);
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
      await expect(page.locator(".island-stage")).toHaveAttribute(
        "data-phase",
        "idle",
      );
    };
    const { work, display } = await geometry();
    await dragTo({ x: work.x + ISLAND_WIDTH / 2, y: work.y - 200 });
    await expect.poll(async () => (await geometry()).bounds.x).toBe(display.x);
    await expect
      .poll(async () => (await geometry()).bounds.y)
      .toBe(work.y + 10);
    await expect(island()).toBeVisible(); // Releasing a drag must not open capture.
    await expect(page.locator("body")).toHaveAttribute(
      "data-dragging",
      "false",
    );
    await expect(page.locator("body")).toHaveAttribute("data-edge", "left");

    await dragTo({
      x: work.x + ISLAND_WIDTH / 2,
      y: work.y + work.height + 200,
    });
    const bottomY = work.y + work.height - ISLAND_HEIGHT - 10;
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
    const bezelJoins = await page
      .locator(".mode-capture")
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const inside = (x: number, y: number) =>
          element.contains(
            document.elementFromPoint(bounds.x + x, bounds.y + y),
          );
        return {
          top: inside(0.5, 8),
          bottom: inside(0.5, bounds.height - 8),
          abovePanel: inside(20, 8),
          belowPanel: inside(20, bounds.height - 8),
        };
      });
    expect(bezelJoins).toEqual({
      top: true,
      bottom: true,
      abovePanel: false,
      belowPanel: false,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.blur(),
    );
    await expect(page.locator(".mode-capture")).toHaveCSS("opacity", "0.8");
    expect((await geometry()).bounds.x).toBe(display.x);
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
      x: display.x,
      y: bottomY,
    });
    await island().focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect
      .poll(async () => (await geometry()).bounds.x)
      .toBe(display.x + display.width - ISLAND_WIDTH);
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
        display: screen.getDisplayMatching(window.getBounds()).bounds,
        alwaysOnTop: window.isAlwaysOnTop(),
      };
    });
    expect(geometry.bounds.width).toBe(ISLAND_WIDTH);
    expect(geometry.bounds.x + geometry.bounds.width).toBe(
      geometry.display.x + geometry.display.width,
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
