"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLenis } from "lenis/react";
import { useDestination } from "./destination-context";
import { JourneyStageContext, useJourneyStage } from "./journey-scroll";
import { useLandingMotion } from "./motion-system";
import { GlobeArrival } from "./globe-arrival";
import { DiningConversation } from "./dining-conversation";
import { LiveJourneyMapContext } from "./live-journey-map";
import type { Map } from "maplibre-gl";
export { JourneyMap } from "./journey-map";

gsap.registerPlugin(CustomEase, ScrollTrigger);
CustomEase.create("airo-reveal", "0.22,1,0.36,1");

/** A single pinned geographic scene: the intro fades as the conversation unfolds. */
export function HeroStage({ children }: { children: ReactNode }) {
  const { destination } = useDestination();
  const ref = useRef<HTMLElement>(null);
  const sequence = useRef<ScrollTrigger | null>(null);
  const controlled = useRef(false);
  const [arrived, setArrived] = useState(false);
  const [flying, setFlying] = useState(false);
  const [storyStep, setStoryStep] = useState(0);
  const { enabled, fade } = useLandingMotion();
  const lenis = useLenis();
  const seek = useCallback((progress: number) => {
    const scene = sequence.current;
    if (!scene) return;
    const top = scene.start + progress * (scene.end - scene.start);
    if (lenis) lenis.scrollTo(top, { immediate: true });
    else window.scrollTo({ top, behavior: "instant" });
    ScrollTrigger.update();
  }, [lenis]);
  const arrive = useCallback(() => { controlled.current = false; setStoryStep(1); setFlying(false); setArrived(true); }, []);
  const resetArrival = useCallback(() => {
    controlled.current = false;
    setArrived(false); setFlying(false); setStoryStep(0);
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [lenis]);
  const takeControl = useCallback(() => { controlled.current = true; }, []);
  const replayStory = useCallback(() => { controlled.current = false; setStoryStep(1); seek(0); }, [seek]);
  useGSAP(() => {
    if (!fade) return;
    gsap.from("[data-hero-reveal]", { y: enabled ? 12 : 0, duration: .7, delay: .15, stagger: .1, ease: "power3.out", clearProps: "all" });
  }, { scope: ref, dependencies: [fade], revertOnUpdate: true });
  const active = flying || arrived;
  useGSAP(() => {
    const element = ref.current, grid = element?.querySelector<HTMLElement>(".hero-grid");
    if (!element || !grid) return;
    const copy = element.querySelector<HTMLElement>(".hero-copy");
    if (copy) { copy.inert = active; copy.setAttribute("aria-hidden", String(active)); }
    const paint = (progress: number) => {
      element.dataset.storyProgress = progress.toFixed(3);
      if (!controlled.current && element.dataset.arrival === "landed") setStoryStep(progress < .20 ? 1 : progress < .60 ? 2 : progress < .78 ? 3 : 4);
    };
    paint(0);
    if (!active) return;
    const scene = ScrollTrigger.create({ id: "airo-conversation-story", trigger: element, start: "top top", end: () => `+=${grid.offsetHeight * 2.5}`, invalidateOnRefresh: true,
      onUpdate: self => paint(self.progress), onRefresh: self => paint(self.progress) });
    sequence.current = scene;
    // The data layer may finish loading after the scroll scene is established.
    const observer = new MutationObserver(() => paint(scene.progress));
    observer.observe(grid, { childList: true, subtree: true });
    return () => { observer.disconnect(); scene.kill(); sequence.current = null; };
  }, { scope: ref, dependencies: [active], revertOnUpdate: true });
  return <JourneyStageContext.Provider value={{ arrived, arrive, resetArrival, setFlying, storyStep, scrollDriven: true, takeControl, replayStory }}>
    <section ref={ref} className="hero-section" data-arrival={arrived ? "landed" : flying ? "flying" : "globe"} data-destination={destination.id} data-story-step={storyStep}>{children}
    </section>
  </JourneyStageContext.Provider>;
}

export function TravelPreview() {
  const { destination } = useDestination();
  const { arrived, arrive, resetArrival, setFlying } = useJourneyStage();
  const [map, setMap] = useState<Map | null>(null);
  const [globeSession, setGlobeSession] = useState(0);
  const back = () => { setMap(null); setGlobeSession(value => value + 1); resetArrival(); };
  return <LiveJourneyMapContext.Provider value={{ map, setMap }}><div className="hero-map">
    <div className="conversation-globe-layer" inert={arrived} aria-hidden={arrived}><GlobeArrival key={globeSession} arrived={arrived} onArrive={arrive} onFlight={setFlying} /></div>
    <div className="conversation-map-layer" data-visible={arrived} inert={!arrived} aria-hidden={!arrived}><DiningConversation key={destination.id} onReturn={back} /></div>
  </div></LiveJourneyMapContext.Provider>;
}
