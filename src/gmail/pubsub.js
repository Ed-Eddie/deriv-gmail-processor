import { getGmailClient } from "./auth.js";
import { extractData } from "./extractor.js";
import { forwardToWebhook } from "../utils/webhook.js";
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

// Only process emails from this sender (set in .env)
const ALLOWED_SENDER = process.env.ALLOWED_SENDER_EMAIL?.toLowerCase();

/**
 * Entry point for Google Pub/Sub push messages.
 * Google sends a POST with a base64-encoded notification body.
 */
export async function handlePubSubPush(req, res) {
  // Acknowledge immediately — Google will retry if we don't respond fast
  // ── ADD THIS BLOCK ──
  logger.info("Pub/Sub push received");
  logger.info("Headers: " + JSON.stringify(req.headers, null, 2));
  logger.info("Body: " + JSON.stringify(req.body, null, 2));
  // ───────────────────
  
  res.sendStatus(204);

  try {
    const message = req.body?.message;
    if (!message?.data) {
      logger.warn("Pub/Sub message missing data field");
      return;
    }

    // Decode the Pub/Sub notification
    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
    const { emailAddress, historyId } = decoded;

    logger.info(`Pub/Sub notification for ${emailAddress}, historyId: ${historyId}`);

    await processNewMessages(historyId);
  } catch (err) {
    logger.error("Error handling Pub/Sub push", err);
  }
}

/**
 * Fetch new messages since the last known historyId, filter by sender,
 * extract data, and forward to the webhook.
 */
async function processNewMessages(newHistoryId) {
  const gmail = getGmailClient();

  // Get last processed historyId from DB
  const { data: watchRow } = await supabase
    .from("gmail_watch")
    .select("history_id")
    .eq("id", 1)
    .single();

  const startHistoryId = watchRow?.history_id;
  if (!startHistoryId) {
    logger.warn("No stored historyId — skipping this push");
    return;
  }

  // Fetch message history since last check
  let historyRes;
  try {
    historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });
  } catch (err) {
    logger.error("Gmail history.list failed", err);
    return;
  }

  const histories = historyRes.data.history || [];
  const messageIds = [];

  for (const record of histories) {
    for (const added of record.messagesAdded || []) {
      messageIds.push(added.message.id);
    }
  }

  logger.info(`Found ${messageIds.length} new message(s)`);

  for (const msgId of messageIds) {
    await processMessage(gmail, msgId);
  }

  // Update stored historyId
  await supabase
    .from("gmail_watch")
    .update({ history_id: newHistoryId })
    .eq("id", 1);
}

async function processMessage(gmail, messageId) {
  // Check if already processed (idempotency)
  const { data: existing } = await supabase
    .from("email_logs")
    .select("id")
    .eq("gmail_message_id", messageId)
    .single();

  if (existing) {
    logger.info(`Message ${messageId} already processed — skipping`);
    return;
  }

  // Fetch full message
  const msgRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const msg = msgRes.data;
  const headers = msg.payload?.headers || [];

  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const from = getHeader("From");
  const subject = getHeader("Subject");
  const date = getHeader("Date");
  const senderEmail = extractEmailAddress(from);

  logger.info(`Message from: ${senderEmail} | Subject: ${subject}`);

  // Filter: only process emails from the allowed sender
  if (ALLOWED_SENDER && senderEmail.toLowerCase() !== ALLOWED_SENDER) {
    logger.info(`Ignoring email from ${senderEmail} (not allowed sender)`);
    return;
  }

  // Decode email body
  const body = decodeMessageBody(msg.payload);

  // Extract structured data using regex patterns
  const extracted = extractData(body, subject);

  // Log to Supabase
  const { data: logRow } = await supabase
    .from("email_logs")
    .insert({
      gmail_message_id: messageId,
      sender_email: senderEmail,
      subject,
      received_at: new Date(date).toISOString(),
      raw_body: body,
      extracted_data: extracted,
      webhook_status: "pending",
    })
    .select()
    .single();

  // Forward to webhook
  const webhookResult = await forwardToWebhook(extracted, {
    messageId,
    sender: senderEmail,
    subject,
    receivedAt: date,
  });

  // Update log with webhook result
  await supabase
    .from("email_logs")
    .update({
      webhook_status: webhookResult.success ? "sent" : "failed",
      webhook_response: webhookResult.body,
    })
    .eq("id", logRow.id);
}

/**
 * Recursively decode the Gmail message body (handles multipart).
 */
function decodeMessageBody(payload) {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }

  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    const part = textPart || htmlPart;
    if (part) return decodeMessageBody(part);

    // Recurse into nested parts
    return payload.parts.map(decodeMessageBody).join("\n");
  }

  return "";
}

function extractEmailAddress(from) {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from.trim();
}
