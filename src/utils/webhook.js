import { logger } from "./logger.js";

const WEBHOOK_URL = process.env.TARGET_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TARGET_WEBHOOK_SECRET; // optional shared secret

/**
 * POST extracted email data to the target webhook server.
 *
 * @param {object} extracted  - output of extractData()
 * @param {object} meta       - messageId, sender, subject, receivedAt
 */
export async function forwardToWebhook(extracted, meta) {
  if (!WEBHOOK_URL) {
    logger.warn("TARGET_WEBHOOK_URL not set — skipping webhook forward");
    return { success: false, body: "no webhook url configured" };
  }

  const payload = {
    // ── Top-level metadata ──
    message_id: meta.messageId,
    sender:     meta.sender,
    subject:    meta.subject,
    received_at: meta.receivedAt,

    // ── Extracted fields ──
    data: extracted,
  };

  const headers = {
    "Content-Type": "application/json",
    ...(WEBHOOK_SECRET && { "X-Webhook-Secret": WEBHOOK_SECRET }),
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    const body = await res.text();
    logger.info(`Webhook responded ${res.status}: ${body.slice(0, 200)}`);
    return { success: res.ok, body };
  } catch (err) {
    logger.error("Webhook request failed", err);
    return { success: false, body: err.message };
  }
}
