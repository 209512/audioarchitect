/** Shared room dimensions (half-extent + base height), in world units. */
export const ROOM_EXTENT = 16;
export const ROOM_HEIGHT = 9;

/**
 * Song-derived room dimensions. The horizontal extent stays fixed (so the sonar
 * scan + hidden-clue world coordinates always line up), but the vertical scale,
 * floor-grid density, and beat-pulse rate are all derived from the track's real
 * Cyanite analysis — so the room's proportions are literally built from the
 * sound.
 */
export interface RoomDims {
  /** Vertical scale multiplier applied to walls/ceiling/sonar (0.85 .. 1.20). */
  heightScale: number;
  /** Floor-grid density multiplier (faster songs pack a denser grid). */
  gridDensity: number;
  /** Beat-pulse rate in Hz (bpm / 60); 0 disables the pulse. */
  pulseHz: number;
}

export const DEFAULT_ROOM_DIMS: RoomDims = {
  heightScale: 1,
  gridDensity: 1,
  pulseHz: 0,
};

// Mutated once at game start; read by placement (per call) and the 3D actors
// (per frame), so song dimensions take effect without a React re-render.
let runtime: RoomDims = { ...DEFAULT_ROOM_DIMS };

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Current scaled room height (base height * song height scale). */
export const getRoomHeight = (): number => ROOM_HEIGHT * runtime.heightScale;
/** Current song-derived vertical scale. */
export const getRoomHeightScale = (): number => runtime.heightScale;
/** Current song-derived floor-grid density. */
export const getGridDensity = (): number => runtime.gridDensity;
/** Current beat-pulse rate (Hz). */
export const getPulseHz = (): number => runtime.pulseHz;

/**
 * Map a track's energy (0..1) + BPM onto concrete room dimensions. Sensible
 * defaults are used when the real analysis is unavailable.
 */
export function computeRoomDims(energy01: number, bpm: number | null): RoomDims {
  const e = clamp(energy01, 0, 1);
  const b = bpm && bpm > 0 ? bpm : 110;
  return {
    heightScale: 0.85 + e * 0.35, // energetic tracks build a taller room
    gridDensity: clamp(0.8 + (b - 70) / 110, 0.8, 1.7), // faster -> denser grid
    pulseHz: b / 60,
  };
}

/** Commit the active song dimensions (read by frame loops + placement). */
export function applyRoomDims(d: RoomDims): void {
  runtime = { ...d };
}

/** Restore the neutral default dimensions (on reset). */
export function resetRoomDims(): void {
  runtime = { ...DEFAULT_ROOM_DIMS };
}
