"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ExternalLink, ListChecks, Maximize2, Minimize2, Plus, Trash2, X } from "lucide-react";
import { japanPreparationLinks, predepartureSchema, todoCategories, type Predeparture, type TodoCategory } from "@/lib/predeparture";
import "./predeparture-todo.css";
import { TripImageList } from "./trip-image-list";

export function PredepartureTodoButton({ onOpen }: { onOpen: (trigger: HTMLButtonElement) => void }) {
  return <button type="button" className="predeparture-trigger" onClick={event => onOpen(event.currentTarget)}><ListChecks size={16} />출국 전날 Todo</button>;
}

export function PredepartureTodo({ tripId, date, host, onClose }: { tripId: string; date: string; host: HTMLElement | null; onClose: (all?: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Predeparture | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0), [title, setTitle] = useState(""), [category, setCategory] = useState<TodoCategory>("packing");
  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  const close = useCallback((all = false) => {
    if (busy) return;
    if ((dirty || title.trim()) && !window.confirm("저장하지 않은 Todo 변경사항을 취소하고 닫을까요?")) return;
    dialog.current?.close(); onClose(all);
  }, [busy,dirty,title,onClose]);
  useEffect(() => {
    if (expanded) return;
    const escape = (event: KeyboardEvent) => { if(event.key === "Escape" && !document.querySelector("dialog[open]")) { event.preventDefault(); close(); } };
    document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);
  },[expanded,close]);
  useEffect(() => {
    const element = dialog.current;
    if (!expanded || !element) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element.showModal();
    return () => { element.close(); document.body.style.overflow = previous; };
  }, [expanded, host]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/trips/${tripId}/predeparture`, { cache: "no-store", signal: controller.signal });
        const value = await response.json(); if (!response.ok) throw new Error(value.error || "Todo를 불러오지 못했어요.");
        const next = predepartureSchema.parse(value);
        setDraft(next); setSaved(JSON.stringify(next)); setError(""); setConflict(false);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Todo를 불러오지 못했어요."); }
    }
    void load(); return () => controller.abort();
  }, [tripId, attempt]);
  async function save() {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/trips/${tripId}/predeparture`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const value = await response.json(); setConflict(response.status === 409);
      if (!response.ok) throw new Error(value.error || "저장하지 못했어요. 다시 시도해 주세요.");
      predepartureSchema.parse(value); dialog.current?.close(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const completed = draft?.items.filter(item => item.done).length ?? 0;
  const content = <>
    <header><div><p>DAY 0 · {date}</p><h2 id={titleId}>출국 전날 Todo</h2></div><div className="predeparture-window-actions"><button type="button" aria-label="전체 일정 보기" disabled={busy} onClick={() => close(true)}><ArrowLeft size={18} /></button><button type="button" aria-label={expanded ? "Todo 작게 보기" : "Todo 크게 보기"} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button><button type="button" aria-label="Todo 닫기" disabled={busy} onClick={() => close()}><X size={20} /></button></div></header>
    <div className="predeparture-body">
      <p className="predeparture-help">챙길 물건부터 비자·예약 확인까지, 미리 준비해 두세요. 비자 등 시간이 필요한 절차는 출국 전날보다 먼저 확인하세요.</p>
      <TripImageList tripId={tripId} />
      {error && <div className="predeparture-error" role="alert"><p>{error}</p>{(!draft || conflict) && <button type="button" onClick={() => {
        if (dirty && !window.confirm("작성한 변경사항을 취소하고 최신 목록을 불러올까요?")) return;
        setDraft(null); setTitle(""); setError(""); setAttempt(value => value + 1);
      }}>{conflict ? "최신 목록 불러오기" : "다시 불러오기"}</button>}</div>}
      {!draft && !error && <p role="status">Todo를 불러오는 중…</p>}
      {draft && <>
        <p className="predeparture-progress" role="status">{completed} / {draft.items.length}개 완료</p>
        <progress value={completed} max={Math.max(draft.items.length, 1)} aria-label="출국 준비 진행률" />
        {(Object.entries(todoCategories) as [TodoCategory, string][]).map(([key, label]) => <section key={key}>
          <h3>{label}</h3><ul>{draft.items.filter(item => item.category === key).map(item => <li key={item.id}>
            <label><input type="checkbox" checked={item.done} disabled={busy} onChange={() => setDraft({ ...draft, items: draft.items.map(row => row.id === item.id ? { ...row, done: !row.done } : row) })} /><span data-done={item.done}>{item.title}</span></label>
            <button type="button" aria-label={`${item.title} 삭제`} disabled={busy} onClick={() => setDraft({ ...draft, items: draft.items.filter(row => row.id !== item.id) })}><Trash2 size={15} /></button>
          </li>)}</ul>
          {!draft.items.some(item => item.category === key) && <p className="predeparture-help">아래에서 필요한 항목을 추가해 보세요.</p>}
        </section>)}
        <form className="predeparture-add" onSubmit={event => { event.preventDefault(); if (!title.trim() || busy || draft.items.length >= 100) return; setDraft({ ...draft, items: [...draft.items, { id: crypto.randomUUID(), title: title.trim(), category, done: false }] }); setTitle(""); }}>
          <label>분류<select aria-label="분류" value={category} disabled={busy} onChange={event => setCategory(event.target.value as TodoCategory)}>{Object.entries(todoCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>새 할 일<input value={title} disabled={busy} maxLength={200} placeholder="예: 여행자보험 가입" onChange={event => setTitle(event.target.value)} /></label>
          <button type="submit" disabled={busy || !title.trim() || draft.items.length >= 100}><Plus size={16} />추가</button>
        </form>
        {draft.items.length >= 100 && <p className="predeparture-help">항목은 최대 100개까지 저장할 수 있어요.</p>}
      </>}
      <section className="predeparture-japan"><h3>일본 여행 공식 사이트</h3><p>비자 안내와 입국·세관 사전 등록을 각각 확인하세요.</p>{japanPreparationLinks.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"><span>{link.title}<small>{link.description}</small></span><ExternalLink size={16} /></a>)}</section>
    </div>
    <footer><p>{title.trim() ? "입력한 할 일은 ‘추가’를 누른 뒤 저장해 주세요." : "저장한 Todo는 다른 기기에서도 이어서 볼 수 있어요."}</p><button type="button" disabled={!draft || busy || conflict || Boolean(title.trim())} onClick={() => void save()}>{busy ? "저장 중…" : "저장하고 닫기"}</button></footer>
  </>;
  if (!host) return null;
  return createPortal(expanded ? <dialog ref={dialog} className="predeparture-modal" data-expanded="true" aria-labelledby={titleId} data-lenis-prevent onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}>{content}</dialog>
    : <section className="predeparture-modal" data-inline="true" role="region" aria-labelledby={titleId} data-lenis-prevent data-no-day-swipe>{content}</section>, expanded ? document.body : host);
}
