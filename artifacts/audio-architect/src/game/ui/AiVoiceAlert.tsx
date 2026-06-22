import { useGame } from "../state/GameProvider";

/**
 * On-screen caption for the AI System Voice taunts (ElevenLabs mock). The audio
 * is spoken via the elevenlabs adapter; this shows the matching text.
 */
export function AiVoiceAlert() {
  const { aiMessage } = useGame();
  if (!aiMessage) return null;

  return (
    <div className="aivoice" role="status">
      <span className="aivoice__tag">SYSTEM</span>
      <span className="aivoice__text">{aiMessage}</span>
    </div>
  );
}
