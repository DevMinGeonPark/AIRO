"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp, Check, CheckCheck, Globe2, MapPin, RotateCcw, Utensils, Coffee, Wine, CakeSlice, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { VISIT_CATEGORIES, visitCategoryInfo, placeLabel, diningCoordinates, loadDiningScenario, objectName, routeDistance, routeMinutes, type DiningScenario, type VisitCategory } from "@/lib/landing-dining";
import type { Coordinate } from "@/lib/landing-map";
import { useDestination } from "./destination-context";
import { useJourneyStage } from "./journey-scroll";
import { useLiveJourneyMap } from "./live-journey-map";
import { outingCamera, outingRoads } from "@/lib/landing-live-camera";
import type { GeoJSONSource } from "maplibre-gl";
import { useLandingMotion } from "./motion-system";

import { RoadTrace } from "./road-trace";

import { planJourney, type JourneyPlan, type JourneyStop } from "@/lib/landing-journey";

type Frame = { width: number; height: number; left: number; top: number; right: number; bottom: number };

const categoryIcons = { restaurant: Utensils, cafe: Coffee, bar: Wine, dessert: CakeSlice };

function DiningMap({ scenario, options, targetIndex, category, step, selected, saved, plan, preservedLegs, changingTarget, routeRun, saveRun, onSelect, onTarget, onRouteReady, onSaved }: { scenario: DiningScenario; options: DiningScenario[]; targetIndex: number | null; category: VisitCategory; step: number; selected: number; saved: JourneyStop[]; plan: JourneyPlan | null; preservedLegs: number; changingTarget: boolean; routeRun: number; saveRun: number; onSelect: (index: number) => void; onTarget: (index: number) => void; onRouteReady: () => void; onSaved: () => void }) {
  const { destination } = useDestination();
  const { enabled } = useLandingMotion();
  const { map } = useLiveJourneyMap();
  const { arrived } = useJourneyStage();
  const [cameraRevision, setCameraRevision] = useState(0);
  useEffect(() => {
    if (!map || !arrived) return;
    const update = () => setCameraRevision(value => value + 1);
    map.on("move", update); map.on("resize", update);
    return () => { map.off("move", update); map.off("resize", update); };
  }, [map, arrived]);
  const places = scenario.categories[category];
  const categoryInfo = visitCategoryInfo(category);
  const savedPlaces = plan?.stops ?? [];
  const savedIds = new Set(savedPlaces.map(place => place.id));
  const CategoryIcon = categoryIcons[category];
  const root = useRef<HTMLDivElement>(null), windowRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    const element = root.current, window = windowRef.current;
    if (!element || !window) return;
    const measure = () => {
      const a = element.getBoundingClientRect(), b = window.getBoundingClientRect();
      setFrame({ width: a.width, height: a.height, left: b.left - a.left, top: b.top - a.top, right: b.right - a.left, bottom: b.bottom - a.top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(window);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    const project = (coordinate: Coordinate) => map ? map.project([...coordinate]) : { x: 0, y: 0 };
    const direct = saved.length ? diningCoordinates(scenario.route) : plan?.coordinates ?? diningCoordinates(scenario.route);
    const shapes = [direct, plan?.coordinates ?? direct].map(points => points.map(project));
    const lengths = plan?.legs.map(leg => leg.map(project).reduce((sum, point, index, all) => sum + (index ? Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) : 0), 0)) ?? [];
    const total = lengths.reduce((sum, part) => sum + part, 0);
    return { paths: shapes.map(points => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("")), traceStart: total ? lengths.slice(0, preservedLegs).reduce((sum, part) => sum + part, 0) / total : 0 };
    // Camera movement changes the projection without replacing the live map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, saved.length, plan, preservedLegs, map, cameraRevision, arrived]);
  const activeRoute = plan ?? scenario.route;
  const screen = (coordinate: Coordinate) => map ? map.project([...coordinate]) : { x: 0, y: 0 };
  const origin = screen(scenario.origin.coordinate), target = screen(scenario.destination.coordinate);
  // Place buttons keep their true anchors. Short connectors separate close POIs.
  const occupied = [origin, target].map(p => ({ left: p.x - 18, right: p.x + 18, top: p.y - 18, bottom: p.y + 18 }));
  occupied.push({ left: origin.x - 22, right: origin.x + 22, top: origin.y + 13, bottom: origin.y + 37 });
  for (const place of savedPlaces) { const p = screen(place.coordinate); occupied.push({ left: p.x - 24, right: p.x + 24, top: p.y - 19, bottom: p.y + 19 }); }
  const targetLabelWidth = Math.min(130, scenario.destination.name.length * 12 + 18);
  occupied.push({ left: target.x - targetLabelWidth / 2, right: target.x + targetLabelWidth / 2, top: target.y + 23, bottom: target.y + 48 });
  const placedPins: { x: number; y: number }[] = [];
  const pins = places.map(place => {
    const anchor = screen(place.coordinate);
    const positions = [-96, -48, 0, 48, 96].flatMap(y => [-144, -96, -48, 0, 48, 96, 144].map(x => ({ x: anchor.x + x, y: anchor.y + y })));
    if (frame) for (let y = frame.top + 24; y <= frame.bottom - 24; y += 12) for (let x = frame.left + 24; x <= frame.right - 24; x += 12) positions.push({ x, y });
    const score = (p: { x: number; y: number }) => {
      const overlap = occupied.reduce((sum, box) => sum + Math.max(0, Math.min(p.x + 24, box.right) - Math.max(p.x - 24, box.left)) * Math.max(0, Math.min(p.y + 24, box.bottom) - Math.max(p.y - 24, box.top)), 0);
      return overlap * 10000 + Math.hypot(p.x - anchor.x, p.y - anchor.y);
    };
    const position = positions.filter(p => frame && p.x >= frame.left + 22 && p.x <= frame.right - 22 && p.y >= frame.top + 22 && p.y <= frame.bottom - 22 && placedPins.every(other => Math.abs(p.x - other.x) >= 48 || Math.abs(p.y - other.y) >= 48)).sort((a, b) => score(a) - score(b))[0] ?? anchor;
    placedPins.push(position);
    occupied.push({ left: position.x - 23, right: position.x + 23, top: position.y - 23, bottom: position.y + 23 });
    return { anchor, position };
  });
  const targetPins = options.map((option, index) => {
    const anchor = screen(option.destination.coordinate), other = screen(options[1 - index].destination.coordinate);
    const close = Math.hypot(anchor.x - other.x, anchor.y - other.y) < 66;
    const x = frame ? Math.max(frame.left + 25, Math.min(frame.right - 25, anchor.x + (close ? index ? 30 : -30 : 0))) : anchor.x;
    const y = frame ? Math.max(frame.top + 25, Math.min(frame.bottom - 25, anchor.y)) : anchor.y;
    return { option, anchor, x, y };
  });
  return <div ref={root} className="dining-map" data-category={category} data-destination={destination.id} data-target={targetIndex ?? "none"} data-route={targetIndex === null ? "none" : saved.length === 0 ? "direct" : savedPlaces.map(place => place.id).join("|")} data-saved-count={saved.length}>
    <div ref={windowRef} className="dining-map-window" aria-hidden="true" />
    {frame && <>
      <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="dining-map-canvas" role="img" aria-label={`${destination.name}, ${scenario.origin.name}에서 ${scenario.destination.name}까지${saved.length ? ` ${savedPlaces.map(place => place.name).join(" → ")} 경유` : ""} 도보 경로`}>
        {(targetIndex === null || changingTarget) && targetPins.map(({ anchor, x, y }, index) => <g key={index} aria-hidden="true"><path d={`M${anchor.x},${anchor.y}L${x},${y}`} stroke="var(--primary)" opacity=".45" strokeWidth="1" strokeDasharray="2 3" /><circle cx={anchor.x} cy={anchor.y} r="3" fill="var(--primary)" /></g>)}
        <g>
          {targetIndex !== null && <RoadTrace key={`target-${targetIndex}-${routeRun}`} className="dining-direct-route" path={geometry.paths[0]} muted={saved.length > 0} onComplete={onRouteReady} />}
          {saved.length > 0 && <RoadTrace key={`saved-${saveRun}`} className="dining-saved-route" path={geometry.paths[1]} startProgress={geometry.traceStart} onComplete={onSaved} />}
        </g>
        {step >= 2 && pins.map(({ anchor, position }, index) => <g key={index} aria-hidden="true"><path d={`M${anchor.x},${anchor.y}L${position.x},${position.y}`} stroke="var(--primary)" strokeWidth="1" strokeDasharray="2 3" opacity=".45" /><circle cx={anchor.x} cy={anchor.y} r="3" fill="var(--primary)" /></g>)}
      </svg>
      <div className="dining-landmark dining-origin" style={{ left: origin.x, top: origin.y }}><i /><span>출발</span></div>
      {targetIndex === null || changingTarget ? targetPins.map(({ option, x, y }, index) => <button type="button" key={option.destination.name} className="journey-target-pin" aria-label={`${option.destination.name} 지도에서 목적지 선택`} style={{ left: x, top: y }} onClick={() => onTarget(index)}><MapPin size={19} /><b>{index + 1}</b><span>{option.destination.name}</span></button>) : <div key={`${targetIndex}-${routeRun}`} className="dining-landmark dining-target journey-target-drop" style={{ left: target.x, top: target.y }}><MapPin size={25} fill="currentColor" /><span>{scenario.destination.name}</span></div>}
      {saved.map(visit => { const place = scenario.categories[visit.category][visit.index], SavedIcon = categoryIcons[visit.category]; if (places.some(candidate => candidate.id === place.id)) return null; const position = screen(place.coordinate); return <div key={place.id} className="dining-confirmed-pin" style={{ left: position.x, top: position.y }} aria-label={`${place.name} 일정에 저장됨`}><SavedIcon size={15} /><Check size={11} /></div>; })}
      {step >= 2 && pins.map(({ position }, index) => <motion.button type="button" key={places[index].id} className="dining-food-pin" data-selected={selected === index} data-saved={savedIds.has(places[index].id)} aria-label={`${places[index].name} ${categoryInfo.label} 선택`} aria-pressed={selected === index} initial={enabled ? { opacity: 0, scale: .5 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: enabled ? index * .13 : 0, duration: .35 }} style={{ left: position.x, top: position.y, x: "-50%", y: "-50%" }} onClick={() => onSelect(index)}><CategoryIcon size={15} /><span>{index + 1}</span>{savedIds.has(places[index].id) && <i><Check size={9} /></i>}</motion.button>)}
    </>}
    <div className="dining-map-summary" aria-live="polite"><span><i />{saved.length === 0 ? step >= 2 ? `가는 길의 ${categoryInfo.label} ${places.length}곳` : "가고 싶은 곳부터" : `들를 곳 ${saved.length}곳 · 순서대로`}</span><strong>{step >= 1 ? `도보 ${routeMinutes(activeRoute)}분` : destination.name}<small>{step >= 1 ? routeDistance(activeRoute) : "나의 여행 지도"}</small></strong>{saved.length > 0 && <p><CheckCheck size={13} /> {savedPlaces.at(-1)!.name}까지 연결</p>}</div>
    <a className="dining-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">지도·장소 © OpenStreetMap</a>
  </div>;
}

function ConversationDemo({ scenario: initialScenario, onReturn }: { scenario: DiningScenario; onReturn: () => void }) {
  const { destination } = useDestination();
  const { enabled } = useLandingMotion();
  const { arrived, takeControl } = useJourneyStage();
  const options = useMemo(() => [initialScenario, ...(initialScenario.alternatives ?? [])], [initialScenario]);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [changingTarget, setChangingTarget] = useState(false);
  const [phase, setPhase] = useState<"choosing" | "routing" | "ready" | "places" | "saving" | "saved">("choosing");
  const [routeRun, setRouteRun] = useState(0), [saveRun, setSaveRun] = useState(0);
  const [category, setCategory] = useState<VisitCategory>("restaurant");
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState<JourneyStop[]>([]);
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [preservedLegs, setPreservedLegs] = useState(0);
  const [draft, setDraft] = useState(""), [sent, setSent] = useState(""), [error, setError] = useState("");
  const [resultKind, setResultKind] = useState<"place" | "target">("place");
  const log = useRef<HTMLDivElement>(null), latest = useRef<HTMLDivElement>(null);
  const scenario = options[targetIndex ?? 0];
  const step = phase === "choosing" ? 0 : phase === "routing" || phase === "ready" ? 1 : phase === "places" ? 2 : phase === "saving" ? 3 : 4;
  const categoryInfo = visitCategoryInfo(category), places = scenario.categories[category];
  const savedPlaces = plan?.stops ?? [], savedIds = new Set(savedPlaces.map(place => place.id));
  const lastSaved = savedPlaces.at(-1);
  const candidatePlans = useMemo(() => places.map((_, index) => {
    if (targetIndex === null) return null;
    try { return planJourney(initialScenario, targetIndex, [...saved, { category, index }]); } catch { return null; }
  }), [initialScenario, targetIndex, saved, category, places]);
  const draftFor = (index: number) => `${objectName(places[index].name)} 일정에 추가해줘.`;
  const chooseTarget = (index: number) => {
    try {
      const next = planJourney(initialScenario, index, saved);
      takeControl(); setTargetIndex(index); setChangingTarget(false); setPlan(next); setPreservedLegs(saved.length);
      setRouteRun(value => value + 1); setSaveRun(value => value + 1); setPhase(saved.length ? "saving" : "routing");
      setResultKind("target"); setSent(`${options[index].destination.name}까지 이어서 가고 싶어.`); setDraft(""); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "목적지까지 경로를 연결하지 못했어요."); }
  };
  const routeReady = useCallback(() => setPhase(value => value === "routing" ? "ready" : value), []);
  const saveReady = useCallback(() => setPhase(value => value === "saving" ? "saved" : value), []);
  const reset = () => {
    takeControl(); setTargetIndex(null); setChangingTarget(false); setPhase("choosing"); setRouteRun(value => value + 1);
    setCategory("restaurant"); setSelected(0); setSaved([]); setPlan(null); setPreservedLegs(0); setDraft(""); setSent(""); setError("");
    log.current?.scrollTo({ top: 0, behavior: "instant" });
  };
  useLayoutEffect(() => {
    const container = log.current, item = latest.current;
    if (!container) return;
    const target = phase === "places" ? item?.querySelector<HTMLElement>("[role='group']") ?? item : phase === "saving" || phase === "saved" ? item?.querySelector<HTMLElement>(".conversation-ai") ?? item : item;
    const top = phase === "choosing" || changingTarget || !target ? 0 : container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 5;
    container.scrollTo({ top: Math.max(0, top), behavior: enabled ? "smooth" : "instant" });
  }, [phase, category, sent, changingTarget, enabled]);
  const select = (index: number) => {
    if (phase === "saving" || savedIds.has(places[index].id)) return;
    setSelected(index); setDraft(draftFor(index)); setError(""); setPhase("places");
  };
  const switchCategory = (next: VisitCategory) => {
    if (targetIndex === null || phase === "routing" || phase === "saving") return;
    const index = scenario.categories[next].findIndex(place => !savedIds.has(place.id));
    setCategory(next); setSelected(Math.max(0, index)); setSent(""); setDraft(index < 0 ? "" : `${objectName(scenario.categories[next][index].name)} 일정에 추가해줘.`);
    setChangingTarget(false); setError(""); setPhase("places");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (phase === "saving" || targetIndex === null) return;
    const value = draft.trim();
    if (!value) return;
    const requestedCategory: VisitCategory | undefined = /카페|커피|cafe|coffee/i.test(value) ? "cafe" : /술집|맥주|와인|칵테일|pub|bar/i.test(value) ? "bar" : /디저트|케이크|아이스크림|dessert/i.test(value) ? "dessert" : /식당|밥집|음식점|restaurant/i.test(value) ? "restaurant" : undefined;
    if (requestedCategory && /추천|찾아|있어|보여|갈 만|갈만|어디/.test(value) && !/추가|등록|넣어/.test(value)) { switchCategory(requestedCategory); return; }
    if (requestedCategory && requestedCategory !== category) { switchCategory(requestedCategory); return; }
    const matched = places.findIndex((place, index) => value.toLocaleLowerCase().includes(place.name.toLocaleLowerCase()) || value.toLocaleLowerCase().includes(place.originalName.toLocaleLowerCase()) || new RegExp(`(?:^|\\s)${index + 1}(?:번|번째|\\s|$)`).test(value));
    const index = matched >= 0 ? matched : /이곳|여기|선택한/.test(value) ? selected : -1;
    if (index < 0) { setError("추가할 장소를 위 후보에서 골라주세요."); return; }
    if (savedIds.has(places[index].id)) { setError("이미 일정에 있는 장소예요. 다음에 들를 곳을 골라주세요."); return; }
    const next = candidatePlans[index];
    if (!next) { setError("기존 일정과 연결되는 도보 경로를 찾지 못했어요."); return; }
    setPreservedLegs(saved.length); setPlan(next); setSaved(previous => [...previous, { category, index }]); setResultKind("place");
    setSaveRun(run => run + 1); setSelected(index); setSent(value); setDraft(""); setPhase("saving"); setError("");
    (event.currentTarget as HTMLFormElement).querySelector("input")?.blur();
  };
  const categories = <div className="conversation-categories" role="group" aria-label="가는 길에 들를 장소 종류">{VISIT_CATEGORIES.map(item => {
    const Icon = categoryIcons[item.id];
    return <button type="button" key={item.id} data-category={item.id} aria-label={`가는 길 ${item.label} 보기`} aria-pressed={step >= 2 && category === item.id} disabled={phase === "saving"} onClick={() => switchCategory(item.id)}><Icon size={14} /><span>{item.label}</span></button>;
  })}</div>;
  const itinerary = <ol className="dining-saved-stops"><li><i />{scenario.origin.name}</li>{saved.map((visit, index) => { const place = scenario.categories[visit.category][visit.index], Icon = categoryIcons[visit.category]; return <li key={place.id} data-added="true" data-place-id={place.id}><Icon size={12} />{place.name}<span>{index + 1}번째</span></li>; })}<li><MapPin size={12} />{scenario.destination.name}</li></ol>;
  const choosing = targetIndex === null || changingTarget;
  return <div className="arrival-itinerary conversation-demo" data-category={category} data-manual="true" data-phase={phase} data-step={step} data-saved={saved.length > 0} data-saved-count={saved.length}>
    <DiningMap scenario={scenario} options={options} targetIndex={targetIndex} category={category} step={step} selected={selected} saved={saved} plan={plan} preservedLegs={preservedLegs} changingTarget={changingTarget} routeRun={routeRun} saveRun={saveRun} onSelect={select} onTarget={chooseTarget} onRouteReady={routeReady} onSaved={saveReady} />
    <div className="conversation-toolbar"><button type="button" onClick={() => { reset(); onReturn(); }}><Globe2 size={15} /><span>지구본으로</span></button><ol aria-label="대화로 여행을 만드는 과정">{["목적지", "가는 길", "들를 곳"].map((label, index) => <li key={label} data-active={(phase === "choosing" ? 0 : step < 2 ? 1 : 2) === index}><span>{index + 1}</span>{label}{index < 2 && <ArrowRight size={12} />}</li>)}</ol><button type="button" className="conversation-replay" onClick={reset} aria-label="대화 처음부터 보기"><RotateCcw size={14} /><span>다시 보기</span></button></div>
    <section className="conversation-panel" aria-label="아이로 여행 대화">
      <header><LogoMark className="size-7" /><div><h2 tabIndex={-1}>말하면, 여행이 바뀌니까.</h2><p>{destination.name} · 함께 만드는 여행</p></div>{targetIndex !== null && <button type="button" className="journey-change-target" disabled={phase === "saving" || phase === "routing"} onClick={() => { setChangingTarget(value => !value); setError(""); }}>{changingTarget ? "변경 취소" : "목적지 변경"}</button>}</header>
      {saved.length > 0 && <ol className="journey-current-stops" aria-label="현재 여행 경로" data-lenis-prevent><li>{scenario.origin.name}</li>{savedPlaces.map(place => <li key={place.id} data-place-id={place.id}><ArrowRight size={10} /><span>{place.name}</span></li>)}<li><ArrowRight size={10} />{scenario.destination.name}</li></ol>}
      {step >= 2 && !changingTarget && categories}
      <div ref={log} className="conversation-messages" data-lenis-prevent="" role="log" aria-label="여행 대화 내용" aria-live={arrived ? "polite" : "off"}>
        {choosing ? <><div className="conversation-ai journey-welcome"><span>아이로</span><p>{changingTarget ? "추가한 장소는 그대로 이어둘게요." : `${destination.name}에 도착했어요.`}</p><strong>{changingTarget ? "어디까지 이어갈까요?" : "어디를 가시겠어요?"}</strong></div><div className="journey-destinations" role="group" aria-label={`${destination.name}에서 가고 싶은 목적지`}>{options.map((option, index) => <button type="button" key={option.destination.name} className="journey-destination-choice" onClick={() => chooseTarget(index)} aria-label={`${option.destination.name} 목적지 선택`}><span className="journey-destination-number">{index + 1}</span><span><strong>{option.destination.name}</strong><small>{targetIndex === index ? "현재 목적지" : changingTarget ? "현재 일정에 이어서 연결" : `도보 약 ${routeMinutes(option.route)}분 · ${routeDistance(option.route)}`}</small></span><ArrowRight size={16} /></button>)}</div></> : <>
          <div className="conversation-user"><span>나</span><p>{scenario.destination.name}까지 가고 싶어.</p></div>
          {step === 1 && <div ref={latest} className="journey-route-response"><div className="conversation-ai"><span>아이로</span>{phase === "routing" ? <p className="journey-routing-copy"><i />좋아요. 길을 따라 이어볼게요.</p> : <p><strong>{scenario.destination.name}</strong>까지 도보 약 {routeMinutes(plan ?? scenario.route)}분이에요.<br />가는 길에 어디 들를까요?</p>}</div>{phase === "ready" && <div className="journey-quick-replies">{categories}</div>}</div>}
          {step >= 2 && <div ref={step === 2 ? latest : undefined} className="conversation-choices"><p>{lastSaved ? `${lastSaved.name} 다음에 들를 만한 ${categoryInfo.label}이에요.` : `${scenario.destination.name} 가는 길에서 들를 만한 ${categoryInfo.label}이에요.`}</p><div role="group" aria-label={`가는 길 ${categoryInfo.label} 후보`}>{places.map((place, index) => { const added = savedIds.has(place.id), minutes = candidatePlans[index] ? Math.max(0, Math.ceil((candidatePlans[index]!.durationSeconds - (plan ?? scenario.route).durationSeconds) / 60)) : null; return <button type="button" className="dining-choice" key={place.id} aria-pressed={selected === index} data-selected={selected === index} data-added={added} disabled={phase === "saving" || added} onClick={() => select(index)}><span className="dining-choice-number">{index + 1}</span><span className="dining-choice-info"><strong>{place.name}</strong><small>{placeLabel(place, category)}<i />{added ? "일정에 추가됨" : minutes === null ? "경로 확인 필요" : minutes ? `일정에 +${minutes}분` : "큰 우회 없이"}</small></span><span className="dining-choice-check">{added || selected === index ? <Check size={14} /> : <span />}</span></button>; })}</div></div>}
          {step >= 3 && <div ref={latest} className="conversation-result"><div className="conversation-user"><span>나</span><p>{sent}</p></div><div className="conversation-ai"><span>아이로 {phase === "saved" && <CheckCheck size={12} />}</span>{phase === "saving" ? <p className="journey-routing-copy"><i />{resultKind === "target" ? "들를 곳을 유지하고 목적지까지 이어가요." : `${saved.length > 1 ? savedPlaces[savedPlaces.length - 2].name + " 다음으로, " : ""}${lastSaved!.name}까지 길을 잇고 있어요.`}</p> : <><p>{resultKind === "target" ? <>들를 곳은 그대로 두고,<br /><strong>{scenario.destination.name}</strong>까지 이어뒀어요.</> : <><strong>{objectName(lastSaved!.name)}</strong> 일정에 추가했어요.<br />{saved.length > 1 ? "앞서 고른 곳을 거쳐 순서대로 이동해요." : "이곳에 들렀다가 목적지로 이어가요."}</>}</p>{itinerary}</>}</div></div>}
        </>}
      </div>
      <div className="conversation-compose">
        {error && <p role="alert" className="dining-input-error">{error}<button type="button" aria-label="안내 닫기" onClick={() => setError("")}><X size={12} /></button></p>}
        {step < 2 || changingTarget ? <p className="journey-departure"><MapPin size={13} /><span>{changingTarget ? `들를 곳 ${saved.length}곳 유지` : `${scenario.origin.name}에서 출발`}</span>{phase === "routing" && <span className="journey-routing-dots" aria-hidden="true">···</span>}</p> : <>
          {phase === "saved" && <div className="dining-finish"><button type="button" onClick={() => switchCategory(category === "restaurant" ? "cafe" : category === "cafe" ? "dessert" : "restaurant")}>다음에 들를 곳 찾기</button><Link href="/app" prefetch={false}>내 여행 만들기 <ArrowRight size={14} /></Link></div>}
          <form onSubmit={submit}><label className="sr-only" htmlFor="dining-message">장소를 추천받거나 일정에 추가하는 메시지</label><input id="dining-message" value={draft} disabled={phase === "saving"} onChange={event => { setDraft(event.target.value); setError(""); }} autoComplete="off" enterKeyHint="send" placeholder={saved.length ? "카페 추천해줘, 2번 추가해줘…" : `${objectName(places[selected].name)} 추가해줘`} /><button type="submit" aria-label="메시지 보내기" disabled={!draft.trim() || phase === "saving"}><ArrowUp size={18} /></button></form>
        </>}
      </div>
    </section>
  </div>;
}

export function DiningConversation({ onReturn }: { onReturn: () => void }) {
  const { destination } = useDestination();
  const { map } = useLiveJourneyMap();
  const { arrived } = useJourneyStage();
  const { enabled } = useLandingMotion();
  const recovered = useRef<DiningScenario | null>(null);
  const [loaded, setLoaded] = useState<{ destinationId: string; scenario: DiningScenario } | null>(null);
  const scenario = loaded?.destinationId === destination.id ? loaded.scenario : null;
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadDiningScenario(destination.id).then(value => { if (!cancelled) { setLoaded({ destinationId: destination.id, scenario: value }); setError(false); } }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [destination.id, attempt]);
  useEffect(() => {
    // An explicit retry may recover after the flight could not load its places.
    if (!attempt || !scenario || !map || !arrived || recovered.current === scenario) return;
    recovered.current = scenario;
    (map.getSource("destination") as GeoJSONSource | undefined)?.setData(`/maps/${destination.id}-detail.geojson`);
    if (!map.getSource("outing-roads")) {
      map.addSource("outing-roads", { type: "geojson", data: outingRoads(scenario) });
      map.addLayer({ id: "outing-roads", type: "line", source: "outing-roads", minzoom: 10, paint: { "line-color": "#343434", "line-width": 3 }, layout: { "line-cap": "round", "line-join": "round" } });
    }
    map.easeTo({ ...outingCamera(map, scenario), duration: enabled ? 700 : 0 });
  }, [attempt, scenario, map, arrived, destination.id, enabled]);
  return <AnimatePresence mode="wait">{scenario ? <ConversationDemo key={destination.id} scenario={scenario} onReturn={onReturn} /> : <div className="dining-loading" role="status"><LogoMark className="size-8" /><p>{error ? "여행 미리보기를 불러오지 못했어요." : `${destination.name}에서 가고 싶은 곳을 찾고 있어요.`}</p>{error && <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>다시 불러오기</button>}<button type="button" onClick={onReturn}>지구본으로</button></div>}</AnimatePresence>;
}
