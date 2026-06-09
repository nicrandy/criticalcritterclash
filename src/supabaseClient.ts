import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ijkrbptanpdifsfzihiy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MHv0-VTTbR4CSYzGbmC_yA_1lGBnuls';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Event {
  id: string;
  site: string;
  title: string;
  location: string;
  start_date: string;   // 'YYYY-MM-DD'
  end_date: string | null;
  description: string | null;
  url: string | null;
}

// ── Score reading ─────────────────────────────────────────────────────────────

export interface ScoreData {
  alignment: { good: number; evil: number };
  guilds: { guild: string; total_points: number }[];
}

export async function fetchScores(): Promise<ScoreData> {
  const [alignRes, guildRes] = await Promise.all([
    supabase.from('alignment_scores').select('alignment, total_points'),
    supabase.from('guild_scores').select('guild, total_points').order('total_points', { ascending: false }),
  ]);
  const rows = alignRes.data ?? [];
  const good = rows.find((r: { alignment: string; total_points: number }) => r.alignment === 'good')?.total_points ?? 0;
  const evil = rows.find((r: { alignment: string; total_points: number }) => r.alignment === 'evil')?.total_points ?? 0;
  return {
    alignment: { good, evil },
    guilds: (guildRes.data ?? []) as { guild: string; total_points: number }[],
  };
}

// ── Global score tracking ─────────────────────────────────────────────────────

/** Points awarded per victorious stage, keyed by starting rank */
const STAGE_POINTS: Record<string, number> = {
  rare:      3,  // Hard mode — highest reward
  unique:    2,  // Medium
  legendary: 1,  // Easy mode — lowest reward
};

/**
 * Called after each stage win. Atomically increments alignment and (if
 * playing with a real card) guild totals by the rank-based point value.
 * Fire-and-forget — failures are logged but never block the UI.
 */
export async function submitStageScore(
  alignment: 'good' | 'evil',
  rarity: 'rare' | 'unique' | 'legendary',
  guild?: string,
): Promise<void> {
  const pts = STAGE_POINTS[rarity] ?? 1;
  try {
    await supabase.rpc('add_alignment_points', { p_alignment: alignment, p_points: pts });
    if (guild) {
      await supabase.rpc('add_guild_points', { p_guild: guild, p_points: pts });
    }
  } catch (err) {
    console.warn('[scores] submitStageScore failed silently:', err);
  }
}

// ── Battle analytics tracking ──────────────────────────────────────────────────

export interface RoundSnap {
  r: number;
  first: 'player' | 'ai';
  p_act: string;  p_roll: number;
  ai_act: string; ai_roll: number;
  p_hp_start:  number; p_hp_end:  number;
  ai_hp_start: number; ai_hp_end: number;
  p_shield_start:  number; p_shield_end:  number;
  ai_shield_start: number; ai_shield_end: number;
  p_dmg: number; ai_dmg: number;
  p_crit: boolean; ai_crit: boolean;
}

export interface BattleRecord {
  stage: number; death_count: number; is_boss: boolean; boss_boost_stat: string | null;
  p_alignment: string; p_rarity: string; p_guild: string;
  p_str: number; p_hp_stat: number; p_def: number; p_max_hp: number;
  p_max_heals: number; p_bonus_atk: number; p_bonus_passive: number;
  ai_alignment: string; ai_rarity: string;
  ai_str: number; ai_hp_stat: number; ai_def: number; ai_max_hp: number;
  winner: 'player' | 'ai';
  total_rounds: number; final_p_hp: number; final_ai_hp: number;
  opponent_id: string | null;
  rounds: RoundSnap[];
}

/** Fire-and-forget: save one completed battle row to Supabase */
export async function recordBattle(rec: BattleRecord): Promise<void> {
  try {
    await supabase.from('battles').insert([rec]);
  } catch {
    // never crash the game
  }
}

/** Format start/end dates into a readable range, e.g. "May 23 – 25" or "September 7" */
export function formatEventDate(start: string, end: string | null): string {
  const startDt = new Date(start + 'T12:00:00');
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', opts);

  if (!end) return fmt(startDt, { month: 'long', day: 'numeric' });

  const endDt = new Date(end + 'T12:00:00');
  const sameMonth = startDt.getMonth() === endDt.getMonth();

  if (sameMonth) {
    return `${fmt(startDt, { month: 'long', day: 'numeric' })} – ${endDt.getDate()}`;
  }
  return `${fmt(startDt, { month: 'long', day: 'numeric' })} – ${fmt(endDt, { month: 'long', day: 'numeric' })}`;
}
