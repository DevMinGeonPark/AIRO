import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ClosingCta, Footer, Nav, RouteLine, SectionHeading } from "@/components/marketing";
import { FREE_TRIP_LIMIT } from "@/lib/types";

export const metadata = { title: "요금제 — 아이로" };

const plans = [
  {
    name: "무료",
    price: "₩0",
    per: "",
    body: "여행 몇 개 짜보기에 충분합니다.",
    features: [
      `여행 ${FREE_TRIP_LIMIT}개까지`,
      "지도 · 일정 · 대화 전부",
      "장소 검색과 담기",
      "구글지도 · 길찾기 연결",
    ],
    cta: "시작하기",
    href: "/app",
    highlight: false,
  },
  {
    name: "프로",
    price: "₩7,900",
    per: "/월",
    body: "여행이 쌓이기 시작하면.",
    features: [
      "여행 무제한",
      "MCP 연동 (Aside · Claude)",
      "대화 기록 오래 보관",
      "일정 공유 링크 (준비 중)",
    ],
    cta: "준비 중",
    href: "/pricing",
    highlight: true,
  },
];

const faq = [
  {
    q: "무료로 어디까지 되나요?",
    a: `여행 ${FREE_TRIP_LIMIT}개까지는 지도, 일정, 대화, 장소 검색이 전부 열려 있습니다. 기능을 잘라두지 않았습니다.`,
  },
  {
    q: "MCP 연동은 뭔가요?",
    a: "쓰던 AI 도구에 아이로 서버 주소와 토큰을 넣으면, 그 안에서 여행을 만들고 장소를 찾아 일정에 담을 수 있습니다.",
  },
  {
    q: "결제는 언제 열리나요?",
    a: "아직입니다. 결제사를 고르는 중이라 지금은 모든 기능이 무료로 열려 있습니다.",
  },
];

export default function Pricing() {
  return (
    <>
      <Nav />

      <main>
        <section className="sky">
          <div className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
            <p className="text-sm font-medium text-primary dark:text-primary">요금제 ›</p>
            <h1 className="mt-4 text-4xl leading-[1.15] font-semibold tracking-tight sm:text-5xl">
              먼저 써보고
              <br />
              필요해지면 올리세요
            </h1>
            <p className="text-muted-foreground mt-6 leading-relaxed">
              여행이 {FREE_TRIP_LIMIT}개를 넘어가기 전까지는 고민할 일이 없습니다.
            </p>
          </div>

          <div className="mx-auto max-w-4xl px-6 pb-24">
            <div className="grid gap-6 sm:grid-cols-2">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={`bg-background rounded-2xl border p-7 ${
                    p.highlight ? "border-foreground/25 shadow-sm" : ""
                  }`}
                >
                  <h2 className="font-medium">{p.name}</h2>
                  <div className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-muted-foreground text-sm">{p.per}</span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">{p.body}</p>
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="text-muted-foreground flex gap-2">
                        <span className="text-primary dark:text-primary">·</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {/* TODO(결제): 결제사(Stripe / 토스페이먼츠) 결정되면 이 버튼을 체크아웃
                      세션 생성 호출로 교체. 성공 시 웹훅이 public.subscriptions 를
                      plan='pro' 로 갱신한다. */}
                  <Link
                    href={p.href}
                    aria-disabled={p.highlight}
                    className={buttonVariants({
                      className: `mt-7 w-full rounded-full ${
                        p.highlight ? "pointer-events-none opacity-55" : ""
                      }`,
                      variant: p.highlight ? "outline" : "default",
                    })}
                  >
                    {p.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y bg-neutral-50 dark:bg-neutral-950">
          <div className="mx-auto max-w-6xl px-6 py-28">
            <SectionHeading
              eyebrow="자주 묻는 것"
              title={["궁금할 만한 것", "몇 가지"]}
              body="더 물어볼 게 있으면 알려주세요. 아직 초기라 대부분 바꿀 수 있습니다."
            />
            <RouteLine className="mt-10 opacity-70" />
            <dl className="mx-auto mt-6 grid max-w-4xl gap-8 md:grid-cols-3">
              {faq.map((f) => (
                <div key={f.q}>
                  <dt className="text-sm font-medium">{f.q}</dt>
                  <dd className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {f.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <ClosingCta />
      <Footer />
    </>
  );
}
