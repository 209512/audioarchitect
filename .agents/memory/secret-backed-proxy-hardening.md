---
name: Secret-backed proxy hardening
description: Why server-side-only API keys still need same-origin + rate-limit guards on the proxy routes
---

When a partner/paid API key is kept server-side and the browser reaches it through
an `/api/*` proxy route, "the key never reaches the client" is necessary but NOT
sufficient. An open, permissively-CORS'd proxy is a public paid-API relay: any
third-party site can call it and burn your quota without ever seeing the key.

**Rule:** every secret-backed proxy route that fronts a paid/metered upstream must
be (1) restricted to the app's own origins and (2) rate-limited.

**Why:** code review flagged this exact gap in the AudioArchitect partner-API wiring
(ElevenLabs/Musixmatch). Keys were correctly server-only, but `/api/voice/taunt` was
unauthenticated + global CORS — a cost/abuse hole.

**How to apply (this repo's api-server):**
- Browser calls `/api/*` same-origin via the shared Replit proxy, so a same-origin
  request sends no `Origin` (or our own domain). Allow no-Origin + origins built from
  `REPLIT_DOMAINS` and `REPLIT_DEV_DOMAIN`; 403 anything else.
- `app.set("trust proxy", 1)` so `req.ip` is the real client (rate limiting behind the proxy).
- Status/health routes that return booleans only can stay unguarded.
- A dependency-free in-memory fixed-window limiter is fine for a single-instance server.
