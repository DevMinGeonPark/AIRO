/** Only redirect to a URL returned by the trusted OAuth provider, never form/query input. */
export function providerRedirect(value: string): string {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw new Error("OAuth 리디렉션 주소를 확인해 주세요.");
  return url.href;
}
