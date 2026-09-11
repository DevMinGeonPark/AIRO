"use client";

import type { KeyboardEvent } from "react";

export function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number, select: (index: number) => void) {
  const next = event.key === "ArrowRight" ? (index + 1) % count : event.key === "ArrowLeft" ? (index + count - 1) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
  if (next === null) return;
  event.preventDefault(); select(next);
  (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
}

export function DayTabs({ day, onChange, id, label }: { day: number; onChange: (day: number) => void; id: string; label: string }) {
  return <div className="lower-day-tabs" role="tablist" aria-label={label}>{[0, 1, 2].map(index => <button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={day === index} tabIndex={day === index ? 0 : -1} onClick={() => onChange(index)} onKeyDown={event => tabKey(event, index, 3, onChange)}>DAY 0{index + 1}</button>)}</div>;
}

