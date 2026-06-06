import { getGmailClient } from "./auth.js";
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

/**
 * Register Gmail push notifications via Google Pub/Sub.
 * Must be called once to set up, then renewed every <7 days.
 */
export async function registerGmailWatch() {
  const gmail = getGmailClient();

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.PUBSUB_TOPIC, // e.g. projects/my-project/topics/gmail-push
      labelIds: ["INBOX"],
    },
  });

  const expiration = new Date(Number(res.data.expiration));
  logger.info(`Gmail watch registered. Expires: ${expiration.toISOString()}`);

  // Store expiration in Supabase so we know when to renew
  await supabase
    .from("gmail_watch")
    .upsert({ id: 1, history_id: res.data.historyId, expires_at: expiration.toISOString() });

  return res.data;
}

/**
 * Renew the watch only if it expires within 24h or doesn't exist.
 */
export async function renewWatchIfNeeded() {
  try {
    const { data } = await supabase
      .from("gmail_watch")
      .select("expires_at")
      .eq("id", 1)
      .single();

    const now = new Date();
    const expiresAt = data?.expires_at ? new Date(data.expires_at) : null;
    const hoursLeft = expiresAt ? (expiresAt - now) / 3_600_000 : 0;

    if (!expiresAt || hoursLeft < 24) {
      logger.info("Renewing Gmail watch...");
      await registerGmailWatch();
    } else {
      logger.info(`Gmail watch valid for ${hoursLeft.toFixed(1)}h`);
    }
  } catch (err) {
    logger.error("Failed to renew Gmail watch", err);
  }
}
