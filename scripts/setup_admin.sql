-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Admin portal setup
-- Run this in the Supabase SQL editor.
--
-- ALSO REQUIRED (dashboard, one time):
--   Authentication → Users → Add user →
--     email: nicholasresch@gmail.com, set a password, tick "Auto Confirm User"
-- That account is the admin login for /admin on the site. The policies below
-- are what actually enforce admin rights, keyed to that email.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Photo column on critters ───────────────────────────────────────────────
ALTER TABLE critters ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ── 2. Critters: public read, admin-only write ────────────────────────────────
-- (RLS is already enabled on critters; these policies are idempotent.)
ALTER TABLE critters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_critters" ON critters;
CREATE POLICY "public_read_critters" ON critters
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_update_critters" ON critters;
CREATE POLICY "admin_update_critters" ON critters
  FOR UPDATE
  USING      (auth.jwt()->>'email' = 'nicholasresch@gmail.com')
  WITH CHECK (auth.jwt()->>'email' = 'nicholasresch@gmail.com');

-- ── 3. Storage bucket for critter photos ─────────────────────────────────────
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
    AND auth.jwt()->>'email' = 'nicholasresch@gmail.com'
  );

DROP POLICY IF EXISTS "admin_update_critter_photos" ON storage.objects;
CREATE POLICY "admin_update_critter_photos" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'critter-photos'
    AND auth.jwt()->>'email' = 'nicholasresch@gmail.com'
  )
  WITH CHECK (
    bucket_id = 'critter-photos'
    AND auth.jwt()->>'email' = 'nicholasresch@gmail.com'
  );
