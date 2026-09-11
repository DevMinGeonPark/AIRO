"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MapRef } from "./ui/map";
import type { Stop } from "@/lib/types";
import { bounds } from "@/lib/geo";
import { measurePath, playbackLegs, pointOnPath, type PlaybackRoad, type TripPoint } from "@/lib/trip-playback";

type MovingPoint = { position: TripPoint; heading: number; flight: boolean };

function pause(ms: number, signal: AbortSignal) {
  return new Promise<boolean>(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(!signal.aborted); };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function useTripPlayback({ stops, roads, mapRef, onSelect, onStart, padding }: {
  stops: Stop[]; roads: PlaybackRoad[]; mapRef: RefObject<MapRef | null>;
  onSelect: (id: string) => void; onStart: () => void;
  padding: () => { top: number; right: number; bottom: number; left: number };
}) {
  const [playing, setPlaying] = useState(false);
  const [point, setPoint] = useState<MovingPoint | null>(null);
  const current = useRef<AbortController | null>(null);
  const plan = useMemo(() => playbackLegs(stops, roads), [stops, roads]);
  const signature = JSON.stringify(stops.map(stop => [stop.id, stop.lng, stop.lat, stop.day, stop.mode]));
  const stop = useCallback(() => {
    if (current.current) {
      current.current.abort();
      current.current = null;
      mapRef.current?.stop();
    }
  }, [mapRef]);
  useEffect(() => stop, [signature, stop]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => { if (preference.matches) stop(); };
    const hide = () => { if (document.hidden) stop(); };
    preference.addEventListener("change", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => { preference.removeEventListener("change", cancel); document.removeEventListener("visibilitychange", hide); };
  }, [stop]);

  async function start() {
    if (current.current) { stop(); return; }
    if (!plan.legs.length || plan.missing) return;
    onStart();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      mapRef.current?.fitBounds(bounds(stops), { padding: padding(), maxZoom: 14, animate: false });
      return;
    }
    const controller = new AbortController();
    current.current = controller;
    setPlaying(true);
    try {
      for (const leg of plan.legs) {
        if (controller.signal.aborted) break;
        onSelect(leg.from.id);
        mapRef.current?.fitBounds(bounds(leg.path.map(([lng, lat]) => ({ lng, lat }))), { padding: padding(), maxZoom: 15, duration: 650 });
        if (!await pause(700, controller.signal)) break;
        const distances = measurePath(leg.path);
        const duration = Math.min(4200, Math.max(1600, distances.at(-1)! * .012));
        await new Promise<void>(resolve => {
          const began = performance.now();
          let frame = 0;
          const finish = () => { cancelAnimationFrame(frame); controller.signal.removeEventListener("abort", finish); resolve(); };
          const tick = (now: number) => {
            if (controller.signal.aborted) { finish(); return; }
            const t = Math.min(1, (now - began) / duration);
            const eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            setPoint({ ...pointOnPath(leg.path, distances, eased), flight: leg.flight });
            if (t < 1) frame = requestAnimationFrame(tick); else finish();
          };
          controller.signal.addEventListener("abort", finish, { once: true });
          frame = requestAnimationFrame(tick);
        });
        if (controller.signal.aborted) break;
        onSelect(leg.to.id);
        if (!await pause(350, controller.signal)) break;
      }
    } finally {
      if (current.current === controller || !current.current) {
        current.current = null;
        setPlaying(false);
        setPoint(null);
      }
    }
  }
  return { playing, point, start, stop, ready: plan.legs.length > 0 && plan.missing === 0, missing: plan.missing };
}
