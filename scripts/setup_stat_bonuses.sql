-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Immutable base stats + JSON level bonuses
-- Run this in the Supabase SQL editor BEFORE deploying the matching site code
-- (the site selects the new stat_bonuses column).
--
-- Principle: strength/health/stamina columns are the PRINTED CARD values and
-- are never modified by gameplay. Level-up rewards accumulate in stat_bonuses
-- (JSONB) with a per-boost history log, so every point is auditable and
-- revertible. Effective in-game stats = base + bonuses.
--
--   stat_bonuses = {
--     "strength": 1, "health": 0, "stamina": 2,
--     "history": [ {"level": 2, "stat": "stamina", "at": "2026-06-11T..."} ]
--   }
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE critters ADD COLUMN IF NOT EXISTS stat_bonuses JSONB NOT NULL
  DEFAULT '{"strength":0,"health":0,"stamina":0,"history":[]}'::jsonb;

-- ── award_battle_xp: arena stage wins ─────────────────────────────────────────
-- Same XP math as before; level-up boosts now go to stat_bonuses only.
-- Returned strength/health/stamina are EFFECTIVE stats (base + bonuses).
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
  v_base_str  INT;
  v_base_hp   INT;
  v_base_def  INT;
  v_bon       JSONB;
BEGIN
  p_stage := LEAST(GREATEST(p_stage, 1), 30);

  SELECT c.xp, c.level, c.strength, c.health, c.stamina,
         COALESCE(c.stat_bonuses, '{"strength":0,"health":0,"stamina":0,"history":[]}'::jsonb)
    INTO v_xp, v_old_level, v_base_str, v_base_hp, v_base_def, v_bon
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
    v_bon  := jsonb_set(v_bon, ARRAY[v_stat],
                to_jsonb(COALESCE((v_bon->>v_stat)::INT, 0) + 1));
    v_bon  := jsonb_set(v_bon, '{history}',
                COALESCE(v_bon->'history', '[]'::jsonb)
                || jsonb_build_object('level', v_level, 'stat', v_stat, 'at', now()));
  END IF;

  UPDATE critters c
     SET xp = v_xp, level = v_level, stat_bonuses = v_bon
   WHERE c.id = p_critter_id;

  RETURN QUERY SELECT v_xp, v_level, (v_stat IS NOT NULL), v_stat,
    v_base_str + COALESCE((v_bon->>'strength')::INT, 0),
    v_base_hp  + COALESCE((v_bon->>'health')::INT, 0),
    v_base_def + COALESCE((v_bon->>'stamina')::INT, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION award_battle_xp(TEXT, INT, BOOLEAN) TO anon;

-- ── claim_idle_battles: idle training ─────────────────────────────────────────
-- Same simulation as before; boosts (one per level gained) go to stat_bonuses.
-- Training battles match on EFFECTIVE power so bonuses count in the sim too.
CREATE OR REPLACE FUNCTION claim_idle_battles(p_critter_id TEXT)
RETURNS TABLE (
  battles_fought INT, wins INT, xp_gained INT,
  new_xp INT, new_level INT, leveled_up BOOLEAN,
  strength INT, health INT, stamina INT,
  log JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now           TIMESTAMPTZ := now();
  v_last          TIMESTAMPTZ;
  v_capped        INTERVAL;
  v_periods       INT;
  v_xp            INT;
  v_old_level     INT;
  v_level         INT;
  v_base_str      INT;
  v_base_hp       INT;
  v_base_def      INT;
  v_bon           JSONB;
  v_power         INT;
  v_wins          INT := 0;
  v_gain          INT := 0;
  v_log           JSONB := '[]'::JSONB;
  v_opp           RECORD;
  v_won           BOOLEAN;
  v_stat          TEXT;
  v_levels_gained INT;
BEGIN
  SELECT c.xp, c.level, c.strength, c.health, c.stamina, c.last_idle_claim,
         COALESCE(c.stat_bonuses, '{"strength":0,"health":0,"stamina":0,"history":[]}'::jsonb)
    INTO v_xp, v_old_level, v_base_str, v_base_hp, v_base_def, v_last, v_bon
    FROM critters c
   WHERE c.id = p_critter_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_capped  := LEAST(v_now - COALESCE(v_last, v_now), INTERVAL '48 hours');
  v_periods := FLOOR(EXTRACT(EPOCH FROM v_capped) / 21600)::INT;   -- 6 h periods

  IF v_periods <= 0 THEN
    RETURN QUERY SELECT 0, 0, 0,
      COALESCE(v_xp, 0), COALESCE(v_old_level, 1), FALSE,
      v_base_str + COALESCE((v_bon->>'strength')::INT, 0),
      v_base_hp  + COALESCE((v_bon->>'health')::INT, 0),
      v_base_def + COALESCE((v_bon->>'stamina')::INT, 0),
      '[]'::JSONB;
    RETURN;
  END IF;

  v_power := v_base_str + v_base_hp + v_base_def
           + COALESCE((v_bon->>'strength')::INT, 0)
           + COALESCE((v_bon->>'health')::INT, 0)
           + COALESCE((v_bon->>'stamina')::INT, 0);

  FOR i IN 1..v_periods LOOP
    SELECT c.id AS id, c.name AS name,
           (c.strength + c.health + c.stamina
            + COALESCE((c.stat_bonuses->>'strength')::INT, 0)
            + COALESCE((c.stat_bonuses->>'health')::INT, 0)
            + COALESCE((c.stat_bonuses->>'stamina')::INT, 0)) AS power
      INTO v_opp
      FROM critters c
     WHERE c.id <> p_critter_id
     ORDER BY random()
     LIMIT 1;

    IF v_opp.id IS NULL THEN
      v_won := (v_power + random() * 12) >= (v_power + random() * 12);
      v_log := v_log || jsonb_build_object('opponent', 'Wild Shadow', 'won', v_won);
    ELSE
      v_won := (v_power + random() * 12) >= (v_opp.power + random() * 12);
      v_log := v_log || jsonb_build_object(
        'opponent', COALESCE(v_opp.name, 'Critter #' || v_opp.id), 'won', v_won);
    END IF;

    IF v_won THEN
      v_wins := v_wins + 1;
      v_gain := v_gain + 3;
    ELSE
      v_gain := v_gain + 1;
    END IF;
  END LOOP;

  v_xp    := COALESCE(v_xp, 0) + v_gain;
  v_level := FLOOR(SQRT(v_xp / 5.0))::INT + 1;
  v_levels_gained := GREATEST(0, v_level - COALESCE(v_old_level, 1));

  FOR i IN 1..v_levels_gained LOOP
    v_stat := (ARRAY['strength','health','stamina'])[1 + FLOOR(RANDOM() * 3)::INT];
    v_bon  := jsonb_set(v_bon, ARRAY[v_stat],
                to_jsonb(COALESCE((v_bon->>v_stat)::INT, 0) + 1));
    v_bon  := jsonb_set(v_bon, '{history}',
                COALESCE(v_bon->'history', '[]'::jsonb)
                || jsonb_build_object('level', v_old_level + i, 'stat', v_stat, 'at', now()));
  END LOOP;

  UPDATE critters c
     SET xp = v_xp, level = v_level, stat_bonuses = v_bon,
         last_idle_claim = v_now - (v_capped - (v_periods * INTERVAL '6 hours'))
   WHERE c.id = p_critter_id;

  RETURN QUERY SELECT v_periods, v_wins, v_gain,
    v_xp, v_level, (v_levels_gained > 0),
    v_base_str + COALESCE((v_bon->>'strength')::INT, 0),
    v_base_hp  + COALESCE((v_bon->>'health')::INT, 0),
    v_base_def + COALESCE((v_bon->>'stamina')::INT, 0),
    v_log;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_idle_battles(TEXT) TO anon;

-- ── One-time cleanup: restore printed stats on the 3 mutated cards ───────────
-- Old level-ups (before this migration) wrote directly into the base columns.
-- Printed values confirmed against the physical cards on 2026-06-11:
UPDATE critters SET strength = 6, health = 5, stamina = 4 WHERE id = 'JH99G3RN';  -- "Test" (EmberBear168136)
UPDATE critters SET strength = 9, health = 9, stamina = 8 WHERE id = 'FYYMMG5Y';  -- ChaoticOmen673177 (no-op: its boost hit the 9 cap)
UPDATE critters SET strength = 6, health = 6, stamina = 4 WHERE id = '521GVL8I';  -- GildedWraith777595
