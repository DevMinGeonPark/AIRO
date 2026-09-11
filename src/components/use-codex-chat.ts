"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AiDevice, type AiJob, deviceReady } from "@/lib/ai-bridge-types";
export async function bridgeFetch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "AI 연결을 확인하지 못했습니다.");
  return result;
}
export function useAiDevices() {
  const [devices, setDevices] = useState<AiDevice[]>([]), [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { const data = await bridgeFetch<{ devices: AiDevice[] }>("/api/bridge/devices"); setDevices(data.devices); setError(""); }
    catch (e) { setDevices([]); setError(e instanceof Error ? e.message : "연결을 확인하지 못했습니다."); }
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => { if (active && document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(update, 5000); update();
    window.addEventListener("focus", update);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh]);
  return { devices, error, refresh, ready: devices.find(d => deviceReady(d)) };
}
export function useCodexChat(tripId: string, onChange: () => Promise<void>, onOutput: (text: string | null) => void, onBusy: (busy: boolean) => void, onError: (error: string) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const storageKey = `airo.codex.job.${tripId}`;
  const watch = useCallback(async (id: string) => {
    controller.current?.abort();
    const signal = (controller.current = new AbortController()).signal;
    setJobId(id); onBusy(true); onOutput("");
    try { const savedDevice = sessionStorage.getItem(`${storageKey}.device`); if (savedDevice) setDeviceId(savedDevice); } catch {}
    let failures = 0;
    try {
      for (;;) {
        if (signal.aborted) return;
        try {
          const status = await bridgeFetch<AiJob>(`/api/bridge/jobs/${id}`, undefined, signal);
          onOutput(status.output);
          if (!["queued", "running"].includes(status.state)) {
            if (status.error) onError(status.error);
            try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(`${storageKey}.device`); } catch {}
            setJobId(null); setDeviceId(null); await onChange(); return;
          }
          if (status.pending) {
            const result = await bridgeFetch<{ changed: boolean }>(`/api/bridge/jobs/${id}`, { action: "tick" }, signal);
            if (result.changed) await onChange();
          }
          failures = 0;
        } catch (e) {
          if (signal.aborted) return;
          if (++failures >= 5) throw e;
        }
        await new Promise(resolve => setTimeout(resolve, 900));
      }
    } catch (e) { if (!signal.aborted) onError(e instanceof Error ? e.message : "Codex 연결이 중단됐습니다."); }
    finally { if (!signal.aborted) { onBusy(false); onOutput(null); } }
  }, [onBusy, onChange, onError, onOutput, storageKey]);
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(storageKey); } catch {}
    const saved = id;
    const timer = setTimeout(() => { if (saved && /^[a-f0-9-]{36}$/.test(saved)) void watch(saved); }, 0);
    return () => { clearTimeout(timer); controller.current?.abort(); };
  }, [storageKey, watch]);
  const send = async (deviceId: string, message: string) => {
    const id = crypto.randomUUID();
    await bridgeFetch("/api/bridge/jobs", { id, tripId, deviceId, message });
    setDeviceId(deviceId);
    try { sessionStorage.setItem(storageKey, id); sessionStorage.setItem(`${storageKey}.device`, deviceId); } catch {}
    await watch(id);
  };
  const cancel = async () => {
    if (!jobId) return;
    await bridgeFetch(`/api/bridge/jobs/${jobId}`, { action: "cancel" });
    controller.current?.abort(); setJobId(null); setDeviceId(null); onBusy(false); onOutput(null);
    try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(`${storageKey}.device`); } catch {}
    onError("대화를 중지했습니다. 이미 반영된 일정은 유지됩니다."); await onChange();
  };
  return { send, cancel, jobId, deviceId, resume: () => jobId && watch(jobId) };
}
