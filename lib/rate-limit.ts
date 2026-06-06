import { NextRequest, NextResponse } from "next/server";

type RateLimitOptions = {
  limit: number;
  namespace: string;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 5000;

/**
 * H1 caveat: this is per-instance memory. On Vercel each lambda warms its own
 * copy, so the effective limit is `limit × concurrent_instances`. Keep limits
 * conservative and move to Upstash/Vercel KV when you need a real global cap.
 */
export function checkRateLimit(request: NextRequest, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.namespace}:${getClientIp(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    cleanupBuckets(now);
    return null;
  }

  current.count += 1;
  if (current.count <= options.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return NextResponse.json(
    { message: "Too many LI.FI requests. Wait a moment, then try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(current.resetAt / 1000))
      }
    }
  );
}

/**
 * H2: only trust the IP source Vercel itself appends. `x-forwarded-for` on
 * Vercel is comma-separated `<client>, <proxy hops…>`; the LAST entry is the
 * one Vercel's edge wrote and can be trusted, the rest are attacker-supplied.
 * We deliberately ignore `cf-connecting-ip` (we are not behind Cloudflare) and
 * `x-real-ip` is overwritten by Vercel so it's safe but redundant.
 */
function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "local";
}

function cleanupBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size < MAX_BUCKETS) return;
  }
}

/**
 * H4: simple CSRF / abuse mitigation — refuse cross-origin POSTs from sites
 * that aren't us. Returns null when allowed, a 403 response otherwise.
 *
 * Same-origin browser requests omit the Origin header on GETs; we only check
 * when Origin is present so legitimate same-origin fetches still pass.
 */
export function checkSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = new Set<string>();
  const selfOrigin = request.nextUrl.origin;
  if (selfOrigin) allowed.add(selfOrigin);

  const envAllow = process.env.ALLOWED_ORIGINS;
  if (envAllow) {
    for (const value of envAllow.split(",")) {
      const trimmed = value.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }

  if (allowed.has(origin)) return null;

  return NextResponse.json(
    { message: "Cross-origin request blocked." },
    { status: 403 }
  );
}
