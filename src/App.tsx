import { useEffect, useState } from 'react';
import { critters, rarityColor, rarityGlow, type Critter } from './critters';
import { ruleSets } from './ruleSets';
import { supabase, formatEventDate, type Event } from './supabaseClient';
import { BattleGame } from './BattleGame';
import logo     from '../images/product_images/logo.png';
import arenaImg from '../images/product_images/arena.png';

// ── Image globs ───────────────────────────────────────────────────────────────
const critterPhotoModules = import.meta.glob(
  '../images/product_images/critters/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;

const statImageModules = import.meta.glob(
  '../images/product_images/stats/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;

const critterPhotos = Object.values(critterPhotoModules).filter(Boolean) as string[];
const statImages    = Object.values(statImageModules).filter(Boolean) as string[];

// AI card art still used for the stat-detail lightbox
const cardArtModules = import.meta.glob(
  '../images/product_images/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;
const cardArtMap: Record<string, string> = {};
for (const [path, url] of Object.entries(cardArtModules)) {
  cardArtMap[path.split('/').pop() ?? ''] = url;
}

// ── Stat bar ──────────────────────────────────────────────────────────────────
function StatBar({ label, value, icon, rarity }: {
  label: string; value: number; icon: string; rarity: string;
}) {
  const color = rarityColor[rarity as keyof typeof rarityColor] ?? '#c9a84c';
  const glow  = rarityGlow[rarity  as keyof typeof rarityGlow]  ?? 'rgba(201,168,76,0.5)';
  return (
    <div className="stat-bar-row" style={{ '--rarity-color': color, '--rarity-glow': glow } as React.CSSProperties}>
      <span className="stat-bar-icon">{icon}</span>
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className={`stat-pip ${i < value ? 'stat-pip--filled' : ''}`} />
        ))}
      </div>
      <span className="stat-bar-value">{value}</span>
    </div>
  );
}

// ── Critter stat lightbox (uses AI card art + critters.ts data) ───────────────
function StatLightbox({ critter, onClose }: { critter: Critter; onClose: () => void }) {
  const color = rarityColor[critter.rarity];
  const glow  = rarityGlow[critter.rarity];
  const src   = cardArtMap[critter.image];
  return (
    <div className="lightbox" onClick={onClose}>
      <div
        className="lightbox-panel"
        style={{ '--rarity-color': color, '--rarity-glow': glow } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        <button className="lightbox-close" onClick={onClose}>✕</button>
        <div className="lightbox-portrait">
          {src
            ? <img src={src} alt={critter.name} className="lightbox-img" />
            : <div className="critter-tile-placeholder" style={{ minHeight: 320 }}><span>🐾</span></div>
          }
        </div>
        <div className="lightbox-info">
          <p className="lightbox-rarity" style={{ color }}>{critter.rarity.toUpperCase()}</p>
          <h2 className="lightbox-name">{critter.name}</h2>
          <p className="lightbox-desc">{critter.description}</p>
          <div className="lightbox-stats">
            <StatBar label="Strength" value={critter.strength} icon="👊" rarity={critter.rarity} />
            <StatBar label="Health"   value={critter.health}   icon="❤️" rarity={critter.rarity} />
            <StatBar label="Stamina"  value={critter.stamina}  icon="🛡️" rarity={critter.rarity} />
          </div>
          <div className="lightbox-total">
            <span>Total Power</span>
            <span className="lightbox-power" style={{ color }}>
              {critter.strength + critter.health + critter.stamina}
              <small> / 27</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Photo lightbox (full-screen photo) ───────────────────────────────────────
function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="Critter" className="photo-lightbox-img" onClick={e => e.stopPropagation()} />
      <button className="lightbox-close" onClick={onClose}>✕</button>
    </div>
  );
}

type NavSection = 'home' | 'events' | 'critters' | 'rules';

function App() {
  const [activeNav,    setActiveNav]   = useState<NavSection>('home');
  const [activeRule,   setActiveRule]  = useState(ruleSets[0].id);
  const [photoOpen,    setPhotoOpen]   = useState<string | null>(null);
  const [statCritter,  setStatCritter] = useState<Critter | null>(null);
  const [events,       setEvents]      = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [gameOpen,     setGameOpen]    = useState(false);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setEvents(data as Event[]);
        setEventsLoading(false);
      });
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
          <p className="hero-sub">
            Collect powerful Critters.<br />
            Build your party.<br />
            Battle for glory.
          </p>
          <button className="arena-banner" onClick={() => setGameOpen(true)} aria-label="Enter the Arena">
            <img src={arenaImg} alt="Arena" className="arena-banner-img" />
            <div className="arena-banner-overlay">
              <span className="arena-banner-label">⚔️ Enter the Arena</span>
            </div>
          </button>
        </div>
        <div className="hero-fade" aria-hidden="true" />
      </section>

      {/* ── EVENTS ── */}
      <section id="events" className="section events-section">
        <div className="section-header">
          <p className="section-eyebrow">Find Us In the Wild</p>
          <h2 className="section-title">Upcoming Events</h2>
          <p className="section-sub">Come battle in person. Find us at these events.</p>
        </div>

        {eventsLoading ? (
          <p className="cc-events-loading">Summoning the schedule…</p>
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
          <p className="section-sub">Each one handcrafted. Click to see their stats.</p>
        </div>

        {/* Photo grid — real critter photos */}
        <div className="photo-grid">
          {critterPhotos.map((src, i) => (
            <button key={i} className="photo-tile" onClick={() => setPhotoOpen(src)} aria-label="View critter">
              <img src={src} alt={`Critter ${i + 1}`} className="photo-tile-img" />
            </button>
          ))}
        </div>

      </section>

      {/* ── RULES — hidden from nav/page, code kept for later use ── */}
      {false && <section id="rules" className="section rules-section">
        <div className="section-header">
          <p className="section-eyebrow">How to Play</p>
          <h2 className="section-title">Rules of Combat</h2>
          <p className="section-sub">Choose your game mode below.</p>
        </div>

        {/* Mode buttons */}
        <div className="mode-btn-row">
          {ruleSets.map(rs => (
            <button
              key={rs.id}
              className={`mode-btn ${activeRule === rs.id ? 'mode-btn--active' : ''}`}
              onClick={() => setActiveRule(rs.id)}
            >
              {rs.buttonLabel}
            </button>
          ))}
        </div>

        {/* Active rule set */}
        {ruleSets.filter(rs => rs.id === activeRule).map(rs => (
          <div key={rs.id} className="ruleset-panel">
            <div className="ruleset-header">
              <h3 className="ruleset-title">{rs.title}</h3>
              <p className="ruleset-tagline">{rs.tagline}</p>
              <div className="ruleset-meta">
                <span className="meta-chip">👥 {rs.players} Player{rs.players === '1' ? '' : 's'}</span>
                <span className="meta-chip">🐾 {rs.critters}</span>
                <span className="meta-chip">🎲 {rs.dice}</span>
              </div>
            </div>
            <div className="rules-grid">
              {rs.rules.map(r => (
                <div key={r.title} className="rule-card">
                  <div className="rule-icon">{r.icon}</div>
                  <h3 className="rule-title">{r.title}</h3>
                  <p className="rule-text">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Stat reference */}
        <div className="stat-explainer">
          <h3 className="stat-explainer-title">Stat Reference</h3>
          <div className="stat-row">
            {[
              { icon: '👊', name: 'Strength', desc: 'Added to your attack roll. Higher = harder hits.' },
              { icon: '❤️', name: 'Health',   desc: 'Life total × 2 = HP. Reach 0 and your Critter is defeated.' },
              { icon: '🛡️', name: 'Stamina',  desc: 'Passive damage reduction each round, and your shield value when you choose to Defend.' },
            ].map(s => (
              <div key={s.name} className="stat-block">
                <span className="stat-icon">{s.icon}</span>
                <span className="stat-name">{s.name}</span>
                <span className="stat-desc">{s.desc}</span>
                <span className="stat-scale">0 – 9</span>
              </div>
            ))}
          </div>

          {/* Stat example images */}
          {statImages.length > 0 && (
            <div className="stat-examples">
              <p className="stat-examples-label">Examples</p>
              <div className="stat-examples-row">
                {statImages.map((src, i) => (
                  <button key={i} className="stat-example-tile" onClick={() => setPhotoOpen(src)} aria-label="Stat example">
                    <img src={src} alt={`Stat example ${i + 1}`} className="stat-example-img" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>}

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
      {photoOpen   && <PhotoLightbox src={photoOpen} onClose={() => setPhotoOpen(null)} />}
      {statCritter && <StatLightbox critter={statCritter} onClose={() => setStatCritter(null)} />}
      {gameOpen    && <BattleGame onClose={() => setGameOpen(false)} />}
    </div>
  );
}

export default App;
