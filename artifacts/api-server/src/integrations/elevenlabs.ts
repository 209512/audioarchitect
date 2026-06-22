/**
 * ===========================================================================
 * ElevenLabs — AI System Voice (server-side adapter)
 * ===========================================================================
 *
 * The API key is read from `process.env.ELEVENLABS_API_KEY` and never leaves
 * the server. The browser calls `POST /api/voice/taunt`; this module turns the
 * taunt text into speech via ElevenLabs' text-to-speech endpoint and streams
 * the audio back. If the key is missing or the upstream call fails, the route
 * responds with a non-2xx status and the frontend falls back to the browser's
 * built-in SpeechSynthesis voice.
 */

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
/** Public default voice ("Rachel"); override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_multilingual_v2";

/** True when an ElevenLabs API key is configured (never exposes the value). */
export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env["ELEVENLABS_API_KEY"]);
}

/** Synthesize a taunt line into MP3 audio bytes via ElevenLabs TTS. */
export async function synthesizeTaunt(text: string): Promise<ArrayBuffer> {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");

  const voiceId = process.env["ELEVENLABS_VOICE_ID"] || DEFAULT_VOICE_ID;
  const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL,
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  return res.arrayBuffer();
}
