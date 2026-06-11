import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, levelFromXp, xpForLevel, claimIdleBattles, type IdleClaimResult } from './supabaseClient';
import logo from '../images/product_images/logo.png';

interface CritterRecord {
  id: string;
  rarity: string;
  strength: number;
  health: number;
  stamina: number;
  name: string | null;
  level: number | null;
  xp: number | null;
  photo_url: string | null;
}

const RARITY_COLOR: Record<string, string> = {
  Rare:      '#4a9eff',
  Unique:    '#a855f7',
  Legendary: '#f59e0b',
};

const RARITY_LABEL: Record<string, string> = {
  Rare:      '💎 Rare',
  Unique:    '🔮 Unique',
  Legendary: '🏆 Legendary',
};

export function CritterPage() {
  const { id } = useParams<{ id: string }>();
  const [critter,  setCritter]  = useState<CritterRecord | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [idleReport, setIdleReport] = useState<IdleClaimResult | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const upperId = id.toUpperCase();
      // Resolve any banked training battles first, so the page below shows
      // the post-training stats/XP
      const idle = await claimIdleBattles(upperId);
      const { data, error } = await supabase
        .from('critters')
        .select('id, rarity, strength, health, stamina, name, level, xp, photo_url')
        .eq('id', upperId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setCritter(data as CritterRecord);
        if (idle && idle.battles_fought > 0) setIdleReport(idle);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading)  return <PageShell><p className="cc-claim-loading">Summoning your critter…</p></PageShell>;
  if (notFound) return <PageShell><p className="cc-claim-loading">Critter not found. Check your QR code.</p></PageShell>;
  if (!critter) return null;

  const color = RARITY_COLOR[critter.rarity] ?? '#c9a84c';
  const total = critter.strength + critter.health + critter.stamina;
  const xp = critter.xp ?? 0;
  const level = critter.level ?? levelFromXp(xp);
  const curFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const xpPct = Math.min(100, Math.max(0, ((xp - curFloor) / Math.max(1, nextFloor - curFloor)) * 100));

  return (
    <PageShell>
      <div className="cc-claim-card" style={{ '--rarity-color': color } as React.CSSProperties}>

        {critter.photo_url && (
          <img src={critter.photo_url} alt={critter.name ?? 'Critter'} className="cc-claim-photo"
            style={{ borderColor: color }} />
        )}

        <div className="cc-claim-header">
          <p className="cc-claim-rarity" style={{ color }}>{RARITY_LABEL[critter.rarity] ?? critter.rarity}</p>
          {critter.name && <h1 className="cc-claim-name">{critter.name}</h1>}
          <p className="cc-claim-id">#{critter.id}</p>
        </div>

        {idleReport && (
          <div className="cc-idle-banner" style={{ borderColor: color }}>
            <p className="cc-idle-title">🌙 While you were away…</p>
            <p className="cc-idle-summary">
              {critter.name ?? 'Your critter'} trained in {idleReport.battles_fought} battle{idleReport.battles_fought > 1 ? 's' : ''} —
              {' '}{idleReport.wins} win{idleReport.wins === 1 ? '' : 's'} · <strong style={{ color }}>+{idleReport.xp_gained} XP</strong>
            </p>
            {idleReport.leveled_up && (
              <p className="cc-idle-levelup">🏅 Leveled up to Level {idleReport.new_level}!</p>
            )}
            <ul className="cc-idle-log">
              {idleReport.log.map((b, i) => (
                <li key={i}>{b.won ? '🏆 Defeated' : '💢 Lost to'} {b.opponent}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="cc-level-row">
          <span className="cc-level-badge" style={{ borderColor: color, color }}>🏅 Level {level}</span>
          <div className="cc-xp-track">
            <div className="cc-xp-fill" style={{ width: `${xpPct}%`, background: color }} />
          </div>
          <span className="cc-xp-label">{xp} XP</span>
        </div>

        <div className="cc-divider" style={{ borderColor: color }} />

        <div className="cc-claim-stats">
          <StatRow label="Strength" icon="⚔️"  value={critter.strength} color={color} />
          <StatRow label="Health"   icon="❤️"  value={critter.health}   color={color} />
          <StatRow label="Stamina"  icon="🛡️" value={critter.stamina}  color={color} />
        </div>

        <div className="cc-divider" style={{ borderColor: color }} />

        <div className="cc-total-row">
          <span className="cc-total-label">Total Power</span>
          <span className="cc-total-value" style={{ color }}>{total}<span className="cc-total-max"> / 27</span></span>
        </div>

        <a
          href={`/?arena=${critter.id}`}
          className="cc-arena-btn"
          style={{ background: color }}
        >
          ⚔️ Enter the Arena
        </a>

      </div>
    </PageShell>
  );
}

function StatRow({ label, icon, value, color }: { label: string; icon: string; value: number; color: string }) {
  return (
    <div className="cc-stat-pip">
      <span className="cc-stat-icon">{icon}</span>
      <span className="cc-stat-pip-label">{label}</span>
      <div className="cc-stat-pip-track">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="cc-pip" style={i < value ? { background: color, boxShadow: `0 0 4px ${color}` } : {}} />
        ))}
      </div>
      <span className="cc-stat-pip-value" style={{ color }}>{value}</span>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cc-claim-root">
      <div className="cc-claim-inner">
        <a href="/" className="cc-claim-logo-link" aria-label="Go to Critical Critter Clash home">
          <img src={logo} alt="Critical Critter Clash" className="cc-claim-logo" />
        </a>
        {children}
      </div>
      <p className="cc-claim-footer">criticalcritterclash.com</p>
    </div>
  );
}
