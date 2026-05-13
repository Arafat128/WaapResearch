import { NextRequest, NextResponse } from "next/server";
import { getLifiChainId } from "@/lib/chains";

const LIFI_API_BASE = process.env.NEXT_PUBLIC_LIFI_API_BASE ?? "https://li.quest/v1";

export async function GET(request: NextRequest) {
  const chainId = request.nextUrl.searchParams.get("chainId");
  if (!chainId) {
    return NextResponse.json({ message: "chainId is required." }, { status: 400 });
  }

  try {
    const response = await fetch(`${LIFI_API_BASE}/tokens?chains=${getLifiChainId(Number(chainId))}`, {
      headers: lifiHeaders(),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`LI.FI tokens request failed: ${response.status}`);
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { tokens: {}, message: normalizeNetworkError(error) },
      { status: 502 }
    );
  }
}

function normalizeNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("fetch failed") || message.includes("Failed to fetch")) {
    return "The app could not reach LI.FI tokens right now. You can retry or use a custom token address.";
  }
  return message || "Unable to fetch LI.FI tokens.";
}

function lifiHeaders() {
  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  return headers;
}
