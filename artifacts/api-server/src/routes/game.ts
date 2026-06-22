import { Router, type IRouter } from "express";
import { GameOverBody, GameOverResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * POST /api/game-over
 *
 * Receives end-of-game player stats and forwards them to an n8n webhook.
 *
 * --- INTEGRATION SWAP POINT (n8n) ---
 * Today this runs in "mock mode": if no N8N_WEBHOOK_URL is configured, the
 * stats are validated and echoed back without any outbound request. To go
 * live, set the N8N_WEBHOOK_URL environment variable to the n8n production
 * webhook URL. No code change is required — the handler will start POSTing
 * the player stats payload to that URL automatically.
 */
router.post("/game-over", async (req, res) => {
  // Validate the incoming payload against the generated Zod schema.
  const parsed = GameOverBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid game-over payload" });
    return;
  }

  const stats = parsed.data;
  const webhookUrl = process.env["N8N_WEBHOOK_URL"];

  // Mock mode: no webhook configured yet. Accept and echo back.
  if (!webhookUrl) {
    req.log.info({ stats }, "game-over received (mock mode, no n8n webhook)");
    const data = GameOverResponse.parse({
      received: true,
      forwarded: false,
      message: "Stats received (mock mode). Set N8N_WEBHOOK_URL to forward.",
    });
    res.json(data);
    return;
  }

  // Live mode: forward the stats to the configured n8n webhook.
  try {
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clearTime: stats.clearTimeSeconds,
        song: stats.song,
        status: stats.status,
        genre: stats.genre ?? null,
        submittedAt: new Date().toISOString(),
      }),
    });

    const forwarded = upstream.ok;
    req.log.info({ stats, forwarded, upstreamStatus: upstream.status }, "game-over forwarded to n8n");

    const data = GameOverResponse.parse({
      received: true,
      forwarded,
      message: forwarded
        ? "Stats forwarded to n8n webhook."
        : `n8n webhook returned status ${upstream.status}.`,
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to forward game-over stats to n8n");
    const data = GameOverResponse.parse({
      received: true,
      forwarded: false,
      message: "Stats received but forwarding to n8n failed.",
    });
    res.json(data);
  }
});

export default router;
