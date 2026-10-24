/** Only these apiRoute-protected endpoints accept a native user's access token. */
export function mobileApiPath(path: string): boolean {
  return path === "/api/mobile/trips" || path === "/api/mobile/places"
    || path === "/api/trips/import"
    || /^\/api\/bridge\/(?:devices|jobs(?:\/[a-zA-Z0-9-]+)?)$/.test(path)
    || /^\/api\/mobile\/trips\/[a-zA-Z0-9-]+\/(?:resources|documents|reservations|changes(?:\/[1-9]\d{0,18})?)$/.test(path)
    || /^\/api\/trips(?:\/[a-zA-Z0-9-]+(?:\/(?:budget|routes|choices|saved|places|export|progress|predeparture|images(?:\/[a-f0-9]{64})?|documents\/(?:\d+|[a-f0-9]{64})|stops\/[a-zA-Z0-9-]+))?)?$/.test(path);
}
