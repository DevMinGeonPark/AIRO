"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, Loader2, X } from "lucide-react";
import { MapMarker, MarkerContent } from "./ui/map";

export type CurrentPosition = { lng: number; lat: number; accuracy: number };

/** A user-requested fix, independent of itinerary completion tracking. */
export function CurrentLocationControl({ onRequest, onLocate }: {
  onRequest: () => void; onLocate: (point: CurrentPosition) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [point, setPoint] = useState<CurrentPosition | null>(null);
  const request = useRef({ pending: false, generation: 0 });
  const callbacks = useRef({ onRequest, onLocate });
  useEffect(() => { callbacks.current = { onRequest, onLocate }; }, [onRequest, onLocate]);
  useEffect(() => {
    const tracker = request.current;
    const cancel = () => { if (document.hidden) { tracker.generation++; tracker.pending = false; setBusy(false); } };
    document.addEventListener("visibilitychange", cancel);
    return () => { tracker.generation++; tracker.pending = false; document.removeEventListener("visibilitychange", cancel); };
  }, []);
  function locate() {
    const tracker = request.current;
    if (tracker.pending) return;
    setError(""); setPoint(null); callbacks.current.onRequest();
    if (!navigator.geolocation) { setError("이 브라우저는 현재 위치를 지원하지 않아요."); return; }
    tracker.pending = true; setBusy(true);
    const ticket = ++tracker.generation;
    const fail = (code: number) => {
      if (tracker.generation !== ticket) return;
      tracker.pending = false; setBusy(false);
      setError(code === 1 ? "위치 권한이 꺼져 있어요. 브라우저의 사이트 설정에서 위치를 허용해 주세요."
        : code === 3 ? "위치를 확인하는 데 시간이 걸려요. 다시 눌러 주세요." : "현재 위치를 찾지 못했어요. 기기의 위치 설정을 확인해 주세요.");
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (tracker.generation !== ticket || document.hidden) return;
        const { longitude: lng, latitude: lat, accuracy } = position.coords;
        if (![lng, lat, accuracy].every(Number.isFinite) || Math.abs(lng) > 180 || Math.abs(lat) > 90 || accuracy < 0) { fail(2); return; }
        const next = { lng, lat, accuracy };
        tracker.pending = false; setBusy(false); setPoint(next); callbacks.current.onLocate(next);
      }, error => fail(error.code), { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
    } catch { fail(2); }
  }
  return <>
    <div className="current-location-control">
      <button type="button" onClick={locate} disabled={busy} aria-label="현재 위치" title="현재 위치" aria-busy={busy}
        className="ml-auto flex size-12 items-center justify-center rounded-full border bg-card shadow-md disabled:opacity-60">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
      </button>
      {busy && <p role="status" className="mt-2 rounded-lg border bg-card p-2 text-xs shadow">현재 위치 확인 중…</p>}
      {error && <div role="alert" className="mt-2 flex max-w-64 items-start gap-1 rounded-xl border bg-card p-3 text-xs shadow">
        <p>{error}</p><button type="button" aria-label="위치 안내 닫기" className="flex min-h-11 min-w-11 items-center justify-center" onClick={() => setError("")}><X size={16} /></button>
      </div>}
    </div>
    {point && <MapMarker longitude={point.lng} latitude={point.lat}><MarkerContent>
      <span role="img" aria-label="현재 위치 표시" className="block size-5 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_7px_#3b82f633]" />
    </MarkerContent></MapMarker>}
  </>;
}
