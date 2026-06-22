import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAudio } from "../audio/AudioProvider";
import { useGame } from "../state/GameProvider";
import { stemEnergy, STEM_BANDS } from "../integrations/lalalai";
import { ROOM_EXTENT, ROOM_HEIGHT } from "./dimensions";

/**
 * Floating "sound dust" particle field.
 *
 * Particles drift upward (faster on the beat) and are colored by the active
 * Cyanite theme accent — so toggling hiphop <-> classical drastically swaps the
 * particle color (electric purple <-> warm gold). They fade in with the room
 * build and brighten/grow with live bass energy.
 */

const COUNT = 500;

export function Particles() {
  const { getFrequencyData } = useAudio();
  const { theme, buildRef } = useGame();

  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  // Random initial positions + per-particle rise speed (stable across renders).
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * ROOM_EXTENT;
      positions[i * 3 + 1] = Math.random() * ROOM_HEIGHT;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * ROOM_EXTENT;
      speeds[i] = 0.3 + Math.random() * 1.2;
    }
    return { positions, speeds };
  }, []);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;

    const freq = getFrequencyData();
    const bass = freq ? stemEnergy(freq, STEM_BANDS[0]) : 0;

    const arr = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      // Rise upward, accelerating with the beat; wrap back to the floor.
      arr[i * 3 + 1] += speeds[i] * delta * (0.6 + bass * 6);
      if (arr[i * 3 + 1] > ROOM_HEIGHT) arr[i * 3 + 1] = 0;
    }
    pts.geometry.attributes.position.needsUpdate = true;

    if (matRef.current) {
      // Genre-driven color: re-applied every frame so dev-panel swaps are instant.
      matRef.current.color.set(theme.accentA);
      matRef.current.size = 0.08 + bass * 0.35;
      matRef.current.opacity = buildRef.current * (0.35 + bass * 0.8);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color={theme.accentA}
        size={0.12}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
