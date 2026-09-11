"use client";

import { LogoMark } from "@/components/logo";

import Link from "next/link";
import { useState } from "react";
import type { BudgetSnapshot, Tier } from "@/lib/archive";
import type { Trip } from "@/lib/types";

const krw = (n: number) => n.toLocaleString("ko-KR") + "원";
const yen = (n: number) => "¥" + n.toLocaleString("ko-KR");
const man = (n: number) => `약 ${Math.round(n / 10_000).toLocaleString("ko-KR")}만 원`;

export function TripBudget({ trip, budget }: { trip: Trip; budget: BudgetSnapshot }) {
  const { DAY_KEYS, assumptions, dailyDrivers, japanItems, koreaItems, paid, paidTotal, risks, sources, TIERS, YEN } = budget;
  const korea = koreaItems;
  const won = (yen: number) => yen * YEN;
  const totals = (tier: Tier) => budget.totalsByTier[tier];
  const byDayBudget = (tier: Tier) => budget.daysByTier[tier];
  const DATES: Record<number, string> = Object.fromEntries(budget.daysByTier.normal.map((d) => [d.day, d.date]));
  const [tier, setTier] = useState<Tier>("normal");
  const [day, setDay] = useState<number | null>(null);
  const t = totals(tier);
  const active = TIERS.find((x) => x.key === tier)!;
  const perDay = byDayBudget(tier);
  const picked = day == null ? null : perDay.find((d) => d.day === day)!;
  const driver = day == null ? null : dailyDrivers.find((d) => d.day === day) ?? null;

  return (
    <main className="trip-budget bg-background text-foreground min-h-dvh">
      <header className="bg-background/90 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={`/app/${trip.id}`} className="flex items-center gap-2">
            <LogoMark className="size-8 shrink-0" />
            <span className="text-sm font-semibold">아이로</span>
          </Link>
          <span className="text-muted-foreground text-sm">/ 비용</span>
          <Link className="ml-auto inline-flex min-h-11 items-center rounded-full border px-3 text-xs" href={`/app/${trip.id}/cost?view=edit`}>예산 새로 작성</Link>
          <Link
            href={`/app/${trip.id}`}
            className="hover:bg-muted rounded-full border px-3 py-1.5 text-sm"
          >
            지도
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <section className="space-y-4">
          <div>
            <p className="text-muted-foreground text-xs tracking-wider uppercase">
              Budget · 1인
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {trip.title} 예상비용
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              가져온 예산의 금액·날짜·계산 가정을 보존한 기록입니다.
            </p>
          </div>

          {/* 소비 방식을 바꾸면 아래 숫자가 전부 따라 움직인다. */}
          <div className="bg-muted flex gap-1 rounded-lg p-1">
            {TIERS.map((x) => (
              <button
                key={x.key}
                onClick={() => setTier(x.key)}
                aria-pressed={tier === x.key}
                className={`flex-1 rounded-md px-2 py-2 text-sm transition-colors ${
                  tier === x.key
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">{active.hint}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="이미 낸 돈" value={man(t.spent)} sub={krw(t.spent)} />
            <Stat
              label="앞으로 쓸 돈"
              value={man(t.upcoming)}
              sub={`${yen(t.japanYen)} + ${krw(t.korea)}`}
              accent
            />
            <Stat
              label="예비비 포함 총 준비"
              value={man(t.budget)}
              sub={`예비비 ${krw(t.reserve)}`}
            />
          </div>

          <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs leading-relaxed">
            환율은 실제 시세가 아니라 <strong>100엔 = {YEN * 100}원</strong> 가정입니다.
            결제 완료액은 과거 예약 확인 기록 기준이고, 미예약 가격은 확보된
            가격이 아닙니다.
          </p>
        </section>

        <section className="space-y-3">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <DayChip label="전체" active={day == null} onClick={() => setDay(null)} />
            {DAY_KEYS.map((n) => (
              <DayChip
                key={n}
                label={n === 0 ? "D0" : `D${n}`}
                sub={DATES[n]?.split(" ")[0]}
                active={day === n}
                onClick={() => setDay(n)}
              />
            ))}
          </div>

          {picked && (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold">Day {picked.day}</h2>
                <span className="text-muted-foreground text-sm">{picked.date}</span>
              </div>
              {driver && <p className="text-sm">{driver.plan}</p>}

              <div>
                <p className="text-muted-foreground text-xs">이 날 쓸 돈</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {krw(picked.spendKrw)}
                </p>
              </div>

              <ul className="divide-border divide-y text-sm">
                {picked.spend.map((line) => (
                  <li key={line.name} className="flex items-baseline gap-3 py-2">
                    <span className="flex-1">
                      {line.name}
                      {line.shared && (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          {line.shared}일 분할
                        </span>
                      )}
                    </span>
                    {line.yen != null && (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {yen(line.yen)}
                      </span>
                    )}
                    <span className="w-24 text-right tabular-nums">{krw(line.krw)}</span>
                  </li>
                ))}
              </ul>

              {picked.paid.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-muted-foreground text-xs">
                    이 날짜에 걸린 이미 낸 돈 · 지갑에서 나가지 않음
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {picked.paid.map((line) => (
                      <li key={line.name} className="text-muted-foreground flex gap-3">
                        <span className="flex-1">{line.name}</span>
                        <span className="tabular-nums">{krw(line.krw)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {driver && (
                <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
                  {driver.cost}
                </p>
              )}
            </div>
          )}
        </section>

        <Section title="앞으로 쓸 돈" caption="일본 현지 · 엔화">
          <ul className="divide-border divide-y text-sm">
            {japanItems.map((item) => (
              <li key={item.name} className="flex items-baseline gap-3 py-2">
                <span className="flex-1">{item.name}</span>
                <span className="tabular-nums">{yen(item[tier])}</span>
                <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">
                  {krw(won(item[tier]))}
                </span>
              </li>
            ))}
            <li className="flex items-baseline gap-3 py-2 font-medium">
              <span className="flex-1">소계</span>
              <span className="tabular-nums">{yen(t.japanYen)}</span>
              <span className="w-24 text-right text-xs tabular-nums">
                {krw(t.japanKrw)}
              </span>
            </li>
          </ul>

          <p className="text-muted-foreground mt-5 mb-1 text-xs font-medium">
            한국에서 쓰거나 원화로 관리
          </p>
          <ul className="divide-border divide-y text-sm">
            {korea.map((item) => (
              <li key={item.name} className="flex items-baseline gap-3 py-2">
                <span className="flex-1">{item.name}</span>
                <span className="tabular-nums">{krw(item[tier])}</span>
              </li>
            ))}
            <li className="flex items-baseline gap-3 py-2 font-medium">
              <span className="flex-1">합계</span>
              <span className="tabular-nums">{krw(t.upcoming)}</span>
            </li>
          </ul>
        </Section>

        <Section title="이미 낸 돈" caption={`항공 ${paid.flights.length}편 + 숙박 ${paid.stays.length}건`}>
          <ul className="divide-border divide-y text-sm">
            {[...paid.flights, ...paid.stays].map((row) => (
              <li key={row.date + row.name} className="flex items-baseline gap-3 py-2">
                <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                  {row.date}
                </span>
                <span className="flex-1">{row.name}</span>
                <span className="tabular-nums">{krw(row.krw)}</span>
              </li>
            ))}
            <li className="flex items-baseline gap-3 py-2 text-sm">
              <span className="text-muted-foreground w-20 shrink-0 text-xs">{DATES[paid.extraDay]}</span>
              <span className="flex-1">추가 결제 {yen(paid.extraYen)}</span>
              <span className="text-muted-foreground tabular-nums">
                {krw(paidTotal.extra)}
              </span>
            </li>
            <li className="flex items-baseline gap-3 py-2 font-medium">
              <span className="flex-1">합계</span>
              <span className="tabular-nums">{krw(paidTotal.all)}</span>
            </li>
          </ul>
        </Section>

        <Section title="날짜별로 돈이 나가는 지점" caption="숙소·항공은 위에서 계산 완료">
          <ul className="divide-border divide-y text-sm">
            {dailyDrivers.map((d) => (
              <li key={d.date} className="py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="w-16 shrink-0 text-xs font-medium tabular-nums">
                    {d.date}
                  </span>
                  <span className="flex-1">{d.plan}</span>
                </div>
                <p className="text-muted-foreground mt-0.5 pl-[4.5rem] text-xs">
                  {d.cost}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="보통형은 이런 가정 위에 있다" caption="숫자만 보면 오해하기 쉬운 부분">
          <dl className="space-y-3 text-sm">
            {assumptions.map((a) => (
              <div key={a.name}>
                <dt className="font-medium">{a.name}</dt>
                <dd className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {a.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="예산이 깨질 수 있는 지점" caption="낙관적으로 잡은 곳">
          <ul className="space-y-3 text-sm">
            {risks.map((r) => (
              <li key={r.name} className="border-l-2 border-orange-400 pl-3">
                <p className="font-medium">{r.name}</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {r.detail}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="가격 근거" caption="공식 페이지">
          <ul className="space-y-1.5 text-sm">
            {sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline dark:text-primary"
                >
                  {s.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${accent ? "border-primary/40 bg-route-ground/5" : ""}`}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{sub}</p>
    </div>
  );
}

function Section({
  title,
  caption,
  hidden,
  children,
}: {
  title: string;
  caption?: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {caption && <p className="text-muted-foreground mb-2 text-xs">{caption}</p>}
      {children}
    </section>
  );
}


function DayChip({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-muted"
      }`}
    >
      {label}
      {sub && <span className="ml-1.5 text-xs opacity-60">{sub}</span>}
    </button>
  );
}
