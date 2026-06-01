export interface RuleCard {
  icon: string;
  title: string;
  text: string;
}

export interface RuleSet {
  id: string;
  buttonLabel: string;
  title: string;
  tagline: string;
  players: string;
  critters: string;
  dice: string;
  rules: RuleCard[];
}

export const ruleSets: RuleSet[] = [
  // ── 2 Player · No Dice ──────────────────────────────────────────────────────
  {
    id: '2p-nodice',
    buttonLabel: '2 Player · No Dice',
    title: 'Head-to-Head · No Dice',
    tagline: 'Pure strategy. No luck. Only stats.',
    players: '2',
    critters: '3 each',
    dice: 'None',
    rules: [
      {
        icon: '⚔️',
        title: 'Setup',
        text: 'Each player secretly picks 3 Critters from the full roster and places them face-down. Reveal simultaneously. The player whose combined Stamina is lower goes first.',
      },
      {
        icon: '🐾',
        title: 'Turn Order',
        text: 'On your turn, choose one of your living Critters to attack one of your opponent\'s. Strength is compared directly — the attacking Critter\'s Strength minus the defending Critter\'s Stamina equals damage dealt. Minimum damage is 1.',
      },
      {
        icon: '❤️',
        title: 'Health & Defeat',
        text: 'Each Critter starts with Health equal to its Health stat × 2 (so a Critter with Health 7 has 14 HP). When a Critter reaches 0 HP it is removed. Players alternate turns — you may switch which Critter you send each turn.',
      },
      {
        icon: '🏆',
        title: 'Winning',
        text: 'The first player to defeat all 3 of their opponent\'s Critters wins the round. Play best-of-three to crown the Critter Master. Ties on the final round go to the player with more total remaining HP across their Critters.',
      },
    ],
  },

  // ── 2 Player · 3 Critters · D20 ─────────────────────────────────────────────
  {
    id: '2p-3c-d20',
    buttonLabel: '2 Player · 3 Critters · D20',
    title: 'Standard Duel · D20',
    tagline: 'The classic clash. Three Critters. Roll for glory.',
    players: '2',
    critters: '3 each',
    dice: '1× D20 each',
    rules: [
      {
        icon: '⚔️',
        title: 'Setup',
        text: 'Each player chooses 3 Critters and lines them up in secret attack order. Flip to reveal. The Critter with the highest Stamina across both parties goes first — ties broken by a D20 roll-off.',
      },
      {
        icon: '🎲',
        title: 'Attacking',
        text: 'Declare your attacking Critter and your target. Roll a D20 and add your Critter\'s Strength. That is your Attack Total.',
      },
      {
        icon: '🛡️',
        title: 'Defending',
        text: 'The defending player rolls a D20 and adds their Critter\'s Stamina. That is the Defense Total. Subtract Defense from Attack — the remainder is damage dealt to the defender\'s Health. On a tie or defender wins, no damage is dealt.',
      },
      {
        icon: '💀',
        title: 'Critical Hit',
        text: 'If the attacker rolls a natural 20, damage is doubled before the defender\'s roll. If the defender rolls a natural 20, the attack is fully deflected and the attacker\'s Critter takes 1 damage (reflected blow).',
      },
      {
        icon: '❤️',
        title: 'Health',
        text: 'Critter HP = Health stat × 2. When a Critter hits 0 HP it\'s out. The next Critter in the owner\'s lineup enters immediately.',
      },
      {
        icon: '🏆',
        title: 'Winning',
        text: 'Eliminate all 3 opponent Critters to win the round. Play best-of-three. Legendary Critters may only be fielded in one of the three rounds per match.',
      },
    ],
  },

  // ── 2 Player · 5 Critters · D20 ─────────────────────────────────────────────
  {
    id: '2p-5c-d20',
    buttonLabel: '2 Player · 5 Critters · D20',
    title: 'Grand Battle · D20',
    tagline: 'Bigger parties. Longer wars. More glory.',
    players: '2',
    critters: '5 each',
    dice: '1× D20 each',
    rules: [
      {
        icon: '⚔️',
        title: 'Setup',
        text: 'Each player fields a party of 5 Critters. Arrange them in a public lineup — order matters. Frontline Critters must be defeated before backline Critters can be targeted.',
      },
      {
        icon: '🎲',
        title: 'Attacking',
        text: 'You may attack any Critter in the opponent\'s frontline (the first surviving position). Roll D20 + Strength. The defender rolls D20 + Stamina. Excess is damage.',
      },
      {
        icon: '🔁',
        title: 'Multi-Action',
        text: 'Each turn, a Critter gets a number of actions equal to its Stamina divided by 3 (rounded up, minimum 1). Extra actions can attack again or pass to a teammate — once per game per Critter.',
      },
      {
        icon: '💀',
        title: 'Critical Hit / Fumble',
        text: 'Natural 20 = double damage. Natural 1 = your Critter trips — loses its next action and takes 1 self-damage.',
      },
      {
        icon: '🌟',
        title: 'Legendary Bonus',
        text: 'A Legendary Critter in play grants all your other Critters +1 to their Stamina for defense rolls as long as it is alive.',
      },
      {
        icon: '🏆',
        title: 'Winning',
        text: 'Wipe out all 5 opponent Critters to win. No rounds — this is a single-match war. Highest total HP remaining on the winning side is recorded as the victory margin.',
      },
    ],
  },

  // ── 1 Player · Solo Gauntlet · D20 ──────────────────────────────────────────
  {
    id: '1p-solo-d20',
    buttonLabel: '1 Player · Solo Gauntlet · D20',
    title: 'Solo Gauntlet · D20',
    tagline: 'Face the wild alone. How long can you last?',
    players: '1',
    critters: '3 (yours) vs rotating challengers',
    dice: '2× D20',
    rules: [
      {
        icon: '⚔️',
        title: 'Setup',
        text: 'Choose 3 Critters for your party. Shuffle the full critter roster (excluding yours) to form the Challenger Deck. Draw the top Challenger — it fights alone with its base stats.',
      },
      {
        icon: '🎲',
        title: 'Your Turn',
        text: 'Pick one of your Critters to attack the Challenger. Roll D20 + Strength vs the Challenger\'s flat Stamina (no roll — the Challenger uses its stat directly as the defense value). Excess is damage.',
      },
      {
        icon: '🤖',
        title: 'Challenger\'s Turn',
        text: 'After your attack, the Challenger counterattacks. Roll a D20 and add the Challenger\'s Strength. Your defending Critter rolls D20 + its Stamina. Excess damages your Critter.',
      },
      {
        icon: '🔄',
        title: 'Gauntlet Progression',
        text: 'Defeat a Challenger and draw the next one. Between rounds your Critters do NOT fully heal — they carry their current HP forward. Rare Challengers give +1 HP to one of your Critters upon defeat. Unique give +2. Legendary give a full heal to one Critter.',
      },
      {
        icon: '💀',
        title: 'Death & Defeat',
        text: 'If all 3 of your Critters are defeated you lose the Gauntlet. Your score is the number of Challengers defeated.',
      },
      {
        icon: '🏆',
        title: 'Victory',
        text: 'Defeat 5 Challengers to win the Gauntlet. Defeat all 6 to achieve Legendary status. Track high scores between sessions to compete with friends.',
      },
    ],
  },

  // ── 3–4 Player · Free-for-All · D20 ─────────────────────────────────────────
  {
    id: '3-4p-ffa-d20',
    buttonLabel: '3–4 Player · Free-for-All · D20',
    title: 'Free-for-All · D20',
    tagline: 'Every Critter for themselves.',
    players: '3–4',
    critters: '2 each',
    dice: '1× D20 each',
    rules: [
      {
        icon: '⚔️',
        title: 'Setup',
        text: 'Each player picks 2 Critters. Determine turn order by each player rolling a D20 — highest goes first, then clockwise. Reveal all Critters at once.',
      },
      {
        icon: '🎯',
        title: 'Targeting',
        text: 'On your turn, choose any Critter belonging to any opponent and attack with one of your own. Roll D20 + Strength vs target\'s D20 + Stamina. Excess is damage. You may split attacks between your 2 Critters each turn (one action each).',
      },
      {
        icon: '🤝',
        title: 'Temporary Alliances',
        text: 'Once per game, two players may declare a temporary alliance for one full round. During that round they cannot attack each other. The alliance automatically breaks after the round ends.',
      },
      {
        icon: '💀',
        title: 'Elimination',
        text: 'When a player\'s last Critter falls they are eliminated. Their turn is skipped from that point. The last player with a living Critter wins.',
      },
      {
        icon: '🌟',
        title: 'Bounty Rule',
        text: 'The player currently in the lead (most Critters alive, then most HP) has a Bounty. Any player who eliminates a Bounty Critter gains +3 HP on one of their surviving Critters.',
      },
      {
        icon: '🏆',
        title: 'Winning',
        text: 'Last Critter standing wins. In the event of a simultaneous double-KO on the final two players, the player with the highest combined Strength across their defeated Critters is declared champion.',
      },
    ],
  },

  // ── 2 Player · Draft Mode · D20 ─────────────────────────────────────────────
  {
    id: '2p-draft-d20',
    buttonLabel: '2 Player · Draft Mode · D20',
    title: 'Draft Mode · D20',
    tagline: 'Build your party on the fly. No do-overs.',
    players: '2',
    critters: '3 each (drafted)',
    dice: '1× D20 each',
    rules: [
      {
        icon: '🃏',
        title: 'Draft Setup',
        text: 'Lay all 6 Critters face-up in the center. Flip a coin or roll a D20 to decide who drafts first. The winner picks first.',
      },
      {
        icon: '🔄',
        title: 'Snake Draft',
        text: 'Player 1 picks 1 Critter. Player 2 picks 2 Critters. Player 1 picks 2 Critters. Player 2 picks 1 Critter. Each player ends up with 3 Critters. You may not trade or swap after the draft.',
      },
      {
        icon: '🧠',
        title: 'Strategy Note',
        text: 'Pay attention to your opponent\'s picks. If they stack Strength, grab high-Stamina defenders. If they take Legendary, you get two picks in a row — use them wisely.',
      },
      {
        icon: '🎲',
        title: 'Battle Rules',
        text: 'After drafting, battle follows standard 2 Player D20 rules: D20 + Strength to attack, D20 + Stamina to defend, excess is damage, HP = Health stat × 2.',
      },
      {
        icon: '💀',
        title: 'Critical Hit',
        text: 'Natural 20 on attack = double damage. Natural 20 on defense = full deflect + 1 reflected damage. Natural 1 on either roll = that Critter loses its next turn.',
      },
      {
        icon: '🏆',
        title: 'Winning',
        text: 'Eliminate all 3 opponent Critters to win. Best-of-three matches with a fresh draft each round — you cannot pick the same Critter twice in a match.',
      },
    ],
  },
];
