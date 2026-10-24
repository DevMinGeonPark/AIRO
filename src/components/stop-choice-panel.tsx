"use client";
import { useRef, useState } from "react";
import { managementRequest } from "@/lib/browser-management";
import { mapsUrl } from "@/lib/place-maps";
import type { Stop } from "@/lib/types";

export function StopChoicePanel({ tripId, stop, onSaved, onBusy }: {
  tripId: string; stop: Stop; onSaved: (stop: Stop) => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const choice = stop.choice;
  if (!choice) return null;
  async function select(candidateId: string | null) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try {
      const result = await managementRequest(`/api/trips/${tripId}/choices`, "PATCH", {
        action: "select", stopId: stop.id, revision: choice!.revision, candidateId,
      });
      await onSaved(result.stop);
    } catch (e) { setError(e instanceof Error ? e.message : "선택을 저장하지 못했어요."); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="stop-choice-panel" aria-label={`${choice.label} 후보`} aria-busy={busy}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{choice.label} · {choice.kind === "meal" ? "식사" : "선택 일정"}</h3>
      <span className="text-xs text-muted-foreground">{choice.selectedId ? "경로 확정" : `${choice.candidates.length}곳 중 선택`}</span></div>
    <ol className="mt-2 space-y-2">{choice.candidates.map((candidate, i) => <li key={candidate.id} className="rounded-lg border p-2" data-selected={choice.selectedId === candidate.id}>
      <button type="button" className="min-h-11 w-full text-left text-sm" disabled={busy} aria-pressed={choice.selectedId === candidate.id}
        onClick={() => void select(candidate.id)}><span className="text-primary">{choice.selectedId === candidate.id ? "✓" : String.fromCharCode(65 + i)}</span> {candidate.name}
        <span className="mt-1 block text-xs text-primary">{choice.selectedId === candidate.id ? "선택한 경로" : "이 장소로 경로 확정"}</span></button>
      {candidate.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{candidate.note}</p>}
      <a className="inline-flex min-h-11 items-center text-xs text-muted-foreground" target="_blank" rel="noreferrer" href={mapsUrl(candidate)}>지도에서 위치 보기 ↗</a>
    </li>)}</ol>
    {choice.selectedId && <button className="min-h-11 text-xs text-primary" disabled={busy} onClick={() => void select(null)}>선택 해제 · 다시 고르기</button>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {busy && <p role="status" className="text-xs">선택한 경로를 저장하는 중…</p>}
  </section>;
}
