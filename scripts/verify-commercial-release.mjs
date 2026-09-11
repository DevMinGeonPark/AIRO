import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Read-only public deployment checks. No login, consent, or private mutation.
const base = process.env.COMMERCIAL_BASE_URL ?? "https://airo.dev-heptivision.com";
const output = new URL("../assets/validation/workspace/", import.meta.url);
await mkdir(output, { recursive: true });
const checks = [];
for (const [engine, width] of [[chromium, 1440], [chromium, 390], [webkit, 320]]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
  try {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    await page.screenshot({ path: new URL(`public-hero-${engine.name()}-${width}.png`, output).pathname });
    await page.getByRole("tablist", { name: "AI 도구 연동 미리보기" }).getByRole("tab", { name: /^Codex/ }).click();
    await page.locator("#mcp-시작").scrollIntoViewIfNeeded();
    assert.ok(!(await page.locator("#mcp-시작").innerText()).includes("로그인 연결 준비 중"));
    assert.ok(!(await page.locator("#mcp-시작 code").allTextContents()).join(" ").includes("AIRO_API_KEY"));
    await page.locator("#mcp-시작").screenshot({ path: new URL(`public-mcp-${engine.name()}-${width}.png`, output).pathname });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    const google = page.getByRole("link", { name: "Google로 계속하기", exact: true });
    await expect(google).toHaveAttribute("href", /^https:\/\/airo\.dev-heptivision\.com\/auth\/google\?/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: new URL(`public-login-${engine.name()}-${width}.png`, output).pathname });
    assert.deepEqual(errors, []);
    checks.push({ engine: engine.name(), width, liveHero: true, oauthGuide: true, googleEnabled: true, overflow: false, pageErrors: errors });
    console.log("Public browser passed", engine.name(), width);
  } finally { await browser.close(); }
}
const response = await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp`), metadata = await response.json();
assert.equal(response.status, 200); assert.equal(metadata.resource, "https://airo.dev-heptivision.com/api/mcp");
const unauthenticated = await fetch(`${base}/api/mcp`);
assert.equal(unauthenticated.status, 401); assert.ok(unauthenticated.headers.get("www-authenticate").includes("oauth-protected-resource"));
await writeFile(new URL("public-browser-checks.json", output), JSON.stringify({ base, checks, oauthMetadata: metadata, unauthenticatedMcp: 401 }, null, 2));
