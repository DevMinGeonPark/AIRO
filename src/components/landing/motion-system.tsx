"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MotionConfig, motion, useMotionValue, useSpring } from "motion/react";
import { ReactLenis, useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Pause, Play } from "lucide-react";
import { ANIMATIONS_ENABLED } from "@/lib/animation-config";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const subscribeReducedMotion = (notify: () => void) => {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const getReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const MotionContext = createContext({ enabled: false, fade: false, paused: false, toggle: () => {} });
export const useLandingMotion = () => useContext(MotionContext);

function ScrollDriver({ enabled }: { enabled: boolean }) {
  const lenis = useLenis(ScrollTrigger.update);
  useGSAP(() => {
    if (!enabled || !lenis) return;
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); gsap.ticker.lagSmoothing(500, 33); };
  }, { dependencies: [enabled, lenis], revertOnUpdate: true });
  return null;
}

/** The app keeps native scrolling. Only the existing home route uses Lenis. */
export function LandingMotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A stable server snapshot prevents reduced-motion users receiving different HTML during hydration.
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const [paused, setPaused] = useState(false);
  const enabled = ANIMATIONS_ENABLED && !reduced && !paused;
  const options = useMemo(() => ({ autoRaf: false, smoothWheel: enabled, syncTouch: false, lerp: 0.085, anchors: { offset: -90 } }), [enabled]);
  const value = useMemo(() => ({ enabled, fade: ANIMATIONS_ENABLED && !paused, paused, toggle: () => setPaused(p => !p) }), [enabled, paused]);
  if (pathname !== "/") return children;
  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={enabled ? "never" : "always"}>
        <ReactLenis root options={options}>
          <ScrollDriver enabled={enabled} />
          {children}
        </ReactLenis>
      </MotionConfig>
    </MotionContext.Provider>
  );
}

export function LandingSurface({ children }: { children: ReactNode }) {
  const { enabled, fade } = useLandingMotion();
  return <div className="landing" data-motion={enabled ? "on" : fade ? "reduced" : "off"}>{children}</div>;
}

export function MotionToggle() {
  const { paused, toggle } = useLandingMotion();
  if (!ANIMATIONS_ENABLED) return null;
  return <button className="motion-toggle" onClick={toggle} aria-label={paused ? "애니메이션 재생" : "애니메이션 일시정지"} aria-pressed={paused} title={paused ? "애니메이션 재생" : "애니메이션 일시정지"}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>;
}

export function NavFrame({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <header className="landing-nav" data-scrolled={scrolled} onClick={event => { if ((event.target as Element).closest("a")) event.currentTarget.querySelectorAll("details[open]").forEach(el => el.removeAttribute("open")); }}><div className="nav-glass" /><div className="nav-inner">{children}</div></header>;
}

export function MagneticLink({ children, href, className = "", axis = "both" }: { children: ReactNode; href: string; className?: string; axis?: "both" | "y" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { enabled } = useLandingMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 180, damping: 16 });
  const springY = useSpring(y, { stiffness: 180, damping: 16 });
  useEffect(() => {
    if (!enabled || !matchMedia("(hover: hover) and (pointer: fine)").matches) { x.set(0); y.set(0); return; }
    const onMove = (event: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const dx = event.clientX - (box.left + box.width / 2), dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(Math.max(Math.abs(dx) - box.width / 2, 0), Math.max(Math.abs(dy) - box.height / 2, 0));
      const near = distance <= 60;
      x.set(near ? Math.max(-8, Math.min(8, dx * 0.13)) : 0);
      y.set(near ? Math.max(-8, Math.min(8, dy * 0.13)) : 0);
    };
    const reset = () => { x.set(0); y.set(0); };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", reset);
    return () => { window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", reset); };
  }, [enabled, x, y]);
  return <span className="magnetic-wrap" ref={ref}><motion.span style={{ x: enabled && axis === "both" ? springX : 0, y: enabled ? springY : 0 }}><Link href={href} prefetch={false} className={`journey-button ${className}`}>{children}</Link></motion.span></span>;
}

/** Progressive enhancement: server-rendered headings stay visible without JS. */
export function Reveal({ children, className = "", words = false }: { children: ReactNode; className?: string; words?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, fade } = useLandingMotion();
  useGSAP(() => {
    if (!fade) return;
    const targets = words ? ref.current?.querySelectorAll("[data-word]") : ref.current;
    if (!targets) return;
    gsap.from(targets, { y: enabled ? 24 : 0, opacity: 0, duration: 0.7, stagger: words ? 0.07 : 0, ease: "power3.out", scrollTrigger: { trigger: ref.current, start: "top 80%", once: true } });
  }, { scope: ref, dependencies: [enabled, fade, words], revertOnUpdate: true });
  return <div ref={ref} className={className}>{children}</div>;
}

const subscribeVisibility = (notify: () => void) => { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); };
export function usePageVisible() { return useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true); }
