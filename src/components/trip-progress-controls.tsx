"use client";
import { pendingChoice } from "@/lib/stop-choices";

import { Check, Circle, LocateFixed } from "lucide-react";
import { useState } from "react";
import type { Stop } from "@/lib/types";
import { progressEntry, progressModes, progressRule, progressStopKey, validStopTime, type ProgressRule } from "@/lib/itinerary-progress";
import type { TripProgressController } from "./use-trip-progress";
import { dayProgressRules } from "@/lib/remaining-itinerary";
import "./trip-progress.css";

export function StopProgressCheck({ stop, controller, compact = false }: { stop: Stop; controller: TripProgressController; compact?: boolean }) {
  const entry = progressEntry(controller.data, stop), done = entry?.done ?? false;
  return <button type="button" className="stop-progress-check" data-done={done} data-compact={compact} aria-label={`${stop.name} 일정 완료`} aria-pressed={done} disabled={!controller.data || pendingChoice(stop)}
    onClick={() => void controller.change({ action: "manual", stopId: progressStopKey(stop), done: !done })}>
    {done ? <Check size={16} /> : <Circle size={16} />}{!compact && (done ? "완료" : "완료 체크")}
  </button>;
}

export function StopProgressDetails({ stop, startDate, controller }: { stop: Stop; startDate: string | null; controller: TripProgressController }) {
  const entry = progressEntry(controller.data, stop), rule = progressRule(controller.data, stop);
  const source = entry?.source === "time" ? "시간 자동 체크" : entry?.source === "location" ? "위치 자동 체크" : "직접 체크";
  const zone = controller.data?.timeZone ?? "Asia/Seoul";
  const usesLocation = rule.mode === "location" || rule.mode === "either";
  const paused = entry?.source === "manual" && !entry.done;
  return <section className="stop-progress-details" aria-label="일정 진행 상태">
    <div className="stop-progress-heading"><strong>일정 진행</strong><StopProgressCheck stop={stop} controller={controller} /></div>
    {entry?.done && <p role="status">{source} · {new Date(entry.completedAt!).toLocaleString("ko-KR", { timeZone: zone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</p>}
    <label>체크 방법<select aria-label={`${stop.name} 체크 방법`} value={rule.mode} disabled={!controller.data || controller.busy} onChange={event => void controller.change({ action: "rule", rule: { ...rule, mode: event.target.value as ProgressRule["mode"] } })}>
      {Object.entries(progressModes).map(([mode, name]) => <option key={mode} value={mode} disabled={mode !== "manual" && (!startDate || ((mode === "time" || mode === "either") && !validStopTime(stop.time)))}>{name}</option>)}
    </select></label>
    {!startDate && <p>자동 체크를 쓰려면 여행 설정에서 시작일을 정해 주세요.</p>}
    {startDate && !validStopTime(stop.time) && <p>시간 자동 체크에는 일정의 HH:mm 시간이 필요해요.</p>}
    {usesLocation && <label>도착 범위<select aria-label={`${stop.name} 도착 범위`} value={rule.radiusMeters} disabled={controller.busy} onChange={event => void controller.change({ action: "rule", rule: { ...rule, radiusMeters: Number(event.target.value) } })}>{[100, 150, 300, 500, 1000].map(radius => <option key={radius} value={radius}>{radius}m 이내</option>)}</select></label>}
    {(rule.mode === "time" || rule.mode === "either") && <p>예정일 {stop.time} 이후 체크 · {zone}</p>}
    {paused && <p>직접 해제한 일정입니다. 자동 체크가 일시 정지됐어요.</p>}
    {entry && rule.mode !== "manual" && <button type="button" className="progress-resume" disabled={controller.busy} onClick={() => void controller.change({ action: "resume", stopId: progressStopKey(stop) })}>체크 초기화·자동 체크 다시 허용</button>}
    {usesLocation && <LocationProgressControl controller={controller} />}
    {controller.error && <p role="alert">{controller.error}</p>}
  </section>;
}

export function LocationProgressControl({ controller }: { controller: TripProgressController }) {
  const configured = controller.data?.rules.some(rule => rule.mode === "location" || rule.mode === "either");
  return <div className="location-progress-control">
    <button type="button" aria-pressed={controller.tracking} disabled={!configured} onClick={controller.toggleTracking}><LocateFixed size={15} />{controller.tracking ? "위치 자동 체크 중지" : "위치 자동 체크 시작"}</button>
    {controller.locationStatus && <p role="status">{controller.locationStatus}</p>}
  </div>;
}

export function TripProgressSummary({ controller, stops, startDate, compact = false }: { controller: TripProgressController; stops: Stop[]; startDate: string | null; compact?: boolean }) {
  const [mode, setMode] = useState<ProgressRule["mode"]>("manual"), [notice, setNotice] = useState("");
  const done = stops.filter(stop => progressEntry(controller.data, stop)?.done).length;
  const zone = controller.data?.timeZone ?? "Asia/Seoul";
  const zones = [...new Set([zone, "Asia/Seoul", "Asia/Tokyo", "Asia/Taipei", "Asia/Singapore", "Asia/Bangkok", "Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "UTC"])];
  return <section className="trip-progress-summary" aria-label="일정 진행">
    <div className="trip-progress-count" role="status">{controller.data ? `일정 완료 ${done} / ${stops.length}` : "진행 상태 확인 중…"}{controller.busy && <span>저장 중…</span>}</div>
    {controller.error && <div role="alert"><p>{controller.error}</p><button type="button" disabled={controller.busy} onClick={() => void controller.reload()}>진행 상태 다시 불러오기</button></div>}
    <details data-compact={compact}><summary>자동 체크 설정</summary>
      <label>표시한 일정 전체 체크 방법<select aria-label="표시한 일정 전체 체크 방법" value={mode} onChange={event => { setMode(event.target.value as ProgressRule["mode"]); setNotice(""); }}>
        {Object.entries(progressModes).map(([value, name]) => <option key={value} value={value} disabled={value !== "manual" && !startDate}>{name}</option>)}
      </select></label>
      <button type="button" className="progress-apply" disabled={!controller.data || controller.busy || !stops.length || (mode !== "manual" && !startDate)} onClick={async () => {
        const actions = dayProgressRules(stops, controller.data, mode);
        if (!actions.length) { setNotice("예정 시간이 있는 장소가 없습니다."); return; }
        const saving = controller.changeMany(actions);
        if (mode === "location" || mode === "either") controller.startTracking();
        const saved = await saving;
        setNotice(saved ? `${actions.length}곳에 적용했습니다.${actions.length < stops.length ? " 시간이 없는 장소는 유지했습니다." : ""}` : "일부 설정을 저장하지 못했어요. 장소별 설정을 확인해 주세요.");
      }}>표시한 {stops.length}곳에 적용</button>
      {notice && <p role="status">{notice}</p>}
      <p>위치 또는 시간은 예정 시간이 없는 장소에 위치 체크를 적용합니다. 직접 해제한 일정은 장소에서 초기화하면 자동 체크를 다시 허용합니다.</p>
      <p>자동 체크는 오늘 일정에 적용되며, 여행 화면을 열어둔 동안 동작합니다.</p>
      <label>일정 시간대<select aria-label="일정 시간대" value={zone} disabled={!controller.data || controller.busy} onChange={event => void controller.change({ action: "timezone", timeZone: event.target.value })}>{zones.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <LocationProgressControl controller={controller} />
      <p>위치는 체크 판단에만 사용합니다. 이동 경로는 저장하지 않아요. 화면을 다시 열면 오늘의 시간 조건을 확인합니다.</p>
    </details>
  </section>;
}
