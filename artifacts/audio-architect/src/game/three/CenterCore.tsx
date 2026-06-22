import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGame } from "../state/GameProvider";

/**
 * Pulsing energy core shown in the silent intro state. Before the music plays
 * the room is pitch black except the faint floor grid and this glowing core,
 * which acts as the focal point behind the "Enter the room" button. It fades
 * out as the architecture extrudes (buildRef ramps toward 1).
 */
export function CenterCore() {
  const { theme, buildRef } = useGame();
  const groupRef = useRef<THREE.Group>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    // Visible only while the room is still unbuilt; fade as it extrudes.
    const visible = 1 - Math.min(1, buildRef.current * 2);
    g.visible = visible > 0.01;
    g.position.y = 4;

    const t = performance.now() / 1000;
    const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;
    g.scale.setScalar(pulse);
    g.rotation.y += delta * 0.5;

    if (coreMat.current) {
      coreMat.current.emissive.set(theme.accentA);
      coreMat.current.emissiveIntensity = (1.4 + Math.sin(t * 3) * 0.5) * visible;
      coreMat.current.opacity = visible;
    }
    if (haloMat.current) {
      haloMat.current.color.set(theme.accentA);
      haloMat.current.opacity = 0.18 * visible * pulse;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.8;
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(theme.accentB);
      m.opacity = 0.5 * visible;
    }
  });

  return (
    <group ref={groupRef} position={[0, 4, 0]}>
      {/* Glowing core */}
      <mesh>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          ref={coreMat}
          color="#0a0a16"
          emissive={new THREE.Color(theme.accentA)}
          emissiveIntensity={1.6}
          metalness={0.6}
          roughness={0.25}
          transparent
          toneMapped={false}
        />
      </mesh>

      {/* Soft halo */}
      <mesh>
        <sphereGeometry args={[1.9, 24, 24]} />
        <meshBasicMaterial
          ref={haloMat}
          color={theme.accentA}
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>

      {/* Orbiting accent ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.6, 0.04, 12, 80]} />
        <meshBasicMaterial color={theme.accentB} transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}
