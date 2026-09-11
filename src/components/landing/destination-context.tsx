"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DEFAULT_DESTINATION, DESTINATIONS, type LandingDestination } from "@/lib/landing-destinations";
import type { GlobeView } from "@/lib/landing-regions";

const DestinationContext = createContext({ destination: DEFAULT_DESTINATION, globeTarget: DEFAULT_DESTINATION, lastInteraction: 0, selectDestination: (id: string) => { void id; }, spotlightDestination: (id: string) => { void id; }, globeView: "world" as GlobeView, setGlobeView: (view: GlobeView) => { void view; } });

export function DestinationProvider({ children }: { children: ReactNode }) {
  const [destination, setDestination] = useState<LandingDestination>(DEFAULT_DESTINATION);
  const [globeTarget, setGlobeTarget] = useState(DEFAULT_DESTINATION);
  const [lastInteraction, setLastInteraction] = useState(0);
  const [globeView, updateGlobeView] = useState<GlobeView>("world");
  const selectDestination = useCallback((id: string) => {
    const next = DESTINATIONS.find(destination => destination.id === id);
    if (next) { setDestination(next); setGlobeTarget(next); updateGlobeView("destination"); setLastInteraction(Date.now()); }
  }, []);
  // An automatic spotlight updates the preview without steering the rotating globe.
  const spotlightDestination = useCallback((id: string) => {
    const next = DESTINATIONS.find(destination => destination.id === id);
    if (next) setDestination(next);
  }, []);
  const setGlobeView = useCallback((view: GlobeView) => {
    updateGlobeView(view); setLastInteraction(Date.now());
  }, []);
  return <DestinationContext.Provider value={{ destination, globeTarget, lastInteraction, selectDestination, spotlightDestination, globeView, setGlobeView }}>{children}</DestinationContext.Provider>;
}

export const useDestination = () => useContext(DestinationContext);
