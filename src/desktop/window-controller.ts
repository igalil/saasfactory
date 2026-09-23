import { screen, type BrowserWindow, type Point } from "electron";
import { readFileSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import type { WindowMode, WindowState } from "./shared.js";
import {
  PositionSchema,
  windowBounds,
  verticalPosition,
  type EdgePosition,
} from "./window-position.js";

export class WindowController {
  mode: WindowMode = "island";
  private position: EdgePosition;
  private drag: { start: Point; offsetY: number; moved: boolean } | undefined;
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
    window.webContents.on("render-process-gone", () => this.finishDrag());
  }

  state(): WindowState {
    return {
      mode: this.mode,
      edge: this.position.edge,
      focused: !this.window.isDestroyed() && this.window.isFocused(),
      dragging: this.drag?.moved ?? false,
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
    this.window.setBounds(
      windowBounds(this.mode, display.workArea, this.position),
      false,
    );
  }

  setMode(next: WindowMode, activate = true) {
    if (this.window.isDestroyed()) return;
    this.finishDrag();
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
    this.place();
    this.persist();
  }

  beginDrag(start: Point) {
    if (this.mode === "workspace") return;
    this.drag = {
      start,
      offsetY: start.y - this.window.getBounds().y,
      moved: false,
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
    const work = display.workArea;
    const height = windowBounds(this.mode, work, this.position).height;
    this.position = {
      displayId: display.id,
      edge: point.x < work.x + work.width / 2 ? "left" : "right",
      y: verticalPosition(point.y - this.drag.offsetY + height / 2, work),
    };
    this.place();
    this.publish();
  }

  endDrag(point?: Point): boolean {
    // A blur/cancelled gesture must never become an accidental capture click.
    if (!this.drag) return true;
    if (point) this.moveDrag(point);
    return this.finishDrag();
  }

  private finishDrag(): boolean {
    const moved = this.drag?.moved ?? false;
    this.drag = undefined;
    if (moved) this.persist();
    this.publish();
    return moved;
  }

  nudge(direction: "up" | "down" | "left" | "right") {
    if (this.mode === "workspace") return;
    this.finishDrag();
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
    return this.writing;
  }
}
