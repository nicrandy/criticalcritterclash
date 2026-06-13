import { useEffect, useState } from 'react';
import { supabase, formatEventDate, fetchScores, type Event, type ScoreData } from './supabaseClient';
import { BattleGame } from './BattleGame';
import { CritterCarousel, type FeaturedCritter } from './CritterCarousel';
import logo     from '../images/product_images/logo.png';
import arenaImg from '../images/product_images/arena.png';

// ── Image globs ───────────────────────────────────────────────────────────────
const critterPhotoModules = import.meta.glob(
  '../images/product_images/critters/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;

const critterPhotos = Object.values(critterPhotoModules).filter(Boolean) as string[];

// ── Photo lightbox (full-screen photo) ───────────────────────────────────────
function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="Critter" className="photo-lightbox-img" onClick={e => e.stopPropagation()} />
      <button className="lightbox-close" onClick={onClose}>✕</button>
    </div>
  );
}

const GUILD_ICONS: Record<string, string> = {
  rabbit: '🐇', fox: '🦊', squirrel: '🐿️', rogue: '🥷',
};

type NavSection = 'home' | 'events' | 'critters';

/** Today's date as 'YYYY-MM-DD' in the visitor's LOCAL timezone (not UTC, so an
 *  event on its final day doesn't disappear mid-afternoon in Mountain Time). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True if the event hasn't finished yet (multi-day events stay up until their end date) */
function isUpcoming(event: Event, today: string): boolean {
  return (event.end_date ?? event.start_date) >= today;
}

function App() {
  const [activeNav,    setActiveNav]   = useState<NavSection>('home');
  const [photoOpen,    setPhotoOpen]   = useState<string | null>(null);
  const [events,       setEvents]      = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError,  setEventsError]  = useState(false);
  const [eventsReload, setEventsReload] = useState(0);   // bump to refetch
  const [gameOpen,     setGameOpen]    = useState(false);
  const [arenaScannedId, setArenaScannedId] = useState<string | null>(null);
  const [scores,       setScores]      = useState<ScoreData | null>(null);
  const [featured,     setFeatured]    = useState<FeaturedCritter[]>([]);

  // Auto-open arena if ?arena=ID is in the URL (coming from critter scan page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const arenaId = params.get('arena');
    if (arenaId) {
      setArenaScannedId(arenaId.toUpperCase());
      setGameOpen(true);
      // Clean the URL without reloading
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Load events with retry + backoff. A single transient network failure (common
  // on event-floor connections) used to leave the section blank until a full
  // reload; now it retries, and a hard failure shows a "retry" prompt instead of
  // masquerading as "no events".
  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(false);

    const attempt = async (tries = 0): Promise<void> => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('start_date', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const today = localToday();
        setEvents((data as Event[]).filter(e => isUpcoming(e, today)));
        setEventsLoading(false);
      } catch {
        if (cancelled) return;
        if (tries < 3) {
          // 0.6s, 1.2s, 2.4s backoff
          setTimeout(() => { if (!cancelled) attempt(tries + 1); }, 600 * 2 ** tries);
          return;
        }
        setEventsError(true);
        setEventsLoading(false);
      }
    };
    attempt();

    return () => { cancelled = true; };
  }, [eventsReload]);

  // Featured critters: up to 10 that have an uploaded photo, shown in the
  // carousel. Legendaries lead, then Unique, then Rare. Best-effort — on
  // failure the section falls back to the bundled photo grid.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('critters')
      .select('id, name, rarity, photo_url')
      .not('photo_url', 'is', null)
      .limit(40)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const rank: Record<string, number> = { Legendary: 0, Unique: 1, Rare: 2 };
        const sorted = (data as FeaturedCritter[])
          .sort((a, b) => (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9))
          .slice(0, 10);
        setFeatured(sorted);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch global scores on mount, then refresh every 30 s while the tab is
  // visible. Backgrounded tabs skip the poll and catch up on return.
  useEffect(() => {
    const load = () => {
      if (document.hidden) return;
      fetchScores().then(setScores).catch(console.warn);
    };
    load();
    const id = setInterval(load, 30_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  const scrollTo = (id: string, section: NavSection) => {
    setActiveNav(section);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page-root">

      {/* ── NAV ── */}
      <nav className="site-nav">
        <div className="nav-links">
          {(['home', 'events', 'critters'] as NavSection[]).map(s => (
            <button
              key={s}
              className={`nav-link ${activeNav === s ? 'nav-link--active' : ''}`}
              onClick={() => scrollTo(s, s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="home" className="hero">
        <div className="hero-runes" aria-hidden="true">
          {['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚺ','ᚾ','ᛁ','ᛃ'].map((r, i) => (
            <span key={i} className="rune" style={{ animationDelay: `${i * 0.4}s` }}>{r}</span>
          ))}
        </div>
        <div className="hero-inner">
          <p className="hero-eyebrow">The Game of Wild Beasts &amp; Epic Battles</p>
          <img src={logo} alt="Critical Critter Clash" className="hero-logo" />
          <button className="arena-banner" onClick={() => setGameOpen(true)} aria-label="Enter the Arena">
            <img src={arenaImg} alt="Arena" className="arena-banner-img" />
            <div className="arena-banner-overlay">
              <span className="arena-banner-label">⚔️ Enter the Arena</span>
            </div>
          </button>

          {/* ── Balance of Power ── */}
          {(() => {
            const good    = scores?.alignment.good ?? 0;
            const evil    = scores?.alignment.evil ?? 0;
            const total   = good + evil;
            const goodPct = total > 0 ? (good / total) * 100 : 50;
            const evilPct = 100 - goodPct;
            const leader  = goodPct > 50.5 ? '✨ Saintly leads'
                          : evilPct > 50.5 ? '🔥 Wicked leads'
                          : '⚖️ Dead even';
            const guilds  = scores?.guilds ?? [];
            const maxPts  = Math.max(...guilds.map(g => g.total_points), 1);
            return (
              <div className="hero-war">
                <p className="hero-war-eyebrow">Balance of Power</p>

                {/* Tug-of-war */}
                <div className="war-tug-wrap">
                  <div className="war-tug-labels">
                    <span className="war-label war-label--good">✨ Saintly</span>
                    <span className="war-tug-leader">{leader}</span>
                    <span className="war-label war-label--evil">🔥 Wicked</span>
                  </div>
                  <div className="war-tug-track">
                    <div className="war-tug-good" style={{ width: `${goodPct}%` }} />
                    <div className="war-tug-evil" style={{ width: `${evilPct}%` }} />
                  </div>
                  <div className="war-tug-scores">
                    <span className="war-score war-score--good">{good.toLocaleString()} pts</span>
                    <span className="war-score war-score--evil">{evil.toLocaleString()} pts</span>
                  </div>
                </div>

                {/* Guild standings */}
                <div className="war-guilds">
                  <h3 className="war-guilds-title">⚔️ Guild Standings</h3>
                  {guilds.map((g, i) => {
                    const isTop = i === 0 && g.total_points > 0;
                    const pct   = (g.total_points / maxPts) * 100;
                    return (
                      <div key={g.guild} className={`war-guild-row ${isTop ? 'war-guild-row--top' : ''}`}>
                        <span className="war-guild-rank">{isTop ? '🏆' : `#${i + 1}`}</span>
                        <span className="war-guild-icon">{GUILD_ICONS[g.guild] ?? '❓'}</span>
                        <span className="war-guild-name">{g.guild.charAt(0).toUpperCase() + g.guild.slice(1)}</span>
                        <div className="war-guild-track">
                          <div
                            className={`war-guild-fill ${isTop ? 'war-guild-fill--top' : ''}`}
                            style={{ width: g.total_points > 0 ? `${pct}%` : '2px' }}
                          />
                        </div>
                        <span className="war-guild-pts">{g.total_points.toLocaleString()} <span className="war-pts-lbl">pts</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="hero-fade" aria-hidden="true" />
      </section>

      {/* ── EVENTS ── */}
      <section id="events" className="section events-section">
        <div className="section-header">
          <p className="section-eyebrow">Find Us In the Wild</p>
          <h2 className="section-title">Upcoming Events</h2>
          <p className="section-sub">Buy at these events — Limited Critters available at each location.</p>
        </div>

        {eventsLoading ? (
          <p className="cc-events-loading">Summoning the schedule…</p>
        ) : eventsError ? (
          <p className="cc-events-loading">
            Couldn't load the schedule.{' '}
            <button className="cc-events-retry" onClick={() => setEventsReload(n => n + 1)}>Try again</button>
          </p>
        ) : events.length === 0 ? (
          <p className="cc-events-loading">No events on the horizon — check back soon.</p>
        ) : (
          <div className="cc-event-grid">
            {events.map(event => (
              <div key={event.id} className="cc-event-card">
                <div className="cc-event-date">{formatEventDate(event.start_date, event.end_date)}</div>
                <h3 className="cc-event-title">{event.title}</h3>
                <p className="cc-event-location">📍 {event.location}</p>
                {event.description && <p className="cc-event-desc">{event.description}</p>}
                {event.url && (
                  <a href={event.url} target="_blank" rel="noreferrer" className="cc-event-link">Details →</a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CRITTERS ── */}
      <section id="critters" className="section">
        <div className="section-header">
          <p className="section-eyebrow">The Roster</p>
          <h2 className="section-title">Meet the Critters</h2>
          <p className="section-sub">Sourced from the Wyoming wilds. Hand-built, battle-hardened, and ready to clash.</p>
        </div>

        {/* Featured critters from the database (with uploaded photos) — falls
            back to the bundled photo grid if none are available yet */}
        {featured.length > 0 ? (
          <CritterCarousel critters={featured} />
        ) : (
          <div className="photo-grid">
            {critterPhotos.map((src, i) => (
              <button key={i} className="photo-tile" onClick={() => setPhotoOpen(src)} aria-label="View critter">
                <img src={src} alt={`Critter ${i + 1}`} className="photo-tile-img" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

      </section>

      {/* ── RULES — hidden until the printed rules ship; see RulesSection.tsx ──
          <RulesSection onPhotoOpen={setPhotoOpen} /> */}

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <img src={logo} alt="Critical Critter Clash" className="footer-logo" />
        <p className="footer-copy">criticalcritterclash.com — May your rolls be legendary.</p>
        <div className="footer-legal">
          <p>© {new Date().getFullYear()} Critical Critter Clash™. All Rights Reserved.</p>
          <p>
            Critical Critter Clash, all Critter names, character designs, artwork, game rules,
            and associated materials are the exclusive intellectual property of their creator.
            Unauthorized reproduction, distribution, or commercial use of any content from this
            site — including game mechanics, imagery, and character concepts — is strictly
            prohibited without prior written permission.
          </p>
          <p>Critical Critter Clash™ is a trademark. All critter designs are original works protected under copyright law.</p>
        </div>
      </footer>

      {/* ── LIGHTBOXES ── */}
      {photoOpen && <PhotoLightbox src={photoOpen} onClose={() => setPhotoOpen(null)} />}
      {gameOpen  && <BattleGame onClose={() => { setGameOpen(false); setArenaScannedId(null); }} scannedId={arenaScannedId} />}
    </div>
  );
}

export default App;
