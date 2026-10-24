import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { localAuth, SUPABASE_URL } from "./config";

/**
 * Community edition: one owner, one PostgreSQL, PostgREST in front of it.
 * The app signs its own HS256 JWTs with AIRO_JWT_SECRET (shared with PostgREST),
 * so every query still runs as role `authenticated` and RLS applies unchanged.
 * No Supabase Auth, no service_role anywhere.
 */
export const OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const SESSION_COOKIE = "airo_session";
const SESSION_TTL = 30 * 24 * 60 * 60;
/** Sliding window: the proxy re-issues the cookie once it has less than this left. */
export const SESSION_RENEW_BELOW = 7 * 24 * 60 * 60;

const secret = process.env.AIRO_JWT_SECRET ?? "";
const password = process.env.AIRO_OWNER_PASSWORD ?? "";
export const ownerEmail = process.env.AIRO_OWNER_EMAIL ?? "owner@localhost";
export const localConfigured = !localAuth || Boolean(SUPABASE_URL && secret.length >= 32 && password);

export function assertLocalConfigured() {
  if (localConfigured) return;
  const missing = [!SUPABASE_URL && "AIRO_POSTGREST_URL", secret.length < 32 && "AIRO_JWT_SECRET (32+ chars)", !password && "AIRO_OWNER_PASSWORD"].filter(Boolean);
  throw new Error(`Community edition needs ${missing.join(", ")}.`);
}

const b64 = (v: object | string) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Minimal HS256 signer shared by session cookies (community) and MCP user tokens (both editions). */
export function signHs256(claims: Record<string, unknown>, key: string, ttl: number) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ aud: "authenticated", iat: now, exp: now + ttl, ...claims })}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

/** Changing AIRO_OWNER_PASSWORD (or the secret) invalidates every issued session. */
const passwordTag = () => createHash("sha256").update(`${secret}\n${password}`).digest("base64url").slice(0, 16);

export const signLocalJwt = (claims: Record<string, unknown>, ttl = SESSION_TTL) => signHs256(claims, secret, ttl);

export function verifyLocalJwt(token: string | undefined): Record<string, unknown> | null {
  if (!token || secret.length < 32) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig || token.split(".").length !== 3) return null;
  const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof claims.exp === "number" && claims.exp > Date.now() / 1000 ? claims : null;
  } catch { return null; }
}

/** Session cookie value → verified claims, or null. */
export function localSessionClaims(cookie: string | undefined) {
  const claims = verifyLocalJwt(cookie);
  return claims?.sub === OWNER_ID && claims.role === "authenticated" && claims.pw === passwordTag() ? claims : null;
}

/** Session cookie value → owner identity, or null. */
export const localSession = (cookie: string | undefined) => (localSessionClaims(cookie) ? { id: OWNER_ID, email: ownerEmail } : null);

/** Origin the browser actually used, honouring a TLS-terminating proxy (Tailscale Serve, Caddy, cloudflared). */
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export const sessionCookie = (secure: boolean) => ({
  name: SESSION_COOKIE, value: signLocalJwt({ sub: OWNER_ID, role: "authenticated", pw: passwordTag() }),
  httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL,
});

/** Anon token for the few calls that run without a session (key lookup, bridge worker). */
export const localAnonKey = () => (localAuth ? signLocalJwt({ role: "anon" }, 10 * 365 * 24 * 60 * 60) : "");

/** supabase-js appends /rest/v1; PostgREST serves at its root. Compared on parsed URLs so host case or a default port cannot break the rewrite. */
const restOrigin = localAuth && SUPABASE_URL ? new URL(SUPABASE_URL).origin : "";
export const localFetch: typeof fetch = (input, init) => {
  if (typeof input === "string" && restOrigin) {
    try {
      const url = new URL(input);
      if (url.origin === restOrigin && url.pathname.startsWith("/rest/v1/")) { url.pathname = url.pathname.slice("/rest/v1".length); return fetch(url.href, init); }
    } catch {}
  }
  return fetch(input, init);
};

/** Options every supabase-js client needs in community mode. */
export const localClientOptions = () => (localAuth ? { global: { fetch: localFetch } } : {});

// ponytail: one process-wide window for the single owner. Not keyed on the client-controlled
// X-Forwarded-For header, which the published standalone server never sanitizes.
let attempts: number[] = [];
export function checkPassword(candidate: string): "ok" | "bad" | "limited" {
  const now = Date.now();
  attempts = attempts.filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 5) return "limited";
  const a = Buffer.from(candidate), b = Buffer.from(password);
  if (password && a.length === b.length && timingSafeEqual(a, b)) { attempts = []; return "ok"; }
  attempts.push(now);
  return "bad";
}
