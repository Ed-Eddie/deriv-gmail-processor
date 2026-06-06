# Gmail Push → Webhook Processor

Receives Gmail push notifications via Google Pub/Sub, filters emails by sender, extracts data using regex, forwards to a webhook, and logs everything to Supabase. Hosted on Railway.

---

## Architecture

```
Gmail Inbox
    │  (new email arrives)
    ▼
Google Pub/Sub Topic
    │  (push HTTP POST)
    ▼
Railway Server  ──► Regex Extractor ──► Target Webhook
    │
    ▼
Supabase (email_logs table)
```

---

## Setup — Step by Step

### 1. Google Cloud Console

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable **Gmail API** and **Cloud Pub/Sub API**

#### Create OAuth2 Credentials
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Add `http://localhost:3001/oauth2callback` to Authorized redirect URIs
7. Copy `Client ID` and `Client Secret` → `.env`

#### Create Pub/Sub Topic
8. Go to **Pub/Sub → Topics → Create Topic**
9. Topic ID: `gmail-push` (or any name)
10. Copy the full topic name (e.g. `projects/my-project/topics/gmail-push`) → `.env`

#### Grant Gmail permission to publish to the topic
11. On the topic page → **Permissions → Add Principal**
12. Principal: `gmail-api-push@system.gserviceaccount.com`
13. Role: **Pub/Sub Publisher**

#### Create Pub/Sub Push Subscription
14. Go to **Pub/Sub → Subscriptions → Create Subscription**
15. Subscription ID: `gmail-push-sub`
16. Select your topic
17. Delivery type: **Push**
18. Endpoint URL: `https://YOUR_RAILWAY_URL/pubsub/push`
   *(You'll fill this in after deploying to Railway)*

---

### 2. Get Your Google Refresh Token (local, one-time)

```bash
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

npm install
npm run get-token
```

Follow the URL printed in the terminal, authenticate, paste the code back.
Copy the `GOOGLE_REFRESH_TOKEN` printed → `.env`

---

### 3. Supabase

1. Go to https://supabase.com → create a project
2. Go to **SQL Editor** → paste and run the contents of `sql/schema.sql`
3. Go to **Project Settings → API**:
   - Copy **Project URL** → `SUPABASE_URL` in `.env`
   - Copy **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` in `.env`

---

### 4. Configure Extraction Patterns

Edit `src/gmail/extractor.js` — the `PATTERNS` object:

```js
const PATTERNS = {
  reference_number: /(?:ref(?:erence)?|id|#)[:\s]+([A-Z0-9\-]+)/i,
  amount:           /(?:amount|total|sum)[:\s]*\$?([\d,]+\.?\d{0,2})/i,
  // add your own fields here...
};
```

Each key becomes a field in the JSON sent to your webhook. The regex must have **one capture group** `(...)`.

---

### 5. Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

railway login
railway init          # link to a new Railway project
railway up            # deploy
```

Or connect your GitHub repo in the Railway dashboard for auto-deploys.

**Set environment variables in Railway:**
Go to your Railway service → Variables → add all values from `.env.example`

After deploy, copy your Railway public URL and:
- Update the Pub/Sub Push Subscription endpoint to `https://YOUR_RAILWAY_URL/pubsub/push`

---

### 6. Register Gmail Watch

Run this once after deploying (it auto-renews every 24h after that):

```bash
# Locally with your .env filled in:
npm run register-watch

# Or via Railway CLI:
railway run node scripts/register-watch.js
```

---

## Webhook Payload

Your target server will receive a POST like this:

```json
{
  "message_id": "18f3a2b...",
  "sender": "sender@example.com",
  "subject": "Order #12345 Confirmed",
  "received_at": "Fri, 06 Jun 2026 10:30:00 +0000",
  "data": {
    "reference_number": "12345",
    "amount": "1,250.00",
    "customer_name": "Jane Doe",
    "date": "06/06/2026",
    "status": "Confirmed",
    "phone": null,
    "email": null,
    "account_number": null,
    "_matched_fields": ["reference_number", "amount", "customer_name", "date", "status"]
  }
}
```

---

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `gmail_watch` | Stores historyId and watch expiry (single row) |
| `email_logs` | Full log of every processed email + extracted data + webhook result |

View failed webhook deliveries:
```sql
select * from failed_webhooks;
```

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in all values

npm run dev            # starts with --watch (auto-restarts)
```

To simulate a Pub/Sub push locally:
```bash
curl -X POST http://localhost:3000/pubsub/push \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "'$(echo -n '{"emailAddress":"you@gmail.com","historyId":"12345"}' | base64)'"
    }
  }'
```

---

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth2 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3001/oauth2callback` for local token generation |
| `GOOGLE_REFRESH_TOKEN` | Long-lived token from `npm run get-token` |
| `PUBSUB_TOPIC` | Full Pub/Sub topic name |
| `ALLOWED_SENDER_EMAIL` | Only process emails from this address |
| `TARGET_WEBHOOK_URL` | Your server's POST endpoint |
| `TARGET_WEBHOOK_SECRET` | Shared secret sent as `X-Webhook-Secret` header |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
