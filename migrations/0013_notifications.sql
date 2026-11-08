-- Notification tables (platform migration 0013, D16 spec 15).
-- The channel type was created by platform migration 0001; create it here only when missing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE public.notification_channel AS ENUM ('inapp', 'email');
  END IF;
END
$$;

-- 9A: in-app notifications, preferences, and the email queue (D125).
-- pg-boss is deferred to 6B. 0010–0012 may already exist; files run by name.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_read_idx
  ON public.notifications (user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  channel public.notification_channel NOT NULL,
  enabled boolean NOT NULL,
  PRIMARY KEY (user_id, type, channel)
);

CREATE TABLE IF NOT EXISTS public.notification_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  batch_key text,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  locale text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  send_after timestamptz NOT NULL,
  sent_at timestamptz,
  error text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  CHECK (attempts BETWEEN 0 AND 5),
  CHECK (locale IN ('en', 'ru'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_emails_pending_batch_idx
  ON public.notification_emails (batch_key)
  WHERE batch_key IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS notification_emails_due_idx
  ON public.notification_emails (status, send_after);

SELECT public.enable_rls_deny_all('public.notifications');
SELECT public.enable_rls_deny_all('public.notification_preferences');
SELECT public.enable_rls_deny_all('public.notification_emails');

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.notifications, public.notification_preferences, public.notification_emails
  TO app_rw;
