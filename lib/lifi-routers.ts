/**
 * R1: allowlist of LI.FI router / diamond contracts per EVM chain. Used to
 * reject an ERC20 `approve` whose spender is not actually LI.FI — so a
 * compromised quote response can't trick the user into granting allowance
 * to an attacker-controlled contract.
 *
 * The canonical `LiFiDiamond` is deployed at the same address on every
 * supported chain (deterministic deploy), so a single constant covers all
 * of them. New diamonds (e.g. multi-hop routers introduced later) can be
 * added here without touching call sites.
 *
 * Source: https://docs.li.fi/li.fi-smart-contracts/deployments
 */

const LIFI_DIAMOND = "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae";
const LIFI_DIAMOND_IMMUTABLE = "0x9b11bc9fac17c058cab6286b0c785be6a65492ef";

// Lowercased on purpose so comparison is case-insensitive.
const ALLOWED_BY_CHAIN: Record<number, ReadonlyArray<string>> = {
  1: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Ethereum
  10: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Optimism
  56: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // BNB
  137: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Polygon
  8453: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Base
  42161: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Arbitrum
  43114: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Avalanche
  // Testnets — keep the same deterministic addresses (LI.FI deploys them).
  11155111: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Sepolia
  84532: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE], // Base Sepolia
  421614: [LIFI_DIAMOND, LIFI_DIAMOND_IMMUTABLE] // Arbitrum Sepolia
};

export function isAllowedLifiRouter(chainId: number, address: string | undefined): boolean {
  if (!address) return false;
  const allowed = ALLOWED_BY_CHAIN[chainId];
  if (!allowed) return false;
  return allowed.includes(address.toLowerCase());
}

export function assertAllowedLifiRouter(chainId: number, address: string | undefined): void {
  if (!isAllowedLifiRouter(chainId, address)) {
    throw new Error(
      `LI.FI returned an approval address (${address ?? "missing"}) that is not on the known LI.FI router allowlist for this chain. Refusing to grant token allowance — refresh the quote.`
    );
  }
}
