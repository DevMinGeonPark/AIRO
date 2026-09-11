"use client";

import { useState } from "react";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Tailscale HTTP previews lack the secure-context Clipboard API.
  const input = document.createElement("textarea");
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  input.value = text;
  input.readOnly = true;
  input.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    input.remove();
    focused?.focus({ preventScroll: true });
  }
}

/** 문서·랜딩 공용 코드 블록. 복사 버튼이 붙는다. */
export function CodeBlock({ code, className = "", label }: { code: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`group relative ${className}`}>
      <pre className="bg-muted/50 overflow-x-auto rounded-xl border p-4 pr-14 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label={label ? `${label} 복사` : undefined}
        onClick={async () => {
          try {
            await copyText(code);
            setCopied(true); setFailed(false);
            setTimeout(() => setCopied(false), 1500);
          } catch { setFailed(true); }
        }}
        className="bg-background text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
      >
        {copied ? "복사됨" : "복사"}
      </button>
      {failed && <p role="status" className="text-muted-foreground mt-2 text-xs">복사를 허용하지 않는 브라우저입니다. 코드를 선택해 직접 복사해 주세요.</p>}
    </div>
  );
}
