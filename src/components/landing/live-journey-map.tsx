"use client";

import { createContext, useContext } from "react";
import type { Map } from "maplibre-gl";

export const LiveJourneyMapContext = createContext<{ map: Map | null; setMap: (map: Map | null) => void }>({ map: null, setMap: () => {} });
export const useLiveJourneyMap = () => useContext(LiveJourneyMapContext);
