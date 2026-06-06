import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, checkSameOrigin } from "@/lib/rate-limit";

const LIFI_API_BASE = process.env.NEXT_PUBLIC_LIFI_API_BASE ?? "https://li.quest/v1";

export async function GET(request: NextRequest) {
  const blocked = checkSameOrigin(request);
  if (blocked) return blocked;
  const limited = checkRateLimit(request, { limit: 60, namespace: "lifi:chains", windowMs: 60_000 });
  if (limited) return limited;

  try {
    const response = await fetch(`${LIFI_API_BASE}/chains`, {
      headers: lifiHeaders(),
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      throw new Error(`LI.FI chains request failed: ${response.status}`);
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { chains: [], message: error instanceof Error ? error.message : "Unable to fetch LI.FI chains." },
      { status: 502 }
    );
  }
}

function lifiHeaders() {
  const headers: Record<string, string> = {};
  // Optional server-side API key. Keep this in environment variables, never frontend code.
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  return headers;
}
