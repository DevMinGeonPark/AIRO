"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyPlaceName({ name }: { name: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(name); setState("copied"); }
    catch { setState("failed"); }
    timer.current = setTimeout(() => setState("idle"), 3000);
  }
  return <span className="inline-flex shrink-0 flex-col items-start">
    <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-normal text-muted-foreground hover:text-foreground" aria-label={`${name} 복사`} title={`${name} 복사`} onClick={() => void copy()}>
      {state === "copied" ? <Check size={14} /> : <Copy size={14} />}<span aria-live="polite">{state === "copied" ? "복사됨" : "복사"}</span>
    </button>
    {state === "failed" && <span role="status" className="max-w-40 text-xs">복사 권한이 없어요. 이름을 길게 눌러 복사해 주세요.</span>}
  </span>;
}
