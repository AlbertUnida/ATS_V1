BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_created_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_invitation_created_by_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_invitation_created_by_fkey
      FOREIGN KEY (invitation_created_by)
      REFERENCES users(user_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_users_invitation_token_hash ON users (invitation_token_hash);
CREATE INDEX IF NOT EXISTS idx_users_invitation_expires_at ON users (invitation_expires_at);

ALTER TABLE users VALIDATE CONSTRAINT users_invitation_created_by_fkey;

COMMIT;
