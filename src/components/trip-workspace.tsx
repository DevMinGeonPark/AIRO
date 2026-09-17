"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, FolderOpen, Plus, Settings2, Download, Sparkles, X, Play, Square, Plane, ArrowUp, Wallet, Monitor, Cloud, ListOrdered, Map as MapIcon, MessageCircle, MoreHorizontal, Pencil, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import type * as MapLibreGL from "maplibre-gl";
import { LogoMark } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { useCompactViewport } from "@/components/mobile-viewport";
import { useRoadRoutes } from "./use-road-routes";
import { StopEditor } from "./stop-editor";
import { useTripPlayback } from "./use-trip-playback";
import { useTripSheet } from "./trip-sheet";
import { useAiDevices, useCodexChat } from "./use-codex-chat";
import { deviceLabel, deviceReady } from "@/lib/ai-bridge-types";
import { webUrl, type ArchiveData } from "@/lib/archive";
import {
  Map,
  MapArc,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  useMap,
  type MapRef,
} from "@/components/ui/map";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader, useDarkMode } from "@/components/app-shell";
import { PlaceSearch, type Bias } from "@/components/place-search";
import { bounds, byDay, dateForDay, directionsUrl, mapsUrl, totalKm, tripLegs } from "@/lib/geo";
import type { Message, Place, Stop, Trip } from "@/lib/types";

/** 지점 하나에 붙는 줌. CARTO 는 14 부터 상점·랜드마크 이름을 보여준다. */
const FOCUS_ZOOM = 15;
// mapcn 기본값(positron/dark-matter)은 라벨을 걷어낸 스타일이라 지명이 안 뜬다.
// voyager 는 라벨을 살려둔다. 다크는 CARTO 에 대안이 없어 dark-matter 유지.
const STYLES = {
  light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

type Padding = { top: number; right: number; bottom: number; left: number };
function InitialTripFrame({ stops, padding }: { stops: Stop[]; padding: () => Padding }) {
  const { map, isLoaded } = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || !isLoaded || fitted.current || !stops.length) return;
    fitted.current = true;
    map.fitBounds(bounds(stops), { padding: padding(), maxZoom: 12, animate: false });
  }, [map, isLoaded, stops, padding]);
  return null;
}

/** 휴대폰: 지도 빈 곳을 한 번 누르면 위·아래 조작부가 나타나고 다시 누르면 사라진다. 마커·드래그는 제외. */
function MapTapToggle({ onTap }: { onTap: () => void }) {
  const { map } = useMap();
  const handler = useRef(onTap);
  useEffect(() => { handler.current = onTap; });
  useEffect(() => {
    if (!map) return;
    // 캔버스 자체를 눌렀을 때만. 마커·컨트롤은 자기 일을 한다. 드래그는 MapLibre 가 click 으로 치지 않는다.
    const onClick = (event: MapLibreGL.MapMouseEvent) => { if (event.originalEvent.target === map.getCanvas()) handler.current(); };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map]);
  return null;
}

/** 오늘과 가장 가까운 일차. 시작일이 없으면 첫날. day 0 은 출국 전날. */
function nearestDay(startDate: string | null, days: number[]) {
  if (!days.length) return null;
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  if (!start || Number.isNaN(start.getTime())) return days[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const current = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  return days.reduce((best, day) => Math.abs(day - current) < Math.abs(best - current) ? day : best);
}

type Tab = "map" | "plan" | "chat";

const TABS: [Tab, string, typeof ListOrdered][] = [
  ["plan", "일정", ListOrdered],
  ["map", "지도", MapIcon],
  ["chat", "채팅", MessageCircle],
];

export function TripWorkspace({
  trip: initialTrip,
  initialStops,
  initialMessages,
  roads = {},
  photos = {},
  showSignOut = false,
}: {
  trip: Trip;
  initialStops: Stop[];
  initialMessages: Message[];
  roads?: ArchiveData["routes"];
  photos?: ArchiveData["photos"];
  showSignOut?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const planScrollRef = useRef<HTMLDivElement>(null);
  const [trip, setTrip] = useState(initialTrip);
  const [stops, setStops] = useState(initialStops);
  const [messages, setMessages] = useState(initialMessages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dayChoice, setActiveDay] = useState<number | null | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [preview, setPreview] = useState<Place | null>(null);
  const [editing, setEditing] = useState<Stop | "new" | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatProvider, setChatProvider] = useState<"codex" | "api">("codex");
  const ai = useAiDevices();
  const [syncStatus, setSyncStatus] = useState<"idle" | "error" | "missing">("idle");
  const syncBlocked = useRef(false);
  const syncSequence = useRef(0);
  const etag = useRef<string | null>(null);
  useEffect(() => { syncBlocked.current = Boolean(editing) || busy || streaming !== null; }, [editing, busy, streaming]);
  const dark = useDarkMode();
  const compact = useCompactViewport();
  /** 휴대폰 지도 화면: 위·아래 조작부 표시 여부. 처음엔 지도만. */
  const [chrome, setChrome] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(true);
  const overlayRef = useRef<HTMLElement>(null);
  // 휴대폰에서 시트는 열림/닫힘뿐. 끝까지 내리면 지도만 남는다.
  const sheet = useTripSheet(`장소 검색 · ${stops.length}곳`, { lock: Boolean(editing), binary: compact, onClose: () => { setTab("map"); setChrome(false); } });
  /** 채팅 자동 스크롤은 사용자가 맨 아래 근처에 있을 때만. 이전 대화를 읽는 중이면 끌어내리지 않는다. */
  const stickToBottom = useRef(true);

  const days = useMemo(() => byDay(stops), [stops]);
  // 휴대폰에서 처음 열면 오늘과 가장 가까운 하루만. 사용자가 고르기 전(undefined)까지만 적용된다.
  const nearest = useMemo(() => days.length > 1 ? nearestDay(trip.start_date, days.map(d => d.day)) : null, [days, trip.start_date]);
  const activeDay = dayChoice !== undefined ? dayChoice : compact ? nearest : null;
  const visible = useMemo(
    () => (activeDay === null ? stops : stops.filter((s) => s.day === activeDay)),
    [stops, activeDay],
  );
  const legs = useMemo(() => tripLegs(visible), [visible]);
  const { routes: roadLegs, status: routeStatus, retry: retryRoutes } = useRoadRoutes(trip.id, visible, roads);
  const active = stops.find((s) => s.id === activeId) ?? null;

  /** 휴대폰에서는 시트 대신 왼쪽 일정 오버레이가 지도를 가리므로, 그 높이만큼 위를 비운다. */
  const framePadding = useCallback((requested: "peek" | "half" | "full", detail = false): Padding => {
    if (!window.matchMedia("(max-width: 1023px)").matches) return sheet.padding(requested, detail);
    const stage = document.querySelector(".trip-workspace .workspace-panes")?.clientHeight ?? window.innerHeight;
    // 다른 탭에서 지도로 넘어오는 중이면 오버레이가 아직 display:none 이라 높이가 0 — 행 수로 어림한다.
    const overlay = overlayRef.current?.offsetHeight || Math.min(stage * .52, 58 + 40 * visible.length + 8);
    return { top: overlay + 32, left: 28, right: 28, bottom: detail ? 220 : 76 };
  }, [sheet, visible.length]);

  const playback = useTripPlayback({ stops: visible, roads: roadLegs, mapRef,
    onSelect: setActiveId, onStart: () => { setTab("map"); setActiveId(null); sheet.setSize("peek"); },
    padding: () => framePadding("peek"),
  });

  const activePhoto = active ? webUrl(photos[active.source_id ?? active.id]?.image) : undefined;

  /**
   * 지점 → 그날 안에서의 순번. 리스트와 지도 마커가 같은 번호를 쓴다.
   * (Map 이라는 이름은 지도 컴포넌트가 이미 쓰고 있어 평범한 객체로 둔다.)
   */
  const ordinals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of days) d.stops.forEach((s, i) => (out[s.id] = i + 1));
    return out;
  }, [days]);

  useEffect(() => {
    const panel = chatScrollRef.current;
    if (panel && stickToBottom.current) panel.scrollTop = panel.scrollHeight;
  }, [messages, streaming]);
  useEffect(() => {
    if (tab !== "chat") return;
    stickToBottom.current = true;
    const panel = chatScrollRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [tab]);

  useEffect(() => {
    // 휴대폰에서는 시트 전체가 스크롤 영역이라 둘 다 올린다.
    if (editing) { planScrollRef.current?.scrollTo({ top: 0 }); document.getElementById("trip-itinerary")?.scrollTo({ top: 0 }); }
  }, [editing]);

  /** 채팅 도구가 DB 를 바꾼 뒤 지도·일정을 다시 읽어온다. */
  const refetch = useCallback(async (options?: { background?: boolean; signal?: AbortSignal }) => {
    const sequence = ++syncSequence.current;
    const res = await fetch(`/api/trips/${trip.id}`, { cache: "no-store", signal: options?.signal,
      headers: etag.current ? { "If-None-Match": etag.current } : {} });
    if (sequence !== syncSequence.current || (options?.background && syncBlocked.current)) return;
    if (res.status === 304) { setSyncStatus("idle"); return; }
    if (res.status === 404) { setSyncStatus("missing"); return; }
    if (!res.ok) throw new Error("여행을 다시 불러오지 못했습니다.");
    const data = (await res.json()) as { trip: Trip; stops: Stop[]; messages: Message[] };
    if (sequence !== syncSequence.current || (options?.background && syncBlocked.current)) return;
    etag.current = res.headers.get("etag");
    setTrip(data.trip);
    setStops(data.stops);
    setMessages(data.messages);
    setActiveId(id => id && data.stops.some(s => s.id === id) ? id : null);
    setActiveDay(day => day != null && !data.stops.some(s => s.day === day) ? null : day);
    setSyncStatus("idle");
  }, [trip.id]);

  const codex = useCodexChat(trip.id, refetch, setStreaming, setBusy, setChatError);
  const chatDevice = codex.jobId ? ai.devices.find(d => d.id === codex.deviceId) : ai.ready ?? ai.devices.find(d => !d.revokedAt);
  const chatConnected = Boolean(chatDevice && deviceReady(chatDevice));

  useEffect(() => {
    let active = true, inFlight = false;
    const sequenceRef = syncSequence;
    const controller = new AbortController();
    const refresh = async () => {
      if (!active || inFlight || syncBlocked.current || document.visibilityState !== "visible" || !navigator.onLine) return;
      inFlight = true;
      try { await refetch({ background: true, signal: controller.signal }); }
      catch { if (active && !controller.signal.aborted) setSyncStatus("error"); }
      finally { inFlight = false; }
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    void refresh();
    return () => {
      active = false; controller.abort(); ++sequenceRef.current;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refetch]);

  /** 검색을 지금 보고 있는 화면 쪽으로 기울인다. */
  const getBias = useCallback((): Bias => {
    const map = mapRef.current;
    if (!map) return {};
    const b = map.getBounds();
    const c = map.getCenter();
    return {
      near: { lat: c.lat, lng: c.lng },
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    };
  }, []);

  function focus(stop: Stop) {
    playback.stop();
    setActiveId(stop.id);
    // 편집 중에는 폼이 있는 일정 탭에 머문다 — 지도로 넘어가면 폼이 사라진다.
    if (editing) setTab("plan"); else { setTab("map"); sheet.setSize("peek"); }
    mapRef.current?.flyTo({
      center: [stop.lng, stop.lat],
      zoom: FOCUS_ZOOM,
      speed: 1.1,
      padding: framePadding("peek", true),
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }

  function showDay(day: number | null) {
    playback.stop();
    setActiveDay(day);
    setActiveId(null);
    const list = day === null ? stops : stops.filter((s) => s.day === day);
    if (list.length) mapRef.current?.fitBounds(bounds(list), { padding: framePadding("half"), maxZoom: 14, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }

  /** 오버레이의 ‹ › : 전체 → 각 일차 → 전체 순환. */
  function stepDay(direction: 1 | -1) {
    const order: (number | null)[] = [null, ...days.map(d => d.day)];
    const index = order.indexOf(activeDay);
    showDay(order[(index + direction + order.length) % order.length]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (chatProvider === "codex" && !ai.ready) { setChatError("내 AI 연결에서 Codex를 연결해 주세요."); return; }
    if (text.length > 600) { setChatError("메시지는 600자까지 입력해 주세요."); return; }
    setDraft("");
    setBusy(true);
    setChatError("");
    stickToBottom.current = true;
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        trip_id: trip.id,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);
    setStreaming("");

    try {
      if (chatProvider === "codex") { await codex.send(ai.ready!.id, text); return; }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, message: text, provider: "api" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "대화를 보내지 못했습니다.");
      if (!res.body) throw new Error("스트림을 받지 못했습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const ev = JSON.parse(raw) as { type: string; text?: string; error?: string };
          if (ev.type === "delta" && ev.text) {
            acc += ev.text;
            setStreaming(acc);
          } else if (ev.type === "changed") {
            await refetch(); // 도구가 일정을 바꿨다 — 지도 즉시 갱신
          } else if (ev.type === "error") {
            setChatError(ev.error ?? "대화를 처리하지 못했습니다.");
            acc += `\n(오류: ${ev.error})`;
            setStreaming(acc);
          }
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
      setDraft(text);
    } finally {
      try { await refetch(); } catch { setChatError("여행을 다시 불러오지 못했습니다."); }
      setStreaming(null);
      setBusy(false);
    }
  }

  const pane = (t: Tab) => `${tab === t || (tab !== "chat" && t !== "chat") ? "flex" : "hidden"} lg:flex flex-col min-h-0`;
  function pickTab(id: Tab) {
    // 편집 중에 지도로 가면 폼이 사라진다 — 저장/닫기 전까지 일정 탭에 머문다.
    if (editing && id === "map") { setTab("plan"); setChrome(true); (document.activeElement as HTMLElement | null)?.blur(); document.querySelector(".stop-editor")?.scrollIntoView({ block: "start" }); return; }
    playback.stop();
    setTab(id);
    // 지도 탭 = 지도만. 일정·채팅은 조작부를 유지한다. 지도로 갈 때 열린 키보드는 닫는다.
    setChrome(id !== "map");
    if (id === "map") (document.activeElement as HTMLElement | null)?.blur();
    if (id !== "chat") sheet.setSize("full"); // 휴대폰에서 시트는 열림(full)/닫힘(지도 탭)뿐. 편집 중에는 훅이 full 로 고정한다
  }
  const startEditing = (stop: Stop | "new") => { playback.stop(); setEditing(stop); setTab("plan"); setChrome(true); sheet.setSize("full"); };

  /** 이 여행의 실제 지점 이름으로 만든 예시 문장. */
  const examples = useMemo(() => {
    const near = stops.at(-1)?.name ?? "난바";
    const first = stops[0]?.name;
    const lastDay = days.at(-1)?.day ?? 1;
    return [
      `${near} 근처 라멘집 핀 찍어줘`,
      `${lastDay}일차에 하루 더 넣어줘`,
      first ? `${first} 시간을 10시로 바꿔줘` : "첫날 일정 순서 바꿔줘",
      "오늘 동선이 너무 빡센지 봐줘",
    ];
  }, [stops, days]);

  return (
    <div className="trip-workspace flex h-dvh flex-col" data-tab={tab} data-chrome={chrome || tab !== "map" ? "shown" : "hidden"} data-editing={Boolean(editing)} data-playing={playback.playing} style={sheet.style}>
      <AppHeader
        wide
        showSignOut={showSignOut}
        back={{ href: "/app", label: "내 여행으로" }}
        center={
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Link href="/app" className="hidden shrink-0 text-xs text-muted-foreground hover:text-primary sm:inline">내 여행</Link>
            <span className="text-muted-foreground hidden sm:inline">/</span>
            <h1 className="truncate text-sm font-medium">{trip.title}</h1>
            <span className="text-muted-foreground hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] sm:inline">
              {days.length}일
            </span>
            <span className="text-muted-foreground hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] sm:inline">
              {stops.length}곳
            </span>
          </div>
        }
      />
      {/* 데스크톱 도구 줄. 휴대폰에서는 하단 탭의 더보기 메뉴가 같은 링크를 맡는다. */}
      <nav aria-label="여행 도구" className="workspace-toolbar hidden shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-2 py-1.5 text-xs sm:px-4 lg:flex">
        <button onClick={() => startEditing("new")} className="workspace-action bg-secondary text-primary"><Plus className="size-3.5" /> 일정 직접 추가</button>
        <Link href={`/app/${trip.id}/cost`} className="workspace-action"><Wallet className="size-3.5" /> 예산</Link>
        <Link href={`/app/${trip.id}/resources`} className="workspace-action"><FolderOpen className="size-3.5" /> 자료·맛집</Link>
        <Link href={`/app/${trip.id}/settings`} className="workspace-action"><Settings2 className="size-3.5" /> 여행 설정</Link>
        <Link href="/app/settings/keys" className="workspace-action">MCP 연결 ↗</Link>
        {showSignOut && <a href={`/api/trips/${trip.id}/export`} className="workspace-action"><Download className="size-3.5" /> 내보내기</a>}
      </nav>
      {syncStatus !== "idle" && <div role="status" className="bg-secondary/40 flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
        {syncStatus === "missing" ? <>이 여행이 다른 곳에서 삭제되었습니다. <Link href="/app" className="text-primary underline">내 여행으로 돌아가기</Link></> : <>일정을 갱신하지 못했습니다. 입력한 내용은 유지됩니다. <button className="text-primary underline" onClick={() => { void refetch().catch(() => setSyncStatus("error")); }}>다시 불러오기</button></>}
      </div>}

      {/* 모바일 탭 */}
      <nav aria-label="여행 화면" className="workspace-tabs flex shrink-0 border-b text-sm lg:hidden">
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => pickTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`workspace-tab ${tab === id ? "text-primary font-semibold" : "text-muted-foreground"}`}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
        <MobileNav className="workspace-more" label={<><MoreHorizontal className="size-5" aria-hidden="true" />더보기</>} summaryLabel="더보기" navLabel="여행 도구 메뉴">
          <Link href={`/app/${trip.id}/cost`} prefetch={false}><Wallet className="size-4" /> 예산</Link>
          <Link href={`/app/${trip.id}/resources`} prefetch={false}><FolderOpen className="size-4" /> 자료·맛집</Link>
          <Link href={`/app/${trip.id}/settings`} prefetch={false}><Settings2 className="size-4" /> 여행 설정</Link>
          <Link href="/app/settings/keys" prefetch={false}>MCP 연결 ↗</Link>
          {showSignOut && <a href={`/api/trips/${trip.id}/export`}><Download className="size-4" /> 내보내기</a>}
          {showSignOut && <form action="/auth/signout" method="post"><button type="submit"><LogOut className="size-4" /> 로그아웃</button></form>}
        </MobileNav>
      </nav>

      <div className="workspace-panes flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        {/* 일정 */}
        <aside
          id="trip-itinerary" aria-label="여행 일정" data-snap={sheet.size} data-dragging={sheet.dragging}
          className={`${pane("plan")} workspace-itinerary bg-card w-full grow shrink-0 lg:w-64 lg:grow-0 lg:border-r xl:w-80`}
        >
          {sheet.handle}
          <div className="plan-tools shrink-0 space-y-3 border-b bg-secondary/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold"><CalendarDays className="size-4 text-primary" /> 나의 일정 <span className="text-[10px] font-normal text-muted-foreground">{stops.length}개의 장소</span>
              <button type="button" onClick={() => startEditing("new")} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[11px] font-medium text-primary lg:hidden"><Plus className="size-3.5" /> 직접 추가</button>
            </div>
            <PlaceSearch
              tripId={trip.id}
              canSave={showSignOut}
              days={days.map((d) => d.day)}
              defaultDay={activeDay ?? days[0]?.day ?? 1}
              getBias={getBias}
              onOpen={() => sheet.setSize("full")}
              onPreview={setPreview}
              onLocate={place => {
                playback.stop();
                setTab("map");
                setPreview(place);
                setActiveId(null);
                sheet.setSize("peek");
                mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15, padding: framePadding("peek"), animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
              }}
              onAdded={refetch}
            />
            {stops.length > 1 && <div className="workspace-playback">
              <button type="button" onClick={() => void playback.start()} disabled={!playback.playing && !playback.ready} aria-pressed={playback.playing}>
                {playback.playing ? <Square size={14} /> : <Play size={14} />}
                {playback.playing ? "멈추기" : activeDay === null ? "전체 경로 따라가기" : `${activeDay}일차 따라가기`}
              </button>
              {!playback.ready && <p>{routeStatus === "loading" ? "경로 준비 중" : "도로 경로 확인 필요"}</p>}
            </div>}
            <div className="workspace-days flex gap-1.5 overflow-x-auto">
              <DayChip active={activeDay === null} onClick={() => showDay(null)}>
                전체
              </DayChip>
              {days.map((d) => (
                <DayChip
                  key={d.day}
                  active={activeDay === d.day}
                  onClick={() => showDay(activeDay === d.day ? null : d.day)}
                >
                  {String(d.day)}
                </DayChip>
              ))}
            </div>
          </div>

          <div ref={planScrollRef} className="plan-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {editing && <div className="mb-5"><StopEditor key={editing === "new" ? "new" : editing.id} tripId={trip.id} stop={editing === "new" ? undefined : editing}
              defaults={{ day: activeDay ?? days[0]?.day ?? 1, position: days.find(d => d.day === (activeDay ?? days[0]?.day ?? 1))?.stops.length ?? 0 }}
              onSaved={refetch} onClose={() => setEditing(null)} /></div>}
            {stops.length ? (
              <div className="space-y-6">
                {days
                  .filter((d) => activeDay === null || d.day === activeDay)
                  .map((d) => {
                    const km = totalKm(d.stops);
                    return (
                      <section key={d.day}>
                        <header className="bg-card/95 sticky top-0 z-10 flex items-baseline gap-2 py-1.5 backdrop-blur">
                          <h2 className="text-sm font-semibold">{d.day === 0 ? "출국 전날" : `Day ${d.day}`}</h2>
                          <span className="text-xs">{dateForDay(trip.start_date, d.day, d.stops[0]?.date)}</span>
                          <span className="text-muted-foreground text-xs">
                            {d.stops.length}곳
                            {km >= 1 && ` · 약 ${Math.round(km)}km`}
                          </span>
                        </header>

                        <ol className="mt-1 space-y-1">
                          {d.stops.map((stop) => (
                            <StopRow
                              key={stop.id}
                              stop={stop}
                              ordinal={ordinals[stop.id] ?? 0}
                              selected={activeId === stop.id}
                              onSelect={() => focus(stop)}
                              onEdit={() => startEditing(stop)}
                            />
                          ))}
                        </ol>
                      </section>
                    );
                  })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="text-sm font-medium">아직 지점이 없습니다</p>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  위에서 장소를 검색해 담거나, 채팅으로 “도톤보리 핀 찍어줘” 라고
                  해보세요.
                </p>
              </div>
            )}
          </div>

          {stops.length > 1 && (
            <footer className="plan-footer text-muted-foreground shrink-0 border-t px-4 py-2.5 text-xs">
              전체 {days.length}일 · {stops.length}곳 · 직선 거리 약{" "}
              {Math.round(totalKm(stops)).toLocaleString("ko-KR")}km
            </footer>
          )}
        </aside>

        {/* 지도 */}
        <div className={`${pane("map")} workspace-map relative min-h-0 min-w-0 flex-1`} data-road-routes={roadLegs.length} data-route-status={routeStatus}>
          <Map
            ref={mapRef}
            theme={dark ? "dark" : "light"}
            styles={STYLES}
            // CJK 글리프가 CARTO 폰트스택에 없어 일본·한국 지명이 통째로 드롭된다.
            // MapLibre 가 로컬에서 래스터화하도록 강제한다.
            localIdeographFontFamily="system-ui, sans-serif"
            // MapProps 는 MapLibre MapOptions 를 그대로 받는다 — 초기 화면을
            // 지점 전체에 맞춰 잡아준다.
            bounds={bounds(stops)}
            fitBoundsOptions={{ padding: 60, maxZoom: 12 }}
            className="flex-1"
          >
            <InitialTripFrame stops={visible} padding={() => framePadding("half")} />
            <MapTapToggle onTap={() => setChrome(c => !c)} />
            <MapControls className="workspace-map-controls" />
            {playback.point && <MapMarker longitude={playback.point.position[0]} latitude={playback.point.position[1]}>
              <MarkerContent><span className="trip-moving-marker" aria-label="여행 경로 재생 중" style={{ transform: `rotate(${playback.point.heading}deg)` }}>
                {playback.point.flight ? <Plane style={{ transform: "rotate(-45deg)" }} /> : <ArrowUp />}
              </span></MarkerContent>
            </MapMarker>}
            {roadLegs.map((road) => <MapRoute key={road.id} id={`road-${road.id}`} coordinates={road.coordinates} color={dark ? "#86A5FF" : "#335CCC"} width={3} />)}
            <MapArc
              id="flight"
              data={legs.flight}
              curvature={0.28}
              paint={{
                "line-color": dark ? "#A9BDD8" : "#9565B8",
                "line-width": 2.5,
                "line-dasharray": [2, 1.5],
              }}
            />
            {preview && (
              <MapMarker longitude={preview.lng} latitude={preview.lat}>
                <MarkerContent>
                  <div className="size-4 animate-pulse rounded-full border-2 border-white bg-primary shadow-lg" />
                  <MarkerLabel className="bg-background/90 text-foreground rounded px-1 py-0.5 text-[11px] shadow-sm">
                    {preview.name}
                  </MarkerLabel>
                </MarkerContent>
              </MapMarker>
            )}
            {visible.map((stop) => {
              const selected = activeId === stop.id;
              return (
                <MapMarker
                  key={stop.id}
                  longitude={stop.lng}
                  latitude={stop.lat}
                  onClick={() => focus(stop)}
                >
                  {/* MarkerLabel 은 반드시 MarkerContent 의 자식이어야 한다.
                      형제로 두면 지도 컨테이너 기준 절대배치라 화면에서 사라진다.
                      children 을 주면 기본 점 아이콘이 사라지므로 직접 그린다. */}
                  <MarkerContent
                    className={selected ? "scale-125 transition-transform" : "transition-transform"}
                  >
                    <button type="button" aria-label={`${stop.name} 지도에서 보기`} className="workspace-map-pin"><span
                      className={`flex size-[19px] items-center justify-center rounded-full border-2 border-white text-[10px] leading-none font-semibold shadow-md ${
                        stop.mode === "flight" ? "bg-route-flight text-white dark:text-background" : "bg-route-ground text-primary-foreground"
                      }`}
                    >
                      {ordinals[stop.id]}
                    </span></button>
                    {(activeDay !== null || selected) && (
                      <MarkerLabel className="bg-background/85 text-foreground rounded px-1 py-0.5 text-[11px] shadow-sm">
                        {stop.name}
                      </MarkerLabel>
                    )}
                  </MarkerContent>
                </MapMarker>
              );
            })}
          </Map>

          {/* 키보드·스크린리더용 조작부 토글. 터치는 지도 빈 곳을 누르면 된다. */}
          <button type="button" onClick={() => setChrome(c => !c)} aria-expanded={chrome} className="chrome-toggle sr-only focus:not-sr-only focus:absolute focus:top-3 focus:right-3 focus:z-20 focus:rounded-full focus:border focus:bg-card focus:px-3 focus:py-2 focus:text-xs lg:hidden">{chrome ? "조작부 숨기기" : "조작부 보기"}</button>
          {/* 휴대폰 지도 화면: 가장 가까운 하루의 일정만 왼쪽에 띄운다. 검색·편집은 일정 탭. */}
          <section ref={overlayRef} aria-label="오늘의 일정" className="day-overlay lg:hidden" data-open={overlayOpen}>
            <header>
              <button type="button" aria-label="이전 날" onClick={() => stepDay(-1)}><ChevronLeft className="size-4" /></button>
              <button type="button" className="day-overlay-title" aria-expanded={overlayOpen} onClick={() => setOverlayOpen(o => !o)}>
                <strong>{activeDay === null ? "전체 일정" : activeDay === 0 ? "출국 전날" : `Day ${activeDay}`}</strong>
                <span>{activeDay !== null && dateForDay(trip.start_date, activeDay, visible[0]?.date)} {activeDay !== null && "·"} {visible.length}곳</span>
              </button>
              <button type="button" aria-label="다음 날" onClick={() => stepDay(1)}><ChevronRight className="size-4" /></button>
            </header>
            {overlayOpen && <ol>
              {visible.map(stop => <li key={stop.id}>
                <button type="button" onClick={() => focus(stop)} aria-current={activeId === stop.id ? "true" : undefined}>
                  <span className={`day-overlay-ordinal ${stop.mode === "flight" ? "bg-route-flight text-white dark:text-background" : "bg-route-ground text-primary-foreground"}`}>{stop.mode === "flight" ? "✈" : ordinals[stop.id]}</span>
                  {stop.time && <span className="day-overlay-time">{stop.time}</span>}
                  <span className="day-overlay-name">{stop.name}</span>
                </button>
              </li>)}
              {!visible.length && <li className="day-overlay-empty">이 날은 아직 비어 있어요</li>}
            </ol>}
          </section>
          {routeStatus !== "idle" && <div className="workspace-route-status absolute top-3 left-3 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-sm" role="status">
            <span>{routeStatus === "loading" ? "길을 따라 경로를 찾는 중…" : "일부 도로 경로를 불러오지 못했어요."}</span>
            {routeStatus === "unavailable" && <button type="button" className="min-h-11 shrink-0 text-primary" onClick={retryRoutes}>다시 시도</button>}
          </div>}
          {playback.playing && <button type="button" onClick={playback.stop} className="workspace-playback-stop absolute top-3 left-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm shadow-sm"><Square size={14} /> 경로 재생 멈추기</button>}
          {active && !playback.playing && (
            <div className="workspace-place-card bg-background/95 absolute bottom-4 left-4 w-72 max-w-[calc(100%-2rem)] max-h-[60%] overflow-y-auto rounded-xl border p-4 shadow-lg backdrop-blur">
              <button type="button" className="place-card-close" aria-label="장소 정보 닫기" onClick={() => setActiveId(null)}><X size={18} /></button>
              {activePhoto && <Image unoptimized width={640} height={360} src={activePhoto} alt={active.name} className="workspace-place-photo" referrerPolicy="no-referrer" />}
              <div className="text-muted-foreground text-xs">
                Day {active.day}
                {active.time && ` · ${active.time}`}
              </div>
              <div className="mt-0.5 font-semibold">{active.name}</div>
              {active.map_query && active.map_query !== active.name && (
                <div className="text-muted-foreground text-xs">{active.map_query}</div>
              )}
              {active.note && <p className="mt-1.5 text-sm">{active.note}</p>}
              <div className="mt-3 flex gap-2">
                <a
                  href={mapsUrl(active)}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    size: "sm",
                    className: "h-8 flex-1 rounded-full max-lg:min-h-11",
                  })}
                >
                  구글지도
                </a>
                <a
                  href={directionsUrl(active)}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    size: "sm",
                    variant: "outline",
                    className: "h-8 flex-1 rounded-full max-lg:min-h-11",
                  })}
                >
                  길찾기
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 채팅 */}
        <section
          className={`${pane("chat")} workspace-chat min-w-0 bg-secondary/40 w-full grow shrink-0 lg:w-72 lg:grow-0 lg:border-l xl:w-88`}
        >
          <div className="flex shrink-0 items-center gap-2.5 border-b bg-card py-2 pr-2 pl-4 lg:py-3 lg:pr-4">
            <LogoMark className="size-8" /><div><h2 className="text-xs font-semibold">아이로</h2><p className="mt-0.5 text-[10px] text-muted-foreground">나의 AI 여행 파트너</p></div><Sparkles className="ml-auto size-4 text-primary" />
            {/* 키보드가 열리면 하단 탭이 사라지므로 채팅 안에서 나가는 길이 필요하다 */}
            <button type="button" aria-label="지도로" onClick={() => pickTab("map")} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground lg:hidden"><X size={18} /></button>
          </div>
          {/* AI 선택 + 상태를 한 줄로. 연결 안내·중지/재개 등 부가 줄은 필요할 때만 붙는다. */}
          <div className="shrink-0 border-b bg-card px-3 py-2 text-xs lg:px-4">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 gap-1 rounded-full border p-0.5" role="group" aria-label="대화에 사용할 AI">
                <button disabled={busy || Boolean(codex.jobId)} aria-pressed={chatProvider === "codex"} onClick={() => { setChatProvider("codex"); setChatError(""); }} className={`min-h-9 rounded-full px-3 text-xs ${chatProvider === "codex" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>내 Codex</button>
                <button disabled={busy || Boolean(codex.jobId)} aria-pressed={chatProvider === "api"} onClick={() => { setChatProvider("api"); setChatError(""); }} className={`min-h-9 rounded-full px-3 text-xs ${chatProvider === "api" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}>API로 사용</button>
              </div>
              <Link href="/app/settings/ai" aria-label="AI 연결 관리" className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-primary"><Settings2 className="size-4" /></Link>
            </div>
            {/* 상태는 제 줄에 — 좁은 채팅 열에서 기기 이름만 말줄임된다 */}
            <div role="status" aria-label="현재 AI 연결" className={`mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] ${chatProvider === "api" || chatConnected ? "text-primary" : "text-muted-foreground"}`}>
              {chatProvider === "api" ? <Cloud aria-hidden="true" className="size-3.5 shrink-0" /> : <Monitor aria-hidden="true" className="size-3.5 shrink-0" />}
              {chatProvider === "api"
                ? <span className="min-w-0">OpenAI API · AIRO 서버 · API 비용 발생{busy && " · 응답 중"}</span>
                : <><span className="truncate">{chatDevice?.name ?? "Codex"}</span><span className="shrink-0">·&nbsp;{ai.error ? "상태 확인 실패" : chatDevice ? chatConnected && busy ? "이 기기에서 응답 중" : deviceLabel(chatDevice) : codex.jobId ? "기기 확인 중" : "연결 안 됨"}</span></>}
            </div>
            {chatProvider === "codex" && !ai.ready && <Link href="/app/settings/ai" className="mt-1 inline-flex min-h-9 items-center text-xs text-primary">내 컴퓨터의 Codex 연결하기 →</Link>}
            {codex.jobId && <div className="mt-1 flex gap-4">{!busy && <button onClick={() => void codex.resume()} className="min-h-9 text-xs text-primary">응답 다시 확인</button>}<button onClick={() => void codex.cancel().catch(e => setChatError(e.message))} className="min-h-9 text-xs text-muted-foreground">대화 중지</button></div>}
          </div>
          <div ref={chatScrollRef} onScroll={e => { const p = e.currentTarget; stickToBottom.current = p.scrollHeight - p.scrollTop - p.clientHeight < 80; }} className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && !streaming ? (
              <div className="pt-2">
                <h2 className="text-sm font-semibold">어떤 여행을 만들까요?</h2>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  아이로가 지도와 일정을 함께 정리해요. 지점 추가, 시간·순서 변경,
                  하루 늘리기까지 말로 하면 됩니다.
                </p>
                <ul className="mt-4 space-y-1.5">
                  {examples.map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => setDraft(q)}
                        className="bg-background hover:border-foreground/25 w-full rounded-xl border px-3 py-2.5 text-left text-xs transition-colors"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <Bubble key={m.id} role={m.role} content={m.content} />
                ))}
                {streaming !== null && (
                  <Bubble role="assistant" content={streaming} pending={!streaming} />
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatError && <p role="alert" className="px-4 py-2 text-sm text-red-600">{chatError}</p>}
          <form onSubmit={send} className="chat-composer bg-background flex shrink-0 gap-2 border-t p-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="아이로에게 보낼 메시지"
              placeholder="여행에 대해 말해보세요"
              maxLength={600}
              enterKeyHint="send"
              disabled={busy}
              className="h-10 rounded-full px-4"
            />
            <Button
              type="submit"
              disabled={busy || Boolean(codex.jobId) || !draft.trim() || (chatProvider === "codex" && !ai.ready)}
              className="h-10 shrink-0 rounded-full px-5"
            >
              {busy ? "…" : "보내기"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function DayChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 min-w-8 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary font-medium"
          : "bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StopRow({
  stop,
  ordinal,
  selected,
  onSelect,
  onEdit,
}: {
  stop: Stop;
  ordinal: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="group relative">
      <button onClick={onEdit} className="stop-edit absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`${stop.name} 수정`}><Pencil size={15} /></button>
      <button
        onClick={onSelect}
        className={`flex w-full gap-2.5 rounded-xl border p-2.5 pr-14 text-left transition-colors ${
          selected
            ? "border-primary/35 bg-secondary/60 shadow-sm"
            : "border-transparent hover:bg-background/70 hover:border-border"
        }`}
      >
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-semibold ${
            stop.mode === "flight"
              ? "bg-route-flight text-white dark:text-background"
              : selected
                ? "bg-route-ground text-primary-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {stop.mode === "flight" ? "✈" : ordinal}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {stop.time && (
              <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                {stop.time}
              </span>
            )}
            <span className="truncate text-sm font-medium">{stop.name}</span>
          </span>
          {stop.note && (
            <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-relaxed">
              {stop.note}
            </span>
          )}
        </span>
      </button>

      <a
        href={mapsUrl(stop)}
        target="_blank"
        rel="noreferrer"
        title="구글지도에서 열기"
        className="stop-maps-link bg-background text-muted-foreground hover:text-foreground absolute right-3 bottom-1 rounded-full border px-1.5 py-0.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        ↗
      </a>
    </li>
  );
}

function Bubble({
  role,
  content,
  pending,
}: {
  role: string;
  content: string;
  pending?: boolean;
}) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "space-y-1"}>
      {!mine && (
        <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-primary"><LogoMark className="size-4" /> 아이로</p>
      )}
      <div
        className={`chat-bubble max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          mine
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card rounded-bl-md border"
        }`}
      >
        {pending ? (
          <span className="flex gap-1 py-1">
            <span className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full" />
            <span className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
            <span className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
          </span>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
