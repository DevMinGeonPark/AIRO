/** Only redirect to a local application route, including after OAuth. */
export function safeNext(value: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/app";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid") return "/app";
    if (url.pathname !== "/app" && !url.pathname.startsWith("/app/")) return "/app";
    return url.pathname + url.search;
  } catch {
    return "/app";
  }
}
