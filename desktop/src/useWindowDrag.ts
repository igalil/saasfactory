import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { api } from "./api";
import type { WindowPoint } from "../../src/desktop/shared";

/** Pointer capture keeps an edge-constrained drag alive outside the narrow window. */
export function useWindowDrag(
  onTap: () => void,
  onError: (error: unknown) => void,
  enabled = true,
) {
  const pointer = useRef<number | null>(null);
  const element = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);
  const latestPoint = useRef<WindowPoint>({ x: 0, y: 0 });
  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const cancel = () => {
    cancelFrame();
    const id = pointer.current;
    pointer.current = null;
    if (id !== null) {
      if (element.current?.hasPointerCapture(id))
        element.current.releasePointerCapture(id);
      void api.endWindowDrag().catch(() => {});
    }
  };
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled]);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);

  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    cancelFrame();
    void api
      .endWindowDrag(
        cancelled ? undefined : { x: event.screenX, y: event.screenY },
      )
      .then((moved) => {
        if (!cancelled && !moved) onTap();
      })
      .catch(onError);
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (
        !enabled ||
        event.button !== 0 ||
        !event.isPrimary ||
        pointer.current !== null
      )
        return;
      const control = (event.target as HTMLElement).closest(
        "button, a, input, textarea, select",
      );
      if (control && control !== event.currentTarget) return;
      pointer.current = event.pointerId;
      element.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
      void api
        .beginWindowDrag({ x: event.screenX, y: event.screenY })
        .catch(onError);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (pointer.current !== event.pointerId) return;
      latestPoint.current = { x: event.screenX, y: event.screenY };
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        void api.moveWindowDrag(latestPoint.current).catch(onError);
      });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) =>
      end(event, true),
  };
}
