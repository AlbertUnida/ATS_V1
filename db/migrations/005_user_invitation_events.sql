BEGIN;

CREATE TABLE IF NOT EXISTS user_invitation_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT,
  accept_url TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reused_existing BOOLEAN NOT NULL DEFAULT FALSE,
  email_delivery_attempted BOOLEAN NOT NULL DEFAULT FALSE,
  email_delivery_success BOOLEAN,
  email_delivery_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_invitation_events_user_id ON user_invitation_events(user_id);

COMMIT;
