import type { Genre } from "./types";
import { asset } from "./config";

/**
 * Visual theme definition for a given genre/mood.
 * The 3D scene reads these values to drive lighting, wall textures, and the
 * holographic grid color.
 */
export interface Theme {
  /** Human-readable label for the dev UI. */
  label: string;
  /** Soft fill light color (hex). */
  ambient: string;
  /** Two accent point-light colors used around the room. */
  accentA: string;
  accentB: string;
  /** Holographic floor/wall grid line color. */
  grid: string;
  /** Wall surface texture (graffiti vs marble). */
  wallTexture: string;
  /** Emissive tint multiplied onto the textured walls. */
  wallEmissive: string;
  /** Page background gradient (CSS), framing the canvas. */
  pageBackground: string;
  /** Accent color for HUD/UI chrome. */
  ui: string;
}

export const THEMES: Record<Genre, Theme> = {
  // hiphop: aggressive purple/green neon + graffiti walls.
  hiphop: {
    label: "Hip-Hop",
    ambient: "#1a0033",
    accentA: "#b026ff", // electric purple
    accentB: "#39ff14", // toxic green
    grid: "#b026ff",
    wallTexture: asset("textures/wall-hiphop.png"),
    wallEmissive: "#5a1e8a",
    pageBackground:
      "radial-gradient(circle at 50% 0%, #2a0a4a 0%, #0a0014 60%, #000 100%)",
    ui: "#39ff14",
  },
  // classical: elegant gold/warm white + marble palace walls.
  classical: {
    label: "Classical",
    ambient: "#3a2f1a",
    accentA: "#ffd86b", // warm gold
    accentB: "#fff4d6", // warm white
    grid: "#e8c97a",
    wallTexture: asset("textures/wall-classical.png"),
    wallEmissive: "#6b5a2e",
    pageBackground:
      "radial-gradient(circle at 50% 0%, #4a3a1a 0%, #1a1306 60%, #0a0700 100%)",
    ui: "#ffd86b",
  },
};
