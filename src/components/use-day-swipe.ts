"use client";

import { useEffect, useRef, type PointerEvent, type MouseEvent } from "react";

/** Only attached to the itinerary/card; the map and horizontal chip scroller keep their gestures. */
export function useDaySwipe(enabled: boolean, resetKey: number | null, step: (direction: 1 | -1) => void) {
  const origin = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const pointers = useRef(new Set<number>());
  const suppressClickUntil = useRef(0);
  useEffect(() => { origin.current = null; pointers.current.clear(); }, [enabled, resetKey]);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      // A fresh tap/click is intentional; only suppress the click synthesized by a drag.
      suppressClickUntil.current = 0;
      if (!enabled || event.pointerType !== "touch") return;
      pointers.current.add(event.pointerId);
      if (pointers.current.size !== 1) { origin.current = null; return; }
      if ((event.target as Element).closest("input,textarea,select,a,[contenteditable=true],[data-no-day-swipe]")) return;
      origin.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = origin.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
      if (dy > 12 && dy > dx) { origin.current = null; return; }
      if (dx > 12 && dx > dy * 1.5) {
        event.currentTarget.setPointerCapture(event.pointerId);
        suppressClickUntil.current = performance.now() + 600;
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      pointers.current.delete(event.pointerId);
      const start = origin.current;
      origin.current = null;
      if (!enabled || !start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - start.at <= 1200) {
        suppressClickUntil.current = performance.now() + 600;
        step(dx < 0 ? 1 : -1);
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) { pointers.current.delete(event.pointerId); origin.current = null; },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail !== 0 && performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
    },
  };
}
