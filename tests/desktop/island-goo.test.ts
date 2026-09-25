import { describe, expect, it } from "vitest";
import {
  flightPose,
  gooPath,
  pullPose,
  returnPose,
  travelerTransform,
} from "../../desktop/src/island-goo.js";
import { ISLAND_HEIGHT } from "../../src/desktop/island-motion.js";

// Shoulders of the idle notch clip-path in desktop/src/styles.css.
const NOTCH_SHOULDER = "M0 0C0 4.42 3.58 8 8 8";

describe("island goo geometry", () => {
  it("starts from the idle notch and returns to it after an early release", () => {
    const rest = gooPath(pullPose(0), 0);
    expect(rest.startsWith(NOTCH_SHOULDER)).toBe(true);
    expect(pullPose(0).body).toEqual({ x: 16, sx: 1, sy: 1 });
    expect(returnPose(0, 0.6)).toEqual(pullPose(0.6));
    expect(returnPose(1, 0.6).body).toEqual({ x: 16, sx: 1, sy: 1 });
    expect(gooPath(returnPose(1, 0.6), 0)).toBe(rest);
  });

  it("thins the held connection toward a thread before release", () => {
    const necks = [0, 0.25, 0.5, 0.75, 1].map(
      (pull) => pullPose(pull).origin!.neck,
    );
    necks.slice(1).forEach((neck, index) => {
      expect(neck).toBeLessThan(necks[index]!);
    });
    expect(necks.at(-1)).toBeLessThan(4);
  });

  it("snaps at launch, clears the origin wall, and lands as the mirrored notch", () => {
    const width = 500;
    const launch = flightPose(0, width);
    expect(launch.body).toEqual(pullPose(1).body);
    expect(launch.stub).toBeDefined();
    expect(launch.tail).toBeDefined();
    const airborne = flightPose(0.45, width);
    expect(airborne.stub).toBeUndefined();
    expect(airborne.tail).toBeUndefined();
    expect(airborne.target).toBeUndefined();
    const landed = flightPose(1, width);
    expect(landed.body).toEqual({ x: width - 16, sx: 1, sy: 1 });
    expect(gooPath(landed, width).startsWith("M500 0C500 4.42 496.42 8 492 8")).toBe(
      true,
    );
  });

  it("keeps every animated pose inside the island strip", () => {
    for (let step = 0; step <= 100; step += 1) {
      const time = step / 100;
      for (const pose of [flightPose(time, 900), returnPose(time, 0.9)]) {
        expect(64 * pose.body.sy).toBeLessThanOrEqual(ISLAND_HEIGHT);
        expect(pose.target?.foot ?? 0).toBeLessThanOrEqual(ISLAND_HEIGHT / 2);
        expect(gooPath(pose, 900)).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it("mirrors the island transform for the right edge", () => {
    const body = { x: 40, sx: 1.2, sy: 0.9 };
    expect(travelerTransform(body, "left")).toBe(
      "translate3d(24px, 0, 0) scale(1.2000, 0.9000)",
    );
    expect(travelerTransform(body, "right")).toBe(
      "translate3d(-24px, 0, 0) scale(1.2000, 0.9000)",
    );
  });
});
