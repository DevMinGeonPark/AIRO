"use client";
import { useState } from "react";
import Link from "next/link";
import { MAX_ARCHIVE_BYTES, type TripArchive } from "@/lib/archive";
import { importArchiveSchema } from "@/lib/archive";
import { Button } from "./ui/button";

export function TripImport({ email }: { email: string }) {
  const [archive, setArchive] = useState<TripArchive | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tripId: string; imported: boolean } | null>(null);
  async function select(file?: File) {
    setError(""); setArchive(null); setResult(null);
    if (!file) return;
    try {
      if (file.size > MAX_ARCHIVE_BYTES) throw new Error("8MB 이하의 파일을 선택해 주세요.");
      const parsed = importArchiveSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("아이로에서 내보낸 여행 파일을 선택해 주세요.");
      setArchive(parsed.data);
    } catch (error) { setError(error instanceof Error ? error.message : "파일을 읽지 못했습니다."); }
  }
  async function migrate() {
    if (!archive || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/trips/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(archive) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "가져오지 못했습니다.");
      setResult(data);
    } catch (error) { setError(error instanceof Error ? error.message : "가져오지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-6">
    <p className="wrap-anywhere rounded-xl border bg-muted/40 p-4 text-sm">저장할 계정: <strong>{email}</strong></p>
    <label className="block space-y-3 rounded-2xl border border-dashed p-6">
      <span className="block font-medium">여행 파일 선택</span>
      <span className="text-muted-foreground block text-sm">일정·대화·예산·맛집·경로·원본 문서를 함께 가져옵니다.</span>
      <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void select(e.target.files?.[0])} className="block w-full text-sm" />
    </label>
    {archive && <section className="space-y-4 rounded-2xl border p-6">
      <h2 className="text-lg font-semibold">{archive.trip.title}</h2>
      <p className="text-muted-foreground text-sm">일정 {archive.stops.length}곳 · 대화 {archive.messages.length}개 · 맛집 {archive.data.food.length}곳 · 문서 {archive.data.documents.length}개</p>
      <p className="text-sm">기존 여행은 유지합니다. 이미 가져온 파일이면 해당 여행으로 연결하며, 수정한 내용을 덮어쓰지 않습니다.</p>
      {!result && <Button onClick={migrate} disabled={busy}>{busy ? "가져오는 중…" : "이 계정으로 가져오기"}</Button>}
    </section>}
    {result && <p role="status" className="rounded-xl border p-4">{result.imported ? "여행을 저장했습니다." : "이미 가져온 여행입니다."} <Link className="ml-2 underline" href={`/app/${result.tripId}`}>여행 열기 →</Link></p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <p className="text-muted-foreground text-sm">기존 브라우저의 맛집 즐겨찾기는 개인용 아이로의 ‘즐겨찾기 내보내기’로 내려받은 뒤, 가져온 여행의 ‘여행 자료’에서 추가할 수 있습니다.</p>
  </div>;
}
