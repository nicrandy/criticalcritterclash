import { useState, useRef, useEffect } from 'react';
import { rarityColor, rarityGlow } from './critters';
import { supabase, submitStageScore, recordBattle, awardBattleXp, levelFromXp, xpForLevel, type BattleRecord, type RoundSnap } from './supabaseClient';
import { QrScanner } from './QrScanner';

// ─── Critter photos (used as boss portraits) ──────────────────────────────────
const _critterMods = import.meta.glob(
  '../images/product_images/critters/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;
const CRITTER_PHOTOS = Object.values(_critterMods).filter(Boolean) as string[];

// ─── Types ────────────────────────────────────────────────────────────────────
type Rarity     = 'rare' | 'unique' | 'legendary';
type StatKey    = 'strength' | 'health' | 'stamina';
type Alignment  = 'good' | 'evil';
type Guild      = 'rabbit' | 'fox' | 'squirrel' | 'rogue';
type Action     = 'attack' | 'defend' | 'heal';
type Phase      = 'mode' | 'scan' | 'scan-setup' | 'setup' | 'rolling' | 'allocating' | 'real-setup' | 'real-stats' | 'battle' | 'result' | 'perk';
type BattleStep = 'choose' | 'player-rolling' | 'animating';
type AnimStep   = 'idle' | 'p-act' | 'a-hit' | 'a-act' | 'p-hit';

interface Stats   { strength: number; health: number; stamina: number; }
interface Fighter {
  name: string; rarity: Rarity; alignment: Alignment; guild?: Guild;
  base: Stats; final: Stats; hp: number; maxHp: number;
  bossBoostStat?: StatKey; img?: string; opponentId?: string | null;
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
interface PerkDef  { id: string; name: string; icon: string; desc: string; value?: number; }

interface BattleMeta {
  p: Fighter; a: Fighter;
  stage: number; deathCount: number; isBoss: boolean;
  maxHeals: number; bonusAtk: number; bonusPass: number;
  opponentId: string | null;
}
interface NamePart { word: string; bonus: Partial<Record<StatKey,number>>; bonusLabel: string; }

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
  heal:   { icon: '🧪', label: 'Heal'    },
};

const IDLE_SPOTLIGHT: Spotlight = { title:'', detail:'', color:'#888', type:'idle' };

// ─── Perk pool ────────────────────────────────────────────────────────────────
const ALL_PERKS: PerkDef[] = [
  { id:'sharpened',   name:'Sharpened',   icon:'⚔️', desc:'+1 Strength permanently' },
  { id:'fortified',   name:'Fortified',   icon:'🛡️', desc:'+1 Defense — bigger shield every stage' },
  { id:'vitality',    name:'Vitality',    icon:'❤️', desc:'+5 max HP permanently' },
  { id:'extra-vial',  name:'Extra Vial',  icon:'💊', desc:'+1 Heal charge (up to 4 total)' },
  { id:'blood-mend',  name:'Blood Mend',  icon:'🩸', desc:'Immediately restore 20 HP' },
  { id:'second-wind', name:'Second Wind', icon:'🌬️', desc:'Fully restore HP to maximum' },
  { id:'iron-skin',   name:'Iron Skin',   icon:'🪨', desc:'+1 passive damage reduction permanently' },
  { id:'relentless',  name:'Relentless',  icon:'⚡', desc:'+1 added to every attack roll' },
];

// ─── Name builder pools ───────────────────────────────────────────────────────
const ADJECTIVES: Record<Alignment, NamePart[]> = {
  good: [
    { word:'Holy',      bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Divine',    bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Blessed',   bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Sacred',    bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Pure',      bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Gilded',    bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Noble',     bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Radiant',   bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Hallowed',  bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Celestial', bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Dawn',      bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'True',      bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Brave',     bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Gleaming',  bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Light',     bonus:{strength:1}, bonusLabel:'+1 STR' },
  ],
  evil: [
    { word:'Cursed',    bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Shadow',    bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Void',      bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Bone',      bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Plague',    bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Fell',      bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Doom',      bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Blight',    bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Dark',      bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Wicked',    bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Grim',      bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Corrupt',   bonus:{health:1},   bonusLabel:'+1 HP'  },
    { word:'Vile',      bonus:{strength:1}, bonusLabel:'+1 STR' },
    { word:'Dread',     bonus:{stamina:1},  bonusLabel:'+1 DEF' },
    { word:'Hollow',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  ],
};

const CRITTERS: NamePart[] = [
  { word:'Fox',     bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Bear',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  { word:'Wolf',    bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Elk',     bonus:{stamina:1},  bonusLabel:'+1 DEF' },
  { word:'Toad',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  { word:'Hawk',    bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Raven',   bonus:{stamina:1},  bonusLabel:'+1 DEF' },
  { word:'Stag',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  { word:'Hare',    bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Badger',  bonus:{stamina:1},  bonusLabel:'+1 DEF' },
  { word:'Owl',     bonus:{stamina:1},  bonusLabel:'+1 DEF' },
  { word:'Deer',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  { word:'Lynx',    bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Drake',   bonus:{strength:2}, bonusLabel:'+2 STR' },
  { word:'Serpent', bonus:{stamina:2},  bonusLabel:'+2 DEF' },
  { word:'Boar',    bonus:{health:2},   bonusLabel:'+2 HP'  },
  { word:'Jackal',  bonus:{strength:1}, bonusLabel:'+1 STR' },
  { word:'Moth',    bonus:{health:1},   bonusLabel:'+1 HP'  },
  { word:'Crow',    bonus:{stamina:1},  bonusLabel:'+1 DEF' },
  { word:'Viper',   bonus:{strength:1}, bonusLabel:'+1 STR' },
];

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

// Stage-based AI: base grows 2 pts/stage, 3-pt spread, dice added on top.
// No 9-cap — AI stats can exceed 9 at high stages (stage 5 → 8-12, stage 9 → 16-19+).
function generateAIForStage(stage: number): { base: Stats; final: Stats; rarity: Rarity } {
  const base_min = Math.max(0, (stage - 1) * 2);
  const base_max = base_min + 3;
  const base: Stats = {
    strength: randInt(base_min, base_max),
    health:   randInt(base_min, base_max),
    stamina:  randInt(base_min, base_max),
  };
  // Dice: stages 1-2 → 1 die, 3-4 → 2 dice, 5+ → 3 dice
  const numDice = stage <= 2 ? 1 : stage <= 4 ? 2 : 3;
  const dice = Array.from({ length: numDice }, rollD6);
  const final = aiAllocateDice(base, dice);
  // Rarity for display / name pool
  const aiRarity: Rarity = stage <= 2 ? 'rare' : stage <= 4 ? 'unique' : 'legendary';
  return { base, final, rarity: aiRarity };
}

// Async matchmaking: pull a real critter from Supabase as the opponent.
// Tier mirrors the old generateAIForStage rarity bands so stage progression
// stays consistent (Rare → stages 1-2, Unique → 3-4, Legendary → 5+).
// Returns null if no eligible critter is found, so callers can fall back
// to the generated AI.
async function fetchRealOpponent(stage: number, excludeId: string | null):
  Promise<{ base: Stats; final: Stats; rarity: Rarity; name: string; id: string } | null> {
  const tier: Rarity = stage <= 2 ? 'rare' : stage <= 4 ? 'unique' : 'legendary';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  let query = supabase.from('critters')
    .select('id,name,rarity,strength,health,stamina')
    .eq('rarity', tierLabel);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(200);
  if (error || !data || data.length === 0) return null;
  const opp = data[Math.floor(Math.random() * data.length)] as
    { id: string; name: string | null; rarity: string; strength: number; health: number; stamina: number };
  const base: Stats = { strength: opp.strength, health: opp.health, stamina: opp.stamina };
  // Same dice-based scaling as the generated AI, applied on top of the
  // real critter's stats so later stages stay progressively harder.
  const numDice = stage <= 2 ? 1 : stage <= 4 ? 2 : 3;
  const dice = Array.from({ length: numDice }, rollD6);
  const final = aiAllocateDice(base, dice);
  return { base, final, rarity: tier, name: opp.name ?? 'Wild Critter', id: opp.id };
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
  const canHeal    = healCount < 1;   // AI gets exactly one heal
  const canDefend  = !hasDefended;    // AI gets exactly one defend
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

function D6Die({ value, spinning, selected, used, onClick, large, settled }: {
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

function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, (hp/maxHp)*100) : 0;
  const col = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';
  return <div className="hp-bar-track"><div className="hp-bar-fill" style={{width:`${pct}%`,background:col}}/></div>;
}

// ─── FighterCard — compact horizontal strip ───────────────────────────────────
function FighterCard({ fighter, label, animStep, side, floatDmg, shield, shieldMax, healsLeft, canDefend }: {
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
          {floatDmg!.val >= 0 ? `-${floatDmg!.val}` : `+${-floatDmg!.val}`}
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
export function BattleGame({ onClose, scannedId }: { onClose:()=>void; scannedId?: string | null }) {
  const [phase,          setPhase]         = useState<Phase>('mode');
  const [critterMode,    setCritterMode]   = useState<'real'|'generated'>('generated');
  const [alignment,      setAlignment]     = useState<Alignment>('good');
  const [rarity,         setRarity]        = useState<Rarity>('rare');
  const [guild,          setGuild]         = useState<Guild>('rabbit');
  const [base,           setBase]          = useState<Stats>({strength:0,health:0,stamina:0});
  const [playerName,     setPlayerName]    = useState('');

  const [allocDice,      setAllocDice]     = useState<number[]>([]);
  const [allocRolling,   setAllocRolling]  = useState(false);
  const [allocSettled,   setAllocSettled]  = useState(false);
  const [assigns,        setAssigns]       = useState<(StatKey|null)[]>([null,null,null]);
  const [selDie,         setSelDie]        = useState<number|null>(null);

  const [player,         setPlayer]        = useState<Fighter|null>(null);
  const [ai,             setAI]            = useState<Fighter|null>(null);

  const [battleStep,     setBattleStep]    = useState<BattleStep>('choose');
  const [playerAction,   setPlayerAction]  = useState<Action|null>(null);
  const [lastPlayerAct,  setLastPlayerAct] = useState<Action|null>(null);
  const [combatRoll,     setCombatRoll]    = useState<number|null>(null);
  const [combatRolling,  setCombatRolling] = useState(false);
  const [combatSettled,  setCombatSettled] = useState(false);
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
  const [maxPlayerHeals,  setMaxPlayerHeals]  = useState(3);
  const [bonusAttackRoll, setBonusAttackRoll] = useState(0);
  const [bonusPassive,    setBonusPassive]    = useState(0);
  const [perkChoices,     setPerkChoices]     = useState<PerkDef[]>([]);
  const [isBoss,          setIsBoss]          = useState(false);
  const [deathCount,      setDeathCount]      = useState(0);   // bonfire restarts this session

  // QR scan state
  const [scanId,       setScanId]       = useState('');
  const [scanLoading,  setScanLoading]  = useState(false);
  const [scanError,    setScanError]    = useState<string|null>(null);
  // ID of the player's scanned critter — used to lock the name field and
  // exclude self-matches during async opponent matchmaking.
  const [scannedCritterId, setScannedCritterId] = useState<string|null>(null);
  // Persistent level/XP for the scanned critter (from Supabase)
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerXp,    setPlayerXp]    = useState(0);
  // Set after a stage win once the award_battle_xp RPC resolves
  const [xpAward,     setXpAward]     = useState<{ xp: number; leveledUp: boolean; level: number; stat: StatKey | null } | null>(null);

  // Turn-order spin wheel
  const [turnSpinning, setTurnSpinning] = useState(false);
  const [turnFirst,    setTurnFirst]    = useState<'player'|'ai'|null>(null);

  // Name builder (generated critter mode)
  const [selectedAdj,      setSelectedAdj]      = useState<NamePart|null>(null);
  const [selectedCritter,  setSelectedCritter]  = useState<NamePart|null>(null);
  const [adjRollsLeft,     setAdjRollsLeft]     = useState(3);
  const [critterRollsLeft, setCritterRollsLeft] = useState(3);

  const logRef        = useRef<HTMLDivElement>(null);
  const roundsRef     = useRef<RoundSnap[]>([]);
  const battleMetaRef = useRef<BattleMeta | null>(null);
  useEffect(() => { if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Auto-load critter if opened via "Enter the Arena" from the scan page
  useEffect(() => {
    if (!scannedId) return;
    setScanId(scannedId);
    setScanLoading(true);
    supabase.from('critters').select('id, name, rarity, strength, health, stamina, level, xp')
      .eq('id', scannedId).single()
      .then(({ data, error }) => {
        setScanLoading(false);
        if (error || !data) { setPhase('scan'); setScanError('Critter not found. Enter your ID manually.'); return; }
        const r = (data.rarity as string).toLowerCase() as Rarity;
        setRarity(r);
        setBase({ strength: data.strength, health: data.health, stamina: data.stamina });
        setPlayerName(data.name ?? '');
        setCritterMode('real');
        setScannedCritterId(data.id);
        setPlayerLevel(data.level ?? 1);
        setPlayerXp(data.xp ?? 0);
        setPhase('scan-setup');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rc = rarityColor[rarity];
  const rg = rarityGlow[rarity];
  const ac = ALIGN_CFG[alignment];

  const showSpot = (s: Spotlight) => { setSpotlight(s); setSpotKey(k=>k+1); };

  // ── Generated critter: auto-roll stats + name, skip reveal screen ───────────
  const handleStartEnchant = () => {
    const newBase: Stats = {
      strength: rollStatForRarity(rarity),
      health:   rollStatForRarity(rarity),
      stamina:  rollStatForRarity(rarity),
    };
    setBase(newBase);
    // Pick initial adjective + critter; player can reroll each up to 3 times
    const initAdj     = pick(ADJECTIVES[alignment]);
    const initCritter = pick(CRITTERS);
    setSelectedAdj(initAdj);
    setSelectedCritter(initCritter);
    setAdjRollsLeft(3);
    setCritterRollsLeft(3);
    setPlayerName(`${initAdj.word} ${initCritter.word}`);
    setAllocDice([]); setAssigns([null,null,null]); setSelDie(null); setAllocSettled(false);
    setPhase('rolling');
  };

  const handleRerollAdj = () => {
    if (adjRollsLeft <= 0) return;
    const pool = ADJECTIVES[alignment].filter(a => a.word !== selectedAdj?.word);
    const next = pick(pool.length ? pool : ADJECTIVES[alignment]);
    setSelectedAdj(next);
    setAdjRollsLeft(r => r - 1);
    setPlayerName(`${next.word} ${selectedCritter?.word ?? ''}`);
  };

  const handleRerollCritter = () => {
    if (critterRollsLeft <= 0) return;
    const pool = CRITTERS.filter(c => c.word !== selectedCritter?.word);
    const next = pick(pool.length ? pool : CRITTERS);
    setSelectedCritter(next);
    setCritterRollsLeft(r => r - 1);
    setPlayerName(`${selectedAdj?.word ?? ''} ${next.word}`);
  };

  // ── Pre-battle dice ─────────────────────────────────────────────────────────
  const handleAllocRoll = () => {
    if (allocRolling || allocDice.length === 3) return;
    setAllocRolling(true); setAllocSettled(false);
    const final = [rollD6(), rollD6(), rollD6()];
    const schedule = [...Array(14).fill(18),...Array(8).fill(40),...Array(5).fill(80),...Array(3).fill(160),...Array(2).fill(280)];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) { setAllocDice([rollD6(),rollD6(),rollD6()]); setTimeout(tick, schedule[i++]); }
      else { setAllocDice(final); setAllocRolling(false); setAllocSettled(true); }
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
  const handleBeginBattle = async () => {
    if (!allAssigned) return;
    // Name bonus: adjective + critter bonuses (generated mode only)
    const nb = (k: StatKey) => critterMode === 'generated'
      ? (selectedAdj?.bonus[k] ?? 0) + (selectedCritter?.bonus[k] ?? 0)
      : 0;
    const pFinal: Stats = {
      strength: finalStat('strength') + nb('strength'),
      health:   finalStat('health')   + nb('health'),
      stamina:  finalStat('stamina')  + nb('stamina'),
    };
    const aiAlign: Alignment = alignment==='good'?'evil':'good';
    const real = await fetchRealOpponent(1, scannedCritterId);
    let aiBase: Stats, aiFinal: Stats, aiRarity: Rarity, aiName: string, opponentId: string | null;
    if (real) {
      aiBase = real.base; aiFinal = real.final; aiRarity = real.rarity; aiName = real.name; opponentId = real.id;
    } else {
      const gen = generateAIForStage(1);
      aiBase = gen.base; aiFinal = gen.final; aiRarity = gen.rarity;
      aiName = pick(AI_NAMES[aiAlign][aiRarity]); opponentId = null;
    }
    const pMaxHp   = calcMaxHp(pFinal.health);
    const aMaxHp   = calcMaxHp(aiFinal.health);
    const aac      = ALIGN_CFG[aiAlign];

    const pF: Fighter = { name:playerName||'Your Critter', rarity, alignment, guild, base, final:pFinal, hp:pMaxHp, maxHp:pMaxHp };
    const aF: Fighter = { name:aiName, rarity:aiRarity, alignment:aiAlign, base:aiBase, final:aiFinal, hp:aMaxHp, maxHp:aMaxHp, opponentId };
    setStage(1); setIsBoss(false);
    setMaxPlayerHeals(3); setBonusAttackRoll(0); setBonusPassive(0); setPerkChoices([]);
    setPlayer(pF); setAI(aF); setRound(1); setWinner(null);
    roundsRef.current = [];
    battleMetaRef.current = { p:pF, a:aF, stage:1, deathCount:0, isBoss:false,
      maxHeals:3, bonusAtk:0, bonusPass:0, opponentId };
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(pFinal.stamina); setPlayerShieldMax(pFinal.stamina); setPlayerDefended(false);
    setAiShield(aiFinal.stamina);    setAiShieldMax(aiFinal.stamina);    setAiDefended(false);
    setLog([
      {id:uid(),type:'info',text:`⚔️  Battle begins!  ${playerName||'Your Critter'}  vs  ${aiName}`},
      {id:uid(),type:'info',text:`You — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pMaxHp} HP · 🛡️ ${pFinal.stamina} shield`},
      {id:uid(),type:'info',text:`${aiName} — ${aac.icon} ${aac.label} · STR ${aiFinal.strength} · ❤️ ${aMaxHp} HP · 🛡️ ${aiFinal.stamina} shield`},
    ]);
    setBattleStep('choose'); setPlayerAction(null);
    setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── Real critter battle ─────────────────────────────────────────────────────
  const handleGenerateName = () => setPlayerName(pick(GUILD_NAMES[guild]));

  const handleRealStat = (k: StatKey, delta: number) => {
    // Stats are 0–9 regardless of rank; dice allocation adds on top after
    setBase(b => ({ ...b, [k]: Math.max(0, Math.min(9, b[k] + delta)) }));
  };

  const handleRealSetupContinue = () => {
    setBase({ strength: 0, health: 0, stamina: 0 });
    setPlayerName('');
    setPhase('real-stats');
  };

  const handleRealProceedToRolling = () => {
    setAllocDice([]); setAssigns([null, null, null]); setSelDie(null); setAllocSettled(false);
    setPhase('rolling');
  };


  // ── Combat ──────────────────────────────────────────────────────────────────
  // Action selection auto-triggers the dice roll and turn-order spin immediately
  const handleChooseAction = (action: Action) => {
    if (combatRolling || !player || !ai) return;
    setPlayerAction(action);
    setCombatRoll(null); setCombatSettled(false);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setTurnSpinning(false); setTurnFirst(null);
    setBattleStep('player-rolling');

    // Snapshot mutable state for use inside async closures
    const snapP=player, snapA=ai, snapAiH=aiHeals, snapAiD=aiDefended, snapPS=playerShield, snapAS=aiShield;
    setCombatRolling(true);
    const finalRoll = rollD6();
    const schedule  = [...Array(12).fill(18),...Array(8).fill(40),...Array(5).fill(80),...Array(2).fill(160),...Array(2).fill(280)];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) { setCombatRoll(rollD6()); setTimeout(tick, schedule[i++]); }
      else {
        // Die settles — show result, pick AI move, then spin for turn order
        setCombatRoll(finalRoll); setCombatRolling(false); setCombatSettled(true);
        const aiAct = pickAIAction(snapA, snapP, lastPlayerAct, snapAiH, snapAiD);
        const aiR   = rollD6();
        setRevealedAIAct(aiAct); setRevealedAIRoll(aiR);
        // RNG turn order: 50 / 50 each round
        const goesFirst: 'player' | 'ai' = Math.random() < 0.5 ? 'player' : 'ai';
        // After 400 ms showing the settled die, start the spin wheel
        setTimeout(() => {
          setCombatSettled(false);
          setTurnSpinning(true);
          // Spin for 900 ms, then reveal result for 600 ms before combat begins
          setTimeout(() => {
            setTurnSpinning(false);
            setTurnFirst(goesFirst);
            setTimeout(() => {
              setTurnFirst(null);
              resolveRound(action, finalRoll, aiAct, aiR, snapP, snapA, snapPS, snapAS, goesFirst);
            }, 600);
          }, 900);
        }, 400);
      }
    };
    tick();
  };

  const resolveRound = (pAct:Action, pRoll:number, aAct:Action, aRoll:number, curP:Fighter, curA:Fighter, curPS:number, curAS:number, goesFirst:'player'|'ai'='player') => {
    setBattleStep('animating'); setLastPlayerAct(pAct);
    if (pAct === 'heal')   setPlayerHeals(h => h + 1);
    if (aAct === 'heal')   setAiHeals(h => h + 1);
    if (pAct === 'defend') { setPlayerDefended(true); setPlayerShieldMax(m => Math.max(m, curPS + pRoll + curP.final.stamina)); }

    // AI defend: DEF stat increases by the roll, shield fully restores to new stat value
    const aNewStamina = aAct === 'defend' ? curA.final.stamina + aRoll : curA.final.stamina;
    if (aAct === 'defend') {
      setAiDefended(true);
      setAiShieldMax(aNewStamina);
      setAI(p => p ? { ...p, final: { ...p.final, stamina: aNewStamina } } : p);
    }

    const pass_p = calcPassive(curP) + bonusPassive, pass_a = calcPassive(curA);

    // ── Shield gains this round ──────────────────────────────────────────────
    const pShieldGain = pAct === 'defend' ? pRoll + curP.final.stamina : 0;
    const aShieldGain = aRoll; // used in log/spotlight to show the stat roll bonus
    let pShieldRun = curPS + pShieldGain;
    // AI defend: shield goes TO the new stamina value (full restore), not additive
    let aShieldRun = aAct === 'defend' ? aNewStamina : curAS;

    // ── Player attacks AI ────────────────────────────────────────────────────
    let pDmg = 0, pCrit = false, aShieldAbsorb = 0;
    if (pAct === 'attack') {
      pCrit = pRoll === 6;
      const raw = pRoll + curP.final.strength + (pCrit ? 3 : 0) + bonusAttackRoll;
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

    // Heal = 30% base + 10% per pip; roll 4 → 70% of max HP
    const pHeal = pAct === 'heal' ? Math.floor(curP.maxHp * (0.30 + 0.10 * pRoll)) : 0;
    const aHeal = aAct === 'heal' ? Math.floor(curA.maxHp * (0.30 + 0.10 * aRoll)) : 0;

    // Final shield values after all combat
    const pShieldFinal = pShieldRun;
    const aShieldFinal = aShieldRun;

    // ── HP calcs ─────────────────────────────────────────────────────────────
    const aiHpMid       = Math.min(curA.maxHp, Math.max(0, curA.hp - pDmg));
    const playerHpMid   = Math.min(curP.maxHp, Math.max(0, curP.hp + pHeal));
    const aiHpFinal     = Math.min(curA.maxHp, Math.max(0, aiHpMid + aHeal));
    const playerHpFinal = Math.min(curP.maxHp, Math.max(0, playerHpMid - aDmg));
    // Defeat priority follows turn order: whoever acts first can kill the other before they strike back
    let aiDefeated: boolean, playerDefeated: boolean;
    if (goesFirst === 'ai') {
      playerDefeated = playerHpFinal <= 0;
      aiDefeated     = !playerDefeated && aiHpMid <= 0;
    } else {
      aiDefeated     = aiHpMid <= 0;
      playerDefeated = !aiDefeated && playerHpFinal <= 0;
    }

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
        text:`${ac.icon} ${pMove}: roll ${pRoll}+${curP.final.strength}${pCrit?'+3🎯':''}${bonusAttackRoll>0?`+${bonusAttackRoll}⚡`:''}=${pRoll+curP.final.strength+(pCrit?3:0)+bonusAttackRoll}${sNote} → ${pDmg} dmg`});
    } else if (pAct==='defend') {
      entries.push({id:uid(),type:'block',who:'player',
        text:`🛡️ ${pMove}: +${pShieldGain} shield (${curP.final.stamina} DEF + roll ${pRoll})`});
    } else {
      entries.push({id:uid(),type:'heal',who:'player',
        text:`🧪 ${pMove}: +${pHeal} HP (roll ${pRoll} · ${Math.round((0.30+0.10*pRoll)*100)}% of max)`});
    }

    if (aAct==='attack') {
      const sNote = pShieldAbsorb > 0 ? ` (shield −${pShieldAbsorb})` : ` (passive ${pass_p})`;
      entries.push({id:uid(),type:aCrit?'critical':'hit',who:'ai',
        text:`${aac.icon} ${aMove}: roll ${aRoll}+${curA.final.strength}${aCrit?'+3🎯':''}=${aRoll+curA.final.strength+(aCrit?3:0)}${sNote} → ${aDmg} dmg`});
    } else if (aAct==='defend') {
      entries.push({id:uid(),type:'block',who:'ai',
        text:`🛡️ ${curA.name} ${aMove}: DEF ${curA.final.stamina}+${aRoll}→${aNewStamina} · shield restored ${aNewStamina}/${aNewStamina}`});
    } else {
      entries.push({id:uid(),type:'heal',who:'ai',
        text:`🧪 ${curA.name} ${aMove}: +${aHeal} HP (roll ${aRoll} · ${Math.round((0.30+0.10*aRoll)*100)}% of max)`});
    }
    if (aiDefeated||playerDefeated)
      entries.push({id:uid(),type:'info',text:aiDefeated?`🏆 ${curA.name} defeated! Victory!`:`💀 ${curP.name} falls! ${aac.icon} ${curA.name} wins.`});

    // ── Record this round ─────────────────────────────────────────────────────
    roundsRef.current.push({
      r: round, first: goesFirst,
      p_act: pAct, p_roll: pRoll, ai_act: aAct, ai_roll: aRoll,
      p_hp_start: curP.hp,  p_hp_end: playerHpFinal,
      ai_hp_start: curA.hp, ai_hp_end: aiHpFinal,
      p_shield_start: curPS,  p_shield_end: pShieldFinal,
      ai_shield_start: curAS, ai_shield_end: aShieldFinal,
      p_dmg: pDmg, ai_dmg: aDmg, p_crit: pCrit, ai_crit: aCrit,
    });

    // ── Animation ─────────────────────────────────────────────────────────────
    const pSpotType: Spotlight['type'] = pAct==='attack'?(pCrit?'critical':'attack'):pAct==='defend'?'block':'heal';
    const aSpotType: Spotlight['type'] = aAct==='attack'?(aCrit?'critical':'attack'):aAct==='defend'?'block':'heal';

    // Helper: apply player's action visually (a-hit)
    const showPlayerHit = () => {
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
        setPlayerShield(curPS + pShieldGain);
        showSpot({title:`🛡️ +${pShieldGain} Shield`,
          detail:`${curP.final.stamina} DEF + roll ${pRoll} · Total: ${curPS + pShieldGain}`,color:'#6ee7b7',type:'block'});
      }
    };

    // Helper: apply AI's action visually (p-hit)
    const showAIHit = () => {
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
        // Shield already raised at announcement. Confirm with spotlight.
        showSpot({title:`🛡️ +${aShieldGain} DEF · Fully Restored`,
          detail:`${curA.final.stamina}→${aNewStamina} DEF · Shield: ${aNewStamina}/${aNewStamina}`,color:'#6ee7b7',type:'block'});
      }
    };

    if (goesFirst === 'ai') {
      // ── AI goes first (a-act → p-hit → p-act → a-hit) ────────────────────────
      // If AI is defending, show the shield bar going up immediately at announcement time
      if (aAct === 'defend') setAiShield(aNewStamina);
      setAnimStep('a-act');
      showSpot({title:aMove, detail:`${aac.icon} ${ACTION_CFG[aAct].label}${isBoss?' · 👑 Boss':''}`, color:aac.color, type:aSpotType});

      setTimeout(() => {
        showAIHit();
        if (playerDefeated) { setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,'ai'),2000); return; }

        setTimeout(() => {
          setAnimStep('p-act');
          showSpot({title:pMove, detail:`${ac.icon} ${ACTION_CFG[pAct].label}`, color:ac.color, type:pSpotType});

          setTimeout(() => {
            showPlayerHit();
            setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,aiDefeated?'player':null),2000);
          }, 1000);
        }, 2000);
      }, 1000);
    } else {
      // ── Player goes first (p-act → a-hit → a-act → p-hit) ───────────────────
      // Both actions were chosen simultaneously — if AI is defending, show its
      // shield bar going up right now so it's visible before the player hits.
      if (aAct === 'defend') setAiShield(aNewStamina);
      setAnimStep('p-act');
      showSpot({title:pMove, detail:`${ac.icon} ${ACTION_CFG[pAct].label}`, color:ac.color, type:pSpotType});

      setTimeout(() => {
        showPlayerHit();
        if (aiDefeated) { setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,'player'),2000); return; }

        setTimeout(() => {
          setAnimStep('a-act');
          showSpot({title:aMove, detail:`${aac.icon} ${ACTION_CFG[aAct].label}`, color:aac.color, type:aSpotType});

          setTimeout(() => {
            showAIHit();
            setTimeout(()=>finishRound(entries,playerHpFinal,aiHpFinal,playerDefeated?'ai':null),2000);
          }, 1000);
        }, 2000);
      }, 1000);
    }
  };

  const finishRound = (entries:LogEntry[], _p:number, _a:number, rWinner:'player'|'ai'|null) => {
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setLog(p=>[...p,...entries]); setRound(p=>p+1);
    if (rWinner) {
      setWinner(rWinner); if(rWinner==='player')setStreak(p=>p+1); setPhase('result');
      setXpAward(null);
      // Fire-and-forget battle analytics
      const meta = battleMetaRef.current;
      if (meta) {
        const rec: BattleRecord = {
          stage: meta.stage, death_count: meta.deathCount, is_boss: meta.isBoss,
          boss_boost_stat: meta.a.bossBoostStat ?? null,
          p_alignment: meta.p.alignment, p_rarity: meta.p.rarity, p_guild: meta.p.guild ?? 'none',
          p_str: meta.p.final.strength, p_hp_stat: meta.p.final.health,
          p_def: meta.p.final.stamina, p_max_hp: meta.p.maxHp,
          p_max_heals: meta.maxHeals, p_bonus_atk: meta.bonusAtk, p_bonus_passive: meta.bonusPass,
          ai_alignment: meta.a.alignment, ai_rarity: meta.a.rarity,
          ai_str: meta.a.final.strength, ai_hp_stat: meta.a.final.health,
          ai_def: meta.a.final.stamina, ai_max_hp: meta.a.maxHp,
          winner: rWinner, total_rounds: roundsRef.current.length,
          final_p_hp: _p, final_ai_hp: _a,
          opponent_id: meta.opponentId,
          rounds: [...roundsRef.current],
        };
        recordBattle(rec);
        roundsRef.current = [];

        // Award XP / level-up for the player's scanned critter on a stage win
        if (rWinner === 'player' && scannedCritterId) {
          const stageWon = meta.stage;
          const bossWon  = meta.isBoss;
          awardBattleXp(scannedCritterId, stageWon, bossWon).then(result => {
            if (!result || result.new_xp == null || result.new_level == null) return;
            setPlayerXp(result.new_xp);
            setPlayerLevel(result.new_level);
            setXpAward({
              xp: stageWon * 2 * (bossWon ? 1.5 : 1),
              leveledUp: !!result.leveled_up,
              level: result.new_level,
              stat: result.boosted_stat,
            });
          });
        }
      }
    }
    else { setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null); }
  };

  const handleNextBattle = async (overridePlayer?: Fighter) => {
    const curPlayer = overridePlayer ?? player;
    if (!curPlayer) return;
    const newStage = stage + 1;
    setStage(newStage);
    const bossStage = newStage % 3 === 0;
    setIsBoss(bossStage);
    const aiAlign: Alignment = alignment==='good'?'evil':'good';
    const real = await fetchRealOpponent(newStage + deathCount, scannedCritterId);
    let aiBase: Stats, aiFinal: Stats, aiRarity: Rarity, aiName: string, opponentId: string | null;
    if (real) {
      aiBase = real.base; aiFinal = real.final; aiRarity = real.rarity; aiName = real.name; opponentId = real.id;
    } else {
      const gen = generateAIForStage(newStage + deathCount);
      aiBase = gen.base; aiFinal = gen.final; aiRarity = gen.rarity;
      aiName = pick(AI_NAMES[aiAlign][aiRarity]); opponentId = null;
    }
    const aMaxHp  = calcMaxHp(aiFinal.health);
    // Boss: +5 to one random stat + a real critter photo
    const STAT_KEYS: StatKey[] = ['strength','health','stamina'];
    const bossBoostStat = bossStage ? pick(STAT_KEYS) : undefined;
    const bossImg       = bossStage && CRITTER_PHOTOS.length > 0 ? pick(CRITTER_PHOTOS) : undefined;
    const bossFinal = bossBoostStat
      ? { ...aiFinal, [bossBoostStat]: aiFinal[bossBoostStat] + 5 }
      : aiFinal;
    const bossFinalMaxHp = bossBoostStat === 'health' ? calcMaxHp(bossFinal.health) : aMaxHp;
    // HP and heal count carry over — no restoration between stages
    setAI({name:aiName,rarity:aiRarity,alignment:aiAlign,base:aiBase,
           final:bossFinal,hp:bossFinalMaxHp,maxHp:bossFinalMaxHp,
           bossBoostStat,img:bossImg,opponentId});
    setRound(1); setWinner(null); setAiHeals(0);
    roundsRef.current = [];
    battleMetaRef.current = { p:curPlayer, a:{name:aiName,rarity:aiRarity,alignment:aiAlign,base:aiBase,
      final:bossFinal,hp:bossFinalMaxHp,maxHp:bossFinalMaxHp,bossBoostStat,img:bossImg,opponentId},
      stage:newStage, deathCount, isBoss:bossStage,
      maxHeals:maxPlayerHeals, bonusAtk:bonusAttackRoll, bonusPass:bonusPassive, opponentId };
    setPlayerShield(curPlayer.final.stamina); setPlayerShieldMax(curPlayer.final.stamina); setPlayerDefended(false);
    setAiShield(bossFinal.stamina);           setAiShieldMax(bossFinal.stamina);           setAiDefended(false);
    const bossTag = bossStage ? ' 👑 BOSS' : '';
    setLog([{id:uid(),type:'info',text:`⚔️  Stage ${newStage}${bossTag} — ${aiName} enters!`},
            {id:uid(),type:'info',text:`${aiName} — STR ${bossFinal.strength} · ❤️ ${bossFinalMaxHp} HP · 🛡️ ${bossFinal.stamina} shield${bossBoostStat ? ` (+5 ${bossBoostStat})` : ''}`},
            {id:uid(),type:'info',text:`⚠️ HP carries over: ${curPlayer.hp}/${curPlayer.maxHp} · 🛡️ ${curPlayer.final.stamina} shield restored`}]);
    setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // Bonfire restart: keep player stats, return to stage after last boss, enemies +1 level per death
  const handleBonfireRestart = async () => {
    if (!player) return;
    const newDeathCount = deathCount + 1;
    setDeathCount(newDeathCount);

    const aiAlign: Alignment = alignment === 'good' ? 'evil' : 'good';
    // Opponent is matched for bonfireStage scaled up by newDeathCount deaths
    const real = await fetchRealOpponent(bonfireStage + newDeathCount, scannedCritterId);
    let aiBase: Stats, aiFinal: Stats, aiRarity: Rarity, aiName: string, opponentId: string | null;
    if (real) {
      aiBase = real.base; aiFinal = real.final; aiRarity = real.rarity; aiName = real.name; opponentId = real.id;
    } else {
      const gen = generateAIForStage(bonfireStage + newDeathCount);
      aiBase = gen.base; aiFinal = gen.final; aiRarity = gen.rarity;
      aiName = pick(AI_NAMES[aiAlign][aiRarity]); opponentId = null;
    }
    const aMaxHp  = calcMaxHp(aiFinal.health);

    // Boss check (bonfires are always at stage ≡1 mod 3, so never a boss — kept for safety)
    const bossStage     = bonfireStage % 3 === 0;
    const STAT_KEYS: StatKey[] = ['strength', 'health', 'stamina'];
    const bossBoostStat = bossStage ? pick(STAT_KEYS) : undefined;
    const bossImg       = bossStage && CRITTER_PHOTOS.length > 0 ? pick(CRITTER_PHOTOS) : undefined;
    const bossFinal     = bossBoostStat ? { ...aiFinal, [bossBoostStat]: aiFinal[bossBoostStat] + 5 } : aiFinal;
    const bossFinalMaxHp = bossBoostStat === 'health' ? calcMaxHp(bossFinal.health) : aMaxHp;

    // Player keeps all final stats; HP is fully restored at the bonfire
    const restoredPlayer: Fighter = { ...player, hp: player.maxHp };
    setPlayer(restoredPlayer);
    setAI({ name: aiName, rarity: aiRarity, alignment: aiAlign, base: aiBase,
            final: bossFinal, hp: bossFinalMaxHp, maxHp: bossFinalMaxHp, bossBoostStat, img: bossImg, opponentId });

    setStage(bonfireStage);
    setIsBoss(bossStage);
    setRound(1); setWinner(null); setAiHeals(0);
    roundsRef.current = [];
    battleMetaRef.current = { p:restoredPlayer,
      a:{name:aiName,rarity:aiRarity,alignment:aiAlign,base:aiBase,
         final:bossFinal,hp:bossFinalMaxHp,maxHp:bossFinalMaxHp,bossBoostStat,img:bossImg,opponentId},
      stage:bonfireStage, deathCount:newDeathCount, isBoss:bossStage,
      maxHeals:maxPlayerHeals, bonusAtk:bonusAttackRoll, bonusPass:bonusPassive, opponentId };
    // playerHeals intentionally NOT reset — remaining heals carry over from death
    setPlayerShield(restoredPlayer.final.stamina); setPlayerShieldMax(restoredPlayer.final.stamina); setPlayerDefended(false);
    setAiShield(bossFinal.stamina);               setAiShieldMax(bossFinal.stamina);               setAiDefended(false);

    const bossTag = bossStage ? ' 👑 BOSS' : '';
    setLog([
      { id: uid(), type: 'info', text: `🔥 Bonfire — ${restoredPlayer.name} rises at Stage ${bonfireStage}` },
      { id: uid(), type: 'info', text: `HP restored to ${restoredPlayer.maxHp} · STR ${restoredPlayer.final.strength} · DEF ${restoredPlayer.final.stamina} · 🧪 ${healsLeft}/${maxPlayerHeals} heals` },
      { id: uid(), type: 'info', text: `⚠️ Enemies are +${newDeathCount} level${newDeathCount !== 1 ? 's' : ''} harder` },
      { id: uid(), type: 'info', text: `⚔️  Stage ${bonfireStage}${bossTag} — ${aiName} enters!` },
    ]);

    setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── QR scan: fetch critter from Supabase ───────────────────────────────────
  const handleScanLoad = async (overrideId?: string) => {
    const id = (overrideId ?? scanId).trim().toUpperCase();
    if (!id) { setScanError('No critter ID found.'); return; }
    setScanLoading(true); setScanError(null);
    const { data, error } = await supabase
      .from('critters')
      .select('id, name, rarity, strength, health, stamina, level, xp')
      .eq('id', id)
      .single();
    setScanLoading(false);
    if (error || !data) { setScanError('Critter not found. Check your ID and try again.'); return; }
    const r = (data.rarity as string).toLowerCase() as Rarity;
    setRarity(r);
    setBase({ strength: data.strength, health: data.health, stamina: data.stamina });
    setPlayerName(data.name ?? '');
    setCritterMode('real');
    setScannedCritterId(data.id);
    setPlayerLevel(data.level ?? 1);
    setPlayerXp(data.xp ?? 0);
    setPhase('scan-setup');
  };

  const handleScanSetupContinue = () => {
    setAllocDice([]); setAssigns([null, null, null]); setSelDie(null); setAllocSettled(false);
    setPhase('rolling');
  };

  const handleReset = () => {
    setPhase('mode'); setAllocDice([]); setAssigns([null,null,null]); setSelDie(null);
    setPlayer(null); setAI(null); setLog([]); setRound(1);
    setWinner(null); setStreak(0);
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setStage(1); setIsBoss(false); setDeathCount(0);
    setMaxPlayerHeals(3); setBonusAttackRoll(0); setBonusPassive(0); setPerkChoices([]);
    setBattleStep('choose');
    setPlayerAction(null); setCombatRoll(null); setCombatSettled(false); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAllocSettled(false);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setBase({strength:0,health:0,stamina:0}); setPlayerName('');
    setSelectedAdj(null); setSelectedCritter(null);
    setAdjRollsLeft(3); setCritterRollsLeft(3);
    setTurnSpinning(false); setTurnFirst(null);
    setScanId(''); setScanError(null); setScanLoading(false);
    setScannedCritterId(null);
    setPlayerLevel(1); setPlayerXp(0);
  };

  // Rekindle anew: full restart back at the allegiance/guild screen, keeping
  // the same scanned critter, alignment, and guild — but losing all run gains
  // (stage progress, dice allocations, perks, heals, etc).
  const handleRekindleAnew = () => {
    setAllocDice([]); setAssigns([null,null,null]); setSelDie(null); setAllocSettled(false);
    setPlayer(null); setAI(null); setLog([]); setRound(1);
    setWinner(null); setStreak(0);
    setPlayerHeals(0); setAiHeals(0);
    setPlayerShield(0); setPlayerShieldMax(0); setPlayerDefended(false);
    setAiShield(0);    setAiShieldMax(0);    setAiDefended(false);
    setStage(1); setIsBoss(false); setDeathCount(0);
    setMaxPlayerHeals(3); setBonusAttackRoll(0); setBonusPassive(0); setPerkChoices([]);
    setBattleStep('choose');
    setPlayerAction(null); setCombatRoll(null); setCombatSettled(false); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setTurnSpinning(false); setTurnFirst(null);
    setPhase('scan-setup');
  };

  // ── Between-stage heal (on perk screen) ────────────────────────────────────
  const handlePerkHeal = () => {
    if (!player || healsLeft <= 0) return;
    const healAmt = Math.round(player.maxHp * 0.5);
    setPlayer(p => p ? { ...p, hp: Math.min(p.maxHp, p.hp + healAmt) } : p);
    setPlayerHeals(h => h + 1);
  };

  // ── Perk flow ───────────────────────────────────────────────────────────────
  const handleShowPerks = () => {
    const shuffled = [...ALL_PERKS].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 2).map(p => {
      switch (p.id) {
        case 'sharpened': {
          const v = randInt(1, 3);
          return { ...p, value: v, desc: `+${v} Strength permanently` };
        }
        case 'vitality': {
          const v = randInt(2, 4);
          return { ...p, value: v, desc: `+${v} Health stat (+${v * 4} max HP)` };
        }
        case 'fortified': {
          const v = randInt(2, 4);
          return { ...p, value: v, desc: `+${v} Defense — bigger shield every stage` };
        }
        default: return p;
      }
    });
    setPerkChoices(chosen);
    setPhase('perk');
    // Submit this stage's score globally (fire-and-forget)
    submitStageScore(alignment, rarity, guild);
  };

  const applyPerkAndContinue = (perkId: string) => {
    let updatedPlayer = player ? { ...player } : null;
    const chosenPerk = perkChoices.find(p => p.id === perkId);
    switch (perkId) {
      case 'sharpened': {
        const v = chosenPerk?.value ?? 1;
        if (updatedPlayer) updatedPlayer = { ...updatedPlayer, final: { ...updatedPlayer.final, strength: updatedPlayer.final.strength + v } };
        break;
      }
      case 'fortified': {
        const v = chosenPerk?.value ?? 2;
        if (updatedPlayer) updatedPlayer = { ...updatedPlayer, final: { ...updatedPlayer.final, stamina: updatedPlayer.final.stamina + v } };
        break;
      }
      case 'vitality': {
        const v = chosenPerk?.value ?? 3;
        if (updatedPlayer) {
          const newHealth = updatedPlayer.final.health + v;
          const newMax    = calcMaxHp(newHealth);
          const hpGain    = newMax - updatedPlayer.maxHp;
          updatedPlayer = { ...updatedPlayer, final: { ...updatedPlayer.final, health: newHealth }, maxHp: newMax, hp: Math.min(newMax, updatedPlayer.hp + hpGain) };
        }
        break;
      }
      case 'extra-vial':
        setMaxPlayerHeals(m => Math.min(m + 1, 4));
        setPlayerHeals(h => Math.max(0, h - 1));
        break;
      case 'blood-mend':
        if (updatedPlayer) updatedPlayer = { ...updatedPlayer, hp: Math.min(updatedPlayer.maxHp, updatedPlayer.hp + 20) };
        break;
      case 'second-wind':
        if (updatedPlayer) updatedPlayer = { ...updatedPlayer, hp: updatedPlayer.maxHp };
        break;
      case 'iron-skin':
        setBonusPassive(b => b + 1);
        break;
      case 'relentless':
        setBonusAttackRoll(b => b + 1);
        break;
    }
    if (updatedPlayer && updatedPlayer !== player) setPlayer(updatedPlayer);
    handleNextBattle(updatedPlayer ?? undefined);
  };

  // ─── Derived values ──────────────────────────────────────────────────────────
  // Bonfire = stage immediately after the last defeated boss (boss stages = multiples of 3)
  const bonfireStage = Math.max(1, Math.floor((stage - 1) / 3) * 3 + 1);
  const healsLeft    = Math.max(0, maxPlayerHeals - playerHeals);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-overlay" onClick={phase === 'battle' || phase === 'result' || phase === 'perk' ? undefined : onClose}>
      <div className="bg-modal"
        style={{'--rarity-color':rc,'--rarity-glow':rg,'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}
        onClick={e=>e.stopPropagation()}>
        <button className="bg-close" onClick={() => {
          if (phase === 'battle' || phase === 'result' || phase === 'perk') {
            if (window.confirm('Abandon this battle? All progress will be lost.')) onClose();
          } else {
            onClose();
          }
        }}>✕</button>

        {/* Round + Stage badge */}
        {phase==='battle' && (
          <div className="bg-round-badge">
            <span className="bg-badge-rnd">Rnd {round}</span>
            <span className="bg-badge-dot">·</span>
            <span className="bg-badge-stg">Stage {stage}{deathCount>0&&<span className="bg-badge-penalty">+{deathCount}</span>}</span>
            {isBoss && <span className="bg-badge-boss">👑 BOSS</span>}
          </div>
        )}

        {/* ── STEP 0: Mode chooser — scan only ── */}
        {phase==='mode' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Enter the Arena</h2>
            <p className="bg-sub">Scan your critter card to battle.</p>
            <div className="bg-mode-row">
              <button className="bg-mode-btn bg-mode-btn--scan" onClick={()=>setPhase('scan')}>
                <span className="bgm-icon">📷</span>
                <span className="bgm-title">Scan Your Critter</span>
                <span className="bgm-desc">Use the QR code on your physical card</span>
              </button>
            </div>
          </div>
        )}

        {/* ── SCAN: Live camera QR scanner ── */}
        {phase==='scan' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Scan Your Card</h2>

            {scanLoading ? (
              <p className="bg-sub" style={{textAlign:'center',padding:'2rem 0'}}>⏳ Loading critter…</p>
            ) : (
              <QrScanner
                onScan={(id) => {
                  setScanId(id);
                  handleScanLoad(id);
                }}
                onError={(msg) => setScanError(msg)}
              />
            )}

            {scanError && <p className="bg-scan-error">{scanError}</p>}

            <button className="bg-back-btn" onClick={()=>{ setScanError(null); setPhase('mode'); }}>← Back</button>
          </div>
        )}

        {/* ── SCAN SETUP: Alignment + Guild after loading ── */}
        {phase==='scan-setup' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Your Critter · {rarity[0].toUpperCase()+rarity.slice(1)}</p>
            <h2 className="bg-title" style={{color:rarityColor[rarity]}}>{playerName}</h2>

            {(() => {
              const curFloor = xpForLevel(playerLevel);
              const nextFloor = xpForLevel(playerLevel + 1);
              const span = Math.max(1, nextFloor - curFloor);
              const pct = Math.min(100, Math.max(0, ((playerXp - curFloor) / span) * 100));
              return (
                <div className="bg-level-row">
                  <span className="bg-level-badge" style={{borderColor:rarityColor[rarity],color:rarityColor[rarity]}}>
                    🏅 Level {playerLevel}
                  </span>
                  <div className="bg-xp-track">
                    <div className="bg-xp-fill" style={{width:`${pct}%`,background:rarityColor[rarity]}} />
                  </div>
                  <span className="bg-xp-label">{playerXp} XP</span>
                </div>
              );
            })()}

            <div className="bg-stat-summary">
              {([['⚔️','STR',base.strength],['❤️','HP',base.health],['🛡️','DEF',base.stamina]] as [string,string,number][]).map(([icon,lbl,val])=>(
                <div key={lbl} className="bg-stat-summary-chip" style={{borderColor:rarityColor[rarity]}}>
                  <span>{icon}</span>
                  <span className="bg-ssc-lbl">{lbl}</span>
                  <span className="bg-ssc-val" style={{color:rarityColor[rarity]}}>{val}</span>
                </div>
              ))}
            </div>

            <div className="bg-section-lbl" style={{marginTop:'1rem'}}>Choose Your Allegiance</div>
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

            <button className="bg-cta" onClick={handleScanSetupContinue}
              style={{borderColor:ac.color,color:ac.color}}>
              🎲 Roll Dice →
            </button>
            <button className="bg-back-btn" onClick={()=>setPhase('scan')}>← Back</button>
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
              Enter your card's stats (0–9). Roll dice next to add bonus points.
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
              ] as [StatKey,string,string][]).map(([k,icon,name])=>(
                <div key={k} className="bg-stat-row">
                  <span className="bg-stat-icon">{icon}</span>
                  <span className="bg-stat-name">{name}</span>
                  <div className="bg-stat-ctrl">
                    <button onClick={()=>handleRealStat(k,-1)} disabled={base[k]<=0}>−</button>
                    <span>{base[k]}</span>
                    <button onClick={()=>handleRealStat(k, 1)} disabled={base[k]>=9}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-es-hp" style={{maxWidth:'340px',width:'100%'}}>
              <span>Starting HP</span>
              <span style={{color:ac.color,fontFamily:'var(--font-heading)',fontWeight:700}}>{calcMaxHp(base.health)}</span>
            </div>

            <button className="bg-cta" onClick={handleRealProceedToRolling}
              style={{borderColor:ac.color,color:ac.color}}>
              🎲 Roll Dice →
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

            <button className="bg-cta" onClick={handleStartEnchant} style={{borderColor:ac.color,color:ac.color}}>
              ✨ Enchant Animal →
            </button>
          </div>
        )}

        {/* ── STEP 3+4+5: Roll dice & assign — combined screen ── */}
        {(phase==='rolling' || phase==='allocating') && (
          <div className="bg-panel">
            <p className="bg-eyebrow">{ac.icon} {ac.label} · {GUILD_ICONS[guild]} {guild[0].toUpperCase()+guild.slice(1)} · {rarity[0].toUpperCase()+rarity.slice(1)}</p>
            <h2 className="bg-title">Your Critter</h2>

            {/* Name — locked to the scanned critter's name; editable only for legacy generated mode */}
            <div className="bg-name-row">
              {scannedCritterId ? (
                <div className="bg-name-display">{playerName || 'Your Critter'}</div>
              ) : (
                <>
                  <input
                    className="bg-name-input"
                    type="text"
                    placeholder="Critter name…"
                    value={playerName}
                    onChange={e=>setPlayerName(e.target.value)}
                    maxLength={24}
                  />
                  {critterMode === 'real' && (
                    <button className="bg-cta bg-cta--ghost"
                      onClick={()=>setPlayerName(pick(GUILD_NAMES[guild]))}
                      style={{whiteSpace:'nowrap'}}>
                      🎲 Rename
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Name builder — adjective + critter (generated mode only) */}
            {critterMode === 'generated' && (
              <div className="bg-name-builder">
                {/* Attribute card */}
                <div className="bg-nb-card">
                  <span className="bg-nbc-label">Attribute</span>
                  <span className="bg-nbc-word" style={{color:ac.color}}>{selectedAdj?.word ?? '—'}</span>
                  <span className="bg-nbc-bonus">{selectedAdj?.bonusLabel ?? ''}</span>
                  <button className="bg-nbc-reroll"
                    disabled={adjRollsLeft <= 0}
                    onClick={handleRerollAdj}>
                    🎲 {adjRollsLeft > 0 ? `Reroll (${adjRollsLeft})` : 'Used up'}
                  </button>
                </div>
                {/* Critter card */}
                <div className="bg-nb-card">
                  <span className="bg-nbc-label">Critter</span>
                  <span className="bg-nbc-word" style={{color:ac.color}}>{selectedCritter?.word ?? '—'}</span>
                  <span className="bg-nbc-bonus">{selectedCritter?.bonusLabel ?? ''}</span>
                  <button className="bg-nbc-reroll"
                    disabled={critterRollsLeft <= 0}
                    onClick={handleRerollCritter}>
                    🎲 {critterRollsLeft > 0 ? `Reroll (${critterRollsLeft})` : 'Used up'}
                  </button>
                </div>
              </div>
            )}

            <p className="bg-sub" style={{fontSize:'0.82rem',opacity:0.7}}>
              {allocDice.length===0
                ? 'Click any die to roll all three and boost your stats.'
                : allocRolling
                ? 'Rolling…'
                : selDie!==null
                ? 'Now tap a stat below to assign that die.'
                : 'Select a die, then tap a stat. Click × to un-assign.'}
            </p>

            {/* Dice row */}
            <div className="bg-dice-row">
              {allocDice.length===0 ? (
                /* Pre-roll: three ? dice, any click triggers the roll */
                [0,1,2].map(i=>(
                  <D6Die key={i} value='?' spinning={allocRolling} large
                    onClick={!allocRolling ? handleAllocRoll : undefined}
                  />
                ))
              ) : allocRolling ? (
                /* Spinning animation */
                allocDice.map((v,i)=>(
                  <D6Die key={i} value={v} spinning large />
                ))
              ) : (
                /* Post-roll: selectable die-slots */
                allocDice.map((v,i)=>(
                  <div key={i} className="bg-die-slot">
                    <D6Die value={v} large selected={selDie===i} used={assigns[i]!==null}
                      settled={allocSettled && assigns[i]===null && selDie!==i}
                      onClick={()=>assigns[i]===null&&setSelDie(selDie===i?null:i)}
                    />
                    {assigns[i]!==null && (
                      <button className="bg-die-clear" onClick={()=>clearAssign(i)}
                        title={`Remove ${assigns[i]} assignment`}>
                        {({strength:'⚔️',health:'❤️',stamina:'🛡️'} as Record<StatKey,string>)[assigns[i]!]} ×
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Stat assignment — visible always; active once dice are rolled and a die is selected */}
            <div className="bg-alloc-stats">
              {(['strength','health','stamina'] as StatKey[]).map(k=>{
                const icons:Record<StatKey,string>={strength:'⚔️',health:'❤️',stamina:'🛡️'};
                const names:Record<StatKey,string>={strength:'Strength',health:'Health',stamina:'Defense'};
                const diceBonus = assigns.reduce((s,a,i)=>a===k?s+allocDice[i]:s,0);
                const nameBonus = critterMode==='generated'
                  ? (selectedAdj?.bonus[k]??0) + (selectedCritter?.bonus[k]??0) : 0;
                const total = base[k] + diceBonus + nameBonus;
                const ready = selDie!==null && allocDice.length===3 && !allocRolling;
                return (
                  <button key={k} onClick={()=>handleAssign(k)} disabled={!ready}
                    className={`bg-alloc-btn ${ready?'bg-alloc-btn--ready':''}`}>
                    <span>{icons[k]}</span>
                    <span className="bab-name">{names[k]}</span>
                    <span className="bab-val">
                      {base[k]}
                      {nameBonus>0&&<span className="bab-plus bab-plus--name"> +{nameBonus}✨</span>}
                      {diceBonus>0&&<span className="bab-plus"> +{diceBonus}</span>}
                      {(nameBonus+diceBonus)>0&&<> = <strong>{total}</strong></>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="bg-alloc-footer">
              <button className="bg-cta bg-cta--ghost" onClick={resetAssigns}
                disabled={assigns.every(a=>a===null)}>
                ↺ Reset
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
            <FighterCard fighter={ai}     label="Rival" animStep={animStep} side="ai"    floatDmg={floatDmg} shield={aiShield}    shieldMax={aiShieldMax}
              healsLeft={Math.max(0, 1 - aiHeals)} canDefend={!aiDefended}/>

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
                    .filter(a => !(a==='defend' && playerDefended) && !(a==='heal' && playerHeals>=maxPlayerHeals))
                    .map(a=>(
                      <button key={a} className="bg-action-btn" onClick={()=>handleChooseAction(a)}>
                        <span className="bact-icon">{ACTION_CFG[a].icon}</span>
                        <span className="bact-label">{ACTION_CFG[a].label}</span>
                        {a==='heal' && <span className="bact-uses">{maxPlayerHeals-playerHeals} left</span>}
                      </button>
                    ))
                  }
                </div>
              )}

              {battleStep==='player-rolling' && (
                <div className="bg-roll-area">
                  <p className="bg-roll-hint">
                    {ACTION_CFG[playerAction!].icon} <strong>{ACTION_CFG[playerAction!].label}</strong>
                    {combatRolling ? ' — rolling…' : ' — rolled!'}
                  </p>
                  <D6Die value={combatRoll??'?'} spinning={combatRolling} large settled={combatSettled}/>
                </div>
              )}

              {/* Turn-order spin wheel — appears between die-settle and combat */}
              {(turnSpinning || turnFirst !== null) && (
                <div className="bg-turn-spin">
                  <div className="bg-ts-row">
                    <span className={`bg-ts-chip${turnFirst==='player'?' bg-ts-chip--won':turnFirst==='ai'?' bg-ts-chip--lost':''}`}>
                      ⚔️ You
                    </span>
                    <div className="bg-ts-mid">
                      {turnSpinning
                        ? <div className="bg-ts-spinner"/>
                        : <span className="bg-ts-arrow">{turnFirst==='player'?'◀':'▶'}</span>
                      }
                    </div>
                    <span className={`bg-ts-chip${turnFirst==='ai'?' bg-ts-chip--won':turnFirst==='player'?' bg-ts-chip--lost':''}`}>
                      Rival ⚔️
                    </span>
                  </div>
                  <p className="bg-ts-label">
                    {turnSpinning ? 'Deciding turn order…'
                      : turnFirst==='player' ? '⚡ You go first!'
                      : '⚡ Rival goes first!'}
                  </p>
                </div>
              )}

              {battleStep==='animating'&&revealedAIAct&&revealedAIRoll!=null&&(
                <div className="bg-ai-reveal">
                  <div className="bg-air-side">
                    <span className="bg-air-tag">You</span>
                    <span className="bg-air-action">{ACTION_CFG[playerAction!].icon}</span>
                    <D6Die value={combatRoll??1} />
                  </div>
                  <span className="bg-air-vs">vs</span>
                  <div className="bg-air-side bg-air-side--rival">
                    <span className="bg-air-tag">Rival</span>
                    <span className="bg-air-action">{ACTION_CFG[revealedAIAct].icon}</span>
                    <D6Die value={revealedAIRoll} />
                  </div>
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
            {winner==='player' && xpAward && (
              <div className="bg-xp-award">
                <p className="bg-xp-gain">✨ +{Math.round(xpAward.xp)} XP</p>
                {xpAward.leveledUp && (
                  <p className="bg-level-up">
                    🏅 Level Up! Now Level {xpAward.level}
                    {xpAward.stat && (
                      <> — +1 {({strength:'⚔️',health:'❤️',stamina:'🛡️'} as Record<StatKey,string>)[xpAward.stat]} {xpAward.stat[0].toUpperCase()+xpAward.stat.slice(1)}</>
                    )}
                  </p>
                )}
              </div>
            )}
            {winner==='player'
              ? <p className="bg-sub">{ac.icon} {playerName} stands triumphant!</p>
              : player && <>
                  <p className="bg-sub">{player.name} has fallen at Stage {stage}.</p>
                  <div className="bg-bonfire-preview">
                    <div className="bg-bfp-row">
                      <span>🔥 Bonfire · <strong>Stage {bonfireStage}</strong></span>
                      <span>⚠️ Enemies <strong>+{deathCount+1} lvl</strong> on restart</span>
                    </div>
                    <div className="bg-bfp-stats">
                      <span title="Strength">⚔️ {player.final.strength}</span>
                      <span title="Health">❤️ {player.final.health}</span>
                      <span title="Defense">🛡️ {player.final.stamina}</span>
                      <span title="Heals remaining">🧪 {healsLeft}/{maxPlayerHeals}</span>
                    </div>
                  </div>
                </>
            }
            <div className="bg-result-log">
              {log.slice(-6).map(e=>(
                <p key={e.id} className={['bl-entry',`bl-${e.type}`].join(' ')}>{e.text}</p>
              ))}
            </div>
            <div className="bg-result-btns">
              {winner==='player' ? (
                <button className="bg-cta" onClick={handleShowPerks} style={{borderColor:ac.color,color:ac.color}}>
                  ✨ Choose a Perk →
                </button>
              ) : (
                <div className="bg-defeat-options">
                  <button className="bg-cta bg-cta--bonfire" onClick={handleBonfireRestart}>
                    🔥 Return to Bonfire — Stage {bonfireStage}
                  </button>
                  <button className="bg-cta bg-cta--ghost" onClick={()=>{
                    if(window.confirm('Are you sure? All run progress and stat gains will be lost.')) handleRekindleAnew();
                  }}>
                    Rekindle anew
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PERK ── */}
        {phase==='perk' && player && (
          <div className="bg-panel bg-perk-screen">
            <p className="bg-eyebrow">Stage {stage} Complete</p>
            <h2 className="bg-title">Choose a Perk</h2>
            <p className="bg-sub" style={{opacity:0.7,fontSize:'0.82rem'}}>
              Pick one upgrade. It lasts for the rest of your run.
            </p>
            <div className="bg-perk-row">
              {perkChoices.map(perk=>(
                <button key={perk.id} className="bg-perk-card"
                  onClick={()=>applyPerkAndContinue(perk.id)}
                  style={{'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}>
                  <span className="bpc-icon">{perk.icon}</span>
                  <span className="bpc-name">{perk.name}</span>
                  <span className="bpc-desc">{perk.desc}</span>
                </button>
              ))}
            </div>
            {healsLeft > 0 && (
              <button className="bg-perk-heal" onClick={handlePerkHeal}>
                🧪 Use a Heal — restore {Math.round(player.maxHp * 0.5)} HP
                <span className="bph-uses">{healsLeft} remaining</span>
              </button>
            )}
            <p className="bg-sub" style={{opacity:0.4,fontSize:'0.75rem',marginTop:'0.5rem'}}>
              HP: {player.hp}/{player.maxHp} · {healsLeft > 0 ? `🧪 ${healsLeft} heal${healsLeft>1?'s':''} available` : 'No heals left'} — carries into next stage.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
