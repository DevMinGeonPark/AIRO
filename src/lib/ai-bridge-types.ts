export type AiDevice = { id: string; name: string; state: "starting" | "ready" | "login_required" | "api_account" | "error"; seenAt: string | null; revokedAt: string | null };
export type AiJob = { id: string; state: "queued" | "running" | "completed" | "failed" | "cancelled"; output: string; error: string | null; pending: boolean };
export function deviceReady(device: AiDevice, now = Date.now()) {
  return !device.revokedAt && device.state === "ready" && Boolean(device.seenAt) && now - Date.parse(device.seenAt!) < 30000;
}
export function deviceLabel(device: AiDevice, now = Date.now()) {
  if (device.revokedAt) return "연결 해제됨";
  if (!device.seenAt || now - Date.parse(device.seenAt) >= 30000) return "오프라인";
  if (device.state === "login_required") return "Codex 로그인 필요";
  if (device.state === "api_account") return "Codex 구독 로그인 필요";
  if (device.state === "error") return "연결 확인 필요";
  return device.state === "ready" ? "연결됨" : "연결 중";
}
