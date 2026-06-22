import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type {
  Genre,
  GamePhase,
  GameResult,
  PlayMode,
  SimMode,
  ClueCategory,
  Clue,
  GlitchCrack,
  RichSyncLine,
  Track,
} from "../types";
import {
  getThemeForGenre,
  fetchGenreAnalysis,
  mapCyaniteToGenre,
  type CyaniteAnalysis,
} from "../integrations/cyanite";
import {
  classifyLyric,
  objectForCategory,
  getDemoMatchForCategory,
  titleToPassword,
  isInstrumentalTrack,
  getRichSync,
  MOCK_RICHSYNC,
} from "../integrations/musixmatch";
import {
  fetchSonarStatus,
  fetchSeparation,
  type SonarStatus,
  type SonarSeparation,
} from "../integrations/lalalai";
import { randomTaunt, speak } from "../integrations/elevenlabs";
import { randomPlacement, distinctPlacements } from "../three/placement";
import {
  computeRoomDims,
  applyRoomDims,
  resetRoomDims,
  DEFAULT_ROOM_DIMS,
  type RoomDims,
} from "../three/dimensions";
import {
  IDLE_TAUNT_MS,
  CRACK_COUNT,
  CRACK_SPAWN_MAX_WAIT_MS,
  SAMPLE_TRACK_NAME,
  SAMPLE_TRACK_URL,
  DEFAULT_FALLBACK_AFTER_S,
  BUILD_STAGES,
  BUILD_STAGE_MAX_WAIT_MS,
} from "../config";
import { useAudio } from "../audio/AudioProvider";

/**
 * Central game state.
 *
 * The puzzle is fully song-agnostic. Every lyric line is screened into one of
 * four universal NLP categories (time / emotion / space / default); the matched
 * token becomes the dynamic password and the category decides which 3D object
 * spawns — hidden on a random surface. Instrumental tracks fall back to
 * "Frequency Hack Mode": peak-energy spikes spawn hidden glitch cracks the
 * player must find and clear. A LALAL.AI "sonar" scan reveals hidden objects.
 */

export interface SonarCursor {
  x: number;
  y: number;
  z: number;
}

interface GameContextValue {
  // Theme / Cyanite
  genre: Genre;
  theme: ReturnType<typeof getThemeForGenre>;
  handleCyaniteTheme: (genre: Genre) => void;
  /** Real Cyanite analysis once it resolves (null while analyzing / on failure). */
  analysis: CyaniteAnalysis | null;

  // The track that builds the room (bundled sample or a player-loaded file)
  track: Track;
  selectTrack: (track: Track) => void;

  // Resolved lyric stream (real Musixmatch synced lyrics, or mock fallback)
  lyrics: RichSyncLine[];

  // LALAL.AI live account status + stem separation
  sonarStatus: SonarStatus | null;
  separation: SonarSeparation | null;

  // Phase / lifecycle
  phase: GamePhase;
  result: GameResult | null;
  startGame: () => void;
  resetGame: () => void;
  elapsedSeconds: number;

  /** Room "extrude" build progress (0 = invisible, 1 = fully built). */
  buildRef: MutableRefObject<number>;
  /**
   * Beat-synced assembly stage (0..BUILD_STAGES). Each early audio peak snaps in
   * the next surface, so the room is literally built by the sound.
   */
  buildStageRef: MutableRefObject<number>;
  /** Song-derived room dimensions (height scale, grid density, beat pulse). */
  roomDims: RoomDims;

  // Play mode + dev simulation
  mode: PlayMode;
  simulation: SimMode;
  setSimulation: (sim: SimMode) => void;

  // LALAL.AI sonar scan
  sonarActive: boolean;
  toggleSonar: () => void;
  /** World position the sonar cursor is hovering (null when not scanning). */
  sonarCursorRef: MutableRefObject<SonarCursor | null>;

  // The active lyric clue (one per game)
  clue: Clue | null;
  /** Whether the clue has been fully revealed by the sonar scan (gates click). */
  clueRevealed: boolean;
  setClueRevealed: (revealed: boolean) => void;
  clueFound: boolean;

  // Holographic password terminal
  puzzleOpen: boolean;
  openPuzzle: () => void;
  closePuzzle: () => void;
  submitPassword: (guess: string) => boolean;

  // Instrumental "Frequency Hack" cracks
  cracks: GlitchCrack[];
  cracksTotal: number;
  cracksCleared: number;
  clearCrack: (id: string) => void;

  // Audio peak signal (drives crack spawns + the default fallback clue)
  reportPeak: () => void;

  // Active lyric (reported by the hologram layer)
  activeLyric: string | null;
  reportLyric: (text: string | null) => void;

  // AI System Voice (ElevenLabs mock) + glitch
  aiMessage: string | null;
  /** Transient HUD notice (e.g. lyrics fell back to the sample stream). */
  lyricsNotice: string | null;
  glitchKey: number;
  registerWrongClick: () => void;
  noteInteraction: () => void;
}

const Ctx = createContext<GameContextValue | null>(null);

/** Map the Cyanite energy level onto a 0..1 scalar for room sizing. */
function energyToScalar(level: string | null): number {
  switch ((level ?? "").toLowerCase()) {
    case "low":
      return 0.25;
    case "medium":
    case "moderate":
      return 0.55;
    case "high":
    case "very high":
      return 0.9;
    default:
      return 0.55;
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const audio = useAudio();

  const [genre, setGenre] = useState<Genre>("hiphop");
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [result, setResult] = useState<GameResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [mode, setModeState] = useState<PlayMode>("lyric");
  const [simulation, setSimState] = useState<SimMode>("auto");
  const [sonarActive, setSonarActive] = useState(false);

  const [clue, setClueState] = useState<Clue | null>(null);
  const [clueRevealed, setClueRevealedState] = useState(false);
  const [clueFound, setClueFound] = useState(false);
  const [puzzleOpen, setPuzzleOpen] = useState(false);

  const [cracks, setCracks] = useState<GlitchCrack[]>([]);
  const [activeLyric, setActiveLyric] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [lyricsNotice, setLyricsNotice] = useState<string | null>(null);
  const [glitchKey, setGlitchKey] = useState(0);

  const [analysis, setAnalysis] = useState<CyaniteAnalysis | null>(null);
  const [track, setTrack] = useState<Track>(() => ({
    url: SAMPLE_TRACK_URL,
    title: SAMPLE_TRACK_NAME,
    analyzable: true,
  }));
  const [roomDims, setRoomDims] = useState<RoomDims>(DEFAULT_ROOM_DIMS);
  const [lyrics, setLyrics] = useState<RichSyncLine[]>(MOCK_RICHSYNC);
  const [sonarStatus, setSonarStatus] = useState<SonarStatus | null>(null);
  const [separation, setSeparation] = useState<SonarSeparation | null>(null);

  const theme = useMemo(() => getThemeForGenre(genre), [genre]);

  // Refs mirroring state so frame-loop callbacks (reportPeak/reportLyric) read
  // the latest values without being re-created every render.
  const phaseRef = useRef<GamePhase>("intro");
  const modeRef = useRef<PlayMode>("lyric");
  const simRef = useRef<SimMode>("auto");
  const clueRef = useRef<Clue | null>(null);
  const crackSlotsRef = useRef(distinctPlacements(CRACK_COUNT));
  const sonarCursorRef = useRef<SonarCursor | null>(null);
  // Resolved lyric stream for the frame loop + instrumental auto-detect.
  const lyricsRef = useRef<RichSyncLine[]>(MOCK_RICHSYNC);
  // Set once the player/dev manually picks a mood, so live Cyanite analysis
  // doesn't clobber a deliberate override.
  const genreManualRef = useRef(false);
  // Ensures real stem separation is kicked off at most once per session.
  const sonarKickedRef = useRef(false);
  // Mirrors `track` so frame-loop callbacks read the latest title without a dep.
  const trackRef = useRef<Track>(track);

  const startedAtRef = useRef<number | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());
  const lastPeakRef = useRef<number>(0);
  const aiTimeoutRef = useRef<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const buildRef = useRef<number>(0);
  // Beat-synced assembly: current stage + the wall-clock of the last advance
  // (so the time-safety net can force the next stage on near-silent intros).
  const buildStageRef = useRef<number>(0);
  const lastBuildAdvanceRef = useRef<number>(0);
  // Wall-clock of the last instrumental crack spawn (so the time-safety net can
  // force the next crack in on quiet stretches instead of waiting for a peak).
  const lastCrackSpawnRef = useRef<number>(0);
  // Mirrors `analysis` so startGame can read the latest result without a dep.
  const analysisRef = useRef<CyaniteAnalysis | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const setMode = useCallback((m: PlayMode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  const setClue = useCallback((c: Clue | null) => {
    clueRef.current = c;
    setClueState(c);
  }, []);

  // --- Cyanite: shift the room's mood/genre -------------------------------
  // Manual (dev panel) override — flagged so live analysis won't clobber it.
  const handleCyaniteTheme = useCallback((next: Genre) => {
    genreManualRef.current = true;
    setGenre(next);
  }, []);

  // Absolute URL the backend can fetch to analyze / separate the track — only
  // for `analyzable` tracks (the same-origin sample). Player-loaded local files
  // are blob: URLs the backend can't reach, so this is null and those
  // integrations degrade gracefully to analyser-only / default behavior.
  const backendTrackUrl = useMemo(() => {
    if (!track.analyzable) return null;
    if (typeof window === "undefined") return track.url;
    return track.url.startsWith("http")
      ? track.url
      : window.location.origin + track.url;
  }, [track]);

  // Swap to a different track (the bundled sample or a player-loaded file).
  // Revokes the previous object URL, re-arms the per-track integration kicks,
  // and points the audio engine at the new source.
  const selectTrack = useCallback(
    (next: Track) => {
      setTrack((prev) => {
        if (prev.url.startsWith("blob:") && prev.url !== next.url) {
          URL.revokeObjectURL(prev.url);
        }
        return next;
      });
      trackRef.current = next;
      sonarKickedRef.current = false;
      setSeparation(null);
      audio.setSource(next.url);
    },
    [audio],
  );

  // --- Cyanite: real audio analysis -> auto re-skin (per track) -----------
  useEffect(() => {
    let cancelled = false;
    // Reset prior analysis so a track switch never applies stale dimensions.
    analysisRef.current = null;
    setAnalysis(null);
    if (!genreManualRef.current) setGenre("hiphop");
    // Unanalyzable (player-loaded) tracks keep the default theme/dimensions and
    // still build from their own audio peaks.
    if (!backendTrackUrl) return;
    void fetchGenreAnalysis(backendTrackUrl, track.title).then((res) => {
      if (cancelled || !res) return;
      analysisRef.current = res;
      setAnalysis(res);
      if (!genreManualRef.current) {
        setGenre(mapCyaniteToGenre(res.genreTags, res.moodTags));
      }
      // If the player entered before analysis resolved, re-size the room now so
      // the dimensions still reflect the real song (they ease in smoothly).
      if (phaseRef.current === "playing") {
        const dims = computeRoomDims(
          energyToScalar(res.energyLevel ?? null),
          res.bpm ?? null,
        );
        applyRoomDims(dims);
        setRoomDims(dims);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backendTrackUrl, track.title]);

  // --- Musixmatch: resolve the real lyric stream (mock fallback) ----------
  useEffect(() => {
    let cancelled = false;
    void getRichSync(track.title).then(({ lines, source }) => {
      if (cancelled) return;
      lyricsRef.current = lines;
      setLyrics(lines);
      // Tell the player when we fell back to the sample stream for a track they
      // chose themselves (the bundled sample legitimately uses the mock stream).
      if (source === "mock" && track.title !== SAMPLE_TRACK_NAME) {
        showNotice("No synced lyrics found for this track — using a sample signal.");
      }
      // Lyrics resolve async — if they reveal a truly instrumental track while
      // we're still in auto/lyric mode with no clue armed, switch to Frequency
      // Hack mode so the auto path stays correct regardless of resolve timing.
      if (
        simRef.current === "auto" &&
        modeRef.current === "lyric" &&
        !clueRef.current &&
        isInstrumentalTrack(lines)
      ) {
        crackSlotsRef.current = distinctPlacements(CRACK_COUNT);
        setClue(null);
        setMode("instrumental");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [track.title, setMode, setClue]);

  // --- LALAL.AI: real account status (cheap, no credits) -----------------
  useEffect(() => {
    let cancelled = false;
    void fetchSonarStatus().then((s) => {
      if (!cancelled && s) setSonarStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Show a transient HUD notice that auto-dismisses after a few seconds.
  const showNotice = useCallback((text: string) => {
    setLyricsNotice(text);
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(
      () => setLyricsNotice(null),
      6000,
    );
  }, []);

  // --- The AI System Voice taunt (ElevenLabs via backend) -----------------
  const triggerTaunt = useCallback(() => {
    // Match the taunt to the puzzle the player is stuck on (if a clue is armed).
    const line = randomTaunt(clueRef.current?.category ?? null);
    setAiMessage(line);
    void speak(line);
    setGlitchKey((k) => k + 1);
    if (aiTimeoutRef.current) window.clearTimeout(aiTimeoutRef.current);
    aiTimeoutRef.current = window.setTimeout(() => setAiMessage(null), 4500);
  }, []);

  const noteInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  const registerWrongClick = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    noteInteraction();
    triggerTaunt();
  }, [noteInteraction, triggerTaunt]);

  // --- Clue arming --------------------------------------------------------
  const armClue = useCallback(
    (category: ClueCategory, password: string, lyric: string) => {
      setClue({
        category,
        objectType: objectForCategory(category),
        password: password.toLowerCase(),
        lyric,
        placement: randomPlacement(),
      });
    },
    [setClue],
  );

  // Configure mode + initial clue/cracks for a given dev simulation.
  const configureForSimulation = useCallback(
    (sim: SimMode) => {
      if (sim === "instrumental") {
        setMode("instrumental");
        crackSlotsRef.current = distinctPlacements(CRACK_COUNT);
        setClue(null);
        return;
      }
      if (sim === "auto") {
        // Auto-detect instrumental tracks (no lyrics) -> Frequency Hack mode.
        if (isInstrumentalTrack(lyricsRef.current)) {
          setMode("instrumental");
          crackSlotsRef.current = distinctPlacements(CRACK_COUNT);
          setClue(null);
          return;
        }
        setMode("lyric");
        setClue(null); // armed live from the lyric stream
        return;
      }
      setMode("lyric");
      // Forced category: arm a demo clue immediately so it's viewable on demand.
      const demo = getDemoMatchForCategory(sim);
      if (demo) armClue(demo.match.category, demo.match.password, demo.lyric);
      else setClue(null);
    },
    [setMode, setClue, armClue],
  );

  // --- Lyric reporting + live clue trigger --------------------------------
  const reportLyric = useCallback(
    (text: string | null) => {
      setActiveLyric(text);
      if (modeRef.current !== "lyric" || simRef.current !== "auto") return;
      if (!text || clueRef.current) return;
      const m = classifyLyric(text);
      if (m) armClue(m.category, m.password, text);
    },
    [armClue],
  );

  // --- Win the game -------------------------------------------------------
  const escape = useCallback(() => {
    setClueFound(true);
    setPuzzleOpen(false);
    setResult("escaped");
    setPhase("over");
    audio.pause();
  }, [audio]);

  // `escape` is recreated whenever the audio context value changes (which is
  // every ~200ms while playing, because currentTime is throttled into state).
  // Effects that auto-trigger escape must read it through this stable ref so
  // their timers aren't torn down and reset on every throttled time update.
  const escapeRef = useRef(escape);
  escapeRef.current = escape;

  // --- Beat-synced assembly: snap in the next surface on a peak ------------
  const advanceBuild = useCallback((): boolean => {
    if (buildStageRef.current >= BUILD_STAGES) return false;
    buildStageRef.current += 1;
    lastBuildAdvanceRef.current = performance.now();
    return true;
  }, []);

  // Spawn the next hidden glitch crack (instrumental mode), capped at CRACK_COUNT.
  const spawnNextCrack = useCallback(() => {
    setCracks((prev) => {
      if (prev.length >= CRACK_COUNT) return prev;
      const placement =
        crackSlotsRef.current[prev.length] ?? randomPlacement();
      lastCrackSpawnRef.current = performance.now();
      return [...prev, { id: `crack-${prev.length}`, placement, cleared: false }];
    });
  }, []);

  // --- Audio peak: build the room, then spawn cracks / fall back ----------
  const reportPeak = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    // The first peaks construct the room itself; gameplay peaks come after.
    if (buildStageRef.current < BUILD_STAGES) {
      advanceBuild();
      return;
    }
    if (modeRef.current === "instrumental") {
      spawnNextCrack();
      return;
    }
    // Lyric mode: fall back to the song title if nothing matched in time.
    if (clueRef.current) return;
    const elapsed = startedAtRef.current
      ? (Date.now() - startedAtRef.current) / 1000
      : 0;
    if (elapsed < DEFAULT_FALLBACK_AFTER_S) return;
    // Derive the fallback password from the current track title at arm time.
    armClue(
      "default",
      titleToPassword(trackRef.current.title),
      "Untitled signal — decode the song title",
    );
  }, [armClue, advanceBuild]);

  // Time-safety net for assembly: if the track is quiet and no peak arrives,
  // force the next surface in so the room always finishes building.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      if (buildStageRef.current >= BUILD_STAGES) return;
      if (performance.now() - lastBuildAdvanceRef.current > BUILD_STAGE_MAX_WAIT_MS) {
        advanceBuild();
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [phase, advanceBuild]);

  // Time-safety net for crack spawns: once the room is built, guarantee all
  // instrumental cracks appear promptly even on quiet tracks (otherwise the last
  // crack can land near the very end of the song). spawnNextCrack caps at
  // CRACK_COUNT, so this no-ops once they're all out.
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      if (modeRef.current !== "instrumental") return;
      if (buildStageRef.current < BUILD_STAGES) return;
      if (performance.now() - lastCrackSpawnRef.current > CRACK_SPAWN_MAX_WAIT_MS) {
        spawnNextCrack();
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [phase, spawnNextCrack]);

  // --- Sonar scan ---------------------------------------------------------
  const toggleSonar = useCallback(() => {
    setSonarActive((prev) => {
      const next = !prev;
      if (!next) {
        sonarCursorRef.current = null;
        setClueRevealedState(false);
      } else if (!sonarKickedRef.current) {
        // First activation: kick off real LALAL.AI stem separation (once).
        // Only analyzable (backend-reachable) tracks can be separated; loaded
        // local files fall back to analyser-only sonar.
        sonarKickedRef.current = true;
        if (backendTrackUrl) {
          setSeparation({ status: "separating", stems: [] });
          void fetchSeparation(backendTrackUrl).then((sep) => {
            setSeparation(sep ?? { status: "error", stems: [] });
          });
        } else {
          setSeparation({ status: "error", stems: [] });
        }
      }
      return next;
    });
    noteInteraction();
  }, [noteInteraction, backendTrackUrl]);

  // Keyboard shortcut: S / Space toggles the sonar while playing. Ignored when
  // the password terminal is open or focus is in a text field so typing the
  // password never flips the sonar.
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (puzzleOpen) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.code === "KeyS" || e.code === "Space") {
        e.preventDefault();
        toggleSonar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, puzzleOpen, toggleSonar]);

  const setClueRevealed = useCallback((revealed: boolean) => {
    setClueRevealedState(revealed);
  }, []);

  // --- Holographic password terminal --------------------------------------
  const openPuzzle = useCallback(() => {
    if (phaseRef.current !== "playing" || clueFound) return;
    noteInteraction();
    setPuzzleOpen(true);
  }, [clueFound, noteInteraction]);

  const closePuzzle = useCallback(() => setPuzzleOpen(false), []);

  const submitPassword = useCallback(
    (guess: string): boolean => {
      if (phaseRef.current !== "playing" || clueFound) return false;
      noteInteraction();
      const expectedPassword = clueRef.current?.password ?? "";
      // Normalize BOTH sides: lowercase + strip everything but [a-z0-9] so
      // "Untitled Signal", "untitled signal", and "untitledsignal" all match.
      const normalize = (s: string) =>
        s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const isCorrect =
        normalize(guess) === normalize(expectedPassword) &&
        normalize(expectedPassword).length > 0;
      if (isCorrect && clueRef.current) {
        escape();
        return true;
      }
      triggerTaunt();
      return false;
    },
    [clueFound, noteInteraction, escape, triggerTaunt],
  );

  // --- Instrumental crack clearing ----------------------------------------
  const clearCrack = useCallback(
    (id: string) => {
      noteInteraction();
      setCracks((prev) =>
        prev.map((c) => (c.id === id ? { ...c, cleared: true } : c)),
      );
    },
    [noteInteraction],
  );

  // When all cracks are cleared, the static lifts and the exit unlocks.
  // Depend only on the primitive win flag (and go through escapeRef): if this
  // effect depended on `cracks`/`escape`, the throttled currentTime updates
  // would re-run it every ~200ms and keep clearing the 900ms timer, so escape
  // would never fire until the track ended and the updates stopped.
  const allCracksCleared =
    mode === "instrumental" &&
    cracks.length >= CRACK_COUNT &&
    cracks.every((c) => c.cleared);
  useEffect(() => {
    if (phase !== "playing" || !allCracksCleared) return;
    const id = window.setTimeout(() => escapeRef.current(), 900);
    return () => window.clearTimeout(id);
  }, [phase, allCracksCleared]);

  // --- Lifecycle ----------------------------------------------------------
  const resetTransient = useCallback(() => {
    setClue(null);
    setClueRevealedState(false);
    setClueFound(false);
    setPuzzleOpen(false);
    setCracks([]);
    setSonarActive(false);
    sonarCursorRef.current = null;
    lastPeakRef.current = 0;
    lastCrackSpawnRef.current = 0;
  }, [setClue]);

  const startGame = useCallback(() => {
    setPhase("playing");
    setResult(null);
    setElapsedSeconds(0);
    setAiMessage(null);
    resetTransient();
    // Reset assembly + derive the room's dimensions from the real analysis so
    // the sound literally builds (and sizes) the room when the player enters.
    buildStageRef.current = 0;
    buildRef.current = 0;
    lastBuildAdvanceRef.current = performance.now();
    const a = analysisRef.current;
    const dims = computeRoomDims(energyToScalar(a?.energyLevel ?? null), a?.bpm ?? null);
    applyRoomDims(dims);
    setRoomDims(dims);
    configureForSimulation(simRef.current);
    startedAtRef.current = Date.now();
    lastInteractionRef.current = Date.now();
    void audio.play();
  }, [audio, resetTransient, configureForSimulation]);

  const resetGame = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    audio.pause();
    audio.restart();
    setPhase("intro");
    setResult(null);
    setActiveLyric(null);
    setAiMessage(null);
    setElapsedSeconds(0);
    resetTransient();
    // Tear the room back down so it re-assembles from the sound next run.
    buildStageRef.current = 0;
    buildRef.current = 0;
    resetRoomDims();
    setRoomDims(DEFAULT_ROOM_DIMS);
    // Re-arm stem separation so the next run kicks LALAL.AI fresh instead of
    // leaking the prior run's separated state into a new entry.
    sonarKickedRef.current = false;
    setSeparation(null);
    startedAtRef.current = null;
  }, [audio, resetTransient]);

  const setSimulation = useCallback(
    (sim: SimMode) => {
      simRef.current = sim;
      setSimState(sim);
      resetTransient();
      configureForSimulation(sim);
      noteInteraction();
    },
    [resetTransient, configureForSimulation, noteInteraction],
  );

  // Run timer + idle-taunt watcher (single 1s tick while playing).
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds((Date.now() - startedAtRef.current) / 1000);
      }
      if (Date.now() - lastInteractionRef.current >= IDLE_TAUNT_MS) {
        triggerTaunt();
        lastInteractionRef.current = Date.now();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, triggerTaunt]);

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) window.clearTimeout(aiTimeoutRef.current);
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      // Release any player-loaded object URL still held when the provider tears
      // down so a loaded blob track doesn't leak past unmount.
      if (trackRef.current.url.startsWith("blob:")) {
        URL.revokeObjectURL(trackRef.current.url);
      }
    };
  }, []);

  const cracksCleared = cracks.filter((c) => c.cleared).length;

  const value = useMemo<GameContextValue>(
    () => ({
      genre,
      theme,
      handleCyaniteTheme,
      analysis,
      track,
      selectTrack,
      lyrics,
      sonarStatus,
      separation,
      phase,
      result,
      startGame,
      resetGame,
      elapsedSeconds,
      buildRef,
      buildStageRef,
      roomDims,
      mode,
      simulation,
      setSimulation,
      sonarActive,
      toggleSonar,
      sonarCursorRef,
      clue,
      clueRevealed,
      setClueRevealed,
      clueFound,
      puzzleOpen,
      openPuzzle,
      closePuzzle,
      submitPassword,
      cracks,
      cracksTotal: CRACK_COUNT,
      cracksCleared,
      clearCrack,
      reportPeak,
      activeLyric,
      reportLyric,
      aiMessage,
      lyricsNotice,
      glitchKey,
      registerWrongClick,
      noteInteraction,
    }),
    [
      genre,
      theme,
      handleCyaniteTheme,
      analysis,
      track,
      selectTrack,
      lyrics,
      sonarStatus,
      separation,
      phase,
      result,
      startGame,
      resetGame,
      elapsedSeconds,
      roomDims,
      mode,
      simulation,
      setSimulation,
      sonarActive,
      toggleSonar,
      clue,
      clueRevealed,
      setClueRevealed,
      clueFound,
      puzzleOpen,
      openPuzzle,
      closePuzzle,
      submitPassword,
      cracks,
      cracksCleared,
      clearCrack,
      reportPeak,
      activeLyric,
      reportLyric,
      aiMessage,
      lyricsNotice,
      glitchKey,
      registerWrongClick,
      noteInteraction,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGame must be used within a GameProvider");
  return ctx;
}
