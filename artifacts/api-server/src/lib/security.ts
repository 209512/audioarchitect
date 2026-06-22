import type { RequestHandler } from "express";

/**
 * Origins the browser app is served from. The frontend always calls `/api/*`
 * same-origin through the shared Replit proxy, so the allowed origins are this
 * deployment's own domains. Anything else (a third-party site trying to abuse
 * our secret-backed partner proxy) is rejected.
 */
export function allowedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (host: string | undefined) => {
    const h = host?.trim();
    if (h) origins.add(h.startsWith("http") ? h : `https://${h}`);
  };
  // Comma-separated published domains, plus the dev domain.
  for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) add(d);
  add(process.env.REPLIT_DEV_DOMAIN);
  return [...origins];
}

/**
 * CORS origin check. Same-origin requests (no `Origin` header) are always
 * allowed; cross-origin requests are only allowed from this app's own domains.
 */
export function corsOriginCheck(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    cb(null, true);
    return;
  }
  cb(null, allowedOrigins().includes(origin));
}

/**
 * Guard against SSRF when the server fetches a client-supplied URL. The URL's
 * origin must be one of this app's own domains (or localhost for in-container
 * dev fetches); anything else throws. Used by routes that download a track the
 * browser points at (Cyanite analysis, LALAL.AI separation).
 */
export function assertAllowedFetchUrl(rawUrl: string): void {
  let origin: string;
  try {
    origin = new URL(rawUrl).origin;
  } catch {
    throw new Error("Invalid URL");
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!isLocal && !allowedOrigins().includes(origin)) {
    throw new Error("URL origin is not allowed");
  }
}

/**
 * Reject cross-origin browser requests to secret-backed routes. A same-origin
 * request omits `Origin` (or sends our own); a third-party site sends its own
 * origin, which we 403. This protects paid upstream quota from abuse even
 * though the keys themselves never leave the server.
 */
export const sameOriginOnly: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins().includes(origin)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed" });
    return;
  }
  next();
};

/**
 * Minimal in-memory fixed-window rate limiter, keyed by client IP. Dependency
 * free; sized for a single-instance game server. Protects paid endpoints
 * (ElevenLabs / Musixmatch) from runaway cost.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
}): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    if (entry.count >= opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    entry.count += 1;
    next();
  };
}
