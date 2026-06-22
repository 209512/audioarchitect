import { Suspense, useRef, useCallback, type ComponentRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../state/GameProvider";
import { useAudio } from "../audio/AudioProvider";
import { Room } from "./Room";
import { SonarWall } from "./SonarWall";
import { LyricHolograms } from "./LyricHolograms";
import { ClueObject } from "./ClueObject";
import { GlitchCracks } from "./GlitchCracks";
import { CenterCore } from "./CenterCore";
import { Particles } from "./Particles";
import {
  PEAK_ENERGY_THRESHOLD,
  PEAK_COOLDOWN_MS,
  BUILD_STAGES,
  BUILD_PEAK_THRESHOLD,
  BUILD_PEAK_COOLDOWN_MS,
} from "../config";
import { getPulseHz, getRoomHeight, ROOM_EXTENT } from "./dimensions";

// How far the orbit target may be panned from the room center, kept well inside
// the walls so the view never drifts outside the room.
const PAN_LIMIT = ROOM_EXTENT * 0.5;

/**
 * Drives the overall room "extrude" build progress every frame. The room is
 * assembled stage-by-stage on audio peaks (see GameProvider), so `buildRef`
 * tracks the share of surfaces that have snapped in (buildStage / BUILD_STAGES)
 * and eases toward it. Used by surfaces that want a single global progress.
 */
function BuildDriver() {
  const { phase, buildRef, buildStageRef } = useGame();
  useFrame((_, delta) => {
    const target = phase === "intro" ? 0 : buildStageRef.current / BUILD_STAGES;
    buildRef.current += (target - buildRef.current) * Math.min(1, delta * 2.2);
  });
  return null;
}

/**
 * Center floor light that pulses to the track's beat (bpm-derived Hz), so the
 * room visibly breathes in time with the sound. Falls back to a steady glow
 * when no tempo is known or the game isn't playing.
 */
function BeatPulseLight({ color }: { color: string }) {
  const { phase } = useGame();
  const ref = useRef<THREE.PointLight>(null);
  const BASE = 50;
  useFrame(() => {
    if (!ref.current) return;
    const hz = getPulseHz();
    if (phase === "playing" && hz > 0) {
      const t = performance.now() / 1000;
      ref.current.intensity = BASE * (1 + 0.55 * Math.sin(2 * Math.PI * hz * t));
    } else {
      ref.current.intensity = BASE;
    }
  });
  return <pointLight ref={ref} position={[0, 8, 0]} intensity={BASE} color={color} />;
}

/**
 * Watches the live AnalyserNode for peak-energy spikes (heavy bass drops / sharp
 * synth hits) and reports them to the game. Peaks spawn hidden glitch cracks in
 * instrumental mode and arm the song-title fallback clue in lyric mode.
 */
function AudioPeakDriver() {
  const { reportPeak, phase, buildStageRef } = useGame();
  const { getFrequencyData } = useAudio();
  const armed = useRef(true);
  const lastPeak = useRef(0);

  useFrame(() => {
    if (phase !== "playing") return;
    const freq = getFrequencyData();
    if (!freq) return;
    let sum = 0;
    for (let i = 0; i < freq.length; i++) sum += freq[i];
    const energy = sum / freq.length / 255;
    const now = performance.now();
    // While the room is still assembling, use a gentler gate so even quiet
    // intros build from the real (low-energy) audio, not just the time-safety
    // net. Once built, the stricter gameplay gate spawns cracks / fallbacks.
    const building = buildStageRef.current < BUILD_STAGES;
    const threshold = building ? BUILD_PEAK_THRESHOLD : PEAK_ENERGY_THRESHOLD;
    const cooldown = building ? BUILD_PEAK_COOLDOWN_MS : PEAK_COOLDOWN_MS;
    if (
      energy > threshold &&
      armed.current &&
      now - lastPeak.current > cooldown
    ) {
      armed.current = false;
      lastPeak.current = now;
      reportPeak();
    } else if (energy < threshold * 0.75) {
      armed.current = true; // re-arm once the level falls back down
    }
  });
  return null;
}

/**
 * Mounts the WebGL canvas, orbital camera, themed lighting, and all 3D actors.
 */
export function Scene() {
  const { theme } = useGame();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  // Keep panning bounded: clamp the orbit target inside the room so a player can
  // shift the view a little (look closer at a surface) without floating outside.
  const clampTarget = useCallback(() => {
    const t = controlsRef.current?.target;
    if (!t) return;
    t.x = THREE.MathUtils.clamp(t.x, -PAN_LIMIT, PAN_LIMIT);
    t.z = THREE.MathUtils.clamp(t.z, -PAN_LIMIT, PAN_LIMIT);
    t.y = THREE.MathUtils.clamp(t.y, 1.5, Math.max(2, getRoomHeight() - 1.5));
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 6, 22], fov: 55 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <fog attach="fog" args={[theme.ambient, 24, 60]} />

      <ambientLight intensity={0.5} color={theme.accentA} />
      <hemisphereLight
        intensity={0.4}
        color={theme.accentA}
        groundColor={theme.ambient}
      />
      <pointLight
        position={[-10, 8, 6]}
        intensity={140}
        color={theme.accentA}
        distance={60}
      />
      <pointLight
        position={[10, 7, -6]}
        intensity={140}
        color={theme.accentB}
        distance={60}
      />
      <BeatPulseLight color={theme.grid} />

      <BuildDriver />
      <AudioPeakDriver />

      <Suspense fallback={null}>
        <Room />
        <SonarWall />
        <Particles />
        <CenterCore />
        <LyricHolograms />
        <ClueObject />
        <GlitchCracks />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enablePan
        screenSpacePanning
        minDistance={2.5}
        maxDistance={30}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 4, 0]}
        onChange={clampTarget}
      />
    </Canvas>
  );
}
