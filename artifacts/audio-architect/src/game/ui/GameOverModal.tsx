import { useEffect, useRef } from "react";
import { useGameOver } from "@workspace/api-client-react";
import { useGame } from "../state/GameProvider";

/**
 * Win/over screen. On show, it fires the `/api/game-over` webhook exactly once
 * via the generated `useGameOver` mutation. The Express route forwards the
 * payload to n8n (or runs in mock mode if no webhook URL is configured).
 */
export function GameOverModal() {
  const { phase, result, elapsedSeconds, genre, theme, resetGame, track } =
    useGame();
  const { mutate, status } = useGameOver();
  const sentRef = useRef(false);

  // Fire the webhook once when we enter the "over" phase.
  useEffect(() => {
    if (phase !== "over" || sentRef.current) return;
    sentRef.current = true;
    mutate({
      data: {
        status: result ?? "failed",
        clearTimeSeconds: Math.round(elapsedSeconds),
        genre,
        song: track.title,
      },
    });
  }, [phase, result, elapsedSeconds, genre, track.title, mutate]);

  // Allow the webhook to fire again on the next run.
  useEffect(() => {
    if (phase === "playing") sentRef.current = false;
  }, [phase]);

  if (phase !== "over") return null;

  const escaped = result === "escaped";
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = Math.round(elapsedSeconds % 60);

  return (
    <div className="modal">
      <div className="modal__card" style={{ borderColor: theme.ui }}>
        <h2 className="modal__title" style={{ color: theme.ui }}>
          {escaped ? "ROOM ESCAPED" : "SESSION ENDED"}
        </h2>
        <p className="modal__line">
          {escaped
            ? "You revealed the hidden clue, cracked the password, and broke the loop."
            : "The room keeps its secrets... for now."}
        </p>
        <dl className="modal__stats">
          <div>
            <dt>Time</dt>
            <dd>
              {mins}:{secs.toString().padStart(2, "0")}
            </dd>
          </div>
          <div>
            <dt>Mood</dt>
            <dd>{genre}</dd>
          </div>
          <div>
            <dt>Webhook</dt>
            <dd>
              {status === "pending"
                ? "sending..."
                : status === "success"
                  ? "logged"
                  : status === "error"
                    ? "failed"
                    : "idle"}
            </dd>
          </div>
        </dl>
        <button
          className="modal__btn"
          style={{ borderColor: theme.ui, color: theme.ui }}
          onClick={resetGame}
        >
          Re-enter the room
        </button>
      </div>
    </div>
  );
}
