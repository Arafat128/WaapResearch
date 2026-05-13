# Mehidy's Waap Research Lab

Production-oriented Next.js dashboard for WaaP-powered wallet actions: connect/login, receive, send native/ERC20 tokens, swap, bridge, repeat controlled batches, and track transaction history.

## Security model

- Never asks for seed phrases or private keys.
- Does not place WaaP CLI passwords, API secrets, or private credentials in frontend code.
- Uses `window.waap` as the EIP-1193 provider for user wallet actions.
- Requires a human-readable preview plus a confirmation checkbox before send, swap, bridge, or repeat execution.
- Repeat actions are sequential, capped by `MAX_REPEAT_COUNT`, and never run as an infinite loop.
- Transaction history and preferences use `localStorage` only for non-sensitive data.

## Install

```bash
pnpm install
```

## Environment

Create `.env.local` from `.env.example`.

```bash
LIFI_API_KEY=
NEXT_PUBLIC_LIFI_API_BASE=https://li.quest/v1
NEXT_PUBLIC_SUI_RPC_URL=
```

`LIFI_API_KEY` is optional and server-side only. RPC URLs or private API keys should be configured through deployment/server environment variables, never hardcoded into components.
`NEXT_PUBLIC_SUI_RPC_URL` is optional for Sui balance and native SUI transfer reads/writes; leave it blank to use the default public Sui mainnet fullnode.

## Run locally

```bash
pnpm dev
pnpm build
```

On this Windows workspace, if PowerShell says `node` is not recognized, run:

```powershell
cd D:\Codex\Waap
.\scripts\dev.ps1
```

If PowerShell blocks scripts on your machine, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Local dashboard URL:

```text
http://localhost:3000
```

Terminate and restart from PowerShell:

```powershell
# In the PowerShell window where the app is running:
Ctrl + C
Y

# Then start again:
cd D:\Codex\Waap
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

If port `3000` is busy, Next.js may show a PID. Stop it and restart:

```powershell
taskkill /PID YOUR_PID /F
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Or run on another port:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Port 3001
```

Then open:

```text
http://localhost:3001
```

## WaaP SDK usage

`components/WaapProvider.tsx` initializes `@human.tech/waap-sdk` once with email, phone, and social auth. The app then calls `window.waap.request` for:

- `eth_requestAccounts`
- `eth_chainId`
- `wallet_switchEthereumChain`
- `eth_sendTransaction`
- `eth_getTransactionReceipt` for status tracking

For Sui, the app initializes `initWaaPSui` and uses the Sui Wallet Standard for the Sui address plus native SUI send/multi-send actions. Sui does not use ERC20 contracts or `eth_sendTransaction`.

## LI.FI usage

`lib/lifi.ts` provides client helpers for supported chains, tokens, and quotes. Next.js API routes under `app/api/lifi/*` proxy LI.FI REST requests so an optional LI.FI API key can stay server-side.

The quote flow handles unavailable routes, converts user amounts to base units with token decimals, and displays provider/tool, output, gas/fees, bridge/tool fees, estimated time, and minimum received.

Sui swap/bridge routes use LI.FI's Sui chain mapping and execute returned Sui transaction bytes through WaaP Sui Wallet Standard signing. EVM source routes still use `window.waap.request({ method: "eth_sendTransaction" })`.

## Testnet-first recommendation

Start with Sepolia/Base Sepolia/Arbitrum Sepolia and small values. Mainnet actions are labeled because swaps and bridges can lose money from gas, slippage, bridge fees, MEV, and price movement.
