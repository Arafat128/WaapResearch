import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getChain, getLifiChainId, isLifiSupportedChain, isSuiChain } from "@/lib/chains";
import { buildLifiQuoteUrl, normalizeUserAmount } from "@/lib/lifi";
import { checkRateLimit, checkSameOrigin } from "@/lib/rate-limit";

const MAX_SLIPPAGE_PERCENT = 50;
const MIN_SLIPPAGE_PERCENT = 0.01;
const MAX_DECIMALS = 36;

export async function POST(request: NextRequest) {
  const blocked = checkSameOrigin(request);
  if (blocked) return blocked;

  const limited = checkRateLimit(request, { limit: 30, namespace: "lifi:quote", windowMs: 60_000 });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["fromChain", "toChain", "fromToken", "toToken", "amount", "fromAddress", "slippage"];
  const missing = required.filter((key) => body[key] === undefined || body[key] === "");
  if (missing.length) {
    return NextResponse.json({ message: `Missing quote fields: ${missing.join(", ")}` }, { status: 400 });
  }

  try {
    // M2: validate every field before forwarding to LI.FI so the proxy can't
    // be turned into an abuse channel and so malformed input gets a clear 400
    // instead of a 502 from upstream.
    const fromChain = Number(body.fromChain);
    const toChain = Number(body.toChain);
    if (!Number.isFinite(fromChain) || !Number.isFinite(toChain)) {
      return NextResponse.json({ message: "fromChain and toChain must be numeric chain IDs." }, { status: 400 });
    }
    if (!isLifiSupportedChain(fromChain) || !isLifiSupportedChain(toChain)) {
      return NextResponse.json(
        {
          message: `LI.FI quote routes are not available for ${getChain(fromChain).name} to ${getChain(toChain).name}. Choose one of the LI.FI-supported mainnets in the Swap/Bridge or Repeat tool.`
        },
        { status: 400 }
      );
    }

    const fromAddress = String(body.fromAddress);
    if (!isValidChainAddress(fromAddress, fromChain)) {
      return NextResponse.json({ message: "fromAddress is not a valid address for the source chain." }, { status: 400 });
    }
    if (body.toAddress !== undefined && body.toAddress !== "") {
      const toAddress = String(body.toAddress);
      if (!isValidChainAddress(toAddress, toChain)) {
        return NextResponse.json({ message: "toAddress is not a valid address for the destination chain." }, { status: 400 });
      }
    }

    const fromToken = String(body.fromToken);
    const toToken = String(body.toToken);
    if (!isValidTokenIdentifier(fromToken, fromChain) || !isValidTokenIdentifier(toToken, toChain)) {
      return NextResponse.json({ message: "fromToken and toToken must be valid token addresses for the selected chains." }, { status: 400 });
    }

    const slippagePercent = Number(body.slippage);
    if (!Number.isFinite(slippagePercent) || slippagePercent < MIN_SLIPPAGE_PERCENT || slippagePercent > MAX_SLIPPAGE_PERCENT) {
      return NextResponse.json(
        { message: `slippage must be between ${MIN_SLIPPAGE_PERCENT} and ${MAX_SLIPPAGE_PERCENT} percent.` },
        { status: 400 }
      );
    }

    const decimals = Number(body.fromTokenDecimals ?? 18);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
      return NextResponse.json({ message: "fromTokenDecimals must be an integer between 0 and 36." }, { status: 400 });
    }

    const amount = String(body.amount);
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      return NextResponse.json({ message: "amount must be a positive decimal." }, { status: 400 });
    }

    const params = new URLSearchParams({
      fromChain: getLifiChainId(fromChain),
      toChain: getLifiChainId(toChain),
      fromToken,
      toToken,
      fromAmount: normalizeUserAmount(amount, decimals),
      fromAddress,
      slippage: String(slippagePercent / 100)
    });
    if (body.toAddress) params.set("toAddress", String(body.toAddress));

    const quoteUrl = buildLifiQuoteUrl(params);
    const response = await fetch(quoteUrl, {
      headers: lifiHeaders(),
      cache: "no-store"
    });

    const payload = await readJson(response);
    if (!response.ok) {
      return NextResponse.json(
        { message: normalizeLifiError(payload), details: payload },
        { status: response.status }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: normalizeNetworkError(error) },
      { status: 502 }
    );
  }
}

function isValidChainAddress(value: string, chainId: number) {
  if (isSuiChain(chainId)) {
    // Sui addresses are 0x-prefixed 32-byte hex (66 chars total).
    return /^0x[0-9a-fA-F]{1,64}$/.test(value);
  }
  return isAddress(value);
}

function isValidTokenIdentifier(value: string, chainId: number) {
  if (isSuiChain(chainId)) {
    // Sui token identifiers can be either an address or a fully-qualified type
    // like "0x2::sui::SUI". Reject anything with whitespace or control chars.
    if (!value || value.length > 256) return false;
    return /^[0-9a-zA-Z_:<>,\-\.]+$/.test(value);
  }
  return isAddress(value);
}

function normalizeLifiError(payload: { message?: string; errors?: unknown; details?: unknown }) {
  const message = payload?.message ?? "";
  if (message.includes("fromChain must be equal") || JSON.stringify(payload).includes("/fromChain")) {
    return "LI.FI rejected this source chain. Choose one of the LI.FI-supported mainnets shown in the form.";
  }
  if (message.includes("None of the available routes") || message.includes("generate a tx")) {
    return "LI.FI found routes, but none could generate an executable transaction. Try different tokens, a larger amount, or slightly higher slippage.";
  }
  if (message.toLowerCase().includes("insufficient")) {
    return "LI.FI says the wallet balance is not enough for this route, including gas and fees.";
  }
  return message || "LI.FI could not return a route for these tokens, amount, or chains. Try a more liquid token pair or a larger amount.";
}

function normalizeNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("fetch failed") || message.includes("Failed to fetch")) {
    return "The app could not reach LI.FI right now. Check your internet connection, wait a moment, then refresh the quote.";
  }
  return message || "Unable to fetch LI.FI quote.";
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as { message?: string; errors?: unknown; details?: unknown };
  } catch {
    return {};
  }
}

function lifiHeaders() {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  return headers;
}
