-- Migration 0025: Telegram as a notification channel (D236-D238).

ALTER TYPE public.notification_channel ADD VALUE IF NOT EXISTS 'telegram';

-- When the Telegram dispatcher looked at this notification (sent or not).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS telegram_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_telegram_pending_idx
  ON public.notifications (created_at)
  WHERE telegram_checked_at IS NULL;
