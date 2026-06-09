import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, checkSameOrigin } from "@/lib/rate-limit";

/**
 * Server-side gas-price reader.
 *
 * The WaaP / Silk EIP-1193 provider does not forward `eth_gasPrice`, so we
 * read it from a public RPC here instead. Doing it server-side means the
 * browser only ever talks to our own origin (no CSP connect-src change) and
 * the RPC host isn't exposed to the client.
 */

// Multiple endpoints per chain — public RPCs are flaky, so we try each in
// order until one returns a gas price.
const RPCS_BY_CHAIN: Record<number, string[]> = {
  1: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com"
  ],
  8453: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.llamarpc.com"],
  42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  10: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
  137: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org"],
  84532: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
  421614: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"]
};

async function readGasPrice(rpc: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    return typeof json.result === "string" && json.result.startsWith("0x") ? json.result : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const blocked = checkSameOrigin(request);
  if (blocked) return blocked;
  const limited = checkRateLimit(request, { limit: 120, namespace: "gas:get", windowMs: 60_000 });
  if (limited) return limited;

  const chainId = Number(request.nextUrl.searchParams.get("chainId"));
  const endpoints = RPCS_BY_CHAIN[chainId];
  if (!Number.isFinite(chainId) || !endpoints) {
    return NextResponse.json({ message: "Unsupported or missing chainId." }, { status: 400 });
  }

  for (const rpc of endpoints) {
    const result = await readGasPrice(rpc);
    if (result) {
      // Raw hex wei; the client converts to gwei.
      return NextResponse.json({ chainId, gasPriceWei: result });
    }
  }
  return NextResponse.json({ message: "All gas RPC endpoints failed for this chain." }, { status: 502 });
}
