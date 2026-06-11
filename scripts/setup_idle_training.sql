-- ─────────────────────────────────────────────────────────────────────────────
-- Critical Critter Clash — Idle training ("while you were away" battles)
-- Run this in the Supabase SQL editor.
--
-- Design: lazy claim, no cron. Every 6 hours of real time banks one training
-- battle, capped at 48 hours (8 battles) so absences don't accumulate forever.
-- When a card is scanned/viewed, claim_idle_battles() resolves the banked
-- battles server-side: each one pits the critter against a random critter
-- from the roster (total power + a dice swing decides it), awarding
-- 3 XP per win and 1 XP for showing up. Level-ups use the same curve and
-- +1-random-stat (capped at 9) rule as award_battle_xp.
--
-- Cheat-proof by construction: all timing, matchmaking, rolls, and XP are
-- computed inside this SECURITY DEFINER function; the client only triggers it.
-- Leftover time below 6 h is preserved, so claiming never wastes progress.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE critters ADD COLUMN IF NOT EXISTS last_idle_claim TIMESTAMPTZ NOT NULL DEFAULT now();

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
  v_str           INT;
  v_hp            INT;
  v_def           INT;
  v_power         INT;
  v_wins          INT := 0;
  v_gain          INT := 0;
  v_log           JSONB := '[]'::JSONB;
  v_opp           RECORD;
  v_won           BOOLEAN;
  v_stat          TEXT;
  v_levels_gained INT;
BEGIN
  SELECT c.xp, c.level, c.strength, c.health, c.stamina, c.last_idle_claim
    INTO v_xp, v_old_level, v_str, v_hp, v_def, v_last
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
      v_str, v_hp, v_def, '[]'::JSONB;
    RETURN;
  END IF;

  v_power := v_str + v_hp + v_def;

  -- One training battle per banked period: total power + 0–12 dice swing
  FOR i IN 1..v_periods LOOP
    SELECT c.id AS id, c.name AS name, (c.strength + c.health + c.stamina) AS power
      INTO v_opp
      FROM critters c
     WHERE c.id <> p_critter_id
     ORDER BY random()
     LIMIT 1;

    IF v_opp.id IS NULL THEN
      -- Roster of one: spar against an equal-power phantom
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

  -- +1 random stat per level gained, capped at 9 (matches award_battle_xp)
  FOR i IN 1..v_levels_gained LOOP
    v_stat := (ARRAY['strength','health','stamina'])[1 + FLOOR(RANDOM() * 3)::INT];
    IF    v_stat = 'strength' THEN v_str := LEAST(9, v_str + 1);
    ELSIF v_stat = 'health'   THEN v_hp  := LEAST(9, v_hp + 1);
    ELSE                           v_def := LEAST(9, v_def + 1);
    END IF;
  END LOOP;

  UPDATE critters c
     SET xp = v_xp, level = v_level,
         strength = v_str, health = v_hp, stamina = v_def,
         -- consume whole periods only; the sub-6h remainder keeps ticking
         last_idle_claim = v_now - (v_capped - (v_periods * INTERVAL '6 hours'))
   WHERE c.id = p_critter_id;

  RETURN QUERY SELECT v_periods, v_wins, v_gain,
    v_xp, v_level, (v_levels_gained > 0),
    v_str, v_hp, v_def, v_log;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_idle_battles(TEXT) TO anon;
