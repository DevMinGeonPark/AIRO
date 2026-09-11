import { createHmac, timingSafeEqual } from "node:crypto";
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

const secret = process.env.AIRO_JWT_SECRET ?? "";
const password = process.env.AIRO_OWNER_PASSWORD ?? "";
export const ownerEmail = process.env.AIRO_OWNER_EMAIL ?? "owner@localhost";

export function assertLocalConfigured() {
  if (!localAuth) return;
  const missing = [!SUPABASE_URL && "AIRO_POSTGREST_URL", secret.length < 32 && "AIRO_JWT_SECRET (32+ chars)", !password && "AIRO_OWNER_PASSWORD"].filter(Boolean);
  if (missing.length) throw new Error(`Community edition needs ${missing.join(", ")}.`);
}

const b64 = (v: object | string) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export function signLocalJwt(claims: Record<string, unknown>, ttl = SESSION_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ aud: "authenticated", iat: now, exp: now + ttl, ...claims })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyLocalJwt(token: string | undefined): Record<string, unknown> | null {
  if (!token || !secret) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) return null;
  const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof claims.exp === "number" && claims.exp > Date.now() / 1000 ? claims : null;
  } catch { return null; }
}

/** Session cookie value → owner identity, or null. */
export function localSession(cookie: string | undefined) {
  const claims = verifyLocalJwt(cookie);
  return claims?.sub === OWNER_ID && claims.role === "authenticated" ? { id: OWNER_ID, email: ownerEmail } : null;
}

export const sessionCookie = (secure: boolean) => ({
  name: SESSION_COOKIE, value: signLocalJwt({ sub: OWNER_ID, role: "authenticated" }),
  httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL,
});

/** Anon token for the few calls that run without a session (key lookup, bridge worker). */
export const localAnonKey = () => (localAuth ? signLocalJwt({ role: "anon" }, 10 * 365 * 24 * 60 * 60) : "");

/** supabase-js appends /rest/v1; PostgREST serves at its root. */
const restPrefix = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`;
export const localFetch: typeof fetch = (input, init) =>
  fetch(typeof input === "string" && input.startsWith(restPrefix) ? SUPABASE_URL.replace(/\/$/, "") + "/" + input.slice(restPrefix.length) : input, init);

/** Options every supabase-js client needs in community mode. */
export const localClientOptions = () => (localAuth ? { global: { fetch: localFetch } } : {});

// ponytail: in-memory login limiter, resets on restart; fine for one owner behind one process.
const attempts = new Map<string, number[]>();
export function checkPassword(candidate: string, ip: string): "ok" | "bad" | "limited" {
  const now = Date.now(), recent = (attempts.get(ip) ?? []).filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) { attempts.set(ip, recent); return "limited"; }
  const a = Buffer.from(candidate), b = Buffer.from(password);
  if (password && a.length === b.length && timingSafeEqual(a, b)) { attempts.delete(ip); return "ok"; }
  attempts.set(ip, [...recent, now]);
  return "bad";
}
