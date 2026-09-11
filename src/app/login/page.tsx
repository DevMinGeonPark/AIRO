import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { siteUrl, supabaseConfigured, localAuth } from "@/lib/supabase/config";
import { safeNext } from "@/lib/auth-redirect";
import { isCanonicalAuthHost, loginUrl } from "@/lib/auth-flow";
import { googleAuthStatus } from "@/lib/google-auth";
import { Logo, LogoMark } from "@/components/logo";
import { DarkToggle } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  // Self-hosters reach the app by whatever hostname they like; only the cloud login pins its host.
  if (supabaseConfigured && !localAuth && process.env.NODE_ENV === "production" && !isCanonicalAuthHost(await headers(), siteUrl)) {
    redirect(loginUrl(siteUrl, next, typeof params.error === "string" ? params.error : undefined).href);
  }
  const googleStatus = await googleAuthStatus();
  return (
    <div className="sky flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <Link href="/" prefetch={false} className="text-muted-foreground hover:text-foreground text-sm">
          <Logo />
        </Link>
        <DarkToggle />
      </div>

      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-6 pt-6 pb-16 md:grid-cols-2 md:gap-16">
        <div className="dark relative overflow-hidden rounded-[2rem] bg-brand-ink p-8 text-[#F3F1EA] sm:p-10 md:py-16">
          <div className="absolute -right-14 -bottom-12 size-64 rounded-full border-[40px] border-brand-blue/10" aria-hidden="true" />
          <LogoMark className="relative mb-8 size-16" />
          <p className="text-xs font-medium text-brand-blue">나의 AI 여행 파트너</p>
          <h1 className="relative mt-4 text-4xl leading-tight font-semibold tracking-tight lg:text-5xl">어디로든,<br />AI와 함께.</h1>
          <p className="relative mt-6 text-sm leading-7 text-[#A3A3A3]">설레는 생각이 나다운 여행이 되는 곳.<br />아이로와 다음 목적지를 그려보세요.</p>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">아이로에 로그인</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{localAuth ? <>내 서버의 아이로입니다.<br />소유자 비밀번호로 들어가세요.</> : <>Google 계정이나 이메일로<br />나만의 여행을 이어가세요.</>}</p>
          <div className="mt-7 rounded-3xl border bg-card p-6 shadow-sm"><LoginForm next={next} error={typeof params.error === "string" ? params.error : undefined} googleStatus={googleStatus} /></div>
          <p className="mt-5 text-center text-xs text-muted-foreground">여행 정보는 로그인한 계정에 저장됩니다.</p>
        </div>
      </main>
    </div>
  );
}
