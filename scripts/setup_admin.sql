-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Admin portal setup
-- Run this in the Supabase SQL editor, replacing YOUR-ADMIN-EMAIL@example.com
-- with the real admin email everywhere. The real email lives ONLY inside
-- Supabase (auth user row, these policies, and is_admin()) — never in the
-- repo or the shipped site code.
--
-- ALSO REQUIRED (dashboard, one time):
--   Authentication → Users → Add user →
--     the admin email, set a password, tick "Auto Confirm User"
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Photo column on critters ───────────────────────────────────────────────
ALTER TABLE critters ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ── 2. Critters: public read, admin-only write ────────────────────────────────
ALTER TABLE critters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_critters" ON critters;
CREATE POLICY "public_read_critters" ON critters
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_update_critters" ON critters;
CREATE POLICY "admin_update_critters" ON critters
  FOR UPDATE
  USING      (auth.jwt()->>'email' = 'YOUR-ADMIN-EMAIL@example.com')
  WITH CHECK (auth.jwt()->>'email' = 'YOUR-ADMIN-EMAIL@example.com');

-- ── 3. is_admin(): lets the site ask "is this session the admin?" ─────────────
-- The admin UI calls this RPC instead of embedding the email client-side.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt()->>'email', '') = 'YOUR-ADMIN-EMAIL@example.com';
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- ── 4. Storage bucket for critter photos ─────────────────────────────────────
-- Public bucket: anyone can view photos (they appear on the public critter
-- pages); only the admin can upload/replace them.
INSERT INTO storage.buckets (id, name, public)
VALUES ('critter-photos', 'critter-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_critter_photos" ON storage.objects;
CREATE POLICY "public_read_critter_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'critter-photos');

DROP POLICY IF EXISTS "admin_insert_critter_photos" ON storage.objects;
CREATE POLICY "admin_insert_critter_photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'critter-photos'
    AND auth.jwt()->>'email' = 'YOUR-ADMIN-EMAIL@example.com'
  );

DROP POLICY IF EXISTS "admin_update_critter_photos" ON storage.objects;
CREATE POLICY "admin_update_critter_photos" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'critter-photos'
    AND auth.jwt()->>'email' = 'YOUR-ADMIN-EMAIL@example.com'
  )
  WITH CHECK (
    bucket_id = 'critter-photos'
    AND auth.jwt()->>'email' = 'YOUR-ADMIN-EMAIL@example.com'
  );
