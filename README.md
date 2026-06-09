# Waap Tools

A secure, testnet-first Web3 dashboard built on the [Human Wallet WaaP SDK](https://docs.wallet.human.tech/) (`@human.tech/waap-sdk`). Connect with email, phone, or social login — no seed phrases — then receive, send, multi-send, swap, bridge, and run controlled repeat actions across EVM chains and Sui, with a clear preview and confirmation before every signature.

**Live app:** https://waap-research.vercel.app

## Features

- **Connect with WaaP** — email / phone / social (Google, Twitter, Discord) login. The app never sees seed phrases or private keys.
- **Receive** — QR code and copyable address per chain.
- **Send** — native or ERC20 transfers (EVM) and native SUI transfers, each with a preview + confirmation checkbox.
- **Multi-send** — paste up to 25 recipients, preview the batch with a total-spend cap, run sequentially.
- **Swap / Bridge** — LI.FI-routed swaps (same chain) and bridges (cross chain), with full route details (provider, output, gas/fees, estimated time, minimum received). Optional **scheduled execution** (off by default; enable with a checkbox).
- **Repeat Swap / Bridge** — run a chosen route a capped number of times, one transaction at a time. Gated behind a developer passphrase because it is still under development.
- **Transaction history** — stored locally in your browser only (never uploaded).
- **Unique-users counter** — an aggregate count of wallets that have connected (stores only SHA-256 hashes, no addresses).

## Supported chains

**Testnets (recommended):** Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia.
**Mainnets (clearly labeled):** Ethereum, Base, Polygon, Arbitrum One, Optimism, Sui.

Start on testnets with small values. Mainnet swaps and bridges can lose money to gas, slippage, bridge fees, MEV, and price movement.

## Security model

- Never asks for seed phrases or private keys; WaaP handles authentication and signing.
- No WaaP passwords, API secrets, or private credentials in frontend code.
- A human-readable preview plus a confirmation checkbox is required before any send, swap, bridge, or repeat.
- LI.FI transaction responses are validated before signing: the destination must match LI.FI's approval router, the native value cannot exceed the entered amount plus LI.FI's own declared fees, and the quoted amount must match what you typed.
- ERC20 approvals are only granted to an allowlist of known LI.FI router contracts.
- Sui transaction bytes are decoded and the declared sender is checked before signing.
- Server API routes (LI.FI proxy, stats) enforce same-origin / CSRF checks, input validation, and rate limiting.
- Security headers: Content-Security-Policy (`frame-ancestors 'self'`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP.
- Repeat actions are sequential, capped by `MAX_REPEAT_COUNT` (10), stoppable, and never run as an infinite loop.
- Transaction history and preferences use `localStorage` only, for non-sensitive data.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · viem · `@mysten/sui` · `@human.tech/waap-sdk` · LI.FI API · pnpm.

## Getting started

```bash
pnpm install
```

Create `.env.local` from `.env.example`:

```bash
# Optional, server-side only — only if your LI.FI tier needs a key.
LIFI_API_KEY=
NEXT_PUBLIC_LIFI_API_BASE=https://li.quest/v1

# Optional Sui RPC override. Blank uses Mysten's public mainnet fullnode.
NEXT_PUBLIC_SUI_RPC_URL=

# Human Wallet referral code (attribution). Defaults to a built-in code.
NEXT_PUBLIC_WAAP_REFERRAL_CODE=

# Repeat-tool developer passphrase, as a SHA-256 hash. Optional.
NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH=

# Vercel KV / Upstash Redis, used for the unique-users counter. Optional —
# the counter chip hides itself when these are unset.
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

## Run locally

```bash
pnpm dev
pnpm build
```

Local URL: http://localhost:3000

### Windows note

If PowerShell says `node` is not recognized, use the bundled helper script:

```powershell
cd D:\Codex\Waap
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Run on another port with `-Port 3001`.

## How key pieces work

- `components/WaapProvider.tsx` initializes the WaaP SDK once (email/phone/social), and the app calls `window.waap.request` for `eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`, `eth_sendTransaction`, and receipt polling. Sui uses `initWaaPSui` + the Sui Wallet Standard.
- `lib/lifi.ts` plus the `app/api/lifi/*` routes proxy LI.FI REST requests so an optional API key stays server-side, and run the safety validations described above.
- `lib/sui.ts` handles Sui address, native SUI sends, and LI.FI Sui route execution.
- Transaction history and the unique-users counter are described in their components.

## Notes for contributors

- The Repeat Swap / Bridge tool is intentionally disabled behind a passphrase while under development. Set `NEXT_PUBLIC_REPEAT_TOOL_PASSWORD_HASH` to your own SHA-256 hash to control access.
- The unique-users counter requires Vercel KV. Without it the app runs fine and the chip is hidden.
