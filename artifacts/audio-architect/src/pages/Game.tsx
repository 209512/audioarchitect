import { useEffect, useRef, useState } from "react";
import { AudioProvider } from "@/game/audio/AudioProvider";
import { GameProvider, useGame } from "@/game/state/GameProvider";
import { Scene } from "@/game/three/Scene";
import { AudioPlayer } from "@/game/ui/AudioPlayer";
import { DevPanel } from "@/game/ui/DevPanel";
import { GlitchOverlay } from "@/game/ui/GlitchOverlay";
import { AiVoiceAlert } from "@/game/ui/AiVoiceAlert";
import { GameOverModal } from "@/game/ui/GameOverModal";
import { Hud } from "@/game/ui/Hud";
import { IntroScreen } from "@/game/ui/IntroScreen";
import { PasswordPuzzle } from "@/game/ui/PasswordPuzzle";
import { StaticNoise } from "@/game/ui/StaticNoise";

/**
 * Inner shell: reads phase + theme to lay out the 3D canvas and 2D overlays.
 * The page background gradient follows the active Cyanite theme.
 */
function GameShell() {
  const { phase, theme, genre, lyricsNotice } = useGame();

  // Cinematic camera shake: when the genre/mood switches, the whole digital
  // architecture "rebuilds", so we jolt the rendered frame for ~0.5s.
  const [shake, setShake] = useState(false);
  const prevGenre = useRef(genre);
  useEffect(() => {
    if (prevGenre.current === genre) return;
    prevGenre.current = genre;
    setShake(true);
    const id = window.setTimeout(() => setShake(false), 500);
    return () => window.clearTimeout(id);
  }, [genre]);

  return (
    <div className="stage" style={{ background: theme.pageBackground }}>
      {/* 3D world */}
      <div className={"stage__canvas" + (shake ? " stage__canvas--shake" : "")}>
        <Scene />
      </div>

      {/* Persistent dev controls for the genre/mood swap */}
      <DevPanel />

      {/* In-game overlays */}
      {phase === "playing" && (
        <>
          <Hud />
          <AiVoiceAlert />
          <AudioPlayer />
          <StaticNoise />
          <PasswordPuzzle />
        </>
      )}

      {/* Intro / start gate */}
      {phase === "intro" && <IntroScreen />}

      {/* Win / over screen (fires the n8n webhook) */}
      <GameOverModal />

      {/* Screen glitch (wrong click / idle taunt) */}
      <GlitchOverlay />

      {/* Transient system notice (e.g. lyrics fell back to the sample stream) */}
      {lyricsNotice && (
        <div className="notice" role="status" style={{ borderColor: theme.ui }}>
          {lyricsNotice}
        </div>
      )}
    </div>
  );
}

/**
 * Game page. Wires the audio engine + game state providers around the shell.
 * AudioProvider must wrap GameProvider because game logic calls into audio.
 */
export default function Game() {
  return (
    <AudioProvider>
      <GameProvider>
        <GameShell />
      </GameProvider>
    </AudioProvider>
  );
}
