"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressWriteQueue } from "@/lib/progress-queue";
import type { Stop } from "@/lib/types";
import { automaticCandidates, itineraryProgressSchema, type ItineraryProgress, type ProgressAction, type ProgressPosition } from "@/lib/itinerary-progress";

export function useTripProgress(tripId: string, stops: Stop[], startDate: string | null) {
  const [data, setData] = useState<ItineraryProgress | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [tracking, setTracking] = useState(false), [locationStatus, setLocationStatus] = useState("");
  const configured = data?.rules.some(rule => rule.mode === "location" || rule.mode === "either") ?? false;
  const writer = useRef<ProgressWriteQueue | null>(null);
  const location = useRef<ProgressPosition | undefined>(undefined), schedule = useRef({ stops, startDate }), tick = useRef<() => void>(() => {});
  useEffect(() => { schedule.current = { stops, startDate }; }, [stops, startDate]);
  const change = useCallback((action: ProgressAction) => writer.current?.submit([action]) ?? Promise.resolve(false), []);
  const changeMany = useCallback((actions: ProgressAction[]) => writer.current?.submit(actions) ?? Promise.resolve(false), []);
  const load = useCallback(() => writer.current?.refresh(), []);
  useEffect(() => {
    const request = async (action?: ProgressAction, revision?: number) => {
      const response = await fetch(`/api/trips/${tripId}/progress`, action ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...action, revision }) } : { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw Object.assign(new Error(value.error || "진행 상태를 저장하지 못했어요."), { status: response.status });
      return itineraryProgressSchema.parse(value);
    };
    const queue = new ProgressWriteQueue({ read: () => request(), write: request, schedule: () => schedule.current,
      changed: (value, busy, error) => { setData(value); setBusy(busy); setError(error); },
      idle: () => queueMicrotask(() => tick.current()),
    });
    writer.current = queue;
    const refresh = () => { if (!document.hidden) void queue.refresh(); };
    const initial = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60000);
    return () => { queue.dispose(); if (writer.current === queue) writer.current = null; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); clearTimeout(initial); clearInterval(timer); };
  }, [tripId]);
  useEffect(() => {
    const evaluate = () => {
      const queue = writer.current;
      if (document.hidden || !queue?.value || queue.busy || Date.now() < queue.retryAt) return;
      const { stops, startDate } = schedule.current;
      if (automaticCandidates(queue.value, stops, startDate, Date.now(), location.current).length)
        void queue.submit([{ action: "automatic", ...(location.current ? { position: location.current } : {}) }]);
    };
    tick.current = evaluate;
    const timer = setInterval(evaluate, 1000);
    document.addEventListener("visibilitychange", evaluate); window.addEventListener("focus", evaluate);
    return () => { tick.current = () => {}; clearInterval(timer); document.removeEventListener("visibilitychange", evaluate); window.removeEventListener("focus", evaluate); };
  }, []);
  useEffect(() => {
    if (!tracking || !configured || !navigator.geolocation) return;
    let watch: number | undefined, generation = 0;
    const stop = () => { ++generation; if (watch !== undefined) navigator.geolocation.clearWatch(watch); watch = undefined; location.current = undefined; };
    const start = () => {
      stop();
      if (document.hidden) { setLocationStatus("화면으로 돌아오면 위치 체크를 재개합니다."); return; }
      setLocationStatus("위치를 확인하는 중…");
      const ticket = generation;
      watch = navigator.geolocation.watchPosition(position => {
        if (document.hidden || ticket !== generation) return;
        location.current = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp };
        setLocationStatus(position.coords.accuracy > 100 ? "위치 오차가 커요. 더 정확한 위치를 기다립니다." : `위치 체크 중 · 오차 약 ${Math.round(position.coords.accuracy)}m`);
        tick.current();
      }, failure => {
        if (ticket !== generation) return;
        location.current = undefined;
        setLocationStatus(failure.code === 1 ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 직접 체크해 주세요." : "위치를 확인하지 못했어요. 위치 확인을 기다리거나 직접 체크해 주세요.");
        if (failure.code === 1) setTracking(false);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    };
    start(); document.addEventListener("visibilitychange", start);
    return () => { stop(); document.removeEventListener("visibilitychange", start); };
  }, [tracking, configured, tripId]);
  function toggleTracking() {
    if (tracking) { setTracking(false); setLocationStatus("위치 자동 체크를 멈췄습니다."); return; }
    if (!navigator.geolocation) { setLocationStatus("이 브라우저는 위치 확인을 지원하지 않아요."); return; }
    setTracking(true);
  }
  return { data, busy, error, change, changeMany, reload: load, tracking: tracking && configured, locationStatus, toggleTracking, startTracking: () => { if (navigator.geolocation) setTracking(true); else setLocationStatus("이 브라우저는 위치 확인을 지원하지 않아요."); } };
}
export type TripProgressController = ReturnType<typeof useTripProgress>;
