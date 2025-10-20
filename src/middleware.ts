import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter for API routes.
 * Disabled in development/localhost so you can test freely.
 * Production limits:
 *   - /api/weekly : 2 req/min per IP
 *   - /api/echo   : 6 req/min per IP
 *   - others      : 60 req/min per IP
 */

type Bucket = number[];
const buckets = new Map<string, Bucket>();
const DEFAULT_WINDOW_MS = 60_000;

const LIMITS = [
  { test: (p: string) => p.startsWith("/api/weekly"), max: 2, windowMs: DEFAULT_WINDOW_MS },
  { test: (p: string) => p.startsWith("/api/echo"),   max: 6, windowMs: DEFAULT_WINDOW_MS },
  { test: () => true,                                  max: 60, windowMs: DEFAULT_WINDOW_MS },
];

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  // @ts-expect-error NextRequest.ip not always typed
  return String(req.ip ?? "unknown");
}

function getLimit(pathname: string) {
  for (const l of LIMITS) if (l.test(pathname)) return l;
  return { max: 60, windowMs: DEFAULT_WINDOW_MS };
}

function hit(key: string, windowMs: number, max: number) {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  fresh.push(now);
  buckets.set(key, fresh);
  const remaining = Math.max(0, max - fresh.length);
  return { limited: fresh.length > max, remaining };
}

export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const host = req.nextUrl.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isDev || isLocal) return NextResponse.next();

  if (req.method === "OPTIONS") return NextResponse.next();

  const { pathname } = new URL(req.url);
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const ip = getClientIp(req);
  const { max, windowMs } = getLimit(pathname);

  const group =
    pathname.startsWith("/api/weekly") ? "/api/weekly" :
    pathname.startsWith("/api/echo")   ? "/api/echo"   :
    "/api/*";

  const key = `${ip}::${group}`;
  const { limited, remaining } = hit(key, windowMs, max);

  if (limited) {
    const res = NextResponse.json(
      { error: "rate_limit", message: "Too many requests. Please slow down." },
      { status: 429 }
    );
    res.headers.set("Retry-After", Math.ceil(windowMs / 1000).toString());
    res.headers.set("X-RateLimit-Limit", String(max));
    res.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(max));
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}

export const config = { matcher: ["/api/:path*"] };
