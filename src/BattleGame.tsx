import { useState, useRef, useEffect } from 'react';
import { rarityColor, rarityGlow } from './critters';
import { supabase, submitStageScore, recordBattle, awardBattleXp, claimIdleBattles, bonusValue, xpForLevel, type BattleRecord, type RoundSnap, type StatBonuses } from './supabaseClient';
import { QrScanner } from './QrScanner';
import {
  ACTION_CFG, ADJECTIVES, AI_NAMES, ALIGN_CFG, DEFEND_NAMES,
  DIFFICULTY_CFG, GUILD_ICONS, GUILD_NAMES, HEAL_NAMES, MOVES, NAME_CRITTERS, RANK_RANGE,
} from './game/battleData';
import {
  aiAllocateDice, calcMaxHp, computeRound, diceCountForStage, generateAIForStage,
  pick, pickAIAction, rarityTierForStage, rollD6, rollPerkChoices, rollStatForRarity, uid,
} from './game/combat';
import { D6Die, FighterCard, PotionStack } from './game/components';
import type {
  Action, Alignment, AnimStep, Fighter, FloatDmg, Guild, LogEntry,
  NamePart, PerkDef, Rarity, StatKey, Stats,
} from './game/types';

// ─── Critter photos (used as boss portraits) ──────────────────────────────────
const _critterMods = import.meta.glob(
  '../images/product_images/critters/*.{png,jpg,jpeg,gif,webp}',
  { eager: true, import: 'default' }
) as Record<string, string>;
const CRITTER_PHOTOS = Object.values(_critterMods).filter(Boolean) as string[];

// ─── Local types ──────────────────────────────────────────────────────────────
type Phase      = 'mode' | 'scan' | 'scan-setup' | 'setup' | 'rolling' | 'allocating' | 'real-setup' | 'real-stats' | 'battle' | 'result';
type BattleStep = 'choose' | 'player-rolling' | 'animating';

interface BattleMeta {
  p: Fighter; a: Fighter;
  stage: number; deathCount: number; isBoss: boolean;
  maxHeals: number; bonusAtk: number; bonusPass: number;
  opponentId: string | null;
}

const STAT_KEYS: StatKey[] = ['strength', 'health', 'stamina'];

// Async matchmaking: pull a real critter from Supabase as the opponent.
// Tier mirrors generateAIForStage's rarity bands so stage progression stays
// consistent. Returns null if no eligible critter is found, so callers can
// fall back to the generated AI.
async function fetchRealOpponent(stage: number, excludeId: string | null):
  Promise<{ base: Stats; final: Stats; rarity: Rarity; name: string; id: string } | null> {
  const tier = rarityTierForStage(stage);
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
  const dice = Array.from({ length: diceCountForStage(stage) }, rollD6);
  const final = aiAllocateDice(base, dice);
  return { base, final, rarity: tier, name: opp.name ?? 'Wild Critter', id: opp.id };
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BattleGame({ onClose, scannedId }: { onClose:()=>void; scannedId?: string | null }) {
  // Opened from a critter page with the ID already known? Start on the scan
  // panel in its loading state — never flash the camera/scan chooser.
  const [phase,          setPhase]         = useState<Phase>(scannedId ? 'scan' : 'mode');
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

  // True while opponent matchmaking is awaiting Supabase — disables the
  // buttons that trigger it so a double-click can't start two battles.
  const [matchLoading, setMatchLoading] = useState(false);
  const matchingRef = useRef(false);

  // QR scan state — starts "loading" when a scanned ID was handed in, so the
  // camera never mounts on first paint
  const [scanId,       setScanId]       = useState('');
  const [scanLoading,  setScanLoading]  = useState(!!scannedId);
  const [scanError,    setScanError]    = useState<string|null>(null);
  // ID of the player's scanned critter — used to lock the name field and
  // exclude self-matches during async opponent matchmaking.
  const [scannedCritterId, setScannedCritterId] = useState<string|null>(null);
  // Persistent level/XP for the scanned critter (from Supabase)
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerXp,    setPlayerXp]    = useState(0);
  // "Trained while away" recap shown on the scan-setup screen
  const [idleNote,    setIdleNote]    = useState<string | null>(null);
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

  const roundsRef     = useRef<RoundSnap[]>([]);
  const battleMetaRef = useRef<BattleMeta | null>(null);

  // All animation timeouts go through schedule() so they can be cancelled if
  // the modal unmounts mid-animation (otherwise the chains keep firing
  // setState into a dead component and corrupt the next session's state).
  const timersRef = useRef<number[]>([]);
  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  // Lock background page scroll while the modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load a scanned critter into the setup flow. Banked idle-training battles
  // are claimed first so the stats/XP we read are post-training.
  const loadScannedCritter = async (id: string): Promise<boolean> => {
    const idle = await claimIdleBattles(id);
    const { data, error } = await supabase
      .from('critters')
      .select('id, name, rarity, strength, health, stamina, level, xp, stat_bonuses')
      .eq('id', id)
      .single();
    if (error || !data) return false;
    const r = (data.rarity as string).toLowerCase() as Rarity;
    setRarity(r);
    // Battle with effective stats: printed card values + level-up bonuses
    const bon = data.stat_bonuses as StatBonuses | null;
    setBase({
      strength: data.strength + bonusValue(bon, 'strength'),
      health:   data.health   + bonusValue(bon, 'health'),
      stamina:  data.stamina  + bonusValue(bon, 'stamina'),
    });
    setPlayerName(data.name ?? '');
    setCritterMode('real');
    setScannedCritterId(data.id);
    setPlayerLevel(data.level ?? 1);
    setPlayerXp(data.xp ?? 0);
    setIdleNote(idle && idle.battles_fought > 0
      ? `🌙 Trained while away: won ${idle.wins} of ${idle.battles_fought} · +${idle.xp_gained} XP${idle.leveled_up ? ` · 🏅 Level ${idle.new_level}!` : ''}`
      : null);
    setPhase('scan-setup');
    return true;
  };

  // Auto-load critter if opened via "Enter the Arena" from the scan page
  useEffect(() => {
    if (!scannedId) return;
    setScanId(scannedId);
    setScanLoading(true);
    loadScannedCritter(scannedId.trim().toUpperCase()).then(ok => {
      setScanLoading(false);
      if (!ok) { setPhase('scan'); setScanError('Critter not found. Enter your ID manually.'); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rc = rarityColor[rarity];
  const rg = rarityGlow[rarity];
  const ac = ALIGN_CFG[alignment];

  // Serialize the async matchmaking handlers: the ref guard is synchronous so
  // two rapid clicks can't both pass before state updates.
  const beginMatch = async (fn: () => Promise<void>) => {
    if (matchingRef.current) return;
    matchingRef.current = true; setMatchLoading(true);
    try { await fn(); }
    finally { matchingRef.current = false; setMatchLoading(false); }
  };

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
    const initCritter = pick(NAME_CRITTERS);
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
    const pool = NAME_CRITTERS.filter(c => c.word !== selectedCritter?.word);
    const next = pick(pool.length ? pool : NAME_CRITTERS);
    setSelectedCritter(next);
    setCritterRollsLeft(r => r - 1);
    setPlayerName(`${selectedAdj?.word ?? ''} ${next.word}`);
  };

  // ── Pre-battle dice ─────────────────────────────────────────────────────────
  const handleAllocRoll = () => {
    if (allocRolling || allocDice.length === 3) return;
    setAllocRolling(true); setAllocSettled(false);
    const final = [rollD6(), rollD6(), rollD6()];
    const delays = [...Array(14).fill(18),...Array(8).fill(40),...Array(5).fill(80),...Array(3).fill(160),...Array(2).fill(280)];
    let i = 0;
    const tick = () => {
      if (i < delays.length) { setAllocDice([rollD6(),rollD6(),rollD6()]); schedule(tick, delays[i++]); }
      else { setAllocDice(final); setAllocRolling(false); setAllocSettled(true); }
    };
    tick();
  };

  // Auto-roll the three dice as soon as the roll screen appears — the player
  // only needs to assign them, not trigger the roll
  const autoRolledRef = useRef(false);
  useEffect(() => {
    if (phase !== 'rolling') { autoRolledRef.current = false; return; }
    if (autoRolledRef.current) return;
    autoRolledRef.current = true;
    handleAllocRoll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  // ── Stage setup (shared by begin / next / bonfire) ──────────────────────────
  const buildOpponent = async (effStage: number, boss: boolean): Promise<Fighter> => {
    const aiAlign: Alignment = alignment === 'good' ? 'evil' : 'good';
    const real = await fetchRealOpponent(effStage, scannedCritterId);
    let aiBase: Stats, aiFinal: Stats, aiRarity: Rarity, aiName: string, opponentId: string | null;
    if (real) {
      aiBase = real.base; aiFinal = real.final; aiRarity = real.rarity; aiName = real.name; opponentId = real.id;
    } else {
      const gen = generateAIForStage(effStage);
      aiBase = gen.base; aiFinal = gen.final; aiRarity = gen.rarity;
      aiName = pick(AI_NAMES[aiAlign][aiRarity]); opponentId = null;
    }
    // Boss: +5 to one random stat + a real critter photo
    const bossBoostStat = boss ? pick(STAT_KEYS) : undefined;
    const img           = boss && CRITTER_PHOTOS.length > 0 ? pick(CRITTER_PHOTOS) : undefined;
    const final = bossBoostStat ? { ...aiFinal, [bossBoostStat]: aiFinal[bossBoostStat] + 5 } : aiFinal;
    const maxHp = calcMaxHp(final.health);
    return { name: aiName, rarity: aiRarity, alignment: aiAlign, base: aiBase,
             final, hp: maxHp, maxHp, bossBoostStat, img, opponentId };
  };

  const resetRoundUI = () => {
    setBattleStep('choose'); setPlayerAction(null);
    setCombatRoll(null); setCombatSettled(false);
    setRevealedAIAct(null); setRevealedAIRoll(null);
    setAnimStep('idle'); setFloatDmg(null);
    setTurnSpinning(false); setTurnFirst(null);
  };

  const startStage = (opts: {
    stageNum: number; deaths: number; boss: boolean;
    pFighter: Fighter; aFighter: Fighter;
    run: { maxHeals: number; bonusAtk: number; bonusPass: number };
    logLines: LogEntry[];
  }) => {
    const { stageNum, deaths, boss, pFighter, aFighter, run, logLines } = opts;
    setStage(stageNum); setIsBoss(boss);
    setAI(aFighter); setRound(1); setWinner(null); setAiHeals(0);
    roundsRef.current = [];
    battleMetaRef.current = {
      p: pFighter, a: aFighter, stage: stageNum, deathCount: deaths, isBoss: boss,
      maxHeals: run.maxHeals, bonusAtk: run.bonusAtk, bonusPass: run.bonusPass,
      opponentId: aFighter.opponentId ?? null,
    };
    setPlayerShield(pFighter.final.stamina); setPlayerShieldMax(pFighter.final.stamina); setPlayerDefended(false);
    setAiShield(aFighter.final.stamina);     setAiShieldMax(aFighter.final.stamina);     setAiDefended(false);
    setLog(logLines);
    resetRoundUI();
    setPhase('battle');
  };

  // ── Begin battle ────────────────────────────────────────────────────────────
  const handleBeginBattle = () => beginMatch(async () => {
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
    const pMaxHp = calcMaxHp(pFinal.health);
    const pF: Fighter = { name:playerName||'Your Critter', rarity, alignment, guild, base, final:pFinal, hp:pMaxHp, maxHp:pMaxHp };
    const aF = await buildOpponent(1, false);
    const aac = ALIGN_CFG[aF.alignment];

    setMaxPlayerHeals(3); setBonusAttackRoll(0); setBonusPassive(0); setPerkChoices([]);
    setPlayer(pF); setPlayerHeals(0);
    startStage({
      stageNum: 1, deaths: deathCount, boss: false, pFighter: pF, aFighter: aF,
      run: { maxHeals: 3, bonusAtk: 0, bonusPass: 0 },
      logLines: [
        {id:uid(),type:'info',text:`⚔️  Battle begins!  ${pF.name}  vs  ${aF.name}`},
        {id:uid(),type:'info',text:`You — ${ac.icon} ${ac.label} · STR ${pFinal.strength} · ❤️ ${pMaxHp} HP · 🛡️ ${pFinal.stamina} shield`},
        {id:uid(),type:'info',text:`${aF.name} — ${aac.icon} ${aac.label} · STR ${aF.final.strength} · ❤️ ${aF.maxHp} HP · 🛡️ ${aF.final.stamina} shield`},
      ],
    });
  });

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
    const delays = [...Array(12).fill(18),...Array(8).fill(40),...Array(5).fill(80),...Array(2).fill(160),...Array(2).fill(280)];
    let i = 0;
    const tick = () => {
      if (i < delays.length) { setCombatRoll(rollD6()); schedule(tick, delays[i++]); }
      else {
        // Die settles — show result, pick AI move, then spin for turn order
        setCombatRoll(finalRoll); setCombatRolling(false); setCombatSettled(true);
        const aiAct = pickAIAction(snapA, snapP, lastPlayerAct, snapAiH, snapAiD);
        const aiR   = rollD6();
        setRevealedAIAct(aiAct); setRevealedAIRoll(aiR);
        // RNG turn order: 50 / 50 each round
        const goesFirst: 'player' | 'ai' = Math.random() < 0.5 ? 'player' : 'ai';
        // After 400 ms showing the settled die, start the spin wheel
        schedule(() => {
          setCombatSettled(false);
          setTurnSpinning(true);
          // Spin for 900 ms, then reveal result for 600 ms before combat begins
          schedule(() => {
            setTurnSpinning(false);
            // Arrow points at whoever goes first and stays up for the whole
            // round animation; cleared when the next choose step begins
            setTurnFirst(goesFirst);
            schedule(() => {
              resolveRound(action, finalRoll, aiAct, aiR, snapP, snapA, snapPS, snapAS, goesFirst);
            }, 600);
          }, 900);
        }, 400);
      }
    };
    tick();
  };

  const resolveRound = (pAct:Action, pRoll:number, aAct:Action, aRoll:number, curP:Fighter, curA:Fighter, curPS:number, curAS:number, goesFirst:'player'|'ai') => {
    setBattleStep('animating'); setLastPlayerAct(pAct);

    const r = computeRound({
      pAct, pRoll, aAct, aRoll, p: curP, a: curA,
      pShield: curPS, aShield: curAS,
      bonusAttackRoll, bonusPassive, goesFirst,
    });

    // Heals only count as used if the action actually resolved (a killing
    // blow from the first actor cancels the second actor's turn entirely)
    if (r.playerActed && pAct === 'heal') setPlayerHeals(h => h + 1);
    if (r.aiActed     && aAct === 'heal') setAiHeals(h => h + 1);
    // Defend takes effect at announcement, before either attack, so it is
    // spent even if the defender falls this round
    if (pAct === 'defend') { setPlayerDefended(true); setPlayerShieldMax(m => Math.max(m, curPS + r.pShieldGain)); }
    if (aAct === 'defend') {
      // AI defend: DEF stat increases by the roll, shield fully restores to new stat value
      setAiDefended(true);
      setAiShieldMax(r.aNewStamina);
      setAI(p => p ? { ...p, final: { ...p.final, stamina: r.aNewStamina } } : p);
    }

    const pMove = pAct==='attack' ? pick(MOVES[curP.alignment][curP.rarity])
      : pAct==='defend' ? pick(DEFEND_NAMES[curP.alignment]) : pick(HEAL_NAMES[curP.alignment]);
    const aMove = aAct==='attack' ? pick(MOVES[curA.alignment][curA.rarity])
      : aAct==='defend' ? pick(DEFEND_NAMES[curA.alignment]) : pick(HEAL_NAMES[curA.alignment]);
    const aac = ALIGN_CFG[curA.alignment];

    // ── Log (only actions that actually resolved) ────────────────────────────
    const entries: LogEntry[] = [{id:uid(),type:'separator',text:`── Round ${round} ──`}];

    if (r.playerActed) {
      if (pAct==='attack') {
        const sNote = r.aShieldAbsorb > 0 ? ` (shield −${r.aShieldAbsorb})` : ` (passive ${r.pass_a})`;
        entries.push({id:uid(),type:r.pCrit?'critical':'hit',who:'player',
          text:`${ac.icon} ${pMove}: roll ${pRoll}+${curP.final.strength}${r.pCrit?'+3🎯':''}${bonusAttackRoll>0?`+${bonusAttackRoll}⚡`:''}=${pRoll+curP.final.strength+(r.pCrit?3:0)+bonusAttackRoll}${sNote} → ${r.pDmg} dmg`});
      } else if (pAct==='defend') {
        entries.push({id:uid(),type:'block',who:'player',
          text:`🛡️ ${pMove}: +${r.pShieldGain} shield (${curP.final.stamina} DEF + roll ${pRoll})`});
      } else {
        entries.push({id:uid(),type:'heal',who:'player',
          text:`🧪 ${pMove}: +${r.pHeal} HP (roll ${pRoll} · ${Math.round((0.30+0.10*pRoll)*100)}% of max)`});
      }
    }

    if (r.aiActed) {
      if (aAct==='attack') {
        const sNote = r.pShieldAbsorb > 0 ? ` (shield −${r.pShieldAbsorb})` : ` (passive ${r.pass_p})`;
        entries.push({id:uid(),type:r.aCrit?'critical':'hit',who:'ai',
          text:`${aac.icon} ${aMove}: roll ${aRoll}+${curA.final.strength}${r.aCrit?'+3🎯':''}=${aRoll+curA.final.strength+(r.aCrit?3:0)}${sNote} → ${r.aDmg} dmg`});
      } else if (aAct==='defend') {
        entries.push({id:uid(),type:'block',who:'ai',
          text:`🛡️ ${curA.name} ${aMove}: DEF ${curA.final.stamina}+${aRoll}→${r.aNewStamina} · shield restored ${r.aNewStamina}/${r.aNewStamina}`});
      } else {
        entries.push({id:uid(),type:'heal',who:'ai',
          text:`🧪 ${curA.name} ${aMove}: +${r.aHeal} HP (roll ${aRoll} · ${Math.round((0.30+0.10*aRoll)*100)}% of max)`});
      }
    }
    if (r.aiDefeated||r.playerDefeated)
      entries.push({id:uid(),type:'info',text:r.aiDefeated?`🏆 ${curA.name} defeated! Victory!`:`💀 ${curP.name} falls! ${aac.icon} ${curA.name} wins.`});

    // ── Record this round ─────────────────────────────────────────────────────
    roundsRef.current.push({
      r: round, first: goesFirst,
      p_act: pAct, p_roll: pRoll, ai_act: aAct, ai_roll: aRoll,
      p_hp_start: curP.hp,  p_hp_end: r.pHpFinal,
      ai_hp_start: curA.hp, ai_hp_end: r.aHpFinal,
      p_shield_start: curPS,  p_shield_end: r.pShieldFinal,
      ai_shield_start: curAS, ai_shield_end: r.aShieldFinal,
      p_dmg: r.pDmg, ai_dmg: r.aDmg, p_crit: r.pCrit, ai_crit: r.aCrit,
    });

    // ── Animation — no text narration; the cards, bars, and floating numbers
    //    tell the story. Defend shields rise at announcement time, before
    //    either attack lands, so the bars match what the damage math used.
    if (aAct === 'defend') setAiShield(r.aNewStamina);
    if (pAct === 'defend') setPlayerShield(curPS + r.pShieldGain);

    // Helper: apply player's action visually. The opponent only flashes as
    // "hit" on an attack — heals and defends animate on the actor's own card.
    const showPlayerHit = () => {
      if (pAct==='attack') {
        setAnimStep('a-hit');
        if (r.pDmg > 0) setFloatDmg({val:r.pDmg,color:'#f87171',side:'ai',id:uid()});
        setAI(p=>p?{...p,hp:r.aHpAfterPlayerAct}:p);
        setAiShield(r.aShieldFinal);
      } else if (pAct==='heal') {
        setFloatDmg({val:-r.pHeal,color:'#4ade80',side:'player',id:uid()});
        setPlayer(p=>p?{...p,hp:r.pHpAfterPlayerAct}:p);
      } else {
        // shield bar already raised at announcement — float the gain
        setFloatDmg({val:0,label:`🛡️ +${r.pShieldGain}`,color:'#93c5fd',side:'player',id:uid()});
      }
    };

    // Helper: apply AI's action visually (mirror of showPlayerHit)
    const showAIHit = () => {
      if (aAct==='attack') {
        setAnimStep('p-hit');
        if (r.aDmg > 0) setFloatDmg({val:r.aDmg,color:'#f87171',side:'player',id:uid()});
        setPlayer(p=>p?{...p,hp:r.pHpAfterAiAct}:p);
        setPlayerShield(r.pShieldFinal);
      } else if (aAct==='heal') {
        setFloatDmg({val:-r.aHeal,color:'#4ade80',side:'ai',id:uid()});
        setAI(p=>p?{...p,hp:r.aHpAfterAiAct}:p);
      } else {
        // shield bar already raised at announcement — float the DEF gain
        setFloatDmg({val:0,label:`🛡️ +${aRoll}`,color:'#93c5fd',side:'ai',id:uid()});
      }
    };

    if (goesFirst === 'ai') {
      // ── AI goes first (a-act → p-hit → p-act → a-hit) ────────────────────────
      setAnimStep('a-act');

      schedule(() => {
        showAIHit();
        if (r.playerDefeated) { schedule(()=>finishRound(entries,r.pHpFinal,r.aHpFinal,'ai'),2000); return; }

        schedule(() => {
          setAnimStep('p-act');

          schedule(() => {
            showPlayerHit();
            schedule(()=>finishRound(entries,r.pHpFinal,r.aHpFinal,r.aiDefeated?'player':null),2000);
          }, 1000);
        }, 2000);
      }, 1000);
    } else {
      // ── Player goes first (p-act → a-hit → a-act → p-hit) ───────────────────
      setAnimStep('p-act');

      schedule(() => {
        showPlayerHit();
        if (r.aiDefeated) { schedule(()=>finishRound(entries,r.pHpFinal,r.aHpFinal,'player'),2000); return; }

        schedule(() => {
          setAnimStep('a-act');

          schedule(() => {
            showAIHit();
            schedule(()=>finishRound(entries,r.pHpFinal,r.aHpFinal,r.playerDefeated?'ai':null),2000);
          }, 1000);
        }, 2000);
      }, 1000);
    }
  };

  const finishRound = (entries:LogEntry[], finalPHp:number, finalAHp:number, rWinner:'player'|'ai'|null) => {
    setAnimStep('idle'); setFloatDmg(null); setTurnFirst(null);
    setLog(p=>[...p,...entries]); setRound(p=>p+1);
    if (rWinner) {
      setWinner(rWinner);
      if (rWinner === 'player') {
        setStreak(p => p + 1);
        // Victory screen doubles as the perk pick — roll the offers now, and
        // submit the stage score immediately so it counts even if the player
        // closes the modal here
        setPerkChoices(rollPerkChoices());
        submitStageScore(alignment, rarity, guild);
      }
      setPhase('result');
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
          final_p_hp: finalPHp, final_ai_hp: finalAHp,
          opponent_id: meta.opponentId,
          rounds: [...roundsRef.current],
        };
        recordBattle(rec);
        roundsRef.current = [];

        // Award XP / level-up for the player's scanned critter on a stage win
        if (rWinner === 'player' && scannedCritterId) {
          awardBattleXp(scannedCritterId, meta.stage, meta.isBoss).then(result => {
            if (!result || result.new_xp == null || result.new_level == null) return;
            // Show the server's actual XP delta rather than re-deriving the
            // formula client-side — the two can never disagree this way
            const gained = Math.max(0, result.new_xp - playerXp);
            setPlayerXp(result.new_xp);
            setPlayerLevel(result.new_level);
            setXpAward({
              xp: gained,
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

  const handleNextBattle = (overridePlayer?: Fighter) => beginMatch(async () => {
    const curPlayer = overridePlayer ?? player;
    if (!curPlayer) return;
    const newStage = stage + 1;
    const bossStage = newStage % 3 === 0;
    const aF = await buildOpponent(newStage + deathCount, bossStage);
    const bossTag = bossStage ? ' 👑 BOSS' : '';
    // HP and heal count carry over — no restoration between stages
    startStage({
      stageNum: newStage, deaths: deathCount, boss: bossStage, pFighter: curPlayer, aFighter: aF,
      run: { maxHeals: maxPlayerHeals, bonusAtk: bonusAttackRoll, bonusPass: bonusPassive },
      logLines: [
        {id:uid(),type:'info',text:`⚔️  Stage ${newStage}${bossTag} — ${aF.name} enters!`},
        {id:uid(),type:'info',text:`${aF.name} — STR ${aF.final.strength} · ❤️ ${aF.maxHp} HP · 🛡️ ${aF.final.stamina} shield${aF.bossBoostStat ? ` (+5 ${aF.bossBoostStat})` : ''}`},
        {id:uid(),type:'info',text:`⚠️ HP carries over: ${curPlayer.hp}/${curPlayer.maxHp} · 🛡️ ${curPlayer.final.stamina} shield restored`},
      ],
    });
  });

  // Bonfire restart: keep player stats, return to stage after last boss, enemies +1 level per death
  const handleBonfireRestart = () => beginMatch(async () => {
    if (!player) return;
    const newDeathCount = deathCount + 1;
    // Bonfires are always at stage ≡ 1 mod 3, so never a boss — kept for safety
    const bossStage = bonfireStage % 3 === 0;
    const aF = await buildOpponent(bonfireStage + newDeathCount, bossStage);

    // Player keeps all final stats; HP is fully restored at the bonfire
    const restoredPlayer: Fighter = { ...player, hp: player.maxHp };
    setDeathCount(newDeathCount);
    setPlayer(restoredPlayer);
    // playerHeals intentionally NOT reset — remaining heals carry over from death

    const bossTag = bossStage ? ' 👑 BOSS' : '';
    startStage({
      stageNum: bonfireStage, deaths: newDeathCount, boss: bossStage, pFighter: restoredPlayer, aFighter: aF,
      run: { maxHeals: maxPlayerHeals, bonusAtk: bonusAttackRoll, bonusPass: bonusPassive },
      logLines: [
        { id: uid(), type: 'info', text: `🔥 Bonfire — ${restoredPlayer.name} rises at Stage ${bonfireStage}` },
        { id: uid(), type: 'info', text: `HP restored to ${restoredPlayer.maxHp} · STR ${restoredPlayer.final.strength} · DEF ${restoredPlayer.final.stamina} · 🧪 ${healsLeft}/${maxPlayerHeals} heals` },
        { id: uid(), type: 'info', text: `⚠️ Enemies are +${newDeathCount} level${newDeathCount !== 1 ? 's' : ''} harder` },
        { id: uid(), type: 'info', text: `⚔️  Stage ${bonfireStage}${bossTag} — ${aF.name} enters!` },
      ],
    });
  });

  // ── QR scan: fetch critter from Supabase ───────────────────────────────────
  const handleScanLoad = async (overrideId?: string) => {
    const id = (overrideId ?? scanId).trim().toUpperCase();
    if (!id) { setScanError('No critter ID found.'); return; }
    setScanLoading(true); setScanError(null);
    const ok = await loadScannedCritter(id);
    setScanLoading(false);
    if (!ok) setScanError('Critter not found. Check your ID and try again.');
  };

  const handleScanSetupContinue = () => {
    setAllocDice([]); setAssigns([null, null, null]); setSelDie(null); setAllocSettled(false);
    setPhase('rolling');
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
    resetRoundUI();
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
  const applyPerkAndContinue = (perkId: string) => {
    if (matchingRef.current) return;   // already matchmaking the next stage
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
    <div className="bg-overlay" onClick={phase === 'battle' || phase === 'result' ? undefined : onClose}>
      <div className="bg-modal"
        style={{'--rarity-color':rc,'--rarity-glow':rg,'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}
        onClick={e=>e.stopPropagation()}>
        <button className="bg-close" aria-label="Close" onClick={() => {
          if (phase === 'battle' || phase === 'result') {
            if (window.confirm('Abandon this battle? All progress will be lost.')) onClose();
          } else {
            onClose();
          }
        }}>✕</button>

        <div className="bg-modal-scroll">

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
            <h2 className="bg-title">{scanLoading ? 'Your Critter' : 'Scan Your Card'}</h2>

            {scanLoading ? (
              <p className="bg-sub" style={{textAlign:'center',padding:'2rem 0'}}>⏳ Summoning your critter…</p>
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

            {idleNote && <p className="bg-idle-note">{idleNote}</p>}

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
            <p className="bg-sub" style={{fontSize:'0.8rem'}}>
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

            {/* Rarity below the name */}
            <p className="bg-roll-rarity" style={{color:rc}}>{rarity[0].toUpperCase()+rarity.slice(1)}</p>

            {/* Allegiance + guild — prominent badges */}
            <div className="bg-roll-badges">
              <span className="bg-roll-badge"
                style={{borderColor:ac.color,color:ac.color,boxShadow:`0 0 14px ${ac.glow}`}}>
                {ac.icon} {ac.label}
              </span>
              <span className="bg-roll-badge bg-roll-badge--guild">
                {GUILD_ICONS[guild]} {guild[0].toUpperCase()+guild.slice(1)}
              </span>
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

            <p className="bg-sub" style={{fontSize:'0.82rem'}}>
              {allocRolling || allocDice.length===0
                ? 'Rolling…'
                : allAssigned
                ? '⚔️ Ready — press Begin Battle'
                : 'Click dice to add to stat'}
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
                    <span className={`bab-add${ready?' bab-add--on':''}`} aria-hidden="true">＋</span>
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
                ↺ Reset Dice
              </button>
              <button className="bg-cta" onClick={handleBeginBattle} disabled={!allAssigned || matchLoading}
                style={{borderColor:ac.color,color:ac.color,opacity:allAssigned&&!matchLoading?1:0.4}}>
                {matchLoading ? '⏳ Summoning rival…' : '⚔️ Begin Battle'}
              </button>
            </div>
          </div>
        )}

        {/* ── BATTLE ── */}
        {phase==='battle' && player && ai && (
          <div className="bg-arena">
            {/* Rival on top */}
            <FighterCard fighter={ai} label="Rival" animStep={animStep} side="ai" floatDmg={floatDmg} shield={aiShield} shieldMax={aiShieldMax}
              healsLeft={Math.max(0, 1 - aiHeals)} canDefend={!aiDefended}/>

            {/* Dice face-off — you left, rival right. Halo + connector line in
                each side's color tie the die to its fighter card; the center
                spinner/arrow decides and shows who acts first. */}
            <div className="bg-mid-dice">
              <div className="bg-mid-die bg-mid-die--player"
                style={{'--halo':ac.color,'--halo-glow':ac.glow} as React.CSSProperties}>
                {playerAction && battleStep!=='choose' && (
                  <span className="bg-mid-act bg-mid-act--player">{ACTION_CFG[playerAction].icon}</span>
                )}
                <div className="bg-mid-halo">
                  <D6Die value={combatRoll ?? '?'} spinning={combatRolling} settled={combatSettled}/>
                </div>
              </div>

              <div className="bg-mid-center">
                {turnSpinning ? <div className="bg-ts-spinner"/>
                  : turnFirst !== null ? (
                      <span className="bg-mid-arrow"
                        style={{color: turnFirst==='player' ? ac.color : ALIGN_CFG[ai.alignment].color}}>
                        {turnFirst==='player' ? '◀' : '▶'}
                      </span>
                    )
                  : <span className="bg-mid-vs">vs</span>}
              </div>

              <div className="bg-mid-die bg-mid-die--rival"
                style={{'--halo':ALIGN_CFG[ai.alignment].color,'--halo-glow':ALIGN_CFG[ai.alignment].glow} as React.CSSProperties}>
                {revealedAIAct && (
                  <span className="bg-mid-act bg-mid-act--rival">{ACTION_CFG[revealedAIAct].icon}</span>
                )}
                <div className="bg-mid-halo">
                  <D6Die value={revealedAIRoll ?? '?'} spinning={combatRolling}/>
                </div>
              </div>
            </div>

            {/* You below */}
            <FighterCard fighter={player} label="You" animStep={animStep} side="player" floatDmg={floatDmg} shield={playerShield} shieldMax={playerShieldMax}/>

            <div className="bg-bottom">
              {battleStep==='choose' && (
                <div className="bg-action-btns">
                  {(['attack','defend','heal'] as Action[])
                    .filter(a => !(a==='defend' && playerDefended) && !(a==='heal' && playerHeals>=maxPlayerHeals))
                    .map(a=>(
                      <button key={a} className="bg-action-btn" onClick={()=>handleChooseAction(a)}>
                        {a==='heal'
                          ? <PotionStack count={healsLeft}/>
                          : <span className="bact-icon">{ACTION_CFG[a].icon}</span>}
                        <span className="bact-label">{ACTION_CFG[a].label}</span>
                      </button>
                    ))
                  }
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
            {winner==='player' && player ? (
              <>
                {/* Perk pick lives right on the victory screen */}
                <div className="bg-perk-row">
                  {perkChoices.map(perk=>(
                    <button key={perk.id} className="bg-perk-card"
                      onClick={()=>applyPerkAndContinue(perk.id)}
                      disabled={matchLoading}
                      style={{'--align-color':ac.color,'--align-glow':ac.glow} as React.CSSProperties}>
                      <span className="bpc-icon">{perk.icon}</span>
                      <span className="bpc-name">{perk.name}</span>
                      <span className="bpc-desc">{perk.desc}</span>
                    </button>
                  ))}
                </div>
                {healsLeft > 0 && (
                  <button className="bg-perk-heal" onClick={handlePerkHeal} disabled={matchLoading}>
                    <PotionStack count={healsLeft}/>
                    Use a Heal — restore {Math.round(player.maxHp * 0.5)} HP
                  </button>
                )}
                <p className="bg-sub" style={{fontSize:'0.78rem',marginTop:'0.5rem'}}>
                  HP: {player.hp}/{player.maxHp} · {healsLeft > 0 ? `🧪 ${healsLeft} heal${healsLeft>1?'s':''} available` : 'No heals left'}
                </p>
              </>
            ) : player && (
              <>
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
                <div className="bg-result-log">
                  {log.slice(-6).map(e=>(
                    <p key={e.id} className={['bl-entry',`bl-${e.type}`].join(' ')}>{e.text}</p>
                  ))}
                </div>
                <div className="bg-result-btns">
                  <div className="bg-defeat-options">
                    <button className="bg-cta bg-cta--bonfire" onClick={handleBonfireRestart} disabled={matchLoading}>
                      {matchLoading ? '⏳ Stoking the flames…' : `🔥 Return to Bonfire — Stage ${bonfireStage}`}
                    </button>
                    <button className="bg-cta bg-cta--ghost" onClick={handleRekindleAnew}>
                      Rekindle anew
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
