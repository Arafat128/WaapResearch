import { formatUnits, parseUnits } from "viem";
import { CHAINS, getLifiChainId, getNativeTokenAddress, isSuiChain, SUI_NATIVE_TOKEN_ADDRESS } from "@/lib/chains";
import type { LifiQuote, LifiQuoteRequest, TokenOption } from "@/types";

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
      headers: { "content-type": "application/json" },
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

  return normalizeQuote(payload);
}

export function buildLifiQuoteUrl(params: URLSearchParams) {
  return `${API_BASE}/quote?${params.toString()}`;
}

export function normalizeUserAmount(amount: string, decimals: number) {
  return parseUnits(amount || "0", decimals).toString();
}

function normalizeToken(token: LifiToken, appChainId?: number): TokenOption {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    chainId: appChainId ?? token.chainId,
    logoURI: token.logoURI
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
  const gasCosts = estimate?.gasCosts as Array<{ amountUSD?: string }> | undefined;
  const feeCosts = estimate?.feeCosts as Array<{ amountUSD?: string }> | undefined;
  const approvalAddress = typeof estimate?.approvalAddress === "string" ? estimate.approvalAddress : undefined;

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
    tokenMemoryCache.set(chainId, { timestamp: parsed.timestamp, tokens: parsed.tokens });
    return parsed.tokens;
  } catch {
    return undefined;
  }
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
