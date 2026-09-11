"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/types";
import { planLabel } from "@/ee/plans";

/* ── 다크 모드 ──────────────────────────────────────────────────────
 * 상태는 <html class="dark"> 하나. 헤더 토글이 그걸 뒤집고, 지도처럼
 * 클래스만으로는 못 따라오는 곳은 useDarkMode 로 구독한다.
 * ------------------------------------------------------------------ */
const subscribe = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => o.disconnect();
};

export function useDarkMode() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );
}

export function DarkToggle() {
  const dark = useDarkMode();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label={dark ? "라이트 모드로" : "다크 모드로"}
      onClick={() => {
        const next = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", next);
        document.documentElement.classList.toggle("light", !next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }}
    >
      <span className="text-[15px] leading-none">{dark ? "☀" : "☾"}</span>
    </Button>
  );
}

/* ── 앱 헤더 ─────────────────────────────────────────────────────── */

const links = [
  { href: "/app", label: "내 여행" },
  { href: "/app/settings/ai", label: "내 AI 연결" },
  { href: "/app/settings/import", label: "가져오기" },
  { href: "/app/settings/keys", label: "MCP 연결" },
  { href: "/docs/mcp", label: "MCP 문서" },
];

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app" || /^\/app\/(?!settings)/.test(pathname);
  return pathname.startsWith(href);
}

/**
 * 로그인 이후 화면들이 공유하는 헤더. 랜딩 Nav 와 같은 높이·폭·타이포를 쓴다.
 * `wide` 는 워크스페이스처럼 화면을 꽉 채우는 라우트용.
 */
export function AppHeader({
  plan,
  showSignOut,
  wide,
  center,
}: {
  plan?: Plan;
  showSignOut?: boolean;
  wide?: boolean;
  /** 헤더 가운데에 끼워 넣을 것 (워크스페이스의 여행 제목 등) */
  center?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <header className="app-header bg-card/90 sticky top-0 z-50 shrink-0 border-b backdrop-blur">
      <div
        className={`app-header-row flex min-h-16 items-center gap-3 px-4 sm:gap-5 sm:px-6 ${wide ? "" : "mx-auto max-w-6xl"}`}
      >
        <Link href="/app" className="shrink-0">
          <Logo />
        </Link>

        {center ? <div className="app-header-center min-w-0 flex-1">{center}</div> : (
          <nav className="hidden gap-1 text-sm md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={
                  isActive(pathname, l.href)
                    ? "rounded-full bg-secondary px-3.5 py-2 text-primary font-medium"
                    : "rounded-full px-3.5 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {plan && (
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground hidden rounded-full border px-2.5 py-1 text-xs transition-colors sm:block"
            >
              {planLabel(plan)}
            </Link>
          )}
          <DarkToggle />
          {showSignOut && (
            <form action="/auth/signout" method="post">
              {/* base-ui Button renders type="button"; a plain form needs an explicit submit. */}
              <Button type="submit" variant="ghost" size="sm" className="rounded-full">
                로그아웃
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* 좁은 화면에서는 링크를 헤더 아래 줄로 내린다 */}
      {!center && (
        <nav aria-label="앱 메뉴" className="app-mobile-nav flex gap-2 overflow-x-auto border-t px-4 text-sm md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={
                isActive(pathname, l.href)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
