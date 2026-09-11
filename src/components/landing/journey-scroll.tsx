"use client";

import { createContext, useContext } from "react";
import type { MotionValue } from "motion/react";

/** Overview progress is delivered without a React render on every scroll frame. */
export const JourneyScrollContext = createContext<MotionValue<number> | null>(null);
export const useJourneyScroll = () => useContext(JourneyScrollContext);
export const JourneyStageContext = createContext({ arrived: false, arrive: () => {}, resetArrival: () => {}, setFlying: (flying: boolean) => { void flying; }, storyStep: 0, scrollDriven: false, takeControl: () => {}, replayStory: () => {} });
export const useJourneyStage = () => useContext(JourneyStageContext);
