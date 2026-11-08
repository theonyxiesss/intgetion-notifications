-- Email locales for notification_emails: final list from platform migrations 0034-0045.
ALTER TABLE public.notification_emails
  DROP CONSTRAINT IF EXISTS notification_emails_locale_check;
ALTER TABLE public.notification_emails
  ADD CONSTRAINT notification_emails_locale_check CHECK (locale IN ('en', 'ru', 'es', 'pt-BR', 'de', 'fr', 'it'));
