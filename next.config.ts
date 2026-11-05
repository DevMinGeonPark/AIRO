import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep validation builds separate from the running deployment.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Docker image (community edition) ships the standalone server.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "/*": ["./.private/**", "./.backups/**", "./.demo-db.json*", "./.env*"],
  },
  // Dev-only: the floating "N" badge sits on the phone bottom tab bar and swallows taps
  // (Playwright's mobile checks hit it too). Error overlays still show without it.
  devIndicators: false,
  // Clickjacking guard for consent/pairing screens (/app/connect, /app/settings/ai). Same-origin framing stays allowed.
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
  // Dev-only: Next blocks /_next resources from non-localhost origins, which
  // kills the map when you open the app over Tailscale/LAN.
  allowedDevOrigins: [
    ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean) ?? []),
  ],
};

export default nextConfig;
