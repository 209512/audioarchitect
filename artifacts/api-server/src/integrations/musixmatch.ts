/**
 * ===========================================================================
 * Musixmatch — Synced lyrics (server-side adapter)
 * ===========================================================================
 *
 * The API key is read from `process.env.MUSIXMATCH_API_KEY` and never leaves
 * the server. The browser calls `GET /api/lyrics?title=&artist=`; this module
 * queries Musixmatch and normalizes the result into the same `RichSyncLine`
 * shape the game already uses, so the universal lyric classifier can run on
 * REAL lyrics. It first tries line-synced subtitles (LRC); if the key/plan
 * doesn't allow it, it falls back to plain (unsynced) lyrics.
 */

const MUSIXMATCH_API = "https://api.musixmatch.com/ws/1.1";

export interface NormalizedLyricLine {
  ts: number;
  te: number;
  text: string;
}

export interface LyricsResult {
  synced: boolean;
  lines: NormalizedLyricLine[];
  plain: string | null;
}

/** Minimal shape of the Musixmatch JSON envelope we read. */
interface MusixmatchResponse {
  message?: {
    header?: { status_code?: number };
    body?: {
      subtitle?: { subtitle_body?: string };
      lyrics?: { lyrics_body?: string };
    };
  };
}

/** True when a Musixmatch API key is configured (never exposes the value). */
export function isMusixmatchConfigured(): boolean {
  return Boolean(process.env["MUSIXMATCH_API_KEY"]);
}

/** Parse an LRC subtitle body ("[mm:ss.xx] text") into timed lines. */
function parseLrc(lrc: string): NormalizedLyricLine[] {
  const stamped: { t: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!m) continue;
    const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    if (text) stamped.push({ t, text });
  }
  stamped.sort((a, b) => a.t - b.t);
  return stamped.map((l, i) => ({
    ts: l.t,
    te: stamped[i + 1]?.t ?? l.t + 4,
    text: l.text,
  }));
}

/** Fetch synced (or plain) lyrics for a track title + artist from Musixmatch. */
export async function fetchLyrics(
  title: string,
  artist: string,
): Promise<LyricsResult> {
  const key = process.env["MUSIXMATCH_API_KEY"];
  if (!key) throw new Error("MUSIXMATCH_API_KEY not configured");

  const base = new URLSearchParams({
    q_track: title,
    q_artist: artist,
    apikey: key,
    format: "json",
  });

  // 1) Try line-synced subtitles (LRC format).
  const subParams = new URLSearchParams(base);
  subParams.set("subtitle_format", "lrc");
  const subRes = await fetch(
    `${MUSIXMATCH_API}/matcher.subtitle.get?${subParams.toString()}`,
  );
  if (subRes.ok) {
    const data = (await subRes.json()) as MusixmatchResponse;
    const status = data?.message?.header?.status_code;
    const body = data?.message?.body?.subtitle?.subtitle_body;
    if (status === 200 && typeof body === "string" && body.trim()) {
      const lines = parseLrc(body);
      if (lines.length) return { synced: true, lines, plain: null };
    }
  }

  // 2) Fall back to plain (unsynced) lyrics.
  const lyrRes = await fetch(
    `${MUSIXMATCH_API}/matcher.lyrics.get?${base.toString()}`,
  );
  if (lyrRes.ok) {
    const data = (await lyrRes.json()) as MusixmatchResponse;
    const status = data?.message?.header?.status_code;
    const plain = data?.message?.body?.lyrics?.lyrics_body;
    if (status === 200 && typeof plain === "string" && plain.trim()) {
      return { synced: false, lines: [], plain };
    }
  }

  return { synced: false, lines: [], plain: null };
}
