import { useGame } from "../state/GameProvider";
import { SUPPORTED_GENRES } from "../integrations/cyanite";
import { THEMES } from "../themes";
import type { SimMode } from "../types";

const SIMS: { value: SimMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "time", label: "Time" },
  { value: "emotion", label: "Emotion" },
  { value: "space", label: "Space" },
  { value: "instrumental", label: "Instrumental" },
];

/**
 * Developer toggle panel.
 *
 * - CYANITE MOOD: stands in for live Cyanite classification — flips the room's
 *   genre/mood so the theme swap can be demoed instantly.
 * - CLUE SIMULATION: forces the universal classifier down a chosen path so each
 *   clue object (keypad/mirror/speaker/core) and the instrumental frequency
 *   hack can be demoed on any song. "Auto" classifies the live mock lyrics.
 */
export function DevPanel() {
  const { genre, handleCyaniteTheme, theme, simulation, setSimulation } =
    useGame();

  return (
    <div className="devpanel">
      <span className="devpanel__label">CYANITE MOOD (dev)</span>
      <div className="devpanel__row">
        {SUPPORTED_GENRES.map((g) => (
          <button
            key={g}
            className={
              "devpanel__btn" + (g === genre ? " devpanel__btn--active" : "")
            }
            style={
              g === genre
                ? { borderColor: theme.ui, color: theme.ui }
                : undefined
            }
            onClick={() => handleCyaniteTheme(g)}
          >
            {THEMES[g].label}
          </button>
        ))}
      </div>

      <span className="devpanel__label" style={{ marginTop: 12 }}>
        CLUE SIMULATION (dev)
      </span>
      <div className="devpanel__row devpanel__row--wrap">
        {SIMS.map((s) => (
          <button
            key={s.value}
            className={
              "devpanel__btn" +
              (s.value === simulation ? " devpanel__btn--active" : "")
            }
            style={
              s.value === simulation
                ? { borderColor: theme.ui, color: theme.ui }
                : undefined
            }
            onClick={() => setSimulation(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
