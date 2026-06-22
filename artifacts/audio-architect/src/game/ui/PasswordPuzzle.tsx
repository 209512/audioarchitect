import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameProvider";
import type { ClueCategory } from "../types";

/** Per-category terminal copy. */
const CATEGORY_COPY: Record<
  ClueCategory,
  { header: string; tag: string; hint: string }
> = {
  time: {
    header: "DECRYPT TIME CODE",
    tag: "DIGITAL KEYPAD // TIME · NUMBER",
    hint: "A figure surfaced in the lyric. Key in the exact word or number you heard.",
  },
  emotion: {
    header: "DECRYPT SENSORY CODE",
    tag: "HOLOGRAPHIC MIRROR // EMOTION · VISION",
    hint: "A feeling reflected in the mirror. Enter the word it held.",
  },
  space: {
    header: "DECRYPT RHYTHM CODE",
    tag: "FLOATING SPEAKER // SPACE · MOVEMENT",
    hint: "Motion echoed through the speaker. Enter the word that moved.",
  },
  default: {
    header: "DECRYPT TITLE CODE",
    tag: "SONG-TITLE CORE // SIGNAL PEAK",
    hint: "No word locked in time — the core fell back to the track itself. Enter the song title.",
  },
};

/**
 * The sliding decryption terminal.
 *
 * - Lyric mode: opens when the revealed clue object is clicked; the header,
 *   tag, and riddle line adapt to the matched category, and the player types
 *   the dynamic password (the matched lyric token / song title).
 * - Instrumental mode: a non-blocking "AUDIO WAVELENGTH DECRYPTION" panel that
 *   tracks how many hidden glitch cracks have been cleared.
 */
export function PasswordPuzzle() {
  const {
    mode,
    clue,
    puzzleOpen,
    closePuzzle,
    submitPassword,
    clueFound,
    cracksCleared,
    cracksTotal,
    theme,
  } = useGame();

  const [guess, setGuess] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (puzzleOpen) {
      setGuess("");
      setError(false);
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [puzzleOpen]);

  // ---- Instrumental: persistent, non-blocking decryption tracker ----------
  if (mode === "instrumental") {
    if (clueFound) return null;
    return (
      <div className="freqterm" style={{ borderColor: theme.ui }}>
        <span className="freqterm__tag" style={{ color: theme.ui }}>
          AUDIO WAVELENGTH DECRYPTION
        </span>
        <div className="freqterm__bar">
          {Array.from({ length: cracksTotal }).map((_, i) => (
            <span
              key={i}
              className={
                "freqterm__cell" + (i < cracksCleared ? " freqterm__cell--on" : "")
              }
              style={i < cracksCleared ? { background: theme.ui } : undefined}
            />
          ))}
        </div>
        <span className="freqterm__status">
          NOISE CORRUPTION: {cracksCleared}/{cracksTotal} CLEARED
        </span>
        {cracksCleared === 0 && (
          <span className="freqterm__hint">
            No lyrics to read. Activate SONAR and sweep the room to surface the
            hidden glitch cracks, then click each one to clear the noise.
          </span>
        )}
      </div>
    );
  }

  // ---- Lyric: adaptive password terminal ----------------------------------
  if (!puzzleOpen || !clue) return null;

  const copy = CATEGORY_COPY[clue.category];

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const ok = submitPassword(guess);
    if (!ok) {
      setError(true);
      setGuess("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="puzzle">
      <form
        className={"puzzle__panel" + (error ? " puzzle__panel--error" : "")}
        style={{ borderColor: theme.ui, boxShadow: `0 0 60px ${theme.ui}55` }}
        onSubmit={onSubmit}
      >
        <span className="puzzle__tag" style={{ color: theme.ui }}>
          {copy.tag}
        </span>
        <h2 className="puzzle__title">{copy.header}</h2>
        <p className="puzzle__hint">{copy.hint}</p>
        <p className="puzzle__lyric" style={{ color: theme.ui }}>
          &ldquo;{clue.lyric}&rdquo;
        </p>

        <input
          ref={inputRef}
          className="puzzle__input"
          style={{ borderColor: theme.ui, color: "#f3f0ff" }}
          value={guess}
          onChange={(e) => {
            setGuess(e.target.value);
            setError(false);
          }}
          placeholder="enter password"
          autoComplete="off"
          spellCheck={false}
        />

        {error && <p className="puzzle__error">ACCESS DENIED // SIGNAL MISMATCH</p>}

        <div className="puzzle__actions">
          <button
            type="submit"
            className="puzzle__btn"
            style={{ borderColor: theme.ui, color: theme.ui }}
          >
            DECRYPT
          </button>
          <button
            type="button"
            className="puzzle__btn puzzle__btn--ghost"
            onClick={closePuzzle}
          >
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
}
