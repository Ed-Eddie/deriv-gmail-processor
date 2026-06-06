import express from "express";
import { handlePubSubPush } from "./gmail/pubsub.js";
import { renewWatchIfNeeded } from "./gmail/watch.js";
import { logger } from "./utils/logger.js";

const app = express();
app.use(express.json());

// Health check for Railway
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Google Pub/Sub push endpoint
app.post("/pubsub/push", handlePubSubPush);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  // Renew Gmail watch on startup if needed
  await renewWatchIfNeeded();
});

// Renew Gmail watch every 24h (expires after 7 days)
setInterval(renewWatchIfNeeded, 24 * 60 * 60 * 1000);
