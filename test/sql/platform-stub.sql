-- Platform pieces notifications needs. CI only; the real ones belong to the platform.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN CREATE ROLE app_rw; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- As on Supabase: API roles can reach the public schema; RLS decides the rows.
GRANT USAGE ON SCHEMA public TO app_rw, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid uuid UNIQUE,
  status text NOT NULL DEFAULT 'active',
  locale text NOT NULL DEFAULT 'en',
  terms_accepted_at timestamptz,
  terms_version text
);

CREATE TABLE IF NOT EXISTS public.telegram_accounts (
  telegram_id bigint PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE
);

-- Same helpers as platform migration 0001.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO app_rw;

-- Same helper as platform migration 0001.
CREATE OR REPLACE FUNCTION public.enable_rls_deny_all(target regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  short_name text;
BEGIN
  SELECT c.relname INTO short_name FROM pg_class c WHERE c.oid = target;
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', target);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO anon, authenticated, app_rw',
    target
  );
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short_name || '_app_rw_all', target);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO app_rw USING (true) WITH CHECK (true)',
    short_name || '_app_rw_all',
    target
  );
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short_name || '_anon_deny', target);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO anon USING (false) WITH CHECK (false)',
    short_name || '_anon_deny',
    target
  );
  EXECUTE format(
    'DROP POLICY IF EXISTS %I ON %s',
    short_name || '_authenticated_deny',
    target
  );
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO authenticated USING (false) WITH CHECK (false)',
    short_name || '_authenticated_deny',
    target
  );
END;
$$;
