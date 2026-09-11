"use client";

import Image from "next/image";
import { useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type RefObject } from "react";
import { motion, useInView } from "motion/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight, Bookmark, Check, Coffee, FileCheck2, MapPin, MessageCircle, Plus, RotateCcw, Route, Wallet } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { formatCoordinate } from "@/lib/landing-map";
import { useDestination } from "./destination-context";
import { JourneyMap } from "./journey-map";
import { Reveal, useLandingMotion, usePageVisible } from "./motion-system";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const NBSP = String.fromCharCode(160); // non-breaking space keeps inline-block words apart. " ";

const features = [
  { icon: MessageCircle, number: "01", title: "떠오르는 대로 말해요", body: "가고 싶은 곳, 먹고 싶은 것, 여행의 속도까지. 아이로와 대화하며 나에게 맞는 일정을 만드세요." },
  { icon: Route, number: "02", title: "동선은 한눈에 봐요", body: "일정과 지도를 나란히 보며 여행을 그려보세요. 날짜별 경로와 장소를 확인하고 직접 수정할 수도 있어요." },
  { icon: Wallet, number: "03", title: "여행 준비를 한곳에", body: "마음에 든 맛집부터 예약 자료와 예산까지. 흩어져 있던 여행 정보를 일정 곁에 모아두세요." },
];

const latitude = (coordinate: readonly [number, number]) => `${Math.abs(coordinate[1]).toFixed(4)}°${coordinate[1] < 0 ? "S" : "N"}`;

function spotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const r = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--x", `${event.clientX - r.left}px`);
  event.currentTarget.style.setProperty("--y", `${event.clientY - r.top}px`);
}

/** The map engine only starts playback on mount, so each entry into view remounts it (fresh route draw)
 * while leaving the view pauses it in place. Reduced motion renders the finished route statically. */
function useMapRun(ref: RefObject<Element | null>, amount: number) {
  const inView = useInView(ref, { amount });
  const pageVisible = usePageVisible();
  const { enabled } = useLandingMotion();
  const running = enabled && inView && pageVisible;
  const [run, setRun] = useState(0);
  const [wasRunning, setWasRunning] = useState(false);
  if (running !== wasRunning) { setWasRunning(running); if (running) setRun(n => n + 1); }
  return { running, run, replay: () => setRun(n => n + 1) };
}

/* 01 — an open conversation thread on the page; the reply becomes a place on a small map. */
function ConversationThread() {
  const { destination } = useDestination();
  const TALK = destination.days;
  const mapRef = useRef<HTMLDivElement>(null);
  const { running, run } = useMapRun(mapRef, 0.6);
  return <div className="thread" role="group" aria-label="아이로와 나눈 대화 예시">
    <span className="thread-line" aria-hidden="true"><span className="thread-line-fill" /></span>
    <div className="thread-turn"><p className="thread-user">{TALK[0].user}</p></div>
    <div className="thread-turn"><div className="thread-ai"><LogoMark /><div className="thread-ai-body"><span className="thread-ai-label">아이로</span><p>{TALK[0].reply}</p></div></div></div>
    <div className="thread-turn thread-result-turn"><div className="thread-result">
      <div ref={mapRef} className="thread-map"><JourneyMap key={`${destination.id}-${run}`} day={0} animate={running} /></div>
      <div className="chat-route-card"><span className="chat-route-icon"><MapPin size={18} /></span><div><strong>{TALK[0].scene}</strong><p>{TALK[0].time}</p></div><Check size={16} /></div>
    </div></div>
    <div className="thread-turn"><p className="thread-user">{TALK[1].user}</p></div>
    <div className="thread-turn"><div className="thread-ai"><LogoMark /><div className="thread-ai-body"><span className="thread-ai-label">아이로</span><p>{TALK[1].reply}</p></div></div></div>
    <div className="thread-turn thread-result-turn"><div className="thread-chip"><MapPin size={14} /><span>{TALK[1].scene}</span><span>{TALK[1].time}</span></div></div>
    <span className="scene-footnote">지도와 대화가 연결되는 여행</span>
  </div>;
}

/* 02 — a full-width paper map band with the itinerary laid on top. Day buttons drive the real map. */
function MapBand() {
  const { destination } = useDestination();
  const TALK = destination.days, JOURNEYS = destination.map.journeys;
  const ref = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState(0);
  const { running, run, replay } = useMapRun(ref, 0.4);
  const { enabled } = useLandingMotion();
  const journey = JOURNEYS[day];
  return <div className="map-chapter">
    <div className="feature-map-band">
      <div ref={ref} className="feature-map"><JourneyMap key={`${destination.id}-${day}-${run}`} day={day} animate={running} /></div>
      <div className="band-inner">
        {enabled && <button type="button" className="band-replay" onClick={replay}><RotateCcw size={14} /> 경로 다시 그리기</button>}
        <p className="band-readout"><strong>{destination.en}, {destination.countryEn} · DAY {day + 1}</strong>{formatCoordinate(journey.stops[0].coordinate)}</p>
      </div>
    </div>
    <div className="itinerary-panel" role="group" aria-label={`${destination.name} 3일 일정 미리보기`}>
      <div className="itinerary-head"><div><strong>{destination.title}</strong><span>{destination.tagline}</span></div><ArrowUpRight size={18} /></div>
      <div className="day-list" role="group" aria-label="날짜 선택">
        {TALK.map((talk, i) => <button type="button" key={i} aria-pressed={day === i} onClick={() => day === i ? replay() : setDay(i)}>
          <span>Day {i + 1}</span><span>{talk.scene}</span><span>{talk.time.split(" · ")[0]}</span>
        </button>)}
      </div>
      <div className="route-itinerary" aria-live="polite">
        <span className="itinerary-line" aria-hidden="true" />
        {journey.stops.map((stop, i) => <div key={stop.name}><i>{i + 1}</i><span>{stop.name}</span><span>{latitude(stop.coordinate)}</span></div>)}
      </div>
    </div>
  </div>;
}

/* 03 — three postcards from the same trip, fanned once when they come into view. */
const prep = [
  { label: "맛집", body: "가고 싶은 곳에 담기", icon: Coffee, image: "day2-cafe", alt: "골목 안 작은 카페" },
  { label: "예약", body: "예약 자료", icon: FileCheck2, image: "day3-arashiyama", alt: "아라시야마 대나무 숲" },
  { label: "예산", body: "여행 예산", icon: Wallet, image: "day1-philosophers-path", alt: "철학의 길 산책" },
];

const subscribeMobile = (notify: () => void) => { const q = matchMedia("(max-width: 767px)"); q.addEventListener("change", notify); return () => q.removeEventListener("change", notify); };
function Postcards() {
  const { destination } = useDestination();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.45, once: true });
  const { enabled } = useLandingMotion();
  const fanned = inView || !enabled;
  const mobile = useSyncExternalStore(subscribeMobile, () => matchMedia("(max-width: 767px)").matches, () => false);
  return <div ref={ref} className="postcard-scene spotlight-card" onPointerMove={spotlight}>
    <div className="postcard-desk" aria-hidden="true"><Image src="/gen/feature-prep.webp" alt="" fill sizes="(max-width: 767px) 100vw, 50vw" /></div>
    <div className="postcard-fan">
      {prep.map(({ label, body, icon: Icon, image, alt }, i) => <motion.figure key={label} className="postcard" style={{ zIndex: i === 1 ? 2 : 1 }} initial={false}
        animate={fanned ? { x: `${(i - 1) * (mobile ? 46 : 60)}%`, y: i === 1 ? -18 : 6, rotate: (i - 1) * 6 } : { x: 0, y: i * -5, rotate: (i - 1) * 1.5 }}
        transition={enabled ? { type: "spring", stiffness: 110, damping: 17, delay: i * 0.08 } : { duration: 0 }}>
        <div className="postcard-photo">{destination.id === "kyoto" ? <Image src={`/gen/${image}.webp`} alt={alt} fill sizes="240px" /> : <div className="destination-postcard"><JourneyMap key={`${destination.id}-${i}`} day={i} animate={false} /><span>{destination.name} · {destination.days[i].scene}</span></div>}</div>
        <figcaption className="postcard-meta"><Icon size={16} /><strong>{label}</strong><Bookmark size={13} /><span>{body}</span></figcaption>
      </motion.figure>)}
    </div>
    <p className="prep-caption"><Check size={14} /> 여행 준비를 한곳에</p>
  </div>;
}

export function FeatureStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, fade } = useLandingMotion();
  useGSAP(() => {
    if (!fade) return;
    const turns = Array.from(ref.current?.querySelectorAll<HTMLElement>(".thread-turn") ?? []);
    turns.forEach(turn => gsap.from(turn, { y: enabled ? 18 : 0, opacity: 0, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: turn, start: "top 88%", once: true } }));
    const thread = ref.current?.querySelector<HTMLElement>(".thread");
    if (thread && enabled) gsap.fromTo(".thread-line-fill", { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: thread, start: "top 70%", end: "bottom 70%", scrub: 0.4 } });
  }, { scope: ref, dependencies: [enabled, fade], revertOnUpdate: true });
  return <div ref={ref} className="feature-story">
    {features.map(({ icon: Icon, number, title, body }, i) => {
      const words = title.split(" ");
      return <article key={number} className={`feature-article feature-0${i + 1}`} data-feature={number}>
        <div className="feature-copy">
          <div className="feature-number"><span>{number}</span><span /><Icon size={19} /></div>
          <Reveal words className="feature-title"><h3>{words.map((word, n) => <span key={n} data-word>{word}{n < words.length - 1 ? NBSP : ""}</span>)}</h3></Reveal>
          <p>{body}</p>
        </div>
        <div className="feature-visual">{i === 0 ? <ConversationThread /> : i === 1 ? <MapBand /> : <Postcards />}</div>
      </article>;
    })}
  </div>;
}

/* MCP — the same trip in two windows: a request in the chosen tool, a stop inserted in AIRO. Local preview only. */
const tools = ["Claude", "Cursor", "Codex", "ChatGPT"] as const;

export function McpDiagram() {
  const { destination } = useDestination();
  const MCP_STOPS = destination.map.journeys[1].stops;
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string>("Claude");
  const [run, setRun] = useState(0);
  const visible = useInView(ref, { amount: 0.35 });
  const pageVisible = usePageVisible();
  const { enabled } = useLandingMotion();
  const choose = (tool: string) => { if (tool === selected) setRun(n => n + 1); else setSelected(tool); };
  useGSAP(() => {
    if (!enabled) return; // Reduced motion and "off" keep the finished state visible.
    if (!visible || !pageVisible) {
      gsap.set([".mcp-request", ".mcp-inserted", ".mcp-insert-badge", ".mcp-reply", ".beam-dot"], { opacity: 0 });
      gsap.set(".beam-path", { scaleX: 0, scaleY: 0 });
      return;
    }
    const line = ref.current?.querySelector<HTMLElement>(".beam-path");
    const rect = line?.getBoundingClientRect();
    const vertical = !!rect && rect.height > rect.width;
    const distance = rect ? (vertical ? rect.height : rect.width) : 0;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".mcp-request", { y: 12, opacity: 0, duration: 0.5 })
      .fromTo(".beam-path", vertical ? { scaleY: 0, scaleX: 1 } : { scaleX: 0, scaleY: 1 }, { scaleX: 1, scaleY: 1, duration: 1.1, ease: "power2.inOut" }, "+=0.15")
      .fromTo(".beam-dot", { x: 0, y: 0, opacity: 1 }, { ...(vertical ? { y: distance } : { x: distance }), duration: 1.1, ease: "power2.inOut" }, "<")
      .fromTo(".mcp-hub", { scale: 1 }, { scale: 1.08, duration: 0.22, yoyo: true, repeat: 1, ease: "power1.inOut" }, "-=0.75")
      .to(".beam-dot", { opacity: 0, duration: 0.2 })
      .from(".mcp-inserted", { y: -10, opacity: 0, duration: 0.5, ease: "back.out(1.7)" }, "-=0.2")
      .from(".mcp-insert-badge", { opacity: 0, duration: 0.3 }, "-=0.1")
      .from(".mcp-reply", { y: 10, opacity: 0, duration: 0.5 }, "-=0.1");
  }, { scope: ref, dependencies: [enabled, visible, pageVisible, selected, run, destination.id], revertOnUpdate: true });
  return <div ref={ref} className="mcp-diagram" role="group" aria-label="AI 도구와 아이로 연동 미리보기">
    <div className="mcp-tools" role="group" aria-label="AI 도구 선택">{tools.map(tool => <button type="button" key={tool} className="mcp-node" aria-pressed={selected === tool} onClick={() => choose(tool)}>{tool}</button>)}</div>
    <div className="mcp-stage">
      <div className="mcp-window mcp-window-tool" role="group" aria-label={`${selected} 대화 미리보기`}>
        <div className="mcp-window-head"><span className="mcp-window-dot" aria-hidden="true" />{selected}<span className="mcp-preview-badge">미리보기</span></div>
        <div className="mcp-window-body">
          <p className="mcp-request">{destination.name} 둘째 날에 카페 하나 더 넣어줘.</p>
          <div className="mcp-reply"><LogoMark /><div><span>아이로 · MCP</span><p>둘째 날 {MCP_STOPS[1].name} 다음에 ‘골목 안 작은 카페’를 15:00에 추가했어요.</p></div></div>
        </div>
      </div>
      <div className="mcp-connector" aria-hidden="true"><span className="beam-track" /><span className="beam-path" /><span className="beam-dot" /><div className="mcp-hub"><LogoMark /><span>아이로</span></div></div>
      <div className="mcp-window mcp-window-trip" role="group" aria-label="아이로 일정 미리보기">
        <div className="mcp-window-head"><LogoMark className="mcp-head-logo" />{destination.title} · Day 2<span className="mcp-preview-badge">미리보기</span></div>
        <div className="mcp-window-body"><div className="trip-rows">
          <div className="trip-row"><i>1</i><span>{MCP_STOPS[0].name}</span><span>{latitude(MCP_STOPS[0].coordinate)}</span></div>
          <div className="trip-row"><i>2</i><span>{MCP_STOPS[1].name}</span><span>{latitude(MCP_STOPS[1].coordinate)}</span></div>
          <div className="trip-row mcp-inserted"><i><Plus size={12} /></i><span>골목 안 작은 카페</span><span>15:00 <em className="mcp-insert-badge">추가됨</em></span></div>
          <div className="trip-row"><i>3</i><span>{MCP_STOPS[2].name}</span><span>{latitude(MCP_STOPS[2].coordinate)}</span></div>
        </div></div>
      </div>
    </div>
    <p className="mcp-connection-caption" aria-live="polite">{selected}와 연결되는 내 여행</p>
  </div>;
}

/* CTA — the trip map fades in behind the closing headline; one postcard sits in the corner. */
export function CtaStage({ children }: { children: ReactNode }) {
  const { destination } = useDestination();
  const ref = useRef<HTMLElement>(null);
  const { enabled } = useLandingMotion();
  const { running, run } = useMapRun(ref, 0.25);
  useGSAP(() => {
    if (!enabled) return;
    gsap.fromTo(".cta-postcard", { y: 28 }, { y: -28, ease: "none", scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: 1 } });
  }, { scope: ref, dependencies: [enabled], revertOnUpdate: true });
  return <section ref={ref} className="closing-journey">
    <div className="cta-map"><JourneyMap key={`${destination.id}-${run}`} day={0} animate={running} /></div>
    {children}
    <div className="cta-postcard-wrap"><figure className="cta-postcard cta-art">
      <div className="cta-postcard-photo">{destination.id === "kyoto" ? <Image src="/gen/cta-journey.webp" alt="" fill sizes="(max-width: 767px) 220px, 280px" /> : <div className="destination-postcard"><JourneyMap key={destination.id} day={2} animate={false} /><span>{destination.name} · {destination.days[2].scene}</span></div>}</div>
    </figure></div>
  </section>;
}
