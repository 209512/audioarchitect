import { useAudio } from "../audio/AudioProvider";
import { useGame } from "../state/GameProvider";

/** Format seconds as m:ss. */
function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Bottom transport bar: play/pause, a seekable progress track, and time
 * readout. Styled with the active theme accent.
 */
export function AudioPlayer() {
  const { isPlaying, currentTime, duration, toggle, seek } = useAudio();
  const { theme, noteInteraction } = useGame();

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="player">
      <button
        className="player__btn"
        style={{ borderColor: theme.ui, color: theme.ui }}
        onClick={() => {
          toggle();
          noteInteraction();
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>

      <span className="player__time">{fmt(currentTime)}</span>

      <input
        className="player__seek"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        style={{
          background: `linear-gradient(90deg, ${theme.ui} ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
        }}
        onChange={(e) => {
          seek(Number(e.target.value));
          noteInteraction();
        }}
        aria-label="Seek"
      />

      <span className="player__time">{fmt(duration)}</span>
    </div>
  );
}
