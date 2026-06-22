---
name: Server fetching the app's own static assets
description: Why a backend fetch of an artifact's bundled asset can silently get index.html instead of the file
---

When a backend route needs to fetch one of the frontend's own bundled static
assets (e.g. an mp3 in `public/`) so it can hand the URL to a third-party API
(Cyanite upload, LALAL.AI separation), the URL path must respect the artifact's
**base path**, or the dev server returns the SPA `index.html` fallback (HTTP 200,
`Content-Type: text/html`) instead of the real file. The third-party then fails
with a generic, unhelpful error (Cyanite: "Unexpected error occurred.").

**Why:** Vite serves the SPA fallback for any unknown path. A guessed path like
`/audio-architect/audio/x.mp3` when the artifact's `BASE_PATH` is `/` does not
match the real asset (`/audio/x.mp3`), so you get HTML, not the asset — and it
still returns 200, so it looks fine until you check size/content-type.

**How to apply:**
- The frontend should build the absolute URL from `window.location.origin +
  import.meta.env.BASE_URL + path` and pass that to the backend, rather than the
  backend guessing the path. `BASE_URL` already encodes the artifact base.
- When debugging a "the upstream API rejected our file" error, first verify the
  bytes the server actually fetched: check `Content-Type` and size, not just the
  HTTP status. `text/html` + small size = you fetched the SPA shell.
- The backend SSRF guard (`assertAllowedFetchUrl`) allows this app's own origins
  (`REPLIT_DOMAINS`) and localhost, so the browser-sent absolute dev-domain URL
  passes the guard.
