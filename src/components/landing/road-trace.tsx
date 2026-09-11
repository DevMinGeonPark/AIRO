"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useLandingMotion } from "./motion-system";

/** Draw the actual projected road and move a light along that same geometry. */
export function RoadTrace({ path, className, muted = false, startProgress = 0, onComplete }: { path: string; className: string; muted?: boolean; startProgress?: number; onComplete: () => void }) {
  const { enabled } = useLandingMotion();
  const line = useRef<SVGPathElement>(null), light = useRef<SVGGElement>(null);
  const progress = useRef(startProgress), completed = useRef(false), callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const element = line.current, marker = light.current;
    if (!element || !marker) return;
    const paint = (value: number) => {
      progress.current = value;
      element.style.strokeDashoffset = String(1 - value);
      element.dataset.progress = value.toFixed(3);
      const point = element.getPointAtLength(element.getTotalLength() * value);
      marker.setAttribute("transform", `translate(${point.x},${point.y})`);
      marker.style.opacity = value >= 1 ? "0" : "1";
    };
    const finish = () => { paint(1); if (!completed.current) { completed.current = true; callback.current(); } };
    if (!enabled || muted || completed.current) { finish(); return; }
    paint(progress.current);
    const controls = animate(progress.current, 1, { duration: 2.2, delay: .25, ease: [.45, 0, .25, 1], onUpdate: paint, onComplete: finish });
    return () => controls.stop();
  }, [enabled, muted]);
  return <g opacity={muted ? .22 : 1}>
    <path ref={line} className={className} d={path} data-start-progress={startProgress.toFixed(3)} pathLength={1} fill="none" stroke="var(--primary)" strokeWidth={muted ? 2 : 3.5} strokeDasharray="1" strokeDashoffset={1 - startProgress} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    <g ref={light} className="journey-route-light" opacity="0" aria-hidden="true"><circle r="13" fill="var(--primary)" opacity=".15" /><circle r="6" fill="var(--primary)" opacity=".35" /><circle r="3" fill="#F3F1EA" /></g>
  </g>;
}
