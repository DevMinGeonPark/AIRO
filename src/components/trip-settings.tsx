"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TripSubheader } from "./trip-subheader";
import type { Trip } from "@/lib/types";
export function TripSettings({ trip }: { trip: Trip }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const data = new FormData(e.currentTarget); setBusy(true); setError("");
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), start_date: data.get("start_date") || null }) });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push(`/app/${trip.id}`); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <><TripSubheader trip={trip} title="여행 설정" /><main className="mx-auto max-w-lg px-5 py-8 sm:px-6 sm:py-12"><h1 className="text-2xl font-semibold">여행 설정</h1><form onSubmit={save} className="mt-6 space-y-5"><label className="block text-sm">여행 이름<Input name="title" defaultValue={trip.title} required maxLength={120} /></label><label className="block text-sm">1일차 시작일<Input type="date" name="start_date" defaultValue={trip.start_date ?? ""} /></label><p className="text-muted-foreground text-xs">출국 전날 일정은 0일차로 유지됩니다. 가져온 원본 자료의 날짜는 원본 기록으로 보존됩니다.</p>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "저장 중…" : "저장"}</Button></form></main></>;
}
