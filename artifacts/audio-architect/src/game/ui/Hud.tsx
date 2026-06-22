import { useGame } from "../state/GameProvider";

/** Format seconds as m:ss. */
function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Heads-up display: run timer, the LALAL.AI sonar toggle, and a short objective
 * hint that adapts to the current mode (lyric clue hunt vs instrumental
 * frequency hack) and progress.
 */
export function Hud() {
  const {
    elapsedSeconds,
    theme,
    mode,
    clue,
    clueFound,
    clueRevealed,
    sonarActive,
    toggleSonar,
    cracksCleared,
    cracksTotal,
    sonarStatus,
    separation,
  } = useGame();

  let sonarReadout: string | null = null;
  if (separation?.status === "separating") {
    sonarReadout = "Sonar: isolating frequency layers...";
  } else if (separation?.status === "ready" && separation.stems.length) {
    sonarReadout = `Sonar layers: ${separation.stems.join(", ")}`;
  } else if (separation?.status === "error") {
    sonarReadout = "Sonar layers unavailable — scanning on live audio";
  } else if (sonarStatus) {
    sonarReadout = sonarStatus.detail;
  }

  let hint: string;
  if (clueFound) {
    hint = "Signal decrypted. The loop is broken.";
  } else if (mode === "instrumental") {
    hint = sonarActive
      ? "Scan the surfaces. Get close to a glitch crack, then click to clear it."
      : "Frequency Hack Mode. Toggle the sonar to hunt the hidden glitch cracks.";
  } else if (clue && sonarActive) {
    hint = clueRevealed
      ? "Object locked. Click it to open the decryption terminal."
      : "Sweep the walls, floor, and ceiling — proximity reveals the hidden object.";
  } else if (clue) {
    hint = "A signal hid itself in the room. Toggle the sonar to hunt it down.";
  } else {
    hint = "Listen. The lyrics will plant a clue somewhere in the room.";
  }

  return (
    <div className="hud">
      <div className="hud__timer" style={{ color: theme.ui }}>
        {fmt(elapsedSeconds)}
      </div>
      <div className="hud__hint">{hint}</div>

      {mode === "instrumental" && !clueFound && (
        <div className="hud__tracker" style={{ color: theme.ui }}>
          NOISE CORRUPTION: {cracksCleared}/{cracksTotal} CLEARED
        </div>
      )}

      {!clueFound && (
        <button
          type="button"
          className={"hud__sonar" + (sonarActive ? " hud__sonar--on" : "")}
          style={
            sonarActive
              ? { borderColor: theme.ui, color: theme.ui }
              : undefined
          }
          onClick={toggleSonar}
          title="Toggle sonar (S)"
        >
          SONAR SCAN: {sonarActive ? "ON" : "OFF"} (S)
        </button>
      )}

      {sonarReadout && (
        <div className="hud__sonar-status" style={{ color: theme.ui }}>
          {sonarReadout}
        </div>
      )}
    </div>
  );
}
