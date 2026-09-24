import { useLayoutEffect, useRef, type ReactNode } from "react";
import { api } from "./api";
import type { WindowState } from "../../src/desktop/shared";
import {
  ISLAND_FLIGHT_MS,
  ISLAND_RETURN_MS,
  rubberOffset,
} from "../../src/desktop/island-motion";

export function IslandSurface({
  state,
  children,
}: {
  state: WindowState;
  children: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const traveler = useRef<HTMLDivElement>(null);
  const motion = state.motion;
  const from = motion?.from ?? state.edge;
  const direction = from === "left" ? 1 : -1;
  const pull = motion?.pull ?? 0;
  const offset = rubberOffset(pull);
  const tip = offset + 16;
  const neck = 67 + pull * 14;
  const scaleX = 1 + pull * 0.22;
  const scaleY = 1 - pull * 0.07;
  // Match the traveler's scaled border box, drawing the attachment and body as
  // one silhouette so there is no internal border or mismatched fill at the join.
  const left = offset + 32 - 31.5 * scaleX;
  const right = offset + 32 + 31.5 * scaleX;
  const top = 86 - 85.5 * scaleY;
  const bottom = 86 + 85.5 * scaleY;
  const innerX = 14.5 * scaleX;
  const innerY = 14.5 * scaleY;
  const outerX = 29.5 * scaleX;
  const outerY = 29.5 * scaleY;
  const joinTop = top + 42 * scaleY;
  const joinBottom = bottom - 42 * scaleY;
  const connectedPath = `
    M 0 45
    C ${left * 0.25} 49 ${left * 0.3} ${neck} ${left * 0.55} ${neck}
    C ${left * 0.82} ${neck} ${left} ${joinTop + 16} ${left} ${joinTop}
    V ${top + innerY}
    A ${innerX} ${innerY} 0 0 1 ${left + innerX} ${top}
    H ${right - outerX}
    A ${outerX} ${outerY} 0 0 1 ${right} ${top + outerY}
    V ${bottom - outerY}
    A ${outerX} ${outerY} 0 0 1 ${right - outerX} ${bottom}
    H ${left + innerX}
    A ${innerX} ${innerY} 0 0 1 ${left} ${bottom - innerY}
    V ${joinBottom}
    C ${left} ${joinBottom - 16} ${left * 0.82} ${172 - neck} ${left * 0.55} ${172 - neck}
    C ${left * 0.3} ${172 - neck} ${left * 0.25} 123 0 127 Z
  `;

  useLayoutEffect(() => {
    if (!motion || motion.phase === "pull") return;
    let frame: number;
    let animation: Animation | undefined;
    const finish = () => {
      void api.finishIslandMotion(motion.id).catch(() => {});
    };
    const start = () => {
      if (!stage.current || !traveler.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      // The IPC message and native resize can reach Chromium in adjacent frames.
      // Wait for the strip's final viewport before measuring the flight distance.
      const width = stage.current.clientWidth;
      if (width <= 64) {
        frame = requestAnimationFrame(start);
        return;
      }
      const origin = motion.from === "left" ? 0 : width - 64;
      const sign = motion.from === "left" ? 1 : -1;
      const target = motion.from === "left" ? width - 64 : 0;
      const x = origin + sign * rubberOffset(motion.pull);
      const transform = (at: number, sx = 1, sy = 1) =>
        `translate3d(${at - origin}px, 0, 0) scale(${sx}, ${sy})`;
      const frames =
        motion.phase === "flight"
          ? [
              { transform: transform(x, 1.22, 0.93), offset: 0 },
              { transform: transform(x + sign * 28, 1.48, 0.74), offset: 0.12 },
              {
                transform: transform(
                  origin + (target - origin) * 0.76,
                  1.34,
                  0.78,
                ),
                offset: 0.48,
              },
              { transform: transform(target, 0.72, 1), offset: 0.73 },
              {
                transform: transform(target - sign * 12, 1.08, 0.94),
                offset: 0.86,
              },
              { transform: transform(target), offset: 1 },
            ]
          : [
              {
                transform: transform(
                  x,
                  1 + motion.pull * 0.22,
                  1 - motion.pull * 0.07,
                ),
                offset: 0,
              },
              { transform: transform(origin, 0.88, 1), offset: 0.66 },
              {
                transform: transform(origin + sign * 3, 1.03, 0.98),
                offset: 0.84,
              },
              { transform: transform(origin), offset: 1 },
            ];
      animation = traveler.current.animate(frames, {
        duration:
          motion.phase === "flight" ? ISLAND_FLIGHT_MS : ISLAND_RETURN_MS,
        easing: "cubic-bezier(.28,.05,.25,1)",
        fill: "forwards",
      });
      animation.finished
        .then(() => {
          if (!traveler.current) return;
          // Keep the final pose responsive while the native strip shrinks back to
          // 64px, so its last frame cannot jump off-screen during the IPC handoff.
          traveler.current.style.transform =
            motion.phase === "flight"
              ? `translate3d(calc(${sign} * (100vw - 64px)), 0, 0)`
              : "none";
          animation?.cancel();
          finish();
        })
        .catch(() => {});
    };
    frame = requestAnimationFrame(start);
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
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
        <svg
          className="island-tether"
          width="148"
          height="172"
          viewBox="0 0 148 172"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="gum-fill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#1a1e17" />
              <stop offset="1" stopColor="#090b09" />
            </linearGradient>
          </defs>
          <path
            d={
              motion.phase === "pull"
                ? connectedPath
                : `M 0 45 C ${tip * 0.25} 49 ${tip * 0.3} ${neck} ${tip * 0.55} ${neck} C ${tip * 0.82} ${neck} ${tip * 0.8} 38 ${tip} 32 L ${tip} 140 C ${tip * 0.8} 134 ${tip * 0.82} ${172 - neck} ${tip * 0.55} ${172 - neck} C ${tip * 0.3} ${172 - neck} ${tip * 0.25} 123 0 127 Z`
            }
          />
        </svg>
      )}
      <div
        className="island-traveler"
        ref={traveler}
        style={
          motion
            ? {
                left: from === "left" ? 0 : "calc(100% - 64px)",
                transform: `translate3d(${direction * offset}px, 0, 0) scale(${scaleX}, ${scaleY})`,
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
