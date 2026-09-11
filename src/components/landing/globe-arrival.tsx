"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Globe2 } from "lucide-react";
import { useInView } from "motion/react";
import { formatCoordinate } from "@/lib/landing-map";
import { useDestination } from "./destination-context";
import { DestinationPicker, GlobeRegions } from "./destination-picker";
import type { FlightTelemetry } from "./globe-scene";
import { MotionToggle, useLandingMotion, usePageVisible } from "./motion-system";

const GlobeScene = dynamic(() => import("./globe-scene"), { ssr: false });

class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GlobeArrival({ arrived, onArrive, onFlight }: { arrived: boolean; onArrive: () => void; onFlight: (flying: boolean) => void }) {
  const { destination } = useDestination();
  const [telemetry, setTelemetry] = useState<FlightTelemetry | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [flying, setFlying] = useState(false);
  const { enabled } = useLandingMotion();
  const visible = useInView(ref, { amount: .1 });
  const pageVisible = usePageVisible();
  const started = useRef(false);
  const running = enabled && visible && pageVisible;
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 250);
    return () => clearTimeout(timer);
  }, []);
  const handleReady = useCallback(() => setReady(true), []);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setFlying(true); onFlight(true);
  }, [onFlight]);
  // A context loss or a failed lazy import must not strand an active flight.
  useEffect(() => {
    if (!flying || arrived) return;
    const timeout = window.setTimeout(onArrive, 6500);
    return () => clearTimeout(timeout);
  }, [flying, arrived, onArrive]);
  // Skip a flight with Escape, and restore its keyboard entry point.
  useEffect(() => {
    if (!flying || arrived) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") onArrive(); };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [flying, arrived, onArrive]);
  return <div className="globe-arrival" ref={ref} data-ready={ready} data-flying={flying} data-landed={arrived} data-destination={destination.id} aria-label={`지구본에서 시작하는 ${destination.name} 여행`}>
    <div className="globe-live" inert={!ready} aria-hidden={!ready}>{mounted && <GlobeBoundary><GlobeScene landed={arrived} flying={flying} running={running} onStart={start} onArrive={onArrive} onReady={handleReady} onTelemetry={setTelemetry} /></GlobeBoundary>}</div>
    <div className="globe-vignette" aria-hidden="true" />
    <DestinationPicker disabled={flying} />
    <GlobeRegions disabled={flying} />
    <div className="globe-bottom">
      <span className="globe-location"><Globe2 size={14} /><span>EARTH <span>/</span> {destination.en}, {destination.countryEn}</span></span>
      <button type="button" className="globe-shortcut" onClick={start} disabled={flying}>{destination.name} 여행 둘러보기 <ArrowUpRight size={15} /></button>
      <div className="globe-utilities"><a href="#기능" aria-label="아래로 내려 아이로 기능 보기"><ArrowDown size={15} /></a><MotionToggle /></div>
    </div>
    <div className="globe-flight-status" role="status" aria-live="polite">{flying && !arrived && <><span>{formatCoordinate(telemetry?.coordinate ?? destination.coordinate)}</span><strong>{destination.name}로 내려가는 중</strong><small>{destination.tagline}</small><div className="globe-flight-track" role="progressbar" aria-label={`${destination.name} 도착 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((telemetry?.progress ?? 0) * 100)}><i style={{ transform: `scaleX(${telemetry?.progress ?? 0})` }} /></div><small>{(telemetry?.progress ?? 0) < .35 ? "지구에서 도시로" : (telemetry?.progress ?? 0) < .8 ? "여행의 첫 장면을 찾아서" : "나만의 일정에 도착해요"}</small><button type="button" onClick={onArrive}>바로 일정 보기 <span>Esc</span></button></>}</div>
    <p className="globe-attribution"><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="/credits/photos" target="_blank" rel="noreferrer">사진 출처</a></p>
  </div>;
}
