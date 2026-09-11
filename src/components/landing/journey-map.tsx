"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Crosshair, MapPinPlus, Minus, Play, Plus, RotateCcw } from "lucide-react";
import { formatCoordinate, type Coordinate, type MapPoint, type LandingCamera as Camera } from "@/lib/landing-map";
import { useLandingMotion } from "./motion-system";
import { useDestination } from "./destination-context";
import { useJourneyScroll } from "./journey-scroll";

type Controller = { select: (index: number) => void; zoom: (factor: number) => void; fit: () => void; play: () => void; pause: (paused: boolean) => void; pan: (dx: number, dy: number) => void; drop: (x?: number, y?: number) => void };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Real coordinates, a single geographic camera, and all three days on one paper map. */
export function JourneyMap({ day = 0, animate = true, interactive = false, immersive = false, story = false, overview = false, manual = false, onInteract, onStopChange, children }: {
  day?: number; animate?: boolean; interactive?: boolean; immersive?: boolean; story?: boolean; overview?: boolean; manual?: boolean;
  onInteract?: () => void; onStopChange?: (index: number) => void; children?: ReactNode;
}) {
  const { destination } = useDestination();
  const { getCamera: fitCamera, journeys: JOURNEYS, labels: MAP_LABELS, basemap: MAP_BOUNDS, pointOnJourney, unproject } = destination.map;
  const root = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), world = useRef<SVGGElement>(null);
  const traveler = useRef<SVGGElement>(null), customPin = useRef<SVGGElement>(null), anchor = useRef<HTMLDivElement>(null), leader = useRef<SVGPathElement>(null);
  const coordinateLabel = useRef<HTMLOutputElement>(null);
  const camera = useRef<Camera | null>(null), controller = useRef<Controller | null>(null);
  const callbacks = useRef({ onInteract, onStopChange }), isRunning = useRef(animate), manualRef = useRef(manual);
  const scroll = useJourneyScroll();
  const { enabled } = useLandingMotion();
  const [selection, setSelection] = useState<{ day: number; index: number } | null>(null);
  const [extra, setExtra] = useState<{ day: number; coordinate: Coordinate } | null>(null);
  const [placeDay, setPlaceDay] = useState<number | null>(null);
  const added = extra?.day === day ? extra.coordinate : null, placing = placeDay === day;
  const selected = selection?.day === day ? selection.index : null;
  const pointer = useRef<{ x: number; y: number; lastX: number; lastY: number; moved: boolean; dragging: boolean } | null>(null);
  const initial = fitCamera(day, 620, 400);
  const journey = JOURNEYS[day];
  const initialTransform = `translate(${(initial.ax - initial.x * initial.scale).toFixed(3)} ${(initial.ay - initial.y * initial.scale).toFixed(3)}) scale(${initial.scale.toFixed(6)})`;
  useEffect(() => { callbacks.current = { onInteract, onStopChange }; }, [onInteract, onStopChange]);
  useEffect(() => { manualRef.current = manual; }, [manual]);
  useEffect(() => { isRunning.current = animate; controller.current?.pause(!animate); }, [animate]);

  useGSAP(() => {
    const element = root.current, map = svg.current;
    if (!element || !map || !world.current) return;
    let width = element.clientWidth || 620, height = element.clientHeight || 400;
    let fit = fitCamera(day, width, height, story, overview);
    let addedPoint: MapPoint | null = null, arrival = 0, overviewAmount = overview ? 1 : 0;
    let mode: "follow" | "free" = "free";
    const playhead = { progress: enabled && !overview ? 0 : 1 };
    const pins = Array.from(element.querySelectorAll<SVGGElement>(".geo-pin"));
    const connectors = Array.from(element.querySelectorAll<SVGPathElement>(".geo-pin-connector"));
    const pinNames = pins.map(pin => pin.querySelector<SVGGElement>(".geo-pin-name")!);
    const nameWidths = pinNames.map(name => name.querySelector("text")!.getComputedTextLength());
    const routePaths = Array.from(element.querySelectorAll<SVGPathElement>(".map-traveled-route"));
    const labels = Array.from(element.querySelectorAll<SVGGElement>(".city-label"));
    const chapterLabels = Array.from(element.querySelectorAll<SVGGElement>(".map-chapter-label"));
    const bodies = pins.map(pin => pin.querySelector<SVGGElement>(".geo-pin-body")!);
    const currentPins = pins.slice(day * 3, day * 3 + 3), currentBodies = bodies.slice(day * 3, day * 3 + 3);
    const ripples = currentPins.map(pin => pin.querySelector<SVGCircleElement>(".geo-pin-ripple")!);
    const pinScale = height < 300 ? .65 : story && width < 768 ? .85 : 1;
    currentBodies.forEach(body => body.querySelector("text")?.setAttribute("font-size", String(13 / pinScale)));
    const pinStates = currentBodies.map(() => ({ y: 0, scale: pinScale, opacity: 1 }));
    const renderPins = () => currentBodies.forEach((body, i) => {
      const p = pinStates[i]; body.setAttribute("transform", `translate(0 ${p.y.toFixed(2)}) scale(${p.scale.toFixed(3)})`); body.style.opacity = String(p.opacity);
    });
    const showPins = () => { pinStates.forEach(p => Object.assign(p, { y: 0, scale: pinScale, opacity: 1 })); renderPins(); };
    const drops = pinStates.map(state => gsap.fromTo(state, { y: -28, scale: .6, opacity: 0 }, { y: 0, scale: pinScale, opacity: 1, duration: .55, ease: "back.out(1.4)", paused: true, immediateRender: false, onUpdate: renderPins }));
    const pulses = ripples.map(ripple => gsap.fromTo(ripple, { scale: .4, opacity: .5 }, { scale: 2.2, opacity: 0, duration: .8, paused: true, immediateRender: false, svgOrigin: "0 0" }));
    const customDrop = gsap.fromTo(".custom-pin-body", { y: -36, opacity: 0 }, { y: 0, opacity: 1, duration: .6, ease: "power3.out", paused: true, immediateRender: false });
    if (!camera.current || !enabled) camera.current = { ...fit };
    const c = camera.current;
    const screen = (p: MapPoint) => ({ x: c.ax + (p.x - c.x) * c.scale, y: c.ay + (p.y - c.y) * c.scale });
    const place = (el: SVGElement | null, p: MapPoint) => { if (el) { const q = screen(p); el.setAttribute("transform", `translate(${q.x.toFixed(2)} ${q.y.toFixed(2)})`); } };
    const render = () => {
      world.current?.setAttribute("transform", `translate(${(c.ax - c.x * c.scale).toFixed(2)} ${(c.ay - c.y * c.scale).toFixed(2)}) scale(${c.scale.toFixed(5)})`);
      const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
      const displayedPins: MapPoint[] = [];
      JOURNEYS.forEach((trip, d) => {
        trip.stops.forEach((stop, i) => {
          const index = d * 3 + i, origin = screen(stop.point);
          let position = origin, labelLeft = false;
          // Separate nearby stops in screen space; the connector preserves the
          // exact geographic anchor and routes never move from their coordinates.
          if (d === day && !overview) {
            const candidates = [0, -58, 58, -116, 116, -174, 174].flatMap(dy => [0, -180, 180].map(dx => ({ x: origin.x + dx, y: origin.y + dy, distance: dx * dx + dy * dy }))).sort((a, b) => a.distance - b.distance);
            let best = Infinity;
            for (const candidate of candidates) {
              const left = candidate.x + 32 + nameWidths[index] > width - 16;
              const box = { left: candidate.x - (left ? 32 + nameWidths[index] : 27), right: candidate.x + (left ? 27 : 32 + nameWidths[index]), top: candidate.y - 45, bottom: candidate.y + 11 };
              const overlap = occupied.reduce((sum, other) => sum + Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left)) * Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top)), 0);
              const outside = Math.max(0, 16 - box.left) + Math.max(0, box.right - width + 16) + Math.max(0, 24 - box.top) + Math.max(0, box.bottom - height + 24);
              const score = candidate.distance + overlap * 10000 + outside * 10000;
              if (score < best) { best = score; position = candidate; labelLeft = left; }
            }
            occupied.push({ left: position.x - (labelLeft ? 32 + nameWidths[index] : 27), right: position.x + (labelLeft ? 27 : 32 + nameWidths[index]), top: position.y - 45, bottom: position.y + 11 });
          }
          pins[index].setAttribute("transform", `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
          pinNames[index].setAttribute("transform", `translate(${labelLeft ? -28 : 28} -19)`);
          pinNames[index].querySelector("text")!.setAttribute("text-anchor", labelLeft ? "end" : "start");
          connectors[index].setAttribute("d", `M${origin.x.toFixed(2)} ${origin.y.toFixed(2)}L${position.x.toFixed(2)} ${position.y.toFixed(2)}`);
          connectors[index].style.opacity = d === day && !overview && Math.hypot(position.x - origin.x, position.y - origin.y) > 1 ? ".6" : "0";
          if (d === day) displayedPins.push(position);
        });
        place(chapterLabels[d], { x: (trip.bounds.left + trip.bounds.right) / 2, y: trip.bounds.top });
        const path = routePaths[d];
        path.style.strokeDashoffset = String(d === day && !overview ? 1 - playhead.progress : 0);
        path.setAttribute("stroke-width", String((d === day ? 4 : 3) / c.scale));
      });
      MAP_LABELS.forEach((label, i) => {
        place(labels[i], label.point);
        const q = screen(label.point);
        labels[i].style.opacity = story && width < 768 && (q.y < 210 || q.y > height - 185) ? "0" : "";
      });
      const point = pointOnJourney(day, playhead.progress);
      place(traveler.current, point);
      if (addedPoint) place(customPin.current, addedPoint);
      if (coordinateLabel.current) coordinateLabel.current.textContent = formatCoordinate(unproject(addedPoint ?? (mode === "follow" ? point : c)));
      element.dataset.ready = "true";
      element.dataset.progress = playhead.progress.toFixed(3);
      element.dataset.cameraScale = c.scale.toFixed(5);
      element.dataset.overviewAmount = overviewAmount.toFixed(3);
      if (story && anchor.current) {
        const pin = displayedPins[arrival];
        const cardW = anchor.current.offsetWidth || (width < 768 ? width - 48 : 360), cardH = anchor.current.offsetHeight || 190;
        let x = pin.x + 30, y = pin.y - 15;
        if (width >= 1024) {
          x = Math.min(...journey.stops.map(stop => screen(stop.point).x)) - cardW - 32;
          x = clamp(x, width * (day === 0 ? .45 : .15), width - cardW - 48); y = clamp(y, 185, height - cardH - 120);
        } else if (width >= 768 && height <= 500) { x = 24; y = height - cardH - 24; }
        else if (width >= 768) { x = width - cardW - 36; y = height - cardH - 78; }
        else { x = 20; y = height - cardH - 36; }
        anchor.current.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        const endX = x > pin.x ? x + 4 : x + cardW - 4, endY = y + 20;
        leader.current?.setAttribute("d", `M${pin.x.toFixed(1)} ${pin.y.toFixed(1)}L${endX.toFixed(1)} ${endY.toFixed(1)}`);
      }
    };
    const arrive = (index: number, force = false) => {
      if (arrival === index && !force) return;
      arrival = index; element.dataset.stop = String(index + 1);
      currentPins.forEach((pin, i) => pin.setAttribute("data-active", String(i === index)));
      element.querySelectorAll(".map-stop-button").forEach((button, i) => button.setAttribute("data-current", String(i === index)));
      const text = element.querySelector(".map-current-place"); if (text) text.textContent = journey.stops[index].name;
      callbacks.current.onStopChange?.(index);
    };
    const updateJourney = () => {
      const point = pointOnJourney(day, playhead.progress);
      if (mode === "follow" && !story) { c.x = fit.x * .8 + point.x * .2; c.y = fit.y * .8 + point.y * .2; }
      let reached = 0;
      journey.stops.forEach((stop, i) => { if (playhead.progress >= stop.progress - .015) reached = i; });
      arrive(reached); render();
    };
    const flight = gsap.to(c, { ...fit, duration: enabled ? 1.35 : 0, ease: "power3.inOut", paused: true, onUpdate: render });
    const playback = gsap.to(playhead, { progress: 1, duration: story ? 1.2 : 2.3, paused: true, ease: "power1.inOut", onUpdate: updateJourney });
    const sequence = gsap.timeline({ paused: true });
    pinStates.forEach((state, i) => sequence.fromTo(state, { y: -28, opacity: 0, scale: .6 }, { y: 0, opacity: 1, scale: pinScale, duration: .5, ease: "back.out(1.4)", onUpdate: renderPins, immediateRender: false }, (story ? 2.1 : .15) + i * .12));
    sequence.to(playhead, { progress: 1, duration: 1.2, ease: "power1.inOut", onUpdate: updateJourney }, story ? 2.5 : .5);
    const suspended = new Set<gsap.core.Animation>();
    const fly = (destination: Camera) => {
      playback.pause(); sequence.pause(); mode = "free"; flight.pause();
      if (!enabled) { Object.assign(c, destination); render(); return; }
      Object.assign(flight.vars, destination); flight.invalidate().restart();
    };
    const resetExtra = () => { addedPoint = null; setExtra(null); setPlaceDay(null); element.dataset.hasPin = "false"; if (customPin.current) customPin.current.style.opacity = "0"; };
    controller.current = {
      select(index) {
        callbacks.current.onInteract?.(); setSelection({ day, index }); resetExtra();
        showPins();
        const stop = journey.stops[index]; playhead.progress = stop.progress;
        fly({ ...fit, ...stop.point, scale: Math.min(fit.scale * 1.65, .95) }); arrive(index, true);
        if (enabled) { drops[index].restart(); pulses[index].restart(); } render();
      },
      zoom(factor) { callbacks.current.onInteract?.(); fly({ ...c, scale: clamp(c.scale * factor, Math.min(.035, fit.scale * .4), 1.4) }); },
      fit() { showPins(); callbacks.current.onInteract?.(); setSelection(null); resetExtra(); playhead.progress = 1; fly(fit); arrive(2, true); render(); },
      play() {
        showPins();
        callbacks.current.onInteract?.(); setSelection(null); resetExtra(); flight.pause(); sequence.pause(); Object.assign(c, fit);
        if (enabled) { mode = "follow"; playhead.progress = 0; playback.invalidate().restart(); } else { playhead.progress = 1; updateJourney(); }
      },
      pause(paused) {
        const motions = [flight, playback, sequence, customDrop, ...drops, ...pulses];
        if (paused) motions.forEach(t => { if (!t.paused() && t.progress() < 1) { suspended.add(t); t.pause(); } });
        else { suspended.forEach(t => t.resume()); suspended.clear(); }
      },
      pan(dx, dy) { callbacks.current.onInteract?.(); flight.pause(); playback.pause(); sequence.pause(); mode = "free"; c.x = clamp(c.x - dx / c.scale, MAP_BOUNDS.x, MAP_BOUNDS.x + MAP_BOUNDS.width); c.y = clamp(c.y - dy / c.scale, MAP_BOUNDS.y, MAP_BOUNDS.y + MAP_BOUNDS.height); render(); },
      drop(x = c.ax, y = c.ay) {
        callbacks.current.onInteract?.(); addedPoint = { x: clamp(c.x + (x - c.ax) / c.scale, MAP_BOUNDS.x, MAP_BOUNDS.x + MAP_BOUNDS.width), y: clamp(c.y + (y - c.ay) / c.scale, MAP_BOUNDS.y, MAP_BOUNDS.y + MAP_BOUNDS.height) };
        setExtra({ day, coordinate: unproject(addedPoint) }); setSelection(null); setPlaceDay(null); element.dataset.hasPin = "true";
        if (customPin.current) customPin.current.style.opacity = "1";
        fly({ ...c, ...addedPoint }); if (enabled) customDrop.restart(); render();
      },
    };
    map.setAttribute("viewBox", `0 0 ${width} ${height}`);
    element.dataset.hasPin = "false";
    if (customPin.current) customPin.current.style.opacity = "0";
    arrive(0, true);
    // A retained camera is the origin of the next day's cross-city flight.
    if (enabled) {
      if (story && !overview) { pinStates.forEach(p => p.opacity = 0); renderPins(); }
      fly(fit);
      if (!overview) { mode = "follow"; sequence.play(); }
    } else { Object.assign(c, fit); mode = "follow"; playhead.progress = 1; updateJourney(); }
    render();
    const observer = new ResizeObserver(() => {
      const nextW = element.clientWidth, nextH = element.clientHeight;
      if (Math.abs(nextW - width) < 1 && Math.abs(nextH - height) < 1) { render(); return; }
      width = nextW; height = nextH; fit = fitCamera(day, width, height, story, overview); Object.assign(c, fit);
      map.setAttribute("viewBox", `0 0 ${width} ${height}`); render();
    }); observer.observe(element); if (anchor.current) observer.observe(anchor.current);
    const unsubscribe = story ? scroll?.on("change", value => {
      if (!enabled || value < 0 || manualRef.current || !overview) return;
      overviewAmount = value;
      const from = fitCamera(2, width, height, true), to = fitCamera(2, width, height, true, true);
      flight.pause(); sequence.pause();
      const t = value * value * (3 - 2 * value);
      for (const key of ["x", "y", "ax", "ay", "scale"] as const) c[key] = from[key] + (to[key] - from[key]) * t;
      render();
    }) : undefined;
    if (!isRunning.current) controller.current.pause(true);
    return () => { observer.disconnect(); unsubscribe?.(); currentBodies.forEach(body => { body.removeAttribute("transform"); body.style.removeProperty("opacity"); }); controller.current = null; };
  }, { scope: root, dependencies: [day, enabled, interactive, immersive, story, overview, scroll, destination], revertOnUpdate: true });

  const beginPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || (story && !manual) || (event.target as Element).closest("[role=button]")) return;
    pointer.current = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, dragging: event.pointerType === "mouse" && !placing };
    if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    const p = pointer.current; if (!p) return;
    if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > 5) p.moved = true;
    if (p.dragging && p.moved) controller.current?.pan(event.clientX - p.lastX, event.clientY - p.lastY);
    p.lastX = event.clientX; p.lastY = event.clientY;
  };
  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    const p = pointer.current; pointer.current = null;
    if (!p || p.moved) return;
    const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return;
    const q = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); controller.current?.drop(q.x, q.y);
  };
  return <div ref={root} className={`geographic-map ${interactive ? "interactive-map" : "ambient-map"} ${story ? "story-map" : ""}`} data-destination={destination.id} data-immersive={immersive} data-overview={overview} data-manual={manual} data-placing={placing} data-day={day + 1}>
    <svg ref={svg} viewBox="0 0 620 400" className="journey-map" aria-label={interactive ? `${destination.name} 여행 지도. 장소를 선택하거나 지도 조작을 켜고 방향키와 Enter로 탐색하세요.` : undefined} aria-hidden={!interactive} role={interactive ? "group" : undefined} tabIndex={interactive && (!story || manual) ? 0 : undefined}
      onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={() => { pointer.current = null; }} onKeyDown={event => {
        if (!interactive || event.target !== event.currentTarget || (story && !manual)) return;
        const moves: Record<string, [number, number]> = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] };
        if (moves[event.key]) { event.preventDefault(); controller.current?.pan(...moves[event.key]); }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); controller.current?.drop(); }
      }}>
      <rect width="100%" height="100%" fill="var(--map-paper)" />
      <g ref={world} className="map-camera" transform={initialTransform}>
        <rect x="-10000" y="-10000" width="30000" height="30000" fill="var(--map-paper)" />
        <image className="map-base-light" href={`/maps/${destination.id}-base.svg`} {...MAP_BOUNDS} />
        <image className="map-base-dark" href={`/maps/${destination.id}-dark.svg`} {...MAP_BOUNDS} />
        {destination.id === "kyoto" && <path className="map-hills" d="M8300-5000C7920-1000 7700 300 7540 1350S7870 2200 7610 3100S8090 5100 8300 6500L15000 6500V-5000Z" fill="var(--park)" />}
        {JOURNEYS.map((trip, d) => <g key={d} className="journey-route-layer" data-day={d + 1} data-current={d === day} data-past={d < day} style={{ opacity: d === day || (story && (d < day || overview)) ? 1 : 0 }}>
          <path d={trip.path} fill="none" stroke="var(--map-paper)" strokeWidth="7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          <path className="map-traveled-route" data-day={d + 1} d={trip.path} pathLength="1" fill="none" stroke="var(--route-color)" strokeWidth={(4 / initial.scale).toFixed(3)} strokeDasharray="1 1" strokeLinecap="round" strokeLinejoin="round" />
        </g>)}
      </g>
      {MAP_LABELS.map((label, i) => <g key={label.name} className={`city-label ${label.major ? "city-label-major" : ""}`} aria-hidden="true" data-index={i}><text textAnchor="middle">{label.name}</text><text className="city-label-en" textAnchor="middle" y="19">{label.en}</text></g>)}
      <g aria-hidden="true" pointerEvents="none">{JOURNEYS.flatMap((trip, d) => trip.stops.map((_, i) => <path key={`${d}-${i}`} className="geo-pin-connector" data-day={d + 1} fill="none" stroke={`var(--route-day-${d + 1})`} strokeWidth="1" strokeDasharray="3 3" opacity="0" />))}</g>
      {JOURNEYS.flatMap((trip, d) => trip.stops.map((stop, i) => <g key={`${d}-${i}`} className="geo-pin" data-day={d + 1} data-index={i} data-current-day={d === day} data-past={d < day} style={{ visibility: d === day || (story && (d < day || overview)) ? "visible" : "hidden" }}
        role={interactive && d === day && !overview ? "button" : undefined} tabIndex={interactive && d === day && !overview ? 0 : undefined} aria-hidden={d !== day || overview || !interactive} aria-label={interactive && d === day ? `${i + 1}${stop.name}로 지도 이동` : undefined} aria-pressed={interactive && d === day ? selected === i : undefined}
        onClick={interactive && d === day && !overview ? () => controller.current?.select(i) : undefined} onKeyDown={interactive && d === day && !overview ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); controller.current?.select(i); } } : undefined}>
        <circle r="25" cy="-16" fill="transparent" /><circle className="geo-pin-ripple" r="16" fill="none" stroke="var(--route-color)" strokeWidth="1" opacity="0" /><ellipse cy="3" rx="8" ry="3" fill="#26272425" />
        <g className="geo-pin-body"><path d="M0 -9V0" stroke="var(--route-color)" strokeWidth="2" /><circle className="geo-pin-shape" cy="-26" r="17" fill="var(--route-color)" stroke="var(--map-paper)" strokeWidth="2" /><text y="-21" textAnchor="middle" fill="var(--route-ink)" fontSize="13" fontWeight="600">{i + 1}</text></g>
        <g className="geo-pin-name" transform="translate(28 -19)"><text y="0" fontSize="13">{stop.name}</text></g>
      </g>))}
      {JOURNEYS.map((_, i) => <g key={i} className="map-chapter-label" aria-hidden="true"><rect x="-38" y="-52" width="76" height="27" rx="13.5" fill="#FFFFFF" /><text textAnchor="middle" y="-34">Day {i + 1}</text></g>)}
      <g ref={traveler} className="map-traveler" pointerEvents="none"><circle r="11" fill="var(--route-color)" fillOpacity=".15" /><circle r="5" fill="var(--route-color)" stroke="#FFFFFF" strokeWidth="2" /></g>
      <g ref={customPin} className="custom-map-pin" opacity="0" pointerEvents="none"><g className="custom-pin-body"><path d="M0 0C-5-8-18-16-18-29a18 18 0 0 1 36 0C18-16 5-8 0 0Z" fill="#262724" stroke="#FFFFFF" strokeWidth="2" /><path d="M-5-29H5M0-34V-24" stroke="#FFFFFF" strokeWidth="2" /></g></g>
      {story && <path ref={leader} className="hero-card-leader" fill="none" stroke="#797367" strokeOpacity=".35" strokeWidth="1" pointerEvents="none" />}
    </svg>
    {story && <div ref={anchor} className="hero-anchor">{children}</div>}
    {interactive && <>
      <div className="map-location-readout"><output ref={coordinateLabel} className="map-coordinate" aria-label="지도 좌표" aria-live="off">{formatCoordinate(journey.stops[0].coordinate)}</output><span className="map-readout-divider">/</span><span className="map-current-place">{journey.stops[0].name}</span></div>
      <div className="map-tools" inert={story && !manual} aria-hidden={story && !manual}><div className="map-control-bar" aria-label="지도 조작">
        <button type="button" onClick={() => controller.current?.play()} aria-label="경로 따라가기" title="경로 따라가기"><Play size={16} /></button><button type="button" onClick={() => controller.current?.zoom(1.35)} aria-label="지도 확대" title="확대"><Plus size={17} /></button><button type="button" onClick={() => controller.current?.zoom(1 / 1.35)} aria-label="지도 축소" title="축소"><Minus size={17} /></button><button type="button" onClick={() => controller.current?.fit()} aria-label="전체 경로 보기" title="전체 경로 보기"><Crosshair size={17} /></button><button type="button" onClick={() => { callbacks.current.onInteract?.(); setPlaceDay(value => value === day ? null : day); if (!placing) svg.current?.focus({ preventScroll: true }); }} aria-label="지도에 핀 찍기" aria-pressed={placing} title="핀 찍기"><MapPinPlus size={17} /></button>
      </div></div>
      {placing && <div className="map-place-hint" role="status">마음에 드는 곳을 눌러 핀을 찍어보세요.</div>}
      {added && <div className="map-added-note" role="status"><span>나의 작은 발견</span><span>{formatCoordinate(added)}</span><button type="button" onClick={() => controller.current?.fit()} aria-label="새 핀 지우기"><RotateCcw size={16} /></button></div>}
    </>}
    <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">예시 일정 · 경로 © OpenStreetMap</a>
  </div>;
}

export function JourneyStops({ day, onSelect }: { day: number; onSelect: (index: number) => void }) {
  const { destination } = useDestination();
  const JOURNEYS = destination.map.journeys;
  return <div className="journey-stop-rail" aria-label="여행 장소 바로가기">{JOURNEYS[day].stops.map((stop, i) => <button className="map-stop-button" type="button" key={stop.name} onClick={() => onSelect(i)}><span>{String(i + 1).padStart(2, "0")}</span>{stop.name}</button>)}</div>;
}
