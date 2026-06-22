import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGame } from "../state/GameProvider";
import { placementTransform } from "./placement";
import { SONAR_REVEAL_RADIUS } from "../config";
import type { GlitchCrack } from "../types";

/**
 * Instrumental "Frequency Hack Mode" clues. Each peak energy spike spawns a
 * hidden "neon glitch crack" (a shattered soundwave fragment) flush against a
 * random surface. The player hunts them with the sonar scan; clicking a fully
 * revealed crack clears it (lifting a third of the static noise overlay).
 */

const HIDDEN_OPACITY = 0.08;

/** A jagged shard cluster suggesting a shattered soundwave fragment. */
function ShardCluster({ color }: { color: string }) {
  const shards = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => ({
        x: (Math.random() - 0.5) * 1.6,
        y: (Math.random() - 0.5) * 1.6,
        rot: Math.random() * Math.PI,
        scale: 0.5 + Math.random() * 0.8,
      })),
    [],
  );
  return (
    <group>
      {shards.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 0]} rotation={[0, 0, s.rot]} scale={s.scale}>
          <tetrahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={new THREE.Color(color)}
            emissiveIntensity={2}
            toneMapped={false}
            transparent
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

function Crack({ crack }: { crack: GlitchCrack }) {
  const { sonarActive, sonarCursorRef, clearCrack, registerWrongClick } = useGame();
  const groupRef = useRef<THREE.Group>(null);
  const revealAmt = useRef(0);
  const fade = useRef(1); // 1 -> 0 as the crack is cleared away
  const revealed = useRef(false);

  const transform = useMemo(() => placementTransform(crack.placement), [crack.placement]);

  useFrame((_, delta) => {
    const cur = sonarCursorRef.current;
    let target = 0;
    if (!crack.cleared && sonarActive && cur) {
      const [px, py, pz] = transform.position;
      const dist = Math.hypot(cur.x - px, cur.y - py, cur.z - pz);
      target = THREE.MathUtils.clamp(1 - dist / SONAR_REVEAL_RADIUS, 0, 1);
      target = target * target * (3 - 2 * target);
    }
    revealAmt.current += (target - revealAmt.current) * Math.min(1, delta * 6);

    // Fade out once cleared.
    const fadeTarget = crack.cleared ? 0 : 1;
    fade.current += (fadeTarget - fade.current) * Math.min(1, delta * 4);
    revealed.current = revealAmt.current > 0.85 && !crack.cleared;

    const op = (HIDDEN_OPACITY + revealAmt.current * (1 - HIDDEN_OPACITY)) * fade.current;
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * 0.4;
      groupRef.current.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && "opacity" in mat) (mat as THREE.Material & { opacity: number }).opacity = op;
      });
    }
  });

  return (
    <group position={transform.position} rotation={transform.rotation}>
      <group
        ref={groupRef}
        onClick={(e) => {
          e.stopPropagation();
          if (revealed.current) clearCrack(crack.id);
          else registerWrongClick();
        }}
      >
        <ShardCluster color="#ff2a4d" />
      </group>
    </group>
  );
}

export function GlitchCracks() {
  const { phase, mode, cracks, clueFound } = useGame();
  if (phase !== "playing" || mode !== "instrumental" || clueFound) return null;
  return (
    <group>
      {cracks.map((c) => (
        <Crack key={c.id} crack={c} />
      ))}
    </group>
  );
}
