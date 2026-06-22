import { useRef, useState } from "react";
import { useGame } from "../state/GameProvider";
import { prettyGenre } from "../integrations/cyanite";
import { SAMPLE_TRACK_URL, SAMPLE_TRACK_NAME } from "../config";

/**
 * A few well-known songs that reliably have synced lyrics on Musixmatch, plus
 * the bundled sample. Surfaced as autocomplete so a player can pick an exact
 * title (avoiding typos that would fall back to the mock lyric stream).
 */
const SUGGESTED_TITLES = [
  SAMPLE_TRACK_NAME,
  "Bohemian Rhapsody",
  "Shape of You",
  "Blinding Lights",
  "Dynamite",
  "Hey Jude",
  "Rolling in the Deep",
];

/**
 * Cyanite returns raw mood tags from the real audio analysis. A few read oddly
 * on a public submission screen, so we hide them from the displayed signal
 * (they still feed the room-skin logic untouched).
 */
const HIDDEN_MOODS = new Set(["sexy", "erotic", "sensual"]);

/**
 * Title / start screen. The Start button is the required user gesture that
 * unlocks the Web Audio graph (browser autoplay policy) before playback.
 *
 * The track picker lets a player load their own audio file (with a title used
 * to fetch live Musixmatch lyrics); the bundled sample stays fully analyzed.
 */
export function IntroScreen() {
  const { startGame, theme, analysis, track, selectTrack } = useGame();
  const fileRef = useRef<HTMLInputElement>(null);
  const [titleInput, setTitleInput] = useState("");
  const [fileName, setFileName] = useState("");

  const isSample = track.url === SAMPLE_TRACK_URL;

  const visibleMoods = analysis
    ? analysis.moodTags
        .filter((m) => !HIDDEN_MOODS.has(m.toLowerCase()))
        .slice(0, 2)
    : [];

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
    selectTrack({
      url: URL.createObjectURL(file),
      title: titleInput.trim() || fallbackTitle,
      analyzable: false,
    });
  };

  const useSample = () => {
    setTitleInput("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    selectTrack({
      url: SAMPLE_TRACK_URL,
      title: SAMPLE_TRACK_NAME,
      analyzable: true,
    });
  };

  return (
    <div className="intro">
      <div className="intro__inner">
        <p className="intro__kicker" style={{ color: theme.ui }}>
          Musicathon 2026
        </p>
        <h1 className="intro__title">AudioArchitect</h1>
        <p className="intro__subtitle">The room built from sound</p>
        <p className="intro__desc">
          You are trapped in a room constructed entirely from music. One clue
          object is hidden flush against a random surface — your job is to find
          it and decrypt the password to escape before the AI breaks your focus.
        </p>
        <ol className="intro__steps">
          <li>
            <span style={{ color: theme.ui }}>1. Scan</span> — toggle the sonar
            (button or press S) and sweep the room.
          </li>
          <li>
            <span style={{ color: theme.ui }}>2. Reveal</span> — move close to
            the hidden clue until it lights up, then click it.
          </li>
          <li>
            <span style={{ color: theme.ui }}>3. Decrypt</span> — read the
            riddle and type the password into the terminal.
          </li>
        </ol>

        <div className="intro__track">
          <p className="intro__track-label" style={{ color: theme.ui }}>
            Track: {track.title}
            {isSample ? " (sample · fully analyzed)" : " (loaded · lyrics only)"}
          </p>
          {isSample && (
            <p className="intro__track-credit">
              Royalty-free sample · YouTube Audio Library
            </p>
          )}
          <input
            className="intro__track-title"
            type="text"
            list="intro-track-suggestions"
            placeholder="Song title for your uploaded file (for live lyrics)"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
          />
          <datalist id="intro-track-suggestions">
            {SUGGESTED_TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="intro__track-hint">
            Upload a file to play your own song. The title is paired with that
            file to fetch its lyrics — the more accurate the title, the more
            likely you get real synced lyrics (otherwise a sample stream plays).
          </p>
          <div className="intro__track-actions">
            <input
              ref={fileRef}
              className="intro__track-file"
              type="file"
              accept="audio/*"
              onChange={onFile}
            />
            <button
              type="button"
              className="intro__track-choose"
              style={{ borderColor: theme.ui, color: theme.ui }}
              onClick={() => fileRef.current?.click()}
            >
              Choose audio file
            </button>
            <span className="intro__track-filename">
              {fileName || "No file selected"}
            </span>
            {!isSample && (
              <button
                type="button"
                className="intro__track-sample"
                style={{ borderColor: theme.ui, color: theme.ui }}
                onClick={useSample}
              >
                Use sample
              </button>
            )}
          </div>
        </div>

        <p className="intro__analysis" style={{ color: theme.ui }}>
          {!track.analyzable
            ? "Loaded track: building from its live audio (default room signal)."
            : analysis
              ? `Track signal: ${prettyGenre(analysis.genreTags[0] ?? "unknown")}` +
                (visibleMoods.length ? ` · ${visibleMoods.join(", ")}` : "") +
                (analysis.bpm ? ` · ${analysis.bpm} BPM` : "")
              : "Reading the track signal to build your room..."}
        </p>
        <button
          className="intro__start"
          style={{ borderColor: theme.ui, color: theme.ui }}
          onClick={startGame}
        >
          Enter the room
        </button>
      </div>
    </div>
  );
}
