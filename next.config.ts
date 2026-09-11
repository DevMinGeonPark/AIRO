import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep validation builds separate from the running deployment.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Docker image (community edition) ships the standalone server.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "/*": ["./.private/**", "./.backups/**", "./.demo-db.json*", "./.env*"],
  },
  // Dev-only: Next blocks /_next resources from non-localhost origins, which
  // kills the map when you open the app over Tailscale/LAN.
  allowedDevOrigins: [
    "airo.dev-heptivision.com",
    ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean) ?? []),
  ],
};

export default nextConfig;
