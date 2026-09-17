"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";
import type { Place } from "@/lib/types";

export type Bias = { near?: { lat: number; lng: number }; bbox?: number[] };

export function PlaceSearch({
  tripId,
  days,
  defaultDay,
  getBias,
  onPreview,
  onAdded,
  onOpen,
  onLocate,
  canSave = false,
}: {
  tripId: string;
  days: number[];
  defaultDay: number;
  /** 검색 시점의 지도 뷰포트 — "이 근처"가 먼저 나오게 한다. */
  getBias: () => Bias;
  onPreview: (place: Place | null) => void;
  onAdded: () => void | Promise<void>;
  onOpen?: () => void;
  onLocate?: (place: Place) => void;
  canSave?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const dayRef = useRef<HTMLSelectElement>(null);

  async function search(value = query) {
    const q = value.trim();
    if (!q || busy) return;
    onOpen?.();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, ...getBias(), limit: 10 }),
      });
      const data = (await res.json()) as {
        places: Place[];
        source: string;
        reason?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "장소를 검색하지 못했습니다. 다시 시도해 주세요.");
      setPlaces(data.places);
      if (!data.places.length) setNote(data.reason ?? "결과가 없습니다.");
    } catch (err) {
      setPlaces([]);
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function add(place: Place) {
    if (adding || saving) return;
    setAdding(place.id);
    setNote(null);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: place.name,
          lng: place.lng,
          lat: place.lat,
          day: Number(dayRef.current?.value ?? defaultDay),
          map_query: place.name,
          note: place.address || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "일정에 추가하지 못했습니다. 다시 시도해 주세요.");
      }
      await onAdded();
      onPreview(null);
      setNote(`${place.name}을 일정에 추가했습니다.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "일정에 추가하지 못했습니다.");
    } finally {
      setAdding(null);
    }
  }

  async function bookmark(place: Place) {
    if (saving || adding) return;
    setSaving(place.id); setNote(null);
    try {
      const response = await fetch(`/api/trips/${tripId}/places`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...place, day: Number(dayRef.current?.value ?? defaultDay) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "장소를 저장하지 못했습니다.");
      setNote(`${place.name}을 여행 자료의 즐겨찾기에 저장했습니다.`);
    } catch (error) { setNote(error instanceof Error ? error.message : "장소를 저장하지 못했습니다."); }
    finally { setSaving(null); }
  }

  const dayOptions = days.length ? days : [1];
  const newDay = Math.max(...dayOptions) + 1;

  return (
    <div className="shrink-0 space-y-2.5">
      {/* 입력과 버튼을 한 덩어리로 — 랜딩의 알약 폼과 같은 모양 */}
      <form
        onSubmit={event => { event.preventDefault(); void search(); }}
        className="bg-background focus-within:border-foreground/30 flex h-12 items-center rounded-full border pl-3.5 lg:h-10 transition-colors"
      >
        <svg viewBox="0 0 16 16" aria-hidden className="text-muted-foreground size-3.5 shrink-0">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소 검색 (예: ラーメン, 수족관)"
          aria-label="장소 검색"
          className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none lg:h-auto"
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !query.trim()}
          className="m-0.5 h-10 shrink-0 rounded-full px-4 lg:h-8"
        >
          {busy ? "…" : "검색"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5" aria-label="주변 장소 찾기">
        {[["음식점", "맛집"], ["카페", "카페"], ["호텔", "숙소"]].map(([value, label]) =>
          <button type="button" key={value} disabled={busy} onClick={() => { setQuery(value); void search(value); }} className="min-h-9 rounded-full border px-3 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50">주변 {label}</button>)}
      </div>

      {places !== null && (
        <div className="bg-background overflow-hidden rounded-xl border">
          <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2 text-xs">
            <span className="text-muted-foreground flex-1">결과 {places.length}건</span>
            <label className="text-muted-foreground flex items-center gap-1.5">
              담을 곳
              <span className="relative">
                <select
                  key={defaultDay}
                  ref={dayRef}
                  defaultValue={String(defaultDay)}
                  aria-label="담을 일차"
                  className="text-foreground hover:border-foreground/30 appearance-none rounded-full border bg-transparent py-1 pr-6 pl-2.5 text-xs transition-colors outline-none"
                >
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>
                      Day {d}
                    </option>
                  ))}
                  <option value={newDay}>Day {newDay} (새로)</option>
                </select>
                <svg
                  viewBox="0 0 10 6"
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-2 -translate-y-1/2"
                >
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
            </label>
            <button
              onClick={() => {
                setPlaces(null);
                onPreview(null);
              }}
              className="text-muted-foreground hover:text-foreground -my-2 -mr-2 grid size-11 place-items-center"
              aria-label="검색 결과 닫기"
            >
              ✕
            </button>
          </div>

          <ul className="place-results max-h-72 overflow-y-auto">
            {places.map((p) => (
              <li
                key={p.id}
                onMouseEnter={() => onPreview(p)}
                className="hover:bg-muted/50 flex items-start gap-2 border-b px-3 py-2.5 transition-colors last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <button type="button" onClick={() => (onLocate ?? onPreview)(p)} className="truncate text-left text-sm font-medium underline-offset-4 hover:underline">{p.name}</button>
                    <span className="text-muted-foreground shrink-0 rounded-full border px-1.5 text-[10px]">
                      {p.category}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 truncate text-xs">
                    {p.address}
                  </div>
                </div>
                {canSave && <button type="button" className="grid min-h-11 min-w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-primary disabled:opacity-50" aria-label={`${p.name} 즐겨찾기에 저장`} disabled={saving !== null || adding !== null} onClick={() => void bookmark(p)}><Bookmark size={15} /></button>}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={adding !== null || saving !== null}
                  onClick={() => add(p)}
                  className="h-7 shrink-0 rounded-full px-3 text-xs max-lg:min-h-11"
                >
                  {adding === p.id ? "…" : "추가"}
                </Button>
              </li>
            ))}
          </ul>
          {note && <p role="status" className="text-muted-foreground px-3 py-3 text-xs">{note}</p>}
        </div>
      )}
    </div>
  );
}
