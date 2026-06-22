/**
 * Global game configuration & constants.
 *
 * Everything that an integrator might want to tweak when wiring up the real
 * partner APIs lives here or in `src/game/integrations/*`.
 */

/** Resolve a path inside /public, respecting the artifact's base path. */
export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

/** The sample music track that drives the whole experience. */
export const SAMPLE_TRACK_URL = asset("audio/sample-track.mp3");

/** Display name for the sample track (sent to n8n on game over). */
export const SAMPLE_TRACK_NAME = "I Hear Voices - Underbelly";

/** Idle time, in milliseconds, before the AI System Voice mocks the player. */
export const IDLE_TAUNT_MS = 15_000;

/** FFT size for the Web Audio AnalyserNode (power of two). */
export const FFT_SIZE = 128;

/**
 * Audio peak detection (drives instrumental crack spawns + the lyric default
 * fallback). A peak is a rising edge where the average spectrum energy (0–1)
 * crosses `PEAK_ENERGY_THRESHOLD`, rate-limited by `PEAK_COOLDOWN_MS`.
 */
export const PEAK_ENERGY_THRESHOLD = 0.42;
export const PEAK_COOLDOWN_MS = 1400;

/**
 * During room assembly we use a gentler peak gate so even quiet intros build
 * from the real (low-energy) audio rather than relying on the time-safety net.
 * Once the room is fully built, the stricter gameplay gate above takes over.
 */
export const BUILD_PEAK_THRESHOLD = 0.2;
export const BUILD_PEAK_COOLDOWN_MS = 550;

/** Number of hidden glitch cracks to find in instrumental (Frequency Hack) mode. */
export const CRACK_COUNT = 3;

/**
 * Time-safety net for crack spawns: once the room is built, if no qualifying
 * audio peak has spawned a crack within this window, force the next one in. Keeps
 * the "peaks spawn cracks" feel while guaranteeing all cracks appear promptly on
 * quiet tracks (otherwise the last crack can land near the very end of the song).
 */
export const CRACK_SPAWN_MAX_WAIT_MS = 1200;

/**
 * In lyric mode, only fall back to the song-title ("default") clue on a peak
 * once this many seconds have elapsed with no keyword clue armed.
 */
export const DEFAULT_FALLBACK_AFTER_S = 9;

/**
 * Sonar reveal radius (world units). A hidden object ramps from ~10% to 100%
 * opacity as the sonar cursor closes within this distance of it.
 */
export const SONAR_REVEAL_RADIUS = 7;

/**
 * Beat-synced room assembly. The room is not extruded on a fixed timer — each
 * surface snaps in on an early audio peak ("the sound builds the room"). The
 * stages are advanced in order; the floor is always present.
 */
export const BUILD_STAGE_BACK = 1;
export const BUILD_STAGE_LEFT = 2;
export const BUILD_STAGE_RIGHT = 3;
export const BUILD_STAGE_FRONT = 4; // the sonar wall
export const BUILD_STAGE_CEILING = 5;
/** Total number of surfaces that snap in during assembly. */
export const BUILD_STAGES = 5;
/**
 * Time-safety net: if no audio peak arrives, force the next assembly stage after
 * this long so quiet intros still finish building the room.
 */
export const BUILD_STAGE_MAX_WAIT_MS = 1100;
