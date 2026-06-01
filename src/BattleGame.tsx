import { useState, useRef, useEffect } from 'react';
import { rarityColor, rarityGlow } from './critters';

// ─── Types ────────────────────────────────────────────────────────────────────
type Rarity    = 'rare' | 'unique' | 'legendary';
type StatKey   = 'strength' | 'health' | 'stamina';
type Alignment = 'good' | 'evil';
type Phase     = 'setup' | 'rolling' | 'allocating' | 'battle' | 'result';
type AnimPhase = 'idle' | 'p-atk' | 'a-hit' | 'a-atk' | 'p-hit';

interface Stats   { strength: number; health: number; stamina: number; }
interface Fighter {
  name: string; rarity: Rarity; alignment: Alignment;
  base: Stats; final: Stats; hp: number; maxHp: number;
}
interface LogEntry {
  id: number;
  type: 'separator' | 'hit' | 'critical' | 'fumble' | 'block' | 'info';
  who?: 'player' | 'ai'; text: string;
}
interface Spotlight {
  title: string; detail: string;
  color: string; type: 'attack' | 'damage' | 'critical' | 'fumble' | 'block' | 'idle';
}
interface FloatDmg { val: number; side: 'player' | 'ai'; id: number; }
interface AttackCalc {
  moveName: string;
  type: 'hit' | 'critical' | 'fumble' | 'block';
  dmgToDefender: number; dmgToAttacker: number;
  atkRoll: number; atkTotal: number;
  defRoll: number; defTotal: number;
}

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

// AI alignment = opposite of player
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

const IDLE_SPOTLIGHT: Spotlight = { title: '', detail: '', color: '#888', type: 'idle' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const randInt = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const rollD20 = () => randInt(1, 20);
let _uid = 0;
const uid = () => ++_uid;
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

function generateAIStats(rarity: Rarity): Stats {
  const [mn, mx] = rarity === 'rare' ? [14,18] : rarity === 'unique' ? [18,22] : [21,27];
  const cap = rarity === 'rare' ? 7 : 9;
  const total = randInt(mn, mx);
  const s = [1,1,1]; let rem = total - 3, t = 0;
  while (rem > 0 && t++ < 2000) { const i = randInt(0,2); if (s[i]<cap){s[i]++;rem--;} }
  for (let i=s.length-1;i>0;i--){const j=randInt(0,i);[s[i],s[j]]=[s[j],s[i]];}
  return { strength:s[0], health:s[1], stamina:s[2] };
}

function aiAllocateDice(base: Stats, dice: number[]): Stats {
  const r = {...base};
  [...dice].sort((a,b)=>b-a).forEach(d => {
    const k = (['strength','health','stamina'] as StatKey[]).reduce((a,b) => r[a]<r[b]?a:b);
    r[k] += d;
  });
  return r;
}

function calcAttack(atk: Fighter, def: Fighter): AttackCalc {
  const atkRoll  = rollD20();
  const defRoll  = rollD20();
  const atkTotal = atkRoll  + atk.final.strength;
  const defTotal = defRoll  + def.final.stamina;
  const moveName = pick(MOVES[atk.alignment][atk.rarity]);
  if (atkRoll === 1)
    return { moveName, type:'fumble',   dmgToDefender:0,                            dmgToAttacker:1, atkRoll,atkTotal,defRoll,defTotal };
  if (defRoll === 20)
    return { moveName, type:'block',    dmgToDefender:0,                            dmgToAttacker:1, atkRoll,atkTotal,defRoll,defTotal };
  if (atkRoll === 20)
    return { moveName, type:'critical', dmgToDefender:Math.max(1,(atkTotal-defTotal))*2, dmgToAttacker:0, atkRoll,atkTotal,defRoll,defTotal };
  return   { moveName, type:'hit',      dmgToDefender:Math.max(1, atkTotal-defTotal),    dmgToAttacker:0, atkRoll,atkTotal,defRoll,defTotal };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function D20({ value, spinning, selected, used, onClick }: {
  value: number|'?'; spinning?:boolean; selected?:boolean; used?:boolean; onClick?:()=>void;
}) {
  return (
    <button type="button"
      className={['bg-d20', spinning?'bg-d20--spin':'', selected?'bg-d20--sel':'', used?'bg-d20--used':''].filter(Boolean).join(' ')}
      onClick={onClick} disabled={used || !onClick}
    >
      <svg viewBox="0 0 100 116">
        <polygon points="50,4 96,32 96,84 50,112 4,84 4,32" className="d20-outer"/>
        <polygon points="50,22 82,78 18,78"               className="d20-inner"/>
        <text x="50" y="67" textAnchor="middle" dominantBaseline="middle" className="d20-num">{value}</text>
      </svg>
      {used && <span className="bg-d20-check">✓</span>}
    </button>
  );
}

function HPBar({ hp, maxHp }: { hp:number; maxHp:number }) {
  const pct = maxHp > 0 ? Math.max(0, (hp/maxHp)*100) : 0;
  const col = pct > 50 ? '#4ade80' : pct > 25 ? '#fb923c' : '#f87171';
  return <div className="hp-bar-track"><div className="hp-bar-fill" style={{width:`${pct}%`,background:col}}/></div>;
}

function FighterCard({ fighter, label, animPhase, side, floatDmg }: {
  fighter:Fighter; label:string; animPhase:AnimPhase; side:'player'|'ai'; floatDmg:FloatDmg|null;
}) {
  const attacking = (side==='player'&&animPhase==='p-atk')||(side==='ai'&&animPhase==='a-atk');
  const hit       = (side==='ai'&&animPhase==='a-hit')||(side==='player'&&animPhase==='p-hit');
  const ac        = ALIGN_CFG[fighter.alignment];
  const portrait  = PORTRAITS[fighter.alignment][fighter.rarity];
  const rc        = rarityColor[fighter.rarity];
  const showFloat = floatDmg && floatDmg.side === side;

  return (
    <div className={['fg-card', attacking?'fg-attacking':'', hit?'fg-hit':''].filter(Boolean).join(' ')}
         style={{'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}>
      {/* Floating damage */}
      {showFloat && (
        <span key={floatDmg!.id} className={`fg-float-dmg fg-float-${side}`}>
          -{floatDmg!.val}
        </span>
      )}

      {/* Portrait + identity */}
      <div className="fg-top">
        <div className="fg-portrait" style={{borderColor: ac.color, boxShadow:`0 0 12px ${ac.glow}`}}>
          {portrait}
        </div>
        <div className="fg-identity">
          <span className="fg-label">{label}</span>
          <span className="fg-name">{fighter.name}</span>
          <span className="fg-rarity" style={{color:rc}}>{fighter.rarity}</span>
          <span className="fg-align" style={{color:ac.color}}>{ac.icon} {ac.label}</span>
        </div>
      </div>

      {/* HP */}
      <HPBar hp={fighter.hp} maxHp={fighter.maxHp}/>
      <p className="fg-hp-txt">{fighter.hp} / {fighter.maxHp} HP</p>

      {/* Stats */}
      <div className="fg-stats-grid">
        {([
          {key:'strength' as StatKey, icon:'⚔️', lbl:'STR'},
          {key:'health'   as StatKey, icon:'❤️', lbl:'HP' },
          {key:'stamina'  as StatKey, icon:'🥾', lbl:'STA'},
        ]).map(s => {
          const val = fighter.final[s.key];
          const base = fighter.base[s.key];
          const bonus = val - base;
          return (
            <div key={s.key} className="fg-stat-item">
              <span className="fg-si-icon">{s.icon}</span>
              <div className="fg-si-body">
                <span className="fg-si-lbl">{s.lbl}</span>
                <div className="fg-si-bar">
                  <div className="fg-si-fill" style={{width:`${Math.min(100,(val/40)*100)}%`, background:ac.color}}/>
                </div>
              </div>
              <span className="fg-si-val">
                {val}
                {bonus > 0 && <span className="fg-si-bonus">+{bonus}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpotlightPanel({ spot, round }: { spot:Spotlight; round:number }) {
  if (spot.type === 'idle') {
    return (
      <div className="sp-panel sp-idle">
        <span className="sp-round">Round {round}</span>
        <span className="sp-hint">⚔️ Attack to begin</span>
      </div>
    );
  }
  const icons = { attack:'⚡', damage:'💥', critical:'☀️', fumble:'💨', block:'🛡️' };
  return (
    <div className={`sp-panel sp-${spot.type}`} style={{borderColor:spot.color,'--sp-color':spot.color} as React.CSSProperties}>
      <span className="sp-icon">{icons[spot.type] ?? '⚡'}</span>
      <span className="sp-title" style={{color:spot.color}}>{spot.title}</span>
      {spot.detail && <span className="sp-detail">{spot.detail}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BattleGame({ onClose }: { onClose:()=>void }) {
  const [phase,       setPhase]      = useState<Phase>('setup');
  const [alignment,   setAlignment]  = useState<Alignment>('good');
  const [rarity,      setRarity]     = useState<Rarity>('rare');
  const [base,        setBase]       = useState<Stats>({strength:4,health:4,stamina:4});
  const [setupErr,    setSetupErr]   = useState('');

  const [dice,        setDice]       = useState<number[]>([]);
  const [rolling,     setRolling]    = useState(false);

  const [assigns,     setAssigns]    = useState<(StatKey|null)[]>([null,null,null]);
  const [selDie,      setSelDie]     = useState<number|null>(null);

  const [player,      setPlayer]     = useState<Fighter|null>(null);
  const [ai,          setAI]         = useState<Fighter|null>(null);
  const [log,         setLog]        = useState<LogEntry[]>([]);
  const [round,       setRound]      = useState(1);
  const [battling,    setBattling]   = useState(false);
  const [animPhase,   setAnimPhase]  = useState<AnimPhase>('idle');
  const [spotlight,   setSpotlight]  = useState<Spotlight>(IDLE_SPOTLIGHT);
  const [floatDmg,    setFloatDmg]   = useState<FloatDmg|null>(null);
  const [winner,      setWinner]     = useState<'player'|'ai'|null>(null);
  const [streak,      setStreak]     = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const rc = rarityColor[rarity];
  const rg = rarityGlow[rarity];
  const ac = ALIGN_CFG[alignment];

  // ── Setup ──────────────────────────────────────────
  const setStat = (k:StatKey, d:number) =>
    setBase(p => ({...p,[k]:Math.max(0,Math.min(9,p[k]+d))}));

  const handleStart = () => {
    if (Object.values(base).some(v=>v<0||v>9)) { setSetupErr('All stats must be 0–9.'); return; }
    setSetupErr('');
    setDice([]); setAssigns([null,null,null]); setSelDie(null);
    setPhase('rolling');
  };

  // ── Dice ease-out animation ────────────────────────
  const handleRoll = () => {
    if (rolling) return;
    setRolling(true);
    const final = [rollD20(), rollD20(), rollD20()];
    // Decreasing interval schedule: fast → slow
    const schedule = [
      ...Array(10).fill(40),
      ...Array(7).fill(80),
      ...Array(5).fill(140),
      ...Array(3).fill(250),
      ...Array(2).fill(420),
    ];
    let i = 0;
    const tick = () => {
      if (i < schedule.length) {
        setDice([rollD20(), rollD20(), rollD20()]);
        setTimeout(tick, schedule[i++]);
      } else {
        setDice(final);
        setRolling(false);
      }
    };
    tick();
  };

  // ── Allocation ─────────────────────────────────────
  const handleAssign = (k:StatKey) => {
    if (selDie===null) return;
    setAssigns(p => { const n=[...p]; n[selDie]=k; return n; });
    setSelDie(null);
  };
  const allAssigned = assigns.every(a=>a!==null);
  const finalStat = (k:StatKey) => base[k] + assigns.reduce((s,a,i)=>a===k?s+dice[i]:s, 0);

  // ── Begin battle ───────────────────────────────────
  const handleBeginBattle = () => {
    if (!allAssigned) return;
    const pFinal:Stats = { strength:finalStat('strength'), health:finalStat('health'), stamina:finalStat('stamina') };
    const aiAlign:Alignment = alignment==='good' ? 'evil' : 'good';
    const aiBase = generateAIStats(rarity);
    const aiFinal = aiAllocateDice(aiBase, [rollD20(),rollD20(),rollD20()]);
    const aiName = pick(AI_NAMES[aiAlign][rarity]);
    const pHp = pFinal.health*2, aHp = aiFinal.health*2;

    const pF: Fighter = { name:'Your Critter', rarity, alignment, base, final:pFinal, hp:pHp, maxHp:pHp };
    const aF: Fighter = { name:aiName, rarity, alignment:aiAlign, base:aiBase, final:aiFinal, hp:aHp, maxHp:aHp };
    setPlayer(pF); setAI(aF); setRound(1); setWinner(null);
    setLog([
      {id:uid(),type:'info',text:`⚔️  Battle begins!  Your Critter  vs  ${aiName}`},
      {id:uid(),type:'info',text:`You  — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pHp} HP · STA ${pFinal.stamina}`},
      {id:uid(),type:'info',text:`${aiName}  — ${ALIGN_CFG[aiAlign].icon} ${ALIGN_CFG[aiAlign].label} · STR ${aiFinal.strength} · ❤️ ${aHp} HP · STA ${aiFinal.stamina}`},
    ]);
    setAnimPhase('idle'); setSpotlight(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  // ── Attack sequence ────────────────────────────────
  const handleAttack = () => {
    if (!player||!ai||battling) return;
    setBattling(true);

    // Pre-calculate both sides' attacks
    const pCalc = calcAttack(player, ai);
    const aCalc = calcAttack(ai, player);

    // Resolve HP changes
    let pHp = player.hp, aHp = ai.hp;
    aHp -= pCalc.dmgToDefender;
    pHp -= pCalc.dmgToAttacker; // fumble self-damage or reflected
    aHp = Math.max(0,aHp); pHp = Math.max(0,pHp);
    const aiDefeated = aHp <= 0;

    let pHpFinal = pHp, aHpFinal = aHp;
    if (!aiDefeated) {
      pHpFinal -= aCalc.dmgToDefender;
      aHpFinal -= aCalc.dmgToAttacker;
      pHpFinal = Math.max(0,pHpFinal);
      aHpFinal = Math.max(0,aHpFinal);
    }
    const playerDefeated = !aiDefeated && pHpFinal <= 0;

    // Build full log
    const currentRound = round;
    const entries: LogEntry[] = [{id:uid(),type:'separator',text:`── Round ${currentRound} ──`}];

    const pTypeMap = { hit:'hit', critical:'critical', fumble:'fumble', block:'block' } as const;
    const pMsg = pCalc.type==='fumble'
      ? `💨 ${ac.icon} Fumble! Rolled a 1 — ${player.name} slips and takes 1 self-damage. (You: ${pHp} HP)`
      : pCalc.type==='block'
      ? `🛡️ ${ALIGN_CFG[ai.alignment].icon} ${ai.name} rolls natural 20 — perfect block! 1 damage reflected back. (You: ${pHp} HP)`
      : pCalc.type==='critical'
      ? `☀️ CRITICAL HIT! ${player.name} uses ${pCalc.moveName}! ${pCalc.atkRoll}+${player.final.strength}=${pCalc.atkTotal} vs ${pCalc.defRoll}+${ai.final.strength}=${pCalc.defTotal} — ${pCalc.dmgToDefender} dmg! (${ai.name}: ${aHp} HP)`
      : `${ac.icon} ${player.name} → ${pCalc.moveName}: ${pCalc.atkRoll}+${player.final.strength}=${pCalc.atkTotal} ATK vs ${pCalc.defRoll}+${ai.final.stamina}=${pCalc.defTotal} DEF — ${pCalc.dmgToDefender} dmg. (${ai.name}: ${aHp} HP)`;
    entries.push({id:uid(), type:pTypeMap[pCalc.type], who:'player', text:pMsg});

    if (!aiDefeated) {
      const aac = ALIGN_CFG[ai.alignment];
      const aMsg = aCalc.type==='fumble'
        ? `💨 ${aac.icon} Fumble! ${ai.name} rolled a 1 — stumbles and takes 1 self-damage. (${ai.name}: ${aHpFinal} HP)`
        : aCalc.type==='block'
        ? `🛡️ ${ac.icon} You roll natural 20 — perfect block! 1 damage reflected at ${ai.name}. (${ai.name}: ${aHpFinal} HP)`
        : aCalc.type==='critical'
        ? `🔥 CRITICAL HIT! ${ai.name} uses ${aCalc.moveName}! ${aCalc.atkRoll}+${ai.final.strength}=${aCalc.atkTotal} vs ${aCalc.defRoll}+${player.final.stamina}=${aCalc.defTotal} — ${aCalc.dmgToDefender} dmg! (You: ${pHpFinal} HP)`
        : `${aac.icon} ${ai.name} → ${aCalc.moveName}: ${aCalc.atkRoll}+${ai.final.strength}=${aCalc.atkTotal} ATK vs ${aCalc.defRoll}+${player.final.stamina}=${aCalc.defTotal} DEF — ${aCalc.dmgToDefender} dmg. (You: ${pHpFinal} HP)`;
      entries.push({id:uid(), type:pTypeMap[aCalc.type], who:'ai', text:aMsg});
    }

    if (aiDefeated || playerDefeated) {
      const wText = aiDefeated
        ? `🏆 ${ai.name} is defeated! Victory for ${ac.icon} ${player.name}!`
        : `💀 ${player.name} falls! ${ALIGN_CFG[ai.alignment].icon} ${ai.name} wins.`;
      entries.push({id:uid(),type:'info',text:wText});
    }

    // ── Animation sequence ──────────────────────────
    // Step 1: Player attacks
    setAnimPhase('p-atk');
    setSpotlight({
      title: pCalc.moveName,
      detail: `${ac.icon} Your move`,
      color: ac.color,
      type: 'attack',
    });

    setTimeout(() => {
      // Step 2: AI takes hit (or self-damage on fumble/block)
      setAnimPhase('a-hit');
      const pDmgShown = pCalc.type==='fumble'||pCalc.type==='block' ? pCalc.dmgToAttacker : pCalc.dmgToDefender;
      const pFloatSide: 'player'|'ai' = pCalc.type==='fumble'||pCalc.type==='block' ? 'player' : 'ai';
      setFloatDmg({val:pDmgShown, side:pFloatSide, id:uid()});
      setAI(p    => p ? {...p, hp:aHp} : p);
      if (pCalc.dmgToAttacker > 0) setPlayer(p => p ? {...p, hp:pHp} : p);

      const spTitle = pCalc.type==='critical' ? '☀️ CRITICAL HIT!'
        : pCalc.type==='fumble' ? '💨 Fumble!'
        : pCalc.type==='block'  ? '🛡️ Blocked!'
        : `${pCalc.dmgToDefender} damage`;
      const spDetail = pCalc.type==='fumble' ? '1 self-damage'
        : pCalc.type==='block' ? '1 reflected'
        : `${ai.name}: ${aHp} HP`;
      setSpotlight({title:spTitle, detail:spDetail, color:ac.color, type:pCalc.type==='critical'?'critical':pCalc.type==='fumble'?'fumble':pCalc.type==='block'?'block':'damage'});

      if (aiDefeated) {
        setTimeout(() => finishRound(entries, pHp, aHp, 'player'), 900);
        return;
      }

      setTimeout(() => {
        // Step 3: AI attacks
        const aac = ALIGN_CFG[ai.alignment];
        setAnimPhase('a-atk');
        setSpotlight({title:aCalc.moveName, detail:`${aac.icon} Rival strikes`, color:aac.color, type:'attack'});

        setTimeout(() => {
          // Step 4: Player takes hit
          setAnimPhase('p-hit');
          const aDmgShown = aCalc.type==='fumble'||aCalc.type==='block' ? aCalc.dmgToAttacker : aCalc.dmgToDefender;
          const aFloatSide: 'player'|'ai' = aCalc.type==='fumble'||aCalc.type==='block' ? 'ai' : 'player';
          setFloatDmg({val:aDmgShown, side:aFloatSide, id:uid()});
          setAI(p    => p ? {...p, hp:aHpFinal} : p);
          setPlayer(p => p ? {...p, hp:pHpFinal} : p);

          const spTitleA = aCalc.type==='critical' ? '🔥 CRITICAL HIT!'
            : aCalc.type==='fumble' ? '💨 Rival Fumbles!'
            : aCalc.type==='block'  ? '🛡️ You Blocked!'
            : `${aCalc.dmgToDefender} damage`;
          const spDetailA = aCalc.type==='fumble' ? `${ai.name} takes 1 self-damage`
            : aCalc.type==='block' ? '1 reflected at rival'
            : `You: ${pHpFinal} HP`;
          setSpotlight({title:spTitleA, detail:spDetailA, color:aac.color, type:aCalc.type==='critical'?'critical':aCalc.type==='fumble'?'fumble':aCalc.type==='block'?'block':'damage'});

          setTimeout(() => finishRound(entries, pHpFinal, aHpFinal, playerDefeated?'ai':null), 900);
        }, 850);
      }, 700);
    }, 850);
  };

  const finishRound = (entries:LogEntry[], pHp:number, aHp:number, rWinner:'player'|'ai'|null) => {
    setAnimPhase('idle');
    setSpotlight(IDLE_SPOTLIGHT);
    setFloatDmg(null);
    setLog(p => [...p, ...entries]);
    setRound(p => p+1);
    setBattling(false);
    if (rWinner) {
      setWinner(rWinner);
      if (rWinner==='player') setStreak(p=>p+1);
      setPhase('result');
    }
  };

  // ── Next battle (keep critter, new AI) ─────────────
  const handleNextBattle = () => {
    if (!player||!ai) return;
    const aiAlign:Alignment = alignment==='good'?'evil':'good';
    const aiBase = generateAIStats(rarity);
    const aiFinal = aiAllocateDice(aiBase,[rollD20(),rollD20(),rollD20()]);
    const aiName = pick(AI_NAMES[aiAlign][rarity]);
    const aHp = aiFinal.health*2;
    const pHp = player.maxHp; // restore HP
    const aF:Fighter = {name:aiName,rarity,alignment:aiAlign,base:aiBase,final:aiFinal,hp:aHp,maxHp:aHp};
    setPlayer(p => p ? {...p,hp:pHp} : p);
    setAI(aF); setRound(1); setWinner(null);
    setLog([
      {id:uid(),type:'info',text:`⚔️  New challenger: ${aiName} enters the arena!`},
      {id:uid(),type:'info',text:`${aiName} — STR ${aiFinal.strength} · ❤️ ${aHp} HP · STA ${aiFinal.stamina}`},
      {id:uid(),type:'info',text:`Your HP restored to ${pHp}.`},
    ]);
    setAnimPhase('idle'); setSpotlight(IDLE_SPOTLIGHT); setFloatDmg(null);
    setPhase('battle');
  };

  const handleReset = () => {
    setPhase('setup'); setDice([]); setAssigns([null,null,null]); setSelDie(null);
    setPlayer(null); setAI(null); setLog([]); setRound(1);
    setWinner(null); setBattling(false); setStreak(0);
    setAnimPhase('idle'); setSpotlight(IDLE_SPOTLIGHT); setFloatDmg(null);
  };

  // ─── Render ───────────────────────────────────────
  return (
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal"
        style={{'--rarity-color':rc,'--rarity-glow':rg,'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}
        onClick={e=>e.stopPropagation()}
      >
        <button className="bg-close" onClick={onClose}>✕</button>

        {/* ── SETUP ── */}
        {phase==='setup' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Arena</p>
            <h2 className="bg-title">Enter the Battle</h2>
            <p className="bg-sub">Choose your allegiance and critter. Each choice shapes your combat style.</p>

            {/* Alignment */}
            <div className="bg-align-row">
              {(['good','evil'] as Alignment[]).map(a => {
                const cfg = ALIGN_CFG[a];
                const active = alignment===a;
                return (
                  <button key={a} onClick={()=>setAlignment(a)}
                    className={`bg-align-btn bg-align-${a} ${active?'bg-align-btn--on':''}`}
                    style={active?{borderColor:cfg.color,boxShadow:`0 0 24px ${cfg.glow}`}:{}}
                  >
                    <span className="bab-icon">{cfg.icon}</span>
                    <span className="bab-label" style={active?{color:cfg.color}:{}}>{cfg.label}</span>
                    <span className="bab-desc">{a==='good'?'Fight with honor & holy power':'Embrace dark power & cunning'}</span>
                  </button>
                );
              })}
            </div>

            {/* Rarity */}
            <div className="bg-rarity-row">
              {(['rare','unique','legendary'] as Rarity[]).map(r => (
                <button key={r} onClick={()=>setRarity(r)}
                  className={`bg-rarity-btn ${rarity===r?'bg-rarity-btn--on':''}`}
                  style={rarity===r?{borderColor:rarityColor[r],color:rarityColor[r]}:{}}
                >{r[0].toUpperCase()+r.slice(1)}</button>
              ))}
            </div>

            {/* Stats */}
            <div className="bg-stat-inputs">
              {(['strength','health','stamina'] as StatKey[]).map(k => {
                const icons = {strength:'⚔️',health:'❤️',stamina:'🥾'};
                return (
                  <div key={k} className="bg-stat-row">
                    <span className="bg-stat-icon">{icons[k]}</span>
                    <span className="bg-stat-name">{k[0].toUpperCase()+k.slice(1)}</span>
                    <div className="bg-stat-ctrl">
                      <button onClick={()=>setStat(k,-1)} disabled={base[k]<=0}>−</button>
                      <span>{base[k]}</span>
                      <button onClick={()=>setStat(k, 1)} disabled={base[k]>=9}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {setupErr && <p className="bg-error">{setupErr}</p>}
            <button className="bg-cta" onClick={handleStart} style={{borderColor:ac.color,color:ac.color}}>
              {ac.icon} Roll Starting Dice →
            </button>
          </div>
        )}

        {/* ── ROLLING ── */}
        {phase==='rolling' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle</p>
            <h2 className="bg-title">Roll Your Dice</h2>
            <p className="bg-sub">Roll 3 D20s — add each result to a stat of your choice.</p>
            <div className="bg-dice-row">
              {(dice.length===3?dice:[0,0,0]).map((v,i)=>(
                <D20 key={i} value={dice.length===3?v:'?'} spinning={rolling}/>
              ))}
            </div>
            {dice.length<3||rolling
              ? <button className="bg-cta" onClick={handleRoll} disabled={rolling} style={{borderColor:ac.color,color:ac.color}}>{rolling?'Rolling…':'🎲 Roll Dice'}</button>
              : <button className="bg-cta" onClick={()=>setPhase('allocating')} style={{borderColor:ac.color,color:ac.color}}>Assign Stats →</button>
            }
          </div>
        )}

        {/* ── ALLOCATING ── */}
        {phase==='allocating' && (
          <div className="bg-panel">
            <p className="bg-eyebrow">Pre-Battle</p>
            <h2 className="bg-title">Assign Your Dice</h2>
            <p className="bg-sub">Select a die, then tap the stat to boost it.</p>
            <div className="bg-dice-row">
              {dice.map((v,i)=>(
                <D20 key={i} value={v} selected={selDie===i} used={assigns[i]!==null}
                  onClick={()=>assigns[i]===null&&setSelDie(selDie===i?null:i)}/>
              ))}
            </div>
            <div className="bg-alloc-stats">
              {(['strength','health','stamina'] as StatKey[]).map(k=>{
                const icons={strength:'⚔️',health:'❤️',stamina:'🥾'};
                const bonus=assigns.reduce((s,a,i)=>a===k?s+dice[i]:s,0);
                return (
                  <button key={k} onClick={()=>handleAssign(k)} disabled={selDie===null}
                    className={`bg-alloc-btn ${selDie!==null?'bg-alloc-btn--ready':''}`}>
                    <span>{icons[k]}</span>
                    <span className="bab-name">{k[0].toUpperCase()+k.slice(1)}</span>
                    <span className="bab-val">{base[k]}{bonus>0&&<> <span className="bab-plus">+{bonus}</span> = <strong>{base[k]+bonus}</strong></>}</span>
                  </button>
                );
              })}
            </div>
            <button className="bg-cta" onClick={handleBeginBattle} disabled={!allAssigned}
              style={{borderColor:ac.color,color:ac.color,opacity:allAssigned?1:0.4}}>
              ⚔️ Begin Battle
            </button>
          </div>
        )}

        {/* ── BATTLE ── */}
        {phase==='battle' && player && ai && (
          <div className="bg-arena">
            {/* Fighter cards + spotlight */}
            <div className="bg-fighters">
              <FighterCard fighter={player} label="Your Critter" animPhase={animPhase} side="player" floatDmg={floatDmg}/>
              <SpotlightPanel spot={spotlight} round={round}/>
              <FighterCard fighter={ai}     label="Rival"        animPhase={animPhase} side="ai"     floatDmg={floatDmg}/>
            </div>

            {/* Battle log */}
            <div className="bg-log" ref={logRef}>
              {log.map(e=>(
                <p key={e.id} className={['bl-entry',`bl-${e.type}`,e.who?`bl-${e.who}`:''].filter(Boolean).join(' ')}>
                  {e.text}
                </p>
              ))}
              {battling&&<p className="bl-entry bl-thinking">…rolling…</p>}
            </div>

            {/* Actions */}
            <div className="bg-actions">
              <span className="bg-round-lbl">Round {round}</span>
              <button className="bg-cta bg-attack-btn" onClick={handleAttack} disabled={battling}
                style={{borderColor:ac.color,color:ac.color}}>
                {battling?'⏳ Battling…':'⚔️ Attack'}
              </button>
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
            {winner==='player'&&streak>0&&(
              <p className="bg-streak">🔥 {streak} win{streak>1?'s':''} in a row</p>
            )}
            <p className="bg-sub">{winner==='player'?`${ac.icon} Your critter stands triumphant!`:'Your critter has fallen. Train harder.'}</p>
            <div className="bg-result-log">
              {log.slice(-5).map(e=>(
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
