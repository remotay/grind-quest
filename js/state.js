/* Grind Quest — game state, derived stats, save/load */
GQ.state = (() => {
  const D = GQ.data;
  const U = GQ.util;
  const SAVE_KEY = 'grindquest_save_v1';

  const api = {
    S: null,       // the live game state (serializable)
    drv: null,     // cached derived stats
  };

  function freshState(name, classKey) {
    const equipment = {};
    for (const k of D.SLOT_KEYS) equipment[k] = null;
    return {
      version: 1,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      hero: {
        name: name || 'Adventurer',
        cls: classKey || 'warrior',
        level: 1,
        xp: 0,
        hp: 1,            // set to max on recalc
        gold: 0,
        shards: 0,
        equipment,
        inventory: [],
      },
      zoneId: 'meadow',
      settings: {
        autoSalvage: -1,   // salvage drops at or below this rarity (-1 = keep all)
        dmgNumbers: true,
        particles: true,
        sound: true,
        volume: 0.5,
        autocast: true,    // only effective once the Muscle Memory upgrade is owned
      },
      stats: {
        time: 0, kills: 0, deaths: 0,
        goldEarned: 0, shardsEarned: 0,
        itemsFound: 0, itemsSalvaged: 0,
        bestHit: 0, bestRarity: -1,
        killsByZone: {},
        killsBySpecies: {},
        pity: 20,            // kills since last drop; starts high so the first drop lands early
        uniquesFound: {},
        eliteKills: 0, bestEnhance: 0, forged: 0, tempered: 0, anomalies: 0,
        goblins: 0, shinies: 0, clicks: 0, contracts: 0,
        achDone: {},
        bestiaryPaid: {},    // species -> highest tier already rewarded
      },
      boss: {
        progress: {},        // zoneId -> kills banked toward next attempt
        kills: {},           // zoneId -> times conquered
        nightmares: {},      // zoneId -> nightmare kills (account layer)
      },
      challenge: null,       // active challenge key for this run
      challengeProg: { bosses: 0 },
      relics: {},            // relicKey -> true (account layer)
      title: null,           // chosen honorific key
      quests: [],
      questChain: 0,         // index into STARTER_QUESTS
      talents: {},           // tierIndex -> pickKey (reset on ascension)
      depth: { current: 1, best: 0, kills: 0 },
      event: null,           // {key, zoneId, until} in stats.time seconds
      eventNext: 180,        // stats.time when the next event may fire
      anomaly: null,         // {key, host, until, kills}
      anomalyNext: 420,      // first anomaly ~7 minutes in
      asc: {
        count: 0, embers: 0, lifetime: 0,
        up: {},              // upgradeKey -> rank
      },
      shop: {                // Griselda's ledger survives ascension
        bag: 0, charter: 0, horseshoe: 0, whetstone: 0, boar: 0, insurance: 0,
      },
      trials: {},            // trialKey -> best kill count (account record)
      pets: { owned: {}, active: null },     // companions persist ascension
      contracts: { stamp: 0, list: [] },     // daily Bureau Contracts (real time)
    };
  }

  function heroClass() {
    return D.CLASSES.find(c => c.key === api.S.hero.cls) || D.CLASSES[0];
  }

  // Compute derived combat stats from level + class + equipment.
  // eqOverride lets callers evaluate hypothetical loadouts.
  function derived(eqOverride) {
    const S = api.S;
    const c = heroClass();
    const L = S.hero.level;
    const eq = eqOverride || S.hero.equipment;

    let atkFlat = D.BAL.heroAtk(L) * c.atkM;
    let hpFlat = D.BAL.heroHp(L) * c.hpM;
    let atkPct = 0, hpPct = 0, armor = 0;
    let crit = 5 + c.crit, critDmg = 150;
    let haste = c.haste, regenPct = 2.0;
    let loot = c.lootP, xp = c.xpP, gold = 0;

    for (const k of D.SLOT_KEYS) {
      const item = eq[k];
      if (!item) continue;
      for (const s of GQ.items.effStats(item)) {
        switch (s.k) {
          case 'atkFlat': atkFlat += s.v; break;
          case 'hpFlat':  hpFlat += s.v; break;
          case 'atkPct':  atkPct += s.v; break;
          case 'hpPct':   hpPct += s.v; break;
          case 'crit':    crit += s.v; break;
          case 'critDmg': critDmg += s.v; break;
          case 'haste':   haste += s.v; break;
          case 'armor':   armor += s.v; break;
          case 'regen':   regenPct += s.v; break;
          case 'loot':    loot += s.v; break;
          case 'xp':      xp += s.v; break;
          case 'gold':    gold += s.v; break;
        }
      }
    }

    crit = U.clamp(crit, 0, 60);
    haste = Math.min(haste, 200);
    armor *= c.armorM;

    // talents: flat stat picks apply here, conditional flags apply in the engine
    let tDmg = 0, tHp = 0, tArmorPct = 0;
    for (const [ti, key] of Object.entries(S.talents || {})) {
      const tier = D.TALENT_TIERS[ti];
      const pick = tier && tier.picks.find(p => p.key === key);
      if (!pick || !pick.mods) continue;
      const md = pick.mods;
      tDmg += md.dmg || 0; tHp += md.hp || 0; tArmorPct += md.armor || 0;
      crit += md.crit || 0; critDmg += md.critDmg || 0; haste += md.haste || 0;
      regenPct += md.regen || 0; gold += md.gold || 0; xp += md.xp || 0; loot += md.loot || 0;
    }
    const applyMods = md => {
      tDmg += md.dmg || 0; tHp += md.hp || 0; tArmorPct += md.armor || 0;
      crit += md.crit || 0; critDmg += md.critDmg || 0; haste += md.haste || 0;
      regenPct += md.regen || 0; gold += md.gold || 0; xp += md.xp || 0; loot += md.loot || 0;
    };

    // gear sets: 2 pieces for the stat, 3 for the signature effect
    const setCounts = {};
    const setFlags = {};
    for (const k of D.SLOT_KEYS) {
      const it = eq[k];
      if (it && it.set) setCounts[it.set] = (setCounts[it.set] || 0) + 1;
    }
    for (const [sk, cnt] of Object.entries(setCounts)) {
      const sdef = D.SETS[sk];
      if (!sdef) continue;
      if (cnt >= 2 && sdef.two) applyMods(sdef.two);
      if (cnt >= 3) {
        if (sdef.three) applyMods(sdef.three);
        if (sdef.threeFlag) setFlags[sdef.threeFlag] = true;
      }
    }

    // the companion's perk
    const petKey = S.pets && S.pets.active;
    if (petKey && S.pets.owned[petKey] && D.COMPANIONS[petKey]) {
      applyMods(D.COMPANIONS[petKey].mods);
    }

    // relics: scars from finished challenge runs
    for (const ch of D.CHALLENGES) {
      if ((S.relics || {})[ch.relic.key]) applyMods(ch.relic.mods);
    }

    crit = U.clamp(crit, 0, 60);
    armor *= 1 + tArmorPct / 100;

    // Griselda's permanent relics
    const shop = S.shop || {};
    gold += 5 * (shop.charter || 0);
    loot += 4 * (shop.horseshoe || 0);

    // permanent account bonuses: mastery, boss conquests, ascension, collection
    const up = (S.asc && S.asc.up) || {};
    crit = U.clamp(crit + 3 * (up.crit || 0), 0, 60);
    const dmgPerm = (1 + D.BAL.masteryDmgPerTier * masteryTierTotal())
      * (1 + D.BAL.bossDmgPerConquest * conqueredCount())
      * (1 + D.BAL.nightmareDmgPerFirst * Object.keys((S.boss && S.boss.nightmares) || {}).length)
      * (1 + 0.10 * (up.str || 0))
      * (1 + tDmg / 100);
    const atk = atkFlat * (1 + atkPct / 100) * dmgPerm;
    let hpMax = hpFlat * (1 + hpPct / 100) * (1 + 0.10 * (up.vig || 0)) * (1 + tHp / 100);
    if (S.challenge === 'glass') hpMax *= 0.25; // the Glass Cannon deal
    gold += 25 * (up.gold || 0);
    xp += 10 * (up.xp || 0);
    loot += 10 * (up.loot || 0) + D.BAL.lootPerUnique * Object.keys(S.stats.uniquesFound || {}).length;
    const rate = D.BAL.heroBaseRate * (1 + haste / 100);
    const dps = atk * rate * (1 + (crit / 100) * ((critDmg - 100) / 100));
    const regen = hpMax * regenPct / 100;

    return { atk, hpMax, atkPct, hpPct, crit, critDmg, haste, armor, regenPct, regen, rate, dps, loot, xp, gold, setCounts, setFlags };
  }

  function masteryTierTotal() {
    let n = 0;
    const kb = (api.S && api.S.stats.killsByZone) || {};
    for (const z of D.ZONES) n += D.masteryTierCount(kb[z.id] || 0);
    return n;
  }

  function conqueredCount() {
    const bk = (api.S && api.S.boss && api.S.boss.kills) || {};
    return Object.keys(bk).filter(z => bk[z] > 0).length;
  }

  // conditional talents are checked by the engine mid-combat
  function hasTalent(flag) {
    const S = api.S;
    if (!S) return false;
    for (const [ti, key] of Object.entries(S.talents || {})) {
      const tier = D.TALENT_TIERS[ti];
      const pick = tier && tier.picks.find(p => p.key === key);
      if (pick && pick.flag === flag) return true;
    }
    return false;
  }

  function talentPointsAvailable() {
    const L = api.S.hero.level;
    let unlocked = 0;
    for (const t of D.TALENT_TIERS) if (L >= t.lvl) unlocked++;
    return unlocked - Object.keys(api.S.talents || {}).length;
  }

  function bestiaryTier(speciesName) {
    const kills = (api.S.stats.killsBySpecies || {})[speciesName] || 0;
    let n = 0;
    for (const t of D.BAL.bestiaryTiers) if (kills >= t) n++;
    return n;
  }

  function recoverTime() {
    const up = (api.S && api.S.asc && api.S.asc.up) || {};
    let t = Math.max(8, D.BAL.recoverTime - 4 * (up.rec || 0));
    if (hasSet('grave')) t *= 0.5; // Gravewalkers do not stay down
    return Math.max(5, t);
  }

  // signature set effects, checked by the engine mid-combat
  function hasSet(flag) {
    return !!(api.drv && api.drv.setFlags && api.drv.setFlags[flag]);
  }

  function invCap() {
    return D.BAL.invCap + 10 * ((api.S && api.S.shop && api.S.shop.bag) || 0);
  }

  function maxEnhance() {
    return D.BAL.maxEnhance + ((api.S && api.S.shop && api.S.shop.whetstone) || 0);
  }

  function emberPreview() {
    const kindle = 1 + 0.10 * ((api.S.asc.up.kindle) || 0);
    const bk = api.S.boss.kills || {};
    const spire = D.ZONES.filter(z => z.sealed === 'throne' && bk[z.id] > 0).length;
    return Math.round(D.emberGain(api.S.hero.level, conqueredCount(), spire) * kindle);
  }

  function offlineCap() {
    return D.BAL.offlineCap + 7200 * ((api.S && api.S.asc.up.offcap) || 0);
  }

  // prestige: bank embers, reset the run, keep the permanent layer.
  // Pass a challenge key to ascend INTO a restriction (and toward its Relic).
  function ascend(challengeKey) {
    const S = api.S;
    const gain = emberPreview();
    if (gain <= 0) return false;
    S.asc.count++;
    S.asc.embers += gain;
    S.asc.lifetime += gain;
    const eq = {};
    for (const k of D.SLOT_KEYS) eq[k] = null;
    S.hero.level = 1 + 5 * (S.asc.up.head || 0);
    S.hero.xp = 0;
    S.hero.gold = 0;
    S.hero.shards = 0;
    S.hero.inventory = [];
    S.hero.equipment = eq;
    S.zoneId = 'meadow';
    S.boss.progress = {};      // conquests (boss.kills) persist — the account layer
    S.quests = [];
    S.talents = {};            // rebuild each life; Depth best and questChain persist
    S.depth.current = 1;
    S.depth.kills = 0;
    S.event = null;
    S.challenge = challengeKey || null;
    S.challengeProg = { bosses: 0 };
    S.stats.pity = 20;
    recalc();
    S.hero.hp = api.drv.hpMax;
    save();
    return gain;
  }

  // single-number power metric, used for upgrade comparisons and zone readiness;
  // zLevel lets zone cards evaluate power against their own defenses
  function power(drv, zLevel) {
    if (zLevel == null) {
      zLevel = GQ.engine ? GQ.engine.currentZone().level
        : (D.ZONE_BY_ID[api.S.zoneId] || D.ZONES[0]).level;
    }
    const dr = drv.armor / (drv.armor + D.BAL.armorK(zLevel));
    const ehp = drv.hpMax * (1 + dr) + drv.regen * 10;
    return drv.dps * Math.pow(ehp, 0.45);
  }

  function recalc() {
    api.drv = derived();
    api.S.hero.hp = U.clamp(api.S.hero.hp, 0, api.drv.hpMax);
  }

  function gearScoreTotal() {
    let t = 0;
    for (const k of D.SLOT_KEYS) {
      const it = api.S.hero.equipment[k];
      if (it) t += GQ.items.gearScore(it);
    }
    return t;
  }

  /* ---------- persistence ---------- */

  let resetting = false;

  function save() {
    if (!api.S || resetting) return;
    api.S.lastSeen = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(api.S));
    } catch (e) { /* storage full or blocked; keep playing */ }
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      if (!s || !s.hero || !s.hero.equipment) return false;
      // forward-compat defaults
      const base = freshState(s.hero.name, s.hero.cls);
      s.settings = Object.assign(base.settings, s.settings || {});
      s.stats = Object.assign(base.stats, s.stats || {});
      s.boss = Object.assign(base.boss, s.boss || {});
      s.asc = Object.assign(base.asc, s.asc || {});
      s.asc.up = s.asc.up || {};
      s.quests = Array.isArray(s.quests) ? s.quests : [];
      s.talents = s.talents || {};
      s.depth = Object.assign(base.depth, s.depth || {});
      s.shop = Object.assign(base.shop, s.shop || {});
      s.trials = s.trials || {};
      s.pets = Object.assign(base.pets, s.pets || {});
      s.pets.owned = s.pets.owned || {};
      s.contracts = Object.assign(base.contracts, s.contracts || {});
      s.boss.nightmares = s.boss.nightmares || {};
      s.relics = s.relics || {};
      if (!('challenge' in s)) s.challenge = null;
      s.challengeProg = Object.assign(base.challengeProg, s.challengeProg || {});
      if (!('title' in s)) s.title = null;
      if (s.zoneId === 'trial') s.zoneId = 'meadow'; // trials never persist across loads
      if (s.questChain == null) s.questChain = 0;
      if (s.eventNext == null) s.eventNext = (s.stats.time || 0) + 120;
      if (!('event' in s)) s.event = null;
      if (!('anomaly' in s)) s.anomaly = null;
      if (s.anomalyNext == null) s.anomalyNext = (s.stats.time || 0) + 300;
      if (s.zoneId === 'anomaly' && !s.anomaly) s.zoneId = 'meadow';
      for (const k of D.SLOT_KEYS) if (!(k in s.hero.equipment)) s.hero.equipment[k] = null;
      // 'depth' is a virtual zone; it is valid only once the Rift boss has fallen
      if (s.zoneId === 'depth') {
        if (!((s.boss.kills || {}).rift > 0)) s.zoneId = 'meadow';
      } else if (!D.ZONE_BY_ID[s.zoneId]) {
        s.zoneId = 'meadow';
      }
      api.S = s;
      recalc();
      return true;
    } catch (e) { return false; }
  }

  function exportSave() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(api.S))));
  }

  function importSave(str) {
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      if (!s || !s.hero || !s.hero.equipment) return false;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      return load();
    } catch (e) { return false; }
  }

  function hardReset() {
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  }

  function newGame(name, classKey) {
    api.S = freshState(name, classKey);
    recalc();
    api.S.hero.hp = api.drv.hpMax;
    save();
  }

  api.freshState = freshState;
  api.heroClass = heroClass;
  api.derived = derived;
  api.power = power;
  api.masteryTierTotal = masteryTierTotal;
  api.conqueredCount = conqueredCount;
  api.hasTalent = hasTalent;
  api.talentPointsAvailable = talentPointsAvailable;
  api.bestiaryTier = bestiaryTier;
  api.hasSet = hasSet;
  api.invCap = invCap;
  api.maxEnhance = maxEnhance;
  api.offlineCap = offlineCap;
  api.recoverTime = recoverTime;
  api.emberPreview = emberPreview;
  api.ascend = ascend;
  api.recalc = recalc;
  api.gearScoreTotal = gearScoreTotal;
  api.save = save;
  api.load = load;
  api.exportSave = exportSave;
  api.importSave = importSave;
  api.hardReset = hardReset;
  api.newGame = newGame;
  return api;
})();
