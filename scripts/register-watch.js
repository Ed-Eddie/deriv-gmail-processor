/**
 * Run this ONCE after deploying to Railway to register the Gmail push watch.
 * The server also auto-renews it every 24h, so you won't need to run this again.
 *
 * Usage:
 *   node scripts/register-watch.js
 */

import "dotenv/config";
import { registerGmailWatch } from "../src/gmail/watch.js";

registerGmailWatch()
  .then((data) => {
    console.log("✅ Gmail watch registered:", data);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
