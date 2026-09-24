import {
  screen,
  systemPreferences,
  type BrowserWindow,
  type Point,
} from "electron";
import { readFileSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import type { IslandMotion, WindowMode, WindowState } from "./shared.js";
import {
  inwardPull,
  pullProgress,
  ISLAND_FLIGHT_MS,
  ISLAND_RETURN_MS,
} from "./island-motion.js";
import {
  PositionSchema,
  windowBounds,
  verticalPosition,
  type EdgePosition,
} from "./window-position.js";

export class WindowController {
  mode: WindowMode = "island";
  private position: EdgePosition;
  private drag:
    | { start: Point; offsetY: number; moved: boolean; reducedMotion: boolean }
    | undefined;
  private motion: IslandMotion | null = null;
  private motionId = 0;
  private motionTimer: ReturnType<typeof setTimeout> | undefined;
  private previousThrottling: boolean | undefined;
  private published = "";
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private window: BrowserWindow,
    private file: string,
  ) {
    this.position = {
      displayId: screen.getPrimaryDisplay().id,
      edge: "right",
      y: 0.5,
    };
    try {
      this.position = PositionSchema.parse(
        JSON.parse(readFileSync(file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn(
          "Could not restore floating window position; using the default edge.",
        );
    }
    window.on("focus", () => this.publish());
    window.on("blur", () => {
      this.finishDrag();
      this.publish();
    });
    window.webContents.on("render-process-gone", () => {
      this.finishDrag();
      this.settleMotion();
    });
    window.on("closed", () => clearTimeout(this.motionTimer));
  }

  state(): WindowState {
    return {
      mode: this.mode,
      edge: this.position.edge,
      focused: !this.window.isDestroyed() && this.window.isFocused(),
      dragging: this.drag?.moved ?? false,
      motion: this.motion,
    };
  }

  private publish() {
    if (this.window.isDestroyed()) return;
    const state = this.state();
    const serialized = JSON.stringify(state);
    if (serialized === this.published) return;
    this.published = serialized;
    this.window.webContents.send("window:changed", state);
  }

  private display() {
    return (
      screen
        .getAllDisplays()
        .find((display) => display.id === this.position.displayId) ??
      screen.getDisplayMatching(this.window.getBounds())
    );
  }

  private place() {
    if (this.window.isDestroyed()) return;
    const display = this.display();
    this.position.displayId = display.id;
    // Native animated resizing reflows React through many intermediate widths.
    // Apply final geometry immediately so the new layout never stretches/squeezes.
    const bounds = windowBounds(this.mode, display.workArea, this.position);
    if (this.motion && this.mode === "island") {
      if (this.previousThrottling === undefined) {
        this.previousThrottling =
          this.window.webContents.getBackgroundThrottling();
        this.window.webContents.setBackgroundThrottling(false);
      }
      // A short-lived transparent strip gives the compositor room for the tether
      // and flight. Native bounds stay fixed throughout the cross-screen animation.
      bounds.x = display.workArea.x + 10;
      bounds.width = Math.max(64, display.workArea.width - 20);
    }
    const previous = this.window.getBounds();
    if (
      Object.keys(bounds).some(
        (key) =>
          bounds[key as keyof typeof bounds] !==
          previous[key as keyof typeof bounds],
      )
    )
      this.window.setBounds(bounds, false);
  }

  setMode(next: WindowMode, activate = true) {
    if (this.window.isDestroyed()) return;
    this.finishDrag();
    this.settleMotion();
    this.mode = next;
    this.place();
    this.window.setAlwaysOnTop(next !== "workspace", "floating");
    this.publish();
    if (activate && next !== "island") {
      this.window.show();
      this.window.focus();
    } else if (!this.window.isVisible()) {
      this.window.showInactive();
    }
  }

  repairDisplay() {
    if (this.window.isDestroyed()) return;
    this.finishDrag();
    this.settleMotion();
    this.place();
    this.persist();
  }

  beginDrag(start: Point) {
    if (this.mode === "workspace" || this.motion?.phase === "flight") return;
    this.settleMotion();
    this.drag = {
      start,
      offsetY: start.y - this.window.getBounds().y,
      moved: false,
      reducedMotion:
        systemPreferences.getAnimationSettings().prefersReducedMotion,
    };
  }

  moveDrag(point: Point) {
    if (!this.drag) return;
    if (
      !this.drag.moved &&
      Math.hypot(point.x - this.drag.start.x, point.y - this.drag.start.y) < 6
    )
      return;
    this.drag.moved = true;
    const display = screen.getDisplayNearestPoint(point);
    if (this.mode === "island") {
      const distance = inwardPull(
        this.position.edge,
        this.drag.start.x,
        point.x,
      );
      // Crossing outward onto an adjacent monitor remains an ordinary transfer.
      if (display.id === this.position.displayId || distance >= 0) {
        const work = this.display().workArea;
        const height = windowBounds("island", work, this.position).height;
        this.position.y = verticalPosition(
          point.y - this.drag.offsetY + height / 2,
          work,
        );
        const progress = pullProgress(distance);
        const horizontal =
          distance > 12 &&
          distance > Math.abs(point.y - this.drag.start.y) * 0.6;
        if (this.motion?.phase === "pull" || horizontal) {
          if (progress >= 1) {
            this.launchIsland(this.drag.reducedMotion);
            return;
          }
          if (!this.drag.reducedMotion) {
            this.motion = {
              id: this.motion?.id ?? ++this.motionId,
              phase: "pull",
              from: this.position.edge,
              pull: progress,
            };
          }
        }
        this.place();
        this.publish();
        return;
      }
      this.settleMotion();
    }
    const work = display.workArea;
    const height = windowBounds(this.mode, work, this.position).height;
    this.position = {
      displayId: display.id,
      edge: point.x < work.x + work.width / 2 ? "left" : "right",
      y: verticalPosition(point.y - this.drag.offsetY + height / 2, work),
    };
    this.place();
    if (this.mode === "island") {
      this.drag.start = point;
      this.drag.offsetY = point.y - this.window.getBounds().y;
    }
    this.publish();
  }

  endDrag(point?: Point): boolean {
    // A blur/cancelled gesture must never become an accidental capture click.
    if (!this.drag) return true;
    if (point) this.moveDrag(point);
    // Releasing after launch cannot redirect or cancel the autonomous flight.
    if (!this.drag) return true;
    if (this.motion?.phase === "pull") {
      this.drag = undefined;
      this.motion = { ...this.motion, phase: "return" };
      this.window.setIgnoreMouseEvents(true, { forward: true });
      this.armMotionTimeout(ISLAND_RETURN_MS);
      this.publish();
      return true;
    }
    return this.finishDrag();
  }

  private launchIsland(reducedMotion: boolean) {
    const from = this.position.edge;
    this.position.edge = from === "left" ? "right" : "left";
    this.drag = undefined;
    if (reducedMotion) {
      this.settleMotion();
      this.place();
      this.persist();
      this.publish();
      return;
    }
    this.motion = {
      id: this.motion?.id ?? ++this.motionId,
      phase: "flight",
      from,
      pull: 1,
    };
    this.place();
    // The animation strip must not intercept clicks on other apps during flight.
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.armMotionTimeout(ISLAND_FLIGHT_MS);
    this.publish();
  }

  private armMotionTimeout(duration: number) {
    clearTimeout(this.motionTimer);
    const id = this.motion!.id;
    // Renderer completion normally wins; recover narrow bounds even if it stalls.
    this.motionTimer = setTimeout(() => this.finishMotion(id), duration + 600);
  }

  finishMotion(id: number) {
    if (!this.motion || this.motion.id !== id || this.motion.phase === "pull")
      return;
    this.settleMotion();
  }

  private settleMotion() {
    if (!this.motion) return;
    clearTimeout(this.motionTimer);
    this.motionTimer = undefined;
    this.motion = null;
    if (this.window.isDestroyed()) return;
    if (this.previousThrottling !== undefined) {
      this.window.webContents.setBackgroundThrottling(this.previousThrottling);
      this.previousThrottling = undefined;
    }
    this.window.setIgnoreMouseEvents(false);
    this.place();
    this.persist();
    this.publish();
  }

  private finishDrag(): boolean {
    const moved = this.drag?.moved ?? false;
    this.drag = undefined;
    if (this.motion?.phase === "pull") this.settleMotion();
    if (moved) this.persist();
    this.publish();
    return moved;
  }

  nudge(direction: "up" | "down" | "left" | "right") {
    if (this.mode === "workspace") return;
    this.finishDrag();
    this.settleMotion();
    if (direction === "left" || direction === "right")
      this.position.edge = direction;
    else {
      const work = this.display().workArea;
      const island = windowBounds("island", work, this.position);
      this.position.y = verticalPosition(
        island.y + island.height / 2 + (direction === "up" ? -24 : 24),
        work,
      );
    }
    this.place();
    this.persist();
    this.publish();
  }

  private persist() {
    const contents = JSON.stringify(this.position);
    this.writing = this.writing
      .then(async () => {
        await writeFile(`${this.file}.tmp`, contents, { mode: 0o600 });
        await rename(`${this.file}.tmp`, this.file);
      })
      .catch(() => console.warn("Could not save floating window position."));
  }

  flush() {
    this.finishDrag();
    this.settleMotion();
    return this.writing;
  }
}
