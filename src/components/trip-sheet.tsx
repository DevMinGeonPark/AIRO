"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

export type TripSheetSize = "peek" | "half" | "full";
const SIZES: TripSheetSize[] = ["peek", "half", "full"];
const HEIGHTS = { peek: 24, half: 55, full: 96 };
const LABELS = { peek: "지도 중심", half: "지도와 일정", full: "일정 펼침" };

export function useTripSheet() {
  const [size, setSize] = useState<TripSheetSize>("half");
  const [drag, setDrag] = useState(0);
  const origin = useRef<{ y: number; at: number; height: number; delta: number } | null>(null);
  function down(event: PointerEvent<HTMLDivElement>) {
    origin.current = { y: event.clientY, at: performance.now(), height: event.currentTarget.parentElement?.parentElement?.clientHeight ?? window.innerHeight, delta: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    origin.current.delta = event.clientY - origin.current.y;
    setDrag(origin.current.delta);
  }
  function up() {
    const initial = origin.current;
    origin.current = null;
    setDrag(0);
    if (!initial) return;
    const delta = initial.delta;
    if (Math.abs(delta) < 4) { setSize(size === "full" ? "half" : "full"); return; }
    if (Math.abs(delta) > 40 && performance.now() - initial.at < 300) {
      setSize(SIZES[Math.max(0, Math.min(2, SIZES.indexOf(size) + (delta > 0 ? -1 : 1)))]);
      return;
    }
    const target = HEIGHTS[size] - delta / initial.height * 100;
    setSize(SIZES.reduce((best, next) => Math.abs(HEIGHTS[next] - target) < Math.abs(HEIGHTS[best] - target) ? next : best));
  }
  const style = { "--trip-sheet-height": `clamp(112px, calc(${HEIGHTS[size]}% - ${drag}px), 96%)` } as CSSProperties;
  const handle = <div className="trip-sheet-handle" role="separator" tabIndex={0}
    aria-label="일정 시트 크기 조절" aria-orientation="horizontal" aria-valuemin={24} aria-valuemax={96}
    aria-valuenow={HEIGHTS[size]} aria-valuetext={LABELS[size]} aria-controls="trip-itinerary"
    onPointerDown={down} onPointerMove={move} onPointerUp={up}
    onPointerCancel={() => { origin.current = null; setDrag(0); }}
    onKeyDown={event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") setSize("peek");
      else if (event.key === "End") setSize("full");
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") setSize(SIZES[Math.max(0, Math.min(2, SIZES.indexOf(size) + (event.key === "ArrowUp" ? 1 : -1)))]);
      else setSize(size === "full" ? "half" : "full");
    }}><span /><span className="sr-only">{LABELS[size]}</span></div>;
  function padding(requested = size, detail = false) {
    if (window.matchMedia("(min-width: 1024px)").matches) return { top: 70, left: 70, right: 70, bottom: detail ? 230 : 70 };
    const stage = document.querySelector(".trip-workspace .workspace-panes")?.clientHeight ?? window.innerHeight;
    return { top: 52, left: 36, right: 64, bottom: Math.min(stage * .72, Math.max(112, stage * HEIGHTS[requested] / 100) + (detail ? 140 : 20)) };
  }
  return { size, setSize, style, dragging: drag !== 0, handle, padding };
}
