/**
 * ===========================================================================
 * Cyanite AI — genre / mood analysis (server-side adapter)  [LIVE]
 * ===========================================================================
 *
 * The API key is read from `process.env.CYANITE_API_KEY` and never leaves the
 * server. The browser calls `GET /api/genre?trackUrl=`; this module uploads the
 * track to Cyanite's GraphQL API, runs the v7 audio analysis, and returns the
 * dominant genre/mood/energy/bpm so the game can auto re-skin the room.
 *
 * Cyanite's analysis is asynchronous (upload -> create -> poll), so this module
 * runs the pipeline in the background and caches the result per track URL
 * ("analyze once"). The route polls this state machine instead of blocking a
 * single long request (which the proxy could time out).
 */

import { logger } from "../lib/logger";
import { assertAllowedFetchUrl } from "../lib/security";

const CYANITE_API = "https://api.cyanite.ai/graphql";

export interface CyaniteAnalysis {
  genreTags: string[];
  moodTags: string[];
  energyLevel: string | null;
  bpm: number | null;
}

export type AnalysisState =
  | { status: "analyzing" }
  | { status: "ready"; result: CyaniteAnalysis }
  | { status: "error"; error: string };

/** True when a Cyanite API key is configured (never exposes the value). */
export function isCyaniteConfigured(): boolean {
  return Boolean(process.env["CYANITE_API_KEY"]);
}

/** Analyze-once cache, keyed by the (validated) track URL. */
const cache = new Map<string, AnalysisState>();

/** Max distinct tracks retained; track URLs are per-upload so this bounds memory. */
const CACHE_MAX = 50;

/** Write to the cache as an LRU: refresh recency, then evict the oldest entries. */
function setCache(trackUrl: string, state: AnalysisState): void {
  cache.delete(trackUrl);
  cache.set(trackUrl, state);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Minimal typed GraphQL POST against the Cyanite endpoint. */
async function cyaniteGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const key = process.env["CYANITE_API_KEY"];
  if (!key) throw new Error("CYANITE_API_KEY not configured");
  const res = await fetch(CYANITE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Cyanite HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Cyanite GraphQL: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error("Cyanite returned no data");
  return json.data;
}

/** Step 1: request a presigned upload slot. */
async function requestUpload(): Promise<{ id: string; uploadUrl: string }> {
  const data = await cyaniteGraphQL<{
    fileUploadRequest: { id: string; uploadUrl: string };
  }>(`mutation { fileUploadRequest { id uploadUrl } }`);
  return data.fileUploadRequest;
}

/** Step 3: register the uploaded file as a library track (auto-starts v7). */
async function createLibraryTrack(
  uploadId: string,
  title: string,
): Promise<string> {
  const data = await cyaniteGraphQL<{
    libraryTrackCreate:
      | { __typename: "LibraryTrackCreateSuccess"; createdLibraryTrack: { id: string } }
      | { __typename: "LibraryTrackCreateError"; code: string; message: string };
  }>(
    `mutation CreateTrack($input: LibraryTrackCreateInput!) {
       libraryTrackCreate(input: $input) {
         __typename
         ... on LibraryTrackCreateSuccess { createdLibraryTrack { id } }
         ... on LibraryTrackCreateError { code message }
       }
     }`,
    { input: { uploadId, title } },
  );
  const r = data.libraryTrackCreate;
  if (r.__typename === "LibraryTrackCreateSuccess") {
    return r.createdLibraryTrack.id;
  }
  throw new Error(`libraryTrackCreate failed: ${r.message}`);
}

/** Step 4: poll the v7 analysis until it finishes (or fails / times out). */
async function pollAnalysis(trackId: string): Promise<CyaniteAnalysis> {
  const query = `query Track($id: ID!) {
    libraryTrack(id: $id) {
      __typename
      ... on LibraryTrack {
        audioAnalysisV7 {
          __typename
          ... on AudioAnalysisV7Finished {
            result { genreTags moodTags energyLevel bpmRangeAdjusted }
          }
          ... on AudioAnalysisV7Failed { error { message } }
        }
      }
    }
  }`;
  const maxAttempts = 40; // ~40 * 3s = 2 min ceiling
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await cyaniteGraphQL<{
      libraryTrack: {
        __typename: string;
        audioAnalysisV7?: {
          __typename: string;
          result?: {
            genreTags: string[];
            moodTags: string[];
            energyLevel: string | null;
            bpmRangeAdjusted: number | null;
          };
          error?: { message: string };
        };
      };
    }>(query, { id: trackId });

    const analysis = data.libraryTrack?.audioAnalysisV7;
    const t = analysis?.__typename;
    if (t === "AudioAnalysisV7Finished" && analysis?.result) {
      return {
        genreTags: analysis.result.genreTags ?? [],
        moodTags: analysis.result.moodTags ?? [],
        energyLevel: analysis.result.energyLevel ?? null,
        bpm: analysis.result.bpmRangeAdjusted ?? null,
      };
    }
    if (t === "AudioAnalysisV7Failed") {
      throw new Error(analysis?.error?.message ?? "Cyanite analysis failed");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Cyanite analysis timed out");
}

/** The full background pipeline; writes its outcome into the cache. */
async function runAnalysis(trackUrl: string, title: string): Promise<void> {
  try {
    const audioRes = await fetch(trackUrl);
    if (!audioRes.ok) throw new Error(`Fetch track HTTP ${audioRes.status}`);
    const bytes = Buffer.from(await audioRes.arrayBuffer());

    const { id: uploadId, uploadUrl } = await requestUpload();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: bytes,
    });
    if (!put.ok) throw new Error(`Upload PUT HTTP ${put.status}`);

    const trackId = await createLibraryTrack(uploadId, title);
    const result = await pollAnalysis(trackId);
    setCache(trackUrl, { status: "ready", result });
    logger.info(
      { genre: result.genreTags, bpm: result.bpm },
      "Cyanite analysis ready",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setCache(trackUrl, { status: "error", error: message });
    logger.error({ err }, "Cyanite analysis failed");
  }
}

/**
 * Return the current analysis state for a track, kicking off the background
 * pipeline on first request. Validates the URL is one of our own origins.
 */
export function getOrStartAnalysis(
  trackUrl: string,
  title: string,
): AnalysisState {
  assertAllowedFetchUrl(trackUrl);
  const existing = cache.get(trackUrl);
  if (existing) return existing;
  setCache(trackUrl, { status: "analyzing" });
  void runAnalysis(trackUrl, title);
  return { status: "analyzing" };
}
