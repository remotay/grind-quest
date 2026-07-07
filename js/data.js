/* Grind Quest — game data: balance, zones, monsters, items, classes */
GQ.data = (() => {
  // One growth constant rules all scaling; balance stays level-independent.
  const G = 1.13;
  const P = (x) => Math.pow(G, x);

  const BAL = {
    G,
    monsterHp: z => 85 * P(z),
    monsterDmg: z => 8 * P(z),           // per hit
    monsterAtkInterval: 1.6,             // seconds
    xpKill: z => 11 * P(z),
    goldKill: z => 5 * P(z),
    heroAtk: L => 8 * P(L - 1),
    heroHp: L => 100 * P(L - 1),
    heroBaseRate: 1.5,                   // attacks per second
    // steep polynomial on top of the exponential: levels must slow down hard
    xpNext: L => Math.round(90 * P(L - 1) * (1 + 0.6 * Math.pow(L, 1.25))),
    armorK: z => 45 * P(z),              // DR = armor/(armor+K)
    itemStat: (coeff, ilvl) => coeff * P(ilvl),
    dropChance: 0.025,                   // drops are events, not confetti
    pityKills: 45,                       // guaranteed drop after this many dry kills
    setChance: 0.20,                     // Rare+ drops: chance to be a set piece
    bossSetChance: 0.35,                 // boss spoils: chance to be a set piece
    uniqueChance: 0.0012,                // named zone treasure, per kill
    shardDropChance: 0.02,
    eliteChance: 0.05,
    eliteMinKills: 30,                   // no elites during the first minutes
    eliteHp: 3.0,
    eliteDmg: 1.9,
    eliteXp: 3.0,
    eliteGold: 2.5,
    recoverTime: 25,                     // getting KO'd has to hurt
    respawnTime: 0.5,
    invCap: 60,
    offlineCap: 8 * 3600,
    maxEnhance: 15,
    enhancePerLevel: 0.08,               // +8% item stats per enhance level
    masteryTiers: [50, 400, 2500],       // kills per zone
    masteryDmgPerTier: 0.01,             // permanent global damage per tier
    bossKillsNeeded: 60,                 // zone kills to earn a boss attempt
    bossHpMult: 14,
    bossDmgMult: 2.0,
    bossAtkInterval: 2.0,
    bossXpMult: 40,
    bossGoldMult: 30,
    bossEnrage: 50,                      // seconds until the DPS check bites
    bossEnrageDmgMult: 3,
    bossUniqueChance: 0.08,
    bossDmgPerConquest: 0.02,            // permanent damage per conquered zone
    lootPerUnique: 2,                    // permanent loot find per discovered unique
    depthKills: 25,                      // kills to clear a Depth floor
    depthStep: 3,                        // levels per Depth floor
    eventDuration: 300,                  // world events last 5 minutes
    eventGapMin: 300,
    eventGapMax: 600,
    bestiaryTiers: [25, 250, 2500],
    bestiaryShards: [10, 40, 150],
    trialTime: 60,                       // seconds per Proof
    anomalyKills: 10,                    // kills to crack an anomaly's chest
    anomalyDuration: 600,                // the door stays open 10 minutes
    anomalyGapMin: 1100,
    anomalyGapMax: 2000,
    goblinChance: 0.012,                 // loot goblins: rare, rich, cowardly
    goblinMinKills: 50,
    goblinFlee: 8,                       // seconds before it escapes
    shinyGapMin: 45,                     // clickable sparks
    shinyGapMax: 120,
    shinyLife: 5,
    clickCd: 0.45,                       // manual strike cooldown
    clickPower: 0.4,                     // manual strike = 40% of an attack
    momentumMax: 10,                     // stacks from hands-on play
    momentumDmg: 0.015,                  // +1.5% damage per stack
    momentumDur: 5,                      // seconds before stacks fade
    petDps: 0.15,                        // companion hits for 15% of your attack
    petInterval: 2.0,
    petDropChance: 0.2,                  // per boss kill, guaranteed by the 5th
    petPityKills: 5,
    contractHours: 20,                   // Bureau Contracts refresh (real time)
  };

  const RARITIES = [
    { key: 'common',    name: 'Common',    color: '#a3adbf', weight: 100,  statMult: 1.00, affixes: 0 },
    { key: 'uncommon',  name: 'Uncommon',  color: '#52d97c', weight: 30,   statMult: 1.18, affixes: 1 },
    { key: 'rare',      name: 'Rare',      color: '#45b4f5', weight: 8,    statMult: 1.42, affixes: 2 },
    { key: 'epic',      name: 'Epic',      color: '#c07ef7', weight: 1.6,  statMult: 1.75, affixes: 3 },
    { key: 'legendary', name: 'Legendary', color: '#f79b45', weight: 0.22, statMult: 2.20, affixes: 4 },
    { key: 'mythic',    name: 'Mythic',    color: '#f7526f', weight: 0.02, statMult: 2.80, affixes: 5 },
    { key: 'unique',    name: 'Unique',    color: '#4fe0c4', weight: 0,    statMult: 2.50, affixes: 0 },
  ];

  // stat spec in variants/affixes: number = scaling coeff (grows with ilvl);
  // [lo,hi] = percent-style roll (roughly flat across levels).
  const SLOTS = [
    { key: 'weapon', name: 'Weapon', icon: '⚔️', w: 1.25, variants: [
      { names: ['Shortsword', 'Longsword', 'Greatsword', 'War Axe', 'Spellblade', 'Runic Dagger', 'Hunting Bow', 'Ashwood Staff', 'Iron Mace', 'Glaive'], stats: { atkFlat: 7 } },
    ]},
    { key: 'offhand', name: 'Off-hand', icon: '🛡️', w: 1, variants: [
      { names: ['Kite Shield', 'Tower Shield', 'Oaken Bulwark'], stats: { hpFlat: 9, armor: 3 } },
      { names: ['Grimoire', 'Runestone', 'Warhorn'], stats: { atkPct: [6, 12] } },
      { names: ['Quiver', 'Talisman'], stats: { haste: [5, 10] } },
    ]},
    { key: 'helm', name: 'Helm', icon: '🪖', w: 1, variants: [
      { names: ['Helm', 'Coif', 'Circlet', 'Hood', 'Greathelm'], stats: { hpFlat: 6, armor: 2.2 } },
    ]},
    { key: 'chest', name: 'Chest', icon: '🎽', w: 1, variants: [
      { names: ['Breastplate', 'Hauberk', 'Tunic', 'Robes', 'Cuirass'], stats: { hpFlat: 11, armor: 3.5 } },
    ]},
    { key: 'legs', name: 'Legs', icon: '👖', w: 1, variants: [
      { names: ['Greaves', 'Leggings', 'Legplates', 'Waukees'], stats: { hpFlat: 8, armor: 2.8 } },
    ]},
    { key: 'boots', name: 'Boots', icon: '🥾', w: 1, variants: [
      { names: ['Boots', 'Sabatons', 'Striders', 'Treads'], stats: { hpFlat: 5, armor: 1.8, haste: [2, 5] } },
    ]},
    { key: 'gloves', name: 'Gloves', icon: '🧤', w: 1, variants: [
      { names: ['Gauntlets', 'Grips', 'Handwraps', 'Talon Gloves'], stats: { hpFlat: 4, armor: 1.5, atkFlat: 1.8 } },
    ]},
    { key: 'amulet', name: 'Amulet', icon: '📿', w: 0.8, variants: [
      { names: ['Amulet', 'Pendant', 'Locket', 'Torc'], stats: { xp: [6, 12] } },
      { names: ['Medallion', 'Choker'], stats: { atkPct: [5, 10] } },
      { names: ['Phylactery', 'Reliquary'], stats: { hpPct: [6, 12] } },
    ]},
    { key: 'ring', name: 'Ring', icon: '💍', w: 0.8, variants: [
      { names: ['Band', 'Ring', 'Signet'], stats: { crit: [3, 6] } },
      { names: ['Seal', 'Knot'], stats: { haste: [4, 8] } },
      { names: ['Coil', 'Eye'], stats: { loot: [4, 9] } },
      { names: ['Weight'], stats: { gold: [6, 12] } },
    ]},
  ];
  const SLOT_KEYS = SLOTS.map(s => s.key);
  const SLOT_BY_KEY = {};
  for (const s of SLOTS) SLOT_BY_KEY[s.key] = s;
  // paperdoll display order (3x3)
  const DOLL_ORDER = ['helm', 'amulet', 'weapon', 'chest', 'gloves', 'offhand', 'legs', 'boots', 'ring'];

  const AFFIXES = [
    { k: 'atkFlat', suffix: 'of Might',     coeff: 2.4 },
    { k: 'hpFlat',  suffix: 'of the Bear',  coeff: 4.5 },
    { k: 'armor',   suffix: 'of Warding',   coeff: 2.2 },
    { k: 'atkPct',  suffix: 'of Ferocity',  range: [4, 9] },
    { k: 'hpPct',   suffix: 'of Vitality',  range: [4, 9] },
    { k: 'crit',    suffix: 'of Precision', range: [2, 5] },
    { k: 'critDmg', suffix: 'of Ruin',      range: [10, 22] },
    { k: 'haste',   suffix: 'of Swiftness', range: [3, 7] },
    { k: 'regen',   suffix: 'of Mending',   range: [0.5, 1.2] },
    { k: 'loot',    suffix: 'of Fortune',   range: [3, 8] },
    { k: 'xp',      suffix: 'of Insight',   range: [4, 9] },
    { k: 'gold',    suffix: 'of Greed',     range: [5, 11] },
  ];

  const PREFIXES = {
    1: ['Sturdy', 'Keen', 'Polished', 'Hardened', 'Balanced'],
    2: ['Runed', 'Gleaming', 'Tempered', 'Whispering', 'Veiled'],
    3: ['Ancient', 'Stormtouched', 'Gloomforged', 'Sunblessed', 'Wyrmetched'],
    4: ['Mythforged', 'Dragonbone', 'Starfallen', 'Kingsbane', 'Voidwoven'],
    5: ['Worldsplitter', 'Godslayer', 'Riftborn', 'Omen-Sealed', 'Eternity-Bound'],
  };

  const sg = v => (v < 0 ? '' : '+');
  const pctF = v => (Math.abs(v) >= 10 ? Math.round(v) : +v.toFixed(1)) + '%';
  const STAT_INFO = {
    atkFlat: { n: 'Attack',       f: v => sg(v) + GQ.util.fmt(v) },
    atkPct:  { n: 'Attack',       f: v => sg(v) + pctF(v) },
    hpFlat:  { n: 'Max HP',       f: v => sg(v) + GQ.util.fmt(v) },
    hpPct:   { n: 'Max HP',       f: v => sg(v) + pctF(v) },
    crit:    { n: 'Crit Chance',  f: v => sg(v) + pctF(v) },
    critDmg: { n: 'Crit Damage',  f: v => sg(v) + pctF(v) },
    haste:   { n: 'Haste',        f: v => sg(v) + pctF(v) },
    armor:   { n: 'Armor',        f: v => sg(v) + GQ.util.fmt(v) },
    regen:   { n: 'Regeneration', f: v => sg(v) + v.toFixed(1) + '% HP/s' },
    loot:    { n: 'Loot Find',    f: v => sg(v) + pctF(v) },
    xp:      { n: 'XP Gain',      f: v => sg(v) + pctF(v) },
    gold:    { n: 'Gold Find',    f: v => sg(v) + pctF(v) },
  };

  const CLASSES = [
    {
      key: 'warrior', name: 'Warrior', icon: '🛡️',
      desc: 'An immovable wall of dents. Trades speed for the ability to nap in dangerous zones.',
      perks: '+25% Max HP · +25% Armor',
      atkM: 1.0, hpM: 1.25, armorM: 1.25, crit: 0, haste: 0, xpP: 0, lootP: 0,
      tint: '#c85a50', metal: '#9aa7bd',
    },
    {
      key: 'ranger', name: 'Ranger', icon: '🏹',
      desc: 'Has never once been hit first. Finds loot the way other people find excuses.',
      perks: '+15% Haste · +6% Crit · +8% Loot Find',
      atkM: 1.0, hpM: 0.95, armorM: 1.0, crit: 6, haste: 15, xpP: 0, lootP: 8,
      tint: '#4f9e5f', metal: '#8a795a',
    },
    {
      key: 'mage', name: 'Mage', icon: '🔮',
      desc: 'Read every book except the one about wearing armor. Levels alarmingly fast.',
      perks: '+22% Attack · +10% XP Gain · fragile',
      atkM: 1.22, hpM: 0.85, armorM: 0.9, crit: 0, haste: 0, xpP: 10, lootP: 0,
      tint: '#7a5fd0', metal: '#5a6a8a',
    },
  ];

  /* shapes: slime, beast, wisp, humanoid, spider, serpent, golem, dragon, bat */
  const ZONES = [
    {
      id: 'meadow', name: 'Verdant Meadows', level: 1, props: 'meadow',
      flavor: 'Every adventurer\'s first mistake. The slimes have watched a thousand heroes arrive and respect none of them.',
      pal: { skyTop: '#35597e', skyBot: '#8fb8d8', ground: '#3e6b4c', prop: '#24402d', accent: '#a8e29f', ambient: 'motes', ambColor: '#cfe8a0' },
      monsters: [
        { name: 'Gel Slime',   shape: 'slime', hue: 130, size: 0.85, hp: 0.60, dmg: 0.55, xp: 0.85, gold: 0.9 },
        { name: 'Tusked Boar', shape: 'beast', hue: 25,  size: 1.0,  hp: 0.90, dmg: 0.80, xp: 1.0,  gold: 0.9 },
        { name: 'Meadow Wisp', shape: 'wisp',  hue: 160, size: 0.7,  hp: 0.50, dmg: 0.65, xp: 1.3,  gold: 1.2 },
      ],
    },
    {
      id: 'forest', name: 'Whispering Woods', level: 5, props: 'forest',
      flavor: 'The trees whisper constantly. It is mostly complaints about the wolves.',
      pal: { skyTop: '#1c2b25', skyBot: '#3d5c48', ground: '#22382c', prop: '#101d16', accent: '#7fd8a0', ambient: 'fireflies', ambColor: '#d8f0a0' },
      monsters: [
        { name: 'Dire Wolf',     shape: 'beast',  hue: 215, size: 1.05, hp: 1.0,  dmg: 1.1,  xp: 1.0, gold: 0.9 },
        { name: 'Thorn Sapling', shape: 'golem',  hue: 100, size: 0.95, hp: 1.3,  dmg: 0.8,  xp: 1.1, gold: 1.0 },
        { name: 'Widow Spinner', shape: 'spider', hue: 280, size: 0.9,  hp: 0.85, dmg: 1.05, xp: 1.1, gold: 1.1 },
      ],
    },
    {
      id: 'bazaar', name: 'The Moonlit Bazaar', level: 8, props: 'camp', side: true,
      flavor: 'A night market run by things that were never alive. Prices are excellent. Exits are negotiable.',
      gimmick: { goldM: 3, lootB: 50, xpM: 0.25, desc: '3× gold · +50% loot find · ¼ XP' },
      pal: { skyTop: '#1a1030', skyBot: '#3a2450', ground: '#2a1f3a', prop: '#140c22', accent: '#f0c060', ambient: 'fireflies', ambColor: '#f0c060' },
      monsters: [
        { name: 'Pickpocket Wisp', shape: 'wisp',     hue: 50,  size: 0.7,  hp: 0.65, dmg: 0.8,  xp: 1.0, gold: 1.4 },
        { name: 'Coin Golem',      shape: 'golem',    hue: 46,  size: 1.15, hp: 1.4,  dmg: 0.9,  xp: 1.0, gold: 1.6 },
        { name: 'Bazaar Djinn',    shape: 'humanoid', hue: 280, size: 1.0,  hp: 0.9,  dmg: 1.1,  xp: 1.1, gold: 1.3 },
      ],
    },
    {
      id: 'camp', name: 'Goblin Warcamp', level: 10, props: 'camp',
      flavor: 'Goblins invented the group pull and have never once apologized for it.',
      pal: { skyTop: '#2b1d27', skyBot: '#6b3a2e', ground: '#4a3226', prop: '#1f1512', accent: '#f0a05a', ambient: 'embers', ambColor: '#f0a05a' },
      monsters: [
        { name: 'Goblin Scrapper',   shape: 'humanoid', hue: 110, size: 0.8,  hp: 0.85, dmg: 0.95, xp: 0.95, gold: 1.3 },
        { name: 'Goblin Pyromancer', shape: 'humanoid', hue: 30,  size: 0.78, hp: 0.7,  dmg: 1.25, xp: 1.1,  gold: 1.2 },
        { name: 'Hobgoblin Brute',   shape: 'humanoid', hue: 15,  size: 1.2,  hp: 1.45, dmg: 1.1,  xp: 1.25, gold: 1.4 },
      ],
    },
    {
      id: 'cavern', name: 'Cobweb Caverns', level: 16, props: 'cavern',
      flavor: 'Bring a torch, then bring a spare. The spiders collect torches.',
      pal: { skyTop: '#14101f', skyBot: '#241c38', ground: '#1c1530', prop: '#0d0a18', accent: '#a88af0', ambient: 'motes', ambColor: '#8a6ad0' },
      monsters: [
        { name: 'Screech Bat',   shape: 'bat',     hue: 265, size: 0.75, hp: 0.7,  dmg: 0.9,  xp: 0.95, gold: 0.9 },
        { name: 'Broodmother',   shape: 'spider',  hue: 290, size: 1.15, hp: 1.35, dmg: 1.05, xp: 1.2,  gold: 1.1 },
        { name: 'Gloom Crawler', shape: 'serpent', hue: 250, size: 1.0,  hp: 1.0,  dmg: 1.1,  xp: 1.05, gold: 1.0 },
      ],
    },
    {
      id: 'sporefen', name: 'The Sporefen', level: 20, props: 'marsh', side: true,
      flavor: 'The mushrooms sing and the air chews. Scholars love it here. Briefly.',
      gimmick: { xpM: 2, dmgM: 0.5, desc: '2× XP · your damage halved by the spores' },
      pal: { skyTop: '#16241e', skyBot: '#2e4838', ground: '#263a2a', prop: '#101d14', accent: '#90e0b0', ambient: 'motes', ambColor: '#90e0b0' },
      monsters: [
        { name: 'Myconid Dreamer', shape: 'humanoid', hue: 165, size: 0.9,  hp: 0.9,  dmg: 1.0,  xp: 1.2, gold: 0.9 },
        { name: 'Spore Drifter',   shape: 'wisp',     hue: 95,  size: 0.8,  hp: 0.7,  dmg: 0.9,  xp: 1.1, gold: 0.9 },
        { name: 'Fen Shambler',    shape: 'golem',    hue: 105, size: 1.2,  hp: 1.4,  dmg: 1.1,  xp: 1.3, gold: 1.0 },
      ],
    },
    {
      id: 'marsh', name: 'Drowned Marsh', level: 23, props: 'marsh',
      flavor: 'The water is knee-deep. The things under it are not.',
      pal: { skyTop: '#1e2d2b', skyBot: '#4a6157', ground: '#2c4038', prop: '#14211c', accent: '#8ad0b0', ambient: 'fireflies', ambColor: '#a0e0c0' },
      monsters: [
        { name: 'Bog Lurker', shape: 'slime',    hue: 85,  size: 1.1,  hp: 1.25, dmg: 0.95, xp: 1.05, gold: 1.0 },
        { name: 'Marsh Hag',  shape: 'humanoid', hue: 140, size: 0.95, hp: 0.85, dmg: 1.2,  xp: 1.2,  gold: 1.15 },
        { name: 'Snapjaw',    shape: 'serpent',  hue: 75,  size: 1.1,  hp: 1.15, dmg: 1.15, xp: 1.1,  gold: 0.95 },
      ],
    },
    {
      id: 'ember', name: 'Ember Foothills', level: 30, props: 'ember',
      flavor: 'Technically not on fire. The distinction matters to insurers, not to you.',
      pal: { skyTop: '#2a1214', skyBot: '#7e3020', ground: '#3a1f18', prop: '#1c0e0c', accent: '#ff8a4a', ambient: 'embers', ambColor: '#ff9a5a' },
      monsters: [
        { name: 'Cinder Imp',  shape: 'humanoid', hue: 20, size: 0.72, hp: 0.7,  dmg: 1.15, xp: 1.0,  gold: 1.1 },
        { name: 'Magma Hound', shape: 'beast',    hue: 12, size: 1.05, hp: 1.05, dmg: 1.1,  xp: 1.05, gold: 1.0 },
        { name: 'Ash Golem',   shape: 'golem',    hue: 20, size: 1.25, hp: 1.55, dmg: 0.95, xp: 1.3,  gold: 1.2 },
      ],
    },
    {
      id: 'frost', name: 'Frostpeak Pass', level: 38, props: 'frost',
      flavor: 'Cold enough that the wolves hunt in shifts and the wraiths unionized.',
      pal: { skyTop: '#24344f', skyBot: '#8ea8c8', ground: '#b8c8dc', prop: '#34455e', accent: '#cfe6ff', ambient: 'snow', ambColor: '#e8f2ff' },
      monsters: [
        { name: 'Frost Wolf', shape: 'beast', hue: 205, size: 1.05, hp: 1.0,  dmg: 1.1,  xp: 1.0,  gold: 0.95 },
        { name: 'Ice Wraith', shape: 'wisp',  hue: 195, size: 0.9,  hp: 0.8,  dmg: 1.25, xp: 1.2,  gold: 1.1 },
        { name: 'Young Yeti', shape: 'golem', hue: 210, size: 1.3,  hp: 1.6,  dmg: 1.05, xp: 1.35, gold: 1.05 },
      ],
    },
    {
      id: 'glass', name: 'The Glass Desert', level: 45, props: 'ridge', side: true,
      flavor: 'A storm froze mid-strike and the sand never recovered. Everything here is a display case.',
      gimmick: { hpM: 2.5, dropSure: true, desc: 'monsters have 2.5× HP · every kill drops equipment' },
      pal: { skyTop: '#2c3a55', skyBot: '#c8b890', ground: '#b8a878', prop: '#4a4a5e', accent: '#ffe080', ambient: 'motes', ambColor: '#ffe8a0' },
      monsters: [
        { name: 'Glasshopper',       shape: 'spider',   hue: 190, size: 0.95, hp: 0.9, dmg: 1.05, xp: 1.0, gold: 1.0 },
        { name: 'Fulgurite Crawler', shape: 'serpent',  hue: 55,  size: 1.05, hp: 1.1, dmg: 1.1,  xp: 1.1, gold: 1.1 },
        { name: 'Mirage of You',     shape: 'humanoid', hue: 210, size: 1.0,  hp: 1.0, dmg: 1.15, xp: 1.2, gold: 1.0 },
      ],
    },
    {
      id: 'temple', name: 'Sunken Temple', level: 47, props: 'temple',
      flavor: 'Flooded by its own priests during a disagreement about tithes. The priests stayed.',
      pal: { skyTop: '#0f2433', skyBot: '#1e5f6e', ground: '#16323e', prop: '#0a1a24', accent: '#5adcd0', ambient: 'bubbles', ambColor: '#7ae0d8' },
      monsters: [
        { name: 'Coral Sentinel', shape: 'golem',    hue: 175, size: 1.15, hp: 1.4,  dmg: 1.0,  xp: 1.15, gold: 1.1 },
        { name: 'Deep Priest',    shape: 'humanoid', hue: 190, size: 1.0,  hp: 0.9,  dmg: 1.25, xp: 1.2,  gold: 1.25 },
        { name: 'Abyss Jelly',    shape: 'slime',    hue: 200, size: 1.1,  hp: 1.1,  dmg: 0.9,  xp: 1.0,  gold: 1.0 },
      ],
    },
    {
      id: 'ridge', name: 'Dragonspine Ridge', level: 57, props: 'ridge',
      flavor: 'The drakes here are the babies. Try very hard not to meet the parents.',
      pal: { skyTop: '#241a2e', skyBot: '#5e3a3a', ground: '#3a2c34', prop: '#191021', accent: '#f0705a', ambient: 'embers', ambColor: '#e07a5a' },
      monsters: [
        { name: 'Drake Whelp',      shape: 'dragon',   hue: 15,  size: 0.95, hp: 1.0, dmg: 1.1,  xp: 1.05, gold: 1.15 },
        { name: 'Ridge Wyvern',     shape: 'dragon',   hue: 275, size: 1.2,  hp: 1.3, dmg: 1.2,  xp: 1.25, gold: 1.2 },
        { name: 'Dragonkin Raider', shape: 'humanoid', hue: 0,   size: 1.1,  hp: 1.1, dmg: 1.05, xp: 1.1,  gold: 1.35 },
      ],
    },
    {
      id: 'rift', name: 'The Shattered Rift', level: 68, props: 'rift',
      flavor: 'Reality filed a formal complaint about this place. The complaint was eaten.',
      pal: { skyTop: '#120a1e', skyBot: '#2e1244', ground: '#1c1030', prop: '#3b1a5e', accent: '#e26af0', ambient: 'void', ambColor: '#d060f0' },
      monsters: [
        { name: 'Void Spawn',     shape: 'slime',  hue: 300, size: 1.0,  hp: 1.1,  dmg: 1.1,  xp: 1.15, gold: 1.1 },
        { name: 'Rift Stalker',   shape: 'spider', hue: 315, size: 1.15, hp: 1.05, dmg: 1.25, xp: 1.2,  gold: 1.15 },
        { name: 'Chaos Amalgam',  shape: 'golem',  hue: 285, size: 1.35, hp: 1.7,  dmg: 1.15, xp: 1.45, gold: 1.3 },
      ],
    },
    {
      id: 'farshore', name: 'The Far Shore', level: 74, props: 'temple', sealed: true,
      flavor: 'Where everything that ever fell through the Rift washes up. Beachcombing is discouraged.',
      pal: { skyTop: '#1c2836', skyBot: '#4a6272', ground: '#3a4a52', prop: '#16202a', accent: '#9fd0d8', ambient: 'motes', ambColor: '#9fd0d8' },
      monsters: [
        { name: 'Driftwood Leviathan', shape: 'serpent',  hue: 195, size: 1.2,  hp: 1.3,  dmg: 1.1,  xp: 1.15, gold: 1.0 },
        { name: 'Salvage Wraith',      shape: 'wisp',     hue: 185, size: 0.85, hp: 0.8,  dmg: 1.2,  xp: 1.1,  gold: 1.25 },
        { name: "Ferryman's Intern",   shape: 'humanoid', hue: 210, size: 0.95, hp: 0.95, dmg: 1.05, xp: 1.05, gold: 1.15 },
      ],
    },
    {
      id: 'clockwork', name: 'The Clockwork Waste', level: 83, props: 'ridge', sealed: true,
      flavor: 'A heaven-machine, dropped and never picked up. Everything still ticks. Nothing agrees on the hour.',
      pal: { skyTop: '#2a2118', skyBot: '#6a4a2a', ground: '#4a3520', prop: '#201409', accent: '#e0a850', ambient: 'embers', ambColor: '#e0a850' },
      monsters: [
        { name: 'Gear Hound',      shape: 'beast',    hue: 38,  size: 1.05, hp: 1.05, dmg: 1.1,  xp: 1.05, gold: 1.1 },
        { name: 'Pendulum Knight', shape: 'humanoid', hue: 45,  size: 1.1,  hp: 1.2,  dmg: 1.15, xp: 1.15, gold: 1.1 },
        { name: 'Unwound Choir',   shape: 'wisp',     hue: 55,  size: 0.9,  hp: 0.85, dmg: 1.2,  xp: 1.2,  gold: 1.0 },
      ],
    },
    {
      id: 'garden', name: 'The Garden of Teeth', level: 92, props: 'forest', sealed: true,
      flavor: 'Something planted paradise and forgot to file down the edges. Do not smell the flowers. They smell you back.',
      pal: { skyTop: '#14231a', skyBot: '#3a5a3a', ground: '#2c4428', prop: '#0e1c10', accent: '#ff9ab8', ambient: 'motes', ambColor: '#ff9ab8' },
      monsters: [
        { name: 'Smiling Orchid', shape: 'golem',   hue: 330, size: 1.1,  hp: 1.25, dmg: 1.05, xp: 1.1,  gold: 1.0 },
        { name: 'Root Maw',       shape: 'serpent', hue: 100, size: 1.15, hp: 1.15, dmg: 1.15, xp: 1.1,  gold: 1.05 },
        { name: 'Pollen Shade',   shape: 'wisp',    hue: 320, size: 0.85, hp: 0.75, dmg: 1.25, xp: 1.2,  gold: 1.1 },
      ],
    },
    {
      id: 'throne', name: 'The Throne of the Last God', level: 100, props: 'rift', sealed: true,
      flavor: 'The end of the ladder. The seat is empty, the court is not, and the grind echoes forever.',
      pal: { skyTop: '#0a0812', skyBot: '#241a3a', ground: '#181226', prop: '#2e2448', accent: '#f0e8ff', ambient: 'void', ambColor: '#e8e0ff' },
      monsters: [
        { name: 'Prayer Echo',      shape: 'wisp',     hue: 265, size: 0.9,  hp: 0.85, dmg: 1.2,  xp: 1.2,  gold: 1.05 },
        { name: 'Broken Halo',      shape: 'golem',    hue: 55,  size: 1.25, hp: 1.5,  dmg: 1.1,  xp: 1.3,  gold: 1.15 },
        { name: 'Zealot of Nothing', shape: 'humanoid', hue: 280, size: 1.0,  hp: 1.0,  dmg: 1.2,  xp: 1.1,  gold: 1.1 },
      ],
    },
  ];
  const ZONE_BY_ID = {};
  for (const z of ZONES) ZONE_BY_ID[z.id] = z;

  // XP multiplier for hunting above/below your level
  function grayMult(L, z) {
    const d = L - z;
    if (d > 5) return Math.max(0.05, 1 - 0.15 * (d - 5));
    if (d < 0) return 1 + Math.min(0.6, 0.07 * (-d));
    return 1;
  }

  // what a well-geared hero of the zone's level is worth, as one number;
  // shown as "Recommended Power" and used for over-your-head warnings
  function refPower(z) {
    const atk = BAL.heroAtk(z.level) * 2.4;
    const dps = atk * BAL.heroBaseRate * 1.18;
    const hp = BAL.heroHp(z.level) * 2.1;
    const armor = 22 * P(z.level);
    const dr = armor / (armor + BAL.armorK(z.level));
    const ehp = hp * (1 + dr) + hp * 0.025 * 10;
    return dps * Math.pow(ehp, 0.45);
  }

  function masteryTierCount(kills) {
    let n = 0;
    for (const t of BAL.masteryTiers) if (kills >= t) n++;
    return n;
  }

  // one hand-authored chase item per zone
  const UNIQUES = {
    meadow: { key: 'slimeheart', name: 'Slimeheart Band', slot: 'ring',
      flavor: 'It pulses. Do not ask with what.',
      stats: [{ k: 'crit', r: [5, 7] }, { k: 'hpPct', r: [10, 14] }, { k: 'regen', r: [1.2, 1.8] }] },
    forest: { key: 'wolffang', name: "Wolfmother's Fang", slot: 'weapon',
      flavor: 'She has more.',
      stats: [{ k: 'atkFlat', c: 9 }, { k: 'crit', r: [6, 9] }, { k: 'critDmg', r: [25, 40] }] },
    camp: { key: 'iou', name: "Warchief's IOU", slot: 'amulet',
      flavor: 'Redeemable for one (1) apology. Void where prohibited.',
      stats: [{ k: 'gold', r: [15, 25] }, { k: 'xp', r: [10, 16] }, { k: 'atkPct', r: [8, 12] }] },
    cavern: { key: 'silkmantle', name: "Broodmother's Silk Mantle", slot: 'chest',
      flavor: 'Spun from everything that wandered in.',
      stats: [{ k: 'hpFlat', c: 16 }, { k: 'armor', c: 5 }, { k: 'haste', r: [8, 12] }] },
    marsh: { key: 'hagbargain', name: "Hag's Bargain", slot: 'offhand',
      flavor: 'You get the nice stats. She gets... she said not to worry about it.',
      stats: [{ k: 'atkPct', r: [14, 20] }, { k: 'loot', r: [10, 16] }, { k: 'hpPct', r: [-8, -8] }] },
    ember: { key: 'emberwalkers', name: 'Emberwalkers', slot: 'boots',
      flavor: 'The ground is lava. The boots disagree.',
      stats: [{ k: 'haste', r: [9, 13] }, { k: 'armor', c: 4 }, { k: 'regen', r: [1.0, 1.6] }] },
    frost: { key: 'wraithlight', name: 'Wraithlight Circlet', slot: 'helm',
      flavor: 'Cold to the touch. Colder to the mind.',
      stats: [{ k: 'crit', r: [6, 9] }, { k: 'xp', r: [10, 15] }, { k: 'atkPct', r: [8, 12] }] },
    temple: { key: 'deepchoir', name: 'Hands of the Deep Choir', slot: 'gloves',
      flavor: 'They remember the hymns. All of them. At once.',
      stats: [{ k: 'atkFlat', c: 6 }, { k: 'haste', r: [8, 12] }, { k: 'crit', r: [4, 7] }] },
    ridge: { key: 'wyrmgreaves', name: 'Wyrmspine Greaves', slot: 'legs',
      flavor: 'Still warm.',
      stats: [{ k: 'hpFlat', c: 14 }, { k: 'armor', c: 5 }, { k: 'atkPct', r: [7, 11] }] },
    rift: { key: 'lastkey', name: 'The Last Key', slot: 'ring',
      flavor: 'There is no door. There will be.',
      stats: [{ k: 'atkPct', r: [10, 14] }, { k: 'hpPct', r: [10, 14] }, { k: 'loot', r: [8, 12] }, { k: 'xp', r: [8, 12] }] },
    bazaar: { key: 'ledger', name: "Djinn's Ledger", slot: 'amulet',
      flavor: 'Every wish itemized. Every price hidden.',
      stats: [{ k: 'gold', r: [18, 26] }, { k: 'loot', r: [10, 15] }, { k: 'xp', r: [6, 10] }] },
    sporefen: { key: 'shamblerheart', name: "Shambler's Heart", slot: 'chest',
      flavor: 'It keeps beating. Politely ignore that.',
      stats: [{ k: 'hpFlat', c: 15 }, { k: 'hpPct', r: [10, 14] }, { k: 'regen', r: [1.2, 1.8] }] },
    glass: { key: 'stormglass', name: 'Stormglass Edge', slot: 'weapon',
      flavor: 'Lightning, paused mid-thought.',
      stats: [{ k: 'atkFlat', c: 8 }, { k: 'crit', r: [6, 9] }, { k: 'haste', r: [7, 11] }] },
    farshore: { key: 'exactchange', name: 'Exact Change', slot: 'ring',
      flavor: 'The toll, kept.',
      stats: [{ k: 'gold', r: [16, 24] }, { k: 'loot', r: [10, 14] }, { k: 'xp', r: [8, 12] }] },
    clockwork: { key: 'mainspring', name: 'Mainspring Heart', slot: 'chest',
      flavor: 'It ticks. You tick now too.',
      stats: [{ k: 'hpFlat', c: 16 }, { k: 'haste', r: [10, 14] }, { k: 'regen', r: [1.4, 2.0] }] },
    garden: { key: 'firstbloom', name: 'Thorn of the First Bloom', slot: 'weapon',
      flavor: 'It wants to be planted in something.',
      stats: [{ k: 'atkFlat', c: 9 }, { k: 'crit', r: [7, 10] }, { k: 'critDmg', r: [30, 45] }] },
    throne: { key: 'quietcrown', name: 'Crown of the Quiet', slot: 'helm',
      flavor: 'Heavy. Getting lighter.',
      stats: [{ k: 'atkPct', r: [12, 16] }, { k: 'hpPct', r: [12, 16] }, { k: 'xp', r: [12, 18] }] },
  };

  // companions: each boss can drop a miniature of itself
  const COMPANIONS = {
    meadow:    { name: 'Tuskling',  perkDesc: '+10% gold',                    mods: { gold: 10 } },
    forest:    { name: 'Moon Pup',  perkDesc: '+4% crit chance',              mods: { crit: 4 } },
    camp:      { name: 'Grub',      perkDesc: '+8% XP',                       mods: { xp: 8 } },
    cavern:    { name: 'Silkling',  perkDesc: '+6% attack speed',             mods: { haste: 6 } },
    marsh:     { name: 'Haglet',    perkDesc: '+8% loot find',                mods: { loot: 8 } },
    ember:     { name: 'Cinderpup', perkDesc: '+6% damage',                   mods: { dmg: 6 } },
    frost:     { name: 'Snowball',  perkDesc: '+12% max HP',                  mods: { hp: 12 } },
    temple:    { name: 'Tidebaby',  perkDesc: '+1% HP regen per second',      mods: { regen: 1 } },
    ridge:     { name: 'Vexling',   perkDesc: '+8% damage',                   mods: { dmg: 8 } },
    rift:      { name: 'Nully',     perkDesc: '+4% damage and +4% max HP',    mods: { dmg: 4, hp: 4 } },
    farshore:  { name: 'Toll',      perkDesc: '+12% gold',                    mods: { gold: 12 } },
    clockwork: { name: 'Tick',      perkDesc: '+8% attack speed',             mods: { haste: 8 } },
    garden:    { name: 'Sprout',    perkDesc: '+10% max HP, +0.5%/s regen',   mods: { hp: 10, regen: 0.5 } },
    throne:    { name: 'Echo',      perkDesc: '+10% XP and +5% damage',       mods: { xp: 10, dmg: 5 } },
  };

  // roaming anomalies: temporary mini-dungeons, 10 kills, one chest
  const ANOMALIES = [
    { key: 'grotto', name: 'Gilded Grotto',    icon: '💰', reward: 'gold',   desc: 'The walls are money. The tenants object.' },
    { key: 'vein',   name: 'Shard Vein',       icon: '💠', reward: 'shards', desc: 'Crystallized maybe. Mine it before it changes its mind.' },
    { key: 'armory', name: 'Forgotten Armory', icon: '🛡️', reward: 'items',  desc: 'Previous owners: unavailable.' },
    { key: 'dream',  name: 'Dream Pocket',     icon: '💤', reward: 'xp',     desc: 'Someone left a nap running.' },
    { key: 'vault',  name: 'Sealed Vault',     icon: '🗝️', reward: 'set',    desc: 'Sealed for a reason. Probably an excellent one.' },
  ];

  // The Proving Grounds: 60-second kill gauntlets, no loot, no excuses
  const TRIALS = [
    { key: 'bronze', name: 'Proof of Bronze', lvl: 12, src: 'camp',   medals: [8, 15, 25] },
    { key: 'iron',   name: 'Proof of Iron',   lvl: 28, src: 'ember',  medals: [8, 15, 25] },
    { key: 'storm',  name: 'Proof of Storm',  lvl: 44, src: 'temple', medals: [8, 15, 25] },
    { key: 'dragon', name: 'Proof of Dragon', lvl: 60, src: 'ridge',  medals: [8, 15, 25] },
    { key: 'god',    name: 'Proof of God',    lvl: 76, src: 'rift',   medals: [8, 15, 25] },
    { key: 'kings',  name: 'Proof of Kings',  lvl: 68, src: 'rift',   medals: [3, 6, 10], rush: true, time: 180, conq: 10 },
  ];

  // talent milestones: one choice of three at each level, reset on ascension
  const TALENT_TIERS = [
    { lvl: 5, picks: [
      { key: 'brawler',      name: 'Brawler',       icon: '🗡️', desc: '+8% damage', mods: { dmg: 8 } },
      { key: 'thickskin',    name: 'Thick Skin',    icon: '🧱', desc: '+12% max HP', mods: { hp: 12 } },
      { key: 'scavenger',    name: 'Scavenger',     icon: '🪙', desc: '+8% gold and loot find', mods: { gold: 8, loot: 8 } },
    ]},
    { lvl: 10, picks: [
      { key: 'executioner',  name: 'Executioner',   icon: '🪓', desc: '+20% crit damage', mods: { critDmg: 20 } },
      { key: 'fleet',        name: 'Fleet',         icon: '💨', desc: '+6% attack speed', mods: { haste: 6 } },
      { key: 'student',      name: 'Student',       icon: '📖', desc: '+8% XP', mods: { xp: 8 } },
    ]},
    { lvl: 15, picks: [
      { key: 'berserker',    name: 'Berserker',     icon: '😤', desc: '+15% damage while below half HP', flag: 'berserker' },
      { key: 'bulwark',      name: 'Bulwark',       icon: '🛡️', desc: '+20% armor', mods: { armor: 20 } },
      { key: 'fortune',      name: 'Fortune',       icon: '🍀', desc: '+10% loot find', mods: { loot: 10 } },
    ]},
    { lvl: 20, picks: [
      { key: 'sharpshooter', name: 'Sharpshooter',  icon: '🎯', desc: '+5% crit chance', mods: { crit: 5 } },
      { key: 'vampiric',     name: 'Vampiric',      icon: '🩸', desc: 'Heal for 2% of damage dealt', flag: 'vampiric' },
      { key: 'merchant',     name: 'Merchant',      icon: '⚖️', desc: '+15% gold', mods: { gold: 15 } },
    ]},
    { lvl: 25, picks: [
      { key: 'giantslayer',  name: 'Giantslayer',   icon: '⚔️', desc: '+15% damage to elites and bosses', flag: 'giantslayer' },
      { key: 'ironclad',     name: 'Ironclad',      icon: '🏰', desc: '+15% max HP and +10% armor', mods: { hp: 15, armor: 10 } },
      { key: 'sage',         name: 'Sage',          icon: '🦉', desc: '+12% XP', mods: { xp: 12 } },
    ]},
    { lvl: 30, picks: [
      { key: 'overwhelm',    name: 'Overwhelm',     icon: '⏳', desc: 'Ability cooldowns 15% shorter', flag: 'overwhelm' },
      { key: 'regenerator',  name: 'Regenerator',   icon: '💚', desc: '+1% HP regeneration per second', mods: { regen: 1 } },
      { key: 'prospector',   name: 'Prospector',    icon: '⛏️', desc: '+25% shards from salvage', flag: 'prospector' },
    ]},
    { lvl: 40, picks: [
      { key: 'rampage',      name: 'Rampage',       icon: '🔥', desc: '+1% damage per kill taken unharmed, up to +15%', flag: 'rampage' },
      { key: 'juggernaut',   name: 'Juggernaut',    icon: '🐘', desc: '+20% max HP', mods: { hp: 20 } },
      { key: 'goldentouch',  name: 'Golden Touch',  icon: '👑', desc: '+20% gold', mods: { gold: 20 } },
    ]},
    { lvl: 50, picks: [
      { key: 'assassin',     name: 'Assassin',      icon: '🥷', desc: 'First hit on each monster deals double damage', flag: 'assassin' },
      { key: 'guardian',     name: 'Guardian',      icon: '🗿', desc: '+25% armor', mods: { armor: 25 } },
      { key: 'archivist',    name: 'Archivist',     icon: '🗂️', desc: '+15% XP', mods: { xp: 15 } },
    ]},
    { lvl: 60, picks: [
      { key: 'doublestrike', name: 'Doublestrike',  icon: '⚡', desc: '10% chance to strike twice', flag: 'doublestrike' },
      { key: 'undying',      name: 'Undying',       icon: '💀', desc: 'Survive a lethal blow at 1 HP, once per fight', flag: 'undying' },
      { key: 'tycoon',       name: 'Tycoon',        icon: '💎', desc: '+25% gold and +15% loot find', mods: { gold: 25, loot: 15 } },
    ]},
    { lvl: 70, picks: [
      { key: 'godslayer',    name: 'Godslayer',     icon: '☠️', desc: '+25% damage to bosses', flag: 'godslayer' },
      { key: 'immortal',     name: 'Immortal',      icon: '♾️', desc: '+30% max HP and +1%/s regeneration', mods: { hp: 30, regen: 1 } },
      { key: 'transcendent', name: 'Transcendent',  icon: '🌌', desc: '+20% XP', mods: { xp: 20 } },
    ]},
  ];

  // roaming world events: one zone at a time, five minutes of reasons to travel
  const EVENTS = [
    { key: 'bloodmoon',    name: 'Blood Moon',     icon: '🌕', desc: 'Elites swarm. Monsters hit harder. +50% XP.',
      mods: { elite: 4, mdmg: 1.25, xp: 1.5 }, tint: 'rgba(220,60,60,0.10)' },
    { key: 'goldrush',     name: 'Gold Rush',      icon: '💰', desc: '+150% gold.',
      mods: { gold: 2.5 }, tint: 'rgba(230,193,92,0.08)' },
    { key: 'treasurefever',name: 'Treasure Fever', icon: '🎁', desc: 'Double drop chance, +30% loot find.',
      mods: { drop: 2, loot: 1.3 }, tint: 'rgba(69,180,245,0.08)' },
    { key: 'thinveil',     name: 'The Thin Veil',  icon: '✨', desc: 'Unique treasures surface 5× as often.',
      mods: { uniq: 5 }, tint: 'rgba(79,224,196,0.09)' },
    { key: 'frenzy',       name: 'Frenzy',         icon: '🌀', desc: 'Monsters pour in without pause. +25% XP.',
      mods: { respawn: 0, matk: 1.2, xp: 1.25 }, tint: 'rgba(192,126,247,0.08)' },
  ];

  // bestiary lore, unlocked at tier I — Bureau field notes
  const LORE = {
    'Gel Slime': 'Technically the meadow\'s apex predator, given enough time.',
    'Tusked Boar': 'Every hero\'s first mistake has tusks.',
    'Meadow Wisp': 'Follows adventurers home. Files no paperwork.',
    'Dire Wolf': 'The "dire" is a hereditary title. The teeth are earned.',
    'Thorn Sapling': 'Do not water. It remembers who watered it.',
    'Widow Spinner': 'Eight legs, one hobby.',
    'Goblin Scrapper': 'Fights dirty, dies loudly, respawns punctually.',
    'Goblin Pyromancer': 'Learned exactly one spell. Committed.',
    'Hobgoblin Brute': 'Promoted for being wider than the doorway.',
    'Screech Bat': 'The caverns\' fire alarm. Cannot be turned off.',
    'Broodmother': 'Every web in this cave is load-bearing.',
    'Gloom Crawler': 'Moves like a rumor: slowly, then all at once.',
    'Bog Lurker': 'Ninety percent water. The rest is grudge.',
    'Marsh Hag': 'Offers deals. The fine print is in swamp.',
    'Snapjaw': 'A log with opinions.',
    'Cinder Imp': 'Sets fires for free. Charges for putting them out.',
    'Magma Hound': 'Fetches. You do not want what it fetches.',
    'Ash Golem': 'A campfire that unionized.',
    'Frost Wolf': 'Hunts in shifts. Union rules.',
    'Ice Wraith': 'Died cold. Stayed cold. Recommends it.',
    'Young Yeti': 'The adults are avoiding you, which should worry you.',
    'Coral Sentinel': 'Guards a temple that sank on its watch. Touchy about it.',
    'Deep Priest': 'Still collecting tithes. Exact change only.',
    'Abyss Jelly': 'A cathedral window that learned to sting.',
    'Drake Whelp': 'A baby. The fire is also a baby. It still burns.',
    'Ridge Wyvern': 'Two legs fewer than a dragon. Twice the attitude.',
    'Dragonkin Raider': 'Worships dragons. Imitates the hoarding first.',
    'Void Spawn': 'What happens when nothing is left unsupervised.',
    'Rift Stalker': 'Stalks you across geometry that should not permit it.',
    'Chaos Amalgam': 'Several bad ideas holding hands.',
    'Pickpocket Wisp': 'Your pockets were heavier before you read this.',
    'Coin Golem': 'Legally speaking, killing it is a withdrawal.',
    'Bazaar Djinn': 'Grants wishes. Charges retail.',
    'Myconid Dreamer': 'It is dreaming you. Try to be interesting.',
    'Spore Drifter': 'Do not inhale the weather here.',
    'Fen Shambler': 'Compost with commitment.',
    'Glasshopper': 'Every landing is a small tragedy.',
    'Fulgurite Crawler': 'Born where the lightning signed its name.',
    'Mirage of You': 'It fights like you. It loots faster.',
    'Driftwood Leviathan': 'Assembled from every ship that almost made it.',
    'Salvage Wraith': 'Collects what the drowned no longer need. Broad definition of need.',
    "Ferryman's Intern": 'Unpaid. Undead. Understandably bitter.',
    'Gear Hound': 'Fetches the hour. Buries the minute.',
    'Pendulum Knight': 'Swears an oath twice a second.',
    'Unwound Choir': 'Sings the tick without the tock. Deeply unsettling.',
    'Smiling Orchid': 'Do not return the smile.',
    'Root Maw': 'The garden path. Also the garden teeth.',
    'Pollen Shade': 'Hay fever with a grudge.',
    'Prayer Echo': 'A request still bouncing off an empty chair.',
    'Broken Halo': 'Heavy is the head. Heavier is what fell off it.',
    'Zealot of Nothing': 'Believes in nothing. Militantly.',
  };

  // authored onboarding: consumed in order before random quests begin
  const STARTER_QUESTS = [
    { type: 'kills',   need: 10, desc: 'Orientation: slay 10 monsters' },
    { type: 'items',   need: 2,  desc: 'Dress code: find 2 pieces of equipment' },
    { type: 'level',   need: 4,  desc: 'Performance review: reach level 4' },
    { type: 'salvage', need: 3,  desc: 'Recycling initiative: salvage 3 items' },
    { type: 'enhance', need: 1,  desc: 'Company anvil: enhance an item' },
    { type: 'boss', zone: 'meadow', need: 1, desc: 'The Boarlord problem: defeat Boarlord Tuskren' },
  ];

  // one boss per zone, summonable after bossKillsNeeded zone kills
  const BOSSES = {
    meadow: { name: 'Boarlord Tuskren',       shape: 'beast',    hue: 18,  size: 1.9, title: 'Terror of the Turnip Fields' },
    forest: { name: 'The Wolfmother',         shape: 'beast',    hue: 215, size: 1.9, title: 'She Remembers Every Hunter' },
    camp:   { name: 'Warchief Grubbash',      shape: 'humanoid', hue: 110, size: 1.8, title: 'Elected by Volume' },
    cavern: { name: 'Matriarch of Silk',      shape: 'spider',   hue: 290, size: 2.0, title: 'Everything Here Is Web' },
    marsh:  { name: 'Grandmother Hag',        shape: 'humanoid', hue: 140, size: 1.8, title: 'Her Bargains Have Bargains' },
    ember:  { name: 'Furnace Colossus',       shape: 'golem',    hue: 20,  size: 2.1, title: 'A Walking Industrial Accident' },
    frost:  { name: 'Old-White',              shape: 'golem',    hue: 210, size: 2.1, title: 'The Mountain That Blinks' },
    temple: { name: 'The Drowned Hierophant', shape: 'humanoid', hue: 190, size: 1.9, title: 'Still Collecting Tithes' },
    ridge:  { name: 'Broodmother Vexwing',    shape: 'dragon',   hue: 275, size: 2.1, title: 'The Parents Were Busy' },
    rift:   { name: 'The Unraveled King',     shape: 'wisp',     hue: 300, size: 2.2, title: 'Was Promised More Than This' },
    farshore:  { name: 'The Ferryman',   shape: 'humanoid', hue: 200, size: 1.9, title: 'Charges by the Soul. Tips Expected.' },
    clockwork: { name: 'The Horologist', shape: 'golem',    hue: 42,  size: 2.1, title: 'Still Winding the World. Wrong Direction.' },
    garden:    { name: 'Mother Thorn',   shape: 'spider',   hue: 330, size: 2.2, title: 'The Garden Grows Where She Smiles' },
    throne:    { name: 'The Last God',   shape: 'wisp',     hue: 268, size: 2.4, title: 'Was Promised Worship. Got You.' },
  };

  // three active abilities per class
  const ABILITIES = {
    warrior: [
      { key: 'smash',   name: 'Skullsplitter', icon: '💥', cd: 9,  kind: 'strike', power: 6,   desc: 'Strike for 600% damage.' },
      { key: 'warcry',  name: 'War Cry',       icon: '📣', cd: 24, kind: 'buff', buff: 'dmg', amt: 0.4, dur: 8, desc: '+40% damage for 8s.' },
      { key: 'wind',    name: 'Second Wind',   icon: '💗', cd: 30, kind: 'heal', amt: 0.4,    desc: 'Heal 40% of max HP.' },
      { key: 'avatar',  name: 'Avatar of War', icon: '🔱', cd: 60, kind: 'buff', buff: 'dmg', amt: 1.0, dur: 10, unlock: 40, desc: 'ULTIMATE: +100% damage for 10s.' },
    ],
    ranger: [
      { key: 'pierce',  name: 'Piercing Shot', icon: '🎯', cd: 9,  kind: 'strike', power: 5, alwaysCrit: true, desc: 'Strike for 500% damage. Always crits.' },
      { key: 'flurry',  name: 'Flurry',        icon: '🌪️', cd: 24, kind: 'buff', buff: 'haste', amt: 0.8, dur: 8, desc: '+80% attack speed for 8s.' },
      { key: 'snare',   name: 'Snare Trap',    icon: '🕸️', cd: 30, kind: 'stun', dur: 4,     desc: 'The enemy cannot attack for 4s.' },
      { key: 'volley',  name: 'Rain of Arrows', icon: '🏹', cd: 60, kind: 'strike', power: 16, unlock: 40, desc: 'ULTIMATE: a volley totaling 1600% damage.' },
    ],
    mage: [
      { key: 'fire',    name: 'Fireball',      icon: '🔥', cd: 9,  kind: 'strike', power: 7,   desc: 'Blast for 700% damage.' },
      { key: 'surge',   name: 'Arcane Surge',  icon: '✨', cd: 24, kind: 'buff', buff: 'dmg', amt: 0.5, dur: 8, desc: '+50% damage for 8s.' },
      { key: 'nova',    name: 'Frost Nova',    icon: '❄️', cd: 30, kind: 'stun', dur: 3, heal: 0.15, desc: 'Freeze 3s and heal 15% HP.' },
      { key: 'meteor',  name: 'Meteor',        icon: '☄️', cd: 60, kind: 'strike', power: 14, stunDur: 2, unlock: 40, desc: 'ULTIMATE: 1400% damage and a 2s daze.' },
    ],
  };

  // permanent upgrades bought with Soul Embers
  const ASC_UPGRADES = [
    { key: 'str',  name: 'Eternal Strength', icon: '⚔️', max: 10, cost: r => 4 + 3 * r,   desc: '+10% damage per rank' },
    { key: 'vig',  name: 'Eternal Vigor',    icon: '🛡️', max: 10, cost: r => 4 + 3 * r,   desc: '+10% max HP per rank' },
    { key: 'auto', name: 'Muscle Memory',    icon: '🤖', max: 1,  cost: () => 15,         desc: 'Abilities cast themselves' },
    { key: 'head', name: 'Head Start',       icon: '🚀', max: 2,  cost: r => 10 + 15 * r, desc: 'Begin each life 5 levels higher' },
    { key: 'gold', name: 'Deep Pockets',     icon: '💰', max: 5,  cost: r => 3 + 2 * r,   desc: '+25% gold per rank' },
    { key: 'xp',   name: 'Scholar',          icon: '📚', max: 5,  cost: r => 4 + 3 * r,   desc: '+10% XP per rank' },
    { key: 'loot', name: 'Lodestone',        icon: '🧲', max: 5,  cost: r => 4 + 3 * r,   desc: '+10% loot find per rank' },
    { key: 'rec',  name: 'Stubborn',         icon: '⏱️', max: 3,  cost: r => 3 + 2 * r,   desc: 'KO recovery 4s shorter per rank' },
    { key: 'offcap', name: 'Night Shift',    icon: '🌙', max: 4,  cost: r => 6 + 4 * r,   desc: '+2h offline progress cap per rank' },
    { key: 'kindle', name: 'Kindling',       icon: '🕯️', max: 5,  cost: r => 5 + 5 * r,   desc: '+10% Soul Embers from ascending per rank' },
    { key: 'crit',   name: 'Killer Instinct',icon: '🎯', max: 5,  cost: r => 4 + 3 * r,   desc: '+3% crit chance per rank' },
    { key: 'forge',  name: 'Trade License',  icon: '📦', max: 3,  cost: r => 4 + 3 * r,   desc: 'Forge crates 15% cheaper per rank' },
  ];
  const ASC_MIN_LEVEL = 15;
  function emberGain(level, bossesConquered) {
    if (level < ASC_MIN_LEVEL) return 0;
    return Math.floor(Math.pow(level, 1.5) / 6) + 4 * bossesConquered;
  }

  const FORGE_TIERS = [
    { key: 'rough',  name: 'Rough Crate',  icon: '📦', mult: 60,   floor: 0, desc: 'A random item of your level.' },
    { key: 'fine',   name: 'Fine Chest',   icon: '🧰', mult: 260,  floor: 2, desc: 'Guaranteed Rare or better.' },
    { key: 'ornate', name: 'Ornate Coffer',icon: '👑', mult: 950,  floor: 3, desc: 'Guaranteed Epic or better.' },
    { key: 'cache',  name: 'Set Cache',    icon: '🗝️', mult: 2000, floor: 2, set: true, desc: 'A sealed piece of a gear set. Rare or better.' },
  ];

  // gear sets: wear 2 for the stat, 3 for the signature effect
  const SETS = {
    wolfpack: {
      name: 'Wolfpack', slots: ['weapon', 'gloves', 'boots', 'amulet'],
      two: { haste: 8 },  twoDesc: '+8% attack speed',
      threeFlag: 'pack',  threeDesc: 'Every 3rd hit strikes for +60% damage',
    },
    dragonguard: {
      name: 'Dragonguard', slots: ['helm', 'chest', 'legs', 'offhand'],
      two: { armor: 12 }, twoDesc: '+12% armor',
      three: { hp: 20 }, threeFlag: 'scales', threeDesc: '+20% max HP; take 10% less damage',
    },
    magpie: {
      name: "Magpie's", slots: ['ring', 'amulet', 'gloves', 'boots'],
      two: { gold: 15 }, twoDesc: '+15% gold',
      three: { loot: 25 }, threeFlag: 'magpie', threeDesc: '+25% loot find; drops gain +1 item level',
    },
    stormcaller: {
      name: 'Stormcaller', slots: ['weapon', 'helm', 'ring', 'offhand'],
      two: { crit: 5 }, twoDesc: '+5% crit chance',
      threeFlag: 'storm', threeDesc: 'Crits arc lightning for 40% bonus damage',
    },
    gravewalker: {
      name: 'Gravewalker', slots: ['chest', 'legs', 'boots', 'amulet'],
      two: { regen: 1 }, twoDesc: '+1% HP regen per second',
      threeFlag: 'grave', threeDesc: 'Heal for 3% of damage dealt; KO recovery halved',
    },
  };

  // Griselda's Curiosities: gold has to be FOR something
  const SHOP = [
    { key: 'bag',       name: 'Bag of Deeper Holding', icon: '🎒', max: 5, prices: [2e3, 2e4, 2e5, 2e6, 2e7],
      desc: '+10 bag slots', flavor: 'It is the same bag. She sews another bag inside it.' },
    { key: 'charter',   name: 'Royal Charter',         icon: '📜', max: 5, prices: [5e3, 5e4, 5e5, 5e6, 5e7],
      desc: '+5% gold find, permanently', flavor: 'A permit to bill monsters for dying.' },
    { key: 'horseshoe', name: 'Lucky Horseshoe',       icon: '🍀', max: 5, prices: [8e3, 8e4, 8e5, 8e6, 8e7],
      desc: '+4% loot find, permanently', flavor: 'Previous owner: a horse who had everything.' },
    { key: 'whetstone', name: 'Golden Whetstone',      icon: '✨', max: 3, prices: [25e3, 25e5, 25e7],
      desc: '+1 enhancement cap', flavor: 'Sharpens the concept of sharpness itself.' },
    { key: 'drums',     name: 'War Drums',             icon: '🥁', repeat: true,
      desc: 'The boss of your current zone becomes available immediately', flavor: 'The boss can hear them. The boss hates them.' },
    { key: 'bell',      name: 'Storm Bell',            icon: '🔔', repeat: true,
      desc: 'Ring up a random world event over your current zone', flavor: 'Weather on demand. No refunds on rain.' },
    { key: 'boar',      name: '???',                   icon: '🐗', max: 1, prices: [1e6], mystery: true,
      desc: 'Griselda refuses to explain.', flavor: '"You will know when you own it." — Griselda' },
    { key: 'insurance', name: 'Bureau Insurance',      icon: '🧾', max: 1, prices: [1e7],
      desc: 'The Depths no longer reset floor progress when you fall', flavor: 'They keep what they take. Unless you show a receipt.' },
  ];

  const ACHIEVEMENTS = [
    { key: 'k100',   name: 'Pest Control',        desc: 'Slay 100 monsters',            check: s => s.stats.kills >= 100,        reward: { shards: 15 } },
    { key: 'k1k',    name: 'Local Menace',        desc: 'Slay 1,000 monsters',          check: s => s.stats.kills >= 1000,       reward: { shards: 40 } },
    { key: 'k10k',   name: 'Ecological Disaster', desc: 'Slay 10,000 monsters',         check: s => s.stats.kills >= 10000,      reward: { shards: 120 } },
    { key: 'k100k',  name: 'The Grind Incarnate', desc: 'Slay 100,000 monsters',        check: s => s.stats.kills >= 100000,     reward: { shards: 400 } },
    { key: 'lv10',   name: 'Double Digits',       desc: 'Reach level 10',               check: s => s.hero.level >= 10,          reward: { shards: 20 } },
    { key: 'lv25',   name: 'Quarter Century',     desc: 'Reach level 25',               check: s => s.hero.level >= 25,          reward: { shards: 60 } },
    { key: 'lv50',   name: 'Halfway to Legend',   desc: 'Reach level 50',               check: s => s.hero.level >= 50,          reward: { shards: 150 } },
    { key: 'boss1',  name: 'Regicide, Junior',    desc: 'Conquer your first boss',      check: s => Object.keys(s.boss.kills).length >= 1,  reward: { shards: 30 } },
    { key: 'boss5',  name: 'Serial Usurper',      desc: 'Conquer 5 zone bosses',        check: s => Object.keys(s.boss.kills).length >= 5,  reward: { shards: 100 } },
    { key: 'boss10', name: 'Nothing Left to Fear',desc: 'Conquer all 10 bosses',        check: s => Object.keys(s.boss.kills).length >= 10, reward: { shards: 300 } },
    { key: 'uni1',   name: 'Collector',           desc: 'Discover a unique item',       check: s => Object.keys(s.stats.uniquesFound).length >= 1,  reward: { shards: 25 } },
    { key: 'uni5',   name: 'Curator',             desc: 'Discover 5 unique items',      check: s => Object.keys(s.stats.uniquesFound).length >= 5,  reward: { shards: 90 } },
    { key: 'uni10',  name: 'The Full Set',        desc: 'Discover 10 unique items',     check: s => Object.keys(s.stats.uniquesFound).length >= 10, reward: { shards: 250 } },
    { key: 'epic',   name: 'Purple Reign',        desc: 'Find an Epic item',            check: s => s.stats.bestRarity >= 3,     reward: { shards: 20 } },
    { key: 'leg',    name: 'Orange You Glad',     desc: 'Find a Legendary item',        check: s => s.stats.bestRarity >= 4,     reward: { shards: 50 } },
    { key: 'myth',   name: 'Statistically Absurd',desc: 'Find a Mythic item',           check: s => s.stats.bestRarity >= 5,     reward: { shards: 150 } },
    { key: 'die10',  name: 'Occupational Hazard', desc: 'Get knocked out 10 times',     check: s => s.stats.deaths >= 10,        reward: { shards: 20 } },
    { key: 'enh10',  name: 'Overinvested',        desc: 'Enhance an item to +10',       check: s => (s.stats.bestEnhance || 0) >= 10, reward: { shards: 60 } },
    { key: 'elite100', name: 'Star Hunter',       desc: 'Slay 100 elites',              check: s => (s.stats.eliteKills || 0) >= 100, reward: { shards: 50 } },
    { key: 'forge10',  name: 'Gambling Problem',  desc: 'Open 10 forge crates',         check: s => (s.stats.forged || 0) >= 10,      reward: { shards: 30 } },
    { key: 'gold1m',   name: 'Dragon Hoard',      desc: 'Earn 1M lifetime gold',        check: s => s.stats.goldEarned >= 1e6,        reward: { shards: 80 } },
    { key: 'asc1',     name: 'Born Again',        desc: 'Ascend for the first time',    check: s => (s.asc.count || 0) >= 1,          reward: { shards: 50 } },
    { key: 'asc3',     name: 'Serial Reincarnator', desc: 'Ascend 3 times',             check: s => (s.asc.count || 0) >= 3,          reward: { shards: 150 } },
    { key: 'mast10',   name: 'Regular',           desc: 'Earn 10 mastery tiers',        check: s => { let n = 0; for (const z of ZONES) n += masteryTierCount(s.stats.killsByZone[z.id] || 0); return n >= 10; }, reward: { shards: 80 } },
    { key: 'talent1',  name: 'Specialist',        desc: 'Choose a talent',              check: s => Object.keys(s.talents || {}).length >= 1, reward: { shards: 15 } },
    { key: 'best10',   name: 'Field Notes',       desc: 'Study 10 species (Bestiary tier I)', check: s => Object.values(s.stats.killsBySpecies || {}).filter(n => n >= 25).length >= 10, reward: { shards: 40 } },
    { key: 'depth3',   name: 'Spelunker',         desc: 'Clear Depth 3',                check: s => ((s.depth && s.depth.best) || 0) >= 3,  reward: { shards: 100 } },
    { key: 'depth10',  name: 'Bottomless',        desc: 'Clear Depth 10',               check: s => ((s.depth && s.depth.best) || 0) >= 10, reward: { shards: 300 } },
    { key: 'temper5',  name: 'Perfectionist',     desc: 'Temper items 5 times',         check: s => (s.stats.tempered || 0) >= 5, reward: { shards: 30 } },
    { key: 'beyond1',  name: 'Tourist of the Impossible', desc: 'Slay a monster beyond the Rift',
      check: s => ['farshore', 'clockwork', 'garden', 'throne'].some(z => (s.stats.killsByZone[z] || 0) > 0), reward: { shards: 50 } },
    { key: 'lastgod',  name: 'Transcendent',       desc: 'Conquer the Throne of the Last God',
      check: s => (s.boss.kills.throne || 0) >= 1, reward: { shards: 500 } },
    { key: 'lvl100',   name: 'Centurion',          desc: 'Reach level 100',
      check: s => s.hero.level >= 100, reward: { shards: 300 } },
    { key: 'anomaly5', name: 'Storm Chaser',       desc: 'Loot 5 anomaly chests',
      check: s => (s.stats.anomalies || 0) >= 5, reward: { shards: 60 } },
    { key: 'kings',    name: 'Kingslayer',         desc: 'Medal in the Proof of Kings',
      check: s => ((s.trials || {}).kings || 0) >= 3, reward: { shards: 80 } },
    { key: 'depth25',  name: 'The Long Way Down',  desc: 'Clear Depth 25',
      check: s => ((s.depth && s.depth.best) || 0) >= 25, reward: { shards: 250 } },
    { key: 'medal1',   name: 'Showoff',            desc: 'Earn a gold medal in the Proving Grounds',
      check: s => TRIALS.some(t => ((s.trials || {})[t.key] || 0) >= t.medals[2]), reward: { shards: 60 } },
    { key: 'champion', name: 'Champion of the Grounds', desc: 'Gold medals in all five Proofs',
      check: s => TRIALS.every(t => ((s.trials || {})[t.key] || 0) >= t.medals[2]), reward: { shards: 400 } },
    { key: 'sidepath', name: 'Scenic Route',       desc: 'Slay 100 monsters in side-path zones',
      check: s => ['bazaar', 'sporefen', 'glass'].reduce((n, z) => n + (s.stats.killsByZone[z] || 0), 0) >= 100, reward: { shards: 40 } },
    { key: 'set3',     name: 'Coordinated Outfit', desc: 'Wear a full 3-piece gear set',
      check: s => { const c = {}; for (const it of Object.values(s.hero.equipment)) { if (it && it.set) { c[it.set] = (c[it.set] || 0) + 1; if (c[it.set] >= 3) return true; } } return false; },
      reward: { shards: 60 } },
    { key: 'rich1m',   name: 'Millionaire',        desc: 'Hold 1M gold at once',        check: s => s.hero.gold >= 1e6, reward: { shards: 50 } },
    { key: 'boar',     name: 'Money Well Spent',   desc: 'Buy the thing Griselda would not explain', check: s => ((s.shop && s.shop.boar) || 0) >= 1, reward: { shards: 100 } },
    { key: 'pet1',     name: 'Plus One',           desc: 'A companion joins you',        check: s => Object.keys((s.pets && s.pets.owned) || {}).length >= 1,  reward: { shards: 20 } },
    { key: 'pet14',    name: 'The Menagerie',      desc: 'Collect all 14 companions',    check: s => Object.keys((s.pets && s.pets.owned) || {}).length >= 14, reward: { shards: 300 } },
    { key: 'goblin10', name: 'Goblin Tax',         desc: 'Catch 10 Loot Goblins',        check: s => (s.stats.goblins || 0) >= 10,   reward: { shards: 60 } },
    { key: 'shiny25',  name: 'Magpie Eye',         desc: 'Snatch 25 shinies',            check: s => (s.stats.shinies || 0) >= 25,   reward: { shards: 40 } },
    { key: 'click500', name: 'Hands-On Management', desc: 'Land 500 manual strikes',     check: s => (s.stats.clicks || 0) >= 500,   reward: { shards: 30 } },
    { key: 'contract10', name: 'Company Loyalty',  desc: 'Fulfill 10 Bureau Contracts',  check: s => (s.stats.contracts || 0) >= 10, reward: { shards: 80 } },
  ];

  const TIPS = [
    'Tip: every zone is open from level 1. Surviving them is your problem.',
    'Tip: Recommended Power tells you what a zone expects of you. Exceed it.',
    'Tip: hunting above your level pays up to +60% bonus XP, if you live.',
    'Tip: elites hit harder and die slower, but always drop something.',
    'Tip: each zone hides one unique treasure. It knows you want it.',
    'Tip: Zone Mastery tiers grant permanent damage. Old zones still owe you.',
    'Tip: salvage spare gear for Arcane Shards, then enhance your favorites.',
    'Tip: Loot Find raises both drop rate and rarity. Greed is a build.',
    'Tip: the game keeps grinding for up to 8 hours while you are away.',
    'Tip: 60 kills in a zone earns a boss attempt. Bosses enrage — bring damage.',
    'Tip: conquering a boss grants +2% damage. Forever. Go say hello.',
    'Tip: abilities are on keys 1, 2, 3. Pressing them is legal and encouraged.',
    'Tip: the Forge in your bag turns gold into gambling. For science.',
    'Tip: Ascension trades your level and gear for permanent power. The grind remembers.',
    'Tip: talents are chosen, not given. The button is right there, glowing.',
    'Tip: world events are temporary. Regret is permanent. Go.',
    'Tip: the Bestiary pays shard bounties for thorough fieldwork.',
    'Tip: below the Rift are the Depths. They do not have a bottom. We checked.',
    'Tip: three pieces of one gear set unlock its signature effect. Two is an outfit; three is a build.',
    'Tip: Griselda\'s shop takes gold. The "???" is exactly what it looks like. Probably.',
    'Tip: drops are rare on purpose. Keepers are for enhancing and tempering.',
    'Tip: side paths bend the rules. The Bazaar pays triple. The Sporefen teaches fast. The Glass Desert always pays out.',
    'Tip: the Proving Grounds do not care about your feelings, only your 60-second kill count.',
    'Tip: four sealed lands wait beyond the Rift. The seal is the Unraveled King. Handle it.',
    'Tip: anomalies close in ten minutes. The chest inside does not wait for you to finish what you were doing.',
    'Tip: at level 40 your class remembers its ultimate. Key 4. You will know when.',
    'Tip: you can hit the monster yourself. With your cursor. It counts, and it builds Momentum.',
    'Tip: if something on the battlefield sparkles, click it before it stops sparkling.',
    'Tip: Loot Goblins flee in eight seconds. That is what the ultimate is for.',
    'Tip: bosses sometimes drop a smaller, friendlier version of themselves. Keep swinging.',
    'Tip: Bureau Contracts refresh daily and pay in Soul Embers. The Bureau expects you back.',
  ];

  return {
    BAL, RARITIES, SLOTS, SLOT_KEYS, SLOT_BY_KEY, DOLL_ORDER, AFFIXES, PREFIXES,
    STAT_INFO, CLASSES, ZONES, ZONE_BY_ID, grayMult, refPower, masteryTierCount,
    UNIQUES, BOSSES, ABILITIES, ASC_UPGRADES, ASC_MIN_LEVEL, emberGain,
    FORGE_TIERS, ACHIEVEMENTS, TIPS,
    TALENT_TIERS, EVENTS, LORE, STARTER_QUESTS,
    SETS, SHOP, TRIALS, ANOMALIES, COMPANIONS,
  };
})();
