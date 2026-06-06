-- ─────────────────────────────────────────────
--  Run this in your Supabase SQL editor once
-- ─────────────────────────────────────────────

-- Tracks the Gmail watch expiry and last processed historyId
create table if not exists gmail_watch (
  id          int primary key default 1,
  history_id  text,
  expires_at  timestamptz,
  updated_at  timestamptz default now()
);

-- Constraint: only one row ever
alter table gmail_watch add constraint gmail_watch_single_row check (id = 1);

-- Logs every processed email and its extraction result
create table if not exists email_logs (
  id                 uuid primary key default gen_random_uuid(),
  gmail_message_id   text unique not null,
  sender_email       text,
  subject            text,
  received_at        timestamptz,
  raw_body           text,
  extracted_data     jsonb,
  webhook_status     text default 'pending',   -- pending | sent | failed
  webhook_response   text,
  created_at         timestamptz default now()
);

-- Indexes for common queries
create index if not exists email_logs_sender_idx        on email_logs (sender_email);
create index if not exists email_logs_webhook_status_idx on email_logs (webhook_status);
create index if not exists email_logs_received_at_idx   on email_logs (received_at desc);

-- Optional: view for quick inspection of failed webhooks
create or replace view failed_webhooks as
  select id, sender_email, subject, received_at, webhook_response
  from email_logs
  where webhook_status = 'failed'
  order by received_at desc;
