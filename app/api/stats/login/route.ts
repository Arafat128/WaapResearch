import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, checkSameOrigin } from "@/lib/rate-limit";

/**
 * Global unique-user counter.
 *
 * Backed by Vercel KV / Upstash Redis through its REST API. We don't pull
 * in `@vercel/kv` as a dependency — the REST endpoint takes a JSON command
 * array and returns the result, which is plenty for SADD + SCARD.
 *
 * Required env vars (set automatically when you add Vercel KV to the project,
 * or paste from Upstash console):
 *   KV_REST_API_URL   = https://xxx.upstash.io
 *   KV_REST_API_TOKEN = AbCdEf...
 *
 * Storage: a single Redis Set `waap:tools:users` holding SHA-256 hashes of
 * each wallet address that has connected. Cardinality = unique users.
 *
 * Privacy: we never store the raw address — only its hex SHA-256. That way
 * the count is meaningful but the KV instance is not a wallet-graph leak.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const SET_KEY = "waap:tools:users";

type KvResponse = { result: unknown; error?: string };

async function kvCommand(command: (string | number)[]): Promise<KvResponse | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${KV_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(command),
      cache: "no-store"
    });
    if (!res.ok) return null;
    return (await res.json()) as KvResponse;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const blocked = checkSameOrigin(request);
  if (blocked) return blocked;
  const limited = checkRateLimit(request, { limit: 120, namespace: "stats:get", windowMs: 60_000 });
  if (limited) return limited;

  const configured = Boolean(KV_URL && KV_TOKEN);
  const r = configured ? await kvCommand(["SCARD", SET_KEY]) : null;
  const count = r && typeof r.result === "number" ? r.result : null;
  return NextResponse.json({ count, configured });
}

export async function POST(request: NextRequest) {
  const blocked = checkSameOrigin(request);
  if (blocked) return blocked;
  const limited = checkRateLimit(request, { limit: 60, namespace: "stats:post", windowMs: 60_000 });
  if (limited) return limited;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  // id must be a hex string of reasonable length — we expect a SHA-256 of
  // the wallet address (64 hex chars). Reject anything wild to avoid set
  // pollution.
  const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{16,128}$/.test(id)) {
    return NextResponse.json({ message: "id must be a 16–128 char hex string." }, { status: 400 });
  }

  const configured = Boolean(KV_URL && KV_TOKEN);
  if (!configured) {
    return NextResponse.json({ count: null, configured });
  }

  await kvCommand(["SADD", SET_KEY, id]);
  const r = await kvCommand(["SCARD", SET_KEY]);
  const count = r && typeof r.result === "number" ? r.result : null;
  return NextResponse.json({ count, configured });
}
