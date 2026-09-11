"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { bridgeFetch, useAiDevices } from "./use-codex-chat";
import { deviceLabel, deviceReady } from "@/lib/ai-bridge-types";
import { siteUrl } from "@/lib/supabase/config";
// `server` comes from the page (runtime AIRO_SITE_URL); the build-time public URL is the fallback.
export function AiConnectionManager({ installUrl, server = siteUrl }: { installUrl: string | null; server?: string }) {
  const { devices, refresh, error } = useAiDevices();
  const [pair, setPair] = useState<{ id: string; key: string; name: string } | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function copySetup() {
    const text = `AIRO 플러그인을 설치하고 내 Codex를 아이로 웹 채팅에 연결해줘. 공식 설치 안내: ${server}/docs/codex/install — 설치된 플러그인의 연결 스킬로 진행하고, 브라우저에서 내가 연결을 승인할 수 있게 해줘.`;
    try { await navigator.clipboard.writeText(text); setMessage("연결 요청을 복사했어요. 사용하는 컴퓨터의 Codex에 붙여넣어 보내 주세요."); }
    catch { setMessage(text); }
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    const id = new URL(window.location.href).searchParams.get("pair");
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`airo.pair.${id}`) ?? "null");
      if (saved?.id === id && /^[a-f0-9]{64}$/.test(saved.key) && saved.expires > Date.now()) setPair({ id, key: saved.key, name: String(saved.name).slice(0,80) });
      else setMessage("연결 유효 시간이 지났습니다. Codex에서 다시 연결해 주세요.");
    } catch { setMessage("Codex에서 연결을 다시 시작해 주세요."); }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function approve() {
    if (!pair || busy) return;
    setBusy(true); setMessage("");
    try { await bridgeFetch("/api/bridge/devices", { action: "pair", ...pair }); sessionStorage.removeItem(`airo.pair.${pair.id}`); history.replaceState(null, "", location.pathname); setPair(null); setMessage("연결을 승인했어요. Codex의 응답을 확인하고 있습니다."); await refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "연결하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true);
    try { await bridgeFetch("/api/bridge/devices", { action: "revoke", id }); await refresh(); setMessage("Codex 연결을 해제했습니다."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "연결을 해제하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-8">
    {pair && <section className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <p className="text-xs text-primary">연결 승인</p><h2 className="mt-2 text-lg font-medium">{pair.name}의 Codex를 연결할까요?</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">이 기기가 아이로 웹에서 보낸 대화를 처리합니다. 요청한 여행의 장소와 방문 순서를 수정할 수 있어요. Codex에서 시작한 연결인지 아래 번호를 확인해 주세요.</p>
      <p className="my-4 font-mono text-xl tracking-[.18em]">{pair.id.slice(0,8).toUpperCase()}</p>
      <div className="flex gap-3"><button disabled={busy} onClick={approve} className="rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground disabled:opacity-50">이 Codex 연결하기</button><button disabled={busy} onClick={() => setPair(null)} className="px-4 py-3 text-sm">취소</button></div>
    </section>}
    {(message || error) && <p role="status" className="text-sm text-muted-foreground">{message || error}</p>}
    <section className="rounded-2xl border p-6">
      <span className="text-xs text-primary">기본 AI</span><h2 className="mt-2 text-xl font-medium">쓰던 Codex로, 여기서 대화하세요.</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">AIRO 플러그인을 설치하고 ‘아이로 웹 채팅 연결’을 선택하세요. 한 번 연결하면 여행 화면에서 바로 이야기할 수 있어요.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {installUrl ? <a href={installUrl} target="_blank" rel="noreferrer" className="rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground">Codex에 AIRO 설치 ↗</a> : <button onClick={copySetup} className="rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground">Codex 연결 요청 복사</button>}
        <Link href="/docs/codex" className="px-2 py-3 text-sm text-muted-foreground">연결 방법</Link>
      </div>
      {!installUrl && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">복사한 한 문장을 Codex에 보내면 플러그인 설치와 연결을 진행합니다. 마지막 연결 승인은 직접 확인해 주세요.</p>}
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">대화를 처리할 컴퓨터가 켜져 있어야 해요. 휴대폰에서도 같은 AIRO 계정으로 이용할 수 있습니다. API 사용은 여행 채팅에서 따로 선택합니다.</p>
    </section>
    <section><h2 className="text-lg font-medium">웹 채팅에 연결한 Codex</h2>
      {!devices.length ? <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">아직 연결한 기기가 없어요. 플러그인에서 연결을 시작해 주세요.</p> : <ul className="mt-4 divide-y rounded-2xl border px-5">{devices.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-5"><div><p className="text-sm font-medium">{device.name}</p><p className={`mt-1 text-xs ${deviceReady(device) ? "text-primary" : "text-muted-foreground"}`}>{deviceLabel(device)}</p></div>{!device.revokedAt && <button disabled={busy} onClick={() => revoke(device.id)} className="py-3 text-xs text-muted-foreground">연결 해제</button>}</li>)}</ul>}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">오프라인이면 연결한 컴퓨터에서 AIRO 플러그인의 ‘아이로 웹 채팅 연결’을 다시 선택해 주세요.</p>
    </section>
    <section className="border-t pt-6"><h2 className="text-sm font-medium">Claude Code</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Claude Code 안에서 AIRO 일정을 수정하는 MCP 연결을 사용할 수 있어요. AIRO 웹 채팅 연결은 준비 중입니다.</p><Link href="/app/settings/keys" className="mt-3 inline-block text-sm text-primary">MCP 연결 관리 →</Link></section>
  </div>;
}
