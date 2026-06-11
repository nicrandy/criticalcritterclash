import { useState } from 'react';
import { ruleSets } from './ruleSets';

// Stat example images shown under the stat reference
const statImageModules = import.meta.glob(
  '../images/product_images/stats/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;
const statImages = Object.values(statImageModules).filter(Boolean) as string[];

/**
 * "Rules of Combat" section — currently hidden from the site (not rendered by
 * App), kept ready for when the printed rules ship. Render it with:
 *   <RulesSection onPhotoOpen={src => setPhotoOpen(src)} />
 */
export function RulesSection({ onPhotoOpen }: { onPhotoOpen: (src: string) => void }) {
  const [activeRule, setActiveRule] = useState(ruleSets[0].id);

  return (
    <section id="rules" className="section rules-section">
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
                <button key={i} className="stat-example-tile" onClick={() => onPhotoOpen(src)} aria-label="Stat example">
                  <img src={src} alt={`Stat example ${i + 1}`} className="stat-example-img" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
