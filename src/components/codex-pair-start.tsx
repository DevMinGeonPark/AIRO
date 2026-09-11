"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function CodexPairStart() {
  const [error, setError] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
    const id = url.searchParams.get("device"), key = fragment.get("key"), name = (url.searchParams.get("name") ?? "내 컴퓨터").slice(0,80);
    history.replaceState(null, "", location.pathname);
    if (!id || !/^[a-f0-9-]{36}$/.test(id) || !key || !/^[a-f0-9]{64}$/.test(key)) { setError("연결 링크가 올바르지 않습니다. Codex에서 연결을 다시 시작해 주세요."); return; }
    try {
      sessionStorage.setItem(`airo.pair.${id}`, JSON.stringify({ id, key, name, expires: Date.now()+600000 }));
      location.replace(`/app/settings/ai?pair=${encodeURIComponent(id)}`);
    } catch { setError("연결하려면 브라우저의 임시 저장을 허용해 주세요."); }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <main className="mx-auto max-w-lg px-6 py-24"><h1 className="text-2xl font-medium">Codex 연결</h1><p role="status" className="mt-5 text-sm text-muted-foreground">{error || "AIRO 로그인과 연결 승인을 준비하고 있어요."}</p>{error && <Link className="mt-6 inline-block text-primary" href="/app/settings/ai">내 AI 연결로 돌아가기 →</Link>}</main>;
}
