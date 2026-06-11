-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Global Score Tables
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alignment_scores (
  alignment     TEXT        PRIMARY KEY,   -- 'good' | 'evil'
  total_points  BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guild_scores (
  guild         TEXT        PRIMARY KEY,   -- 'rabbit' | 'fox' | 'squirrel' | 'rogue'
  total_points  BIGINT      NOT NULL DEFAULT 0
);

-- ── 2. Seed rows ──────────────────────────────────────────────────────────────

INSERT INTO alignment_scores (alignment, total_points)
VALUES ('good', 0), ('evil', 0)
ON CONFLICT (alignment) DO NOTHING;

INSERT INTO guild_scores (guild, total_points)
VALUES ('rabbit', 0), ('fox', 0), ('squirrel', 0), ('rogue', 0)
ON CONFLICT (guild) DO NOTHING;

-- ── 3. Atomic increment functions (SECURITY DEFINER bypasses RLS safely) ──────
-- p_points is clamped server-side: the client only ever sends 1–3 per stage
-- win, so anything outside that range is a forged request, not a bug.

CREATE OR REPLACE FUNCTION add_alignment_points(p_alignment TEXT, p_points INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_alignment NOT IN ('good', 'evil') THEN
    RETURN;
  END IF;
  UPDATE alignment_scores
  SET total_points = total_points + LEAST(GREATEST(p_points, 1), 3)
  WHERE alignment = p_alignment;
END;
$$;

CREATE OR REPLACE FUNCTION add_guild_points(p_guild TEXT, p_points INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_guild NOT IN ('rabbit', 'fox', 'squirrel', 'rogue') THEN
    RETURN;
  END IF;
  UPDATE guild_scores
  SET total_points = total_points + LEAST(GREATEST(p_points, 1), 3)
  WHERE guild = p_guild;
END;
$$;

-- Allow the anon key to call the RPC functions
GRANT EXECUTE ON FUNCTION add_alignment_points(TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION add_guild_points(TEXT, INT)     TO anon;

-- ── 4. Row-level security (read-only for public; writes go through RPC) ───────

ALTER TABLE alignment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_scores     ENABLE ROW LEVEL SECURITY;

-- Anyone can read the scores (future leaderboard)
CREATE POLICY "public_read_alignment" ON alignment_scores
  FOR SELECT USING (true);

CREATE POLICY "public_read_guild" ON guild_scores
  FOR SELECT USING (true);

-- No direct INSERT/UPDATE/DELETE from the client — only through the functions above
