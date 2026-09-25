import { useLayoutEffect, useRef, type ReactNode } from "react";
import { api } from "./api";
import type { WindowState } from "../../src/desktop/shared";
import {
  ISLAND_FLIGHT_MS,
  ISLAND_RETURN_MS,
  ISLAND_WIDTH,
} from "../../src/desktop/island-motion";
import {
  flightPose,
  gooPath,
  pullPose,
  returnPose,
  travelerTransform,
} from "./island-goo";

/** Keyframes per animation; straight segments between them stay sub-pixel. */
const SAMPLES = 48;

export function IslandSurface({
  state,
  children,
}: {
  state: WindowState;
  children: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const traveler = useRef<HTMLDivElement>(null);
  const goo = useRef<SVGPathElement>(null);
  const motion = state.motion;
  const from = motion?.from ?? state.edge;
  const held = motion ? pullPose(motion.pull) : undefined;

  useLayoutEffect(() => {
    if (motion?.phase !== "pull") return;
    goo.current?.setAttribute("d", gooPath(pullPose(motion.pull), 0));
  }, [motion?.phase, motion?.pull]);

  useLayoutEffect(() => {
    if (!motion || motion.phase === "pull") return;
    const stageElement = stage.current;
    const travelerElement = traveler.current;
    const path = goo.current;
    if (!stageElement || !travelerElement || !path) return;
    const flight = motion.phase === "flight";
    const duration = flight ? ISLAND_FLIGHT_MS : ISLAND_RETURN_MS;
    const poseAt = (time: number, width: number) =>
      flight ? flightPose(time, width) : returnPose(time, motion.pull);
    let frame = 0;
    let animation: Animation | undefined;
    const finish = () => {
      void api.finishIslandMotion(motion.id).catch(() => {});
    };
    // The opening pose does not depend on the strip width; draw it before paint.
    path.setAttribute("d", gooPath(poseAt(0, 0), 0));
    const start = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      // The IPC message and native resize can reach Chromium in adjacent frames.
      // Wait for the strip's final viewport before measuring the flight distance.
      const width = stageElement.clientWidth;
      if (width <= ISLAND_WIDTH) {
        frame = requestAnimationFrame(start);
        return;
      }
      const running = travelerElement.animate(
        Array.from({ length: SAMPLES + 1 }, (_, index) => ({
          transform: travelerTransform(
            poseAt(index / SAMPLES, width).body,
            motion.from,
          ),
        })),
        { duration, fill: "forwards" },
      );
      animation = running;
      // The goo reads the island's own timeline, so pausing or seeking it stays in step.
      const draw = () => {
        const time =
          typeof running.currentTime === "number" ? running.currentTime : 0;
        path.setAttribute("d", gooPath(poseAt(time / duration, width), width));
        frame = requestAnimationFrame(draw);
      };
      draw();
      running.finished
        .then(() => {
          cancelAnimationFrame(frame);
          // Hand the bezel joins back to the island's notch clip-path, and keep the
          // final pose responsive while the native strip shrinks to its idle width.
          stageElement.dataset["settled"] = "";
          travelerElement.style.transform = flight
            ? `translate3d(calc(${motion.from === "left" ? 1 : -1} * (100vw - ${ISLAND_WIDTH}px)), 0, 0)`
            : "none";
          running.cancel();
          finish();
        })
        .catch(() => {});
    };
    frame = requestAnimationFrame(start);
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
      delete stageElement.dataset["settled"];
    };
  }, [motion?.id, motion?.phase]);

  return (
    <div
      className="island-stage"
      ref={stage}
      data-phase={motion?.phase ?? "idle"}
      data-from={from}
    >
      {motion && (
        <svg className="island-tether" aria-hidden="true">
          <path ref={goo} />
        </svg>
      )}
      <div
        className="island-traveler"
        ref={traveler}
        style={
          held
            ? {
                left: from === "left" ? 0 : `calc(100% - ${ISLAND_WIDTH}px)`,
                transform: travelerTransform(held.body, from),
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
