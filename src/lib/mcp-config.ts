import { siteUrl, SUPABASE_URL, supabaseConfigured } from "./supabase/config";

export const mcpResource = `${siteUrl.replace(/\/$/, "")}/api/mcp`;
export const mcpMetadataUrl = `${siteUrl.replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/mcp`;
export const mcpOAuthEnabled = supabaseConfigured && process.env.MCP_OAUTH_ENABLED === "true";
export const mcpApiKeyEnabled = !supabaseConfigured || Boolean(process.env.SUPABASE_JWT_SECRET);
export const mcpIssuer = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
export function mcpOriginAllowed(origin: string | null) {
  if (origin === null) return true; // Native/server clients do not send Origin.
  const allowed = [new URL(siteUrl).origin, ...(process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map(v => v.trim()).filter(Boolean)];
  return allowed.includes(origin);
}

export const mcpResourceMetadata = () => ({
  resource: mcpResource,
  resource_name: "AIRO 여행",
  authorization_servers: [mcpIssuer],
  bearer_methods_supported: ["header"],
  // Supabase grants identity scopes; AIRO itinerary permissions are chosen at consent.
  scopes_supported: ["openid"],
  resource_documentation: `${siteUrl.replace(/\/$/, "")}/docs/mcp`,
});
