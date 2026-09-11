"use client";

import { useState } from "react";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteThumb } from "@/components/route-thumb";
import type { Plan, Stop, Trip } from "@/lib/types";
import { atTripLimit, tripLimit } from "@/ee/plans";

type Summary = { trip: Trip; stops: Stop[] };

const SUGGESTIONS = ["간사이 4일", "오키나와 3박 4일", "후쿠오카 주말"];

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** start_date 와 일차 수로 기간을 만든다. 시작일이 없으면 일수만. */
function period(startDate: string | null, days: number, firstDay = 1, lastDay = days) {
  if (!startDate) return days ? `${days}일` : null;
  const from = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(from.getTime())) return `${days}일`;
  const to = new Date(from);
  to.setDate(from.getDate() + Math.max(lastDay - 1, 0));
  from.setDate(from.getDate() + firstDay - 1);
  return `${md(from)} – ${md(to)}`;
}

export function TripList({ initial, plan }: { initial: Summary[]; plan: Plan }) {
  const router = useRouter();
  const [trips, setTrips] = useState(initial);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const atLimit = atTripLimit(plan, trips.length);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, start_date: startDate || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "만들지 못했습니다.");
    router.push(`/app/${data.trip.id}`);
    } catch { setError("여행을 만들지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function remove(trip: Trip) {
    if (!window.confirm(`"${trip.title}" 여행을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setTrips((t) => t.filter((x) => x.trip.id !== trip.id));
      router.refresh();
    } catch { setError("여행을 삭제하지 못했습니다. 다시 시도해 주세요."); }
  }

  return (
    <>
      <div className="mt-8 rounded-3xl border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-primary"><Sparkles className="size-5" /></span><div><h2 className="text-sm font-semibold">이번에는 어디로 떠날까요?</h2><p className="mt-1 text-xs text-muted-foreground">이름을 정하고, 아이로와 함께 채워보세요.</p></div></div>
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <Input
          aria-label="새 여행 이름"
          placeholder="새 여행 이름 (예: 간사이 4일)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={atLimit}
          className="h-11 min-w-48 flex-1 rounded-full px-4"
        />
        <Input type="date" aria-label="1일차 시작일" className="h-11 w-40 rounded-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={atLimit} />
        <Button
          type="submit"
          disabled={busy || atLimit || !title.trim()}
          className="h-11 shrink-0 rounded-full px-5"
        >
          <Plus className="size-4" /> 만들기
        </Button>
      </form>
      </div>

      {atLimit && (
        <p className="text-muted-foreground mt-3 text-sm">
          무료 플랜은 여행 {tripLimit(plan)}개까지입니다.{" "}
          <Link href="/pricing" className="text-primary hover:underline dark:text-primary">
            요금제 보기 ›
          </Link>
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {trips.length ? (
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map(({ trip, stops }) => {
            const days = new Set(stops.map((s) => s.day)).size;
            const span = period(trip.start_date, days, stops.length ? Math.min(...stops.map((s) => s.day)) : 1, stops.length ? Math.max(...stops.map((s) => s.day)) : 1);
            return (
              <li key={trip.id} className="group relative min-w-0">
                <Link
                  href={`/app/${trip.id}`}
                  className="hover:border-primary/35 block overflow-hidden rounded-3xl border bg-card transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="bg-secondary/70 border-b p-5">
                    <div className="aspect-[2/1]">
                      <RouteThumb stops={stops} />
                    </div>
                  </div>
                  <div className="relative p-5">
                    <ArrowUpRight className="absolute top-5 right-5 size-4 text-primary" />
                    <h2 className="truncate pr-6 font-semibold">{trip.title}</h2>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {[span, days ? `${days}일` : null, `${stops.length}곳`]
                        .filter((v, i, arr) => v && arr.indexOf(v) === i)
                        .join(" · ")}
                    </p>
                    <p className="text-muted-foreground/70 mt-0.5 text-xs">
                      {new Date(trip.created_at).toLocaleDateString("ko-KR")} 생성
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => remove(trip)}
                  aria-label={`${trip.title} 삭제`}
                  title="삭제"
                  className="bg-background/90 text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded-full border p-1.5 opacity-100 backdrop-blur transition-opacity md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                    <path
                      d="M3 4h10M6.5 4V2.8h3V4M4.4 4l.6 9h6l.6-9M6.6 6.4v4.2M9.4 6.4v4.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed px-6 py-16 text-center">
          <div className="mx-auto h-20 w-32 opacity-60">
            <RouteThumb stops={[]} />
          </div>
          <h2 className="mt-5 font-medium">아직 여행이 없습니다</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
            이름만 지으면 시작할 수 있습니다. 나머지는 지도를 보면서 대화로
            채우면 됩니다.
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => setTitle(s)}
                  className="hover:bg-muted rounded-full border px-3 py-1 text-xs transition-colors"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
