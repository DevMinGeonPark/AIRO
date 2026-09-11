"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { demoEnabled, siteUrl, supabaseConfigured, localAuth } from "@/lib/supabase/config";
import { loginErrors, loginUrl } from "@/lib/auth-flow";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function GoogleMark() {
  return <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
    <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
    <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4z" />
    <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6z" />
  </svg>;
}

export function LoginForm({ next, error, googleStatus }: { next: string; error?: string; googleStatus: "enabled" | "disabled" | "unavailable" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(error ? Object.hasOwn(loginErrors, error) ? loginErrors[error] : loginErrors.auth : "");
  const [failed, setFailed] = useState(Boolean(error));
  const [busy, setBusy] = useState(false);
  // Some preview proxies replace Host. The browser still knows the real origin.
  useEffect(() => {
    if (supabaseConfigured && !localAuth && process.env.NODE_ENV === "production" && window.location.origin !== new URL(siteUrl).origin) {
      window.location.replace(loginUrl(siteUrl, next, error).href);
    }
  }, [next, error]);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (process.env.NODE_ENV === "production" && window.location.origin !== new URL(siteUrl).origin) {
      window.location.assign(loginUrl(siteUrl, next).href);
      return;
    }
    setBusy(true); setStatus(""); setFailed(false);
    try {
      const response = await fetch("/auth/email", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || loginErrors.unavailable);
      setStatus(result.message);
    } catch (error) {
      setFailed(true); setStatus(error instanceof Error ? error.message : loginErrors.unavailable);
    } finally { setBusy(false); }
  }

  if (localAuth) return <form action="/auth/local" method="post" className="space-y-3">
    <input type="hidden" name="next" value={next} />
    <label className="text-muted-foreground block text-xs" htmlFor="login-password">소유자 비밀번호</label>
    <Input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="h-11 rounded-full px-4" />
    <Button type="submit" className="h-11 w-full rounded-full">들어가기</Button>
    {status && <p role="alert" className="rounded-xl border border-destructive/25 p-3 text-xs leading-relaxed text-destructive">{status}</p>}
  </form>;

  if (!supabaseConfigured) return demoEnabled ? <div className="space-y-4"><Link href="/app" className={buttonVariants({ className: "h-11 w-full rounded-full" })}>로그인 없이 둘러보기</Link><p className="text-muted-foreground text-xs leading-relaxed">계정 로그인을 준비하고 있어요. 여행 화면을 먼저 둘러보세요.</p></div> : <p className="text-sm leading-relaxed">로그인 서비스를 준비하고 있습니다. 잠시 후 다시 방문해 주세요.</p>;

  return <div className="space-y-5">
    {googleStatus === "disabled" || busy ? <Button disabled variant="outline" className="h-12 w-full gap-3 rounded-full"><GoogleMark />Google로 계속하기</Button> : <a href={`${process.env.NODE_ENV === "production" ? new URL(siteUrl).origin : ""}/auth/google?next=${encodeURIComponent(next)}`} className={buttonVariants({ variant: "outline", className: "h-12 w-full gap-3 rounded-full border-border bg-white text-[#1f1f1f] hover:bg-[#f0f2f5]" })}><GoogleMark />Google로 계속하기</a>}
    {googleStatus === "disabled" && <p className="text-muted-foreground text-center text-xs leading-relaxed">Google 로그인을 준비하고 있어요.<br />지금은 아래 이메일로 로그인할 수 있어요.</p>}
    <div className="text-muted-foreground flex items-center gap-3 text-xs"><span className="bg-border h-px flex-1" />또는<span className="bg-border h-px flex-1" /></div>
    <form onSubmit={sendLink} className="space-y-3">
      <label className="text-muted-foreground block text-xs" htmlFor="login-email">이메일로 계속하기</label>
      <Input id="login-email" aria-label="이메일 주소" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="h-11 rounded-full px-4" />
      <Button type="submit" variant="secondary" className="h-11 w-full rounded-full" disabled={busy}>{busy ? "보내는 중…" : "메일로 로그인 링크 받기"}</Button>
    </form>
    {status && <p role={failed ? "alert" : "status"} className={`rounded-xl border p-3 text-xs leading-relaxed ${failed ? "border-destructive/25 text-destructive" : "border-primary/20 text-muted-foreground"}`}>{status}</p>}
  </div>;
}
