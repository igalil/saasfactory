import { z } from "zod";
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
  island: { width: 64, height: 172 },
  capture: { width: 450, height: 660 },
  workspace: { width: 1180, height: 820 },
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function windowBounds(
  mode: WindowMode,
  work: Rectangle,
  position: EdgePosition,
): Rectangle {
  const width = Math.max(
    1,
    Math.min(work.width - EDGE_GAP * 2, sizes[mode].width),
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
        ? work.x + EDGE_GAP
        : work.x + work.width - width - EDGE_GAP,
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
