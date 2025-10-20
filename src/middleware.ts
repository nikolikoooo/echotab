import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter.
 * - Works on localhost and Vercel (per-instance memory; good enough as a guardrail)
 * - Stricter limits for expensive endpoints
 *
 * Defaults:
 *   - All /api/* : 60 requests / 60s per IP
 *   - /api/echo  : 6 requests / 60s per IP
 *   - /api/weekly: 2 requests / 60s per IP
 */

type Bucket = number[]; // timestamps (ms)

const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

const LIMITS: Array<{
  test: (p: string) => boolean;
  max: number;
  windowMs: number;
}> = [
  { test: (p) => p.startsWith("/api/weekly"), max: 2, windowMs: DEFAULT_WINDOW_MS },
  { test: (p) => p.startsWith("/api/echo"),   max: 6, windowMs: DEFAULT_WINDOW_MS },
  // fallback default for other /api/*
  { test: () => true, max: DEFAULT_MAX, windowMs: DEFAULT_WINDOW_MS },
];

function getClientIp(req: NextRequest): string {
  // Vercel / proxies
  const xf = req.headers.get("x-forwarded-for");
  if (xf && xf.length) return xf.split(",")[0].trim();
  // Next provides .ip in some runtimes; fallback to socketless value
  // @ts-expect-error - not always typed
  if (req.ip) return String(req.ip);
  return "unknown";
}

function getLimit(pathname: string) {
  for (const rule of LIMITS) {
    if (rule.test(pathname)) return rule;
  }
  return { max: DEFAULT_MAX, windowMs: DEFAULT_WINDOW_MS };
}

function hit(key: string, windowMs: number, max: number): { limited: boolean; remaining: number } {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  fresh.push(now);
  buckets.set(key, fresh);
  const remaining = Math.max(0, max - fresh.length);
  return { limited: fresh.length > max, remaining };
}

export function middleware(req: NextRequest) {
  const { pathname } = new URL(req.url);

  // Only rate-limit API routes (configured again in `config.matcher` below)
  // Allow CORS preflight to pass
  if (req.method === "OPTIONS") return NextResponse.next();

  const ip = getClientIp(req);
  const { max, windowMs } = getLimit(pathname);

  // Key per IP + route "group" so /api/weekly is separate from /api/echo
  const key = `${ip}::${pathname.startsWith("/api/weekly") ? "/api/weekly" :
                        pathname.startsWith("/api/echo")   ? "/api/echo"   :
                        "/api/*"}`;

  const { limited, remaining } = hit(key, windowMs, max);

  if (limited) {
    const res = NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please slow down." },
      { status: 429 }
    );
    // helpful headers
    res.headers.set("Retry-After", Math.ceil(windowMs / 1000).toString());
    res.headers.set("X-RateLimit-Limit", String(max));
    res.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    return res;
  }

  // pass through
  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(max));
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}

// Run only for API routes
export const config = {
  matcher: ["/api/:path*"],
};
