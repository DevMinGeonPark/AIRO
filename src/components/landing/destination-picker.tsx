"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCompactViewport } from "@/components/mobile-viewport";
import { Check, ChevronDown, Compass, Search, X } from "lucide-react";
import { DESTINATIONS } from "@/lib/landing-destinations";
import { REGIONS, type RegionId } from "@/lib/landing-regions";
import { useDestination } from "./destination-context";

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/\s/g, "");

export function DestinationPicker({ disabled }: { disabled: boolean }) {
  const { destination, selectDestination } = useDestination();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionId | "all">("all");
  const searchId = useId();
  const ref = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const compact = useCompactViewport();
  const normalized = normalizeSearch(query);
  const cities = DESTINATIONS.filter(city => (region === "all" || city.region === region) && normalizeSearch(`${city.name}${city.en}${city.country}${city.countryEn}`).includes(normalized));
  const close = () => {
    // Release the modal's inert background before returning keyboard focus.
    dialog.current?.close();
    setOpen(false);
    if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus({ preventScroll: true }); }
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target) && !dialog.current?.contains(target)) {
        ref.current.open = false; setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    if (!compact || !open) return;
    const panel = dialog.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.showModal();
    return () => { panel?.close(); document.body.style.overflow = previous; };
  }, [compact, open]);
  const content = <>
        <div className="destination-search"><Search size={15} /><label className="sr-only" htmlFor={searchId}>도시 또는 나라 검색</label><input id={searchId} placeholder="도시 또는 나라 검색" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />{query && <button type="button" aria-label="검색 지우기" onClick={() => { setQuery(""); document.getElementById(searchId)?.focus(); }}><X size={14} /></button>}</div>
        <div className="destination-filters" role="group" aria-label="여행지 대륙 필터">
          <button type="button" aria-pressed={region === "all"} onClick={() => setRegion("all")}>전체</button>
          {REGIONS.map(item => <button type="button" key={item.id} aria-pressed={region === item.id} onClick={() => setRegion(item.id)}>{item.name}</button>)}
        </div>
        <p className="destination-result-count" role="status">{cities.length}개의 여행 예시</p>
        <div className="destination-options" role="group" aria-label="여행 예시 목록">
          {cities.map(city => <button type="button" key={city.id} aria-label={`${city.name} 여행 선택`} aria-pressed={city.id === destination.id} onClick={() => { selectDestination(city.id); close(); }}>
            <strong>{city.name}{city.id === destination.id && <Check size={13} />}</strong><span>{city.country}</span>
          </button>)}
        </div>
        {cities.length === 0 && <div className="destination-empty"><p>일치하는 여행지가 없어요.</p><button type="button" onClick={() => { setQuery(""); setRegion("all"); document.getElementById(searchId)?.focus(); }}>전체 도시 보기</button></div>}
      </>;
  return <div className="destination-picker" inert={disabled} aria-hidden={disabled}>
    <span className="destination-picker-caption">다음 여행은 어디로? <span>{DESTINATIONS.length}개 도시 · 6개 대륙</span></span>
    <details ref={ref} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }} onBlur={event => { if (!compact && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onToggle={event => { if (event.target !== event.currentTarget) return; setOpen(event.currentTarget.open); if (!event.currentTarget.open) { setQuery(""); setRegion("all"); } }}>
      <summary aria-label={`여행지 선택: ${destination.name}`}><Compass size={18} /><strong>{destination.name}</strong><span>{destination.country}</span><ChevronDown size={16} /></summary>
      {!compact && <div className="destination-panel" data-lenis-prevent>{content}</div>}
    </details>
    {compact && open && createPortal(<div className="landing mobile-destination-layer">
      <dialog ref={dialog} className="destination-panel mobile-destination-dialog" aria-label="여행지 선택" data-lenis-prevent onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}>
        <div className="destination-dialog-heading"><h2>어디로 떠날까요?</h2><button type="button" aria-label="여행지 선택 닫기" onClick={close}><X size={20} /></button></div>
        {content}
      </dialog>
    </div>, document.body)}
    <p aria-live="polite">{destination.tagline} <span>3일 · 9곳</span></p>
  </div>;
}

export function GlobeRegions({ disabled }: { disabled: boolean }) {
  const { globeView, setGlobeView } = useDestination();
  return <div className="globe-regions" inert={disabled} aria-hidden={disabled}>
    <span>지구본을 돌려, 새로운 곳으로</span>
    <div role="group" aria-label="지구본 대륙 탐색" data-lenis-prevent>
      <button type="button" aria-pressed={globeView === "world"} onClick={() => setGlobeView("world")}>세계</button>
      {REGIONS.map(region => <button type="button" key={region.id} aria-pressed={globeView === region.id} onClick={() => setGlobeView(region.id)}>{region.name}</button>)}
    </div>
  </div>;
}
