import { formatUnits, isAddress, parseUnits } from "viem";
import { CHAINS, getLifiChainId, getNativeTokenAddress, isSuiChain, SUI_NATIVE_TOKEN_ADDRESS } from "@/lib/chains";
import { assertAllowedLifiRouter } from "@/lib/lifi-routers";
import type { LifiQuote, LifiQuoteRequest, TokenOption } from "@/types";

const NATIVE_VALUE_BUFFER_BPS = 50n; // 0.5% headroom over user amount to cover wei rounding

/**
 * Absolute, NON-LI.FI hard ceiling on how much native value we accept as
 * "bridge/gas overhead" on top of the user amount, per chain (in wei /
 * smallest native unit). LI.FI declares feeCosts in its own response, which
 * the safety check is meant to defend against — so we clamp that declared
 * overhead to these locally-defined bounds. Real bridge messaging fees are
 * well under these; the values are generous (≈10x typical) to avoid breaking
 * legitimate routes while still capping a drain attack to a bounded amount.
 *
 * 1e18 = 1 native token (ETH/POL).
 */
const MAX_NATIVE_OVERHEAD_WEI: Record<number, bigint> = {
  1: 50_000_000_000_000_000n, // Ethereum: 0.05 ETH
  8453: 20_000_000_000_000_000n, // Base: 0.02 ETH
  42161: 20_000_000_000_000_000n, // Arbitrum: 0.02 ETH
  10: 20_000_000_000_000_000n, // Optimism: 0.02 ETH
  137: 20_000_000_000_000_000_000n, // Polygon: 20 POL (real bridge fees are tiny; keeps the drain ceiling low even if POL spikes)
  // Testnets — generous, funds are worthless anyway.
  11155111: 500_000_000_000_000_000n,
  84532: 500_000_000_000_000_000n,
  421614: 500_000_000_000_000_000n
};
const DEFAULT_MAX_NATIVE_OVERHEAD_WEI = 50_000_000_000_000_000n; // 0.05 native fallback

function cappedNativeOverhead(chainId: number, declared: bigint): bigint {
  const ceiling = MAX_NATIVE_OVERHEAD_WEI[chainId] ?? DEFAULT_MAX_NATIVE_OVERHEAD_WEI;
  return declared < ceiling ? declared : ceiling;
}

const API_BASE = process.env.NEXT_PUBLIC_LIFI_API_BASE ?? "https://li.quest/v1";
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenMemoryCache = new Map<number, { timestamp: number; tokens: TokenOption[] }>();
const tokenInflightCache = new Map<number, Promise<TokenOption[]>>();

type LifiToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  priceUSD?: string;
};

export async function fetchSupportedChains() {
  const response = await fetch("/api/lifi/chains", { cache: "no-store" });
  if (!response.ok) return CHAINS;
  const payload = (await response.json()) as { chains?: Array<{ id: number; name: string }> };
  if (!payload.chains?.length) return CHAINS;
  return CHAINS.filter((chain) => payload.chains?.some((item) => item.id === chain.id));
}

export async function fetchTokens(chainId: number): Promise<TokenOption[]> {
  const cached = readTokenCache(chainId);
  if (cached) return cached;

  const inflight = tokenInflightCache.get(chainId);
  if (inflight) return inflight;

  const request = fetchTokensUncached(chainId).finally(() => tokenInflightCache.delete(chainId));
  tokenInflightCache.set(chainId, request);
  return request;
}

export async function fetchQuote(request: LifiQuoteRequest): Promise<LifiQuote> {
  let response: Response;
  try {
    response = await fetch("/api/lifi/quote", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // M5: simple-CSRF defeater. Browsers will not let cross-origin HTML
        // forms set custom headers, so requiring this rejects form-based CSRF.
        "x-requested-with": "fetch"
      },
      body: JSON.stringify({
        ...request,
        fromAmount: parseUnits(request.amount, request.fromTokenDecimals ?? 18).toString()
      })
    });
  } catch {
    throw new Error("Could not reach the local LI.FI quote service. Make sure the app server is running, then refresh and try again.");
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message ?? "No LI.FI route is available for this action.");
  }

  const quote = normalizeQuote(payload);
  // Snapshot user inputs at the moment the quote was issued. assertSafeEvmTxRequest
  // uses these (instead of live form state) so that a fromTokenMeta state update
  // between fetch and execute doesn't trigger a false-positive amount mismatch.
  quote.userInputs = {
    amount: request.amount,
    decimals: request.fromTokenDecimals ?? 18
  };
  return quote;
}

export function buildLifiQuoteUrl(params: URLSearchParams) {
  return `${API_BASE}/quote?${params.toString()}`;
}

export function normalizeUserAmount(amount: string, decimals: number) {
  return parseUnits(amount || "0", decimals).toString();
}

/**
 * H3: Defence-in-depth check on LI.FI's returned transactionRequest.
 *
 * The user only sees a preview built from LI.FI's response, so a hostile or
 * compromised aggregator could mismatch preview vs. actual `to` / `value`.
 * Before signing we require:
 *   1. `tx.to` is a valid EVM address and matches `quote.approvalAddress`
 *      (LI.FI's router) when one is provided.
 *   2. `tx.value` (native amount) does not exceed the user's `fromAmount`
 *      plus a small rounding buffer, for native-token swaps. ERC20 swaps
 *      should have `value === 0`.
 */
export function assertSafeEvmTxRequest(
  quote: LifiQuote,
  context: {
    fromTokenAddress: string;
    nativeTokenAddress: string;
    chainId: number;
    /** Current live form amount. Compared against `quote.userInputs.amount`
     *  to detect a stale quote (user changed the form after fetching). */
    userAmount?: string;
  }
): void {
  const tx = quote.transactionRequest;
  if (!tx) throw new Error("Quote is missing an executable transaction. Refresh and try again.");
  if (!tx.to || !isAddress(String(tx.to))) {
    throw new Error("Quote returned an invalid destination address. Refresh and try again.");
  }
  if (!tx.data || !String(tx.data).startsWith("0x")) {
    throw new Error("Quote returned invalid call data. Refresh and try again.");
  }

  if (quote.approvalAddress && isAddress(quote.approvalAddress)) {
    if (String(tx.to).toLowerCase() !== quote.approvalAddress.toLowerCase()) {
      throw new Error(
        "Quote destination does not match LI.FI's approval router. Refusing to sign — refresh the quote."
      );
    }
  }

  const expectedChain = typeof tx.chainId === "number"
    ? tx.chainId
    : typeof tx.chainId === "string"
    ? Number.parseInt(String(tx.chainId), tx.chainId.toString().startsWith("0x") ? 16 : 10)
    : context.chainId;
  if (Number.isFinite(expectedChain) && expectedChain !== context.chainId) {
    throw new Error("Quote chain mismatch. Refresh the quote on the correct network.");
  }

  let txValue: bigint;
  try {
    const raw = String(tx.value ?? "0x0");
    txValue = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
  } catch {
    throw new Error("Quote returned a malformed value field. Refusing to sign.");
  }

  const isNativeSource = context.fromTokenAddress.toLowerCase() === context.nativeTokenAddress.toLowerCase();
  let fromAmount = 0n;
  try {
    fromAmount = BigInt(quote.fromAmount);
  } catch {
    fromAmount = 0n;
  }

  // Parse LI.FI's declared native overhead, then CLAMP it to a local hard
  // ceiling so a hostile quote can't inflate the allowed value by declaring
  // huge fake fees (review concern #1).
  let declaredOverhead = 0n;
  try {
    declaredOverhead = quote.estimatedNativeOverhead ? BigInt(quote.estimatedNativeOverhead) : 0n;
  } catch {
    declaredOverhead = 0n;
  }
  const nativeOverhead = cappedNativeOverhead(context.chainId, declaredOverhead);

  if (!isNativeSource) {
    // ERC20 swaps must not move native value... except the user must still
    // pay native bridge/messaging fees, which LI.FI puts in tx.value even
    // when the bridged asset is an ERC20. Allow tx.value up to the CAPPED
    // native overhead (with a small rounding buffer); reject anything beyond.
    const erc20Allowed = nativeOverhead + (nativeOverhead * NATIVE_VALUE_BUFFER_BPS) / 10_000n;
    if (txValue > erc20Allowed) {
      throw new Error(
        "Quote tries to send more native value than the capped bridge-fee allowance. Refusing to sign — refresh the quote."
      );
    }
  } else if (fromAmount > 0n) {
    // Native-source route: allow tx.value = fromAmount + CAPPED bridge/gas
    // fees + a small rounding buffer.
    const base = fromAmount + nativeOverhead;
    const allowed = base + (base * NATIVE_VALUE_BUFFER_BPS) / 10_000n;
    if (txValue > allowed) {
      throw new Error(
        `Quote tries to send ${txValue} wei, more than fromAmount (${fromAmount}) + capped native fees (${nativeOverhead}). Refusing to sign — refresh the quote.`
      );
    }
  }

  // M1: defend against malicious LI.FI inflation of `fromAmount`. We compare
  // against the SNAPSHOT taken at quote time (set inside `fetchQuote`) — that
  // way a UI-state change of fromTokenMeta between fetch and execute can't
  // cause a false positive.
  if (quote.userInputs) {
    try {
      const expected = parseUnits(quote.userInputs.amount, quote.userInputs.decimals);
      if (expected !== fromAmount) {
        throw new Error(
          "Quote fromAmount does not match the snapshot of what you entered. Refusing to sign — refresh the quote."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Refusing")) throw err;
      throw new Error("Could not verify the quote's amount against the snapshot. Refresh the quote.");
    }
    // Separately: if the live form amount has drifted from the snapshot, the
    // user changed their mind after the quote — fail fast and ask for a refresh.
    if (context.userAmount && context.userAmount !== quote.userInputs.amount) {
      throw new Error(
        "Amount in the form has changed since the quote was fetched. Refresh the quote before executing."
      );
    }
  }
}

/**
 * R1: assert that an ERC20 approval's spender is a known LI.FI router for
 * this chain. Run this *before* the approve tx is signed, so a poisoned
 * quote can't trick the user into granting allowance to an attacker contract.
 */
export function assertSafeApproval(chainId: number, spender: string | undefined): void {
  assertAllowedLifiRouter(chainId, spender);
}

/**
 * R2: light sanity check on a Sui transaction returned by LI.FI. Sui tx bytes
 * are opaque BCS; the WaaP popup can't show a useful preview. At minimum we
 * decode them with @mysten/sui's Transaction parser and verify the sender
 * (when present) matches the connected user. Anything beyond that requires
 * full BCS introspection — out of scope here but worth following up.
 */
export async function assertSafeSuiTxBytes(
  bytes: Uint8Array,
  context: { suiAddress: string }
): Promise<void> {
  if (!bytes || bytes.length === 0) {
    throw new Error("Sui route returned empty transaction bytes. Refresh the quote.");
  }
  const { Transaction } = await import("@mysten/sui/transactions");
  let parsed: ReturnType<typeof Transaction.from>;
  try {
    parsed = Transaction.from(bytes);
  } catch {
    throw new Error("Sui route bytes failed to parse. Refusing to sign.");
  }
  const data = parsed.getData();
  const declaredSender = data.sender ?? undefined;
  if (declaredSender && declaredSender.toLowerCase() !== context.suiAddress.toLowerCase()) {
    throw new Error(
      `Sui transaction declares sender ${declaredSender} but the connected account is ${context.suiAddress}. Refusing to sign.`
    );
  }
}

function normalizeToken(token: LifiToken, appChainId?: number): TokenOption {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    chainId: appChainId ?? token.chainId,
    logoURI: token.logoURI,
    priceUSD: token.priceUSD
  };
}

function normalizeQuote(raw: Record<string, unknown>): LifiQuote {
  const action = raw.action as Record<string, unknown> | undefined;
  const estimate = raw.estimate as Record<string, unknown> | undefined;
  const toolDetails = raw.toolDetails as Record<string, unknown> | undefined;
  const tx = raw.transactionRequest as Record<string, unknown> | undefined;
  const fromToken = action?.fromToken as TokenOption | undefined;
  const toToken = action?.toToken as TokenOption | undefined;
  const fromAmount = String(action?.fromAmount ?? "0");
  const toAmount = String(estimate?.toAmount ?? "0");
  const minAmount = String(estimate?.toAmountMin ?? toAmount);
  const gasCosts = estimate?.gasCosts as Array<{ amountUSD?: string; amount?: string; token?: { address?: string } }> | undefined;
  const feeCosts = estimate?.feeCosts as Array<{ amountUSD?: string; amount?: string; token?: { address?: string }; included?: boolean }> | undefined;
  const approvalAddress = typeof estimate?.approvalAddress === "string" ? estimate.approvalAddress : undefined;
  const estimatedNativeOverhead = sumNativeFees(feeCosts, gasCosts).toString();

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    tool: String(toolDetails?.name ?? raw.tool ?? "LI.FI"),
    fromAmount,
    fromAmountFormatted: formatMaybe(fromAmount, fromToken?.decimals ?? 18),
    toAmount,
    toAmountFormatted: formatMaybe(toAmount, toToken?.decimals ?? 18),
    minReceived: formatMaybe(minAmount, toToken?.decimals ?? 18),
    gasCostUsd: sumUsd(gasCosts),
    feeCostUsd: sumUsd(feeCosts),
    estimatedTime: typeof estimate?.executionDuration === "number" ? estimate.executionDuration : undefined,
    approvalAddress,
    estimatedNativeOverhead,
    transactionRequest: tx
      ? {
          ...tx,
          to: tx.to ? String(tx.to) : undefined,
          data: tx.data ? String(tx.data) : undefined,
          value: tx.value ? String(tx.value) : "0x0",
          chainId: typeof tx.chainId === "number" || typeof tx.chainId === "string" ? tx.chainId : undefined,
          txBytes: getStringField(tx, ["txBytes", "transactionBytes", "transactionBlockBytes", "txData"]),
          transaction: getStringField(tx, ["transaction", "transactionBlock"]),
          bytes: getStringField(tx, ["bytes"])
        }
      : undefined,
    raw
  };
}

function formatMaybe(value: string, decimals: number) {
  try {
    return formatUnits(BigInt(value), decimals);
  } catch {
    return value;
  }
}

function sumUsd(costs?: Array<{ amountUSD?: string }>) {
  if (!costs?.length) return undefined;
  return costs.reduce((sum, cost) => sum + Number(cost.amountUSD ?? 0), 0).toFixed(2);
}

const NATIVE_TOKEN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  // LI.FI / 1inch placeholder for native token
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
]);

/**
 * Sum every cost item denominated in the source chain's NATIVE token. These
 * are bridge messaging fees, protocol fees, and Tx gas estimates that LI.FI
 * expects the user to pay on top of `fromAmount` via `tx.value`. The result
 * becomes the legitimate upper bound on how much tx.value may exceed
 * fromAmount in assertSafeEvmTxRequest.
 *
 * We include `included: true` fee items as well — different bridges set that
 * flag inconsistently, and it's safer to over-estimate the allowed headroom
 * than to reject a valid route.
 */
function sumNativeFees(
  feeCosts?: Array<{ amount?: string; token?: { address?: string } }>,
  gasCosts?: Array<{ amount?: string; token?: { address?: string } }>
): bigint {
  let total = 0n;
  const buckets = [feeCosts, gasCosts];
  for (const list of buckets) {
    if (!list) continue;
    for (const item of list) {
      const addr = item.token?.address?.toLowerCase();
      if (!addr || !NATIVE_TOKEN_ADDRESSES.has(addr)) continue;
      if (!item.amount) continue;
      try {
        total += BigInt(item.amount);
      } catch {
        // ignore malformed entries
      }
    }
  }
  return total;
}

function fallbackTokens(chainId: number): TokenOption[] {
  const chain = CHAINS.find((item) => item.id === chainId) ?? CHAINS[0];
  return [
    {
      address: getNativeTokenAddress(chainId),
      symbol: chain.nativeCurrency,
      name: `${chain.name} native token`,
      decimals: isSuiChain(chainId) ? 9 : 18,
      chainId
    }
  ];
}

function getStringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof source[key] === "string") return source[key] as string;
  }
  return undefined;
}

export function toLifiTokenAddress(chainId: number, token: string) {
  if (isSuiChain(chainId) && token === SUI_NATIVE_TOKEN_ADDRESS) return SUI_NATIVE_TOKEN_ADDRESS;
  return token;
}

async function fetchTokensUncached(chainId: number) {
  let response: Response;
  try {
    response = await fetch(`/api/lifi/tokens?chainId=${chainId}`, { cache: "no-store" });
  } catch {
    return fallbackTokens(chainId);
  }
  if (!response.ok) return fallbackTokens(chainId);
  const payload = (await readJson(response)) as { tokens?: Record<string, LifiToken[]> };
  const lifiChainId = getLifiChainId(chainId);
  const tokens = payload.tokens?.[String(chainId)] ?? payload.tokens?.[lifiChainId];
  const normalized = tokens?.map((token) => normalizeToken(token, chainId)) ?? fallbackTokens(chainId);
  writeTokenCache(chainId, normalized);
  return normalized;
}

function readTokenCache(chainId: number) {
  const memory = tokenMemoryCache.get(chainId);
  if (memory && Date.now() - memory.timestamp < TOKEN_CACHE_TTL_MS) return memory.tokens;
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(tokenCacheKey(chainId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { timestamp?: number; tokens?: TokenOption[] };
    if (!parsed.timestamp || !parsed.tokens || Date.now() - parsed.timestamp >= TOKEN_CACHE_TTL_MS) return undefined;
    // M4: validate every cached token address shape before reuse so an XSS-poisoned
    // cache can't inject a malicious address into the user's send forms.
    const safe = parsed.tokens.filter((token) => isValidCachedToken(token, chainId));
    if (!safe.length) return undefined;
    tokenMemoryCache.set(chainId, { timestamp: parsed.timestamp, tokens: safe });
    return safe;
  } catch {
    return undefined;
  }
}

function isValidCachedToken(token: TokenOption, chainId: number) {
  if (!token || typeof token.address !== "string") return false;
  if (typeof token.symbol !== "string" || typeof token.decimals !== "number") return false;
  if (token.decimals < 0 || token.decimals > 36) return false;
  if (isSuiChain(chainId)) {
    // Sui type strings start with "0x" and may contain "::"; just sanity check non-empty.
    return token.address.length > 0 && token.address.length < 256;
  }
  return isAddress(token.address);
}

function writeTokenCache(chainId: number, tokens: TokenOption[]) {
  const entry = { timestamp: Date.now(), tokens };
  tokenMemoryCache.set(chainId, entry);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tokenCacheKey(chainId), JSON.stringify(entry));
  } catch {
    // Token cache is only a speed-up. Ignore storage quota/private mode failures.
  }
}

function tokenCacheKey(chainId: number) {
  return `waap-action-hub-lifi-tokens-${chainId}`;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
