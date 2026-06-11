-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: award_battle_xp crashes with `column reference "stamina" is ambiguous`
-- (Postgres 42702) whenever a win would cause a LEVEL-UP, because the
-- RETURNS TABLE output names (strength/health/stamina) collide with the
-- critters table's column names inside the function body. Result: the first
-- few XP land, then every win that crosses a level threshold silently rolls
-- back and the critter is stuck (e.g. EmberBear168136 frozen at 2 XP).
--
-- This rewrite uses v_-prefixed locals and table-qualified columns throughout,
-- so nothing is ambiguous. Run in the Supabase SQL editor.
--
-- Behaviour (matches the documented design + client display):
--   gain      = stage × 2, ×1.5 on boss stages
--   level     = floor(sqrt(xp / 5)) + 1
--   level-up  → +1 to one random stat, capped at 9 (the card UI shows 9 pips)
--   p_stage is clamped 1–30 server-side (forged-request guard), so the
--   manual clamp suggested in harden_security.sql §2 is included here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION award_battle_xp(p_critter_id TEXT, p_stage INT, p_is_boss BOOLEAN)
RETURNS TABLE (
  new_xp INT, new_level INT, leveled_up BOOLEAN, boosted_stat TEXT,
  strength INT, health INT, stamina INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gain      INT;
  v_old_level INT;
  v_xp        INT;
  v_level     INT;
  v_stat      TEXT := NULL;
  v_str       INT;
  v_hp        INT;
  v_def       INT;
BEGIN
  p_stage := LEAST(GREATEST(p_stage, 1), 30);

  SELECT c.xp, c.level, c.strength, c.health, c.stamina
    INTO v_xp, v_old_level, v_str, v_hp, v_def
    FROM critters c
   WHERE c.id = p_critter_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_gain  := ROUND(p_stage * 2 * (CASE WHEN p_is_boss THEN 1.5 ELSE 1.0 END))::INT;
  v_xp    := COALESCE(v_xp, 0) + v_gain;
  v_level := FLOOR(SQRT(v_xp / 5.0))::INT + 1;

  IF v_level > COALESCE(v_old_level, 1) THEN
    v_stat := (ARRAY['strength','health','stamina'])[1 + FLOOR(RANDOM() * 3)::INT];
    IF    v_stat = 'strength' THEN v_str := LEAST(9, v_str + 1);
    ELSIF v_stat = 'health'   THEN v_hp  := LEAST(9, v_hp + 1);
    ELSE                           v_def := LEAST(9, v_def + 1);
    END IF;
  END IF;

  UPDATE critters c
     SET xp = v_xp, level = v_level,
         strength = v_str, health = v_hp, stamina = v_def
   WHERE c.id = p_critter_id;

  RETURN QUERY SELECT v_xp, v_level, (v_stat IS NOT NULL), v_stat, v_str, v_hp, v_def;
END;
$$;

GRANT EXECUTE ON FUNCTION award_battle_xp(TEXT, INT, BOOLEAN) TO anon;
