import { describe, expect, it } from "vitest";
import {
  PositionSchema,
  windowBounds,
  verticalPosition,
} from "../../src/desktop/window-position.js";

describe("floating window placement", () => {
  const work = { x: -1920, y: 38, width: 1920, height: 1042 };
  const position = { displayId: 1, edge: "left" as const, y: 0.25 };

  it("anchors either edge on displays with negative origins", () => {
    const left = windowBounds("island", work, position);
    const right = windowBounds("capture", work, { ...position, edge: "right" });
    expect(left.x).toBe(-1910);
    expect(right.x + right.width).toBe(-10);
    expect(verticalPosition(left.y + left.height / 2, work)).toBeCloseTo(
      0.25,
      2,
    );
  });

  it.each([0, 0.5, 1])(
    "keeps all modes inside the work area at vertical position %s",
    (y) => {
      for (const mode of ["island", "capture", "workspace"] as const) {
        const bounds = windowBounds(mode, work, { ...position, y });
        expect(bounds.y).toBeGreaterThanOrEqual(work.y + 10);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(
          work.y + work.height - 10,
        );
      }
    },
  );

  it("clamps small displays and out-of-range drags without losing the island anchor", () => {
    const small = { x: 20, y: 50, width: 400, height: 400 };
    expect(windowBounds("workspace", small, position)).toEqual({
      x: 30,
      y: 60,
      width: 380,
      height: 380,
    });
    expect(verticalPosition(-10000, small)).toBe(0);
    expect(verticalPosition(10000, small)).toBe(1);
    expect(windowBounds("island", small, { ...position, y: 1 }).y).toBe(360);
  });

  it("validates saved positions rather than restoring off-screen coordinates", () => {
    expect(PositionSchema.safeParse({ ...position, y: 2 }).success).toBe(false);
    expect(PositionSchema.safeParse({ ...position, edge: "top" }).success).toBe(
      false,
    );
  });
});
