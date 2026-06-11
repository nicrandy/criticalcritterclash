-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Security hardening
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- AFTER re-running setup_scores.sql (which now clamps the score RPC inputs).
--
-- Everything here targets objects that only exist in Supabase (the `battles`
-- analytics table and the `award_battle_xp` RPC), so it lives in its own
-- script rather than setup_scores.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. battles: sanity-check anonymous inserts ───────────────────────────────
-- The game inserts one row per finished battle with the anon key. Without a
-- policy, a script can flood the table with arbitrarily large rows. This
-- policy rejects rows that no legitimate battle could produce.

ALTER TABLE battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_sane_battles" ON battles;
CREATE POLICY "anon_insert_sane_battles" ON battles
  FOR INSERT
  WITH CHECK (
    stage        BETWEEN 1 AND 100
    AND death_count  BETWEEN 0 AND 100
    AND total_rounds BETWEEN 1 AND 200
    AND jsonb_array_length(rounds) <= 200
    AND p_max_hp  BETWEEN 1 AND 1000
    AND ai_max_hp BETWEEN 1 AND 1000
    AND winner IN ('player', 'ai')
  );

-- No SELECT policy: analytics rows stay private to the dashboard/service role.

-- ── 2. award_battle_xp: clamp the stage input ────────────────────────────────
-- The function itself was created in the Supabase dashboard and is not in this
-- repo, so it cannot be CREATE OR REPLACE'd here without risking drift from
-- the live definition. Instead, add these two lines at the TOP of the existing
-- function body (Dashboard → Database → Functions → award_battle_xp → Edit):
--
--   p_stage   := LEAST(GREATEST(p_stage, 1), 30);
--   -- p_is_boss is already a boolean; nothing to clamp.
--
-- This caps a single forged call at 90 XP (stage 30 boss) instead of letting
-- one request max out a critter's level.
