import type { CluePlacement, Surface } from "../types";
import { ROOM_EXTENT, getRoomHeight } from "./dimensions";

/**
 * Resolves a normalized {surface, u, v} clue placement into a concrete world
 * transform. Hidden objects sit flush against (slightly inset from) one of the
 * six room surfaces, facing inward, so they blend with the wireframe
 * architecture until the sonar scan reveals them.
 */

export interface PlacementTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  /** Inward-facing surface normal (unit), toward the room center. */
  normal: [number, number, number];
}

/** How far off the surface (toward the room) the object floats. */
const OFFSET = 0.35;
/** Fraction of each surface span the object can roam within (keeps off corners). */
const SPREAD = 0.7;
const HX = ROOM_EXTENT * SPREAD;

export function placementTransform(p: CluePlacement): PlacementTransform {
  const { surface, u, v } = p;
  // Vertical span is read at call time so clues land on the song-scaled walls.
  const height = getRoomHeight();
  const HY = (height / 2) * SPREAD;
  const MID_Y = height / 2;
  switch (surface) {
    case "back":
      return {
        position: [u * HX, MID_Y + v * HY, -ROOM_EXTENT + OFFSET],
        rotation: [0, 0, 0],
        normal: [0, 0, 1],
      };
    case "front":
      return {
        position: [u * HX, MID_Y + v * HY, ROOM_EXTENT - OFFSET],
        rotation: [0, Math.PI, 0],
        normal: [0, 0, -1],
      };
    case "left":
      return {
        position: [-ROOM_EXTENT + OFFSET, MID_Y + v * HY, u * HX],
        rotation: [0, Math.PI / 2, 0],
        normal: [1, 0, 0],
      };
    case "right":
      return {
        position: [ROOM_EXTENT - OFFSET, MID_Y + v * HY, u * HX],
        rotation: [0, -Math.PI / 2, 0],
        normal: [-1, 0, 0],
      };
    case "floor":
      return {
        position: [u * HX, OFFSET, v * HX],
        rotation: [-Math.PI / 2, 0, 0],
        normal: [0, 1, 0],
      };
    case "ceiling":
      return {
        position: [u * HX, height - OFFSET, v * HX],
        rotation: [Math.PI / 2, 0, 0],
        normal: [0, -1, 0],
      };
  }
}

const ALL_SURFACES: Surface[] = [
  "front",
  "back",
  "left",
  "right",
  "floor",
  "ceiling",
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** A single random placement on any surface (off the corners). */
export function randomPlacement(): CluePlacement {
  const surface = ALL_SURFACES[Math.floor(Math.random() * ALL_SURFACES.length)];
  return { surface, u: rand(-0.65, 0.65), v: rand(-0.65, 0.65) };
}

/** `n` random placements, each on a distinct surface (for the glitch cracks). */
export function distinctPlacements(n: number): CluePlacement[] {
  const pool = [...ALL_SURFACES];
  // Fisher-Yates shuffle so the chosen surfaces are random but distinct.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: Math.min(n, pool.length) }, (_, i) => ({
    surface: pool[i],
    u: rand(-0.6, 0.6),
    v: rand(-0.6, 0.6),
  }));
}
