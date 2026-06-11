import type { Action, Alignment, Guild, NamePart, PerkDef, Rarity } from './types';

// ─── Move / name pools ────────────────────────────────────────────────────────
export const MOVES: Record<Alignment, Record<Rarity, string[]>> = {
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

export const DEFEND_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Ward','Sacred Shield','Divine Guard','Blessed Barrier'],
  evil: ['Shadow Veil','Dark Ward','Cursed Shell','Void Barrier'],
};

export const HEAL_NAMES: Record<Alignment, string[]> = {
  good: ['Holy Mend','Blessed Recovery','Sacred Restore','Divine Renewal'],
  evil: ['Dark Drain','Soul Leech','Shadow Mend','Cursed Regen'],
};

export const AI_NAMES: Record<Alignment, Record<Rarity, string[]>> = {
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

export const PORTRAITS: Record<Alignment, Record<Rarity, string>> = {
  good: { rare: '🦊', unique: '🦋', legendary: '🦅' },
  evil: { rare: '🐺', unique: '🐉', legendary: '☠️' },
};

export const ALIGN_CFG = {
  good: { label: 'Saintly', icon: '✨', color: '#fde68a', glow: 'rgba(253,230,138,0.5)' },
  evil: { label: 'Wicked',  icon: '🔥', color: '#ef4444', glow: 'rgba(239,68,68,0.5)'  },
};

export const DIFFICULTY_CFG: Record<Rarity, { diff: string; icon: string; desc: string }> = {
  rare:      { diff: 'Hard',   icon: '🩸', desc: 'Stats 0–5 · High variance' },
  unique:    { diff: 'Medium', icon: '⚡', desc: 'Stats 2–7 · Balanced'      },
  legendary: { diff: 'Easy',   icon: '✨', desc: 'Stats 6–9 · High power'    },
};

export const ACTION_CFG: Record<Action, { icon: string; label: string }> = {
  attack: { icon: '⚔️', label: 'Attack'  },
  defend: { icon: '🛡️', label: 'Defend'  },
  heal:   { icon: '🧪', label: 'Heal'    },
};

// ─── Perk pool ────────────────────────────────────────────────────────────────
export const ALL_PERKS: PerkDef[] = [
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
export const ADJECTIVES: Record<Alignment, NamePart[]> = {
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

export const NAME_CRITTERS: NamePart[] = [
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
export const GUILD_ICONS: Record<Guild, string> = {
  rabbit: '🐇', fox: '🦊', squirrel: '🐿️', rogue: '🥷',
};

export const GUILD_NAMES: Record<Guild, string[]> = {
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

export const RANK_RANGE: Record<Rarity, [number, number]> = {
  rare: [0, 5], unique: [2, 7], legendary: [6, 9],
};

// ─── Stat distributions (weighted bell curve per rarity) ──────────────────────
// [value, weight]
export const STAT_DIST: Record<Rarity, [number, number][]> = {
  rare:      [[0,5],[1,20],[2,25],[3,25],[4,20],[5,5]],
  unique:    [[2,5],[3,20],[4,25],[5,25],[6,20],[7,5]],
  legendary: [[6,10],[7,30],[8,35],[9,25]],
};

// ─── D6 dot positions ─────────────────────────────────────────────────────────
export const D6_DOTS: Record<number, [number, number][]> = {
  1: [[50,50]],
  2: [[32,32],[68,68]],
  3: [[32,32],[50,50],[68,68]],
  4: [[32,32],[68,32],[32,68],[68,68]],
  5: [[32,32],[68,32],[50,50],[32,68],[68,68]],
  6: [[32,26],[68,26],[32,50],[68,50],[32,74],[68,74]],
};
