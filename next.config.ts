import type { NextConfig } from "next";

// M1: Baseline security headers for every response.
//
// `frame-src` and `connect-src` whitelist the full set of origins that the
// WaaP / Silk wallet stack uses at runtime (sourced from
// @human.tech/waap-constants). Without all of these the wallet iframe shows
// "This content is blocked" and login pings time out.
// L1: also strip the X-Powered-By header.
const waapFrameOrigins = [
  "https://silksecure.net", // Silk wallet UI iframe
  "https://waap.xyz",
  "https://*.waap.xyz",
  "https://*.silk.sc",
  "https://*.silkwallet.net"
];

// M4: narrow these from broad PaaS wildcards to the exact subdomains the
// WaaP/Silk SDK actually contacts (sourced from @human.tech/waap-constants).
// If the SDK ever changes hosts, the browser CSP violation will tell us.
const waapConnectOrigins = [
  "https://silksecure.net",
  "https://waap.xyz",
  "https://*.waap.xyz",
  "https://*.silk.sc",
  "https://server.silkwallet.net",
  "https://main.silk-protector.com",
  "https://lbr.silk-protector-microservice-pe.com",
  "https://lbr.silk-protector-microservice-km.com",
  "https://gastank.app-76797b4474a8.enclave.evervault.com",
  "https://gastank-staging.app-688cba025011.enclave.evervault.com",
  "https://prod-waap-ws-relay.fly.dev",
  "wss://prod-waap-ws-relay.fly.dev"
];

const suiOrigins = [
  "https://*.sui.io",
  "wss://*.sui.io",
  "https://fullnode.mainnet.sui.io",
  "https://fullnode.testnet.sui.io"
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js bundles + WaaP SDK currently rely on inline/eval; keep them
      // explicit so we can tighten later when those dependencies allow it.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // The app renders no remote images (token logos are not shown), so we
      // don't need a blanket https: source here — keep it tight.
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' https://li.quest ${waapConnectOrigins.join(" ")} ${suiOrigins.join(" ")}`,
      `frame-src 'self' ${waapFrameOrigins.join(" ")}`,
      `child-src 'self' ${waapFrameOrigins.join(" ")}`,
      "worker-src 'self' blob:",
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
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }
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
