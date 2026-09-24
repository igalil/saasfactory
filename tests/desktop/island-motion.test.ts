import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { WindowController } from "../../src/desktop/window-controller.js";

const environment = vi.hoisted(() => ({
  reduced: false,
  display: { id: 1, workArea: { x: 0, y: 30, width: 1440, height: 850 } },
}));
vi.mock("electron", () => ({
  screen: {
    getPrimaryDisplay: () => environment.display,
    getAllDisplays: () => [environment.display],
    getDisplayMatching: () => environment.display,
    getDisplayNearestPoint: () => environment.display,
  },
  systemPreferences: {
    getAnimationSettings: () => ({ prefersReducedMotion: environment.reduced }),
  },
}));

class FakeWindow extends EventEmitter {
  bounds = { x: 0, y: 0, width: 64, height: 172 };
  webContents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    getBackgroundThrottling: () => true,
    setBackgroundThrottling: vi.fn(),
  });
  getBounds = () => ({ ...this.bounds });
  setBounds = vi.fn((bounds) => {
    this.bounds = { ...bounds };
  });
  isDestroyed = () => false;
  isFocused = () => true;
  isVisible = () => true;
  setAlwaysOnTop = vi.fn();
  setIgnoreMouseEvents = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  showInactive = vi.fn();
}

describe("sticky island gesture", () => {
  let directory: string;
  let window: FakeWindow;
  let controller: WindowController;
  let start: { x: number; y: number };
  beforeEach(async () => {
    vi.useFakeTimers();
    environment.reduced = false;
    directory = await mkdtemp(path.join(os.tmpdir(), "saasfactory-motion-"));
    window = new FakeWindow();
    controller = new WindowController(
      window as unknown as BrowserWindow,
      path.join(directory, "position.json"),
    );
    controller.setMode("island");
    start = { x: window.bounds.x + 32, y: window.bounds.y + 80 };
    controller.beginDrag(start);
  });
  afterEach(async () => {
    await controller.flush();
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  });
  const pull = (pixels: number) =>
    controller.moveDrag({ x: start.x - pixels, y: start.y });

  it("stretches a short pull, then returns to its original edge", async () => {
    pull(48);
    expect(controller.state()).toMatchObject({
      edge: "right",
      motion: { phase: "pull" },
    });
    expect(window.bounds.width).toBe(1420);
    expect(controller.endDrag({ x: start.x - 48, y: start.y })).toBe(true);
    expect(controller.state().motion?.phase).toBe("return");
    controller.finishMotion(controller.state().motion!.id);
    expect(window.bounds).toMatchObject({ x: 1366, width: 64 });
    expect(controller.state().motion).toBeNull();
    await controller.flush();
    expect(
      JSON.parse(await readFile(path.join(directory, "position.json"), "utf8"))
        .edge,
    ).toBe("right");
  });

  it("launches at the threshold without waiting for mouseup or following later pointer positions", () => {
    pull(104);
    const motion = controller.state().motion!;
    expect(motion.phase).toBe("flight");
    expect(controller.state().edge).toBe("left");
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, {
      forward: true,
    });
    controller.moveDrag({ x: 1380, y: 900 });
    expect(controller.endDrag(start)).toBe(true);
    expect(controller.state().motion).toEqual(motion);
    controller.finishMotion(motion.id + 1); // Stale animation acknowledgments are ignored.
    expect(controller.state().motion).toEqual(motion);
    controller.finishMotion(motion.id);
    expect(window.bounds).toMatchObject({ x: 10, width: 64 });
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(window.webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(
      true,
    );
  });

  it("switches from the left using the same small inward pull", () => {
    controller.nudge("left");
    controller.beginDrag({ x: 42, y: start.y });
    controller.moveDrag({ x: 146, y: start.y });
    expect(controller.state()).toMatchObject({
      edge: "right",
      motion: { phase: "flight", from: "left" },
    });
    controller.finishMotion(controller.state().motion!.id);
    expect(window.bounds.x).toBe(1366);
  });

  it("keeps vertical dragging and tiny click jitter out of the slingshot", () => {
    controller.moveDrag({ x: start.x - 3, y: start.y + 2 });
    expect(controller.endDrag()).toBe(false);
    controller.beginDrag(start);
    controller.moveDrag({ x: start.x - 16, y: start.y + 130 });
    expect(controller.state().motion).toBeNull();
    expect(window.bounds.width).toBe(64);
    expect(window.bounds.y).toBeGreaterThan(start.y);
  });

  it("switches immediately with reduced motion and never widens the native window", () => {
    controller.endDrag();
    environment.reduced = true;
    controller.beginDrag(start);
    pull(48);
    expect(window.bounds.width).toBe(64);
    pull(104);
    expect(controller.state()).toMatchObject({ edge: "left", motion: null });
    expect(window.bounds).toMatchObject({ x: 10, width: 64 });
  });

  it("recovers narrow interactive bounds if the renderer never finishes its animation", () => {
    pull(104);
    vi.advanceTimersByTime(1300);
    expect(controller.state().motion).toBeNull();
    expect(window.bounds).toMatchObject({ x: 10, width: 64 });
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it("cleans up on blur, display changes, and a mode change during flight", () => {
    pull(48);
    window.emit("blur");
    expect(controller.state().motion).toBeNull();
    expect(window.bounds.width).toBe(64);
    controller.beginDrag(start);
    pull(104);
    const id = controller.state().motion!.id;
    controller.setMode("capture");
    controller.finishMotion(id);
    vi.advanceTimersByTime(1300);
    expect(controller.state()).toMatchObject({
      mode: "capture",
      edge: "left",
      motion: null,
    });
    expect(window.bounds.width).toBe(450);
    controller.repairDisplay();
    expect(window.bounds.width).toBe(450);
  });
});
