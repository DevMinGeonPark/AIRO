"use client";
import { useCallback, useId, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useInView } from "motion/react";
import { MapPin, RotateCcw, X } from "lucide-react";
import { useDestination } from "./destination-context";
import { placeName, placeStory, scheduleTimes } from "@/lib/landing-lower";
import { DayTabs } from "./lower-tabs";
import { useRoutePreviewMotion } from "./use-route-preview-motion";
const RouteMap = dynamic(() => import("./lower-route-map"), { ssr: false, loading: () => <div className="lower-map-loading" role="status">지도를 준비하고 있어요.</div> });

export function RoutePreview() {
  const { destination: city } = useDestination();
  const [day, setDay] = useState(0), [selected, setSelected] = useState<number | null>(0);
  const [mapReady, setMapReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null), id = useId();
  const mapSurface = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: "300px", once: true });
  const inView = useInView(mapSurface, { amount: 0.2 });
  const { progress, running, replay, finish } = useRoutePreviewMotion(inView, mapReady);
  const onMapReady = useCallback(() => setMapReady(true), []);
  const selectStop = (stop: number) => { finish(); setSelected(stop); };
  const stops = city.map.journeys[day].stops;
  const story = selected === null ? null : placeStory(city, stops[selected].name);
  return <section className="lower-routes lower-container" aria-labelledby="lower-route-title" data-route-progress={progress.toFixed(3)} data-route-running={running}>
    <div className="lower-heading"><div><p className="lower-eyebrow">02 <span>/</span> YOUR ROUTE</p><h2 id="lower-route-title">어디를 갈지,<br /><span className="lower-blue">어떻게 이어갈지.</span></h2></div><p>장소와 장소 사이,<br />나에게 맞는 동선을 그려보세요.</p></div>
    <div ref={ref} className="lower-route-panel lower-panel" data-day={day + 1} data-selected={selected === null ? "" : selected + 1} data-route-progress={progress.toFixed(3)} data-route-running={running}>
    <div className="lower-route-schedule"><h3>{city.title}</h3><p>예시 여행 · 3일</p>
      <DayTabs id={id} day={day} label="지도 날짜 선택" onChange={next => { setDay(next); setSelected(0); replay(); }} />
      <ol id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${day}`} className="lower-route-stops">{stops.map((stop, index) => <li key={stop.name}><button type="button" aria-label={`${placeName(stop.name)} 일정에서 선택`} aria-pressed={selected === index} onClick={() => selectStop(index)}><span className="lower-stop-number" aria-hidden="true">{index + 1}</span><div className="lower-route-stop-copy"><time>{scheduleTimes[index]}</time><h4>{placeName(stop.name)}</h4><p>{placeStory(city, stop.name).description}</p></div></button></li>)}</ol>
    </div>
    <div className="lower-route-map" aria-label={`${city.name} 날짜별 여행 지도`}>
      <button type="button" className="lower-map-replay" onClick={replay} aria-label="경로 애니메이션 다시 보기"><RotateCcw size={13} />경로 다시 보기</button>
      <div ref={mapSurface} className="lower-map-surface">{visible ? <RouteMap day={day} selected={selected} onSelect={selectStop} progress={progress} running={running} onReady={onMapReady} /> : <div className="lower-map-loading"><MapPin size={20} /><span>{city.name} 여행 지도</span></div>}</div>
      {selected !== null && story && <article className="lower-place-card" aria-live="polite"><div><Image src={story.image} alt={story.alt} width={448} height={320} sizes="(max-width: 767px) 110px, 224px" /><button type="button" aria-label="선택한 장소 카드 닫기" onClick={() => setSelected(null)}><X size={17} /></button></div><div className="lower-place-copy"><h4>{placeName(stops[selected].name)}</h4><p>{story.description}</p>{city.id !== "rome" && <small>{city.name} 풍경 · 예시 일정</small>}</div></article>}
    </div>
    </div>
  </section>;
}
