import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useTexture, Grid } from "@react-three/drei";
import { useGame } from "../state/GameProvider";
import {
  ROOM_EXTENT as ROOM,
  ROOM_HEIGHT as HEIGHT,
  getRoomHeight,
  getRoomHeightScale,
} from "./dimensions";
import {
  BUILD_STAGE_BACK,
  BUILD_STAGE_LEFT,
  BUILD_STAGE_RIGHT,
  BUILD_STAGE_CEILING,
  BUILD_STAGES,
} from "../config";

/**
 * The room shell: a holographic floor grid plus textured walls whose surface
 * (graffiti vs marble) and emissive tint swap with the Cyanite theme.
 *
 * Build sequence: before the music plays the walls + ceiling are at 0% opacity
 * and scaled flat to the floor. Each surface snaps in on an early audio peak
 * (its `stageIndex`), extruding upward to the song-derived height — so the
 * sound literally assembles (and sizes) the architecture, one panel per beat.
 *
 * The "sonar" wall is rendered separately (see SonarWall.tsx); this component
 * draws the other three walls + ceiling + floor and registers wrong-click
 * targets.
 */

function Wall({
  position,
  rotation,
  textureUrl,
  emissive,
  onWrongClick,
  stageIndex,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  textureUrl: string;
  emissive: string;
  onWrongClick: () => void;
  /** Assembly stage at which this wall snaps in. */
  stageIndex: number;
}) {
  const { buildStageRef, sonarActive, sonarCursorRef } = useGame();
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const localBuild = useRef(0);

  const texture = useTexture(textureUrl);
  // Tile the texture across the wall for a paneled look.
  const map = useMemo(() => {
    const t = texture.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    t.needsUpdate = true;
    return t;
  }, [texture]);

  // Snap in once this wall's stage is reached: extrude from the floor to the
  // song-derived height + fade in.
  useFrame((_, delta) => {
    const target = buildStageRef.current >= stageIndex ? 1 : 0;
    localBuild.current += (target - localBuild.current) * Math.min(1, delta * 4);
    const b = localBuild.current;
    if (groupRef.current) {
      groupRef.current.scale.y = Math.max(0.0001, b * getRoomHeightScale());
    }
    if (matRef.current) matRef.current.opacity = b;
  });

  return (
    // Group sits on the floor (y=0) so scaling Y grows the wall upward.
    <group ref={groupRef} position={position} rotation={rotation}>
      <mesh
        position={[0, HEIGHT / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onWrongClick();
        }}
        onPointerMove={(e) => {
          if (!sonarActive || buildStageRef.current < BUILD_STAGES) return;
          e.stopPropagation();
          sonarCursorRef.current = {
            x: e.point.x,
            y: e.point.y,
            z: e.point.z,
          };
        }}
      >
        <planeGeometry args={[ROOM * 2, HEIGHT]} />
        <meshStandardMaterial
          ref={matRef}
          map={map}
          emissive={new THREE.Color(emissive)}
          emissiveIntensity={0.45}
          emissiveMap={map}
          metalness={0.6}
          roughness={0.4}
          side={THREE.DoubleSide}
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}

/** Ceiling glow plane — the last surface to snap in, at the song-scaled height. */
function Ceiling() {
  const { theme, buildStageRef, sonarActive, sonarCursorRef } = useGame();
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const localBuild = useRef(0);

  useFrame((_, delta) => {
    const target = buildStageRef.current >= BUILD_STAGE_CEILING ? 1 : 0;
    localBuild.current += (target - localBuild.current) * Math.min(1, delta * 4);
    if (meshRef.current) meshRef.current.position.y = getRoomHeight();
    if (matRef.current) matRef.current.opacity = localBuild.current;
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, HEIGHT, 0]}
      onPointerMove={(e) => {
        if (!sonarActive || buildStageRef.current < BUILD_STAGES) return;
        e.stopPropagation();
        sonarCursorRef.current = { x: e.point.x, y: e.point.y, z: e.point.z };
      }}
    >
      <planeGeometry args={[ROOM * 2, ROOM * 2]} />
      <meshStandardMaterial
        ref={matRef}
        color="#0a0618"
        emissive={new THREE.Color(theme.grid)}
        emissiveIntensity={0.08}
        side={THREE.DoubleSide}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

export function Room() {
  const {
    theme,
    roomDims,
    registerWrongClick,
    sonarActive,
    sonarCursorRef,
    buildStageRef,
  } = useGame();

  // Faster songs pack a denser floor grid (smaller cells).
  const cellSize = 1 / roomDims.gridDensity;
  const sectionSize = 4 / roomDims.gridDensity;

  return (
    <group>
      {/* Holographic floor grid — always visible; density tracks the tempo */}
      <Grid
        position={[0, 0, 0]}
        args={[ROOM * 2, ROOM * 2]}
        cellSize={cellSize}
        cellThickness={0.6}
        cellColor={theme.grid}
        sectionSize={sectionSize}
        sectionThickness={1.2}
        sectionColor={theme.grid}
        fadeDistance={42}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />

      {/* Solid dark floor under the grid so the room feels enclosed */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        onClick={(e) => {
          e.stopPropagation();
          registerWrongClick();
        }}
        onPointerMove={(e) => {
          if (!sonarActive || buildStageRef.current < BUILD_STAGES) return;
          e.stopPropagation();
          sonarCursorRef.current = { x: e.point.x, y: e.point.y, z: e.point.z };
        }}
      >
        <planeGeometry args={[ROOM * 2, ROOM * 2]} />
        <meshStandardMaterial color="#05030a" metalness={0.8} roughness={0.5} />
      </mesh>

      {/* Back wall */}
      <Wall
        position={[0, 0, -ROOM]}
        rotation={[0, 0, 0]}
        textureUrl={theme.wallTexture}
        emissive={theme.wallEmissive}
        onWrongClick={registerWrongClick}
        stageIndex={BUILD_STAGE_BACK}
      />
      {/* Left wall */}
      <Wall
        position={[-ROOM, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        textureUrl={theme.wallTexture}
        emissive={theme.wallEmissive}
        onWrongClick={registerWrongClick}
        stageIndex={BUILD_STAGE_LEFT}
      />
      {/* Right wall */}
      <Wall
        position={[ROOM, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        textureUrl={theme.wallTexture}
        emissive={theme.wallEmissive}
        onWrongClick={registerWrongClick}
        stageIndex={BUILD_STAGE_RIGHT}
      />

      {/* Ceiling */}
      <Ceiling />
    </group>
  );
}
