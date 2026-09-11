"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ANIMATIONS_ENABLED } from "@/lib/animation-config";
import { useLandingMotion, usePageVisible } from "./motion-system";

const DURATION = 6_000;
const FRAME_INTERVAL = 1_000 / 30;
const subscribeReducedMotion = (notify: () => void) => {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** A single, resumable preview; scroll and background time never advance it. */
export function useRoutePreviewMotion(inView: boolean, ready: boolean) {
  const { enabled } = useLandingMotion();
  const visible = usePageVisible();
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const elapsed = useRef(0);
  const [position, setPosition] = useState(0);
  const [run, setRun] = useState(0);
  const progress = reduced || !ANIMATIONS_ENABLED ? 1 : position;
  const running = enabled && !reduced && visible && inView && ready && progress < 1;

  const replay = useCallback(() => {
    elapsed.current = 0;
    setPosition(0);
    setRun(value => value + 1);
  }, []);

  const finish = useCallback(() => {
    elapsed.current = DURATION;
    setPosition(1);
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    let published = previous;
    const tick = (now: number) => {
      elapsed.current = Math.min(DURATION, elapsed.current + now - previous);
      previous = now;
      if (now - published >= FRAME_INTERVAL || elapsed.current >= DURATION) {
        setPosition(elapsed.current / DURATION);
        published = now;
      }
      if (elapsed.current < DURATION) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, run]);

  return { progress, running, replay, finish };
}
