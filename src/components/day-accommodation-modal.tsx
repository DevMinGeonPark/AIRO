"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Stop } from "@/lib/types";
import type { TripAttachments } from "@/lib/trip-attachments";
import { mapsUrl } from "@/lib/geo";
import { stopAttachments } from "@/lib/trip-attachments";
import { PlaceNote } from "./place-note";

export function DayAccommodationModal({ day, stays, attachments, onClose }: { day: number; stays: Stop[]; attachments: TripAttachments; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    // React Strict Mode reopens the dialog after effect cleanup; ignore that queued close event.
    const close = () => { if (!element.open) onClose(); };
    element.addEventListener("close", close);
    return () => { element.removeEventListener("close", close); if (element.open) element.close(); };
  }, [onClose]);
  return <dialog ref={dialog} className="day-accommodation-dialog" aria-labelledby="day-accommodation-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="day-accommodation-modal">
      <header><div><p className="text-xs text-muted-foreground">Day {day}</p><h2 id="day-accommodation-title">숙소 정보</h2></div><button type="button" aria-label="숙소 정보 닫기" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
      {stays.length ? <div className="day-accommodation-list">{stays.map(stay => {
        const linked = stopAttachments(stay, attachments);
        return <article key={stay.id}>
          <div className="flex items-start gap-3"><span className="day-accommodation-icon">⌂</span><div className="min-w-0 flex-1"><h3>{stay.name}</h3><p className="text-xs text-muted-foreground">{stay.time ? `${stay.time} · ` : ""}숙소</p></div></div>
          {stay.note && <PlaceNote name={stay.name} note={stay.note} />}
          <div className="mt-3 flex flex-wrap gap-2"><a href={mapsUrl(stay)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-xs">지도에서 열기 <ExternalLink size={13} /></a>{linked.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border px-3 text-xs text-primary">{link.label}</a>)}</div>
          {linked.reservations.map(reservation => <p key={reservation.id} className="mt-2 text-xs text-primary">{reservation.name} · 예약 기록</p>)}
        </article>;
      })}</div> : <p className="day-accommodation-empty">이 날에 등록된 숙소가 없습니다.</p>}
    </div>
  </dialog>;
}
