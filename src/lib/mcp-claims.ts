import type { ToolPermission } from "./tool-contracts";

export function verifiedMcpIdentity(claims: Record<string, unknown>, issuer: string, resource: string, now = Date.now()) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !audience.includes(resource) || claims.role !== "authenticated" ||
      typeof claims.exp !== "number" || claims.exp * 1000 <= now ||
      typeof claims.sub !== "string" || !claims.sub || typeof claims.client_id !== "string" || !claims.client_id ||
      typeof claims.mcp_grant_version !== "string" || !claims.mcp_grant_version) return null;
  return { userId: claims.sub, clientId: claims.client_id };
}

export function validMcpPermissions(value: unknown): ToolPermission[] | null {
  if (!Array.isArray(value) || !value.includes("trips:read") || value.some(v => v !== "trips:read" && v !== "trips:write")) return null;
  return [...new Set(value)] as ToolPermission[];
}
