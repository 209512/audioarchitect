import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import { useAudio } from "../audio/AudioProvider";
import { useGame } from "../state/GameProvider";
import { lineAtTime } from "../integrations/musixmatch";
import { ROOM_HEIGHT } from "./dimensions";

/**
 * Floating 3D lyric holograms.
 *
 * Reads the audio element's currentTime every frame (tight sync, no React
 * re-render) and shows the matching richsync line as glowing billboarded text
 * that floats and pulses. Reports the active line up to the GameProvider so the
 * clock-clue trigger can fire on "clock"/"time".
 */

export function LyricHolograms() {
  const { audioRef } = useAudio();
  const { theme, reportLyric, phase, lyrics } = useGame();

  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const [text, setText] = useState<string>("");
  const lastIndex = useRef<number>(-1);
  const appearAt = useRef<number>(0);

  // Clear lyrics when not playing.
  useEffect(() => {
    if (phase !== "playing") {
      setText("");
      lastIndex.current = -1;
      reportLyric(null);
    }
  }, [phase, reportLyric]);

  useFrame(() => {
    const el = audioRef.current;
    if (!el || phase !== "playing") return;

    const hit = lineAtTime(lyrics, el.currentTime);
    const idx = hit ? hit.index : -1;
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      const next = hit ? hit.line.text : "";
      setText(next);
      reportLyric(hit ? hit.line.text : null);
      appearAt.current = performance.now();
    }

    // Gentle float + fade-in pulse.
    if (groupRef.current) {
      const age = (performance.now() - appearAt.current) / 1000;
      groupRef.current.position.y =
        ROOM_HEIGHT * 0.55 + Math.sin(performance.now() / 900) * 0.25;
      if (matRef.current) {
        const fadeIn = Math.min(1, age * 2);
        matRef.current.opacity = text ? 0.9 * fadeIn : 0;
      }
    }
  });

  if (!text) return null;

  return (
    <Billboard ref={groupRef} position={[0, ROOM_HEIGHT * 0.55, -2]}>
      <Text
        fontSize={0.95}
        maxWidth={18}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={theme.accentA}
        outlineOpacity={0.9}
      >
        {text}
        <meshBasicMaterial
          ref={matRef}
          color={theme.accentB}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </Text>
    </Billboard>
  );
}
