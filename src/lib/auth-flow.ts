import { safeNext } from "./auth-redirect";

export const AUTH_NEXT_COOKIE = "airo-login-next";

/** Keep the provider callback exact: query strings may not match its allowlist. */
export function authCallbackUrl(site: string) {
  return new URL("/auth/callback", site).href;
}

export function loginUrl(site: string, next: string | null, error?: string) {
  const url = new URL("/login", site);
  url.searchParams.set("next", safeNext(next));
  if (error) url.searchParams.set("error", error);
  return url;
}

export function authNextCookie(next: string | null, site: string) {
  return {
    name: AUTH_NEXT_COOKIE, value: safeNext(next),
    httpOnly: true, secure: new URL(site).protocol === "https:",
    sameSite: "lax" as const, path: "/", maxAge: 60 * 30,
  };
}

export function authNext(cookie: string | undefined, legacyNext: string | null) {
  if (cookie) return safeNext(cookie);
  return safeNext(legacyNext);
}

export function isCanonicalAuthHost(headers: Pick<Headers, "get">, site: string) {
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host");
  return host === new URL(site).host;
}

export const loginErrors: Record<string, string> = {
  auth: "로그인 링크가 만료되었거나 인증을 완료하지 못했어요. 로그인을 시작한 브라우저에서 다시 시도해 주세요.",
  cancelled: "Google 로그인을 취소했어요. 다시 연결할 수 있어요.",
  google_disabled: "Google 로그인을 준비하고 있어요. 지금은 이메일로 로그인해 주세요.",
  unavailable: "로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  invalid_email: "이메일 주소를 다시 확인해 주세요.",
  rate_limit: "요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.",
};
