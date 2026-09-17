"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import type { Stop } from "@/lib/types";
export function StopEditor({ tripId, stop, defaults, onSaved, onClose }: {
  tripId: string; stop?: Stop;
  /** 새 일정의 기본 일차·순서. 보고 있던 날의 맨 뒤에 붙는다. */
  defaults?: { day: number; position: number };
  onSaved: () => Promise<void>; onClose: () => void;
}) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const form = new FormData(e.currentTarget);
    const body = { name: form.get("name"), day: Number(form.get("day")), time: form.get("time") || null,
      lng: Number(form.get("lng")), lat: Number(form.get("lat")), note: form.get("note") || null,
      map_query: form.get("map_query") || null, mode: form.get("mode"), position: Number(form.get("position")) };
    setBusy(true); setError("");
    try {
      const url = `/api/trips/${tripId}${stop ? `/stops/${stop.id}` : ""}`;
      const res = await fetch(url, { method: stop ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      await onSaved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!stop || !window.confirm(`‘${stop.name}’ 일정을 삭제할까요?`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/trips/${tripId}/stops/${stop.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      await onSaved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const coordinates = <>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs">위도<Input name="lat" type="number" inputMode="decimal" step="any" min={-90} max={90} required defaultValue={stop?.lat} /></label><label className="text-xs">경도<Input name="lng" type="number" inputMode="decimal" step="any" min={-180} max={180} required defaultValue={stop?.lng} /></label></div>
    <label className="block text-xs">현지 이름·지도 검색어<Input name="map_query" defaultValue={stop?.map_query ?? ""} /></label>
  </>;
  return <form onSubmit={submit} className="stop-editor space-y-3 rounded-xl border bg-background p-4">
    <h2 className="font-semibold">{stop ? "일정 수정" : "일정 직접 추가"}</h2>
    <label className="block text-xs">장소 이름<Input name="name" defaultValue={stop?.name} required maxLength={300} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs">일차 (전날은 0)<Input name="day" type="number" inputMode="numeric" min={0} max={3650} defaultValue={stop?.day ?? defaults?.day ?? 1} required /></label><label className="text-xs">시간<Input name="time" defaultValue={stop?.time ?? ""} placeholder="오전 / 09:00" /></label></div>
    <label className="block text-xs">메모<Textarea name="note" defaultValue={stop?.note ?? ""} rows={3} /></label>
    {/* 기존 장소는 좌표가 이미 있으니 접어 둔다. 새 장소는 좌표가 필수라 펼친다. */}
    {stop ? <details className="stop-editor-coords space-y-3 rounded-lg border px-3 py-2 text-xs"><summary className="cursor-pointer py-1 font-medium">좌표·지도 검색어</summary>{coordinates}</details> : coordinates}
    <div className="grid grid-cols-2 gap-2"><label className="text-xs">도착 수단<select name="mode" defaultValue={stop?.mode ?? "ground"} className="mt-1 block min-h-11 w-full rounded-md border bg-background p-2"><option value="ground">지상·해상</option><option value="flight">항공</option></select></label><label className="text-xs">하루 안 순서 (0부터)<Input name="position" type="number" inputMode="numeric" min={0} defaultValue={stop?.position ?? defaults?.position ?? 0} required /></label></div>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>저장</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>닫기</Button>{stop && <Button type="button" variant="ghost" disabled={busy} onClick={remove}>삭제</Button>}</div>
  </form>;
}
