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
