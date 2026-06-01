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
