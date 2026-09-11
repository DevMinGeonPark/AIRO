// Local integration fixture ONLY. PostgREST verifies signed JWTs and real RLS;
// the Auth user endpoint is simulated. No actual OAuth/email is exercised here.
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
export const secret = "airo-local-test-secret-at-least-32-characters";
export const testOwner = "33333333-3333-4333-8333-333333333333";
export const testOther = "44444444-4444-4444-8444-444444444444";
export function token(id, role = "authenticated") {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: id, role, aud: "authenticated", exp: Math.floor(Date.now()/1000) + 7200 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function sessionCookie(id) {
  return { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify({ access_token: token(id), refresh_token: "test-only", expires_at: Math.floor(Date.now()/1000) + 7200, expires_in: 7200, token_type: "bearer", user: { id, email: `${id === testOwner ? "owner" : "other"}@example.test` } })).toString("base64url"), domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" };
}
export function startAuthFixture() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/rest/v1/")) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
        const upstream = await fetch(`http://127.0.0.1:3105/${req.url.slice("/rest/v1/".length)}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
        res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !["content-encoding","transfer-encoding"].includes(name))));
        res.end(Buffer.from(await upstream.arrayBuffer())); return;
      }
      const bearer = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const [head, body, signature] = bearer.split(".");
      const actual = Buffer.from(signature ?? "", "base64url");
      const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
      const claims = JSON.parse(Buffer.from(body ?? "", "base64url"));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || claims.exp < Date.now()/1000 || ![testOwner, testOther].includes(claims.sub)) throw new Error("invalid fixture token");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: claims.sub, email: `${claims.sub === testOwner ? "owner" : "other"}@example.test`, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
    } catch { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: "invalid test session" })); }
  });
  server.listen(3104, "127.0.0.1"); return server;
}
