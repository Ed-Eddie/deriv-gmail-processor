/**
 * Run this script ONCE locally to generate your Google OAuth refresh token.
 * You only need to run this once — save the refresh token in your .env.
 *
 * Usage:
 *   node scripts/get-refresh-token.js
 */

import { google } from "googleapis";
import readline from "readline";
import "dotenv/config";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // must be http://localhost:3001/oauth2callback for local use
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // force refresh_token in response
});

console.log("\n──────────────────────────────────────────");
console.log("1. Open this URL in your browser:");
console.log(authUrl);
console.log("\n2. Authenticate and paste the code below");
console.log("──────────────────────────────────────────\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Enter the code from the redirect URL: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\n✅ Success! Add this to your .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    if (!tokens.refresh_token) {
      console.warn("\n⚠️  No refresh_token returned. Go to https://myaccount.google.com/permissions, revoke access, and run this script again.");
    }
  } catch (err) {
    console.error("❌ Failed to exchange code:", err.message);
  }
});
