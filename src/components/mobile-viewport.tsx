"use client";

import { useEffect, useSyncExternalStore } from "react";

const compactQuery = "(max-width: 1023px)";
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
export function useCompactViewport() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(compactQuery).matches, () => false);
}

/** Keep full-screen tools inside the visible area when a mobile keyboard opens. */
export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (viewport && viewport.scale > 1.05) return;
        const height = viewport?.height ?? window.innerHeight;
        root.style.setProperty("--visible-height", `${height}px`);
        root.style.setProperty("--visible-top", `${viewport?.offsetTop ?? 0}px`);
        const typing = document.activeElement?.matches("input, textarea, select, [contenteditable=true]");
        root.dataset.keyboardOpen = String(Boolean(typing && window.innerHeight - height > 120));
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--visible-height");
      root.style.removeProperty("--visible-top");
      delete root.dataset.keyboardOpen;
    };
  }, []);
  return null;
}
