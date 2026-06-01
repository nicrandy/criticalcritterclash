import { useState, useRef, useEffect } from 'react';
import { rarityColor, rarityGlow } from './critters';

// ─── Types ────────────────────────────────────────────────────────────────────
type Rarity     = 'rare' | 'unique' | 'legendary';
type StatKey    = 'strength' | 'health' | 'stamina';
type Alignment  = 'good' | 'evil';
type Action     = 'attack' | 'defend' | 'heal';
type Phase      = 'setup' | 'rolling' | 'allocating' | 'battle' | 'result';
type BattleStep = 'choose' | 'player-rolling' | 'animating';
type AnimStep   = 'idle' | 'p-act' | 'a-hit' | 'a-act' | 'p-hit';

interface Stats   { strength: number; health: number; stamina: number; }
interface Fighter {
  name: string; rarity: Rarity; alignment: Alignment;
  base: Stats; final: Stats; hp: number; maxHp: number;
}
interface LogEntry {
  id: number;
  type: 'separator' | 'hit' | 'critical' | 'block' | 'heal' | 'info';
  who?: 'player' | 'ai';
  text: string;
}
interface Spotlight {
  title: string; detail: string;
  color: string;
  type: 'attack' | 'damage' | 'critical' | 'block' | 'heal' | 'idle';
}
interface FloatDmg { val: number; color: string; side: 'player' | 'ai'; id: number; }

// ─── Static data ──────────────────────────────────────────────────────────────
const MOVES: Record<Alignment, Record<Rarity, string[]>> = {
  good: {
    rare:      ['Holy Strike', 'Blessed Slash', 'Sacred Blow', 'Pure Light', 'Smite'],
    unique:    ["Angel's Wrath", 'Celestial Burst', 'Radiant Beam', 'Divine Smite', 'Holy Flare'],
    legendary: ["Heaven's Fury", 'Seraphic Judgment', 'Divine Obliteration', 'Holy Nova', 'Wrath of God'],
  },
  evil: {
    rare:      ['Shadow Slash', 'Cursed Blow', 'Dark Fang', 'Venom Strike', 'Hex Strike'],
    unique:    ['Soul Drain', 'Void Rend', 'Blood Curse', 'Demonic Burst', 'Necrotic Touch'],
    legendary: ['Hellfire', 'Eternal Damnation', "Abyss's Maw", 'Dark Annihilation', 'Death Knell'],
  },
};

const DEFEND_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Ward', 'Sacred Shield', 'Divine Guard', 'Blessed Barrier'],
  evil: ['Shadow Veil', 'Dark Ward', 'Cursed Shell', 'Void Barrier'],
};

const HEAL_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Mend', 'Blessed Recovery', 'Sacred Restore', 'Divine Renewal'],
  evil: ['Dark Drain', 'Soul Leech', 'Shadow Mend', 'Cursed Regen'],
};

const AI_NAMES: Record<Alignment, Record<Rarity, string[]>> = {
  evil: {
    rare:      ['Dark Fox', 'Shadow Bear', 'Cursed Wolf', 'Void Lizard', 'Blight Toad'],
    unique:    ['Shadow Pack', 'Demon Squirrel', 'Void Drake', 'Cursed Elk', 'Night Badger'],
    legendary: ['The Dark Jackalope', 'Doom Serpent', 'Eternal Shadow Lord'],
  },
  good: {
    rare:      ['Holy Fox', 'Sacred Bear', 'Blessed Wolf', 'Divine Lizard', 'Pure Toad'],
    unique:    ['Celestial Pack', 'Angel Squirrel', 'Radiant Drake', 'Divine Elk', 'Seraph Owl'],
    legendary: ['The Holy Jackalope', "Heaven's Champion", 'Eternal Seraphim'],
  },
};

const PORTRAITS: Record<Alignment, Record<Rarity, string>> = {
  good: { rare: '🦊', unique: '🦋', legendary: '🦅' },
  evil: { rare: '🐺', unique: '🐉', legendary: '☠️' },
};

const ALIGN_CFG = {
  good: { label: 'Saintly', icon: '✨', color: '#fde68a', glow: 'rgba(253,230,138,0.5)' },
  evil: { label: 'Wicked',  icon: '🔥', color: '#ef4444', glow: 'rgba(239,68,68,0.5)'  },
};

const ACTION_CFG: Record<Action, { icon: string; label: string; desc: string }> = {
  attack: { icon: '⚔️', label: 'Attack',  desc: 'D6 + Strength → damage' },
  defend: { icon: '🛡️', label: 'Defend',  desc: 'D6 + Defense → shield'  },
  heal:   { icon: '💊', label: 'Heal',    desc: 'D6 + Health → HP back'  },
};

const IDLE_SPOTLIGHT: Spotlight = { title: '', detail: '', color: '#888', type: 'idle' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const randInt     = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const rollD6      = () => randInt(1, 6);
const calcMaxHp   = (health: number) => health * 4 + 5;
const calcPassive = (f: Fighter) => Math.floor(f.final.stamina / 3);
let _uid = 0;
const uid  = () => ++_uid;
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

function generateAIStats(rarity: Rarity): Stats {
  const [mn, mx] = rarity === 'rare' ? [10, 14] : rarity === 'unique' ? [14, 18] : [18, 23];
  const cap = rarity === 'rare' ? 7 : 9;
  const total = randInt(mn, mx);
  const s = [1, 1, 1]; let rem = total - 3, t = 0;
  while (rem > 0 && t++ < 2000) { const i = randInt(0, 2); if (s[i] < cap) { s[i]++; rem--; } }
  for (let i = s.length - 1; i > 0; i--) { const j = randInt(0, i); [s[i], s[j]] = [s[j], s[i]]; }
  return { strength: s[0], health: s[1], stamina: s[2] };
}

function aiAllocateDice(base: Stats, dice: number[]): Stats {
  const r = { ...base };
  [...dice].sort((a, b) => b - a).forEach(d => {
    const k = (['strength', 'health', 'stamina'] as StatKey[]).reduce((a, b) => r[a] < r[b] ? a : b);
    r[k] += d;
  });
  return r;
}

function pickAIAction(ai: Fighter, _player: Fighter, lastPlayerAct: Action | null): Action {
  const hpPct = ai.hp / ai.maxHp;
  if (hpPct < 0.3 && Math.random() < 0.65) return 'heal';
  if (lastPlayerAct === 'attack' && Math.random() < 0.4) return 'defend';
  const r = Math.random();
  if (r < 0.55) return 'attack';
  if (r < 0.75) return 'defend';
  return 'heal';
}

// ─── D6 dot positions ─────────────────────────────────────────────────────────
const D6_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[32, 32], [68, 68]],
  3: [[32, 32], [50, 50], [68, 68]],
  4: [[32, 32], [68, 32], [32, 68], [68, 68]],
  5: [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
  6: [[32, 26], [68, 26], [32, 50], [68, 50], [32, 74], [68, 74]],
};

function D6Die({ value, spinning, selected, used, onClick, large }: {
  value: number | '?'; spinning?: boolean; selected?: boolean;
  used?: boolean; onClick?: () => void; large?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'bg-d6',
        spinning  ? 'bg-d6--spin' : '',
        selected  ? 'bg-d6--sel'  : '',
        used      ? 'bg-d6--used' : '',
        large     ? 'bg-d6--lg'   : '',
        onClick && !used && !spinning ? 'bg-d6--clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={used || !onClick}
    >
      <svg viewBox="0 0 100 100">
        <rect x="6" y="6" width="88" height="88" rx="18" className="d6-face" />
        {typeof value === 'number' && (D6_DOTS[value] ?? []).map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="8" className="d6-dot" />
        ))}
        {value === '?' && (
          <text x="50" y="62" textAnchor="middle" dominantBaseline="middle" className="d6-q">?</text>
        )}
      </svg>
      {used && <span className="bg-d6-check">✓</span>}
    </button>
  );
}

// ─── HPBar ────────────────────────────────────────────────────────────────────
function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  const col = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';
  return (
    <div className="hp-bar-track">
      <div className="hp-bar-fill" style={{ width: `${pct}%`, background: col }} />
    </div>
  );
}

// ─── FighterCard — horizontal layout ─────────────────────────────────────────
function FighterCard({ fighter, label, animStep, side, floatDmg }: {
  fighter: Fighter; label: string; animStep: AnimStep;
  side: 'player' | 'ai'; floatDmg: FloatDmg | null;
}) {
  const attacking = (side === 'player' && animStep === 'p-act') || (side === 'ai' && animStep === 'a-act');
  const hit       = (side === 'ai' && animStep === 'a-hit')     || (side === 'player' && animStep === 'p-hit');
  const ac        = ALIGN_CFG[fighter.alignment];
  const portrait  = PORTRAITS[fighter.alignment][fighter.rarity];
  const rc        = rarityColor[fighter.rarity];
  const showFloat = floatDmg && floatDmg.side === side;

  return (
    <div
      className={['fg-card', attacking ? 'fg-attacking' : '', hit ? 'fg-hit' : ''].filter(Boolean).join(' ')}
      style={{ '--align-color': ac.color, '--align-glow': ac.glow } as React.CSSProperties}
    >
      {showFloat && (
        <span key={floatDmg!.id} className="fg-float-dmg" style={{ color: floatDmg!.color }}>
          {floatDmg!.val >= 0 ? `-${floatDmg!.val}` : `+${-floatDmg!.val}`}
        </span>
      )}

      {/* Portrait */}
      <div className="fg-portrait" style={{ borderColor: ac.color, boxShadow: `0 0 12px ${ac.glow}` }}>
        {portrait}
      </div>

      {/* Main body */}
      <div className="fg-body">
        <div className="fg-body-top">
          <div className="fg-identity">
            <span className="fg-label">{label}</span>
            <span className="fg-name">{fighter.name}</span>
            <span className="fg-badges">
              <span className="fg-rarity" style={{ color: rc }}>{fighter.rarity}</span>
              <span className="fg-align" style={{ color: ac.color }}>{ac.icon} {ac.label}</span>
            </span>
          </div>
          <p className="fg-hp-badge">
            {fighter.hp}<span className="fg-hp-max"> / {fighter.maxHp} HP</span>
          </p>
        </div>

        <HPBar hp={fighter.hp} maxHp={fighter.maxHp} />

        <div className="fg-stats-row">
          {([
            { key: 'strength' as StatKey, icon: '⚔️', lbl: 'STR' },
            { key: 'health'   as StatKey, icon: '❤️', lbl: 'HP'  },
            { key: 'stamina'  as StatKey, icon: '🛡️', lbl: 'DEF' },
          ]).map(s => {
            const val   = fighter.final[s.key];
            const base  = fighter.base[s.key];
            const bonus = val - base;
            return (
              <div key={s.key} className="fg-stat-chip">
                <span className="fg-sc-icon">{s.icon}</span>
                <span className="fg-sc-lbl">{s.lbl}</span>
                <span className="fg-sc-val">
                  {val}{bonus > 0 && <span className="fg-si-bonus"> +{bonus}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SpotlightPanel — full-width bottom banner ────────────────────────────────
function SpotlightPanel({ spot, round }: { spot: Spotlight; round: number }) {
  if (spot.type === 'idle') {
    return (
      <div className="sp-panel sp-idle">
        <span className="sp-round">Round {round}</span>
        <span className="sp-hint">Choose your action below</span>
      </div>
    );
  }
  const icons: Record<string, string> = {
    attack: '⚡', damage: '💥', critical: '☀️', block: '🛡️', heal: '💚',
  };
  return (
    <div
      className={`sp-panel sp-${spot.type}`}
      style={{ borderColor: spot.color, '--sp-color': spot.color } as React.CSSProperties}
    >
      <span className="sp-icon">{icons[spot.type] ?? '⚡'}</span>
      <div className="sp-text">
        <span className="sp-title" style={{ color: spot.color }}>{spot.title}</span>
        {spot.detail && <span className="sp-detail">{spot.detail}</span>}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BattleGame({ onClose }: { onClose: () => void }) {
  const [phase,          setPhase]         = useState<Phase>('setup');
  const [alignment,      setAlignment]     = useState<Alignment>('good');
  const [rarity,         setRarity]        = useState<Rarity>('rare');
  const [base,           setBase]          = useState<Stats>({ strength: 4, health: 5, stamina: 7 });
  const [setupErr,       setSetupErr]      = useState('');

  // Pre-battle allocation
  const [allocDice,      setAllocDice]     = useState<number[]>([]);
  const [allocRolling,   setAllocRolling]  = useState(false);
  const [assigns,        setAssigns]       = useState<(StatKey | null)[]>([null, null, null]);
  const [selDie,         setSelDie]        = useState<number | null>(null);

  // Fighters
  const [player,         setPlayer]        = useState<Fighter | null>(null);
  const [ai,             setAI]            = useState<Fighter | null>(null);

  // Battle state
  const [battleStep,     setBattleStep]    = useState<BattleStep>('choose');
  const [playerAction,   setPlayerAction]  = useState<Action | null>(null);
  const [lastPlayerAct,  setLastPlayerAct] = useState<Action | null>(null);
  const [combatRoll,     setCombatRoll]    = useState<number | null>(null);
  const [combatRolling,  setCombatRolling] = useState(false);
  const [revealedAIAct,  setRevealedAIAct]  = useState<Action | null>(null);
  const [revealedAIRoll, setRevealedAIRoll] = useState<number | null>(null);

  // Visual
  const [log,            setLog]           = useState<LogEntry[]>([]);
  const [round,          setRound]         = useState(1);
  const [animStep,       setAnimStep]      = useState<AnimStep>('idle');
  const [spotlight,      setSpotlight]     = useState<Spotlight>(IDLE_SPOTLIGHT);
  const [spotKey,        setSpotKey]       = useState(0);   // forces SpotlightPanel remount → reruns CSS anim
  const [floatDmg,       setFloatDmg]      = useState<FloatDmg | null>(null);
  const [winner,         setWinner]        = useState<'player' | 'ai' | null>(null);
  const [streak,         setStreak]        = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const rc = rarityColor[rarity];
  const rg = rarityGlow[rarity];
  const ac = ALIGN_CFG[alignment];

  // Helper: set spotlight AND bump key so CSS animation retriggers
  const showSpot = (s: Spotlight) => {
    setSpotlight(s);
    setSpotKey(k => k + 1);
  };

  // ── Setup ──────────────────────────────────────────
  const setStat = (k: StatKey, d: number) =>
    setBase(p => ({ ...p, [k]: Math.max(0, Math.min(9, p[k] + d)) }));

  const handleStart = () => {
    if (Object.values(base).some(v => v < 0 || v > 9)) { setSetupErr('All stats must be 0–9.'); return; }
    setSetupErr('');
    setAllocDice([]); setAssigns([null, null, null]); setSelDie(null);
    setPhase('rolling');
  };

  // ── Pre-battle dice ease-out ───────────────────────
  const handleAllocRoll = () => {
    if (allocRolling) return;
    setAllocRolling(true);
    const final = [rollD6(), rollD6(), rollD6()];
    const schedule = [
      ...Array(10).fill(40), ...Array(7).fill(80),
      ...Array(5).fill(140), ...Array(3).fill(250), ...Array(2).fill(420),
    ];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) {
        setAllocDice([rollD6(), rollD6(), rollD6()]);
        setTimeout(tick, schedule[i++]);
      } else {
        setAllocDice(final);
        setAllocRolling(false);
      }
    };
    tick();
  };

  // ── Allocation ─────────────────────────────────────
  const handleAssign = (k: StatKey) => {
    if (selDie === null) return;
    setAssigns(p => { const n = [...p]; n[selDie] = k; return n; });
    setSelDie(null);
  };
  const allAssigned = assigns.every(a => a !== null);
  const finalStat   = (k: StatKey) =>
    base[k] + assigns.reduce((s, a, i) => a === k ? s + allocDice[i] : s, 0);

  // ── Begin battle ───────────────────────────────────
  const handleBeginBattle = () => {
    if (!allAssigned) return;
    const pFinal: Stats = {
      strength: finalStat('strength'),
      health:   finalStat('health'),
      stamina:  finalStat('stamina'),
    };
    const aiAlign: Alignment = alignment === 'good' ? 'evil' : 'good';
    const aiBase   = generateAIStats(rarity);
    const aiFinal  = aiAllocateDice(aiBase, [rollD6(), rollD6(), rollD6()]);
    const aiName   = pick(AI_NAMES[aiAlign][rarity]);
    const pMaxHp   = calcMaxHp(pFinal.health);
    const aMaxHp   = calcMaxHp(aiFinal.health);
    const aac      = ALIGN_CFG[aiAlign];

    const pF: Fighter = { name: 'Your Critter', rarity, alignment, base, final: pFinal, hp: pMaxHp, maxHp: pMaxHp };
    const aF: Fighter = { name: aiName, rarity, alignment: aiAlign, base: aiBase, final: aiFinal, hp: aMaxHp, maxHp: aMaxHp };
    setPlayer(pF); setAI(aF); setRound(1); setWinner(null);
    setLog([
      { id: uid(), type: 'info', text: `⚔️  Battle begins!  Your Critter  vs  ${aiName}` },
      { id: uid(), type: 'info', text: `You — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pMaxHp} HP · 🛡️ DEF ${pFinal.stamina}` },
      { id: uid(), type: 'info', text: `${aiName} — ${aac.icon} ${aac.label} · STR ${aiFinal.strength} · ❤️ ${aMaxHp} HP · 🛡️ DEF ${aiFinal.stamina}` },
    ]);
    setBattleStep('choose'); setPlayerAction(null);
    setCombatRoll(null); setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── Player picks action ─────────────────────────────
  const handleChooseAction = (action: Action) => {
    setPlayerAction(action);
    setCombatRoll(null);
    setRevealedAIAct(null);
    setRevealedAIRoll(null);
    setBattleStep('player-rolling');
  };

  // ── Player rolls combat D6 ──────────────────────────
  const handleCombatRoll = () => {
    if (combatRolling || !player || !ai || !playerAction) return;
    const snapPlayer = player;
    const snapAI     = ai;
    const snapAction = playerAction;
    setCombatRolling(true);
    const finalRoll = rollD6();
    const schedule  = [
      ...Array(8).fill(50), ...Array(6).fill(100),
      ...Array(4).fill(160), ...Array(2).fill(300), ...Array(2).fill(450),
    ];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) {
        setCombatRoll(rollD6());
        setTimeout(tick, schedule[i++]);
      } else {
        setCombatRoll(finalRoll);
        setCombatRolling(false);
        const aiAct = pickAIAction(snapAI, snapPlayer, lastPlayerAct);
        const aiR   = rollD6();
        setRevealedAIAct(aiAct);
        setRevealedAIRoll(aiR);
        resolveRound(snapAction, finalRoll, aiAct, aiR, snapPlayer, snapAI);
      }
    };
    tick();
  };

  // ── Core round resolution ───────────────────────────
  const resolveRound = (
    pAct: Action, pRoll: number,
    aAct: Action, aRoll: number,
    curPlayer: Fighter, curAI: Fighter,
  ) => {
    setBattleStep('animating');
    setLastPlayerAct(pAct);

    const pass_p = calcPassive(curPlayer);
    const pass_a = calcPassive(curAI);

    let pDmg = 0, aDmg = 0, pHeal = 0, aHeal = 0;
    let pCrit = false, aCrit = false;

    if (pAct === 'attack') {
      pCrit = pRoll === 6;
      const raw = pRoll + curPlayer.final.strength + (pCrit ? 3 : 0);
      pDmg = aAct === 'defend'
        ? Math.max(0, raw - (aRoll + curAI.final.stamina))
        : Math.max(0, raw - pass_a);
    } else if (pAct === 'heal') {
      pHeal = pRoll + curPlayer.final.health;
    }

    if (aAct === 'attack') {
      aCrit = aRoll === 6;
      const raw = aRoll + curAI.final.strength + (aCrit ? 3 : 0);
      aDmg = pAct === 'defend'
        ? Math.max(0, raw - (pRoll + curPlayer.final.stamina))
        : Math.max(0, raw - pass_p);
    } else if (aAct === 'heal') {
      aHeal = aRoll + curAI.final.health;
    }

    // Intermediate HP (after player's action)
    const aiHpMid     = Math.min(curAI.maxHp,     Math.max(0, curAI.hp     - pDmg));
    const playerHpMid = Math.min(curPlayer.maxHp,  Math.max(0, curPlayer.hp + pHeal));

    // Final HP (after AI's action)
    const aiHpFinal     = Math.min(curAI.maxHp,     Math.max(0, aiHpMid     + aHeal));
    const playerHpFinal = Math.min(curPlayer.maxHp,  Math.max(0, playerHpMid - aDmg));

    const aiDefeated     = aiHpMid <= 0;
    const playerDefeated = !aiDefeated && playerHpFinal <= 0;

    // Pre-pick move names
    const pMove = pAct === 'attack' ? pick(MOVES[curPlayer.alignment][curPlayer.rarity])
      : pAct === 'defend'           ? pick(DEFEND_NAMES[curPlayer.alignment])
      :                               pick(HEAL_NAMES[curPlayer.alignment]);
    const aMove = aAct === 'attack' ? pick(MOVES[curAI.alignment][curAI.rarity])
      : aAct === 'defend'           ? pick(DEFEND_NAMES[curAI.alignment])
      :                               pick(HEAL_NAMES[curAI.alignment]);

    const aac = ALIGN_CFG[curAI.alignment];

    // Build log
    const entries: LogEntry[] = [{ id: uid(), type: 'separator', text: `── Round ${round} ──` }];

    if (pAct === 'attack') {
      const shieldNote = aAct === 'defend'
        ? ` vs shield ${aRoll}+${curAI.final.stamina}=${aRoll + curAI.final.stamina}`
        : ` (passive ${pass_a})`;
      entries.push({ id: uid(), type: pCrit ? 'critical' : 'hit', who: 'player',
        text: `${ac.icon} ${pMove}: ${pRoll}+${curPlayer.final.strength}${pCrit ? '+3🎯' : ''}=${pRoll + curPlayer.final.strength + (pCrit ? 3 : 0)}${shieldNote} → ${pDmg} dmg (${curAI.name}: ${aiHpFinal} HP)` });
    } else if (pAct === 'defend') {
      entries.push({ id: uid(), type: 'block', who: 'player',
        text: `🛡️ ${pMove}: shield ${pRoll}+${curPlayer.final.stamina}=${pRoll + curPlayer.final.stamina}` });
    } else {
      entries.push({ id: uid(), type: 'heal', who: 'player',
        text: `💊 ${pMove}: healed +${pHeal} HP (You: ${playerHpFinal} HP)` });
    }

    if (aAct === 'attack') {
      const shieldNote = pAct === 'defend'
        ? ` vs your shield ${pRoll}+${curPlayer.final.stamina}=${pRoll + curPlayer.final.stamina}`
        : ` (passive ${pass_p})`;
      entries.push({ id: uid(), type: aCrit ? 'critical' : 'hit', who: 'ai',
        text: `${aac.icon} ${aMove}: ${aRoll}+${curAI.final.strength}${aCrit ? '+3🎯' : ''}=${aRoll + curAI.final.strength + (aCrit ? 3 : 0)}${shieldNote} → ${aDmg} dmg (You: ${playerHpFinal} HP)` });
    } else if (aAct === 'defend') {
      entries.push({ id: uid(), type: 'block', who: 'ai',
        text: `🛡️ ${curAI.name} ${aMove}: shield ${aRoll}+${curAI.final.stamina}=${aRoll + curAI.final.stamina}` });
    } else {
      entries.push({ id: uid(), type: 'heal', who: 'ai',
        text: `💊 ${curAI.name} ${aMove}: healed +${aHeal} HP (${curAI.name}: ${aiHpFinal} HP)` });
    }

    if (aiDefeated || playerDefeated) {
      entries.push({ id: uid(), type: 'info',
        text: aiDefeated
          ? `🏆 ${curAI.name} is defeated! Victory!`
          : `💀 Your Critter falls! ${aac.icon} ${curAI.name} wins.` });
    }

    // ── Animation sequence ─────────────────────────────────────────────
    // Step 1 (t=0): Player's action name appears
    const pSpotType: Spotlight['type'] = pAct === 'attack' ? (pCrit ? 'critical' : 'attack') : pAct === 'defend' ? 'block' : 'heal';
    setAnimStep('p-act');
    showSpot({ title: pMove, detail: `${ac.icon} ${ACTION_CFG[pAct].label}`, color: ac.color, type: pSpotType });

    // Step 2 (t+1000ms): Player's result lands — 2s display
    setTimeout(() => {
      setAnimStep('a-hit');
      if (pAct === 'attack') {
        if (pDmg > 0) {
          setFloatDmg({ val: pDmg, color: '#f87171', side: 'ai', id: uid() });
          setAI(p => p ? { ...p, hp: aiHpMid } : p);
          showSpot({ title: pCrit ? `🎯 Critical Hit! −${pDmg}` : `Hit! −${pDmg} damage`, detail: `${curAI.name}: ${aiHpMid} HP`, color: ac.color, type: pCrit ? 'critical' : 'damage' });
        } else {
          showSpot({ title: '🛡️ Blocked!', detail: 'Shield absorbed all damage', color: '#6ee7b7', type: 'block' });
        }
      } else if (pAct === 'heal') {
        setFloatDmg({ val: -pHeal, color: '#4ade80', side: 'player', id: uid() });
        setPlayer(p => p ? { ...p, hp: playerHpMid } : p);
        showSpot({ title: `💊 Healed +${pHeal} HP`, detail: `You: ${playerHpMid} HP`, color: '#4ade80', type: 'heal' });
      } else {
        showSpot({ title: `🛡️ ${pMove}`, detail: `Shield: ${pRoll + curPlayer.final.stamina}`, color: '#6ee7b7', type: 'block' });
      }

      if (aiDefeated) {
        setTimeout(() => finishRound(entries, playerHpFinal, aiHpFinal, 'player'), 2000);
        return;
      }

      // Step 3 (t+1000+2000ms): AI's action name appears
      setTimeout(() => {
        const aSpotType: Spotlight['type'] = aAct === 'attack' ? (aCrit ? 'critical' : 'attack') : aAct === 'defend' ? 'block' : 'heal';
        setAnimStep('a-act');
        showSpot({ title: aMove, detail: `${aac.icon} ${ACTION_CFG[aAct].label}`, color: aac.color, type: aSpotType });

        // Step 4 (t+1000+2000+1000ms): AI's result lands — 2s display
        setTimeout(() => {
          setAnimStep('p-hit');
          if (aAct === 'attack') {
            if (aDmg > 0) {
              setFloatDmg({ val: aDmg, color: '#f87171', side: 'player', id: uid() });
              setPlayer(p => p ? { ...p, hp: playerHpFinal } : p);
              showSpot({ title: aCrit ? `🎯 Critical Hit! −${aDmg}` : `Hit! −${aDmg} damage`, detail: `You: ${playerHpFinal} HP`, color: aac.color, type: aCrit ? 'critical' : 'damage' });
            } else {
              showSpot({ title: '🛡️ Blocked!', detail: 'Your shield held firm', color: '#6ee7b7', type: 'block' });
            }
          } else if (aAct === 'heal') {
            setFloatDmg({ val: -aHeal, color: '#4ade80', side: 'ai', id: uid() });
            setAI(p => p ? { ...p, hp: aiHpFinal } : p);
            showSpot({ title: `💊 Rival healed +${aHeal} HP`, detail: `${curAI.name}: ${aiHpFinal} HP`, color: '#4ade80', type: 'heal' });
          } else {
            showSpot({ title: `🛡️ ${aMove}`, detail: `Shield: ${aRoll + curAI.final.stamina}`, color: '#6ee7b7', type: 'block' });
          }

          setTimeout(() => finishRound(entries, playerHpFinal, aiHpFinal, playerDefeated ? 'ai' : null), 2000);
        }, 1000);
      }, 2000);
    }, 1000);
  };

  const finishRound = (
    entries: LogEntry[],
    _pHp: number, _aHp: number,
    rWinner: 'player' | 'ai' | null,
  ) => {
    setAnimStep('idle');
    showSpot(IDLE_SPOTLIGHT);
    setFloatDmg(null);
    setLog(p => [...p, ...entries]);
    setRound(p => p + 1);
    if (rWinner) {
      setWinner(rWinner);
      if (rWinner === 'player') setStreak(p => p + 1);
      setPhase('result');
    } else {
      setBattleStep('choose');
      setPlayerAction(null); setCombatRoll(null);
      setRevealedAIAct(null); setRevealedAIRoll(null);
    }
  };

  // ── Next battle ──────────────────────────────────────
  const handleNextBattle = () => {
    if (!player) return;
    const aiAlign: Alignment = alignment === 'good' ? 'evil' : 'good';
    const aiBase   = generateAIStats(rarity);
    const aiFinal  = aiAllocateDice(aiBase, [rollD6(), rollD6(), rollD6()]);
    const aiName   = pick(AI_NAMES[aiAlign][rarity]);
    const aMaxHp   = calcMaxHp(aiFinal.health);
    const pHp      = player.maxHp;
    const aF: Fighter = { name: aiName, rarity, alignment: aiAlign, base: aiBase, final: aiFinal, hp: aMaxHp, maxHp: aMaxHp };
    setPlayer(p => p ? { ...p, hp: pHp } : p);
    setAI(aF); setRound(1); setWinner(null);
    setLog([
      { id: uid(), type: 'info', text: `⚔️  New challenger: ${aiName} enters the arena!` },
      { id: uid(), type: 'info', text: `${aiName} — STR ${aiFinal.strength} · ❤️ ${aMaxHp} HP · 🛡️ DEF ${aiFinal.stamina}` },
      { id: uid(), type: 'info', text: `Your HP restored to ${pHp}.` },
    ]);
    setBattleStep('choose'); setPlayerAction(null); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  const handleReset = () => {
    setPhase('setup'); setAllocDice([]); setAssigns([null, null, null]); setSelDie(null);
    setPlayer(null); setAI(null); setLog([]); setRound(1);
    setWinner(null); setStreak(0); setBattleStep('choose');
    setPlayerAction(null); setCombatRoll(null);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); showSpot(IDLE_SPOTLIGHT); setFloatDmg(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-overlay" onClick={onClose}>
      <div
        className="bg-modal"
        style={{ '--rarity-color': rc, '--rarity-glow': rg, '--align-color': ac.color, '--align-glow': ac.glow } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        <button className="bg-close" onClick={onClose}>✕</button>

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Enter the Battle</h2>
            <p className="bg-sub">Choose your allegiance and critter. Stats shape your combat style.</p>

            <div className="bg-align-row">
              {(['good', 'evil'] as Alignment[]).map(a => {
                const cfg    = ALIGN_CFG[a];
                const active = alignment === a;
                return (
                  <button key={a} onClick={() => setAlignment(a)}
                    className={`bg-align-btn bg-align-${a} ${active ? 'bg-align-btn--on' : ''}`}
                    style={active ? { borderColor: cfg.color, boxShadow: `0 0 24px ${cfg.glow}` } : {}}
                  >
                    <span className="bab-icon">{cfg.icon}</span>
                    <span className="bab-label" style={active ? { color: cfg.color } : {}}>{cfg.label}</span>
                    <span className="bab-desc">{a === 'good' ? 'Fight with honor & holy power' : 'Embrace dark power & cunning'}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-rarity-row">
              {(['rare', 'unique', 'legendary'] as Rarity[]).map(r => (
                <button key={r} onClick={() => setRarity(r)}
                  className={`bg-rarity-btn ${rarity === r ? 'bg-rarity-btn--on' : ''}`}
                  style={rarity === r ? { borderColor: rarityColor[r], color: rarityColor[r] } : {}}
                >{r[0].toUpperCase() + r.slice(1)}</button>
              ))}
            </div>

            <div className="bg-stat-inputs">
              {(['strength', 'health', 'stamina'] as StatKey[]).map(k => {
                const icons: Record<StatKey, string> = { strength: '⚔️', health: '❤️', stamina: '🛡️' };
                const names: Record<StatKey, string> = { strength: 'Strength', health: 'Health', stamina: 'Defense' };
                return (
                  <div key={k} className="bg-stat-row">
                    <span className="bg-stat-icon">{icons[k]}</span>
                    <span className="bg-stat-name">{names[k]}</span>
                    <div className="bg-stat-ctrl">
                      <button onClick={() => setStat(k, -1)} disabled={base[k] <= 0}>−</button>
                      <span>{base[k]}</span>
                      <button onClick={() => setStat(k, 1)} disabled={base[k] >= 9}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {setupErr && <p className="bg-error">{setupErr}</p>}
            <button className="bg-cta" onClick={handleStart} style={{ borderColor: ac.color, color: ac.color }}>
              {ac.icon} Roll Starting Dice →
            </button>
          </div>
        )}

        {/* ── ROLLING ── */}
        {phase === 'rolling' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle</p>
            <h2 className="bg-title">Roll Your Dice</h2>
            <p className="bg-sub">Roll 3 D6s — allocate each result to any stat.</p>
            <div className="bg-dice-row">
              {(allocDice.length === 3 ? allocDice : [0, 0, 0]).map((v, i) => (
                <D6Die key={i} value={allocDice.length === 3 ? v : '?'} spinning={allocRolling} large />
              ))}
            </div>
            {allocDice.length < 3 || allocRolling
              ? <button className="bg-cta" onClick={handleAllocRoll} disabled={allocRolling}
                  style={{ borderColor: ac.color, color: ac.color }}>
                  {allocRolling ? 'Rolling…' : '🎲 Roll Dice'}
                </button>
              : <button className="bg-cta" onClick={() => setPhase('allocating')}
                  style={{ borderColor: ac.color, color: ac.color }}>
                  Assign Stats →
                </button>
            }
          </div>
        )}

        {/* ── ALLOCATING ── */}
        {phase === 'allocating' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle</p>
            <h2 className="bg-title">Assign Your Dice</h2>
            <p className="bg-sub">Select a die, then tap the stat to boost it.</p>
            <div className="bg-dice-row">
              {allocDice.map((v, i) => (
                <D6Die key={i} value={v} large
                  selected={selDie === i}
                  used={assigns[i] !== null}
                  onClick={() => assigns[i] === null && setSelDie(selDie === i ? null : i)}
                />
              ))}
            </div>
            <div className="bg-alloc-stats">
              {(['strength', 'health', 'stamina'] as StatKey[]).map(k => {
                const icons: Record<StatKey, string> = { strength: '⚔️', health: '❤️', stamina: '🛡️' };
                const names: Record<StatKey, string> = { strength: 'Strength', health: 'Health', stamina: 'Defense' };
                const bonus = assigns.reduce((s, a, i) => a === k ? s + allocDice[i] : s, 0);
                return (
                  <button key={k} onClick={() => handleAssign(k)} disabled={selDie === null}
                    className={`bg-alloc-btn ${selDie !== null ? 'bg-alloc-btn--ready' : ''}`}>
                    <span>{icons[k]}</span>
                    <span className="bab-name">{names[k]}</span>
                    <span className="bab-val">
                      {base[k]}
                      {bonus > 0 && <> <span className="bab-plus">+{bonus}</span> = <strong>{base[k] + bonus}</strong></>}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="bg-cta" onClick={handleBeginBattle} disabled={!allAssigned}
              style={{ borderColor: ac.color, color: ac.color, opacity: allAssigned ? 1 : 0.4 }}>
              ⚔️ Begin Battle
            </button>
          </div>
        )}

        {/* ── BATTLE ── */}
        {phase === 'battle' && player && ai && (
          <div className="bg-arena">

            {/* Row 1 — Player */}
            <FighterCard fighter={player} label="Your Critter" animStep={animStep} side="player" floatDmg={floatDmg} />

            {/* Row 2 — AI */}
            <FighterCard fighter={ai} label="Rival" animStep={animStep} side="ai" floatDmg={floatDmg} />

            {/* Battle log */}
            <div className="bg-log" ref={logRef}>
              {log.map(e => (
                <p key={e.id} className={['bl-entry', `bl-${e.type}`, e.who ? `bl-${e.who}` : ''].filter(Boolean).join(' ')}>
                  {e.text}
                </p>
              ))}
              {battleStep === 'animating' && <p className="bl-entry bl-thinking">…resolving…</p>}
            </div>

            {/* Row 3 — Spotlight info + actions */}
            <div className="bg-bottom">
              {/* Spotlight banner — rerenders with fresh key each change */}
              <SpotlightPanel key={spotKey} spot={spotlight} round={round} />

              {/* Choose action */}
              {battleStep === 'choose' && (
                <div className="bg-action-btns">
                  {(['attack', 'defend', 'heal'] as Action[]).map(a => (
                    <button key={a} className="bg-action-btn" onClick={() => handleChooseAction(a)}>
                      <span className="bact-icon">{ACTION_CFG[a].icon}</span>
                      <span className="bact-label">{ACTION_CFG[a].label}</span>
                      <span className="bact-desc">{ACTION_CFG[a].desc}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Roll die */}
              {battleStep === 'player-rolling' && (
                <div className="bg-roll-area">
                  <p className="bg-roll-hint">
                    {ACTION_CFG[playerAction!].icon} <strong>{ACTION_CFG[playerAction!].label}</strong> declared — click the die to roll!
                  </p>
                  <D6Die
                    value={combatRoll ?? '?'}
                    spinning={combatRolling}
                    large
                    onClick={!combatRolling && combatRoll === null ? handleCombatRoll : undefined}
                  />
                  {!combatRolling && combatRoll === null && (
                    <button className="bg-cta" onClick={handleCombatRoll} style={{ borderColor: ac.color, color: ac.color }}>
                      🎲 Roll!
                    </button>
                  )}
                  {combatRolling && <p className="bg-roll-hint" style={{ fontStyle: 'italic', opacity: 0.5 }}>Rolling…</p>}
                </div>
              )}

              {/* Animating — show both rolls */}
              {battleStep === 'animating' && revealedAIAct && (
                <div className="bg-ai-reveal">
                  <span className="bg-ai-reveal-you">Your roll: <strong>{combatRoll}</strong> — {ACTION_CFG[playerAction!].icon} {ACTION_CFG[playerAction!].label}</span>
                  <span className="bg-ai-reveal-sep">·</span>
                  <span className="bg-ai-reveal-act">Rival rolled: <strong>{revealedAIRoll}</strong> — {ACTION_CFG[revealedAIAct].icon} {ACTION_CFG[revealedAIAct].label}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && (
          <div className="bg-panel bg-result">
            <div className="bg-result-icon">{winner === 'player' ? '🏆' : '💀'}</div>
            <h2 className={`bg-title ${winner === 'player' ? 'bg-win' : 'bg-lose'}`}>
              {winner === 'player' ? 'Victory!' : 'Defeated'}
            </h2>
            {winner === 'player' && streak > 0 && (
              <p className="bg-streak">🔥 {streak} win{streak > 1 ? 's' : ''} in a row</p>
            )}
            <p className="bg-sub">
              {winner === 'player' ? `${ac.icon} Your critter stands triumphant!` : 'Your critter has fallen. Train harder.'}
            </p>
            <div className="bg-result-log">
              {log.slice(-6).map(e => (
                <p key={e.id} className={['bl-entry', `bl-${e.type}`].join(' ')}>{e.text}</p>
              ))}
            </div>
            <div className="bg-result-btns">
              {winner === 'player' && (
                <button className="bg-cta" onClick={handleNextBattle} style={{ borderColor: ac.color, color: ac.color }}>
                  ⚔️ Next Rival →
                </button>
              )}
              <button className="bg-cta bg-cta--ghost" onClick={handleReset}>
                {winner === 'player' ? 'New Critter' : '↺ Try Again'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
