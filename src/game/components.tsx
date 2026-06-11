import { rarityColor } from '../critters';
import { ALIGN_CFG, D6_DOTS, GUILD_ICONS, PORTRAITS } from './battleData';
import type { AnimStep, Fighter, FloatDmg, StatKey } from './types';

export function D6Die({ value, spinning, selected, used, onClick, large, settled }: {
  value: number | '?'; spinning?: boolean; selected?: boolean;
  used?: boolean; onClick?: () => void; large?: boolean; settled?: boolean;
}) {
  return (
    <button type="button"
      className={['bg-d6', spinning?'bg-d6--spin':'', selected?'bg-d6--sel':'',
        used?'bg-d6--used':'', large?'bg-d6--lg':'', settled?'bg-d6--settled':'',
        onClick && !used && !spinning ? 'bg-d6--clickable' : ''].filter(Boolean).join(' ')}
      onClick={onClick} disabled={used || !onClick}
    >
      <svg viewBox="0 0 100 100">
        <rect x="6" y="6" width="88" height="88" rx="18" className="d6-face"/>
        {typeof value === 'number' && (D6_DOTS[value]??[]).map(([cx,cy],i) => (
          <circle key={i} cx={cx} cy={cy} r="8" className="d6-dot"/>
        ))}
        {value === '?' && <text x="50" y="62" textAnchor="middle" dominantBaseline="middle" className="d6-q">?</text>}
      </svg>
      {used && <span className="bg-d6-check">✓</span>}
    </button>
  );
}

export function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, (hp/maxHp)*100) : 0;
  const col = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';
  return <div className="hp-bar-track"><div className="hp-bar-fill" style={{width:`${pct}%`,background:col}}/></div>;
}

// ─── FighterCard — compact horizontal strip ───────────────────────────────────
export function FighterCard({ fighter, label, animStep, side, floatDmg, shield, shieldMax, healsLeft, canDefend }: {
  fighter: Fighter; label: string; animStep: AnimStep;
  side: 'player'|'ai'; floatDmg: FloatDmg|null; shield: number; shieldMax: number;
  healsLeft?: number; canDefend?: boolean;
}) {
  const attacking = (side==='player'&&animStep==='p-act')||(side==='ai'&&animStep==='a-act');
  const hit       = (side==='ai'&&animStep==='a-hit')||(side==='player'&&animStep==='p-hit');
  const ac        = ALIGN_CFG[fighter.alignment];
  const portrait  = fighter.guild ? GUILD_ICONS[fighter.guild] : PORTRAITS[fighter.alignment][fighter.rarity];
  const rc        = rarityColor[fighter.rarity];
  const showFloat = floatDmg && floatDmg.side === side;

  return (
    <div className={['fg-card', attacking?'fg-attacking':'', hit?'fg-hit':''].filter(Boolean).join(' ')}
      style={{'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}>
      {showFloat && (
        <span key={floatDmg!.id} className="fg-float-dmg" style={{color:floatDmg!.color}}>
          {floatDmg!.label ?? (floatDmg!.val >= 0 ? `-${floatDmg!.val}` : `+${-floatDmg!.val}`)}
        </span>
      )}
      <div className={`fg-portrait${fighter.img ? ' fg-portrait--photo' : ''}`}
        style={{borderColor:ac.color,boxShadow:`0 0 10px ${ac.glow}`}}>
        {fighter.img
          ? <img src={fighter.img} alt={fighter.name} className="fg-portrait-img" />
          : portrait}
      </div>
      <div className="fg-body">
        <div className="fg-body-top">
          <div className="fg-identity">
            <span className="fg-label">{label}</span>
            <span className="fg-name">{fighter.name}</span>
            <span className="fg-badges">
              <span className="fg-rarity" style={{color:rc}}>{fighter.rarity}</span>
              <span className="fg-align" style={{color:ac.color}}>{ac.icon} {ac.label}</span>
            </span>
          </div>
          <div className="fg-hp-badge">
            <span className="fg-hp-cur">{fighter.hp}</span>
            <span className="fg-hp-sep">/</span>
            <span className="fg-hp-max">{fighter.maxHp}</span>
            <span className="fg-hp-lbl">HP</span>
          </div>
        </div>
        {shield > 0 && (
          <div className="fg-shield-row">
            <span className="fg-shield-icon">🛡️</span>
            <div className="fg-shield-track">
              <div className="fg-shield-fill" style={{width:`${shieldMax>0?Math.min(100,(shield/shieldMax)*100):0}%`}}/>
            </div>
            <span className="fg-shield-val">
              {shield}<span className="fg-shield-max">/{shieldMax}</span>
            </span>
          </div>
        )}
        <HPBar hp={fighter.hp} maxHp={fighter.maxHp}/>
        {/* AI resource indicators — shown for rival card only */}
        {(healsLeft !== undefined || canDefend !== undefined) && (
          <div className="fg-resources">
            <span className={`fg-res fg-res--heal${healsLeft! > 0 ? '' : ' fg-res--used'}`} title={healsLeft! > 0 ? 'Heal available' : 'Heal used'}>
              🧪
            </span>
            <span className={`fg-res fg-res--defend${canDefend ? '' : ' fg-res--used'}`} title={canDefend ? 'Block available' : 'Block used'}>
              🛡
            </span>
          </div>
        )}
        <div className="fg-stats-row">
          {(['strength','health','stamina'] as StatKey[]).map(k => {
            const icons:Record<StatKey,string> = {strength:'⚔️',health:'❤️',stamina:'🛡️'};
            const lbls:Record<StatKey,string>  = {strength:'STR',health:'HP',stamina:'DEF'};
            const val = fighter.final[k];
            const boosted = fighter.bossBoostStat === k;
            return (
              <div key={k} className={`fg-stat-chip${boosted?' fg-stat-chip--boss':''}`}>
                <span className="fg-sc-icon">{icons[k]}</span>
                <span className="fg-sc-lbl">{lbls[k]}</span>
                <span className="fg-sc-val">
                  {val}{boosted && <span className="fg-sc-boost">▲5</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
