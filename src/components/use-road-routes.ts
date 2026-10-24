"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveData } from "@/lib/archive";
import type { Stop } from "@/lib/types";
import { routablePair } from "@/lib/stop-choices";
import type { RoadRoute } from "@/lib/road-routing";

const keyOf = (a: Stop, b: Stop) => `${a.id}:${a.lng},${a.lat}>${b.id}:${b.lng},${b.lat}`;

export function useRoadRoutes(tripId: string, stops: Stop[], imported: ArchiveData["routes"]) {
  const cache = useRef<Record<string, RoadRoute>>({});
  const [generated, setGenerated] = useState<Record<string, RoadRoute>>({});
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const pairs = useMemo(() => stops.flatMap((to, index) => {
    const from = stops[index - 1];
    if (!from || !routablePair(from, to) || to.mode === "flight" || (from.lng === to.lng && from.lat === to.lat)) return [];
    const saved = from.source_id && to.source_id ? imported[`${from.source_id}->${to.source_id}`] : undefined;
    const matches = saved && Math.hypot(saved.coordinates[0][0] - from.lng, saved.coordinates[0][1] - from.lat) < .002 && Math.hypot(saved.coordinates.at(-1)![0] - to.lng, saved.coordinates.at(-1)![1] - to.lat) < .002;
    return [{ from, to, key: keyOf(from, to), saved: matches ? saved : undefined }];
  }), [stops, imported]);
  const plan = JSON.stringify(pairs.map(({ from, to, key, saved }) => ({ fromId: from.id, toId: to.id, key, saved: Boolean(saved) })));
  useEffect(() => {
    const requests = (JSON.parse(plan) as { fromId: string; toId: string; key: string; saved: boolean }[]).filter(pair => !pair.saved && !cache.current[pair.key]);
    const controller = new AbortController();
    const run = async () => {
      setStatus(requests.length ? "loading" : "idle");
      let failed = false;
      for (const pair of requests) {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(`/api/trips/${tripId}/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId: pair.fromId, toId: pair.toId }), signal: controller.signal });
          if (!response.ok) throw new Error("Route unavailable");
          const route = await response.json() as RoadRoute;
          if (controller.signal.aborted) return;
          cache.current[pair.key] = route;
          setGenerated(value => ({ ...value, [pair.key]: route }));
        } catch { if (!controller.signal.aborted) failed = true; }
      }
      if (!controller.signal.aborted) setStatus(failed ? "unavailable" : "idle");
    };
    void run();
    return () => controller.abort();
  }, [tripId, plan, retry]);
  const routes = useMemo(() => pairs.flatMap(({ from, to, key, saved }) => {
    const route = saved ?? generated[key];
    return route ? [{ id: `${from.id}->${to.id}`, ...route }] : [];
  }), [pairs, generated]);
  return { routes, status, retry: () => setRetry(value => value + 1) };
}
