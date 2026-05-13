import { NextRequest, NextResponse } from "next/server";
import { getChain, getLifiChainId, isLifiSupportedChain } from "@/lib/chains";
import { buildLifiQuoteUrl, normalizeUserAmount } from "@/lib/lifi";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const required = ["fromChain", "toChain", "fromToken", "toToken", "amount", "fromAddress", "slippage"];
  const missing = required.filter((key) => body[key] === undefined || body[key] === "");
  if (missing.length) {
    return NextResponse.json({ message: `Missing quote fields: ${missing.join(", ")}` }, { status: 400 });
  }

  try {
    const fromChain = Number(body.fromChain);
    const toChain = Number(body.toChain);
    if (!isLifiSupportedChain(fromChain) || !isLifiSupportedChain(toChain)) {
      return NextResponse.json(
        {
          message: `LI.FI quote routes are not available for ${getChain(fromChain).name} to ${getChain(toChain).name}. Choose one of the LI.FI-supported mainnets in the Swap/Bridge or Repeat tool.`
        },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      fromChain: getLifiChainId(fromChain),
      toChain: getLifiChainId(toChain),
      fromToken: String(body.fromToken),
      toToken: String(body.toToken),
      fromAmount: normalizeUserAmount(String(body.amount), Number(body.fromTokenDecimals ?? 18)),
      fromAddress: String(body.fromAddress),
      slippage: String(Number(body.slippage) / 100)
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
