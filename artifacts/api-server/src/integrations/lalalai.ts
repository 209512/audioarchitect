/**
 * ===========================================================================
 * LALAL.AI — Audio sonar / stem separation (server-side adapter)  [LIVE]
 * ===========================================================================
 *
 * The API key is read from `process.env.LALALAI_API_KEY` and never leaves the
 * server. Two real capabilities are exposed through `/api/sonar/*`:
 *
 *   1. `getLimits()` — the account's real plan + remaining processing minutes
 *      (billing/get-limits). Drives a genuine "live" status in the sonar HUD.
 *   2. `separateStems()` — the real upload -> split -> poll pipeline that
 *      isolates a track into stems. Stem separation is asynchronous and costs
 *      processing minutes, so we run it in the background and cache the result
 *      per track URL ("separate once").
 *
 * The sonar's live wall deformation is driven by the Web Audio AnalyserNode on
 * the real playing audio (already real, never mocked); this adapter adds the
 * real stem metadata + account status on top.
 */

import { logger } from "../lib/logger";
import { assertAllowedFetchUrl } from "../lib/security";

const LALALAI_API = "https://www.lalal.ai/api";
const LALALAI_BILLING = "https://www.lalal.ai/billing";

export interface SonarStatus {
  available: boolean;
  detail: string;
  plan?: string;
  minutesLeft?: number;
}

export interface SeparatedStem {
  name: string;
  /** Same-origin proxy path to the stem audio (avoids CORS + URL expiry). */
  url: string;
}

export type SeparationState =
  | { status: "separating"; progress: number }
  | { status: "ready"; stems: SeparatedStem[] }
  | { status: "error"; error: string };

/** True when a LALAL.AI API key is configured (never exposes the value). */
export function isLalalaiConfigured(): boolean {
  return Boolean(process.env["LALALAI_API_KEY"]);
}

function requireKey(): string {
  const key = process.env["LALALAI_API_KEY"];
  if (!key) throw new Error("LALALAI_API_KEY not configured");
  return key;
}

/** Real account limits (plan + remaining processing minutes). */
export async function getLimits(): Promise<{
  plan: string;
  minutesLeft: number;
}> {
  const key = requireKey();
  const res = await fetch(
    `${LALALAI_BILLING}/get-limits/?key=${encodeURIComponent(key)}`,
  );
  if (!res.ok) throw new Error(`LALAL.AI HTTP ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    option?: string;
    process_duration_left?: number;
  };
  if (data.status !== "success") throw new Error("LALAL.AI limits error");
  return {
    plan: data.option ?? "Unknown",
    minutesLeft: Math.round((data.process_duration_left ?? 0) / 60),
  };
}

/** Report sonar/stem availability from the real LALAL.AI account status. */
export async function checkStems(): Promise<SonarStatus> {
  if (!isLalalaiConfigured()) {
    return { available: false, detail: "Sonar offline — running on live audio" };
  }
  try {
    const { plan, minutesLeft } = await getLimits();
    return {
      available: true,
      detail: `Sonar online · ${minutesLeft} min of layer separation left`,
      plan,
      minutesLeft,
    };
  } catch (err) {
    logger.error({ err }, "LALAL.AI limits check failed");
    return { available: false, detail: "Sonar status unavailable" };
  }
}

/** Separate-once cache, keyed by the (validated) track URL. */
const cache = new Map<string, SeparationState>();

/** Max distinct tracks retained; track URLs are per-upload so this bounds memory. */
const CACHE_MAX = 50;

/** Write to the cache as an LRU: refresh recency, then evict the oldest entries. */
function setCache(trackUrl: string, state: SeparationState): void {
  cache.delete(trackUrl);
  cache.set(trackUrl, state);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Upload raw bytes; returns LALAL.AI's internal file id. */
async function upload(bytes: Buffer, filename: string): Promise<string> {
  const key = requireKey();
  const res = await fetch(`${LALALAI_API}/upload/`, {
    method: "POST",
    headers: {
      Authorization: `license ${key}`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`LALAL.AI upload HTTP ${res.status}`);
  const data = (await res.json()) as { status?: string; id?: string; error?: string };
  if (data.status !== "success" || !data.id) {
    throw new Error(`LALAL.AI upload error: ${data.error ?? "unknown"}`);
  }
  return data.id;
}

/** Start a split job isolating the vocal stem (yields vocals + accompaniment). */
async function startSplit(fileId: string): Promise<void> {
  const key = requireKey();
  const params = JSON.stringify([
    { id: fileId, stem: "vocals", splitter: "phoenix" },
  ]);
  const res = await fetch(`${LALALAI_API}/split/`, {
    method: "POST",
    headers: {
      Authorization: `license ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ params }).toString(),
  });
  if (!res.ok) throw new Error(`LALAL.AI split HTTP ${res.status}`);
  const data = (await res.json()) as { status?: string; error?: string };
  if (data.status !== "success") {
    throw new Error(`LALAL.AI split error: ${data.error ?? "unknown"}`);
  }
}

interface CheckResult {
  done: boolean;
  progress: number;
  stemTrack?: string;
  backTrack?: string;
}

/** Poll one split job's status + (when finished) its stem download URLs. */
async function check(fileId: string): Promise<CheckResult> {
  const key = requireKey();
  const res = await fetch(`${LALALAI_API}/check/`, {
    method: "POST",
    headers: {
      Authorization: `license ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ id: fileId }).toString(),
  });
  if (!res.ok) throw new Error(`LALAL.AI check HTTP ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    result?: Record<
      string,
      {
        task?: { state?: string; progress?: number; error?: string };
        split?: { stem_track?: string; back_track?: string };
      }
    >;
  };
  const entry = data.result?.[fileId];
  const task = entry?.task;
  if (task?.state === "error") {
    throw new Error(`LALAL.AI task error: ${task.error ?? "unknown"}`);
  }
  if (task?.state === "success") {
    return {
      done: true,
      progress: 100,
      stemTrack: entry?.split?.stem_track,
      backTrack: entry?.split?.back_track,
    };
  }
  return { done: false, progress: task?.progress ?? 0 };
}

/** Background pipeline: upload -> split -> poll; writes outcome to the cache. */
async function runSeparation(trackUrl: string, filename: string): Promise<void> {
  try {
    const audioRes = await fetch(trackUrl);
    if (!audioRes.ok) throw new Error(`Fetch track HTTP ${audioRes.status}`);
    const bytes = Buffer.from(await audioRes.arrayBuffer());

    const fileId = await upload(bytes, filename);
    await startSplit(fileId);

    const maxAttempts = 40; // ~40 * 3s = 2 min ceiling
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await check(fileId);
      setCache(trackUrl, { status: "separating", progress: status.progress });
      if (status.done) {
        const stems: SeparatedStem[] = [];
        if (status.stemTrack) {
          stems.push({
            name: "Vocals",
            url: `/api/sonar/stem?src=${encodeURIComponent(status.stemTrack)}`,
          });
        }
        if (status.backTrack) {
          stems.push({
            name: "Accompaniment",
            url: `/api/sonar/stem?src=${encodeURIComponent(status.backTrack)}`,
          });
        }
        setCache(trackUrl, { status: "ready", stems });
        logger.info({ stems: stems.map((s) => s.name) }, "LALAL.AI separation ready");
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("LALAL.AI separation timed out");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setCache(trackUrl, { status: "error", error: message });
    logger.error({ err }, "LALAL.AI separation failed");
  }
}

/**
 * Return the current separation state for a track, kicking off the background
 * pipeline on first request. Validates the URL is one of our own origins.
 */
export function getOrStartSeparation(
  trackUrl: string,
  filename: string,
): SeparationState {
  assertAllowedFetchUrl(trackUrl);
  const existing = cache.get(trackUrl);
  if (existing) return existing;
  setCache(trackUrl, { status: "separating", progress: 0 });
  void runSeparation(trackUrl, filename);
  return { status: "separating", progress: 0 };
}

/** Validate a LALAL.AI stem URL we previously handed out before proxying it. */
export function isLalalaiStemUrl(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return host === "lalal.ai" || host.endsWith(".lalal.ai");
  } catch {
    return false;
  }
}
