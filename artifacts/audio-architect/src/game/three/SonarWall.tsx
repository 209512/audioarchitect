import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAudio } from "../audio/AudioProvider";
import { useGame } from "../state/GameProvider";
import { stemEnergy, STEM_BANDS } from "../integrations/lalalai";
import { ROOM_EXTENT, ROOM_HEIGHT, getRoomHeightScale } from "./dimensions";
import { BUILD_STAGE_FRONT, BUILD_STAGES } from "../config";

/**
 * The "Sonar" front wall (LALAL.AI mode).
 *
 * It is a finely subdivided plane rendered as a wireframe grid. On hover, each
 * vertex is pushed along the wall normal by a ripple whose amplitude is driven
 * by the LIVE Web Audio AnalyserNode — so the wall physically reacts to the
 * music. Color shifts toward red while scanning.
 *
 * Like the other walls it snaps in during assembly (the front-wall stage),
 * extruding from the floor to the song-derived height.
 *
 * Sync model: we read the analyser's frequency data every frame (no React
 * re-render) and deform geometry in place.
 */

const SEG = 40; // grid resolution per axis

/**
 * Sonar ripple color per separated stem (indexes match STEM_BANDS): the wall
 * tints toward whichever frequency layer is currently dominant, so the player
 * can read which stem (bass / drums / vocals / synths) is driving the scan.
 */
const STEM_COLORS = [
  new THREE.Color(1.0, 0.12, 0.18), // Bass — red
  new THREE.Color(1.0, 0.48, 0.12), // Drums — orange
  new THREE.Color(0.22, 0.78, 1.0), // Vocals — cyan
  new THREE.Color(0.72, 0.36, 1.0), // Synths — violet
];

export function SonarWall() {
  const { getFrequencyData } = useAudio();
  const { noteInteraction, buildStageRef, sonarActive, sonarCursorRef } =
    useGame();

  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const hoverAmt = useRef(0); // smoothed 0..1 hover factor
  const localBuild = useRef(0); // smoothed 0..1 assembly factor

  // Keep a copy of the flat base positions so each frame deforms from rest.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(ROOM_EXTENT * 2, ROOM_HEIGHT, SEG, SEG);
    g.userData.base = Float32Array.from(
      g.attributes.position.array as Float32Array,
    );
    return g;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Snap in once the front-wall stage is reached: extrude from the floor to
    // the song-derived height (group pivot at y=0).
    const buildTarget = buildStageRef.current >= BUILD_STAGE_FRONT ? 1 : 0;
    localBuild.current +=
      (buildTarget - localBuild.current) * Math.min(1, delta * 4);
    const build = localBuild.current;
    if (groupRef.current) {
      groupRef.current.scale.y = Math.max(0.0001, build * getRoomHeightScale());
    }

    // Smoothly ramp the hover factor for graceful enter/exit.
    const target = hovered ? 1 : 0;
    hoverAmt.current += (target - hoverAmt.current) * Math.min(1, delta * 6);

    const pos = geometry.attributes.position;
    const base = geometry.userData.base as Float32Array;
    const freq = getFrequencyData();

    // Split the spectrum so different frequencies deform the wall differently.
    const bass = freq ? stemEnergy(freq, STEM_BANDS[0]) : 0;
    const drums = freq ? stemEnergy(freq, STEM_BANDS[1]) : 0;
    const mids = freq ? stemEnergy(freq, STEM_BANDS[2]) : 0;
    const highs = freq ? stemEnergy(freq, STEM_BANDS[3]) : 0;
    const t = performance.now() / 1000;

    // Aggressive amplitude: the wall is ALWAYS audio-reactive once the room is
    // built, and hovering ("sonar scan") amplifies it further. Bass dominates
    // so the surface visibly heaves with the beat.
    const audioAmp = bass * 9 + mids * 4 + highs * 2.5;
    const amp = build * audioAmp * (0.6 + hoverAmt.current * 1.8);

    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      // Concentric shockwave radiating from the center...
      const d = Math.sqrt(x * x + y * y);
      const ripple = Math.sin(d * 1.2 - t * 8) * Math.exp(-d * 0.04);
      // ...plus a chaotic cross-grid detail so it looks alive, not just pulsing.
      const detail =
        Math.sin(x * 0.9 + t * 6) * Math.cos(y * 0.9 - t * 5) * 0.45;
      pos.setZ(i, (ripple + detail) * amp);
    }
    pos.needsUpdate = true;
    // No computeVertexNormals(): the wall renders as wireframe, so vertex
    // normals don't affect shading — skipping it avoids a per-frame CPU hotspot.

    // Fade in with the build, brighten on the beat, and tint toward whichever
    // separated stem is currently dominant (bass/drums/vocals/synths).
    if (matRef.current) {
      matRef.current.opacity = build;
      const e = (0.4 + bass * 1.2) * (0.5 + hoverAmt.current);
      matRef.current.emissiveIntensity = 0.3 + e;
      const energies = [bass, drums, mids, highs];
      let dom = 0;
      for (let i = 1; i < energies.length; i++) {
        if (energies[i] > energies[dom]) dom = i;
      }
      // Smoothly ease toward the dominant stem's color so it never strobes.
      matRef.current.emissive.lerp(STEM_COLORS[dom], Math.min(1, delta * 3));
    }
  });

  return (
    // Group pivots on the floor (y=0) at the front of the room so scaling Y
    // grows the wall upward, matching the other walls' assembly.
    <group
      ref={groupRef}
      position={[0, 0, ROOM_EXTENT]}
      rotation={[0, Math.PI, 0]}
    >
      <mesh
        ref={meshRef}
        geometry={geometry}
        position={[0, ROOM_HEIGHT / 2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          noteInteraction();
        }}
        onPointerOut={() => setHovered(false)}
        onPointerMove={(e) => {
          if (!sonarActive || buildStageRef.current < BUILD_STAGES) return;
          e.stopPropagation();
          // Record the cursor on the wall's FLAT rest plane (z = ROOM_EXTENT),
          // not the rippled surface. Strong bass deforms the wall tens of units
          // along z; using the deformed hit point would push the cursor far from
          // a flush front-wall crack, so its proximity reveal could never cross
          // the click threshold while the music was loud.
          sonarCursorRef.current = { x: e.point.x, y: e.point.y, z: ROOM_EXTENT };
        }}
      >
        <meshStandardMaterial
          ref={matRef}
          color="#1a0309"
          emissive={new THREE.Color("#ff1133")}
          emissiveIntensity={0.3}
          wireframe
          metalness={0.2}
          roughness={0.8}
          side={THREE.DoubleSide}
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}
