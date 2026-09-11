import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ArrowUpRight } from "lucide-react";
import { MagneticLink, NavFrame, Reveal } from "@/components/landing/motion-system";
import { CtaStage } from "@/components/landing/scroll-scenes";
import { MobileNav } from "@/components/mobile-nav";

/** 섹션 제목 위에 붙는 작은 브랜드 라벨. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-sm font-medium text-primary dark:text-primary">
      {children} ›
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  /** 두 줄로 끊어 쓴다. */
  title: [string, string];
  body: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-[2.6rem]">
        {title[0]}
        <br />
        {title[1]}
      </h2>
      <p className="text-muted-foreground mt-5 leading-relaxed text-pretty">
        {body}
      </p>
    </div>
  );
}

/**
 * 우리 시각 모티프: 항공은 보조색 점선 곡선, 육상은 블루 실선.
 * 지도 위에 그리는 선과 같은 규칙이라 장식이 아니라 제품 언어다.
 */
export function RouteLine({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      aria-hidden
      className={`h-12 w-full ${className}`}
    >
      <path
        d="M0 46 Q 320 -6 620 30 T 1200 18"
        fill="none"
        stroke="var(--route-flight)"
        strokeWidth="2"
        strokeDasharray="7 6"
        opacity="0.55"
      />
      <path
        d="M0 54 Q 400 40 700 48 T 1200 40"
        fill="none"
        stroke="var(--route-ground)"
        strokeWidth="2"
        opacity="0.4"
      />
      <circle cx="620" cy="30" r="4" fill="var(--route-ground)" opacity="0.7" />
      <circle cx="1200" cy="18" r="4" fill="var(--route-flight)" opacity="0.7" />
    </svg>
  );
}

const navLinks = [
  { href: "/#기능", label: "기능" },
  { href: "/#mcp", label: "MCP 연동" },
  { href: "/pricing", label: "요금제" },
  { href: "/app", label: "내 여행" },
];

export function Nav({ premium = false }: { premium?: boolean }) {
  if (premium) return <NavFrame>
    <Link href="/" aria-label="아이로 AIRO 홈"><Logo /></Link>
    <nav className="desktop-nav" aria-label="주 메뉴">{navLinks.map(l => <Link key={l.href} href={l.href} prefetch={false} className="nav-link">{l.label}</Link>)}</nav>
    <MobileNav links={navLinks} />
  </NavFrame>;
  return (
    <header className="public-header bg-background/90 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center px-6">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden flex-1 justify-center gap-7 text-sm md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <MobileNav links={navLinks} className="public-mobile-nav" />
      </div>
    </header>
  );
}

const footerCols: { title: string; items: { label: string; href?: string }[] }[] = [
  {
    title: "제품",
    items: [
      { label: "내 여행", href: "/app" },
      { label: "요금제", href: "/pricing" },
      { label: "로그인", href: "/login" },
    ],
  },
  {
    title: "연동",
    items: [
      { label: "MCP 연동 문서", href: "/docs/mcp" },
      { label: "API 키", href: "/app/settings/keys" },
    ],
  },
  {
    title: "지도",
    items: [{ label: "CARTO · OpenStreetMap" }, { label: "Photon · Nominatim" }],
  },
  {
    title: "안내",
    items: [{ label: "이용약관 준비 중" }, { label: "개인정보처리방침 준비 중" }],
  },
];

export function Footer({ premium = false }: { premium?: boolean }) {
  return (
    <footer className={premium ? "landing-footer" : "border-t"}>
      <div className="mx-auto max-w-6xl px-6 py-14">
        {premium && <div className="footer-brand"><Logo /></div>}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerCols.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-medium">{col.title}</h3>
              <ul className="mt-3 space-y-2 text-xs">
                {col.items.map((it) => (
                  <li key={it.label}>
                    {it.href ? (
                      <Link
                        href={it.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {it.label}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{it.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-12 text-xs">
          아이로 — 어디로든, AI와 함께.
        </p>
      </div>
    </footer>
  );
}

/** 최하단 반복 CTA. 히어로와 같은 하늘을 다시 쓴다. */
export function ClosingCta({ premium = false }: { premium?: boolean }) {
  if (premium) return <CtaStage><Reveal className="cta-content"><h2>다음 여행,<br />아이로와 떠나볼까요?</h2><p>가고 싶은 곳 하나면 충분해요. 나머지는 함께 채워가요.</p><MagneticLink href="/app" className="cta-button">시작하기 <ArrowUpRight size={17} /></MagneticLink></Reveal></CtaStage>;
  return (
    <section className="sky border-t">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-[2.6rem]">
          다음 여행,
          <br />
          아이로와 떠나볼까요?
        </h2>
        <p className="text-muted-foreground mt-5">
          가고 싶은 곳 하나면 충분해요. 나머지는 함께 채워가요.
        </p>
        <Link
          href="/app"
          className={buttonVariants({ size: "lg", className: "mt-8 rounded-full px-7" })}
        >
          시작하기
        </Link>
      </div>
    </section>
  );
}
