import type { RichSyncLine, ClueCategory, ClueObjectType } from "../types";

/**
 * ===========================================================================
 * Musixmatch Pro — Synced lyrics adapter  (MOCK)
 * ===========================================================================
 *
 * Musixmatch's `track.richsync.get` endpoint returns word/line level
 * time-coded lyrics. We project those lines as glowing 3D holograms that fade
 * in/out in sync with the audio player's timestamp.
 *
 * --- INTEGRATION SWAP POINT ---
 * Replace `getRichSync` with a real call to `track.richsync.get`, then map the
 * raw payload onto our normalized `RichSyncLine[]` shape. The richsync body is
 * a JSON string of `[{ ts, te, l: [{ c, o }], x }]`; we only need `ts`, `te`
 * and the joined line text (`x`).
 *
 * --- UNIVERSAL CLUE CLASSIFICATION ---
 * The escape puzzle is NOT tied to one song or one word. Every incoming line is
 * screened by `classifyLyric` into one of four universal NLP categories. The
 * matched token becomes the dynamic password and the category decides which 3D
 * object spawns (see three/ClueObject.tsx):
 *   - time    -> digits or time words      -> Digital Keypad
 *   - emotion -> sensory / emotional words -> Holographic Mirror
 *   - space   -> spatial / action words    -> Floating Speaker
 *   - default -> song title (peak fallback)-> Pulsing Core
 */

/** MOCK richsync payload — deliberately spans all three keyword categories. */
export const MOCK_RICHSYNC: RichSyncLine[] = [
  { ts: 1.5, te: 5.0, text: "Welcome, architect, to the room of sound" },
  { ts: 5.0, te: 9.0, text: "The clock is ticking, midnight draws the line" },
  { ts: 9.0, te: 13.0, text: "Count it down from 24 to zero" },
  { ts: 13.0, te: 17.5, text: "I can see the tears behind your eyes" },
  { ts: 17.5, te: 22.0, text: "Your heart still beats for what you love" },
  { ts: 22.0, te: 26.5, text: "Run for the door before the walls collapse" },
  { ts: 26.5, te: 31.0, text: "Dance back through the static and go" },
  { ts: 31.0, te: 35.5, text: "Every frequency hides a way to leave" },
  { ts: 35.5, te: 40.0, text: "The exit glows where the rhythm rings" },
  { ts: 40.0, te: 45.0, text: "Escape the room the music brings" },
];

/**
 * Universal keyword groups. The matched word becomes the dynamic password.
 * Extend these freely — the engine never assumes a specific song.
 */
export const CATEGORY_KEYWORDS: Record<
  Exclude<ClueCategory, "default">,
  readonly string[]
> = {
  time: [
    "time",
    "clock",
    "watch",
    "midnight",
    "night",
    "tick",
    "second",
    "minute",
    "hour",
  ],
  emotion: ["love", "heart", "tears", "look", "eyes", "see"],
  space: ["door", "wall", "run", "stop", "back", "dance", "go"],
};

/** Order categories are screened in (digits are screened first, as TIME). */
const CATEGORY_ORDER: Exclude<ClueCategory, "default">[] = [
  "time",
  "emotion",
  "space",
];

/** Map a clue category to the 3D object that represents it. */
export function objectForCategory(category: ClueCategory): ClueObjectType {
  switch (category) {
    case "time":
      return "keypad";
    case "emotion":
      return "mirror";
    case "space":
      return "speaker";
    default:
      return "core";
  }
}

/** A classification result: which category fired and the exact matched token. */
export interface LyricMatch {
  category: Exclude<ClueCategory, "default">;
  password: string;
}

/**
 * Screen a lyric line through the universal NLP categories. Digits are treated
 * as a TIME/NUMBER match first (the exact number becomes the password), then
 * the time/emotion/space keyword groups in order. Returns null when nothing
 * sharp matches (the caller may then fall back to the song title on a peak).
 */
export function classifyLyric(text: string): LyricMatch | null {
  const num = text.match(/\d+/);
  if (num) return { category: "time", password: num[0] };

  const lower = text.toLowerCase();
  for (const category of CATEGORY_ORDER) {
    for (const kw of CATEGORY_KEYWORDS[category]) {
      if (new RegExp(`\\b${kw}\\b`).test(lower)) {
        return { category, password: kw };
      }
    }
  }
  return null;
}

/** Find the first mock lyric line that classifies to a given category (for demos). */
export function getDemoMatchForCategory(
  category: Exclude<ClueCategory, "default">,
): { lyric: string; match: LyricMatch } | null {
  for (const line of MOCK_RICHSYNC) {
    const m = classifyLyric(line.text);
    if (m && m.category === category) return { lyric: line.text, match: m };
  }
  return null;
}

/** Back-compat: the matched time-word in a line, lowercased — or null. */
export function matchTimeKeyword(text: string): string | null {
  const m = classifyLyric(text);
  return m && m.category === "time" ? m.password.toLowerCase() : null;
}

/**
 * Normalize any song title into the fallback unlock password: drop a trailing
 * parenthetical suffix (e.g. "(sample)") and lowercase. Derived at arm time
 * from the current track's title so the "default" clue stays song-agnostic.
 */
export function titleToPassword(title: string): string {
  return title.replace(/\s*\(.*\)\s*/, "").trim().toLowerCase();
}

/**
 * Detect whether a track is instrumental (no usable lyrics) so the game can
 * automatically switch to Frequency Hack mode. Pass the track's richsync; with
 * no argument it inspects the mock lyric stream.
 */
export function isInstrumentalTrack(lines: RichSyncLine[] = MOCK_RICHSYNC): boolean {
  return lines.filter((l) => l.text.trim().length > 0).length === 0;
}

/** Backend proxy that holds the Musixmatch key server-side. */
const LYRICS_ENDPOINT = "/api/lyrics";

/** Shape returned by `GET /api/lyrics` (see api-server musixmatch adapter). */
interface LyricsResponse {
  synced: boolean;
  lines: { ts: number; te: number; text: string }[];
  plain: string | null;
}

/**
 * A resolved lyric stream plus where it came from: `real` synced lyrics from
 * Musixmatch, or the bundled `mock` fallback (no real synced lyrics for the
 * track, or the upstream was unavailable). Callers can surface a notice when
 * the fallback kicks in for a player-chosen title.
 */
export interface ResolvedLyrics {
  lines: RichSyncLine[];
  source: "real" | "mock";
}

/**
 * Fetch REAL synced lyrics for a track from Musixmatch via the backend proxy
 * and map them onto the game's `RichSyncLine[]` shape. The key stays
 * server-side. Falls back to the bundled mock stream when no real synced lyrics
 * exist for the track (e.g. the custom sample) or the upstream is unavailable,
 * so gameplay always has a lyric stream to classify.
 */
export async function getRichSync(
  title: string,
  artist = "",
): Promise<ResolvedLyrics> {
  if (typeof window === "undefined") return { lines: MOCK_RICHSYNC, source: "mock" };
  try {
    const url =
      `${LYRICS_ENDPOINT}?title=${encodeURIComponent(title)}` +
      `&artist=${encodeURIComponent(artist)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as LyricsResponse;
      if (data.synced && data.lines.length) {
        return {
          lines: data.lines.map((l) => ({ ts: l.ts, te: l.te, text: l.text })),
          source: "real",
        };
      }
    }
  } catch {
    // fall through to the mock stream
  }
  return { lines: MOCK_RICHSYNC, source: "mock" };
}

/** Find the line that should be visible at the given playback time. */
export function lineAtTime(
  lines: RichSyncLine[],
  seconds: number,
): { line: RichSyncLine; index: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (seconds >= l.ts && seconds < l.te) return { line: l, index: i };
  }
  return null;
}
