import { useGame } from "../state/GameProvider";

/**
 * Instrumental "Frequency Hack Mode" static overlay. The screen is choked with
 * corrupting noise; each glitch crack the player clears lifts a third of it,
 * and clearing all three drops the overlay entirely so the exit unlocks.
 */
export function StaticNoise() {
  const { phase, mode, cracksCleared, cracksTotal, clueFound } = useGame();

  if (phase !== "playing" || mode !== "instrumental" || clueFound) return null;

  const remaining = Math.max(0, cracksTotal - cracksCleared) / cracksTotal;
  const opacity = remaining * 0.55;

  return (
    <div className="staticnoise" style={{ opacity }} aria-hidden>
      <div className="staticnoise__grain" />
      <div className="staticnoise__scan" />
    </div>
  );
}
