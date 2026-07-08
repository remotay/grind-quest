/* Grind Quest — combat engine, loot, zone rates, offline progress */
GQ.engine = (() => {
  const D = GQ.data;
  const U = GQ.util;

  const combat = {
    monster: null,     // {sp, name, hp, hpMax, dmg, xp, gold, zoneLevel, elite?, bossZone?, age, stun}
    respawn: 0.4,
    recover: 0,
    recoverMax: 25,
    atkT: 0.4,
    matkT: 1.0,
    cds: {},           // abilityKey -> seconds remaining
    buffs: [],         // {key, icon, buff, amt, t, max}
    autoT: 0,
    achT: 0,
    clickT: 0,         // manual strike cooldown
    momentum: 0,       // hands-on damage stacks
    momentumT: 0,
    petT: 1.5,         // companion swing timer
    shinyT: 30,        // next clickable spark
  };

  function S() { return GQ.state.S; }
  function drv() { return GQ.state.drv; }
  function scene() { return (GQ.scene && GQ.scene.ready) ? GQ.scene : null; }
  function ui() { return GQ.ui; }

  // The Depths: an infinite ladder below the Rift, built as virtual zones
  function depthZone(n) {
    const rift = D.ZONE_BY_ID.rift;
    return {
      id: 'depth',
      name: `The Depths · Floor ${n}`,
      level: 68 + D.BAL.depthStep * n,
      flavor: 'Below the Rift, the grind continues. It has always continued.',
      props: 'rift',
      pal: rift.pal,
      monsters: rift.monsters,
    };
  }

  function depthsUnlocked() { return (S().boss.kills.rift || 0) > 0; }
  // gates: the Beyond opens when the Rift's master falls; the Spire when the Last God does
  function zoneOpen(z) {
    if (!z.sealed) return true;
    if (z.sealed === 'throne') return (S().boss.kills.throne || 0) > 0;
    return depthsUnlocked();
  }

  // anomalies: a temporary place borrowing its host's fauna, 3 levels up
  function anomalyZone() {
    const a = S().anomaly;
    const def = a && D.ANOMALIES.find(x => x.key === a.key);
    const host = a && D.ZONE_BY_ID[a.host];
    if (!def || !host) return D.ZONES[0];
    return {
      id: 'anomaly',
      name: `${def.icon} ${def.name}`,
      level: host.level + 3,
      flavor: def.desc,
      props: host.props,
      pal: host.pal,
      monsters: host.monsters,
    };
  }

  // The Proving Grounds: a Proof is a virtual arena zone at fixed level
  function trialZone(i) {
    const def = D.TRIALS[i] || D.TRIALS[0];
    const src = D.ZONE_BY_ID[def.src];
    return {
      id: 'trial',
      name: def.name,
      level: def.lvl,
      flavor: 'Sixty seconds. The judges are not impressed yet.',
      props: src.props,
      pal: src.pal,
      monsters: src.monsters,
    };
  }

  function currentZone() {
    if (S().zoneId === 'depth') return depthZone(S().depth.current);
    if (S().zoneId === 'trial') return trialZone(combat.trial ? combat.trial.i : 0);
    if (S().zoneId === 'anomaly') return anomalyZone();
    return D.ZONE_BY_ID[S().zoneId] || D.ZONES[0];
  }
  const zone = currentZone;

  // side-path gimmicks (all default 1 / off)
  function zoneMods(z) { return (z && z.gimmick) || {}; }

  // world event modifiers for a zone (all default 1)
  function eventMods(zoneId) {
    const ev = S().event;
    if (!ev || ev.zoneId !== zoneId || S().stats.time >= ev.until) return {};
    const def = D.EVENTS.find(e => e.key === ev.key);
    return def ? def.mods : {};
  }

  function activeEvent() {
    const ev = S().event;
    if (!ev || S().stats.time >= ev.until) return null;
    const def = D.EVENTS.find(e => e.key === ev.key);
    return def ? { def, zoneId: ev.zoneId, remaining: ev.until - S().stats.time } : null;
  }

  function damageReduction(zLevel) {
    const a = drv().armor;
    return Math.min(0.75, a / (a + D.BAL.armorK(zLevel)));
  }

  /* ---------- spawning & combat ---------- */

  function spawnMonster() {
    const z = zone();
    // Proof of Kings: the original ten bosses, in order, as fast as you can fell them
    if (combat.trial && D.TRIALS[combat.trial.i].rush) {
      const order = Object.keys(D.BOSSES).slice(0, 10);
      const zid = order[Math.min(combat.trial.kills, order.length - 1)];
      const b = D.BOSSES[zid];
      const bz = D.ZONE_BY_ID[zid];
      const hpMax = D.BAL.monsterHp(bz.level) * D.BAL.bossHpMult * 0.9;
      combat.monster = {
        sp: { shape: b.shape, hue: b.hue, size: b.size * 0.9 },
        trial: true,
        name: b.name,
        hp: hpMax, hpMax,
        dmg: D.BAL.monsterDmg(bz.level) * 1.6,
        atkInt: 2.0,
        xp: 0, gold: 0,
        zoneLevel: bz.level,
      };
      combat.matkT = 1.4;
      if (scene()) scene().onSpawn(combat.monster);
      return;
    }
    const sp = U.pick(z.monsters);
    const em = eventMods(z.id);
    const gm = zoneMods(z);
    const inTrial = !!combat.trial;
    // a Loot Goblin: rich, harmless, and already halfway out the door
    if (!inTrial && S().stats.kills >= D.BAL.goblinMinKills && Math.random() < D.BAL.goblinChance) {
      const hpMax = D.BAL.monsterHp(z.level) * 1.3 * (gm.hpM || 1);
      combat.monster = {
        sp: { name: 'Loot Goblin', shape: 'humanoid', hue: 120, size: 0.85 },
        goblin: true, fleeT: D.BAL.goblinFlee,
        name: 'Loot Goblin',
        hp: hpMax, hpMax,
        dmg: D.BAL.monsterDmg(z.level) * 0.25,
        atkInt: 2.5,
        xp: D.BAL.xpKill(z.level) * 0.5,
        gold: D.BAL.goldKill(z.level) * 8,
        zoneLevel: z.level,
      };
      combat.matkT = 2;
      ui().log('💰 <b>A Loot Goblin!</b> Eight seconds. Go.', 'sys');
      GQ.audio.quest();
      if (scene()) { scene().onSpawn(combat.monster); scene().addShake(2); }
      return;
    }
    const elite = !inTrial && S().stats.kills >= D.BAL.eliteMinKills &&
      Math.random() < Math.min(0.6, D.BAL.eliteChance * (em.elite || 1));
    const hpMax = D.BAL.monsterHp(z.level) * sp.hp * U.rand(0.92, 1.12) *
      (elite ? D.BAL.eliteHp : 1) * (gm.hpM || 1);
    combat.monster = {
      sp, elite, trial: inTrial,
      name: (elite ? 'Elite ' : '') + sp.name,
      hp: hpMax, hpMax,
      dmg: D.BAL.monsterDmg(z.level) * sp.dmg * (elite ? D.BAL.eliteDmg : 1) * (em.mdmg || 1) * (gm.mdmgM || 1),
      atkInt: D.BAL.monsterAtkInterval / (em.matk || 1),
      xp: D.BAL.xpKill(z.level) * sp.xp * (elite ? D.BAL.eliteXp : 1),
      gold: D.BAL.goldKill(z.level) * sp.gold * (elite ? D.BAL.eliteGold : 1),
      zoneLevel: z.level,
    };
    combat.matkT = U.rand(0.8, 1.4);
    if (scene()) scene().onSpawn(combat.monster);
  }

  function dmgBuffMult() {
    let m = 1;
    for (const b of combat.buffs) if (b.buff === 'dmg') m *= 1 + b.amt;
    return m;
  }
  function hasteBuffMult() {
    let m = 1;
    for (const b of combat.buffs) if (b.buff === 'haste') m *= 1 + b.amt;
    return m;
  }

  function dealDamage(mult, forceCrit, noDouble) {
    const m = combat.monster;
    if (!m) return;
    const d = drv();
    const h = S().hero;
    const HT = GQ.state.hasTalent;
    let dmg = d.atk * U.rand(0.9, 1.1) * mult * dmgBuffMult();
    const gm = zoneMods(zone());
    if (gm.dmgM) dmg *= gm.dmgM; // the Sporefen disagrees with your sword

    // conditional talents
    if (HT('berserker') && h.hp < d.hpMax * 0.5) dmg *= 1.15;
    if (HT('giantslayer') && (m.elite || m.bossZone)) dmg *= 1.15;
    if (HT('godslayer') && m.bossZone) dmg *= 1.25;
    if (HT('rampage')) dmg *= 1 + Math.min(15, combat.streak || 0) * 0.01;
    if (HT('assassin') && !m.hitOnce) dmg *= 2;
    m.hitOnce = true;
    // bestiary mastery: you know this thing's weak points
    if (m.sp.name && GQ.state.bestiaryTier(m.sp.name) >= 3) dmg *= 1.05;

    // Wolfpack: every 3rd hit lands harder
    combat.hitCount = (combat.hitCount || 0) + 1;
    if (GQ.state.hasSet('pack') && combat.hitCount % 3 === 0) dmg *= 1.6;

    // Momentum: hands-on play sharpens every hit
    if (combat.momentum > 0) dmg *= 1 + combat.momentum * D.BAL.momentumDmg;

    const isCrit = forceCrit || Math.random() * 100 < d.crit;
    if (isCrit) dmg *= d.critDmg / 100;
    m.hp -= dmg;
    if (dmg > S().stats.bestHit) S().stats.bestHit = dmg;

    // Stormcaller: crits arc lightning
    if (isCrit && GQ.state.hasSet('storm') && m.hp > 0) {
      const arc = dmg * 0.4;
      m.hp -= arc;
      if (scene()) scene().onArc(arc);
    }

    let heal = 0;
    if (HT('vampiric')) heal += 0.02;
    if (GQ.state.hasSet('grave')) heal += 0.03;
    if (heal > 0 && h.hp < d.hpMax) h.hp = Math.min(d.hpMax, h.hp + dmg * heal);
    if (scene()) scene().onPlayerHit(dmg, isCrit || mult > 1);
    GQ.audio.hit(isCrit);
    if (m.hp <= 0) { killMonster(); return; }
    if (!noDouble && mult === 1 && HT('doublestrike') && Math.random() < 0.10) {
      dealDamage(1, false, true);
    }
  }

  function playerAttack() { dealDamage(1, false); }

  function monsterAttack() {
    const m = combat.monster;
    if (!m) return;
    const dr = damageReduction(m.zoneLevel);
    let dmg = m.dmg * U.rand(0.85, 1.15) * (1 - dr);
    if (GQ.state.hasSet('scales')) dmg *= 0.9; // Dragonguard shrugs
    const h = S().hero;
    combat.streak = 0; // rampage stacks fall when you get hit
    if (h.hp - dmg <= 0 && GQ.state.hasTalent('undying') && !m.usedUndying) {
      m.usedUndying = true;
      h.hp = 1;
      if (scene()) scene().onPlayerHit(0, false);
      ui().log('<b>UNDYING.</b> You refuse, once.', 'level');
      GQ.audio.ability('heal');
      return;
    }
    h.hp -= dmg;
    if (scene()) scene().onHeroHit(dmg, !!m.bossZone);
    GQ.audio.hurt();
    if (h.hp <= 0) heroDown();
  }

  /* ---------- active abilities ---------- */

  function abilities() { return D.ABILITIES[S().hero.cls] || D.ABILITIES.warrior; }

  function cast(i) {
    const ab = abilities()[i];
    if (!ab || (combat.cds[ab.key] || 0) > 0 || combat.recover > 0) return false;
    const d = drv(), h = S().hero;
    if (ab.unlock && S().hero.level < ab.unlock) return false;
    if (S().challenge === 'silent') return false; // sealed hands
    if (ab.kind === 'strike') {
      if (!combat.monster) return false;
      dealDamage(ab.power, !!ab.alwaysCrit);
      if (ab.stunDur && combat.monster) combat.monster.stun = ab.stunDur;
      if (scene()) scene().addShake(ab.unlock ? 7 : 3);
    } else if (ab.kind === 'buff') {
      combat.buffs = combat.buffs.filter(b => b.key !== ab.key);
      combat.buffs.push({ key: ab.key, icon: ab.icon, buff: ab.buff, amt: ab.amt, t: ab.dur, max: ab.dur });
      if (scene()) scene().onBuff();
    } else if (ab.kind === 'heal') {
      h.hp = Math.min(d.hpMax, h.hp + d.hpMax * ab.amt);
      if (scene()) scene().onHeal();
    } else if (ab.kind === 'stun') {
      if (!combat.monster) return false;
      combat.monster.stun = ab.dur;
      if (ab.heal) h.hp = Math.min(d.hpMax, h.hp + d.hpMax * ab.heal);
      if (scene()) scene().onStun();
    }
    combat.cds[ab.key] = ab.cd * (GQ.state.hasTalent('overwhelm') ? 0.85 : 1);
    GQ.audio.ability(ab.kind);
    return true;
  }

  // clicking the monster is a legitimate combat technique
  function manualStrike() {
    if (!combat.monster || combat.recover > 0 || combat.clickT > 0) return false;
    combat.clickT = D.BAL.clickCd;
    combat.momentum = Math.min(D.BAL.momentumMax, (combat.momentum || 0) + 1);
    combat.momentumT = D.BAL.momentumDur;
    S().stats.clicks = (S().stats.clicks || 0) + 1;
    dealDamage(D.BAL.clickPower, false, true);
    return true;
  }

  // the shiny: click it before it stops existing
  function collectShiny() {
    const z = zone();
    const d = drv();
    S().stats.shinies = (S().stats.shinies || 0) + 1;
    const roll = Math.random();
    if (roll < 0.55) {
      const g = Math.round(D.BAL.goldKill(z.level) * 15 * (1 + d.gold / 100));
      S().hero.gold += g;
      S().stats.goldEarned += g;
      ui().log(`✨ Shiny snatched: <b style="color:var(--gold)">+${U.fmt(g)} gold</b>.`, 'dim');
    } else if (roll < 0.85) {
      const n = Math.max(1, Math.round(2 + z.level / 8));
      S().hero.shards += n;
      S().stats.shardsEarned += n;
      ui().log(`✨ Shiny snatched: <b style="color:#bda1ff">+${n} shards</b>.`, 'dim');
    } else {
      combat.buffs = combat.buffs.filter(b => b.key !== 'rush');
      combat.buffs.push({ key: 'rush', icon: '✨', buff: 'dmg', amt: 0.25, t: 10, max: 10 });
      ui().log('✨ Shiny snatched: <b style="color:var(--gold2)">Rush!</b> +25% damage for 10s.', 'dim');
    }
    GQ.audio.coin();
    ui().markDirty('res');
  }

  function petStrike() {
    const m = combat.monster;
    if (!m) return;
    const d = drv();
    let dmg = d.atk * D.BAL.petDps * U.rand(0.85, 1.15) * dmgBuffMult();
    m.hp -= dmg;
    if (scene()) scene().onPetHit(dmg);
    if (m.hp <= 0) killMonster();
  }

  // summon a zone's boss once enough kills are banked
  function summonBoss(zoneId) {
    const z = D.ZONE_BY_ID[zoneId];
    const b = D.BOSSES[zoneId];
    if (!z || !b || combat.recover > 0) return false;
    if ((S().boss.progress[zoneId] || 0) < D.BAL.bossKillsNeeded) return false;
    if (S().zoneId !== zoneId) setZone(zoneId);
    S().boss.progress[zoneId] = 0;
    // a conquered boss comes back angrier: the Nightmare form
    const nightmare = (S().boss.kills[zoneId] || 0) > 0;
    const effLvl = z.level + (nightmare ? D.BAL.nightmareLevels : 0);
    const hpMax = D.BAL.monsterHp(effLvl) * D.BAL.bossHpMult;
    combat.monster = {
      sp: { shape: b.shape, hue: b.hue, size: b.size * (nightmare ? 1.08 : 1) },
      bossZone: zoneId,
      nightmare,
      name: (nightmare ? 'Nightmare ' : '') + b.name,
      hp: hpMax, hpMax,
      dmg: D.BAL.monsterDmg(effLvl) * D.BAL.bossDmgMult,
      atkInt: D.BAL.bossAtkInterval,
      xp: D.BAL.xpKill(effLvl) * D.BAL.bossXpMult,
      gold: D.BAL.goldKill(effLvl) * D.BAL.bossGoldMult,
      zoneLevel: effLvl,
      age: 0, stun: 0,
    };
    combat.matkT = 1.8;
    ui().log(nightmare
      ? `<b>☠ Nightmare ${b.name}</b> remembers you. It has been practicing.`
      : `<b>☠ ${b.name}</b> — ${b.title} — steps out of the dark.`, 'death');
    GQ.audio.boss();
    if (scene()) { scene().onSpawn(combat.monster); scene().onBossStart((nightmare ? 'NIGHTMARE ' : '') + b.name); }
    ui().markDirty('zones');
    return true;
  }

  function heroDown() {
    const killer = combat.monster ? combat.monster.name : 'wilderness';
    if (combat.trial) {
      ui().log('The judges wince.', 'death');
      endTrial();
    }
    if (combat.monster && combat.monster.bossZone) {
      // the boss retreats; the attempt is not wasted
      S().boss.progress[combat.monster.bossZone] = D.BAL.bossKillsNeeded;
      ui().log(`${combat.monster.name} lets you live. Out of pity.`, 'sys');
      ui().markDirty('zones');
    }
    if (S().challenge === 'deathmarch') {
      S().challenge = null;
      GQ.state.recalc();
      ui().toast('💀 The Deathmarch ends where you fell.', 'r5', 5);
      ui().log('<b>💀 Deathmarch failed.</b> One KO was the whole rule. The Relic remains unclaimed.', 'death');
      ui().markDirty('char', 'zonehdr');
    }
    if (S().zoneId === 'depth' && S().depth.kills > 0) {
      if (S().shop.insurance > 0) {
        ui().log('The Depths reach for your progress. Your <b>Bureau Insurance</b> clears its throat. Progress kept.', 'sys');
      } else {
        S().depth.kills = 0;
        ui().log('The Depths keep what they take. Floor progress lost.', 'death');
      }
      ui().markDirty('zones');
    }
    combat.streak = 0;
    S().hero.hp = 0;
    S().stats.deaths++;
    combat.recover = GQ.state.recoverTime();
    combat.recoverMax = combat.recover;
    combat.monster = null;
    combat.respawn = D.BAL.respawnTime;
    GQ.audio.ko();
    if (scene()) scene().onHeroDown();
    ui().log(`You were knocked out by the ${killer}. Recovering...`, 'death');
    const z = zone();
    const ratio = GQ.state.power(drv(), z.level) / D.refPower(z);
    if (ratio < 0.35) {
      ui().log(`${z.name} expects around <b>${U.fmt(D.refPower(z))}</b> Power. You have <b>${U.fmt(GQ.state.power(drv(), z.level))}</b>. The math is not on your side yet.`, 'sys');
    }
    ui().markDirty('char');
  }

  function killMonster() {
    const m = combat.monster;
    const d = drv();
    const z = zone();
    const L = S().hero.level;

    // trial kills count for exactly one thing: the score
    if (m.trial && combat.trial) {
      combat.trial.kills++;
      if (scene()) scene().onKill(m, 0);
      GQ.audio.kill();
      combat.monster = null;
      combat.respawn = 0.15;
      return;
    }

    S().stats.kills++;
    combat.streak = (combat.streak || 0) + 1;
    if (m.elite) S().stats.eliteKills = (S().stats.eliteKills || 0) + 1;
    const kz = (S().stats.killsByZone[z.id] || 0) + 1;
    S().stats.killsByZone[z.id] = kz;

    // bestiary: field notes per species (bosses excluded)
    if (!m.bossZone && m.sp.name) {
      const sp = m.sp.name;
      const kbs = S().stats.killsBySpecies;
      kbs[sp] = (kbs[sp] || 0) + 1;
      const tier = GQ.state.bestiaryTier(sp);
      const paid = S().stats.bestiaryPaid[sp] || 0;
      if (tier > paid) {
        S().stats.bestiaryPaid[sp] = tier;
        const shards = D.BAL.bestiaryShards[tier - 1];
        S().hero.shards += shards;
        S().stats.shardsEarned += shards;
        ui().toast(`📖 Bestiary tier ${['I', 'II', 'III'][tier - 1]}: <b>${sp}</b> (+${shards} shards${tier >= 3 ? ', +5% damage vs them' : ''})`, 'gold');
        ui().log(`<b>📖 Bestiary:</b> ${sp} — tier ${tier}. ${tier >= 3 ? 'You know exactly where to hit them now.' : 'Notes updated.'}`, 'level');
        GQ.audio.quest();
        ui().markDirty('res', 'records');
      }
    }

    // anomaly chest progress
    if (z.id === 'anomaly' && S().anomaly) {
      S().anomaly.kills++;
      ui().markDirty('zones');
      if (S().anomaly.kills >= D.BAL.anomalyKills) {
        completeAnomaly();
      }
    }

    // the Depths: floors clear at 25 kills, each floor 3 levels deeper
    if (z.id === 'depth') {
      S().depth.kills++;
      if (S().depth.kills >= D.BAL.depthKills) {
        const n = S().depth.current;
        const shards = Math.round(20 * (1 + n / 2));
        S().hero.shards += shards;
        S().stats.shardsEarned += shards;
        let emberNote = '';
        if (n > S().depth.best) {
          S().depth.best = n;
          S().asc.embers += 1;
          S().asc.lifetime += 1;
          emberNote = ', +1 🔥 ember';
        }
        S().depth.current = n + 1;
        S().depth.kills = 0;
        ui().toast(`⬇ Depth ${n} cleared! (+${shards} shards${emberNote})`, 'gold', 4.5);
        ui().log(`<b>Depth ${n} cleared.</b> The next floor is ${D.BAL.depthStep} levels deeper. It knows you're coming.`, 'level');
        GQ.audio.conquer();
        ui().markDirty('zones', 'records', 'res', 'zonehdr');
      }
    }

    // regular kills bank progress toward the zone boss
    if (!m.bossZone && D.BOSSES[z.id]) {
      const bp = S().boss.progress[z.id] || 0;
      if (bp < D.BAL.bossKillsNeeded) {
        S().boss.progress[z.id] = bp + 1;
        if (bp + 1 === D.BAL.bossKillsNeeded) {
          ui().toast(`☠ <b>${D.BOSSES[z.id].name}</b> can now be challenged!`, 'gold');
          ui().log(`<b>${D.BOSSES[z.id].name}</b> has noticed you. Challenge available in ${z.name}.`, 'sys');
          ui().markDirty('zones');
        }
      }
    }

    // zone mastery tier crossed?
    if (D.BAL.masteryTiers.includes(kz)) {
      GQ.state.recalc();
      const tier = D.masteryTierCount(kz);
      ui().toast(`Zone Mastery ${['I', 'II', 'III'][tier - 1]}: <b>${z.name}</b> (+1% damage, forever)`, 'gold');
      ui().log(`<b>Mastery:</b> ${z.name} tier ${tier}. Permanent +1% damage.`, 'level');
      ui().markDirty('char', 'zones');
    }

    const em = eventMods(z.id);
    const gm = zoneMods(z);

    // gold
    const gold = Math.round(m.gold * U.rand(0.8, 1.25) * (1 + d.gold / 100) * (em.gold || 1) * (gm.goldM || 1));
    S().hero.gold += gold;
    S().stats.goldEarned += gold;

    // xp (the Long Dark starves it)
    const xpGain = m.xp * (1 + d.xp / 100) * D.grayMult(L, z.level) * (em.xp || 1) * (gm.xpM || 1)
      * (S().challenge === 'dark' ? 0.25 : 1);
    addXp(xpGain);

    if (m.bossZone) {
      bossRewards(m, z, d);
    } else {
      // loot: rare rolls with a pity floor; elites always pay out
      S().stats.pity = (S().stats.pity || 0) + 1;
      const famine = S().challenge === 'famine';
      const dropped = !famine && (m.elite || gm.dropSure ||
        Math.random() < D.BAL.dropChance * (1 + d.loot / 100) * (em.drop || 1) ||
        S().stats.pity >= D.BAL.pityKills);
      if (dropped) {
        S().stats.pity = 0;
        dropItem(z, d);
      }
      // named zone treasure
      if (!famine && Math.random() < D.BAL.uniqueChance * (1 + d.loot / 100) * (em.uniq || 1)) {
        dropUnique(z);
      }
      if (Math.random() < D.BAL.shardDropChance) {
        const n = Math.max(1, Math.round(U.rand(1, 2.5) * (1 + z.level / 15)));
        S().hero.shards += n;
        S().stats.shardsEarned += n;
        ui().log(`Found <b style="color:#bda1ff">${n} Arcane Shard${n > 1 ? 's' : ''}</b>.`, 'dim');
        ui().markDirty('res');
      }
      // a caught goblin empties its pockets
      if (m.goblin) {
        dropItem(z, d);
        dropItem(z, d);
        const n = Math.round(5 + z.level / 4);
        S().hero.shards += n;
        S().stats.shardsEarned += n;
        S().stats.goblins = (S().stats.goblins || 0) + 1;
        ui().toast('💰 Loot Goblin caught! Its pockets were deep.', 'gold');
        ui().log(`<b>💰 Loot Goblin caught:</b> two items and ${n} shards spill out.`, 'level');
        GQ.audio.drop(3);
      }
    }

    questEvent('kill', 1, { zone: z.id, elite: !!m.elite });
    questEvent('gold', gold);
    GQ.audio.kill();
    if (scene()) scene().onKill(m, gold);
    combat.monster = null;
    combat.respawn = D.BAL.respawnTime * (em.respawn != null ? em.respawn : 1);
    ui().markDirty('res');
  }

  function bossRewards(m, z, d) {
    const bz = m.bossZone;
    const first = !(S().boss.kills[bz] > 0);
    S().boss.kills[bz] = (S().boss.kills[bz] || 0) + 1;

    // guaranteed spoils: legendary floor on first conquest, rare floor after;
    // nightmares pay an epic floor and lean hard into sets and uniques
    const nm = !!m.nightmare;
    const floor = first ? 4 : nm ? 3 : 2;
    const ilvlBonus = nm ? 2 + D.BAL.nightmareLevels : 2;
    const rar = Math.max(floor, GQ.items.rollRarity(d.loot));
    const item = Math.random() < (nm ? D.BAL.nightmareSetChance : D.BAL.bossSetChance)
      ? GQ.items.generateSetPiece(z.level + ilvlBonus, d.loot, rar)
      : GQ.items.generateItem(z.level + ilvlBonus, d.loot, rar);
    S().stats.itemsFound++;
    if (item.rar > S().stats.bestRarity) S().stats.bestRarity = item.rar;
    const nameHtml = `<span class="rc${item.rar}">[${U.esc(item.name)}]</span>`;
    if (S().hero.inventory.length >= GQ.state.invCap()) {
      const sv = GQ.items.salvageValue(item);
      S().hero.gold += sv.gold;
      S().hero.shards += sv.shards;
      ui().log(`Bag full! Boss spoils ${nameHtml} were salvaged.`, 'salv');
    } else {
      S().hero.inventory.push(item);
      ui().log(`Boss spoils: ${nameHtml}`, 'dim');
      questEvent('item', 1);
      ui().markDirty('inv');
    }
    ui().toast(`${D.RARITIES[item.rar].name} spoils! <span class="rc${item.rar}">${U.esc(item.name)}</span>`, 'r' + item.rar);
    if (scene()) scene().onDrop(item.rar);
    if (Math.random() < (nm ? D.BAL.nightmareUniqueChance : D.BAL.bossUniqueChance)) dropUnique(z);

    // first Nightmare kill of each boss: another permanent notch
    if (nm && !S().boss.nightmares[bz]) {
      S().boss.nightmares[bz] = 1;
      GQ.state.recalc();
      ui().toast(`🌑 NIGHTMARE CONQUERED: <b>${D.BOSSES[bz].name}</b> — permanent +2% damage`, 'gold', 5.5);
      ui().log(`<b>🌑 The Nightmare breaks.</b> ${D.BOSSES[bz].name} will not sleep well either. Permanent +2% damage.`, 'level');
      GQ.audio.conquer();
    } else if (nm) {
      S().boss.nightmares[bz]++;
    }

    if (first) {
      GQ.state.recalc();
      ui().toast(`⚔ ZONE CONQUERED: <b>${z.name}</b> — permanent +2% damage`, 'gold', 5.5);
      ui().log(`<b>${D.BOSSES[bz].name} falls.</b> ${z.name} conquered. Permanent +2% damage.`, 'level');
      GQ.audio.conquer();
      if (bz === 'rift') {
        ui().log('<b>The Depths are open.</b> Below the Rift, the grind continues. Look at the bottom of your zone list.', 'sys');
        ui().toast('🌌 The seal is broken. Four lands beyond the Rift are open.', 'gold', 6);
        ui().log('<b>🌌 The Beyond unseals.</b> The Far Shore, the Clockwork Waste, the Garden of Teeth, and a Throne that should not still hum.', 'level');
      }
      if (bz === 'throne') {
        ui().toast('🗼 THE ASCENDANT SPIRE APPEARS. Corruption doubles every floor. Bring lifetimes.', 'gold', 7);
        ui().log('<b>🗼 The Ascendant Spire tears upward through everything.</b> Six floors of stacking Corruption. Gear will not carry you up there — ascensions will. Spire bosses pay 10 embers each.', 'level');
      }
      if (GQ.state.conqueredCount() >= Object.keys(D.BOSSES).length) {
        ui().completionModal();
      }
    } else {
      ui().log(`<b>${D.BOSSES[bz].name}</b> defeated again. It is getting embarrassing for them.`, 'level');
      GQ.audio.conquer();
    }
    // challenge goals that count bosses
    if (S().challenge) {
      S().challengeProg.bosses = (S().challengeProg.bosses || 0) + 1;
      checkChallenge();
    }

    // a boss sometimes drops a smaller, friendlier version of itself
    if (D.COMPANIONS[bz] && !S().pets.owned[bz]) {
      const kills = S().boss.kills[bz] || 0;
      if (Math.random() < D.BAL.petDropChance || kills >= D.BAL.petPityKills) {
        S().pets.owned[bz] = true;
        const pet = D.COMPANIONS[bz];
        if (!S().pets.active) S().pets.active = bz;
        GQ.state.recalc();
        ui().toast(`🐾 <b>${pet.name}</b> joins you! (${pet.perkDesc})`, 'gold', 5.5);
        ui().log(`<b>🐾 A companion:</b> ${pet.name}, a much smaller ${D.BOSSES[bz].name}, decides you are its problem now. ${pet.perkDesc}.`, 'level');
        GQ.audio.conquer();
        ui().markDirty('char', 'records');
      }
    }
    questEvent('boss', 1, { zone: bz });
    ui().markDirty('char', 'zones', 'records');
  }

  function dropItem(z, d) {
    // Magpie's set: drops arrive one item level higher
    const ilvl = Math.max(1, z.level + U.randInt(-1, 2) + (GQ.state.hasSet('magpie') ? 1 : 0));
    // side paths like the Bazaar sweeten the loot tables
    const lootEff = d.loot + (zoneMods(z).lootB || 0);
    const rar = GQ.items.rollRarity(lootEff);
    const item = (rar >= 2 && Math.random() < D.BAL.setChance)
      ? GQ.items.generateSetPiece(ilvl, lootEff, rar)
      : GQ.items.generateItem(ilvl, lootEff, rar);
    S().stats.itemsFound++;
    if (item.rar > S().stats.bestRarity) S().stats.bestRarity = item.rar;
    const rInfo = D.RARITIES[item.rar];
    const nameHtml = `<span class="rc${item.rar}">[${U.esc(item.name)}]</span>`;

    if (item.rar <= S().settings.autoSalvage && !item.set) {
      const sv = GQ.items.salvageValue(item);
      S().hero.gold += sv.gold;
      S().hero.shards += sv.shards;
      S().stats.goldEarned += sv.gold;
      S().stats.shardsEarned += sv.shards;
      S().stats.itemsSalvaged++;
      ui().log(`Auto-salvaged ${nameHtml} (+${U.fmt(sv.gold)} gold, +${sv.shards} shards)`, 'salv');
    } else if (S().hero.inventory.length >= GQ.state.invCap()) {
      const sv = GQ.items.salvageValue(item);
      S().hero.gold += sv.gold;
      S().hero.shards += sv.shards;
      ui().log(`Bag full! ${nameHtml} was salvaged automatically.`, 'salv');
    } else {
      S().hero.inventory.push(item);
      ui().log(`Loot: ${nameHtml} <span style="color:var(--faint)">iLv ${item.ilvl}</span>`, 'dim');
      ui().markDirty('inv');
    }
    if (item.rar >= 3) {
      ui().toast(`${rInfo.name} drop! <span class="rc${item.rar}">${U.esc(item.name)}</span>`, 'r' + item.rar);
    }
    questEvent('item', 1);
    GQ.audio.drop(item.rar);
    if (scene()) scene().onDrop(item.rar);
  }

  function dropUnique(z) {
    const item = GQ.items.generateUnique(z.id, z.level);
    if (!item) return;
    const first = !S().stats.uniquesFound[item.uni];
    S().stats.uniquesFound[item.uni] = true;
    S().stats.itemsFound++;
    if (S().stats.bestRarity < 6) S().stats.bestRarity = 6;
    // a unique never gets lost to a full bag
    S().hero.inventory.push(item);
    ui().log(`<b>✦ UNIQUE:</b> <span class="rc6">[${U.esc(item.name)}]</span>${first ? ' — discovered!' : ''}`, 'level');
    ui().toast(`✦ Unique found: <span class="rc6">${U.esc(item.name)}</span>`, 'r6', 5);
    if (first) GQ.state.recalc(); // collection grants permanent loot find
    GQ.audio.drop(6);
    ui().markDirty('inv', 'zones', 'records');
    if (scene()) scene().onDrop(6);
  }

  function addXp(amount) {
    const h = S().hero;
    h.xp += amount;
    let leveled = false;
    while (h.xp >= D.BAL.xpNext(h.level)) {
      h.xp -= D.BAL.xpNext(h.level);
      h.level++;
      leveled = true;
    }
    if (leveled) {
      GQ.state.recalc();
      h.hp = Math.min(GQ.state.drv.hpMax, h.hp + GQ.state.drv.hpMax * 0.35);
      ui().log(`<b>Level up!</b> You are now level ${h.level}.`, 'level');
      ui().toast(`⬆ Level ${h.level}!`, 'gold');
      GQ.audio.level();
      if (scene()) scene().onLevelUp();
      questEvent('level', h.level);
      if (S().challenge) checkChallenge();
      if (GQ.state.talentPointsAvailable() > 0 && D.TALENT_TIERS.some(t => t.lvl === h.level)) {
        ui().toast('🎯 Talent point available!', 'gold');
        ui().log('<b>🎯 Talent point available.</b> The button in your character panel is glowing on purpose.', 'sys');
      }
      ui().markDirty('char', 'zones');
    }
  }

  function setZone(id, silent) {
    if (combat.trial) endTrial(); // walking out counts as finishing
    let z;
    if (id === 'depth') {
      if (!depthsUnlocked()) return false;
      z = depthZone(S().depth.current);
    } else if (id === 'anomaly') {
      if (!S().anomaly) return false;
      z = anomalyZone();
    } else {
      z = D.ZONE_BY_ID[id];
      if (z && !zoneOpen(z)) return false;
    }
    if (!z) return false;
    if (S().zoneId === id && !silent) return true;
    S().zoneId = id;
    combat.monster = null;
    combat.respawn = 0.8;
    combat.atkT = 0.4;
    if (!silent) ui().log(`Traveling to <b>${z.name}</b>.`, 'sys');
    if (scene()) scene().onZoneChange();
    ui().markDirty('zones', 'zonehdr');
    return true;
  }

  /* ---------- main tick ---------- */

  function tick(dt) {
    if (!S()) return;
    S().stats.time += dt;
    const d = drv();
    const h = S().hero;

    tickMeta(dt);

    // trial clock waits for no one
    if (combat.trial) {
      combat.trial.t -= dt;
      if (combat.trial.t <= 0) {
        endTrial();
        return;
      }
    }

    if (combat.recover > 0) {
      combat.recover -= dt;
      h.hp = Math.min(d.hpMax, h.hp + d.hpMax * dt / (combat.recoverMax || D.BAL.recoverTime));
      if (combat.recover <= 0) {
        h.hp = d.hpMax;
        ui().log('Back on your feet. The grind continues.', 'sys');
      }
      return;
    }

    // regen
    if (h.hp < d.hpMax) h.hp = Math.min(d.hpMax, h.hp + d.regen * dt);

    if (!combat.monster) {
      combat.respawn -= dt;
      if (combat.respawn <= 0) spawnMonster();
      return;
    }

    const m = combat.monster;
    // loot goblins do not stay for the whole conversation
    if (m.goblin) {
      m.fleeT -= dt;
      if (m.fleeT <= 0) {
        ui().log('💰 The Loot Goblin escapes, jingling contemptuously.', 'dim');
        combat.monster = null;
        combat.respawn = D.BAL.respawnTime;
        return;
      }
    }
    // boss enrage: the DPS check
    if (m.bossZone) {
      m.age += dt;
      if (!m.enraged && m.age > (m.nightmare ? D.BAL.nightmareEnrage : D.BAL.bossEnrage)) {
        m.enraged = true;
        m.dmg *= D.BAL.bossEnrageDmgMult;
        m.atkInt = Math.max(1.0, (m.atkInt || D.BAL.monsterAtkInterval) * 0.6);
        ui().log(`<b>${m.name} ENRAGES.</b> This is the DPS check.`, 'death');
        if (scene()) scene().addShake(10);
        GQ.audio.boss();
      }
    }

    // player attacks (haste buffs speed the swing timer)
    combat.atkT -= dt;
    const rate = d.rate * hasteBuffMult();
    let guard = 0;
    while (combat.atkT <= 0 && combat.monster && guard++ < 30) {
      playerAttack();
      combat.atkT += 1 / rate;
    }
    if (!combat.monster) return;

    // monster attacks (paused while stunned)
    if (m.stun > 0) {
      m.stun -= dt;
    } else {
      combat.matkT -= dt;
      guard = 0;
      while (combat.matkT <= 0 && combat.monster && combat.recover <= 0 && guard++ < 30) {
        monsterAttack();
        combat.matkT += (m.atkInt || D.BAL.monsterAtkInterval);
      }
    }
  }

  // cooldowns, buffs, autocast, quests, achievements
  function tickMeta(dt) {
    for (const k of Object.keys(combat.cds)) {
      if (combat.cds[k] > 0) combat.cds[k] = Math.max(0, combat.cds[k] - dt);
    }
    for (let i = combat.buffs.length - 1; i >= 0; i--) {
      combat.buffs[i].t -= dt;
      if (combat.buffs[i].t <= 0) combat.buffs.splice(i, 1);
    }
    if (combat.clickT > 0) combat.clickT -= dt;
    if (combat.momentumT > 0) {
      combat.momentumT -= dt;
      if (combat.momentumT <= 0) combat.momentum = 0;
    }
    // shinies: something on the battlefield begs to be clicked
    if (scene() && !document.hidden) {
      combat.shinyT -= dt;
      if (combat.shinyT <= 0 && !scene().hasShiny()) {
        scene().spawnShiny();
        combat.shinyT = U.rand(D.BAL.shinyGapMin, D.BAL.shinyGapMax);
      }
    }
    // the companion earns its keep (but not in trials — medals are yours alone)
    if (S().pets.active && combat.monster && !combat.trial && combat.recover <= 0) {
      combat.petT -= dt;
      if (combat.petT <= 0) {
        combat.petT = D.BAL.petInterval;
        petStrike();
      }
    }
    ensureContracts();
    if ((S().asc.up.auto || 0) > 0 && S().settings.autocast) {
      combat.autoT -= dt;
      if (combat.autoT <= 0) {
        combat.autoT = 0.6;
        const abs = abilities();
        for (let i = 0; i < abs.length; i++) {
          const ab = abs[i];
          if ((combat.cds[ab.key] || 0) > 0) continue;
          if (ab.kind === 'heal' && S().hero.hp > drv().hpMax * 0.6) continue;
          if ((ab.kind === 'strike' || ab.kind === 'stun') && !combat.monster) continue;
          if (cast(i)) break;
        }
      }
    }
    ensureQuests();
    tickEvents();
    tickAnomalies();
    combat.achT += dt;
    if (combat.achT > 2) {
      combat.achT = 0;
      checkAchievements();
      if (S().challenge) checkChallenge();
    }
  }

  /* ---------- the Proving Grounds ---------- */

  function startTrial(i) {
    const def = D.TRIALS[i];
    if (!def || combat.trial || combat.recover > 0) return false;
    if (def.conq && GQ.state.conqueredCount() < def.conq) return false;
    combat.trial = { i, t: def.time || D.BAL.trialTime, kills: 0, prevZone: S().zoneId };
    S().zoneId = 'trial';
    combat.monster = null;
    combat.respawn = 0.5;
    combat.atkT = 0.3;
    ui().log(`<b>⚔ ${def.name} begins.</b> ${def.time || D.BAL.trialTime} seconds. Impress the judges.`, 'sys');
    GQ.audio.boss();
    if (scene()) { scene().onZoneChange(); scene().onBossStart(def.name); }
    ui().markDirty('zones', 'zonehdr');
    return true;
  }

  function endTrial() {
    const t = combat.trial;
    if (!t) return;
    combat.trial = null;
    combat.monster = null;
    combat.respawn = 0.8;
    S().zoneId = (t.prevZone && t.prevZone !== 'trial') ? t.prevZone : 'meadow';
    const def = D.TRIALS[t.i];
    const prevBest = S().trials[def.key] || 0;

    // one-time medal purses for thresholds crossed for the first time
    const rewards = [];
    def.medals.forEach((need, mi) => {
      if (t.kills >= need && prevBest < need) {
        const gold = Math.round(D.BAL.goldKill(def.lvl) * [120, 320, 800][mi]);
        const shards = [15, 40, 100][mi];
        S().hero.gold += gold;
        S().hero.shards += shards;
        S().stats.goldEarned += gold;
        S().stats.shardsEarned += shards;
        let embers = 0;
        if (mi === 2) {
          embers = 2;
          S().asc.embers += embers;
          S().asc.lifetime += embers;
        }
        rewards.push({ tier: mi, gold, shards, embers });
      }
    });
    if (t.kills > prevBest) S().trials[def.key] = t.kills;
    ui().log(`<b>${def.name} over:</b> ${t.kills} ${def.rush ? 'bosses felled' : 'kills'} in ${def.time || D.BAL.trialTime}s${t.kills > prevBest ? ' — new record' : ''}.`, 'level');
    GQ.audio.conquer();
    ui().trialResults(def, t.kills, prevBest, rewards);
    ui().markDirty('zones', 'zonehdr', 'res', 'records');
    if (scene()) scene().onZoneChange();
    GQ.state.save();
  }

  /* ---------- anomalies ---------- */

  function tickAnomalies() {
    const s = S();
    const now = s.stats.time;
    if (s.anomaly && now >= s.anomaly.until) {
      const def = D.ANOMALIES.find(x => x.key === s.anomaly.key);
      const host = s.anomaly.host;
      const inside = s.zoneId === 'anomaly';
      s.anomaly = null;
      s.anomalyNext = now + U.rand(D.BAL.anomalyGapMin, D.BAL.anomalyGapMax);
      if (def) ui().log(`${def.icon} The ${def.name} collapses${inside ? ' around you' : ''}. Nothing personal.`, 'dim');
      if (inside) setZone(host, true);
      ui().markDirty('zones');
    }
    if (!s.anomaly && now >= s.anomalyNext) {
      const L = s.hero.level;
      const hosts = D.ZONES.filter(z => !z.side && zoneOpen(z) && z.level <= L + 6);
      const host = U.pick(hosts.length ? hosts : [D.ZONES[0]]);
      const def = U.pick(D.ANOMALIES);
      s.anomaly = { key: def.key, host: host.id, until: now + D.BAL.anomalyDuration, kills: 0 };
      ui().toast(`${def.icon} <b>${def.name}</b> has opened in ${host.name}! (10:00)`, 'gold', 6);
      ui().log(`${def.icon} <b>A ${def.name} has opened in ${host.name}.</b> ${def.desc} ${D.BAL.anomalyKills} kills to the chest.`, 'sys');
      GQ.audio.quest();
      ui().markDirty('zones');
    }
  }

  function grantChestItem(item) {
    S().stats.itemsFound++;
    if (item.rar > S().stats.bestRarity) S().stats.bestRarity = item.rar;
    const nameHtml = `<span class="rc${item.rar}">[${U.esc(item.name)}]</span>`;
    if (S().hero.inventory.length >= GQ.state.invCap()) {
      const sv = GQ.items.salvageValue(item);
      S().hero.gold += sv.gold;
      S().hero.shards += sv.shards;
      return nameHtml + ' (bag full, salvaged)';
    }
    S().hero.inventory.push(item);
    questEvent('item', 1);
    return nameHtml;
  }

  function completeAnomaly() {
    const a = S().anomaly;
    if (!a) return;
    const def = D.ANOMALIES.find(x => x.key === a.key);
    const az = anomalyZone();
    const d = drv();
    let msg = '';
    if (def.reward === 'gold') {
      const g = Math.round(D.BAL.goldKill(az.level) * 400 * (1 + d.gold / 100));
      S().hero.gold += g;
      S().stats.goldEarned += g;
      msg = `<b style="color:var(--gold)">${U.fmt(g)} gold</b>`;
    } else if (def.reward === 'shards') {
      const n = Math.round(30 + az.level * 1.5);
      S().hero.shards += n;
      S().stats.shardsEarned += n;
      msg = `<b style="color:#bda1ff">${n} Arcane Shards</b>`;
    } else if (def.reward === 'items') {
      const a1 = grantChestItem(GQ.items.generateItem(az.level, d.loot, Math.max(2, GQ.items.rollRarity(d.loot))));
      const a2 = grantChestItem(GQ.items.generateItem(az.level, d.loot, Math.max(2, GQ.items.rollRarity(d.loot))));
      msg = a1 + ' and ' + a2;
    } else if (def.reward === 'xp') {
      const x = Math.round(D.BAL.xpNext(S().hero.level) * 0.4);
      msg = `<b style="color:var(--xp2)">${U.fmt(x)} XP</b>`;
      addXp(x);
    } else if (def.reward === 'set') {
      msg = grantChestItem(GQ.items.generateSetPiece(az.level, d.loot));
    }
    S().stats.anomalies = (S().stats.anomalies || 0) + 1;
    questEvent('anomaly', 1);
    const host = a.host;
    S().anomaly = null;
    S().anomalyNext = S().stats.time + U.rand(D.BAL.anomalyGapMin, D.BAL.anomalyGapMax);
    ui().toast(`${def.icon} ${def.name} cracked open!`, 'gold', 5);
    ui().log(`<b>${def.icon} Chest:</b> ${msg}. The anomaly collapses behind you, satisfied.`, 'level');
    GQ.audio.conquer();
    setZone(host, true);
    ui().markDirty('zones', 'res', 'inv', 'records');
  }

  /* ---------- Griselda's repeatables ---------- */

  function drumsPrice() {
    const z = currentZone();
    return Math.round(D.BAL.goldKill(z.level) * 90);
  }

  function warDrums() {
    const z = currentZone();
    if (!D.BOSSES[z.id]) return false;
    if ((S().boss.progress[z.id] || 0) >= D.BAL.bossKillsNeeded) return false;
    const price = drumsPrice();
    if (S().hero.gold < price) return false;
    S().hero.gold -= price;
    S().boss.progress[z.id] = D.BAL.bossKillsNeeded;
    ui().log(`The drums roll. <b>${D.BOSSES[z.id].name}</b> is now available, and furious about the noise.`, 'sys');
    ui().toast(`🥁 ${D.BOSSES[z.id].name} awaits!`, 'gold');
    GQ.audio.boss();
    ui().markDirty('zones', 'res');
    return true;
  }

  function bellPrice() {
    return Math.round(D.BAL.goldKill(S().hero.level) * 150);
  }

  function stormBell() {
    const price = bellPrice();
    if (S().hero.gold < price) return false;
    S().hero.gold -= price;
    const def = U.pick(D.EVENTS);
    S().event = { key: def.key, zoneId: S().zoneId, until: S().stats.time + D.BAL.eventDuration };
    S().eventNext = S().event.until + U.rand(D.BAL.eventGapMin, D.BAL.eventGapMax);
    ui().toast(`🔔 ${def.icon} <b>${def.name}</b> answers the bell! (5:00)`, 'gold', 5);
    ui().log(`🔔 The bell tolls. ${def.icon} <b>${def.name}</b> rolls in over ${currentZone().name}: ${def.desc}`, 'sys');
    GQ.audio.quest();
    ui().markDirty('zones', 'zonehdr', 'res');
    return true;
  }

  /* ---------- world events ---------- */

  function tickEvents() {
    const s = S();
    const now = s.stats.time;
    if (s.event && now >= s.event.until) {
      const def = D.EVENTS.find(e => e.key === s.event.key);
      const zn = D.ZONE_BY_ID[s.event.zoneId];
      if (def && zn) ui().log(`${def.icon} The ${def.name} over ${zn.name} fades.`, 'dim');
      s.event = null;
      s.eventNext = now + U.rand(D.BAL.eventGapMin, D.BAL.eventGapMax);
      ui().markDirty('zones', 'zonehdr');
    }
    if (!s.event && now >= s.eventNext) {
      const L = s.hero.level;
      // events land somewhere relevant to the player's reach
      const candidates = D.ZONES.filter(z => zoneOpen(z) && z.level <= L + 8);
      const z = U.pick(candidates.length ? candidates : [D.ZONES[0]]);
      const def = U.pick(D.EVENTS);
      s.event = { key: def.key, zoneId: z.id, until: now + D.BAL.eventDuration };
      ui().toast(`${def.icon} <b>${def.name}</b> over ${z.name}! (5:00)`, 'gold', 5);
      ui().log(`${def.icon} <b>${def.name}</b> erupts over <b>${z.name}</b>: ${def.desc}`, 'sys');
      GQ.audio.quest();
      ui().markDirty('zones', 'zonehdr');
    }
  }

  /* ---------- quests ---------- */

  function genQuest() {
    const L = S().hero.level;
    const z = zone();
    const type = U.weightedPick([
      { v: 'kills', w: 3 }, { v: 'killsZone', w: 3 }, { v: 'elites', w: 2 },
      { v: 'items', w: 2 }, { v: 'salvage', w: 2 }, { v: 'gold', w: 2 },
      { v: 'enhance', w: 1 }, { v: 'boss', w: 1.5 },
    ]);
    const q = {
      id: U.uid(), type, have: 0,
      reward: {
        gold: Math.round(D.BAL.goldKill(L) * U.rand(60, 120)),
        shards: Math.round(8 + L * 0.5),
        xp: Math.round(D.BAL.xpNext(L) * 0.18),
      },
    };
    switch (type) {
      case 'kills': q.need = 30 + U.randInt(1, 4) * 10; q.desc = `Slay ${q.need} monsters`; break;
      case 'killsZone': q.zone = z.id; q.need = 25 + U.randInt(0, 3) * 5; q.desc = `Slay ${q.need} monsters in ${z.name}`; break;
      case 'elites': q.need = U.randInt(3, 6); q.desc = `Defeat ${q.need} elites`; break;
      case 'items': q.need = U.randInt(3, 6); q.desc = `Find ${q.need} pieces of equipment`; break;
      case 'salvage': q.need = U.randInt(4, 8); q.desc = `Salvage ${q.need} items`; break;
      case 'gold': q.need = Math.round(D.BAL.goldKill(L) * 220); q.desc = `Earn ${U.fmt(q.need)} gold`; break;
      case 'enhance': q.need = U.randInt(2, 3); q.desc = `Enhance equipment ${q.need} times`; break;
      case 'boss': {
        const opts = D.ZONES.filter(zz => D.BOSSES[zz.id] && zoneOpen(zz) && zz.level <= L + 6);
        const bz = U.pick(opts.length ? opts : [D.ZONES[0]]);
        q.zone = bz.id; q.need = 1;
        q.desc = `Defeat ${D.BOSSES[bz.id].name} in ${bz.name}`;
        q.reward.shards *= 2;
        q.reward.gold *= 2;
        break;
      }
    }
    return q;
  }

  function makeChainQuest(idx) {
    const def = D.STARTER_QUESTS[idx];
    const L = S().hero.level;
    const q = {
      id: U.uid(), type: def.type, need: def.need, have: 0,
      desc: def.desc, chain: true,
      reward: {
        gold: Math.round(D.BAL.goldKill(L) * 90),
        shards: Math.round(12 + L),
        xp: Math.round(D.BAL.xpNext(L) * 0.22),
      },
    };
    if (def.zone) q.zone = def.zone;
    if (def.type === 'level') q.have = L;
    return q;
  }

  function ensureQuests() {
    const qs = S().quests;
    let changed = false;
    // the authored onboarding chain comes first, one link at a time
    const chainIdx = S().questChain || 0;
    if (chainIdx < D.STARTER_QUESTS.length && !qs.some(q => q.chain)) {
      qs.unshift(makeChainQuest(chainIdx));
      changed = true;
    }
    while (qs.length < 3) { qs.push(genQuest()); changed = true; }
    if (changed) ui().markDirty('quests');
  }

  function questEvent(type, n, meta) {
    const qs = S() && S().quests;
    if (!qs || !qs.length) return;
    let touched = false;
    for (let i = qs.length - 1; i >= 0; i--) {
      const q = qs[i];
      let inc = 0;
      if (type === 'kill') {
        if (q.type === 'kills') inc = n;
        else if (q.type === 'killsZone' && meta && meta.zone === q.zone) inc = n;
        else if (q.type === 'elites' && meta && meta.elite) inc = n;
      }
      else if (type === 'item' && q.type === 'items') inc = n;
      else if (type === 'salvage' && q.type === 'salvage') inc = n;
      else if (type === 'gold' && q.type === 'gold') inc = n;
      else if (type === 'enhance' && q.type === 'enhance') inc = n;
      else if (type === 'boss' && q.type === 'boss' && meta && meta.zone === q.zone) inc = n;
      else if (type === 'level' && q.type === 'level') {
        // level quests track the level itself, not a count
        if (n > q.have) { q.have = Math.min(q.need, n); touched = true; }
        if (q.have >= q.need) completeQuest(i);
        continue;
      }
      if (!inc) continue;
      q.have = Math.min(q.need, q.have + inc);
      touched = true;
      if (q.have >= q.need) completeQuest(i);
    }
    if (touched) ui().markDirty('quests');
    contractEvent(type, n, meta);
  }

  function completeQuest(idx) {
    const q = S().quests[idx];
    S().quests.splice(idx, 1);
    if (q.chain) S().questChain = (S().questChain || 0) + 1;
    S().hero.gold += q.reward.gold;
    S().hero.shards += q.reward.shards;
    S().stats.goldEarned += q.reward.gold;
    S().stats.shardsEarned += q.reward.shards;
    ui().log(`<b>📜 Quest complete:</b> ${q.desc} <span style="color:var(--faint)">(+${U.fmt(q.reward.gold)} gold, +${q.reward.shards} shards, +${U.fmt(q.reward.xp)} XP)</span>`, 'level');
    ui().toast(`📜 Quest complete: ${q.desc}`, 'gold');
    GQ.audio.quest();
    if (!q.chain) S().quests.push(genQuest()); // the chain refills itself via ensureQuests
    ui().markDirty('quests', 'res');
    addXp(q.reward.xp);
  }

  /* ---------- challenge runs ---------- */

  function checkChallenge() {
    const key = S().challenge;
    if (!key) return;
    const def = D.CHALLENGES.find(c => c.key === key);
    if (!def) { S().challenge = null; return; }
    const met = def.goalType === 'level'
      ? S().hero.level >= def.goalN
      : (S().challengeProg.bosses || 0) >= def.goalN;
    if (!met) return;
    S().challenge = null;
    S().relics[def.relic.key] = true;
    GQ.state.recalc();
    ui().toast(`${def.relic.icon} RELIC EARNED: <b>${def.relic.name}</b> — ${def.relic.desc}`, 'gold', 6);
    ui().log(`<b>${def.icon} ${def.name} — complete.</b> The restriction lifts. You keep ${def.relic.icon} <b>${def.relic.name}</b> (${def.relic.desc}). The run continues, unshackled.`, 'level');
    GQ.audio.ascend();
    if (scene()) scene().onLevelUp();
    ui().markDirty('char', 'zones', 'zonehdr', 'records');
    GQ.state.save();
  }

  /* ---------- Bureau Contracts: daily, real-time, ember-paying ---------- */

  function genContracts() {
    const L = S().hero.level;
    const pool = [
      { type: 'kills',   need: 250 + L * 6,                          desc: n => `Slay ${U.fmtInt(n)} monsters` },
      { type: 'elites',  need: Math.max(8, Math.round(15 + L / 2)),  desc: n => `Defeat ${n} elites` },
      { type: 'gold',    need: Math.round(D.BAL.goldKill(L) * 1500), desc: n => `Earn ${U.fmt(n)} gold` },
      { type: 'items',   need: 12,                                   desc: n => `Find ${n} pieces of equipment` },
      { type: 'boss',    need: L >= 12 ? 3 : 2,                      desc: n => `Defeat ${n} zone bosses` },
      { type: 'anomaly', need: 1,                                    desc: () => 'Loot an anomaly chest' },
    ];
    const picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picks.map(p => ({
      id: U.uid(), type: p.type, need: p.need, have: 0, done: false,
      desc: p.desc(p.need),
      reward: {
        gold: Math.round(D.BAL.goldKill(L) * U.rand(350, 500)),
        shards: Math.round(40 + L),
        embers: 1,
      },
    }));
  }

  function ensureContracts() {
    const c = S().contracts;
    const refreshMs = D.BAL.contractHours * 3600 * 1000;
    if (!c.stamp || Date.now() - c.stamp > refreshMs) {
      c.stamp = Date.now();
      c.list = genContracts();
      ui().log('<b>🏛️ New Bureau Contracts posted.</b> Three of them. The Bureau believes in you, contractually.', 'sys');
      ui().markDirty('quests');
    }
  }

  function contractEvent(type, n, meta) {
    const c = S().contracts;
    if (!c || !c.list || !c.list.length) return;
    let touched = false;
    for (const q of c.list) {
      if (q.done) continue;
      let inc = 0;
      if (type === 'kill') {
        if (q.type === 'kills') inc = n;
        else if (q.type === 'elites' && meta && meta.elite) inc = n;
      }
      else if (type === 'gold' && q.type === 'gold') inc = n;
      else if (type === 'item' && q.type === 'items') inc = n;
      else if (type === 'boss' && q.type === 'boss') inc = n;
      else if (type === 'anomaly' && q.type === 'anomaly') inc = n;
      if (!inc) continue;
      q.have = Math.min(q.need, q.have + inc);
      touched = true;
      if (q.have >= q.need && !q.done) {
        q.done = true;
        S().hero.gold += q.reward.gold;
        S().hero.shards += q.reward.shards;
        S().asc.embers += q.reward.embers;
        S().asc.lifetime += q.reward.embers;
        S().stats.goldEarned += q.reward.gold;
        S().stats.shardsEarned += q.reward.shards;
        S().stats.contracts = (S().stats.contracts || 0) + 1;
        ui().toast(`🏛️ Contract fulfilled: ${q.desc} (+${q.reward.embers} 🔥)`, 'gold', 5);
        ui().log(`<b>🏛️ Contract fulfilled:</b> ${q.desc} <span style="color:var(--faint)">(+${U.fmt(q.reward.gold)} gold, +${q.reward.shards} shards, +${q.reward.embers} 🔥)</span>`, 'level');
        GQ.audio.quest();
        ui().markDirty('res');
      }
    }
    if (touched) ui().markDirty('quests');
  }

  /* ---------- achievements ---------- */

  function checkAchievements() {
    const done = S().stats.achDone;
    for (const a of D.ACHIEVEMENTS) {
      if (done[a.key]) continue;
      let ok = false;
      try { ok = a.check(S()); } catch (e) { ok = false; }
      if (!ok) continue;
      done[a.key] = true;
      if (a.reward.shards) { S().hero.shards += a.reward.shards; S().stats.shardsEarned += a.reward.shards; }
      if (a.reward.gold) { S().hero.gold += a.reward.gold; S().stats.goldEarned += a.reward.gold; }
      ui().toast(`🏆 Achievement: <b>${a.name}</b>`, 'gold');
      ui().log(`<b>🏆 ${a.name}</b> — ${a.desc} (+${a.reward.shards || 0} shards)`, 'level');
      GQ.audio.quest();
      ui().markDirty('res', 'records');
    }
  }

  /* ---------- analytic rates (zone previews + offline) ---------- */

  function rates(zoneId) {
    const z = zoneId === 'depth' ? depthZone(S().depth.current)
      : zoneId === 'trial' ? trialZone(combat.trial ? combat.trial.i : 0)
      : zoneId === 'anomaly' ? anomalyZone()
      : D.ZONE_BY_ID[zoneId];
    const d = drv();
    const L = S().hero.level;
    const em = eventMods(zoneId);
    const zg = zoneMods(z);

    let hpAvg = 0, dmgAvg = 0, xpAvg = 0, goldAvg = 0;
    for (const sp of z.monsters) {
      hpAvg += D.BAL.monsterHp(z.level) * sp.hp;
      dmgAvg += D.BAL.monsterDmg(z.level) * sp.dmg;
      xpAvg += D.BAL.xpKill(z.level) * sp.xp;
      goldAvg += D.BAL.goldKill(z.level) * sp.gold;
    }
    const n = z.monsters.length;
    hpAvg /= n; dmgAvg /= n; xpAvg /= n; goldAvg /= n;
    // elites are part of the average diet (events can flood the menu)
    const eliteC = Math.min(0.6, D.BAL.eliteChance * (em.elite || 1));
    hpAvg *= (1 + eliteC * (D.BAL.eliteHp - 1)) * (zg.hpM || 1);
    dmgAvg *= (1 + eliteC * (D.BAL.eliteDmg - 1)) * (em.mdmg || 1) * (zg.mdmgM || 1);
    xpAvg *= (1 + eliteC * (D.BAL.eliteXp - 1)) * (em.xp || 1) * (zg.xpM || 1);
    goldAvg *= (1 + eliteC * (D.BAL.eliteGold - 1)) * (em.gold || 1) * (zg.goldM || 1);

    const activeKill = hpAvg / Math.max(1, d.dps * (zg.dmgM || 1));
    const killTime = activeKill + D.BAL.respawnTime;
    // monsters only deal damage while alive; respawn gaps are free healing time
    const dmgUptime = activeKill / killTime;
    const dr = Math.min(0.75, d.armor / (d.armor + D.BAL.armorK(z.level)));
    const incoming = (dmgAvg / D.BAL.monsterAtkInterval) * (1 - dr) * dmgUptime;
    const net = incoming - d.regen;

    let uptime = 1, danger = 'safe', ttd = Infinity;
    if (net > 0) {
      ttd = d.hpMax / net;
      if (ttd < 120) {
        const cycle = ttd + D.BAL.recoverTime;
        uptime = Math.max(0.1, ttd / cycle);
      }
      danger = ttd < 30 ? 'deadly' : ttd < 75 ? 'risky' : 'safe';
      // dead before your first kill lands: the zone gives you nothing
      if (ttd < activeKill) uptime = 0;
    }

    const gm = D.grayMult(L, z.level);
    if (gm < 0.999 && danger === 'safe') danger = 'trivial';

    const kps = uptime / killTime;
    return {
      kps,
      xps: kps * xpAvg * (1 + d.xp / 100) * gm,
      gps: kps * goldAvg * (1 + d.gold / 100),
      killTime, uptime, danger, ttd, grayMult: gm,
    };
  }

  /* ---------- offline progress ---------- */

  function offline(seconds) {
    seconds = Math.min(seconds, GQ.state.offlineCap());
    if (seconds < 30) return null;

    const report = {
      seconds, xp: 0, levels: 0, gold: 0, shards: 0, kills: 0,
      items: [], salvaged: { count: 0, gold: 0, shards: 0 },
    };
    const h = S().hero;
    let remaining = seconds;
    let guard = 0;

    while (remaining > 1 && guard++ < 400) {
      const r = rates(S().zoneId);
      if (r.xps <= 0 && r.gps <= 0) break;
      const need = D.BAL.xpNext(h.level) - h.xp;
      const tLevel = r.xps > 0 ? need / r.xps : Infinity;
      const t = Math.min(remaining, Math.max(1, tLevel));

      const kills = r.kps * t;
      report.kills += kills;
      const gold = Math.round(r.gps * t);
      h.gold += gold;
      S().stats.goldEarned += gold;
      report.gold += gold;
      report.xp += r.xps * t;

      const lvlBefore = h.level;
      h.xp += r.xps * t;
      while (h.xp >= D.BAL.xpNext(h.level)) {
        h.xp -= D.BAL.xpNext(h.level);
        h.level++;
      }
      if (h.level !== lvlBefore) GQ.state.recalc();
      report.levels += h.level - lvlBefore;
      remaining -= t;
    }

    // loot: expected drops (pity floor + elite guarantees), capped rolls
    const d = drv();
    const z = currentZone();
    const dropRate = Math.max(D.BAL.dropChance * (1 + d.loot / 100), 1 / D.BAL.pityKills) + D.BAL.eliteChance;
    let expectedDrops = Math.floor(report.kills * dropRate);
    expectedDrops = Math.min(expectedDrops, 150);
    for (let i = 0; i < expectedDrops; i++) {
      const item = GQ.items.generateItem(z.level + U.randInt(-1, 2), d.loot);
      S().stats.itemsFound++;
      if (item.rar > S().stats.bestRarity) S().stats.bestRarity = item.rar;
      if (item.rar <= S().settings.autoSalvage || h.inventory.length >= GQ.state.invCap()) {
        const sv = GQ.items.salvageValue(item);
        h.gold += sv.gold; h.shards += sv.shards;
        S().stats.goldEarned += sv.gold; S().stats.shardsEarned += sv.shards;
        S().stats.itemsSalvaged++;
        report.salvaged.count++;
        report.salvaged.gold += sv.gold;
        report.salvaged.shards += sv.shards;
      } else {
        h.inventory.push(item);
        report.items.push(item);
      }
    }
    // shard trickle
    const shardDrops = Math.round(report.kills * D.BAL.shardDropChance * (1 + z.level / 15) * 1.7);
    h.shards += shardDrops;
    S().stats.shardsEarned += shardDrops;
    report.shards = shardDrops;

    // named treasures can surface while away (capped so the chase stays alive)
    report.uniques = [];
    const expU = report.kills * D.BAL.uniqueChance * (1 + d.loot / 100);
    let nUni = Math.min(2, Math.floor(expU) + (Math.random() < expU % 1 ? 1 : 0));
    while (nUni-- > 0) {
      const it = GQ.items.generateUnique(z.id, z.level);
      if (!it) break;
      S().stats.uniquesFound[it.uni] = true;
      S().stats.itemsFound++;
      if (S().stats.bestRarity < 6) S().stats.bestRarity = 6;
      h.inventory.push(it);
      report.uniques.push(it);
    }

    const tiersBefore = GQ.state.masteryTierTotal();
    const flooredKills = Math.floor(report.kills);
    S().stats.kills += flooredKills;
    S().stats.killsByZone[z.id] = (S().stats.killsByZone[z.id] || 0) + flooredKills;
    report.masteryGained = GQ.state.masteryTierTotal() - tiersBefore;
    // bank boss progress and advance quests while away
    if (D.BOSSES[z.id]) {
      S().boss.progress[z.id] = Math.min(D.BAL.bossKillsNeeded, (S().boss.progress[z.id] || 0) + flooredKills);
    }
    // the Depths are active content: offline banks kills but never clears floors
    if (z.id === 'depth') {
      S().depth.kills = Math.min(D.BAL.depthKills - 1, S().depth.kills + flooredKills);
    }
    questEvent('kill', flooredKills, { zone: z.id });
    questEvent('gold', report.gold);
    questEvent('item', report.items.length);
    S().stats.pity = 0;
    S().stats.time += seconds;
    checkAchievements();
    GQ.state.recalc();
    h.hp = GQ.state.drv.hpMax;
    return report;
  }

  return {
    combat, tick, setZone, rates, offline, addXp, spawnMonster,
    cast, abilities, summonBoss, questEvent, ensureQuests, checkAchievements,
    currentZone, eventMods, activeEvent, depthsUnlocked, depthZone,
    warDrums, drumsPrice, stormBell, bellPrice,
    startTrial, endTrial, trialZone,
    anomalyZone, zoneOpen,
    manualStrike, collectShiny, ensureContracts,
  };
})();
