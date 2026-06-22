import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useGame } from "../state/GameProvider";
import { useAudio } from "../audio/AudioProvider";
import { stemEnergy, STEM_BANDS } from "../integrations/lalalai";
import { placementTransform } from "./placement";
import { SONAR_REVEAL_RADIUS } from "../config";
import type { ClueObjectType } from "../types";

/**
 * The active lyric clue, hidden flush against a random surface. It starts at
 * ~10% opacity (blended with the wireframe architecture) and ramps to full
 * neon visibility as the LALAL.AI sonar cursor closes in — at which point a
 * red ripple patch behind it heaves with the music. Clicking the fully
 * revealed object opens the password terminal.
 */

const PATCH_SEG = 12;
const HIDDEN_OPACITY = 0.1;

/** Time / NUMBER -> a neon digital keypad. */
function Keypad({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.7, 2.1, 0.18]} />
        <meshStandardMaterial
          color="#0a0a14"
          emissive={new THREE.Color(color)}
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.3}
          transparent
        />
      </mesh>
      {/* 3x4 grid of glowing keys */}
      {Array.from({ length: 12 }).map((_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <mesh
            key={i}
            position={[(col - 1) * 0.5, 0.6 - row * 0.42, 0.12]}
          >
            <boxGeometry args={[0.38, 0.32, 0.08]} />
            <meshStandardMaterial
              color={color}
              emissive={new THREE.Color(color)}
              emissiveIntensity={1.6}
              toneMapped={false}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Emotion / VISION -> a holographic mirror. */
function Mirror({ color, accent }: { color: string; accent: string }) {
  return (
    <group>
      <mesh>
        <torusGeometry args={[1.05, 0.1, 20, 60]} />
        <meshStandardMaterial
          color={color}
          emissive={new THREE.Color(color)}
          emissiveIntensity={1.8}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial
          color="#0a0a16"
          emissive={new THREE.Color(accent)}
          emissiveIntensity={0.7}
          metalness={0.95}
          roughness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

/** Space / MOVEMENT -> a floating speaker. */
function Speaker({ color, accent }: { color: string; accent: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.5, 2, 1]} />
        <meshStandardMaterial
          color="#0a0a14"
          emissive={new THREE.Color(color)}
          emissiveIntensity={0.4}
          metalness={0.7}
          roughness={0.4}
          transparent
        />
      </mesh>
      {[0.45, -0.4].map((y, i) => (
        <mesh key={i} position={[0, y, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[i === 0 ? 0.45 : 0.28, i === 0 ? 0.5 : 0.32, 0.12, 32]} />
          <meshStandardMaterial
            color={accent}
            emissive={new THREE.Color(accent)}
            emissiveIntensity={1.4}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

/** Default (peak fallback) -> a pulsing core. */
function Core({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) {
      const s = 1 + Math.sin(performance.now() / 350) * 0.12;
      ref.current.scale.setScalar(s);
    }
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={new THREE.Color(color)}
        emissiveIntensity={1.8}
        wireframe
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function Shape({ type, color, accent }: { type: ClueObjectType; color: string; accent: string }) {
  switch (type) {
    case "keypad":
      return <Keypad color={color} />;
    case "mirror":
      return <Mirror color={color} accent={accent} />;
    case "speaker":
      return <Speaker color={color} accent={accent} />;
    default:
      return <Core color={color} />;
  }
}

export function ClueObject() {
  const {
    phase,
    clue,
    clueFound,
    sonarActive,
    sonarCursorRef,
    setClueRevealed,
    openPuzzle,
    registerWrongClick,
    theme,
  } = useGame();
  const { getFrequencyData } = useAudio();

  const shapeRef = useRef<THREE.Group>(null);
  const patchRef = useRef<THREE.Mesh>(null);
  const patchMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const revealAmt = useRef(0);
  const wasRevealed = useRef(false);

  const transform = useMemo(
    () => (clue ? placementTransform(clue.placement) : null),
    [clue],
  );

  const patchGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4, 4, PATCH_SEG, PATCH_SEG);
    g.userData.base = Float32Array.from(g.attributes.position.array as Float32Array);
    return g;
  }, []);

  useFrame((_, delta) => {
    if (!transform) return;

    // Proximity-driven reveal: closer sonar cursor -> higher reveal.
    const cur = sonarCursorRef.current;
    let target = 0;
    if (sonarActive && cur) {
      const [px, py, pz] = transform.position;
      const dist = Math.hypot(cur.x - px, cur.y - py, cur.z - pz);
      target = THREE.MathUtils.clamp(1 - dist / SONAR_REVEAL_RADIUS, 0, 1);
      // Ease so the reveal "snaps" cleanly near the object.
      target = target * target * (3 - 2 * target);
    }
    revealAmt.current += (target - revealAmt.current) * Math.min(1, delta * 6);
    const r = revealAmt.current;

    // Fade the whole object from hidden -> full neon.
    const op = HIDDEN_OPACITY + r * (1 - HIDDEN_OPACITY);
    if (shapeRef.current) {
      shapeRef.current.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.Material | undefined;
        if (mat && "opacity" in mat) (mat as THREE.Material & { opacity: number }).opacity = op;
      });
    }

    // Red ripple patch behind the object, amplified by bass near the cursor.
    const freq = getFrequencyData();
    const bass = freq ? stemEnergy(freq, STEM_BANDS[0]) : 0;
    const amp = r * (0.3 + bass * 2.2);
    const pos = patchGeo.attributes.position;
    const base = patchGeo.userData.base as Float32Array;
    const t = performance.now() / 1000;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const d = Math.sqrt(x * x + y * y);
      pos.setZ(i, Math.sin(d * 2 - t * 9) * Math.exp(-d * 0.5) * amp);
    }
    pos.needsUpdate = true;
    if (patchMatRef.current) {
      patchMatRef.current.opacity = r * 0.5;
      patchMatRef.current.emissiveIntensity = 0.4 + bass * 1.6 * r;
    }

    // Cross the reveal threshold to gate clicks + drive the HUD hint.
    if (r > 0.85 && !wasRevealed.current) {
      wasRevealed.current = true;
      setClueRevealed(true);
    } else if (r < 0.45 && wasRevealed.current) {
      wasRevealed.current = false;
      setClueRevealed(false);
    }
  });

  if (phase !== "playing" || !clue || clueFound || !transform) return null;

  return (
    <group position={transform.position} rotation={transform.rotation}>
      {/* Red sonar ripple patch flush on the surface, behind the object */}
      <mesh ref={patchRef} geometry={patchGeo} position={[0, 0, -0.18]}>
        <meshStandardMaterial
          ref={patchMatRef}
          color="#1a0309"
          emissive={new THREE.Color("#ff1133")}
          emissiveIntensity={0.4}
          wireframe
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group
        ref={shapeRef}
        onClick={(e) => {
          e.stopPropagation();
          if (wasRevealed.current) openPuzzle();
          else registerWrongClick();
        }}
      >
        <Shape type={clue.objectType} color={theme.accentA} accent={theme.accentB} />

        {/* Prompt only legible once revealed (its opacity tracks the object). */}
        <Text
          position={[0, 1.7, 0.1]}
          fontSize={0.24}
          color={theme.accentB}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000"
          fillOpacity={revealAmt.current}
        >
          CLICK TO DECODE
        </Text>
      </group>
    </group>
  );
}
