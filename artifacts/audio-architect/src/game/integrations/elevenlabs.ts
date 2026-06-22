/**
 * ===========================================================================
 * ElevenLabs — AI System Voice adapter  (MOCK)
 * ===========================================================================
 *
 * When the player idles or clicks the wrong area, a sardonic "AI System Voice"
 * mocks them (text + audio) alongside a screen-glitch effect.
 *
 * --- INTEGRATION (LIVE via backend proxy) ---
 * `speak` first asks the Express API (`POST /api/voice/taunt`) to synthesize the
 * line with the real ElevenLabs voice. The API key lives only on the server, so
 * it is never shipped to the browser. If the key is missing or the upstream call
 * fails, we transparently fall back to the browser's built-in SpeechSynthesis.
 */

import type { ClueCategory } from "../types";

/** Backend proxy that holds the ElevenLabs key server-side. */
const VOICE_ENDPOINT = "/api/voice/taunt";

/** Reused <audio> element for AI voice playback. */
let voiceEl: HTMLAudioElement | null = null;

/** General-purpose taunts (used when no clue category is active). */
export const TAUNTS: string[] = [
  "Lost already? The walls are laughing at you.",
  "Tick, tock. Even the silence is mocking you now.",
  "Wrong move, architect. Try using your ears.",
  "Are you here to escape, or to decorate?",
  "I built this room in seconds. You can't even leave it.",
  "Hesitation is just failure in slow motion.",
];

/**
 * Category-specific taunts. When a clue is armed, the AI needles the player
 * about that exact puzzle (time / emotion / space / song title) so the voice
 * feels aware of what they're failing at.
 */
export const CATEGORY_TAUNTS: Record<ClueCategory, string[]> = {
  time: [
    "Your time is literally running out, architect.",
    "Tick, tock — the clock is solving this faster than you.",
    "Every second you stall, I count it against you.",
  ],
  emotion: [
    "I can see the doubt behind your eyes.",
    "Feelings won't open this door. Reason might — if you had any.",
    "Your heart's racing, but your mind is standing still.",
  ],
  space: [
    "You can't even find your way around my walls.",
    "So much room, so little sense of direction.",
    "Run all you want — the exit isn't where you're looking.",
  ],
  default: [
    "It's hiding in plain sound and you still can't name it.",
    "The answer is the song itself. Pathetic, isn't it?",
    "You heard the title a dozen times. Were you listening?",
  ],
};

/**
 * Pick a random taunt line. When a clue `category` is provided, the AI draws
 * from that category's pool so the insult matches the puzzle the player is
 * stuck on; otherwise it falls back to the general pool.
 */
export function randomTaunt(category?: ClueCategory | null): string {
  const pool = category ? CATEGORY_TAUNTS[category] : TAUNTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Speak a taunt line. Tries the real ElevenLabs voice through the backend
 * proxy first; on any failure (no key, network error, blocked autoplay) it
 * falls back to the browser's SpeechSynthesis so the taunt is always audible.
 * Fire-and-forget: callers do not need to await.
 */
export async function speak(text: string): Promise<void> {
  const played = await speakViaApi(text);
  if (!played) speakViaBrowser(text);
}

/** Attempt real ElevenLabs playback via the server proxy. Returns success. */
async function speakViaApi(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch(VOICE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob.size) return false;

    const url = URL.createObjectURL(blob);
    if (!voiceEl) voiceEl = new Audio();
    voiceEl.src = url;
    voiceEl.onended = () => URL.revokeObjectURL(url);
    await voiceEl.play();
    return true;
  } catch {
    return false;
  }
}

/** Fallback: synthesize the line with the browser's built-in voice. */
function speakViaBrowser(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Tuned to feel cold and synthetic — a stand-in for the ElevenLabs voice.
    utter.rate = 0.95;
    utter.pitch = 0.5;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
  } catch {
    // SpeechSynthesis can throw in some locked-down contexts; fail silently.
  }
}
