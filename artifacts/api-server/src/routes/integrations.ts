import { Router, type IRouter } from "express";
import {
  isElevenLabsConfigured,
  synthesizeTaunt,
} from "../integrations/elevenlabs";
import {
  isMusixmatchConfigured,
  fetchLyrics,
} from "../integrations/musixmatch";
import {
  isLalalaiConfigured,
  checkStems,
  getOrStartSeparation,
  isLalalaiStemUrl,
} from "../integrations/lalalai";
import {
  isCyaniteConfigured,
  getOrStartAnalysis,
} from "../integrations/cyanite";
import { rateLimit, sameOriginOnly } from "../lib/security";

const router: IRouter = Router();

// Protect the paid upstream endpoints (ElevenLabs / Musixmatch / Cyanite /
// LALAL.AI) from cross-site abuse and runaway cost. Same-origin only + a
// per-IP request budget.
const paidGuard = [
  sameOriginOnly,
  rateLimit({ windowMs: 60_000, max: 30 }),
];

/**
 * GET /api/integrations/status
 *
 * Report which partner API keys are configured. Returns booleans only — the
 * secret values are never exposed to the client.
 */
router.get("/integrations/status", (_req, res) => {
  res.json({
    elevenlabs: isElevenLabsConfigured(),
    musixmatch: isMusixmatchConfigured(),
    lalalai: isLalalaiConfigured(),
    cyanite: isCyaniteConfigured(),
  });
});

/**
 * POST /api/voice/taunt  { text }
 *
 * Synthesize an AI System Voice taunt with ElevenLabs and stream back MP3.
 * The key stays server-side; on any failure the client falls back to the
 * browser's SpeechSynthesis voice.
 */
router.post("/voice/taunt", ...paidGuard, async (req, res) => {
  const text =
    typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Missing 'text'" });
    return;
  }
  if (text.length > 500) {
    res.status(400).json({ error: "'text' too long" });
    return;
  }
  if (!isElevenLabsConfigured()) {
    res.status(503).json({ error: "ElevenLabs not configured" });
    return;
  }
  try {
    const audio = await synthesizeTaunt(text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(audio));
  } catch (err) {
    req.log.error({ err }, "ElevenLabs TTS failed");
    res.status(502).json({ error: "TTS upstream failed" });
  }
});

/**
 * GET /api/lyrics?title=&artist=
 *
 * Fetch real synced (or plain) lyrics for a track from Musixmatch, normalized
 * to the game's lyric-line shape. The key stays server-side.
 */
router.get("/lyrics", ...paidGuard, async (req, res) => {
  const title = typeof req.query.title === "string" ? req.query.title : "";
  const artist = typeof req.query.artist === "string" ? req.query.artist : "";
  if (!title) {
    res.status(400).json({ error: "Missing 'title'" });
    return;
  }
  if (!isMusixmatchConfigured()) {
    res.status(503).json({ error: "Musixmatch not configured" });
    return;
  }
  try {
    const result = await fetchLyrics(title, artist);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Musixmatch lyrics fetch failed");
    res.status(502).json({ error: "Lyrics upstream failed" });
  }
});

/**
 * GET /api/genre?trackUrl=&title=
 *
 * Run (or poll) Cyanite's real audio analysis for a track and return the
 * dominant genre/mood/energy/bpm so the game can auto re-skin the room. The
 * pipeline runs in the background and is cached per track ("analyze once").
 * The key stays server-side; the client falls back to a default theme if this
 * is unavailable.
 */
router.get("/genre", ...paidGuard, (req, res) => {
  const trackUrl =
    typeof req.query.trackUrl === "string" ? req.query.trackUrl : "";
  const title =
    typeof req.query.title === "string" && req.query.title
      ? req.query.title
      : "Untitled";
  if (!trackUrl) {
    res.status(400).json({ error: "Missing 'trackUrl'" });
    return;
  }
  if (!isCyaniteConfigured()) {
    res.status(503).json({ error: "Cyanite not configured" });
    return;
  }
  try {
    const state = getOrStartAnalysis(trackUrl, title);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "Cyanite analysis failed");
    res.status(400).json({ error: "Invalid trackUrl" });
  }
});

/**
 * GET /api/sonar/status
 *
 * Report LALAL.AI's real account status (plan + remaining minutes). Degrades to
 * an "unavailable" status if the key is missing or the upstream call fails.
 */
router.get("/sonar/status", ...paidGuard, async (req, res) => {
  try {
    const status = await checkStems();
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "LALAL.AI status check failed");
    res.status(502).json({ error: "Sonar upstream failed" });
  }
});

/**
 * GET /api/sonar/separate?trackUrl=&filename=
 *
 * Run (or poll) LALAL.AI's real stem-separation pipeline for a track and return
 * the isolated stems. Runs in the background and is cached per track
 * ("separate once") to bound processing-minute cost.
 */
router.get("/sonar/separate", ...paidGuard, (req, res) => {
  const trackUrl =
    typeof req.query.trackUrl === "string" ? req.query.trackUrl : "";
  const filename =
    typeof req.query.filename === "string" && req.query.filename
      ? req.query.filename
      : "track.mp3";
  if (!trackUrl) {
    res.status(400).json({ error: "Missing 'trackUrl'" });
    return;
  }
  if (!isLalalaiConfigured()) {
    res.status(503).json({ error: "LALAL.AI not configured" });
    return;
  }
  try {
    const state = getOrStartSeparation(trackUrl, filename);
    res.json(state);
  } catch (err) {
    req.log.error({ err }, "LALAL.AI separation failed");
    res.status(400).json({ error: "Invalid trackUrl" });
  }
});

/**
 * GET /api/sonar/stem?src=
 *
 * Same-origin proxy for a LALAL.AI stem download URL. Hides the (expiring)
 * upstream CDN URL from the browser and sidesteps cross-origin audio fetches.
 * Only proxies URLs on lalal.ai.
 */
router.get("/sonar/stem", ...paidGuard, async (req, res) => {
  const src = typeof req.query.src === "string" ? req.query.src : "";
  if (!src || !isLalalaiStemUrl(src)) {
    res.status(400).json({ error: "Invalid stem source" });
    return;
  }
  try {
    const upstream = await fetch(src);
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: "Stem fetch failed" });
      return;
    }
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "audio/wav",
    );
    res.setHeader("Cache-Control", "no-store");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "LALAL.AI stem proxy failed");
    res.status(502).json({ error: "Stem proxy failed" });
  }
});

export default router;
