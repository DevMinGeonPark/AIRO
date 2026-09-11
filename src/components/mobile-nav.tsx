"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export function MobileNav({ links, className = "mobile-nav" }: { links: { href: string; label: string }[]; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={ref} className={className} onKeyDown={event => {
    if (event.key === "Escape" && ref.current) {
      event.preventDefault(); ref.current.open = false;
      ref.current.querySelector("summary")?.focus({ preventScroll: true });
    }
  }}>
    <summary aria-label="메뉴 열기">메뉴</summary>
    <nav aria-label="모바일 주 메뉴">{links.map(link => <Link key={link.href} href={link.href} prefetch={false} onClick={() => { if (ref.current) ref.current.open = false; }}>{link.label}</Link>)}</nav>
  </details>;
}
