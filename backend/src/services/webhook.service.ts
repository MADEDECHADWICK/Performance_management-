import { logger, toLogContext } from "../lib/logger";

type WebhookPayload = Record<string, unknown>;

const resolveWebhookUrl = () =>
  process.env.WEBHOOK_EVALUATIONS_URL || process.env.EVALUATION_WEBHOOK_URL;

export const emitWebhook = async (event: string, payload: WebhookPayload) => {
  const url = resolveWebhookUrl();
  if (!url) return;

  if (typeof fetch !== "function") {
    logger.warn("webhook_emit_skipped", {
      reason: "fetch_unavailable",
      event,
    });
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event,
        payload,
        emittedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    logger.error("webhook_emit_failed", {
      event,
      ...toLogContext(error),
    });
  }
};
