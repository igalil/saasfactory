import { z } from "zod";
import { ISLAND_HEIGHT, ISLAND_WIDTH } from "./island-motion.js";
import type { WindowMode } from "./shared.js";

export const PositionSchema = z.object({
  displayId: z.number().int(),
  edge: z.enum(["left", "right"]),
  // Fraction of the island's available vertical travel, independent of panel size.
  y: z.number().finite().min(0).max(1),
});
export type EdgePosition = z.infer<typeof PositionSchema>;
export type Rectangle = { x: number; y: number; width: number; height: number };
export const EDGE_GAP = 10;
const sizes = {
  island: { width: ISLAND_WIDTH, height: ISLAND_HEIGHT },
  capture: { width: 450, height: 660 },
  workspace: { width: 1180, height: 820 },
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function windowBounds(
  mode: WindowMode,
  work: Rectangle,
  position: EdgePosition,
  display: Rectangle = work,
): Rectangle {
  // Floating controls touch the physical side edge, even beside a side Dock.
  // Keep expanded library bounds and vertical placement inside the work area.
  const horizontal = mode === "workspace" ? work : display;
  const sideGap = mode === "workspace" ? EDGE_GAP : 0;
  const width = Math.max(
    1,
    Math.min(horizontal.width - sideGap * 2, sizes[mode].width),
  );
  const height = Math.max(
    1,
    Math.min(work.height - EDGE_GAP * 2, sizes[mode].height),
  );
  const islandHeight = Math.min(sizes.island.height, height);
  const travel = Math.max(0, work.height - EDGE_GAP * 2 - islandHeight);
  const center = work.y + EDGE_GAP + islandHeight / 2 + position.y * travel;
  return {
    x: Math.round(
      position.edge === "left"
        ? horizontal.x + sideGap
        : horizontal.x + horizontal.width - width - sideGap,
    ),
    y: Math.round(
      clamp(
        center - height / 2,
        work.y + EDGE_GAP,
        work.y + work.height - height - EDGE_GAP,
      ),
    ),
    width,
    height,
  };
}

export function verticalPosition(center: number, work: Rectangle): number {
  const islandHeight = Math.min(
    sizes.island.height,
    Math.max(1, work.height - EDGE_GAP * 2),
  );
  const travel = work.height - EDGE_GAP * 2 - islandHeight;
  return travel > 0
    ? clamp((center - work.y - EDGE_GAP - islandHeight / 2) / travel, 0, 1)
    : 0.5;
}
