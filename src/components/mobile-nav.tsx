"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

export function MobileNav({ links = [], children, className = "mobile-nav", label = "메뉴", summaryLabel = "메뉴 열기", navLabel = "모바일 주 메뉴" }: {
  links?: { href: string; label: string }[];
  /** 링크 외에 메뉴에 넣을 것 (내보내기 `<a>`, 로그아웃 폼 등). 안의 a·button 을 누르면 메뉴가 닫힌다. */
  children?: ReactNode;
  className?: string;
  label?: ReactNode;
  summaryLabel?: string;
  navLabel?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const close = () => { if (ref.current) ref.current.open = false; };
  return <details ref={ref} className={className} onKeyDown={event => {
    if (event.key === "Escape" && ref.current) {
      event.preventDefault(); close();
      ref.current.querySelector("summary")?.focus({ preventScroll: true });
    }
  }}>
    <summary aria-label={summaryLabel}>{label}</summary>
    <nav aria-label={navLabel} onClick={event => { if ((event.target as Element).closest("a, button")) close(); }}>
      {links.map(link => <Link key={link.href} href={link.href} prefetch={false}>{link.label}</Link>)}
      {children}
    </nav>
  </details>;
}
