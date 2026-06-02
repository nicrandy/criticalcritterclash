import { useState, useRef, useEffect } from 'react';
import { rarityColor, rarityGlow } from './critters';

// ─── Types ────────────────────────────────────────────────────────────────────
type Rarity     = 'rare' | 'unique' | 'legendary';
type StatKey    = 'strength' | 'health' | 'stamina';
type Alignment  = 'good' | 'evil';
type Guild      = 'rabbit' | 'fox' | 'squirrel' | 'rogue';
type Action     = 'attack' | 'defend' | 'heal';
type Phase      = 'mode' | 'setup' | 'enchant' | 'rolling' | 'allocating' | 'real-setup' | 'real-stats' | 'battle' | 'result';
type BattleStep = 'choose' | 'player-rolling' | 'animating';
type AnimStep   = 'idle' | 'p-act' | 'a-hit' | 'a-act' | 'p-hit';

interface Stats   { strength: number; health: number; stamina: number; }
interface Fighter {
  name: string; rarity: Rarity; alignment: Alignment; guild?: Guild;
  base: Stats; final: Stats; hp: number; maxHp: number;
}
interface LogEntry {
  id: number;
  type: 'separator' | 'hit' | 'critical' | 'block' | 'heal' | 'info';
  who?: 'player' | 'ai';
  text: string;
}
interface Spotlight {
  title: string; detail: string; color: string;
  type: 'attack' | 'damage' | 'critical' | 'block' | 'heal' | 'idle';
}
interface FloatDmg { val: number; color: string; side: 'player' | 'ai'; id: number; }

// ─── Static data ──────────────────────────────────────────────────────────────
const MOVES: Record<Alignment, Record<Rarity, string[]>> = {
  good: {
    rare:      ['Holy Strike','Blessed Slash','Sacred Blow','Pure Light','Smite'],
    unique:    ["Angel's Wrath",'Celestial Burst','Radiant Beam','Divine Smite','Holy Flare'],
    legendary: ["Heaven's Fury",'Seraphic Judgment','Divine Obliteration','Holy Nova','Wrath of God'],
  },
  evil: {
    rare:      ['Shadow Slash','Cursed Blow','Dark Fang','Venom Strike','Hex Strike'],
    unique:    ['Soul Drain','Void Rend','Blood Curse','Demonic Burst','Necrotic Touch'],
    legendary: ['Hellfire','Eternal Damnation',"Abyss's Maw",'Dark Annihilation','Death Knell'],
  },
};
const DEFEND_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Ward','Sacred Shield','Divine Guard','Blessed Barrier'],
  evil: ['Shadow Veil','Dark Ward','Cursed Shell','Void Barrier'],
};
const HEAL_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Mend','Blessed Recovery','Sacred Restore','Divine Renewal'],
  evil: ['Dark Drain','Soul Leech','Shadow Mend','Cursed Regen'],
};

const AI_NAMES: Record<Alignment, Record<Rarity, string[]>> = {
  evil: {
    rare:      ['Dark Fox','Shadow Bear','Cursed Wolf','Void Lizard','Blight Toad'],
    unique:    ['Shadow Pack','Demon Squirrel','Void Drake','Cursed Elk','Night Badger'],
    legendary: ['The Dark Jackalope','Doom Serpent','Eternal Shadow Lord'],
  },
  good: {
    rare:      ['Holy Fox','Sacred Bear','Blessed Wolf','Divine Lizard','Pure Toad'],
    unique:    ['Celestial Pack','Angel Squirrel','Radiant Drake','Divine Elk','Seraph Owl'],
    legendary: ['The Holy Jackalope',"Heaven's Champion",'Eternal Seraphim'],
  },
};

// Player critter names generated on Enchant
const PLAYER_NAMES: Record<Alignment, string[]> = {
  good: ['Sacred Fox','Holy Bear','Divine Wolf','Blessed Elk','Pure Toad','Gilded Hawk',
         'Dawn Raven','Noble Stag','Celestial Hare','Radiant Badger','Gleaming Owl',
         'Light Deer','Hallowed Lynx','Brave Sparrow','True Falcon'],
  evil: ['Cursed Fox','Bone Bear','Void Wolf','Dread Elk','Plague Toad','Shadow Hawk',
         'Fell Raven','Doom Stag','Blight Hare','Dark Badger','Wicked Owl',
         'Grim Deer','Corrupt Lynx','Vile Sparrow','Fell Falcon'],
};

const PORTRAITS: Record<Alignment, Record<Rarity, string>> = {
  good: { rare: '🦊', unique: '🦋', legendary: '🦅' },
  evil: { rare: '🐺', unique: '🐉', legendary: '☠️' },
};

const ALIGN_CFG = {
  good: { label: 'Saintly', icon: '✨', color: '#fde68a', glow: 'rgba(253,230,138,0.5)' },
  evil: { label: 'Wicked',  icon: '🔥', color: '#ef4444', glow: 'rgba(239,68,68,0.5)'  },
};

const DIFFICULTY_CFG: Record<Rarity, { diff: string; icon: string; desc: string }> = {
  rare:      { diff: 'Hard',   icon: '🩸', desc: 'Stats 0–5 · High variance' },
  unique:    { diff: 'Medium', icon: '⚡', desc: 'Stats 2–7 · Balanced'      },
  legendary: { diff: 'Easy',   icon: '✨', desc: 'Stats 6–9 · High power'    },
};

const ACTION_CFG: Record<Action, { icon: string; label: string }> = {
  attack: { icon: '⚔️', label: 'Attack'  },
  defend: { icon: '🛡️', label: 'Defend'  },
  heal:   { icon: '💊', label: 'Heal'    },
};

const IDLE_SPOTLIGHT: Spotlight = { title:'', detail:'', color:'#888', type:'idle' };

// ─── Guild data ───────────────────────────────────────────────────────────────
const GUILD_ICONS: Record<Guild, string> = {
  rabbit: '🐇', fox: '🦊', squirrel: '🐿️', rogue: '🥷',
};

const GUILD_NAMES: Record<Guild, string[]> = {
  rabbit: [
    'Snowpelt','Cloverfoot','Dustwhisker','Moonear','Willowbun',
    'Thornfur','Cobblehop','Dewclaw','Frostlop','Meadowpatch',
    'Silverleap','Bramblefoot','Pebblehop','Cinderear','Rushwhisker',
  ],
  fox: [
    'Embertail','Ashenfur','Crimsonpaw','Duskfire','Gleamsnout',
    'Cindercoat','Rustfang','Shadowglow','Goldbristle','Flamecrest',
    'Tawnysnap','Brackenmane','Scorchpelt','Amberfang','Slyember',
  ],
  squirrel: [
    'Nutclaw','Acornleap','Branchrunner','Mossnibble','Pinecrest',
    'Twigspin','Cobblecheek','Bushtail','Driftchatter','Hazelflick',
    'Spireclaw','Cobbleskip','Thornchew','Barkleap','Gnarlfur',
  ],
  rogue: [
    'Shadowstep','Nightblade','Thornstrike','Ashveil','Dustshroud',
    'Quickclaw','Veilpaw','Grimhook','Slyedge','Murkcreep',
    'Coldsnap','Bonewhisper','Duskfang','Riftstalker','Ghostpaw',
  ],
};

const RANK_RANGE: Record<Rarity, [number, number]> = {
  rare: [0, 5], unique: [2, 7], legendary: [6, 9],
};

// ─── Stat distributions (weighted bell curve per rarity) ──────────────────────
// [value, weight]
const STAT_DIST: Record<Rarity, [number, number][]> = {
  rare:      [[0,5],[1,20],[2,25],[3,25],[4,20],[5,5]],
  unique:    [[2,5],[3,20],[4,25],[5,25],[6,20],[7,5]],
  legendary: [[6,10],[7,30],[8,35],[9,25]],
};

function rollStatForRarity(r: Rarity): number {
  const dist = STAT_DIST[r];
  const total = dist.reduce((s, [, w]) => s + w, 0);
  let v = Math.random() * total;
  for (const [val, w] of dist) { v -= w; if (v <= 0) return val; }
  return dist[dist.length - 1][0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const randInt     = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const rollD6      = () => randInt(1, 6);
const calcMaxHp   = (health: number) => health * 4 + 5;
const calcPassive = (f: Fighter) => Math.floor(f.final.stamina / 3);
let _uid = 0;
const uid  = () => ++_uid;
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

function generateAIStats(stage: number): Stats {
  // Stage 1 → 1–5, Stage 2 → 2–6 … Stage 5+ → 5–9 (capped at 9)
  const min = Math.min(stage, 5);
  const max = Math.min(stage + 4, 9);
  const r = () => randInt(min, max);
  return { strength: r(), health: r(), stamina: r() };
}

function aiAllocateDice(base: Stats, dice: number[]): Stats {
  const r = { ...base };
  [...dice].sort((a, b) => b - a).forEach(d => {
    const k = (['strength','health','stamina'] as StatKey[]).reduce((a, b) => r[a] < r[b] ? a : b);
    r[k] += d;
  });
  return r;
}

function pickAIAction(ai: Fighter, _p: Fighter, last: Action | null, healCount: number, hasDefended: boolean): Action {
  const canHeal    = healCount < 3;
  const canDefend  = !hasDefended;
  if (!canHeal && !canDefend) return 'attack';
  if (!canHeal) return last === 'attack' && canDefend && Math.random() < 0.4 ? 'defend' : 'attack';
  if (!canDefend) {
    if (ai.hp / ai.maxHp < 0.3 && Math.random() < 0.65) return 'heal';
    const r = Math.random(); return r < 0.65 ? 'attack' : 'heal';
  }
  if (ai.hp / ai.maxHp < 0.3 && Math.random() < 0.65) return 'heal';
  if (last === 'attack' && Math.random() < 0.4) return 'defend';
  const r = Math.random();
  return r < 0.55 ? 'attack' : r < 0.75 ? 'defend' : 'heal';
}

// ─── D6 dot positions ─────────────────────────────────────────────────────────
const D6_DOTS: Record<number, [number, number][]> = {
  1: [[50,50]],
  2: [[32,32],[68,68]],
  3: [[32,32],[50,50],[68,68]],
  4: [[32,32],[68,32],[32,68],[68,68]],
  5: [[32,32],[68,32],[50,50],[32,68],[68,68]],
  6: [[32,26],[68,26],[32,50],[68,50],[32,74],[68,74]],
};

function D6Die({ value, spinning, selected, used, onClick, large }: {
  value: number | '?'; spinning?: boolean; selected?: boolean;
  used?: boolean; onClick?: () => void; large?: boolean;
}) {
  return (
    <button type="button"
      className={['bg-d6', spinning?'bg-d6--spin':'', selected?'bg-d6--sel':'',
        used?'bg-d6--used':'', large?'bg-d6--lg':'',
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

function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, (hp/maxHp)*100) : 0;
  const col = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';
  return <div className="hp-bar-track"><div className="hp-bar-fill" style={{width:`${pct}%`,background:col}}/></div>;
}

// ─── FighterCard — compact horizontal strip ───────────────────────────────────
function FighterCard({ fighter, label, animStep, side, floatDmg, shield, shieldMax }: {
  fighter: Fighter; label: string; animStep: AnimStep;
  side: 'player'|'ai'; floatDmg: FloatDmg|null; shield: number; shieldMax: number;
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
          {floatDmg!.val >= 0 ? `-${floatDmg!.val}` : `+${-floatDmg!.val}`}
        </span>
      )}
      <div className="fg-portrait" style={{borderColor:ac.color,boxShadow:`0 0 10px ${ac.glow}`}}>
        {portrait}
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
        <div className="fg-stats-row">
          {(['strength','health','stamina'] as StatKey[]).map(k => {
            const icons:Record<StatKey,string> = {strength:'⚔️',health:'❤️',stamina:'🛡️'};
            const lbls:Record<StatKey,string>  = {strength:'STR',health:'HP',stamina:'DEF'};
            const val = fighter.final[k];
            return (
              <div key={k} className="fg-stat-chip">
                <span className="fg-sc-icon">{icons[k]}</span>
                <span className="fg-sc-lbl">{lbls[k]}</span>
                <span className="fg-sc-val">{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SpotlightPanel — full-width banner, hidden when idle ─────────────────────
function SpotlightPanel({ spot }: { spot: Spotlight }) {
  if (spot.type === 'idle') return null;
  const icons: Record<string, string> = {
    attack:'⚡', damage:'💥', critical:'☀️', block:'🛡️', heal:'💚',
  };
  return (
    <div className={`sp-panel sp-${spot.type}`}
      style={{borderColor:spot.color,'--sp-color':spot.color} as React.CSSProperties}>
      <span className="sp-icon">{icons[spot.type]??'⚡'}</span>
      <div className="sp-text">
        <span className="sp-title" style={{color:spot.color}}>{spot.title}</span>
        {spot.detail && <span className="sp-detail">{spot.detail}</span>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BattleGame({ onClose }: { onClose:()=>void }) {
  const [phase,          setPhase]         = useState<Phase>('mode');
  const [critterMode,    setCritterMode]   = useState<'real'|'generated'>('generated');
  const [alignment,      setAlignment]     = useState<Alignment>('good');
  const [rarity,         setRarity]        = useState<Rarity>('rare');
  const [guild,          setGuild]         = useState<Guild>('rabbit');
  const [base,           setBase]          = useState<Stats>({strength:0,health:0,stamina:0});
  const [playerName,     setPlayerName]    = useState('');
  const [enchanted,      setEnchanted]     = useState(false);

  const [allocDice,      setAllocDice]     = useState<number[]>([]);
  const [allocRolling,   setAllocRolling]  = useState(false);
  const [assigns,        setAssigns]       = useState<(StatKey|null)[]>([null,null,null]);
  const [selDie,         setSelDie]        = useState<number|null>(null);

  const [player,         setPlayer]        = useState<Fighter|null>(null);
  const [ai,             setAI]            = useState<Fighter|null>(null);

  const [battleStep,     setBattleStep]    = useState<BattleStep>('choose');
  const [playerAction,   setPlayerAction]  = useState<Action|null>(null);
  const [lastPlayerAct,  setLastPlayerAct] = useState<Action|null>(null);
  const [combatRoll,     setCombatRoll]    = useState<number|null>(null);
  const [combatRolling,  setCombatRolling] = useState(false);
  const [revealedAIAct,  setRevealedAIAct]  = useState<Action|null>(null);
  const [revealedAIRoll, setRevealedAIRoll] = useState<number|null>(null);

  const [log,            setLog]           = useState<LogEntry[]>([]);
  const [round,          setRound]         = useState(1);
  const [animStep,       setAnimStep]      = useState<AnimStep>('idle');
  const [spotlight,      setSpotlight]     = useState<Spotlight>(IDLE_SPOTLIGHT);
  const [spotKey,        setSpotKey]       = useState(0);
  const [floatDmg,       setFloatDmg]      = useState<FloatDmg|null>(null);
  const [winner,         setWinner]        = useState<'player'|'ai'|null>(null);
  const [streak,         setStreak]        = useState(0);
  const [playerHeals,    setPlayerHeals]   = useState(0);
  const [aiHeals,        setAiHeals]       = useState(0);
  const [playerShield,    setPlayerShield]    = useState(0);
  const [playerShieldMax, setPlayerShieldMax] = useState(0);
  const [playerDefended,  setPlayerDefended]  = useState(false);
  const [aiShield,        setAiShield]        = useState(0);
  const [aiShieldMax,     setAiShieldMax]     = useState(0);
  const [aiDefended,      setAiDefended]      = useState(false);
  const [stage,           setStage]           = useState(1);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const rc = rarityColor[rarity];
  const rg = rarityGlow[rarity];
  const ac = ALIGN_CFG[alignment];

  const showSpot = (s: Spotlight) => { setSpotlight(s); setSpotKey(k=>k+1); };

  // ── Enchant: generate RNG stats + name ─────────────────────────────────────
  const handleEnchant = () => {
    if (enchanted) return;
    const newBase: Stats = {
      strength: rollStatForRarity(rarity),
      health:   rollStatForRarity(rarity),
      stamina:  rollStatForRarity(rarity),
    };
    setBase(newBase);
    setPlayerName(pick(PLAYER_NAMES[alignment]));
    setEnchanted(true);
  };

  const handleStartEnchant = () => {
    setEnchanted(false);
    setBase({strength:0,health:0,stamina:0});
    setPlayerName('');
    setPhase('enchant');
  };

  // ── Pre-battle dice ─────────────────────────────────────────────────────────
  const handleAllocRoll = () => {
    if (allocRolling || allocDice.length === 3) return;
    setAllocRolling(true);
    const final = [rollD6(), rollD6(), rollD6()];
    const schedule = [...Array(10).fill(40),...Array(7).fill(80),...Array(5).fill(140),...Array(3).fill(250),...Array(2).fill(420)];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) { setAllocDice([rollD6(),rollD6(),rollD6()]); setTimeout(tick, schedule[i++]); }
      else { setAllocDice(final); setAllocRolling(false); }
    };
    tick();
  };

  // ── Allocation ──────────────────────────────────────────────────────────────
  const handleAssign = (k: StatKey) => {
    if (selDie===null) return;
    setAssigns(p=>{ const n=[...p]; n[selDie]=k; return n; });
    setSelDie(null);
  };
  const clearAssign = (i: number) => {
    setAssigns(p=>{ const n=[...p]; n[i]=null; return n; });
    setSelDie(null);
  };
  const resetAssigns = () => { setAssigns([null,null,null]); setSelDie(null); };
  const allAssigned = assigns.every(a=>a!==null);
  const finalStat = (k: StatKey) => base[k] + assigns.reduce((s,a,i)=>a===k?s+allocDice[i]:s, 0);

  // ── Begin battle ────────────────────────────────────────────────────────────
  const handleBeginBattle = () => {
    if (!allAssigned) return;
    const pFinal: Stats = { strength:finalStat('strength'), health:finalStat('health'), stamina:finalStat('stamina') };
    const aiAlign: Alignment = alignment==='good'?'evil':'good';
    const aiBase   = generateAIStats(1);
    const aiName   = pick(AI_NAMES[aiAlign][rarity]);
    const pMaxHp   = calcMaxHp(pFinal.health);
    const aMaxHp   = calcMaxHp(aiBase.health);
    const aac      = ALIGN_CFG[aiAlign];

    const pF: Fighter = { name:playerName||'Your Critter', rarity, alignment, base, final:pFinal, hp:pMaxHp, maxHp:pMaxHp };
    const aF: Fighter = { name:aiName, rarity, alignment:aiAlign, base:aiBase, final:aiBase, hp:aMaxHp, maxHp:aMaxHp };
    setStage(1);
    setPlayer(pF); setAI(aF); setRound(1); setWinner(null);
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setLog([
      {id:uid(),type:'info',text:`⚔️  Battle begins!  ${playerName}  vs  ${aiName}`},
      {id:uid(),type:'info',text:`You — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pMaxHp} HP · 🛡️ DEF ${pFinal.stamina}`},
      {id:uid(),type:'info',text:`${aiName} — ${aac.icon} ${aac.label} · STR ${aiBase.strength} · ❤️ ${aMaxHp} HP · 🛡️ DEF ${aiBase.stamina}`},
    ]);
    setBattleStep('choose'); setPlayerAction(null);
    setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── Real critter battle ─────────────────────────────────────────────────────
  const handleGenerateName = () => setPlayerName(pick(GUILD_NAMES[guild]));

  const handleRealStat = (k: StatKey, delta: number) => {
    const [min, max] = RANK_RANGE[rarity];
    setBase(b => ({ ...b, [k]: Math.max(min, Math.min(max, b[k] + delta)) }));
  };

  const handleRealSetupContinue = () => {
    const [min] = RANK_RANGE[rarity];
    setBase({ strength: min, health: min, stamina: min });
    setPlayerName('');
    setPhase('real-stats');
  };

  const handleBeginRealBattle = () => {
    const name    = playerName.trim() || pick(GUILD_NAMES[guild]);
    const pFinal  = { ...base };
    const aiAlign: Alignment = alignment === 'good' ? 'evil' : 'good';
    const aiBase  = generateAIStats(1);
    const aiName  = pick(AI_NAMES[aiAlign][rarity]);
    const pMaxHp  = calcMaxHp(pFinal.health);
    const aMaxHp  = calcMaxHp(aiBase.health);
    const aac     = ALIGN_CFG[aiAlign];

    const pF: Fighter = { name, rarity, alignment, guild, base, final: pFinal, hp: pMaxHp, maxHp: pMaxHp };
    const aF: Fighter = { name: aiName, rarity, alignment: aiAlign, base: aiBase, final: aiBase, hp: aMaxHp, maxHp: aMaxHp };

    setCritterMode('real'); setStage(1);
    setPlayer(pF); setAI(aF); setRound(1); setWinner(null);
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setLog([
      {id:uid(),type:'info',text:`⚔️  Battle begins!  ${name}  vs  ${aiName}`},
      {id:uid(),type:'info',text:`You — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pMaxHp} HP · 🛡️ DEF ${pFinal.stamina}`},
      {id:uid(),type:'info',text:`${aiName} — ${aac.icon} ${aac.label} · STR ${aiBase.strength} · ❤️ ${aMaxHp} HP · 🛡️ DEF ${aiBase.stamina}`},
    ]);
    setBattleStep('choose'); setPlayerAction(null);
    setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── Combat ──────────────────────────────────────────────────────────────────
  const handleChooseAction = (action: Action) => {
    setPlayerAction(action); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setBattleStep('player-rolling');
  };

  const handleCombatRoll = () => {
    if (combatRolling||!player||!ai||!playerAction) return;
    const snapP=player, snapA=ai, snapAct=playerAction, snapAiH=aiHeals, snapAiD=aiDefended, snapPS=playerShield, snapAS=aiShield;
    setCombatRolling(true);
    const finalRoll = rollD6();
    const schedule  = [...Array(8).fill(50),...Array(6).fill(100),...Array(4).fill(160),...Array(2).fill(300),...Array(2).fill(450)];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) { setCombatRoll(rollD6()); setTimeout(tick, schedule[i++]); }
      else {
        setCombatRoll(finalRoll); setCombatRolling(false);
        const aiAct = pickAIAction(snapA, snapP, lastPlayerAct, snapAiH, snapAiD);
        const aiR   = rollD6();
        setRevealedAIAct(aiAct); setRevealedAIRoll(aiR);
        resolveRound(snapAct, finalRoll, aiAct, aiR, snapP, snapA, snapPS, snapAS);
      }
    };
    tick();
  };

  const resolveRound = (pAct:Action, pRoll:number, aAct:Action, aRoll:number, curP:Fighter, curA:Fighter, curPS:number, curAS:number) => {
    setBattleStep('animating'); setLastPlayerAct(pAct);
    if (pAct === 'heal')   setPlayerHeals(h => h + 1);
    if (aAct === 'heal')   setAiHeals(h => h + 1);
    if (pAct === 'defend') { setPlayerDefended(true); setPlayerShieldMax(pRoll + curP.final.stamina); }
    if (aAct === 'defend') { setAiDefended(true);    setAiShieldMax(aRoll + curA.final.stamina); }

    const pass_p = calcPassive(curP), pass_a = calcPassive(curA);

    // ── Shield gains this round ──────────────────────────────────────────────
    const pShieldGain = pAct === 'defend' ? pRoll + curP.final.stamina : 0;
    const aShieldGain = aAct === 'defend' ? aRoll + curA.final.stamina : 0;
    let pShieldRun = curPS + pShieldGain;
    let aShieldRun = curAS + aShieldGain;

    // ── Player attacks AI ────────────────────────────────────────────────────
    let pDmg = 0, pCrit = false, aShieldAbsorb = 0;
    if (pAct === 'attack') {
      pCrit = pRoll === 6;
      const raw = pRoll + curP.final.strength + (pCrit ? 3 : 0);
      if (aShieldRun > 0) {
        aShieldAbsorb = Math.min(aShieldRun, raw);
        aShieldRun    = Math.max(0, aShieldRun - aShieldAbsorb);
        pDmg          = Math.max(0, raw - aShieldAbsorb);
      } else {
        pDmg = Math.max(0, raw - pass_a);
      }
    }

    // ── AI attacks player ────────────────────────────────────────────────────
    let aDmg = 0, aCrit = false, pShieldAbsorb = 0;
    if (aAct === 'attack') {
      aCrit = aRoll === 6;
      const raw = aRoll + curA.final.strength + (aCrit ? 3 : 0);
      if (pShieldRun > 0) {
        pShieldAbsorb = Math.min(pShieldRun, raw);
        pShieldRun    = Math.max(0, pShieldRun - pShieldAbsorb);
        aDmg          = Math.max(0, raw - pShieldAbsorb);
      } else {
        aDmg = Math.max(0, raw - pass_p);
      }
    }

    const pHeal = pAct === 'heal' ? pRoll + curP.final.health : 0;
    const aHeal = aAct === 'heal' ? aRoll + curA.final.health : 0;

    // Final shield values after all combat
    const pShieldFinal = pShieldRun;
    const aShieldFinal = aShieldRun;

    // ── HP calcs ─────────────────────────────────────────────────────────────
    const aiHpMid       = Math.min(curA.maxHp, Math.max(0, curA.hp - pDmg));
    const playerHpMid   = Math.min(curP.maxHp, Math.max(0, curP.hp + pHeal));
    const aiHpFinal     = Math.min(curA.maxHp, Math.max(0, aiHpMid + aHeal));
    const playerHpFinal = Math.min(curP.maxHp, Math.max(0, playerHpMid - aDmg));
    const aiDefeated    = aiHpMid <= 0;
    const playerDefeated = !aiDefeated && playerHpFinal <= 0;

    const pMove = pAct==='attack' ? pick(MOVES[curP.alignment][curP.rarity])
      : pAct==='defend' ? pick(DEFEND_NAMES[curP.alignment]) : pick(HEAL_NAMES[curP.alignment]);
    const aMove = aAct==='attack' ? pick(MOVES[curA.alignment][curA.rarity])
      : aAct==='defend' ? pick(DEFEND_NAMES[curA.alignment]) : pick(HEAL_NAMES[curA.alignment]);
    const aac = ALIGN_CFG[curA.alignment];

    // ── Log ──────────────────────────────────────────────────────────────────
    const entries: LogEntry[] = [{id:uid(),type:'separator',text:`── Round ${round} ──`}];

    if (pAct==='attack') {
      const sNote = aShieldAbsorb > 0 ? ` (shield −${aShieldAbsorb})` : ` (passive ${pass_a})`;
      entries.push({id:uid(),type:pCrit?'critical':'hit',who:'player',
        text:`${ac.icon} ${pMove}: roll ${pRoll}+${curP.final.strength}${pCrit?'+3🎯':''}=${pRoll+curP.final.strength+(pCrit?3:0)}${sNote} → ${pDmg} dmg`});
    } else if (pAct==='defend') {
      entries.push({id:uid(),type:'block',who:'player',
        text:`🛡️ ${pMove}: +${pShieldGain} shield (${curP.final.stamina} STA + roll ${pRoll})`});
    } else {
      entries.push({id:uid(),type:'heal',who:'player',
        text:`💊 ${pMove}: +${pHeal} HP (You: ${playerHpFinal} HP)`});
    }

    if (aAct==='attack') {
      const sNote = pShieldAbsorb > 0 ? ` (shield −${pShieldAbsorb})` : ` (passive ${pass_p})`;
      entries.push({id:uid(),type:aCrit?'critical':'hit',who:'ai',
        text:`${aac.icon} ${aMove}: roll ${aRoll}+${curA.final.strength}${aCrit?'+3🎯':''}=${aRoll+curA.final.strength+(aCrit?3:0)}${sNote} → ${aDmg} dmg`});
    } else if (aAct==='defend') {
      entries.push({id:uid(),type:'block',who:'ai',
        text:`🛡️ ${curA.name} ${aMove}: +${aShieldGain} shield (${curA.final.stamina} STA + roll ${aRoll})`});
    } else {
      entries.push({id:uid(),type:'heal',who:'ai',
        text:`💊 ${curA.name} ${aMove}: +${aHeal} HP (${curA.name}: ${aiHpFinal} HP)`});
    }
    if (aiDefeated||playerDefeated)
      entries.push({id:uid(),type:'info',text:aiDefeated?`🏆 ${curA.name} defeated! Victory!`:`💀 ${curP.name} falls! ${aac.icon} ${curA.name} wins.`});

    // ── Animation ─────────────────────────────────────────────────────────────
    const pSpotType: Spotlight['type'] = pAct==='attack'?(pCrit?'critical':'attack'):pAct==='defend'?'block':'heal';
    setAnimStep('p-act');
    showSpot({title:pMove, detail:`${ac.icon} ${ACTION_CFG[pAct].label}`, color:ac.color, type:pSpotType});

    setTimeout(() => {
      setAnimStep('a-hit');
      if (pAct==='attack') {
        if (pDmg > 0) {
          setFloatDmg({val:pDmg,color:'#f87171',side:'ai',id:uid()});
          setAI(p=>p?{...p,hp:aiHpMid}:p);
          setAiShield(aShieldFinal);
          const absNote = aShieldAbsorb > 0 ? ` · shield −${aShieldAbsorb}` : '';
          showSpot({title:pCrit?`🎯 Critical! −${pDmg}`:`Hit! −${pDmg}`,
            detail:`${curA.name}: ${aiHpMid} HP${absNote}`,color:ac.color,type:pCrit?'critical':'damage'});
        } else if (aShieldAbsorb > 0) {
          setAiShield(aShieldFinal);
          showSpot({title:'🛡️ Shield Absorbed!',
            detail:`${curA.name}'s shield held · ${aShieldFinal} remaining`,color:'#6ee7b7',type:'block'});
        } else {
          showSpot({title:'🛡️ Resisted!',detail:'Passive resist absorbed the hit',color:'#6ee7b7',type:'block'});
        }
      } else if (pAct==='heal') {
        setFloatDmg({val:-pHeal,color:'#4ade80',side:'player',id:uid()});
        setPlayer(p=>p?{...p,hp:playerHpMid}:p);
        showSpot({title:`+${pHeal} HP`,detail:`You: ${playerHpMid} HP`,color:'#4ade80',type:'heal'});
      } else {
        // player defended — show the new shield (before AI attacks)
        setPlayerShield(curPS + pShieldGain);
        showSpot({title:`🛡️ +${pShieldGain} Shield`,
          detail:`${curP.final.stamina} STA + roll ${pRoll} · Total: ${curPS + pShieldGain}`,color:'#6ee7b7',type:'block'});
      }

      if (aiDefeated) { setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,'player'),2000); return; }

      setTimeout(()=>{
        const aSpotType: Spotlight['type'] = aAct==='attack'?(aCrit?'critical':'attack'):aAct==='defend'?'block':'heal';
        setAnimStep('a-act');
        showSpot({title:aMove,detail:`${aac.icon} ${ACTION_CFG[aAct].label}`,color:aac.color,type:aSpotType});

        setTimeout(()=>{
          setAnimStep('p-hit');
          if (aAct==='attack') {
            if (aDmg > 0) {
              setFloatDmg({val:aDmg,color:'#f87171',side:'player',id:uid()});
              setPlayer(p=>p?{...p,hp:playerHpFinal}:p);
              setPlayerShield(pShieldFinal);
              const absNote = pShieldAbsorb > 0 ? ` · shield −${pShieldAbsorb}` : '';
              showSpot({title:aCrit?`🎯 Critical! −${aDmg}`:`Hit! −${aDmg}`,
                detail:`You: ${playerHpFinal} HP${absNote}`,color:aac.color,type:aCrit?'critical':'damage'});
            } else if (pShieldAbsorb > 0) {
              setPlayerShield(pShieldFinal);
              showSpot({title:'🛡️ Shield Held!',
                detail:`Your shield absorbed it all · ${pShieldFinal} remaining`,color:'#6ee7b7',type:'block'});
            } else {
              showSpot({title:'🛡️ Resisted!',detail:'Passive resist absorbed the hit',color:'#6ee7b7',type:'block'});
            }
          } else if (aAct==='heal') {
            setFloatDmg({val:-aHeal,color:'#4ade80',side:'ai',id:uid()});
            setAI(p=>p?{...p,hp:aiHpFinal}:p);
            showSpot({title:`+${aHeal} HP`,detail:`${curA.name}: ${aiHpFinal} HP`,color:'#4ade80',type:'heal'});
          } else {
            // AI defended — show the new shield
            setAiShield(aShieldFinal);
            showSpot({title:`🛡️ +${aShieldGain} Shield`,
              detail:`${curA.final.stamina} STA + roll ${aRoll} · ${curA.name}: ${aShieldFinal} shield`,color:'#6ee7b7',type:'block'});
          }
          setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,playerDefeated?'ai':null),2000);
        },1000);
      },2000);
    },1000);
  };

  const finishRound = (entries:LogEntry[], _p:number, _a:number, rWinner:'player'|'ai'|null) => {
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setLog(p=>[...p,...entries]); setRound(p=>p+1);
    if (rWinner) { setWinner(rWinner); if(rWinner==='player')setStreak(p=>p+1); setPhase('result'); }
    else { setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null); }
  };

  const handleNextBattle = () => {
    if (!player) return;
    const newStage = stage + 1;
    setStage(newStage);
    const aiAlign: Alignment = alignment==='good'?'evil':'good';
    const aiBase  = generateAIStats(newStage);
    const aiName  = pick(AI_NAMES[aiAlign][rarity]);
    const aMaxHp  = calcMaxHp(aiBase.health);
    setPlayer(p=>p?{...p,hp:p.maxHp}:p);
    setAI({name:aiName,rarity,alignment:aiAlign,base:aiBase,final:aiBase,hp:aMaxHp,maxHp:aMaxHp});
    setRound(1); setWinner(null); setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setLog([{id:uid(),type:'info',text:`⚔️  Stage ${newStage} — ${aiName} enters!`},
            {id:uid(),type:'info',text:`${aiName} — STR ${aiBase.strength} · ❤️ ${aMaxHp} HP · 🛡️ DEF ${aiBase.stamina}`},
            {id:uid(),type:'info',text:`Your HP restored to ${player.maxHp}.`}]);
    setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  const handleReset = () => {
    setPhase('mode'); setAllocDice([]); setAssigns([null,null,null]); setSelDie(null);
    setPlayer(null); setAI(null); setLog([]); setRound(1);
    setWinner(null); setStreak(0);
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setStage(1);
    setBattleStep('choose');
    setPlayerAction(null); setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setEnchanted(false); setBase({strength:0,health:0,stamina:0}); setPlayerName('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal"
        style={{'--rarity-color':rc,'--rarity-glow':rg,'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}
        onClick={e=>e.stopPropagation()}>
        <button className="bg-close" onClick={onClose}>✕</button>

        {/* Round + Stage badge */}
        {phase==='battle' && (
          <div className="bg-round-badge">
            <span className="bg-badge-rnd">Rnd {round}</span>
            <span className="bg-badge-dot">·</span>
            <span className="bg-badge-stg">Stage {stage}</span>
          </div>
        )}

        {/* ── STEP 0: Mode chooser ── */}
        {phase==='mode' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Enter the Arena</h2>
            <p className="bg-sub">Choose how to create your critter.</p>
            <div className="bg-mode-row">
              <button className="bg-mode-btn" onClick={()=>{ setCritterMode('real'); setPhase('real-setup'); }}>
                <span className="bgm-icon">🃏</span>
                <span className="bgm-title">Use Your Critter</span>
                <span className="bgm-desc">Enter stats from your real card</span>
              </button>
              <button className="bg-mode-btn" onClick={()=>{ setCritterMode('generated'); setPhase('setup'); }}>
                <span className="bgm-icon">🎲</span>
                <span className="bgm-title">Generate a Critter</span>
                <span className="bgm-desc">Roll and build from scratch</span>
              </button>
            </div>
          </div>
        )}

        {/* ── REAL SETUP: Alignment + Rank + Guild ── */}
        {phase==='real-setup' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Your Card</p>
            <h2 className="bg-title">Set Up Your Critter</h2>

            <div className="bg-section-lbl">Alignment</div>
            <div className="bg-align-row">
              {(['good','evil'] as Alignment[]).map(a=>{
                const cfg=ALIGN_CFG[a], active=alignment===a;
                return (
                  <button key={a} onClick={()=>setAlignment(a)}
                    className={`bg-align-btn ${active?'bg-align-btn--on':''}`}
                    style={active?{borderColor:cfg.color,boxShadow:`0 0 24px ${cfg.glow}`}:{}}>
                    <span className="bab-icon">{cfg.icon}</span>
                    <span className="bab-label" style={active?{color:cfg.color}:{}}>{cfg.label}</span>
                    <span className="bab-desc">{a==='good'?'Honor & holy power':'Dark power & cunning'}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-section-lbl" style={{marginTop:'0.5rem'}}>Rank</div>
            <div className="bg-diff-row">
              {(['rare','unique','legendary'] as Rarity[]).map(r=>{
                const active=rarity===r;
                return (
                  <button key={r} onClick={()=>setRarity(r)}
                    className={`bg-diff-btn ${active?'bg-diff-btn--on':''}`}
                    style={active?{borderColor:rarityColor[r],boxShadow:`0 0 14px ${rarityGlow[r]}`}:{}}>
                    <span className="bdb-icon">{DIFFICULTY_CFG[r].icon}</span>
                    <span className="bdb-rarity" style={active?{color:rarityColor[r]}:{}}>{r[0].toUpperCase()+r.slice(1)}</span>
                    <span className="bdb-diff">Stats {RANK_RANGE[r][0]}–{RANK_RANGE[r][1]}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-section-lbl" style={{marginTop:'0.5rem'}}>Guild</div>
            <div className="bg-guild-row">
              {(['rabbit','fox','squirrel','rogue'] as Guild[]).map(g=>{
                const active=guild===g;
                return (
                  <button key={g} onClick={()=>setGuild(g)}
                    className={`bg-guild-btn ${active?'bg-guild-btn--on':''}`}
                    style={active?{borderColor:ac.color,boxShadow:`0 0 16px ${ac.glow}`}:{}}>
                    <span className="bgui-icon">{GUILD_ICONS[g]}</span>
                    <span className="bgui-name">{g[0].toUpperCase()+g.slice(1)}</span>
                  </button>
                );
              })}
            </div>

            <button className="bg-cta" onClick={handleRealSetupContinue}
              style={{borderColor:ac.color,color:ac.color}}>
              Continue →
            </button>
          </div>
        )}

        {/* ── REAL STATS: Name + stat steppers ── */}
        {phase==='real-stats' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Your Card · {GUILD_ICONS[guild]} {guild[0].toUpperCase()+guild.slice(1)}</p>
            <h2 className="bg-title">Enter Your Stats</h2>
            <p className="bg-sub" style={{fontSize:'0.8rem',opacity:0.65}}>
              {rarity[0].toUpperCase()+rarity.slice(1)} range: {RANK_RANGE[rarity][0]}–{RANK_RANGE[rarity][1]}
            </p>

            <div className="bg-name-row">
              <input
                className="bg-name-input"
                type="text"
                placeholder="Critter name…"
                value={playerName}
                onChange={e=>setPlayerName(e.target.value)}
                maxLength={24}
              />
              <button className="bg-cta bg-cta--ghost" onClick={handleGenerateName} style={{whiteSpace:'nowrap'}}>
                🎲 Generate
              </button>
            </div>

            <div className="bg-stat-inputs">
              {([
                ['strength','⚔️','Strength'],
                ['health',  '❤️','Health'  ],
                ['stamina', '🛡️','Defense' ],
              ] as [StatKey,string,string][]).map(([k,icon,name])=>{
                const [mn,mx] = RANK_RANGE[rarity];
                return (
                  <div key={k} className="bg-stat-row">
                    <span className="bg-stat-icon">{icon}</span>
                    <span className="bg-stat-name">{name}</span>
                    <div className="bg-stat-ctrl">
                      <button onClick={()=>handleRealStat(k,-1)} disabled={base[k]<=mn}>−</button>
                      <span>{base[k]}</span>
                      <button onClick={()=>handleRealStat(k, 1)} disabled={base[k]>=mx}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-es-hp" style={{maxWidth:'340px',width:'100%'}}>
              <span>Starting HP</span>
              <span style={{color:ac.color,fontFamily:'var(--font-heading)',fontWeight:700}}>{calcMaxHp(base.health)}</span>
            </div>

            <button className="bg-cta" onClick={handleBeginRealBattle}
              style={{borderColor:ac.color,color:ac.color}}>
              ⚔️ Enter the Arena
            </button>
          </div>
        )}

        {/* ── STEP 1 + 2: Select alignment + difficulty ── */}
        {phase==='setup' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Choose Your Path</h2>

            <div className="bg-section-lbl">Your Allegiance</div>
            <div className="bg-align-row">
              {(['good','evil'] as Alignment[]).map(a=>{
                const cfg=ALIGN_CFG[a], active=alignment===a;
                return (
                  <button key={a} onClick={()=>setAlignment(a)}
                    className={`bg-align-btn ${active?'bg-align-btn--on':''}`}
                    style={active?{borderColor:cfg.color,boxShadow:`0 0 24px ${cfg.glow}`}:{}}>
                    <span className="bab-icon">{cfg.icon}</span>
                    <span className="bab-label" style={active?{color:cfg.color}:{}}>{cfg.label}</span>
                    <span className="bab-desc">{a==='good'?'Honor & holy power':'Dark power & cunning'}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-section-lbl" style={{marginTop:'0.5rem'}}>Difficulty</div>
            <div className="bg-diff-row">
              {(['rare','unique','legendary'] as Rarity[]).map(r=>{
                const cfg=DIFFICULTY_CFG[r], active=rarity===r;
                return (
                  <button key={r} onClick={()=>setRarity(r)}
                    className={`bg-diff-btn ${active?'bg-diff-btn--on':''}`}
                    style={active?{borderColor:rarityColor[r],boxShadow:`0 0 14px ${rarityGlow[r]}`}:{}}>
                    <span className="bdb-icon">{cfg.icon}</span>
                    <span className="bdb-rarity" style={active?{color:rarityColor[r]}:{}}>{r[0].toUpperCase()+r.slice(1)}</span>
                    <span className="bdb-diff">{cfg.diff}</span>
                    <span className="bdb-desc">{cfg.desc}</span>
                  </button>
                );
              })}
            </div>

            <button className="bg-cta" onClick={handleStartEnchant} style={{borderColor:ac.color,color:ac.color}}>
              ✨ Enchant Animal →
            </button>
          </div>
        )}

        {/* ── STEP 3: Enchant — show generated stats ── */}
        {phase==='enchant' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Your Critter</p>
            <h2 className="bg-title">{enchanted ? playerName : '???'}</h2>
            <p className="bg-sub">{ac.icon} {ac.label} · {DIFFICULTY_CFG[rarity].icon} {rarity[0].toUpperCase()+rarity.slice(1)} ({DIFFICULTY_CFG[rarity].diff})</p>

            {!enchanted ? (
              <>
                <p className="bg-sub" style={{opacity:0.55,fontSize:'0.82rem'}}>
                  Tap the button to reveal your critter's destiny.
                </p>
                <button className="bg-cta bg-enchant-btn" onClick={handleEnchant} style={{borderColor:ac.color,color:ac.color}}>
                  ✨ Enchant Animal
                </button>
              </>
            ) : (
              <>
                <div className="bg-enchant-stats">
                  {([['strength','⚔️','STR'],['health','❤️','HP'],['stamina','🛡️','DEF']] as [StatKey,string,string][]).map(([k,icon,lbl])=>(
                    <div key={k} className="bg-es-item">
                      <span className="bg-es-icon">{icon}</span>
                      <span className="bg-es-lbl">{lbl}</span>
                      <span className="bg-es-val" style={{color:ac.color}}>{base[k]}</span>
                      <div className="bg-es-bar">
                        <div className="bg-es-fill" style={{width:`${(base[k]/9)*100}%`,background:ac.color}}/>
                      </div>
                    </div>
                  ))}
                  <div className="bg-es-hp">
                    <span>Starting HP</span>
                    <span style={{color:ac.color,fontFamily:'var(--font-heading)',fontWeight:700}}>{calcMaxHp(base.health)}</span>
                  </div>
                </div>
                <p className="bg-sub" style={{fontSize:'0.75rem',opacity:0.5}}>Stats are sealed by fate — no rerolls.</p>
                <div className="bg-enchant-actions">
                  <button className="bg-cta bg-cta--ghost" onClick={()=>{setEnchanted(false);setBase({strength:0,health:0,stamina:0});setPlayerName('');}}>
                    ↺ New Alignment/Difficulty
                  </button>
                  <button className="bg-cta" onClick={()=>{setAllocDice([]);setAssigns([null,null,null]);setSelDie(null);setPhase('rolling');}} style={{borderColor:ac.color,color:ac.color}}>
                    🎲 Roll Dice →
                  </button>
                </div>
              </>
            )}

          </div>
        )}

        {/* ── STEP 4: Roll dice — click any die ── */}
        {phase==='rolling' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle · {playerName}</p>
            <h2 className="bg-title">Roll Your Dice</h2>
            <p className="bg-sub" style={{fontSize:'0.82rem',opacity:0.7}}>Click any die to roll all 3 D6s and boost your stats.</p>
            <div className="bg-dice-row">
              {(allocDice.length===3?allocDice:[0,0,0]).map((v,i)=>(
                <D6Die key={i}
                  value={allocDice.length===3?v:'?'}
                  spinning={allocRolling} large
                  onClick={!allocRolling && allocDice.length<3 ? handleAllocRoll : undefined}
                />
              ))}
            </div>
            {allocRolling && <p style={{fontSize:'0.8rem',color:'var(--text-dim)',fontStyle:'italic'}}>Rolling…</p>}
            {allocDice.length===3 && !allocRolling && (
              <button className="bg-cta" onClick={()=>setPhase('allocating')} style={{borderColor:ac.color,color:ac.color}}>
                Assign Stats →
              </button>
            )}
          </div>
        )}

        {/* ── STEP 5: Assign dice — with × undo ── */}
        {phase==='allocating' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle · {playerName}</p>
            <h2 className="bg-title">Assign Your Dice</h2>
            <p className="bg-sub" style={{fontSize:'0.82rem',opacity:0.7}}>Select a die, then tap a stat. Click × on a die to un-assign.</p>

            <div className="bg-dice-row">
              {allocDice.map((v,i)=>(
                <div key={i} className="bg-die-slot">
                  <D6Die value={v} large selected={selDie===i} used={assigns[i]!==null}
                    onClick={()=>assigns[i]===null&&setSelDie(selDie===i?null:i)}
                  />
                  {assigns[i]!==null && (
                    <button className="bg-die-clear" onClick={()=>clearAssign(i)}
                      title={`Remove ${assigns[i]} assignment`}>
                      {({strength:'⚔️',health:'❤️',stamina:'🛡️'} as Record<StatKey,string>)[assigns[i]!]} ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-alloc-stats">
              {(['strength','health','stamina'] as StatKey[]).map(k=>{
                const icons:Record<StatKey,string>={strength:'⚔️',health:'❤️',stamina:'🛡️'};
                const names:Record<StatKey,string>={strength:'Strength',health:'Health',stamina:'Defense'};
                const bonus = assigns.reduce((s,a,i)=>a===k?s+allocDice[i]:s,0);
                return (
                  <button key={k} onClick={()=>handleAssign(k)} disabled={selDie===null}
                    className={`bg-alloc-btn ${selDie!==null?'bg-alloc-btn--ready':''}`}>
                    <span>{icons[k]}</span>
                    <span className="bab-name">{names[k]}</span>
                    <span className="bab-val">
                      {base[k]}{bonus>0&&<> <span className="bab-plus">+{bonus}</span> = <strong>{base[k]+bonus}</strong></>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="bg-alloc-footer">
              <button className="bg-cta bg-cta--ghost" onClick={resetAssigns} disabled={assigns.every(a=>a===null)}>
                ↺ Reset Dice
              </button>
              <button className="bg-cta" onClick={handleBeginBattle} disabled={!allAssigned}
                style={{borderColor:ac.color,color:ac.color,opacity:allAssigned?1:0.4}}>
                ⚔️ Begin Battle
              </button>
            </div>
          </div>
        )}

        {/* ── BATTLE ── */}
        {phase==='battle' && player && ai && (
          <div className="bg-arena">
            <FighterCard fighter={player} label="You"   animStep={animStep} side="player" floatDmg={floatDmg} shield={playerShield} shieldMax={playerShieldMax}/>
            <FighterCard fighter={ai}     label="Rival" animStep={animStep} side="ai"    floatDmg={floatDmg} shield={aiShield}    shieldMax={aiShieldMax}/>

            <div className="bg-log" ref={logRef}>
              {log.map(e=>(
                <p key={e.id} className={['bl-entry',`bl-${e.type}`,e.who?`bl-${e.who}`:''].filter(Boolean).join(' ')}>
                  {e.text}
                </p>
              ))}
              {battleStep==='animating'&&<p className="bl-entry bl-thinking">…resolving…</p>}
            </div>

            <div className="bg-bottom">
              <SpotlightPanel key={spotKey} spot={spotlight}/>

              {battleStep==='choose' && (
                <div className="bg-action-btns">
                  {(['attack','defend','heal'] as Action[])
                    .filter(a => !(a==='defend' && playerDefended) && !(a==='heal' && playerHeals>=3))
                    .map(a=>(
                      <button key={a} className="bg-action-btn" onClick={()=>handleChooseAction(a)}>
                        <span className="bact-icon">{ACTION_CFG[a].icon}</span>
                        <span className="bact-label">{ACTION_CFG[a].label}</span>
                        {a==='heal' && <span className="bact-uses">{3-playerHeals} left</span>}
                      </button>
                    ))
                  }
                </div>
              )}

              {battleStep==='player-rolling' && (
                <div className="bg-roll-area">
                  <p className="bg-roll-hint">
                    {ACTION_CFG[playerAction!].icon} <strong>{ACTION_CFG[playerAction!].label}</strong> — click the die to roll!
                  </p>
                  <D6Die value={combatRoll??'?'} spinning={combatRolling} large
                    onClick={!combatRolling&&combatRoll===null?handleCombatRoll:undefined}/>
                  {combatRolling&&<p className="bg-roll-hint" style={{opacity:0.5,fontStyle:'italic'}}>Rolling…</p>}
                </div>
              )}

              {battleStep==='animating'&&revealedAIAct&&(
                <div className="bg-ai-reveal">
                  <span className="bg-ai-reveal-you">You: <strong>{combatRoll}</strong> {ACTION_CFG[playerAction!].icon}</span>
                  <span className="bg-ai-reveal-sep">·</span>
                  <span className="bg-ai-reveal-act">Rival: <strong>{revealedAIRoll}</strong> {ACTION_CFG[revealedAIAct].icon}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase==='result' && (
          <div className="bg-panel bg-result">
            <div className="bg-result-icon">{winner==='player'?'🏆':'💀'}</div>
            <h2 className={`bg-title ${winner==='player'?'bg-win':'bg-lose'}`}>
              {winner==='player'?'Victory!':'Defeated'}
            </h2>
            {winner==='player'&&streak>0&&<p className="bg-streak">🔥 {streak} win{streak>1?'s':''} in a row</p>}
            <p className="bg-sub">{winner==='player'?`${ac.icon} ${playerName} stands triumphant!`:`${playerName} has fallen. Train harder.`}</p>
            <div className="bg-result-log">
              {log.slice(-6).map(e=>(
                <p key={e.id} className={['bl-entry',`bl-${e.type}`].join(' ')}>{e.text}</p>
              ))}
            </div>
            <div className="bg-result-btns">
              {winner==='player'&&(
                <button className="bg-cta" onClick={handleNextBattle} style={{borderColor:ac.color,color:ac.color}}>
                  ⚔️ Next Rival →
                </button>
              )}
              <button className="bg-cta bg-cta--ghost" onClick={handleReset}>
                {winner==='player'?'New Critter':'↺ Try Again'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
