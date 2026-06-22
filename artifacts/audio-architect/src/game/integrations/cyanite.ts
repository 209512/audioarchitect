import type { Genre } from "../types";
import { THEMES, type Theme } from "../themes";

/**
 * ===========================================================================
 * Cyanite AI — Mood / Genre adapter  [LIVE via backend proxy]
 * ===========================================================================
 *
 * Cyanite analyzes the actual audio and returns rich genre/mood tags. We use
 * that real classification to auto re-skin the room.
 *
 * The API key lives only on the server. The browser calls `GET /api/genre`,
 * which uploads the track to Cyanite, runs the v7 analysis (async — the route
 * returns `analyzing` then `ready`), and hands back the dominant tags. This
 * module polls that endpoint and maps the result onto our `Genre` union, so the
 * rest of the app still only depends on `Genre` -> `Theme`. If the key is
 * missing or analysis fails, callers fall back to the default theme.
 */

/** The genres our room currently knows how to render. */
export const SUPPORTED_GENRES: Genre[] = ["hiphop", "classical"];

const GENRE_ENDPOINT = "/api/genre";

/** Raw analysis shape returned by the backend (mirrors Cyanite's result). */
export interface CyaniteAnalysis {
  genreTags: string[];
  moodTags: string[];
  energyLevel: string | null;
  bpm: number | null;
}

type AnalysisState =
  | { status: "analyzing" }
  | { status: "ready"; result: CyaniteAnalysis }
  | { status: "error"; error: string };

/**
 * Cyanite genres that read as calm / acoustic and map to the marble
 * ("classical") room. Everything else maps to the neon ("hiphop") room.
 */
const CALM_GENRES = [
  "classical",
  "orchestral",
  "jazz",
  "ambient",
  "folk",
  "country",
  "singersongwriter",
  "blues",
  "piano",
  "acoustic",
];

const CALM_MOODS = [
  "calm",
  "peaceful",
  "sentimental",
  "romantic",
  "relaxing",
  "melancholic",
  "dreamy",
];

/** Map Cyanite's genre/mood tags onto the room's `Genre` (theme) union. */
export function mapCyaniteToGenre(
  genreTags: string[],
  moodTags: string[],
): Genre {
  const g = (genreTags[0] ?? "").toLowerCase();
  if (CALM_GENRES.some((c) => g.includes(c))) return "classical";
  if (
    genreTags.length === 0 &&
    moodTags.some((m) => CALM_MOODS.includes(m.toLowerCase()))
  ) {
    return "classical";
  }
  return "hiphop";
}

/** Human-readable label for a camelCase Cyanite genre tag (for the HUD). */
export function prettyGenre(tag: string): string {
  return tag
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll the backend Cyanite analysis for a track until it is ready. Returns the
 * raw analysis, or null if Cyanite is unavailable / analysis failed / timed out
 * (the caller then keeps the default theme).
 */
export async function fetchGenreAnalysis(
  trackUrl: string,
  title: string,
): Promise<CyaniteAnalysis | null> {
  if (typeof window === "undefined") return null;
  const url =
    `${GENRE_ENDPOINT}?trackUrl=${encodeURIComponent(trackUrl)}` +
    `&title=${encodeURIComponent(title)}`;
  // ~30 polls * 3s = 90s ceiling, matching the backend analysis budget.
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const state = (await res.json()) as AnalysisState;
      if (state.status === "ready") return state.result;
      if (state.status === "error") return null;
    } catch {
      return null;
    }
    await sleep(3000);
  }
  return null;
}

/** Map a genre to its concrete visual theme. */
export function getThemeForGenre(genre: Genre): Theme {
  return THEMES[genre];
}
