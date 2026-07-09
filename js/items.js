/* Grind Quest — item generation and inventory operations */
GQ.items = (() => {
  const U = GQ.util;
  const D = GQ.data;

  const SCALE_STATS = { atkFlat: 1, hpFlat: 1, armor: 1 };

  // lootPct: loot find in percent (e.g. 15 = +15%)
  function rollRarity(lootPct) {
    const lf = Math.max(0, lootPct) / 100;
    return U.weightedPick(D.RARITIES.map((r, i) => ({ v: i, w: r.weight * Math.pow(1 + lf, i) })));
  }

  function generateItem(ilvl, lootPct, forceRarity, opts) {
    opts = opts || {};
    ilvl = Math.max(1, Math.round(ilvl));
    const slot = opts.slot ? D.SLOT_BY_KEY[opts.slot]
      : U.weightedPick(D.SLOTS.map(s => ({ v: s, w: s.w })));
    const rar = forceRarity != null ? forceRarity : rollRarity(lootPct || 0);
    const rInfo = D.RARITIES[rar];
    const variant = U.pick(slot.variants);

    const stats = [];
    for (const [k, spec] of Object.entries(variant.stats)) {
      let v;
      if (typeof spec === 'number') {
        v = D.BAL.itemStat(spec, ilvl) * rInfo.statMult * U.rand(0.9, 1.12);
      } else {
        v = U.rand(spec[0], spec[1]) * rInfo.statMult;
      }
      stats.push({ k, v, p: true });
    }

    // affixes: distinct picks from the pool
    const pool = D.AFFIXES.slice();
    let suffix = '';
    for (let i = 0; i < rInfo.affixes && pool.length; i++) {
      const af = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      let v;
      if (af.coeff != null) {
        v = D.BAL.itemStat(af.coeff, ilvl) * U.rand(0.75, 1.25);
      } else {
        v = U.rand(af.range[0], af.range[1]) * (1 + ilvl * 0.006);
      }
      stats.push({ k: af.k, v });
      if (i === 0) suffix = ' ' + af.suffix;
    }

    const base = U.pick(variant.names);
    const item = {
      id: U.uid(),
      slot: slot.key,
      name: '',
      ilvl, rar, enh: 0,
      stats,
    };
    if (opts.set) {
      // set pieces carry the set's name instead of a magic prefix
      item.set = opts.set;
      item.name = D.SETS[opts.set].name + ' ' + base + suffix;
    } else {
      const prefix = rar >= 1 ? U.pick(D.PREFIXES[rar]) + ' ' : '';
      item.name = prefix + base + suffix;
    }
    return item;
  }

  function generateSetPiece(ilvl, lootPct, minRarity) {
    const setKey = U.pick(Object.keys(D.SETS));
    const slotKey = U.pick(D.SETS[setKey].slots);
    const rar = Math.max(2, minRarity != null ? minRarity : rollRarity(lootPct || 0));
    return generateItem(ilvl, lootPct, rar, { slot: slotKey, set: setKey });
  }

  // named zone treasure: fixed identity, strong boosted primary, themed affixes
  function generateUnique(zoneId, ilvl) {
    const def = D.UNIQUES[zoneId];
    if (!def) return null;
    const slotDef = D.SLOT_BY_KEY[def.slot];
    const stats = [];
    for (const [k, spec] of Object.entries(slotDef.variants[0].stats)) {
      if (typeof spec === 'number') {
        stats.push({ k, v: D.BAL.itemStat(spec, ilvl) * 2.5 * U.rand(0.95, 1.1), p: true });
      } else {
        stats.push({ k, v: U.rand(spec[0], spec[1]) * 2.5, p: true });
      }
    }
    for (const sp of def.stats) {
      let v;
      if (sp.c != null) v = D.BAL.itemStat(sp.c, ilvl) * U.rand(0.95, 1.1);
      else v = U.rand(sp.r[0], sp.r[1]);
      stats.push({ k: sp.k, v });
    }
    return {
      id: U.uid(), slot: def.slot, name: def.name, ilvl, rar: 6, enh: 0,
      uni: def.key, flavor: def.flavor, stats,
    };
  }

  function enhMult(item) { return 1 + D.BAL.enhancePerLevel * (item.enh || 0); }

  // effective stat entries after enhancement
  function effStats(item) {
    const m = enhMult(item);
    return item.stats.map(s => ({ k: s.k, v: s.v * m, p: !!s.p }));
  }

  function gearScore(item) {
    const nAffix = item.stats.filter(s => !s.p).length;
    return Math.round(
      10 * Math.pow(D.BAL.G, item.ilvl) * D.RARITIES[item.rar].statMult *
      enhMult(item) * (1 + 0.1 * nAffix)
    );
  }

  function salvageValue(item) {
    const r = item.rar;
    return {
      gold: Math.round(D.BAL.goldKill(item.ilvl) * U.rand(2.2, 3.4) * (1 + r) * (1 + 0.4 * (item.enh || 0))),
      shards: Math.max(1, Math.round((1 + r * r) * (1 + item.ilvl / 16) * (1 + 0.5 * (item.enh || 0)))),
    };
  }

  function enhanceCost(item) {
    const n = item.enh || 0;
    return {
      gold: Math.round(D.BAL.goldKill(item.ilvl) * 6 * Math.pow(1.5, n)),
      shards: Math.ceil(3 * Math.pow(1.55, n) * (1 + item.rar * 0.3)),
    };
  }

  /* ---------- inventory ops (mutate state, mark UI dirty) ---------- */

  function S() { return GQ.state.S; }
  function dirty(...keys) { if (GQ.ui) GQ.ui.markDirty(...keys); }

  function findInv(id) {
    const inv = S().hero.inventory;
    const idx = inv.findIndex(it => it.id === id);
    return idx >= 0 ? { idx, item: inv[idx] } : null;
  }

  function equip(id) {
    if (S().challenge === 'naked') {
      if (GQ.ui) GQ.ui.toast('🧺 The Pilgrimage forbids it. Skin and stubbornness only.', 'r5');
      return false;
    }
    const f = findInv(id);
    if (!f) return false;
    const eq = S().hero.equipment;
    const prev = eq[f.item.slot] || null;
    eq[f.item.slot] = f.item;
    if (prev) S().hero.inventory.splice(f.idx, 1, prev);
    else S().hero.inventory.splice(f.idx, 1);
    GQ.state.recalc();
    dirty('char', 'inv', 'zones');
    return true;
  }

  function unequip(slotKey) {
    const eq = S().hero.equipment;
    const item = eq[slotKey];
    if (!item) return false;
    if (S().hero.inventory.length >= GQ.state.invCap()) return false;
    eq[slotKey] = null;
    S().hero.inventory.push(item);
    GQ.state.recalc();
    dirty('char', 'inv', 'zones');
    return true;
  }

  function grantSalvage(sv) {
    let shards = sv.shards;
    if (GQ.state.hasTalent && GQ.state.hasTalent('prospector')) shards = Math.ceil(shards * 1.25);
    S().hero.gold += sv.gold;
    S().hero.shards += shards;
    S().stats.goldEarned += sv.gold;
    S().stats.shardsEarned += shards;
    S().stats.itemsSalvaged += 1;
  }

  function salvageInv(id) {
    const f = findInv(id);
    if (!f) return null;
    const sv = salvageValue(f.item);
    S().hero.inventory.splice(f.idx, 1);
    grantSalvage(sv);
    if (GQ.engine) GQ.engine.questEvent('salvage', 1);
    dirty('inv', 'res');
    return sv;
  }

  // salvage the entire bag — everything, no exceptions (equipped gear is untouched)
  function salvageAll() {
    const inv = S().hero.inventory;
    let gold = 0, shards = 0, count = 0;
    for (const it of inv) {
      const sv = salvageValue(it);
      grantSalvage(sv);
      gold += sv.gold; shards += sv.shards; count++;
    }
    inv.length = 0;
    if (count && GQ.engine) GQ.engine.questEvent('salvage', count);
    dirty('inv', 'res');
    return { gold, shards, count, kept: 0 };
  }

  // salvage everything at or below maxRar; returns totals
  function salvageTier(maxRar) {
    const inv = S().hero.inventory;
    let gold = 0, shards = 0, count = 0;
    for (let i = inv.length - 1; i >= 0; i--) {
      if (inv[i].rar <= maxRar) {
        const sv = salvageValue(inv[i]);
        inv.splice(i, 1);
        grantSalvage(sv);
        gold += sv.gold; shards += sv.shards; count++;
      }
    }
    if (count && GQ.engine) GQ.engine.questEvent('salvage', count);
    dirty('inv', 'res');
    return { gold, shards, count };
  }

  function enhance(item) {
    if ((item.enh || 0) >= GQ.state.maxEnhance()) return false;
    const cost = enhanceCost(item);
    const h = S().hero;
    if (h.gold < cost.gold || h.shards < cost.shards) return false;
    h.gold -= cost.gold;
    h.shards -= cost.shards;
    item.enh = (item.enh || 0) + 1;
    if (item.enh > (S().stats.bestEnhance || 0)) S().stats.bestEnhance = item.enh;
    if (GQ.engine) GQ.engine.questEvent('enhance', 1);
    GQ.state.recalc();
    dirty('char', 'inv', 'res', 'zones');
    return true;
  }

  function temperCost(item) {
    return {
      gold: Math.round(D.BAL.goldKill(item.ilvl) * 12),
      shards: Math.ceil(6 + item.ilvl / 4 + item.rar * 2),
    };
  }

  // reroll the values of every affix; types stay, uniques refuse
  function temper(item) {
    if (item.uni) return false;
    const affixes = item.stats.filter(s => !s.p);
    if (!affixes.length) return false;
    const cost = temperCost(item);
    const h = S().hero;
    if (h.gold < cost.gold || h.shards < cost.shards) return false;
    h.gold -= cost.gold;
    h.shards -= cost.shards;
    for (const s of affixes) {
      const af = D.AFFIXES.find(a => a.k === s.k);
      if (!af) continue;
      if (af.coeff != null) s.v = D.BAL.itemStat(af.coeff, item.ilvl) * U.rand(0.75, 1.25);
      else s.v = U.rand(af.range[0], af.range[1]) * (1 + item.ilvl * 0.006);
    }
    S().stats.tempered = (S().stats.tempered || 0) + 1;
    GQ.state.recalc();
    dirty('char', 'inv', 'res');
    return true;
  }

  function forgeCost(tier) {
    const disc = Math.max(0.55, 1 - 0.15 * ((S().asc.up.forge) || 0));
    return Math.round(D.BAL.goldKill(S().hero.level) * tier.mult * disc);
  }

  // the gold sink: gamble for gear at your level
  function forge(tierKey) {
    const tier = D.FORGE_TIERS.find(t => t.key === tierKey);
    if (!tier) return null;
    const h = S().hero;
    const cost = forgeCost(tier);
    if (h.gold < cost) return null;
    h.gold -= cost;
    const drvLoot = GQ.state.drv ? GQ.state.drv.loot : 0;
    const rar = Math.max(tier.floor, rollRarity(drvLoot));
    const item = tier.set
      ? generateSetPiece(h.level, drvLoot, rar)
      : generateItem(h.level, drvLoot, rar);
    S().stats.forged = (S().stats.forged || 0) + 1;
    S().stats.itemsFound++;
    if (item.rar > S().stats.bestRarity) S().stats.bestRarity = item.rar;
    if (h.inventory.length >= GQ.state.invCap()) {
      const sv = salvageValue(item);
      grantSalvage(sv);
      dirty('inv', 'res');
      return { item, salvaged: true };
    }
    h.inventory.push(item);
    if (GQ.engine) GQ.engine.questEvent('item', 1);
    dirty('inv', 'res');
    return { item, salvaged: false };
  }

  function sortInv() {
    S().hero.inventory.sort((a, b) =>
      (b.rar - a.rar) || (gearScore(b) - gearScore(a)) || a.slot.localeCompare(b.slot));
    dirty('inv');
  }

  // Equip anything that raises overall power. Returns number of swaps.
  function autoEquip() {
    let swaps = 0;
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      const eq = S().hero.equipment;
      for (const slotKey of D.SLOT_KEYS) {
        const current = GQ.state.power(GQ.state.derived());
        let best = null, bestPower = current * 1.003;
        for (const it of S().hero.inventory) {
          if (it.slot !== slotKey) continue;
          const trial = Object.assign({}, eq, { [slotKey]: it });
          const p = GQ.state.power(GQ.state.derived(trial));
          if (p > bestPower) { bestPower = p; best = it; }
        }
        if (best) { equip(best.id); swaps++; improved = true; }
      }
      if (!improved) break;
    }
    return swaps;
  }

  return {
    generateItem, generateUnique, generateSetPiece, rollRarity, effStats, enhMult, gearScore,
    salvageValue, enhanceCost, forge, forgeCost, temper, temperCost,
    equip, unequip, salvageInv, salvageTier, salvageAll, enhance, sortInv, autoEquip,
  };
})();
