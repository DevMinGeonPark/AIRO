"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiKey } from "@/lib/types";

const when = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "—";

export function ApiKeyManager({ initialKeys, enabled = true }: { initialKeys: ApiKey[]; enabled?: boolean }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState(90);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, readOnly, expiresInDays }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "발급하지 못했습니다.");
    setKeys((k) => [data.key, ...k]);
    setFresh(data.token);
    setCopied(false);
    setName("");
    } catch { setError("키를 발급하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(`"${key.name}" 키를 폐기할까요? 이 키로는 더 이상 접근할 수 없습니다.`))
      return;
    try {
      const res = await fetch(`/api/keys/${key.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("키를 폐기하지 못했습니다.");
      setKeys((k) => k.map((x) => (x.id === key.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    } catch { setError("키를 폐기하지 못했습니다. 다시 시도해 주세요."); }
  }

  return (
    <>
      {enabled ? <form onSubmit={create} className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-[1fr_auto]">
        <label className="min-w-0 text-xs">키 이름
        <Input
          placeholder="키 이름 (예: 내 노트북 Claude)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-2 h-10 rounded-full px-4"
        />
        </label>
        <Button
          type="submit"
          disabled={busy || !name.trim()}
          className="h-10 shrink-0 self-end rounded-full px-5"
        >
          발급
        </Button>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <label className="text-muted-foreground text-xs">접근 권한<select aria-label="API 키 접근 권한" className="bg-background text-foreground mt-2 h-10 w-full rounded-xl border px-3" value={readOnly ? "read" : "write"} onChange={e => setReadOnly(e.target.value === "read")}><option value="read">조회 전용</option><option value="write">조회 + 편집</option></select></label>
          <label className="text-muted-foreground text-xs">유효 기간<select aria-label="API 키 유효 기간" className="bg-background text-foreground mt-2 h-10 w-full rounded-xl border px-3" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))}><option value={30}>30일</option><option value={90}>90일</option><option value={365}>1년</option></select></label>
        </div>
      </form> : <p className="mt-5 text-sm text-muted-foreground">API 키 발급은 준비 중입니다. 위의 ‘로그인으로 연결’을 사용하세요.</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {fresh && (
        <div className="mt-6 rounded-2xl border border-primary/35 bg-primary/5 p-5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="text-primary text-sm font-medium">
                지금 복사하세요. 이 토큰은 다시 볼 수 없습니다.
              </p>
              <code className="bg-background/80 mt-3 block overflow-x-auto rounded-lg border px-3 py-2 font-mono text-xs break-all">
                {fresh}
              </code>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="h-8 rounded-full px-4"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(fresh); setCopied(true); }
                    catch { setError("복사 권한을 확인하거나 토큰을 선택해 직접 복사해 주세요."); }
                  }}
                >
                  {copied ? "복사됨" : "복사"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-4"
                  onClick={() => setFresh(null)}
                >
                  닫기
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {keys.length ? (
        <div className="mt-10 overflow-hidden rounded-2xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">이름</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">토큰</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">생성</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">마지막 사용</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <span className={`break-all ${k.revoked_at ? "text-muted-foreground line-through" : "font-medium"}`}>
                      {k.name}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-[11px]">{k.scopes?.includes("trips:write") ? "일정 편집" : "조회 전용"} · {k.expires_at ? `${when(k.expires_at)} 만료` : "만료일 없음"}</span>
                    <span className="text-muted-foreground mt-1 block font-mono text-[10px] sm:hidden">{k.prefix}…</span>
                    {k.revoked_at && (
                      <span className="text-muted-foreground ml-2 rounded-full border px-1.5 py-0.5 text-[10px]">
                        폐기됨
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 font-mono text-xs sm:table-cell">
                    {k.prefix}…
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 text-xs sm:table-cell">
                    {when(k.created_at)}
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-3 text-xs sm:table-cell">
                    {when(k.last_used_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!k.revoked_at && (
                      <button
                        onClick={() => revoke(k)}
                        className="text-muted-foreground hover:text-foreground text-xs whitespace-nowrap"
                      >
                        폐기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : enabled ? (
        <div className="mt-10 rounded-2xl border border-dashed px-6 py-16 text-center">
          <h2 className="font-medium">발급한 키가 없습니다</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
            키를 만들고 위의 연결 설정에 적용하세요. 일정 편집을 허용한 키로는
            장소를 추가하거나 방문 순서를 바꿀 수 있습니다.
          </p>
        </div>
      ) : null}
    </>
  );
}
