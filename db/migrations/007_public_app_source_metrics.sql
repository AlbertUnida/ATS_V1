BEGIN;

ALTER TABLE public_applications_log
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_details JSONB;

UPDATE public_applications_log
SET source = COALESCE(source, 'portal_publico');

UPDATE public_applications_log
SET source_details = jsonb_strip_nulls(jsonb_build_object(
    'channel', COALESCE(source, 'portal_publico'),
    'ip', ip::text,
    'userAgent', user_agent
  ))
WHERE source_details IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_app_log_source ON public_applications_log(source);

COMMIT;
