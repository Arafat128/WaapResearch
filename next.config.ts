import type { NextConfig } from "next";

// M1: Baseline security headers for every response. `frame-ancestors` blocks
// clickjacking of the WaaP wallet confirmation flow; `connect-src` whitelists
// the only outbound origins we actually use.
// L1: also strip the X-Powered-By header.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js bundles + WaaP SDK currently rely on inline/eval; keep them
      // explicit so we can tighten later when those dependencies allow it.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://li.quest https://*.waap.xyz https://*.sui.io wss://*.sui.io https://fullnode.mainnet.sui.io https://fullnode.testnet.sui.io",
      "frame-src 'self' https://*.waap.xyz",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'"
    ].join("; ")
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
