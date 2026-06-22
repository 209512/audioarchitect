/**
 * ===========================================================================
 * LALAL.AI — Audio Sonar / stem separation adapter  (MOCK)
 * ===========================================================================
 *
 * LALAL.AI separates a track into stems (vocals, drums, bass, etc.). In the
 * game, the "Sonar Scan" mode visualizes this: hovering a wall reveals a
 * real-time, frequency-reactive deformation (red ripples) of that wall's grid.
 *
 * --- INTEGRATION SWAP POINT ---
 * The live reactivity is driven by the Web Audio AnalyserNode (real, not
 * mocked) — that part already works on the actual playing audio. What is
 * mocked is the *stem mapping*: which frequency band corresponds to which
 * separated stem. When LALAL.AI is wired up, replace `STEM_BANDS` with the
 * real stem metadata returned by the API and label the sonar HUD accordingly.
 */

export interface StemBand {
  /** Stem name as it would come back from LALAL.AI. */
  name: string;
  /** Inclusive lower bin index into the AnalyserNode frequency data. */
  fromBin: number;
  /** Exclusive upper bin index into the AnalyserNode frequency data. */
  toBin: number;
  /** Display color for the sonar HUD readout. */
  color: string;
}

/**
 * MOCK stem-to-frequency-band mapping (for a 64-bin AnalyserNode).
 * Low bins ~ bass, mid bins ~ vocals/instruments, high bins ~ cymbals/hats.
 */
export const STEM_BANDS: StemBand[] = [
  { name: "Bass", fromBin: 0, toBin: 8, color: "#ff3b3b" },
  { name: "Drums", fromBin: 8, toBin: 22, color: "#ff7a3b" },
  { name: "Vocals", fromBin: 22, toBin: 42, color: "#ffb13b" },
  { name: "Synths", fromBin: 42, toBin: 64, color: "#ffe03b" },
];

/** Average the energy (0–1) of a stem band from raw AnalyserNode data. */
export function stemEnergy(freqData: Uint8Array, band: StemBand): number {
  let sum = 0;
  let count = 0;
  for (let i = band.fromBin; i < band.toBin && i < freqData.length; i++) {
    sum += freqData[i];
    count++;
  }
  if (count === 0) return 0;
  return sum / count / 255;
}

/**
 * ===========================================================================
 * LIVE LALAL.AI account + stem-separation (via backend proxy)
 * ===========================================================================
 * The key stays server-side; the browser hits same-origin `/api/sonar/*`.
 */

const STATUS_ENDPOINT = "/api/sonar/status";
const SEPARATE_ENDPOINT = "/api/sonar/separate";

/** Real account status from LALAL.AI (booleans/strings only — no key). */
export interface SonarStatus {
  /** Whether stem separation is actually available on this account. */
  available: boolean;
  /** Human-readable plan + remaining-minutes label for the HUD. */
  detail: string;
  /** Plan name (e.g. "Plus") when available. */
  plan?: string;
  /** Remaining stem-separation minutes when available. */
  minutesLeft?: number;
}

/** Real stem-separation result for a track. */
export interface SonarSeparation {
  status: "separating" | "ready" | "error";
  /** Stem names actually returned by LALAL.AI (e.g. ["vocals"]). */
  stems: string[];
}

/** Fetch real LALAL.AI account status. Returns null when unavailable. */
export async function fetchSonarStatus(): Promise<SonarStatus | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(STATUS_ENDPOINT);
    if (!res.ok) return null;
    return (await res.json()) as SonarStatus;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kick off + poll real stem separation for a track. Returns the resolved stems,
 * or null if separation is unavailable / fails / times out (the sonar still
 * works on the live AnalyserNode bands in that case).
 */
/** Raw backend separation state (stems are objects with a `name`). */
type RawSeparation =
  | { status: "separating"; progress?: number }
  | { status: "ready"; stems: { name: string }[] }
  | { status: "error"; error?: string };

export async function fetchSeparation(
  trackUrl: string,
): Promise<SonarSeparation | null> {
  if (typeof window === "undefined") return null;
  const url = `${SEPARATE_ENDPOINT}?trackUrl=${encodeURIComponent(trackUrl)}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as RawSeparation;
      if (data.status === "ready") {
        return { status: "ready", stems: data.stems.map((s) => s.name) };
      }
      if (data.status === "error") return null;
    } catch {
      return null;
    }
    await sleep(3000);
  }
  return null;
}
