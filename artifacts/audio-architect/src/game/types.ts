/** Shared game-domain types. */

/** Genre/mood the room is currently themed for. Driven by the Cyanite adapter. */
export type Genre = "hiphop" | "classical";

/**
 * The track that builds the room. Either the bundled sample or a track the
 * player loads themselves. Only same-origin tracks the backend can fetch are
 * `analyzable` (real Cyanite analysis + LALAL.AI separation); loaded local
 * files still drive playback, live lyrics (by title) and the audio-reactive
 * room, but degrade gracefully on the audio-fingerprint integrations.
 */
export interface Track {
  /** Audio source: the bundled sample path or a local object URL. */
  url: string;
  /** Display title — used for lyrics lookup, fallback password, and game-over. */
  title: string;
  /** True only when the backend can fetch the URL for real audio analysis. */
  analyzable: boolean;
}

/** How a play session ended. Mirrors the OpenAPI GameOverInput.status enum. */
export type GameResult = "escaped" | "failed" | "abandoned";

/** High-level game phase. */
export type GamePhase = "intro" | "playing" | "over";

/**
 * A single time-coded lyric line. This shape intentionally mirrors a
 * normalized slice of Musixmatch's `track.richsync.get` response so the real
 * payload can be mapped onto it 1:1 (see integrations/musixmatch.ts).
 */
export interface RichSyncLine {
  /** Line start time, in seconds. */
  ts: number;
  /** Line end time, in seconds. */
  te: number;
  /** The line of lyric text. */
  text: string;
}

/**
 * Universal NLP category a lyric line maps to. Each category spawns a distinct
 * 3D puzzle object. `default` is the fallback (song-title) clue used when no
 * sharp keyword matches but a peak energy is detected.
 */
export type ClueCategory = "time" | "emotion" | "space" | "default";

/** The 3D object spawned for a given clue category. */
export type ClueObjectType = "keypad" | "mirror" | "speaker" | "core";

/**
 * Whether the current track is driven by synced lyrics or treated as a pure
 * instrumental (Frequency Hack Mode).
 */
export type PlayMode = "lyric" | "instrumental";

/**
 * Dev simulation selector. `auto` classifies the live (mock) lyric stream;
 * the others force a specific demo path so every object/mode is viewable.
 */
export type SimMode = "auto" | "time" | "emotion" | "space" | "instrumental";

/** Which surface a hidden clue/crack is attached to. */
export type Surface = "front" | "back" | "left" | "right" | "floor" | "ceiling";

/**
 * Where a hidden object lives: a surface plus a normalized (u, v) offset across
 * that surface in the range [-1, 1]. Resolved to a world transform by
 * three/placement.ts.
 */
export interface CluePlacement {
  surface: Surface;
  u: number;
  v: number;
}

/** A classified lyric clue: the object to spawn, its answer, and the riddle line. */
export interface Clue {
  category: ClueCategory;
  objectType: ClueObjectType;
  /** The password the player must enter to unlock the exit. */
  password: string;
  /** The lyric line (or song title) shown as the riddle clue. */
  lyric: string;
  /** Hidden location on a random surface. */
  placement: CluePlacement;
}

/** A hidden "soundwave fragment" the player hunts for in instrumental mode. */
export interface GlitchCrack {
  id: string;
  placement: CluePlacement;
  cleared: boolean;
}
