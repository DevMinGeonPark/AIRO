"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { TripSubheader } from "./trip-subheader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, expenseBudgetSchema, expenseSchema, expenseTotals, type Expense, type ExpenseBudgetState } from "@/lib/expense-budget";
import { byDay, dateForDay } from "@/lib/geo";
import type { Stop, Trip } from "@/lib/types";
import type { ArchiveData } from "@/lib/archive";

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const blank = () => ({ name: "", amount: "", currency: "KRW" as Expense["currency"], rate: "1", category: "food" as Expense["category"], day: "", paid: false });

export function ExpenseBudget({ trip, stops, initial, hasOriginal, initialReservation }: {
  trip: Trip; stops: Stop[]; initial: ExpenseBudgetState; hasOriginal: boolean; initialReservation?: NonNullable<ArchiveData["reservations"]>["entries"][number];
}) {
  const linked=initialReservation?initial.entries.find(entry=>entry.reservationId===initialReservation.id):undefined;
  const selectedStop=stops.find(stop=>[...(initialReservation?.stopIds??[]),initialReservation?.stopId].some(id=>id===stop.id||id===stop.source_id));
  const [budget, setBudget] = useState(initial);
  const [draft, setDraft] = useState(()=>linked?{name:linked.name,amount:String(linked.amount),currency:linked.currency,rate:String(linked.exchangeRate),category:linked.category,day:linked.day===null?"":String(linked.day),paid:linked.paid}:initialReservation?{...blank(),name:initialReservation.name,category:"other" as Expense["category"],day:selectedStop?String(selectedStop.day):"",paid:initialReservation.paymentStatus==="paid"}:blank());
  const [editing, setEditing] = useState<string | null>(linked?.id??null);
  const [linkedReservation,setLinkedReservation]=useState<string|null>(initialReservation?.id??null);
  const [reserve, setReserve] = useState(String(initial.reserve));
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState("");
  const days = useMemo(() => byDay(stops), [stops]);
  const totals = expenseTotals(budget);
  const visible = budget.entries.filter(entry => day === "" || (day === "shared" ? entry.day === null : entry.day === Number(day)));
  const visibleTotal = visible.reduce((total, entry) => total + Math.round(entry.amount * entry.exchangeRate), 0);

  async function save(next: ExpenseBudgetState) {
    if (busy) return false;
    const parsed = expenseBudgetSchema.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "예산 형식을 확인해 주세요."); return false; }
    setBusy(true); setError(""); setStatus(""); setConflict(false);
    try {
      const response = await fetch(`/api/trips/${trip.id}/budget`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(data.error ?? "예산을 저장하지 못했습니다.");
      }
      const saved = expenseBudgetSchema.parse(data);
      setBudget(saved); setReserve(String(saved.reserve)); setStatus("예산을 저장했습니다.");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "예산을 저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }

  async function reload() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/trips/${trip.id}/budget`, { cache: "no-store" });
      if (!response.ok) throw new Error("최신 예산을 불러오지 못했습니다.");
      const next = expenseBudgetSchema.parse(await response.json());
      setBudget(next); setReserve(String(next.reserve)); setError(""); setConflict(false);
      setStatus("최신 예산을 불러왔습니다. 작성 중인 항목을 확인한 뒤 저장해 주세요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "예산을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if(linkedReservation&&budget.entries.some(entry=>entry.reservationId===linkedReservation&&entry.id!==editing)){setError("이 예약에 연결된 지출이 이미 있습니다. 목록의 기존 항목을 수정해 주세요.");return;}
    if (editing && !budget.entries.some(entry => entry.id === editing)) { setError("다른 곳에서 삭제된 항목입니다. 새 항목으로 다시 작성해 주세요."); return; }
    const parsed = expenseSchema.safeParse({ reservationId: linkedReservation??budget.entries.find(entry => entry.id === editing)?.reservationId, id: editing ?? crypto.randomUUID(), name: draft.name, amount: draft.amount === "" ? NaN : Number(draft.amount), currency: draft.currency,
      exchangeRate: draft.currency === "KRW" ? 1 : Number(draft.rate), category: draft.category, day: draft.day === "" ? null : Number(draft.day), paid: draft.paid });
    if (!parsed.success) { setError("항목 이름·금액·환율을 확인해 주세요."); return; }
    const entries = editing ? budget.entries.map(entry => entry.id === editing ? parsed.data : entry) : [...budget.entries, parsed.data];
    if (await save({ ...budget, entries })) { setDraft(blank()); setEditing(null); setLinkedReservation(null); }
  }
  function edit(entry: Expense) {
    setLinkedReservation(entry.reservationId??null);
    setEditing(entry.id);
    setDraft({ name: entry.name, amount: String(entry.amount), currency: entry.currency, rate: String(entry.exchangeRate), category: entry.category, day: entry.day === null ? "" : String(entry.day), paid: entry.paid });
    document.querySelector<HTMLInputElement>("#expense-name")?.focus();
  }
  const selectStyle = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
  return <>
    <TripSubheader trip={trip} title="예산" />
    <main className="expense-budget mx-auto max-w-4xl space-y-8 px-5 py-6 pb-16 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">여행 예산</h1><p className="mt-2 text-sm text-muted-foreground">{trip.title}</p></div>
        {hasOriginal && <Link className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm" href={`/app/${trip.id}/cost?view=original`}>가져온 예산 기록</Link>}
      </div>
      <section aria-label="예산 합계" className="grid gap-3 sm:grid-cols-3">
        {[["이미 낸 돈", totals.paid], ["앞으로 쓸 돈", totals.planned], ["예비비 포함 총 예산", totals.total]].map(([label, value]) =>
          <div key={label} className="min-w-0 rounded-2xl border bg-card p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 break-words text-2xl font-semibold tabular-nums">{won(Number(value))}</p></div>)}
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">원화 합계는 항목에 직접 입력한 계산용 환율을 사용합니다. 실제 결제 금액이나 현재 환율과 다를 수 있어요.</p>
      <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="expense-form-heading">
        <h2 id="expense-form-heading" className="flex items-center gap-2 font-semibold"><Wallet className="size-4 text-primary" />{editing ? "지출 수정" : "지출 추가"}</h2>
        {linkedReservation&&<p className="mt-2 text-xs text-muted-foreground">예약에 연결된 지출입니다. 금액·환율을 확인한 뒤 저장하세요.</p>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-xs">항목 이름<Input id="expense-name" aria-label="지출 항목 이름" placeholder="예: 첫날 숙소, 공항 이동" maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} disabled={busy} required /></label>
            <label className="space-y-2 text-xs">분류<select aria-label="지출 분류" className={selectStyle} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as Expense["category"] })} disabled={busy}>{EXPENSE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-2 text-xs">금액<Input type="number" inputMode="decimal" aria-label="지출 금액" min={0} step="any" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} disabled={busy} required /></label>
            <label className="space-y-2 text-xs">통화<select aria-label="지출 통화" className={selectStyle} value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value as Expense["currency"], rate: event.target.value === "KRW" ? "1" : "" })} disabled={busy}>{EXPENSE_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
            {draft.currency !== "KRW" && <label className="space-y-2 text-xs">1 {draft.currency}당 원화<Input type="number" inputMode="decimal" aria-label="계산용 환율" min={0.000001} max={1000000} step="any" value={draft.rate} onChange={event => setDraft({ ...draft, rate: event.target.value })} disabled={busy} placeholder="직접 확인한 환율 입력" required /></label>}
            <label className="space-y-2 text-xs">사용할 날<select aria-label="지출 일차" className={selectStyle} value={draft.day} onChange={event => setDraft({ ...draft, day: event.target.value })} disabled={busy}>
              <option value="">여행 공통</option>{days.map(({ day: value }) => <option key={value} value={value}>{value === 0 ? "출발 전" : `${value}일차`} {dateForDay(trip.start_date, value)}</option>)}
              {draft.day !== "" && !days.some(item => item.day === Number(draft.day)) && <option value={draft.day}>{draft.day}일차</option>}
            </select></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={draft.paid} onChange={event => setDraft({ ...draft, paid: event.target.checked })} disabled={busy} />이미 결제했어요</label>
            <div className="flex gap-2">{(editing||linkedReservation) && <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setLinkedReservation(null); setDraft(blank()); }}>취소</Button>}<Button type="submit" disabled={busy || !draft.name.trim() || draft.amount === ""}><Plus className="size-4" />{busy ? "저장 중…" : editing ? "수정 저장" : "항목 추가"}</Button></div>
          </div>
        </form>
      </section>
      {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}{conflict && <Button className="ml-3" variant="outline" disabled={busy} onClick={() => void reload()}>최신 예산 불러오기</Button>}</div>}
      {status && <p role="status" className="text-sm text-primary">{status}</p>}
      <section className="space-y-4" aria-labelledby="expense-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="expense-list-heading" className="font-semibold">지출 목록 <span className="text-sm font-normal text-muted-foreground">{budget.entries.length}개</span></h2>
          <select aria-label="지출 목록 일차 필터" className="min-h-11 rounded-full border bg-background px-4 text-sm" value={day} onChange={event => setDay(event.target.value)}><option value="">전체</option><option value="shared">여행 공통</option>{[...new Set(budget.entries.flatMap(entry => entry.day === null ? [] : [entry.day]))].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value === 0 ? "출발 전" : `${value}일차`}</option>)}</select></div>
        {visible.length ? <ul className="divide-y rounded-2xl border bg-card">{visible.map(entry => <li key={entry.id} className="expense-row grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 px-4 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto_auto]">
          <button type="button" aria-label={`${entry.name} ${entry.paid ? "미결제로 변경" : "결제 완료로 변경"}`} aria-pressed={entry.paid} disabled={busy} onClick={() => void save({ ...budget, entries: budget.entries.map(item => item.id === entry.id ? { ...item, paid: !item.paid } : item) })} className={`grid size-11 shrink-0 place-items-center rounded-full border ${entry.paid ? "bg-secondary text-primary" : "text-muted-foreground"}`}><Check className={`size-4 ${entry.paid ? "opacity-100" : "opacity-30"}`} /></button>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{entry.name}</p><p className="mt-1 text-xs text-muted-foreground">{EXPENSE_CATEGORIES.find(([category]) => category === entry.category)?.[1]} · {entry.day === null ? "공통" : `${entry.day}일차`} · {entry.paid ? "결제 완료" : "결제 예정"}</p></div>
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:contents"><div className="min-w-0 text-sm sm:text-right"><p className="break-words font-medium tabular-nums">{won(entry.amount * entry.exchangeRate)}</p>{entry.currency !== "KRW" && <p className="mt-1 text-xs text-muted-foreground">{entry.amount.toLocaleString("ko-KR")} {entry.currency}</p>}</div>
          <div className="ml-auto flex"><button type="button" aria-label={`${entry.name} 수정`} className="grid size-11 place-items-center rounded-full hover:bg-secondary" disabled={busy} onClick={() => edit(entry)}><Pencil size={15} /></button><button type="button" aria-label={`${entry.name} 삭제`} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary" disabled={busy} onClick={() => { if (window.confirm(`“${entry.name}” 지출을 삭제할까요?`)) void save({ ...budget, entries: budget.entries.filter(item => item.id !== entry.id) }); }}><Trash2 size={15} /></button></div></div>
        </li>)}</ul> : <div className="rounded-2xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">{budget.entries.length ? "이 날짜에 등록한 지출이 없습니다." : "숙소·교통·식비부터 하나씩 기록해 보세요."}</div>}
        <p className="text-right text-sm">{day === "" ? "항목 합계" : "선택한 날짜 합계"} <strong className="ml-2 tabular-nums">{won(visibleTotal)}</strong></p>
      </section>
      <form onSubmit={event => { event.preventDefault(); void save({ ...budget, reserve: reserve === "" ? NaN : Number(reserve) }); }} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5">
        <label className="min-w-0 flex-1 space-y-2 text-xs">예비비 (원)<Input type="number" inputMode="decimal" aria-label="예비비" min={0} step="any" value={reserve} onChange={event => setReserve(event.target.value)} disabled={busy} required /></label><Button type="submit" variant="outline" disabled={busy}>예비비 저장</Button>
      </form>
    </main>
  </>;
}
