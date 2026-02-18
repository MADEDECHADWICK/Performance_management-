type WebhookPayload = Record<string, unknown>;

const resolveWebhookUrl = () =>
  process.env.WEBHOOK_EVALUATIONS_URL || process.env.EVALUATION_WEBHOOK_URL;

export const emitWebhook = async (event: string, payload: WebhookPayload) => {
  const url = resolveWebhookUrl();
  if (!url) return;

  if (typeof fetch !== "function") {
    console.warn("Webhook emit skipped: fetch is not available in this runtime.");
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
    console.error("Failed to emit webhook event:", event, error);
  }
};
