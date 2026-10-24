"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Copy, X } from "lucide-react";
import { notePins, notePreview } from "@/lib/place-note";
import "./place-note.css";

export function PlaceNote({ name, note }: { name: string; note: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pins = notePins(note);
  return <section className="place-note-preview" aria-label={`${name} 메모`}>
    <button ref={trigger} type="button" className="place-note-open" onClick={() => setOpen(true)} aria-label={`${name} 메모 펼치기`}>
      <span className="place-note-label">{pins.length ? "PIN · 메모" : "메모"}</span><span className="place-note-expand">펼치기 <ChevronRight size={16} /></span>
      {pins.length > 0 && <span className="place-note-pin-preview">{pins[0].value}{pins.length > 1 && <small>외 {pins.length - 1}개</small>}</span>}
      <span className="place-note-excerpt">{notePreview(note).join("\n")}</span>
    </button>
    {open && createPortal(<NotePanel name={name} note={note} onClose={() => {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    }} />, document.body)}
  </section>;
}

function NotePanel({ name, note, onClose }: { name: string; note: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value); setError(false); }
    catch { setError(true); }
  }
  const pins = notePins(note);
  return <dialog ref={dialog} className="place-note-dialog" aria-labelledby={titleId} onClose={() => { if (!dialog.current?.open) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="place-note-panel">
      <header><div><p>장소 메모</p><h2 id={titleId}>{name}</h2></div><button type="button" aria-label="메모 닫기" onClick={() => dialog.current?.close()} autoFocus><X size={22} /></button></header>
      <div className="place-note-body" tabIndex={0} role="region" aria-label="메모 전체 내용">
        {pins.length > 0 && <section className="place-note-pins" aria-label="PIN 및 출입 코드">{pins.map((pin, index) => <div className="place-note-pin" key={index}>
          <p>{pin.label}</p><strong>{pin.value}</strong>
          <button type="button" onClick={() => copy(pin.value)}><Copy size={16} /> {copied === pin.value ? "복사됨" : "PIN 복사"}</button>
        </div>)}</section>}
        <div role="status" className="place-note-copy-status">{error ? "복사하지 못했어요. 코드를 길게 눌러 복사해 주세요." : copied ? "PIN을 복사했어요." : ""}</div>
        <section className="place-note-original"><h3>전체 메모</h3>{note.split(/\r?\n\s*\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
      </div>
    </div>
  </dialog>;
}
