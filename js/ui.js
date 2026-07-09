/* Grind Quest — UI: panels, tooltips, modals, toasts, log */
GQ.ui = (() => {
  const U = GQ.util;
  const D = GQ.data;

  const el = {};
  const dirty = { char: true, inv: true, zones: true, res: true, records: true, zonehdr: true, quests: true, shop: true };
  let activeTab = 'hunt';
  let zoneRateTimer = 0;
  let logCount = 0;

  function S() { return GQ.state.S; }
  function drv() { return GQ.state.drv; }

  function $(id) { return document.getElementById(id); }

  function markDirty(...keys) { for (const k of keys) dirty[k] = true; }

  /* ================= init ================= */

  function init() {
    ['res-gold', 'res-shards', 'hero-name', 'hero-class', 'hero-level', 'gs-val', 'pow-val',
     'hp-fill', 'hp-text', 'xp-fill', 'xp-text', 'paperdoll', 'stat-list',
     'zone-name', 'zone-flavor', 'zone-danger', 'zone-list', 'inv-grid', 'inv-count',
     'records', 'log', 'tooltip', 'toasts', 'modal-root', 'intro', 'portrait',
     'quest-list', 'hotbar', 'buffbar', 'forge-row', 'btn-ascend', 'btn-talents', 'zone-event',
     'shop-list', 'btn-pets', 'upnext',
    ].forEach(id => { el[id] = $(id); });

    el['btn-pets'].addEventListener('click', petsModal);
    document.getElementById('hero-sub').addEventListener('click', titlesModal);

    // Griselda's shop
    el['shop-list'].addEventListener('click', e => {
      const btn = e.target.closest('[data-shop]');
      if (!btn || btn.disabled) return;
      GQ.audio.ensure();
      buyShopItem(btn.dataset.shop);
    });

    el['btn-talents'].addEventListener('click', talentsModal);

    // tabs
    document.querySelectorAll('#tabs .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('active', p.id === 'tab-' + activeTab));
        if (activeTab === 'hunt') markDirty('zones');
        if (activeTab === 'inv') markDirty('inv');
        if (activeTab === 'stats') markDirty('records');
        if (activeTab === 'quests') markDirty('quests');
        if (activeTab === 'shop') markDirty('shop');
      });
    });

    // ability hotbar: clicks + hotkeys 1-3
    el['hotbar'].addEventListener('click', e => {
      const btn = e.target.closest('.ab');
      if (!btn) return;
      GQ.audio.ensure();
      GQ.engine.cast(parseInt(btn.dataset.i, 10));
    });
    document.addEventListener('keydown', e => {
      if (!/^[1-4]$/.test(e.key)) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      GQ.audio.ensure();
      GQ.engine.cast(parseInt(e.key, 10) - 1);
    });

    // the forge (gear gambling)
    el['forge-row'].innerHTML = GQ.data.FORGE_TIERS.map(t => `
      <button class="btn small forge-btn" data-forge="${t.key}" title="${t.desc}">
        <span>${t.icon} ${t.name}</span><span class="forge-cost" data-cost="${t.key}">—</span>
      </button>`).join('');
    el['forge-row'].addEventListener('click', e => {
      const btn = e.target.closest('[data-forge]');
      if (!btn) return;
      const res = GQ.items.forge(btn.dataset.forge);
      if (!res) return;
      const it = res.item;
      const nameHtml = `<span class="rc${it.rar}">[${U.esc(it.name)}]</span>`;
      log(`The Forge produces ${nameHtml}${res.salvaged ? ' — bag full, salvaged.' : ''}`, 'dim');
      if (it.rar >= 3) toast(`Forged! <span class="rc${it.rar}">${U.esc(it.name)}</span>`, 'r' + it.rar);
      GQ.audio.drop(it.rar);
      updateForgeCosts();
    });

    el['btn-ascend'].addEventListener('click', ascensionModal);

    $('btn-sort').addEventListener('click', () => { GQ.items.sortInv(); });
    $('btn-salvage-all').addEventListener('click', () => {
      const inv = S().hero.inventory;
      if (!inv.length) { log('Nothing to salvage. Your bag is empty.', 'sys'); return; }
      const special = inv.filter(i => i.rar >= 5 || i.set).length;
      const warn = special
        ? ` <b style="color:var(--deadly)">This includes ${special} mythic/unique/set item${special > 1 ? 's' : ''} — they will be destroyed.</b>`
        : '';
      confirmModal(
        `Salvage your <b>entire bag</b> of ${inv.length} item${inv.length > 1 ? 's' : ''}?${warn} Equipped gear is not touched.`,
        () => {
          const r = GQ.items.salvageAll();
          log(`<b>Salvaged the whole bag:</b> ${r.count} items → <b style="color:var(--gold)">${U.fmt(r.gold)} gold</b> and <b style="color:#bda1ff">${r.shards} shards</b>.`, 'sys');
          GQ.audio.coin();
        });
    });
    $('btn-autoequip').addEventListener('click', () => {
      const n = GQ.items.autoEquip();
      log(n > 0 ? `Equipped ${n} upgrade${n > 1 ? 's' : ''}.` : 'No upgrades in your bag.', 'sys');
    });
    $('salvage-tier').addEventListener('change', e => {
      const tier = parseInt(e.target.value, 10);
      e.target.value = '-1';
      if (tier < 0) return;
      const count = S().hero.inventory.filter(i => i.rar <= tier).length;
      if (!count) { log('Nothing of that quality to salvage.', 'sys'); return; }
      confirmModal(
        `Salvage ${count} item${count > 1 ? 's' : ''} of ${D.RARITIES[tier].name} quality or lower?`,
        () => {
          const r = GQ.items.salvageTier(tier);
          log(`Salvaged ${r.count} items for <b style="color:var(--gold)">${U.fmt(r.gold)} gold</b> and <b style="color:#bda1ff">${r.shards} shards</b>.`, 'sys');
        });
    });
    $('btn-settings').addEventListener('click', settingsModal);

    // paperdoll slots
    el['paperdoll'].innerHTML = '';
    for (const key of D.DOLL_ORDER) {
      const slot = D.SLOT_BY_KEY[key];
      const div = document.createElement('div');
      div.className = 'pslot';
      div.dataset.slot = key;
      div.innerHTML = `<span class="sicon">${slot.icon}</span><span class="slabel">${slot.name}</span>`;
      div.addEventListener('click', () => {
        const item = S().hero.equipment[key];
        if (item) itemModal(item, 'equipped');
      });
      div.addEventListener('mousemove', e => {
        const item = S().hero.equipment[key];
        if (item) showTooltip(itemTooltipHtml(item, 'equipped'), e);
      });
      div.addEventListener('mouseleave', hideTooltip);
      el['paperdoll'].appendChild(div);
    }

    // inventory grid delegation
    el['inv-grid'].addEventListener('click', e => {
      const cell = e.target.closest('.islot');
      if (!cell) return;
      const item = S().hero.inventory.find(i => i.id === cell.dataset.id);
      if (item) itemModal(item, 'inventory');
    });
    el['inv-grid'].addEventListener('mousemove', e => {
      const cell = e.target.closest('.islot');
      if (!cell) { hideTooltip(); return; }
      const item = S().hero.inventory.find(i => i.id === cell.dataset.id);
      if (item) showTooltip(itemTooltipHtml(item, 'inventory'), e);
    });
    el['inv-grid'].addEventListener('mouseleave', hideTooltip);

    buildZoneList();
  }

  /* ================= per-frame / periodic updates ================= */

  function tickUI(dt) {
    if (!S()) return;
    updateBars();
    updateHotbar();
    zoneRateTimer -= dt;
    if (zoneRateTimer <= 0) {
      zoneRateTimer = 1.0;
      if (activeTab === 'hunt') updateZoneRates();
      updateZoneHeader();
      updateForgeCosts();
      updateAscendButton();
      if (activeTab === 'stats') dirty.records = true;
      if (activeTab === 'shop') dirty.shop = true;
      if (activeTab === 'quests') dirty.quests = true;
      updateUpNext();
    }
    if (dirty.res) { renderResources(); dirty.res = false; }
    if (dirty.char) { renderChar(); dirty.char = false; }
    if (dirty.inv) { renderInv(); dirty.inv = false; }
    if (dirty.zones) { renderZones(); dirty.zones = false; }
    if (dirty.zonehdr) { updateZoneHeader(true); dirty.zonehdr = false; }
    if (dirty.records && activeTab === 'stats') { renderRecords(); dirty.records = false; }
    if (dirty.quests && activeTab === 'quests') { renderQuests(); dirty.quests = false; }
    if (dirty.shop && activeTab === 'shop') { renderShop(); dirty.shop = false; }
  }

  function updateHotbar() {
    if (!GQ.engine) return;
    const abs = GQ.engine.abilities();
    if (el['hotbar'].dataset.cls !== S().hero.cls) {
      el['hotbar'].dataset.cls = S().hero.cls;
      el['hotbar'].innerHTML = abs.map((ab, i) => `
        <button class="ab" data-i="${i}" title="${ab.name} — ${ab.desc} (${ab.cd}s cooldown, hotkey ${i + 1})">
          <span class="ab-icon">${ab.icon}</span>
          <span class="ab-cd"></span>
          <span class="ab-key">${i + 1}</span>
          ${ab.unlock ? `<span class="ab-lock">Lv ${ab.unlock}</span>` : ''}
        </button>`).join('');
    }
    const cds = GQ.engine.combat.cds;
    const kids = el['hotbar'].children;
    for (let i = 0; i < kids.length; i++) {
      const ab = abs[i];
      if (!ab) continue;
      const locked = ab.unlock && S().hero.level < ab.unlock;
      kids[i].classList.toggle('locked', !!locked);
      const cd = cds[ab.key] || 0;
      kids[i].querySelector('.ab-cd').style.height = (locked ? 0 : cd > 0 ? (cd / ab.cd) * 100 : 0) + '%';
      kids[i].classList.toggle('ready', !locked && cd <= 0);
    }
    const buffs = GQ.engine.combat.buffs;
    let bHtml = buffs.map(b => `<span class="buff">${b.icon} ${Math.ceil(b.t)}s</span>`).join('');
    const mom = GQ.engine.combat.momentum;
    if (mom > 0) bHtml = `<span class="buff mom">👊 ×${mom}</span>` + bHtml;
    if (el['buffbar'].innerHTML !== bHtml) el['buffbar'].innerHTML = bHtml;
  }

  // the anticipation strip: your next three milestones
  function updateUpNext() {
    const items = [];
    const L = S().hero.level;
    const zid = S().zoneId;
    if (S().challenge) {
      const ch = D.CHALLENGES.find(c => c.key === S().challenge);
      if (ch) {
        const prog = ch.goalType === 'bosses' ? ` (${S().challengeProg.bosses || 0}/${ch.goalN})` : ` (Lv ${L}/${ch.goalN})`;
        items.push(`${ch.icon} <b>${ch.name}</b>: ${ch.goal}${prog}`);
      }
    }
    if (D.BOSSES[zid]) {
      const bp = S().boss.progress[zid] || 0;
      items.push(bp >= D.BAL.bossKillsNeeded
        ? '☠ boss <b>READY</b>'
        : `☠ boss in <b>${D.BAL.bossKillsNeeded - bp}</b> kills`);
    }
    if (D.ZONE_BY_ID[zid]) {
      const kills = S().stats.killsByZone[zid] || 0;
      const next = D.BAL.masteryTiers.find(t => kills < t);
      if (next) items.push(`✦ mastery in <b>${U.fmtInt(next - kills)}</b> kills`);
    }
    const nextTier = D.TALENT_TIERS.find((t, ti) => L < t.lvl);
    if (nextTier) items.push(`🎯 talent at <b>Lv ${nextTier.lvl}</b>`);
    if (L < 40) items.push('🔱 ultimate at <b>Lv 40</b>');
    if (S().asc.count === 0 && L >= 25 && L < D.ASC_MIN_LEVEL) items.push(`🔥 Ascension at <b>Lv ${D.ASC_MIN_LEVEL}</b>`);
    if (!GQ.engine.depthsUnlocked() && L >= 45) items.push('🌌 the Beyond: <b>fell the Unraveled King</b>');
    const uni = D.UNIQUES[zid];
    if (uni && !S().stats.uniquesFound[uni.key]) items.push(`✧ <b>${uni.name}</b> hides here`);
    el['upnext'].innerHTML = items.length
      ? 'Up next: ' + items.slice(0, 3).join(' · ')
      : '';
  }

  function updateForgeCosts() {
    if (activeTab !== 'inv') return;
    for (const t of D.FORGE_TIERS) {
      const span = el['forge-row'].querySelector(`[data-cost="${t.key}"]`);
      const btn = el['forge-row'].querySelector(`[data-forge="${t.key}"]`);
      if (!span) continue;
      const cost = GQ.items.forgeCost(t);
      span.textContent = U.fmt(cost) + ' g';
      btn.disabled = S().hero.gold < cost;
    }
  }

  function updateAscendButton() {
    const a = S().asc;
    const unlocked = S().hero.level >= D.ASC_MIN_LEVEL || a.count > 0 || a.embers > 0;
    const tease = S().hero.level >= 25; // let players see the fire before they can touch it
    el['btn-ascend'].classList.toggle('hidden', !(unlocked || tease));
    if (unlocked) {
      el['btn-ascend'].innerHTML = `🔥 ${U.fmt(a.embers)}`;
      el['btn-ascend'].title = 'Ascension — trade this run for permanent power';
    } else if (tease) {
      el['btn-ascend'].innerHTML = `🔥 Lv ${D.ASC_MIN_LEVEL}`;
      el['btn-ascend'].title = `Ascension unlocks at level ${D.ASC_MIN_LEVEL}`;
    }
  }

  function updateBars() {
    const d = drv(), h = S().hero;
    const hp01 = U.clamp(h.hp / Math.max(1, d.hpMax), 0, 1);
    el['hp-fill'].style.width = (hp01 * 100).toFixed(1) + '%';
    el['hp-text'].textContent = `${U.fmtInt(Math.max(0, h.hp))} / ${U.fmtInt(d.hpMax)}`;
    const need = D.BAL.xpNext(h.level);
    const xp01 = U.clamp(h.xp / need, 0, 1);
    el['xp-fill'].style.width = (xp01 * 100).toFixed(1) + '%';
    el['xp-text'].textContent = `${U.fmtInt(h.xp)} / ${U.fmtInt(need)} XP`;
  }

  function renderResources() {
    el['res-gold'].textContent = U.fmtInt(S().hero.gold);
    el['res-shards'].textContent = U.fmtInt(S().hero.shards);
  }

  /* ================= character panel ================= */

  function renderChar() {
    const h = S().hero, d = drv();
    const cls = GQ.state.heroClass();
    el['hero-name'].textContent = h.name;
    el['hero-class'].textContent = cls.name;
    el['hero-level'].textContent = h.level;
    const tdef = S().title && D.TITLES.find(t => t.key === S().title);
    document.getElementById('hero-title').textContent = tdef ? ` · ${tdef.label}` : '';
    el['gs-val'].textContent = U.fmtInt(GQ.state.gearScoreTotal());
    el['pow-val'].textContent = U.fmt(GQ.state.power(d));
    const pts = GQ.state.talentPointsAvailable();
    el['btn-talents'].innerHTML = pts > 0 ? `🎯 Talents — ${pts} point${pts > 1 ? 's' : ''}!` : '🎯 Talents';
    el['btn-talents'].classList.toggle('pulse', pts > 0);
    const pk = S().pets.active;
    el['btn-pets'].innerHTML = pk && D.COMPANIONS[pk]
      ? `🐾 ${D.COMPANIONS[pk].name} <span style="color:var(--faint);font-size:10.5px">(${D.COMPANIONS[pk].perkDesc})</span>`
      : `🐾 Companion <span style="color:var(--faint);font-size:10.5px">(${Object.keys(S().pets.owned).length}/${Object.keys(D.COMPANIONS).length})</span>`;
    GQ.scene.drawPortrait(el['portrait']);

    // paperdoll
    for (const div of el['paperdoll'].children) {
      const key = div.dataset.slot;
      const item = h.equipment[key];
      div.className = 'pslot' + (item ? ` filled r${item.rar}` : '');
      const enh = div.querySelector('.enh');
      if (enh) enh.remove();
      if (item && item.enh > 0) {
        const b = document.createElement('span');
        b.className = 'enh';
        b.textContent = '+' + item.enh;
        div.appendChild(b);
      }
      const sd = div.querySelector('.setdot');
      if (sd) sd.remove();
      if (item && item.set) {
        const b = document.createElement('span');
        b.className = 'setdot';
        b.textContent = '◆';
        div.appendChild(b);
      }
    }

    // attributes
    const z = GQ.engine.currentZone();
    const dr = Math.min(0.75, d.armor / (d.armor + D.BAL.armorK(z.level)));
    const rows = [];
    for (const [sk, cnt] of Object.entries(d.setCounts || {})) {
      rows.push(['◆ ' + D.SETS[sk].name + ' set', cnt + '/3', cnt >= 3]);
    }
    rows.push(
      ['DPS', U.fmt(d.dps), true],
      ['Attack', U.fmt(d.atk)],
      ['Attack Speed', d.rate.toFixed(2) + '/s'],
      ['Crit', d.crit.toFixed(0) + '% × ' + (d.critDmg / 100).toFixed(1)],
      ['Max HP', U.fmt(d.hpMax)],
      ['Regen', U.fmt(d.regen) + '/s'],
      ['Armor', U.fmt(d.armor) + ' (' + Math.round(dr * 100) + '% here)'],
      ['XP Bonus', '+' + d.xp.toFixed(0) + '%'],
      ['Gold Find', '+' + d.gold.toFixed(0) + '%'],
      ['Loot Find', '+' + d.loot.toFixed(0) + '%']
    );
    el['stat-list'].innerHTML = rows.map(r =>
      `<div class="stat-row${r[2] ? ' hl' : ''}"><span class="sname">${r[0]}</span><span class="sval">${r[1]}</span></div>`
    ).join('');
  }

  /* ================= zones ================= */

  function buildZoneList() {
    el['zone-list'].innerHTML = '';
    // anomaly card: appears at the top when a door opens somewhere
    const acard = document.createElement('div');
    acard.className = 'zcard anomaly hidden';
    acard.dataset.zone = 'anomaly';
    acard.addEventListener('click', () => {
      if (!S().anomaly) return;
      GQ.audio.ensure();
      GQ.engine.setZone('anomaly');
      GQ.state.save();
    });
    el['zone-list'].appendChild(acard);
    for (const z of D.ZONES) {
      const card = document.createElement('div');
      card.className = 'zcard';
      card.dataset.zone = z.id;
      card.addEventListener('click', e => {
        if (e.target.closest('.zc-boss-btn')) {
          GQ.audio.ensure();
          GQ.engine.summonBoss(z.id);
          GQ.state.save();
          return;
        }
        GQ.engine.setZone(z.id);
        GQ.state.save();
      });
      el['zone-list'].appendChild(card);
    }
    // the Proving Grounds: the place to test strength
    const pgcard = document.createElement('div');
    pgcard.className = 'zcard pg';
    pgcard.dataset.zone = 'pg';
    pgcard.addEventListener('click', e => {
      const btn = e.target.closest('[data-trial]');
      if (!btn || btn.disabled) return;
      GQ.audio.ensure();
      GQ.engine.startTrial(parseInt(btn.dataset.trial, 10));
      GQ.state.save();
    });
    el['zone-list'].appendChild(pgcard);

    // the Depths: endgame ladder, hidden until the Rift falls
    const dcard = document.createElement('div');
    dcard.className = 'zcard depth hidden';
    dcard.dataset.zone = 'depth';
    dcard.addEventListener('click', () => {
      GQ.engine.setZone('depth');
      GQ.state.save();
    });
    el['zone-list'].appendChild(dcard);

    // Deep Space: the infinite ladder, hidden until the Signal falls
    const scard = document.createElement('div');
    scard.className = 'zcard sector hidden';
    scard.dataset.zone = 'sector';
    scard.addEventListener('click', () => {
      GQ.engine.setZone('sector');
      GQ.state.save();
    });
    el['zone-list'].appendChild(scard);
  }

  function renderSectorCard(card) {
    const unlocked = GQ.engine.sectorsUnlocked();
    card.classList.toggle('hidden', !unlocked);
    if (!unlocked) return;
    const sz = GQ.engine.sectorZone(S().sector.current);
    const active = S().zoneId === 'sector';
    card.classList.toggle('active', active);
    const n = S().sector.current;
    card.innerHTML = `
      <div class="zc-top">
        <span class="zc-lv">Lv ${sz.level}</span>
        <span class="zc-name">🌌 ${sz.name}</span>
        ${active ? '<span class="chip hunting">Hunting</span>' : ''}
      </div>
      <div class="zc-flavor">${sz.flavor}</div>
      <div class="zc-rec"></div>
      <div class="zc-rates">
        <span class="rxp">XP/s <b>—</b></span>
        <span class="rgold">Gold/s <b>—</b></span>
        <span class="rilv">Drops <b>iLv ${sz.level - 1}–${sz.level + 2}</b></span>
      </div>
      <div class="zc-danger"></div>
      <div class="zc-depth-prog">Sector progress <b>${S().sector.kills} / ${D.BAL.sectorKills}</b> · best sector <b style="color:var(--gold)">${S().sector.best || '—'}</b> · clears pay <b style="color:#ff9a5a">${2 + Math.floor(n / 3)} 🔥</b></div>`;
  }

  function renderAnomalyCard(card) {
    const a = S().anomaly;
    card.classList.toggle('hidden', !a);
    if (!a) return;
    const def = D.ANOMALIES.find(x => x.key === a.key);
    const host = D.ZONE_BY_ID[a.host];
    const active = S().zoneId === 'anomaly';
    const left = Math.max(0, a.until - S().stats.time);
    card.classList.toggle('active', active);
    card.innerHTML = `
      <div class="zc-top">
        <span class="zc-lv">${def.icon}</span>
        <span class="zc-name">${def.name}</span>
        ${active ? '<span class="chip hunting">Inside</span>' : `<span class="chip risky">closes ${U.fmtTime(left)}</span>`}
      </div>
      <div class="zc-flavor">${def.desc} Found in ${host.name}.</div>
      <div class="zc-depth-prog">Chest progress <b>${a.kills} / ${D.BAL.anomalyKills}</b> kills · reward: <b>${{ gold: 'a hoard of gold', shards: 'an Arcane Shard vein', items: 'two Rare+ items', xp: 'a surge of XP', set: 'a gear-set piece' }[def.reward]}</b></div>
      ${active ? '' : '<button class="btn small gold" style="width:100%;margin-top:8px">Step inside</button>'}`;
  }

  function renderPGCard(card) {
    const inTrial = !!GQ.engine.combat.trial;
    card.innerHTML = `
      <div class="zc-top">
        <span class="zc-lv">⚔</span>
        <span class="zc-name">The Proving Grounds</span>
      </div>
      <div class="zc-flavor">Five Proofs. Sixty seconds each. No loot, no XP, no mercy — just a number with your name on it.</div>
      ${D.TRIALS.map((t, i) => {
        const best = S().trials[t.key] || 0;
        const gated = t.conq && GQ.state.conqueredCount() < t.conq;
        const medals = ['🥉', '🥈', '🥇'].map((m, mi) =>
          `<span class="${best >= t.medals[mi] ? '' : 'medal-off'}">${m}</span>`).join('');
        return `<div class="pg-row" title="${gated ? 'Conquer all ten original zones first' : `🥉 ${t.medals[0]} · 🥈 ${t.medals[1]} · 🥇 ${t.medals[2]} ${t.rush ? 'bosses' : 'kills'}`}">
          <span class="pg-name">${t.name} <span class="zc-m-txt">${t.rush ? 'boss rush · ' + t.time + 's' : 'Lv ' + t.lvl}</span></span>
          <span class="pg-medals">${medals}</span>
          <span class="pg-best">${gated ? '🔒' : best > 0 ? 'best ' + best : '—'}</span>
          <button class="btn small gold" data-trial="${i}" ${(inTrial || gated) ? 'disabled' : ''}>Enter</button>
        </div>`;
      }).join('')}`;
  }

  function renderDepthCard(card) {
    const unlocked = GQ.engine.depthsUnlocked();
    card.classList.toggle('hidden', !unlocked);
    if (!unlocked) return;
    const dz = GQ.engine.depthZone(S().depth.current);
    const active = S().zoneId === 'depth';
    card.classList.toggle('active', active);
    card.innerHTML = `
      <div class="zc-top">
        <span class="zc-lv">Lv ${dz.level}</span>
        <span class="zc-name">🕳️ ${dz.name}</span>
        ${active ? '<span class="chip hunting">Hunting</span>' : ''}
      </div>
      <div class="zc-flavor">${dz.flavor}</div>
      <div class="zc-rec"></div>
      <div class="zc-rates">
        <span class="rxp">XP/s <b>—</b></span>
        <span class="rgold">Gold/s <b>—</b></span>
        <span class="rilv">Drops <b>iLv ${dz.level - 1}–${dz.level + 2}</b></span>
      </div>
      <div class="zc-danger"></div>
      <div class="zc-depth-prog">Floor progress <b>${S().depth.kills} / ${D.BAL.depthKills}</b> · best floor <b style="color:var(--gold)">${S().depth.best || '—'}</b> · a KO resets the floor</div>`;
  }

  function renderZones() {
    for (const card of el['zone-list'].children) {
      if (card.dataset.zone === 'depth') { renderDepthCard(card); continue; }
      if (card.dataset.zone === 'sector') { renderSectorCard(card); continue; }
      if (card.dataset.zone === 'pg') { renderPGCard(card); continue; }
      if (card.dataset.zone === 'anomaly') { renderAnomalyCard(card); continue; }
      const z = D.ZONE_BY_ID[card.dataset.zone];
      if (z.sealed && !GQ.engine.zoneOpen(z)) {
        card.classList.add('sealedcard');
        card.classList.remove('active', 'side');
        const gateText = z.sealed === 'apex'
          ? 'The Firmament waits above the world. The Grind Itself is sitting on the launch key.'
          : z.sealed === 'throne'
          ? 'The Ascendant Spire ignores you while a god still holds the Throne.'
          : 'Beyond the Rift. The seal holds while the Unraveled King still stands.';
        card.innerHTML = `
          <div class="zc-top">
            <span class="zc-lv">Lv ${z.level}</span>
            <span class="zc-name">${z.sealed === 'apex' ? '🚀 ' : z.sealed === 'throne' ? '🗼 ' : ''}${z.name}</span>
            <span class="chip trivial">🔒 Sealed</span>
          </div>
          <div class="zc-flavor">${gateText}</div>
          ${z.gimmick ? `<div class="zc-gimmick">${z.gimmick.desc}</div>` : ''}`;
        continue;
      }
      card.classList.remove('sealedcard');
      const active = S().zoneId === z.id;
      card.classList.toggle('active', active);
      card.classList.toggle('side', !!z.side);
      const mobs = z.monsters.map(m => m.name).join(' · ');
      card.innerHTML = `
        <div class="zc-top">
          <span class="zc-lv">Lv ${z.level}</span>
          <span class="zc-name">${z.name}</span>
          ${z.side ? '<span class="chip sidechip">◐ Side Path</span>' : ''}
          ${active ? '<span class="chip hunting">Hunting</span>' : ''}
        </div>
        <div class="zc-flavor">${z.flavor}</div>
        ${z.gimmick ? `<div class="zc-gimmick">✧ ${z.gimmick.desc}</div>` : ''}
        <div class="zc-event"></div>
        <div class="zc-mobs">${mobs}</div>
        <div class="zc-rec"></div>
        <div class="zc-rates">
          <span class="rxp">XP/s <b>—</b></span>
          <span class="rgold">Gold/s <b>—</b></span>
          <span class="rilv">Drops <b>iLv ${Math.max(1, z.level - 1)}–${z.level + 2}</b></span>
        </div>
        <div class="zc-danger"></div>
        <div class="zc-boss"></div>
        <div class="zc-mastery"></div>
        <div class="zc-unique"></div>`;
    }
    updateZoneRates();
  }

  function dangerChip(r) {
    const map = {
      safe:   ['SAFE', 'safe'],
      trivial:['TRIVIAL · LOW XP', 'trivial'],
      risky:  ['RISKY', 'risky'],
      deadly: ['DEADLY', 'deadly'],
    };
    const [txt, cls] = map[r.danger];
    const extras = [];
    if (r.danger === 'deadly' || r.danger === 'risky') {
      let s = `KO in ~${Math.max(1, Math.round(r.ttd))}s`;
      if (r.killTime > 45) s += ` · a kill takes ~${U.fmtTime(r.killTime)}`;
      extras.push(`<span class="zc-m-txt">${s}</span>`);
    }
    if (r.grayMult > 1) {
      extras.push(`<span style="color:var(--safe);font-size:10px">+${Math.round((r.grayMult - 1) * 100)}% XP above your level</span>`);
    }
    return `<span class="chip ${cls}">${txt}</span> ${extras.join(' ')}`;
  }

  function updateZoneRates() {
    const drvNow = GQ.state.derived();
    const ev = GQ.engine.activeEvent();
    for (const card of el['zone-list'].children) {
      if (card.dataset.zone === 'pg') continue;
      if (card.dataset.zone === 'anomaly') { renderAnomalyCard(card); continue; }
      if (card.classList.contains('sealedcard')) continue;
      const isDepth = card.dataset.zone === 'depth';
      const isSector = card.dataset.zone === 'sector';
      if ((isDepth || isSector) && card.classList.contains('hidden')) continue;
      const z = isDepth ? GQ.engine.depthZone(S().depth.current)
        : isSector ? GQ.engine.sectorZone(S().sector.current)
        : D.ZONE_BY_ID[card.dataset.zone];
      const rxp = card.querySelector('.rxp b');
      if (!rxp) continue;
      const r = GQ.engine.rates(card.dataset.zone);
      rxp.textContent = U.fmt(r.xps);
      card.querySelector('.rgold b').textContent = U.fmt(r.gps);
      card.querySelector('.zc-danger').innerHTML = dangerChip(r);

      // world event badge
      const evEl = card.querySelector('.zc-event');
      if (evEl) {
        evEl.innerHTML = (ev && ev.zoneId === card.dataset.zone)
          ? `<span class="ev-badge">${ev.def.icon} ${ev.def.name} · ${U.fmtTime(ev.remaining)} — ${ev.def.desc}</span>`
          : '';
      }

      // the desire engine: recommended power vs yours
      const mine = GQ.state.power(drvNow, z.level);
      const rec = D.refPower(z);
      const ratio = mine / rec;
      const cls = ratio >= 0.8 ? 'pw-ok' : ratio >= 0.45 ? 'pw-close' : ratio >= 0.2 ? 'pw-under' : 'pw-way';
      const label = ratio >= 0.8 ? 'ready' : ratio >= 0.45 ? 'getting close' : ratio >= 0.2 ? 'underpowered' : 'way above you';
      card.querySelector('.zc-rec').innerHTML =
        `Rec. Power <b>${U.fmt(rec)}</b> · yours <b class="${cls}">${U.fmt(mine)}</b> <span class="${cls}">(${Math.round(U.clamp(ratio, 0, 9.99) * 100)}% — ${label})</span>`;

      // mastery progress
      const mEl = card.querySelector('.zc-mastery');
      if (mEl) {
        const kills = S().stats.killsByZone[z.id] || 0;
        const tier = D.masteryTierCount(kills);
        const next = D.BAL.masteryTiers.find(t => kills < t);
        const pips = D.BAL.masteryTiers.map((t, i) => `<span class="pip${i < tier ? ' on' : ''}">✦</span>`).join('');
        mEl.innerHTML =
          `Mastery ${pips} <span class="zc-m-txt">${next != null ? U.fmtInt(kills) + ' / ' + U.fmtInt(next) + ' kills · +1% dmg per tier' : 'complete'}</span>`;
      }

      // the zone boss
      const bEl = card.querySelector('.zc-boss');
      const boss = D.BOSSES[z.id];
      if (bEl && boss) {
        const bp = S().boss.progress[z.id] || 0;
        const bk = S().boss.kills[z.id] || 0;
        const nmk = (S().boss.nightmares || {})[z.id] || 0;
        const isNm = bk > 0;
        const badges = (bk > 0 ? ` <span style="color:var(--gold)">⚔ ×${bk}</span>` : '') +
          (nmk > 0 ? ` <span style="color:#c9a0f0">🌑 ×${nmk}</span>` : '');
        bEl.innerHTML = bp >= D.BAL.bossKillsNeeded
          ? `<button class="btn small gold zc-boss-btn">${isNm ? '🌑 Nightmare' : '☠ Challenge'} ${boss.name}</button>`
          : `<span class="zc-m-txt">${isNm ? '🌑' : '☠'} ${boss.name}${badges} — ready in ${D.BAL.bossKillsNeeded - bp} kills</span>`;
      }

      // the chase item
      const uni = D.UNIQUES[z.id];
      if (uni) {
        const found = !!(S().stats.uniquesFound || {})[uni.key];
        card.querySelector('.zc-unique').innerHTML = found
          ? `<span class="rc6">✦ ${uni.name}</span> <span class="zc-m-txt">— found</span>`
          : `<span class="zc-u-hidden">✦ ${uni.name} (${D.SLOT_BY_KEY[uni.slot].name.toLowerCase()}) — not yet found</span>`;
      }
    }
  }

  function updateZoneHeader(force) {
    const z = GQ.engine.currentZone();
    if (force || el['zone-name'].textContent !== z.name) {
      el['zone-name'].textContent = z.name;
      el['zone-flavor'].textContent = z.flavor;
    }
    const ev = GQ.engine.activeEvent();
    const evHere = ev && ev.zoneId === S().zoneId;
    el['zone-event'].classList.toggle('hidden', !evHere);
    if (evHere) el['zone-event'].textContent = `${ev.def.icon} ${ev.def.name} ${U.fmtTime(ev.remaining)}`;
    const r = GQ.engine.rates(S().zoneId);
    const map = { safe: 'safe', trivial: 'trivial', risky: 'risky', deadly: 'deadly' };
    el['zone-danger'].className = 'chip ' + map[r.danger];
    el['zone-danger'].textContent =
      r.danger === 'trivial' ? 'Trivial' :
      r.danger === 'safe' ? 'Safe' :
      r.danger === 'risky' ? 'Risky' : 'Deadly';
  }

  /* ================= inventory ================= */

  function renderInv() {
    const inv = S().hero.inventory;
    $('inv-count').textContent = `(${inv.length}/${GQ.state.invCap()})`;
    if (!inv.length) {
      el['inv-grid'].innerHTML = '<div class="inv-empty-msg" style="grid-column:1/-1">Your bag is empty. Monsters are holding your stuff — go get it.</div>';
      return;
    }
    el['inv-grid'].innerHTML = inv.map(it => `
      <div class="islot r${it.rar}" data-id="${it.id}">
        ${D.SLOT_BY_KEY[it.slot].icon}
        ${it.enh > 0 ? `<span class="enh">+${it.enh}</span>` : ''}
        ${it.set ? '<span class="setdot">◆</span>' : ''}
        <span class="ilv">${it.ilvl}</span>
      </div>`).join('');
  }

  /* ================= tooltips ================= */

  function statRowsHtml(item, compareItem) {
    const eff = GQ.items.effStats(item);
    const cmp = {};
    if (compareItem) {
      for (const s of GQ.items.effStats(compareItem)) cmp[s.k] = (cmp[s.k] || 0) + s.v;
    }
    const mine = {};
    for (const s of eff) mine[s.k] = (mine[s.k] || 0) + s.v;

    let html = eff.map(s => {
      const info = D.STAT_INFO[s.k];
      let diff = '';
      if (compareItem) {
        const dv = s.v - (cmp[s.k] || 0);
        if (Math.abs(dv) > 0.05) {
          diff = ` <span class="${dv > 0 ? 'up' : 'down'}">(${dv > 0 ? '+' : ''}${s.k.endsWith('Flat') || s.k === 'armor' ? U.fmt(Math.abs(dv)) : Math.abs(dv).toFixed(1)})</span>`;
          if (dv < 0) diff = diff.replace('(', '(-');
        }
      }
      return `<div class="tt-stat${s.p ? ' primary' : ''}"><span>${info.n}</span><span class="v">${info.f(s.v)}${diff}</span></div>`;
    }).join('');
    if (compareItem) {
      for (const k of Object.keys(cmp)) {
        if (!(k in mine)) {
          const info = D.STAT_INFO[k];
          html += `<div class="tt-stat"><span style="color:var(--faint)">${info.n}</span><span class="v down">lost ${info.f(cmp[k])}</span></div>`;
        }
      }
    }
    return html;
  }

  function setSectionHtml(item) {
    if (!item.set) return '';
    const sdef = D.SETS[item.set];
    if (!sdef) return '';
    const worn = ((GQ.state.drv && GQ.state.drv.setCounts) || {})[item.set] || 0;
    return `<div class="tt-setname">◆ ${sdef.name} set <span>(${worn}/3 equipped)</span></div>
      <div class="tt-setb ${worn >= 2 ? 'on' : ''}">(2) ${sdef.twoDesc}</div>
      <div class="tt-setb ${worn >= 3 ? 'on' : ''}">(3) ${sdef.threeDesc}</div>`;
  }

  function powerDeltaHtml(item) {
    const eq = S().hero.equipment;
    const cur = GQ.state.power(GQ.state.derived());
    const trial = Object.assign({}, eq, { [item.slot]: item });
    const next = GQ.state.power(GQ.state.derived(trial));
    const pct = cur > 0 ? ((next - cur) / cur) * 100 : 100;
    const cls = pct >= 0.05 ? 'up' : pct <= -0.05 ? 'down' : '';
    const arrow = pct >= 0.05 ? '▲' : pct <= -0.05 ? '▼' : '•';
    return `<div class="tt-power">Power <span class="${cls}">${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span></div>`;
  }

  function itemTooltipHtml(item, context) {
    const r = D.RARITIES[item.rar];
    const slot = D.SLOT_BY_KEY[item.slot];
    const equipped = S().hero.equipment[item.slot];
    const isEquipped = context === 'equipped';
    const compare = (!isEquipped && equipped) ? equipped : null;
    let html = `
      <div class="tt-name rc${item.rar}">${U.esc(item.name)}${item.enh > 0 ? ` <span style="color:var(--gold)">+${item.enh}</span>` : ''}</div>
      <div class="tt-sub">${r.name} ${slot.name} · Item Level ${item.ilvl} · GS ${U.fmt(GQ.items.gearScore(item))}</div>
      ${item.flavor ? `<div class="tt-flavor">“${U.esc(item.flavor)}”</div>` : ''}
      ${statRowsHtml(item, compare)}
      ${setSectionHtml(item)}`;
    if (!isEquipped) {
      html += powerDeltaHtml(item);
      if (compare) html += `<div class="tt-vs">vs equipped: <span class="rc${compare.rar}">${U.esc(compare.name)}</span></div>`;
    }
    html += `<div class="tt-hint">${isEquipped ? 'Click to manage' : 'Click for actions'}</div>`;
    return html;
  }

  function showTooltip(html, e) {
    const tt = el['tooltip'];
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    const pad = 14;
    const r = tt.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  function hideTooltip() { el['tooltip'].classList.add('hidden'); }

  /* ================= modals ================= */

  function openModal(html) {
    const root = el['modal-root'];
    root.innerHTML = `<div class="modal">${html}</div>`;
    root.classList.remove('hidden');
    root.onclick = e => { if (e.target === root) closeModal(); };
    return root.firstElementChild;
  }

  function closeModal() {
    el['modal-root'].classList.add('hidden');
    el['modal-root'].innerHTML = '';
  }

  function confirmModal(text, onYes) {
    const m = openModal(`
      <h3>Confirm</h3>
      <p style="color:var(--dim);line-height:1.6">${text}</p>
      <div class="btnrow">
        <button class="btn" data-a="no">Cancel</button>
        <button class="btn danger" data-a="yes">Do it</button>
      </div>`);
    m.querySelector('[data-a=no]').onclick = closeModal;
    m.querySelector('[data-a=yes]').onclick = () => { closeModal(); onYes(); };
  }

  function itemModal(item, context) {
    hideTooltip();
    const r = D.RARITIES[item.rar];
    const slot = D.SLOT_BY_KEY[item.slot];
    const isEquipped = context === 'equipped';
    const equipped = S().hero.equipment[item.slot];
    const sv = GQ.items.salvageValue(item);
    const canEnhance = (item.enh || 0) < GQ.state.maxEnhance();
    const cost = canEnhance ? GQ.items.enhanceCost(item) : null;
    const h = S().hero;

    let buttons = '';
    if (!isEquipped) {
      buttons += `<button class="btn gold" data-a="equip">Equip</button>`;
      buttons += `<button class="btn danger" data-a="salvage" title="+${U.fmt(sv.gold)} gold, +${sv.shards} shards">Salvage</button>`;
    } else {
      const bagFull = h.inventory.length >= GQ.state.invCap();
      buttons += `<button class="btn" data-a="unequip" ${bagFull ? 'disabled title="Bag is full"' : ''}>Unequip</button>`;
    }
    if (canEnhance) {
      const afford = h.gold >= cost.gold && h.shards >= cost.shards;
      buttons += `<button class="btn ${afford ? 'gold' : ''}" data-a="enhance" ${afford ? '' : 'disabled'}>Enhance → +${(item.enh || 0) + 1}</button>`;
    }
    const canTemper = !item.uni && item.stats.some(st => !st.p);
    let tCost = null;
    if (canTemper) {
      tCost = GQ.items.temperCost(item);
      const affordT = h.gold >= tCost.gold && h.shards >= tCost.shards;
      buttons += `<button class="btn" data-a="temper" ${affordT ? '' : 'disabled'} title="Reroll all affix values (${U.fmt(tCost.gold)} gold + ${tCost.shards} shards)">Temper 🎲</button>`;
    }

    const m = openModal(`
      <div class="item-card">
        <div class="im-name rc${item.rar}">${U.esc(item.name)}${item.enh > 0 ? ` <span style="color:var(--gold)">+${item.enh}</span>` : ''}</div>
        <div class="im-sub">${r.name} ${slot.name} · Item Level ${item.ilvl} · Gear Score ${U.fmt(GQ.items.gearScore(item))}</div>
        ${item.flavor ? `<div class="tt-flavor">“${U.esc(item.flavor)}”</div>` : ''}
        <div class="im-stats">${statRowsHtml(item, (!isEquipped && equipped) ? equipped : null)}${setSectionHtml(item)}</div>
        ${!isEquipped ? `<div class="im-power">${powerDeltaHtml(item)}</div>` : ''}
        ${canEnhance ? `<div class="im-costs">Enhance cost: <b style="color:var(--gold)">${U.fmt(cost.gold)}</b> gold + <b style="color:#bda1ff">${cost.shards}</b> shards (+8% stats)</div>` : '<div class="im-costs">Fully enhanced.</div>'}
        <div class="im-costs">Salvage value: ${U.fmt(sv.gold)} gold, ${sv.shards} shards</div>
        <div class="btnrow">${buttons}<button class="btn" data-a="close">Close</button></div>
      </div>`);

    m.querySelector('[data-a=close]').onclick = closeModal;
    const q = a => m.querySelector(`[data-a=${a}]`);
    if (q('equip')) q('equip').onclick = () => {
      GQ.items.equip(item.id);
      log(`Equipped <span class="rc${item.rar}">[${U.esc(item.name)}]</span>.`, 'dim');
      closeModal();
    };
    if (q('unequip')) q('unequip').onclick = () => { GQ.items.unequip(item.slot); closeModal(); };
    if (q('salvage')) q('salvage').onclick = () => {
      const res = GQ.items.salvageInv(item.id);
      if (res) log(`Salvaged <span class="rc${item.rar}">[${U.esc(item.name)}]</span> (+${U.fmt(res.gold)} gold, +${res.shards} shards).`, 'salv');
      closeModal();
    };
    if (q('enhance')) q('enhance').onclick = () => {
      if (GQ.items.enhance(item)) {
        log(`Enhanced <span class="rc${item.rar}">[${U.esc(item.name)}]</span> to +${item.enh}.`, 'sys');
        closeModal();
        itemModal(item, context); // reopen with fresh numbers
      }
    };
    if (q('temper')) q('temper').onclick = () => {
      if (GQ.items.temper(item)) {
        log(`Tempered <span class="rc${item.rar}">[${U.esc(item.name)}]</span>. The dice have spoken.`, 'sys');
        GQ.audio.ability('strike');
        closeModal();
        itemModal(item, context);
      }
    };
  }

  function settingsModal() {
    const s = S().settings;
    const m = openModal(`
      <h3>⚙ Settings</h3>
      <div class="mrow">
        <label>Auto-salvage drops</label>
        <select id="set-autosalv" class="btn small">
          <option value="-1" ${s.autoSalvage === -1 ? 'selected' : ''}>Keep everything</option>
          <option value="0" ${s.autoSalvage === 0 ? 'selected' : ''}>Salvage Commons</option>
          <option value="1" ${s.autoSalvage === 1 ? 'selected' : ''}>≤ Uncommon</option>
          <option value="2" ${s.autoSalvage === 2 ? 'selected' : ''}>≤ Rare</option>
        </select>
      </div>
      <div class="mrow"><label>Damage numbers</label><input type="checkbox" id="set-dmg" ${s.dmgNumbers ? 'checked' : ''}></div>
      <div class="mrow"><label>Particles</label><input type="checkbox" id="set-parts" ${s.particles ? 'checked' : ''}></div>
      <div class="mrow"><label>Sound</label><input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}></div>
      <div class="mrow"><label>Volume</label><input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.volume != null ? s.volume : 0.5}" style="accent-color:var(--gold);width:140px"></div>
      <div class="mrow"><label>Auto-cast abilities ${(S().asc.up.auto || 0) > 0 ? '' : '<span style="color:var(--faint)">(Ascension perk)</span>'}</label>
        <input type="checkbox" id="set-autocast" ${s.autocast ? 'checked' : ''} ${(S().asc.up.auto || 0) > 0 ? '' : 'disabled'}></div>
      <div class="divider"></div>
      <div class="mrow"><label>Export save</label><button class="btn small" id="set-export">Copy to clipboard</button></div>
      <textarea id="set-exportbox" readonly placeholder="Your save code appears here"></textarea>
      <div class="mrow" style="margin-top:8px"><label>Import save</label><button class="btn small" id="set-import">Import</button></div>
      <textarea id="set-importbox" placeholder="Paste a save code here" style="color:var(--text)"></textarea>
      <div class="divider"></div>
      <div class="btnrow" style="justify-content:space-between">
        <button class="btn danger" id="set-reset">Hard Reset</button>
        <button class="btn gold" id="set-close">Done</button>
      </div>`);

    m.querySelector('#set-autosalv').onchange = e => { s.autoSalvage = parseInt(e.target.value, 10); GQ.state.save(); };
    m.querySelector('#set-dmg').onchange = e => { s.dmgNumbers = e.target.checked; GQ.state.save(); };
    m.querySelector('#set-parts').onchange = e => { s.particles = e.target.checked; GQ.state.save(); };
    m.querySelector('#set-sound').onchange = e => { s.sound = e.target.checked; if (s.sound) { GQ.audio.ensure(); GQ.audio.quest(); } GQ.state.save(); };
    m.querySelector('#set-vol').oninput = e => { s.volume = parseFloat(e.target.value); GQ.audio.ensure(); GQ.audio.click(); GQ.state.save(); };
    m.querySelector('#set-autocast').onchange = e => { s.autocast = e.target.checked; GQ.state.save(); };
    m.querySelector('#set-export').onclick = () => {
      const code = GQ.state.exportSave();
      m.querySelector('#set-exportbox').value = code;
      try { navigator.clipboard.writeText(code); } catch (e) {}
    };
    m.querySelector('#set-import').onclick = () => {
      const code = m.querySelector('#set-importbox').value;
      if (!code.trim()) return;
      if (GQ.state.importSave(code)) location.reload();
      else m.querySelector('#set-importbox').value = 'Invalid save code.';
    };
    m.querySelector('#set-reset').onclick = () => {
      confirmModal('Erase this character and all progress? This cannot be undone.', () => GQ.state.hardReset());
    };
    m.querySelector('#set-close').onclick = closeModal;
  }

  function offlineModal(rep) {
    const items = rep.items.slice(0, 20).map(it =>
      `<div><span class="rc${it.rar}">[${U.esc(it.name)}]</span> <span style="color:var(--faint)">iLv ${it.ilvl}</span></div>`
    ).join('');
    const more = rep.items.length > 20 ? `<div style="color:var(--faint)">…and ${rep.items.length - 20} more in your bag</div>` : '';
    openModal(`
      <h3>🌙 While you were away…</h3>
      <p style="color:var(--dim)">Your ${GQ.state.heroClass().name.toLowerCase()} kept grinding for <b style="color:var(--text)">${U.fmtTime(rep.seconds)}</b>.</p>
      <div class="off-grid">
        <span class="k">Monsters slain</span><span class="v">${U.fmtInt(rep.kills)}</span>
        <span class="k">XP earned</span><span class="v" style="color:var(--xp2)">${U.fmt(rep.xp)}</span>
        <span class="k">Levels gained</span><span class="v" style="color:var(--gold)">${rep.levels > 0 ? '+' + rep.levels : '—'}</span>
        <span class="k">Gold</span><span class="v" style="color:var(--gold)">+${U.fmt(rep.gold)}</span>
        <span class="k">Shards</span><span class="v" style="color:#bda1ff">+${U.fmt(rep.shards + rep.salvaged.shards)}</span>
        <span class="k">Items found</span><span class="v">${rep.items.length + rep.salvaged.count}</span>
        ${rep.masteryGained ? `<span class="k">Mastery tiers</span><span class="v" style="color:var(--gold)">+${rep.masteryGained}</span>` : ''}
      </div>
      ${rep.uniques && rep.uniques.length ? rep.uniques.map(it =>
        `<p style="margin:4px 0"><b class="rc6">✦ Unique found: ${U.esc(it.name)}</b></p>`).join('') : ''}
      ${items ? `<div class="panel-title" style="margin-top:4px">Loot</div><div class="off-items">${items}${more}</div>` : ''}
      ${rep.salvaged.count ? `<p style="color:var(--faint);font-size:12px;margin-top:8px">${rep.salvaged.count} items auto-salvaged for ${U.fmt(rep.salvaged.gold)} gold.</p>` : ''}
      <div class="btnrow"><button class="btn gold big" onclick="GQ.ui.closeModal()">Back to the grind</button></div>
    `);
  }

  /* ================= quests ================= */

  function renderQuests() {
    const qs = S().quests;
    // Bureau Contracts: the daily board, paid in embers
    const c = S().contracts;
    let html = '';
    if (c && c.list && c.list.length) {
      const msLeft = Math.max(0, (c.stamp + D.BAL.contractHours * 3600 * 1000) - Date.now());
      html += `<div class="con-head">🏛️ Bureau Contracts <span>new postings in ${U.fmtTime(msLeft / 1000)}</span></div>`;
      html += c.list.map(q => {
        const pct = Math.min(100, (q.have / q.need) * 100);
        return `<div class="qcard contract ${q.done ? 'done' : ''}">
          <div class="q-desc">${q.done ? '✅' : '🏛️'} ${q.desc}</div>
          <div class="q-bar"><div class="q-fill" style="width:${pct.toFixed(1)}%"></div><span class="q-txt">${U.fmtInt(q.have)} / ${U.fmtInt(q.need)}</span></div>
          <div class="q-reward">${q.done ? 'Paid' : 'Pays'}: <b style="color:var(--gold)">${U.fmt(q.reward.gold)}</b> gold · <b style="color:#bda1ff">${q.reward.shards}</b> shards · <b style="color:#ff9a5a">${q.reward.embers} 🔥</b></div>
        </div>`;
      }).join('');
      html += `<div class="con-head" style="margin-top:14px">📜 Quests</div>`;
    }
    if (!qs.length) {
      el['quest-list'].innerHTML = html + '<div class="inv-empty-msg">The quest board is being restocked…</div>';
      return;
    }
    el['quest-list'].innerHTML = html + qs.map(q => {
      const pct = Math.min(100, (q.have / q.need) * 100);
      return `<div class="qcard">
        <div class="q-desc">📜 ${q.desc}</div>
        <div class="q-bar"><div class="q-fill" style="width:${pct.toFixed(1)}%"></div><span class="q-txt">${U.fmtInt(q.have)} / ${U.fmtInt(q.need)}</span></div>
        <div class="q-reward">Reward: <b style="color:var(--gold)">${U.fmt(q.reward.gold)}</b> gold · <b style="color:#bda1ff">${q.reward.shards}</b> shards · <b style="color:var(--xp2)">${U.fmt(q.reward.xp)}</b> XP</div>
      </div>`;
    }).join('');
  }

  /* ================= Griselda's shop ================= */

  function renderShop() {
    const s = S().shop;
    const rows = D.SHOP.map(it => {
      let price = null, rankTxt = '', soldOut = false, blocked = false, blockNote = '';
      let name = it.name, desc = it.desc;
      if (it.repeat) {
        if (it.key === 'drums') {
          price = GQ.engine.drumsPrice();
          const z = GQ.engine.currentZone();
          if (!D.BOSSES[z.id]) { blocked = true; blockNote = 'no boss down here'; }
          else if ((S().boss.progress[z.id] || 0) >= D.BAL.bossKillsNeeded) { blocked = true; blockNote = 'boss already waiting'; }
        } else {
          price = GQ.engine.bellPrice();
        }
      } else {
        const rank = s[it.key] || 0;
        soldOut = rank >= it.max;
        price = soldOut ? null : it.prices[rank];
        rankTxt = `<span class="shop-rank">${rank}/${it.max}</span>`;
        if (it.mystery && rank > 0) {
          name = 'Solid Gold Boar';
          desc = 'A statue. It does nothing. Magnificently.';
        }
      }
      const afford = price != null && S().hero.gold >= price;
      return `<div class="shop-row ${soldOut ? 'sold' : ''}">
        <div class="shop-ic">${it.icon}</div>
        <div class="shop-body">
          <div class="shop-name">${name} ${rankTxt}</div>
          <div class="shop-desc">${desc}</div>
          <div class="shop-flavor">${U.esc(it.flavor)}</div>
          ${blocked ? `<div class="shop-block">${blockNote}</div>` : ''}
        </div>
        <button class="btn small ${afford && !blocked ? 'gold' : ''}" data-shop="${it.key}"
          ${(!afford || soldOut || blocked) ? 'disabled' : ''}>${soldOut ? 'SOLD' : U.fmt(price) + ' g'}</button>
      </div>`;
    }).join('');
    el['shop-list'].innerHTML = `
      <div class="shop-head">Griselda's Curiosities
        <span>gold only · no refunds · stop asking about the boar</span>
      </div>${rows}`;
  }

  function buyShopItem(key) {
    if (key === 'drums') { if (GQ.engine.warDrums()) { renderShop(); } return; }
    if (key === 'bell') { if (GQ.engine.stormBell()) { renderShop(); } return; }
    const def = D.SHOP.find(i => i.key === key);
    const s = S().shop;
    const rank = s[key] || 0;
    if (!def || rank >= def.max) return;
    const price = def.prices[rank];
    if (S().hero.gold < price) return;
    S().hero.gold -= price;
    s[key] = rank + 1;
    GQ.state.recalc();
    GQ.state.save();
    GQ.audio.coin();
    if (key === 'boar') {
      log('<b>🐗 It is a boar. Solid gold. Life-size.</b> Griselda nods once, respectfully. It has been installed beside your battlefield.', 'level');
      toast('🐗 The Solid Gold Boar is yours.', 'gold', 5);
      GQ.audio.conquer();
    } else {
      log(`Purchased <b>${def.name}</b> from Griselda. ${def.desc}.`, 'sys');
      toast(`${def.icon} ${def.name} ${def.max > 1 ? 'rank ' + s[key] : ''}`, 'gold');
    }
    if (key === 'bag') markDirty('inv');
    markDirty('res', 'char', 'shop');
    renderShop();
  }

  /* ================= talents ================= */

  function talentsModal() {
    const L = S().hero.level;
    const T = S().talents;
    const pts = GQ.state.talentPointsAvailable();
    const rows = D.TALENT_TIERS.map((tier, ti) => {
      if (L < tier.lvl) {
        return `<div class="tal-row locked"><span class="tal-lvl">Lv ${tier.lvl}</span><span class="tal-locked">🔒 locked</span></div>`;
      }
      const chosen = T[ti];
      const picks = tier.picks.map(p => {
        if (chosen) {
          return `<div class="tal-pick ${chosen === p.key ? 'chosen' : 'passed'}" title="${p.desc}">${p.icon} ${p.name}</div>`;
        }
        return `<button class="tal-pick open" data-tal="${ti}:${p.key}">${p.icon} <b>${p.name}</b><span class="tal-desc">${p.desc}</span></button>`;
      }).join('');
      return `<div class="tal-row${chosen ? '' : ' choose'}"><span class="tal-lvl">Lv ${tier.lvl}</span><div class="tal-picks">${picks}</div></div>`;
    }).join('');
    const respecCost = Math.round(D.BAL.goldKill(L) * 50);
    const hasAny = Object.keys(T).length > 0;

    const m = openModal(`
      <h3>🎯 Talents ${pts > 0 ? `<span style="color:var(--gold);font-size:13px">${pts} point${pts > 1 ? 's' : ''} to spend</span>` : ''}</h3>
      <p style="color:var(--dim);font-size:12.5px">One choice per milestone. Choices last until you Ascend.</p>
      ${rows}
      <div class="btnrow" style="justify-content:space-between">
        <button class="btn" id="tal-respec" ${hasAny && S().hero.gold >= respecCost ? '' : 'disabled'}>Respec (${U.fmt(respecCost)} gold)</button>
        <button class="btn gold" id="tal-close">Done</button>
      </div>`);

    m.querySelectorAll('[data-tal]').forEach(btn => {
      btn.onclick = () => {
        const [ti, key] = btn.dataset.tal.split(':');
        const pick = D.TALENT_TIERS[ti].picks.find(p => p.key === key);
        S().talents[ti] = key;
        GQ.state.recalc();
        GQ.state.save();
        GQ.audio.quest();
        log(`<b>🎯 Talent:</b> ${pick.icon} ${pick.name} — ${pick.desc}`, 'level');
        markDirty('char', 'zones');
        closeModal();
        talentsModal();
      };
    });
    m.querySelector('#tal-close').onclick = closeModal;
    const rs = m.querySelector('#tal-respec');
    if (!rs.disabled) rs.onclick = () => confirmModal(
      `Unlearn all talents for ${U.fmt(respecCost)} gold?`,
      () => {
        S().hero.gold -= respecCost;
        S().talents = {};
        GQ.state.recalc();
        GQ.state.save();
        markDirty('char', 'zones', 'res');
        talentsModal();
      });
  }

  function titlesModal() {
    const s = S();
    const rows = D.TITLES.map(t => {
      const has = (() => { try { return t.earned(s); } catch (e) { return false; } })();
      const wearing = s.title === t.key;
      if (!has) {
        return `<div class="pet-row locked-pet"><span class="pet-ic">🔒</span>
          <div class="pet-body"><div class="pet-name">${t.label}</div><div class="pet-desc">${t.how}</div></div></div>`;
      }
      return `<div class="pet-row"><span class="pet-ic">📛</span>
        <div class="pet-body"><div class="pet-name">${t.label}</div><div class="pet-desc">${t.how}</div></div>
        <button class="btn small ${wearing ? '' : 'gold'}" data-title="${t.key}">${wearing ? 'Remove' : 'Wear'}</button>
      </div>`;
    }).join('');
    const m = openModal(`
      <h3>📛 Titles</h3>
      <p style="color:var(--dim);font-size:12.5px">Honorifics, earned the hard way. One at a time; the Bureau frowns on stacking.</p>
      ${rows}
      <div class="btnrow"><button class="btn gold" id="titles-close">Done</button></div>`);
    m.querySelectorAll('[data-title]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.title;
        S().title = (S().title === key) ? null : key;
        GQ.state.save();
        GQ.audio.click();
        markDirty('char');
        closeModal();
        titlesModal();
      };
    });
    m.querySelector('#titles-close').onclick = closeModal;
  }

  function petsModal() {
    const owned = S().pets.owned;
    const active = S().pets.active;
    const rows = Object.entries(D.COMPANIONS).map(([key, pet]) => {
      const have = !!owned[key];
      const isActive = active === key;
      if (!have) {
        return `<div class="pet-row locked-pet">
          <span class="pet-ic">❓</span>
          <div class="pet-body"><div class="pet-name">???</div>
          <div class="pet-desc">Follows ${D.BOSSES[key].name}. Sometimes.</div></div>
        </div>`;
      }
      return `<div class="pet-row">
        <span class="pet-ic">🐾</span>
        <div class="pet-body">
          <div class="pet-name">${pet.name} <span class="zc-m-txt">from ${D.BOSSES[key].name}</span></div>
          <div class="pet-desc">${pet.perkDesc} · fights at your side</div>
        </div>
        <button class="btn small ${isActive ? '' : 'gold'}" data-pet="${key}">${isActive ? 'Rest' : 'Summon'}</button>
      </div>`;
    }).join('');
    const m = openModal(`
      <h3>🐾 Companions <span style="color:var(--faint);font-size:12px">${Object.keys(owned).length}/${Object.keys(D.COMPANIONS).length}</span></h3>
      <p style="color:var(--dim);font-size:12.5px">Bosses sometimes drop a smaller, friendlier version of themselves (guaranteed by the fifth conquest). One follows you at a time: its perk applies and it swings for 15% of your attack.</p>
      ${rows}
      <div class="btnrow"><button class="btn gold" id="pets-close">Done</button></div>`);
    m.querySelectorAll('[data-pet]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.pet;
        S().pets.active = (S().pets.active === key) ? null : key;
        GQ.state.recalc();
        GQ.state.save();
        GQ.audio.click();
        markDirty('char');
        closeModal();
        petsModal();
      };
    });
    m.querySelector('#pets-close').onclick = closeModal;
  }

  function trialResults(def, kills, prevBest, rewards) {
    const medalNames = ['Bronze', 'Silver', 'Gold'];
    const tierNow = def.medals.filter(m => kills >= m).length;
    const earned = rewards.map(r =>
      `<div class="mrow"><label>${['🥉', '🥈', '🥇'][r.tier]} ${medalNames[r.tier]} medal — first time!</label>
       <b style="color:var(--gold)">+${U.fmt(r.gold)} g · +${r.shards} shards${r.embers ? ' · +' + r.embers + ' 🔥' : ''}</b></div>`).join('');
    openModal(`
      <h3>⚔ ${def.name} — Results</h3>
      <div class="off-grid">
        <span class="k">Kills in ${D.BAL.trialTime}s</span><span class="v">${kills}</span>
        <span class="k">Personal best</span><span class="v" style="color:var(--gold)">${Math.max(kills, prevBest)}</span>
        <span class="k">Standing</span><span class="v">${tierNow > 0 ? ['🥉 Bronze', '🥈 Silver', '🥇 Gold'][tierNow - 1] : 'Participant'}</span>
      </div>
      <p style="color:var(--faint);font-size:11.5px">Thresholds: 🥉 ${def.medals[0]} · 🥈 ${def.medals[1]} · 🥇 ${def.medals[2]} kills</p>
      ${earned || '<p style="color:var(--dim);font-size:12.5px">No new medals. The judges suggest more damage.</p>'}
      <div class="btnrow"><button class="btn gold" onclick="GQ.ui.closeModal()">Done</button></div>`);
  }

  function completionModal() {
    const n = Object.keys(D.BOSSES).length;
    openModal(`
      <h3>🌌 TRANSCENDENT</h3>
      <p style="color:var(--dim);line-height:1.7">All ${n} bosses have fallen — every warlord, every matriarch, every god with a forwarding address. Every land bears your mark: <b style="color:var(--gold)">+${n * 2}% permanent damage</b>, and the Last God's chair is available. You do not sit. You have kills to make.</p>
      <p style="color:var(--dim);line-height:1.7">What remains is the pure stuff: the Depths have no bottom, the Proving Grounds keep score forever, Ascension has no ceiling, and somewhere an anomaly is opening without you.</p>
      <p class="serif" style="color:var(--gold2);text-align:center;margin-top:14px;font-style:italic">"Retirement denied. Reason: momentum."</p>
      <div class="btnrow"><button class="btn gold big" onclick="GQ.ui.closeModal()">Back to work</button></div>
    `);
    GQ.audio.conquer();
  }

  /* ================= ascension ================= */

  function ascensionModal() {
    const a = S().asc;
    const gain = GQ.state.emberPreview();
    const canAscend = gain > 0;
    const ups = D.ASC_UPGRADES.map(u => {
      const r = a.up[u.key] || 0;
      const maxed = r >= u.max;
      const cost = maxed ? null : u.cost(r);
      const afford = cost != null && a.embers >= cost;
      return `<div class="asc-up">
        <div class="asc-ic">${u.icon}</div>
        <div class="asc-body">
          <div class="asc-name">${u.name} <span class="asc-rank">${r}/${u.max >= 999 ? '∞' : u.max}</span></div>
          <div class="asc-desc">${u.desc}</div>
        </div>
        <button class="btn small ${afford ? 'gold' : ''}" data-up="${u.key}" ${afford ? '' : 'disabled'}>${maxed ? 'MAX' : cost + ' 🔥'}</button>
      </div>`;
    }).join('');

    const chRows = D.CHALLENGES.map(ch => {
      const owned = !!S().relics[ch.relic.key];
      return `<div class="asc-up ${owned ? 'ch-done' : ''}">
        <div class="asc-ic">${ch.icon}</div>
        <div class="asc-body">
          <div class="asc-name">${ch.name} ${owned ? `<span style="color:var(--gold);font-size:11px">${ch.relic.icon} relic owned</span>` : ''}</div>
          <div class="asc-desc">${ch.desc} · Goal: <b>${ch.goal}</b> · Relic: ${ch.relic.desc}</div>
        </div>
        <button class="btn small ${canAscend && !owned ? 'gold' : ''}" data-ch="${ch.key}" ${(canAscend && !owned) ? '' : 'disabled'}>Enter</button>
      </div>`;
    }).join('');

    const m = openModal(`
      <h3>🔥 Ascension</h3>
      <p style="color:var(--dim);font-size:13px;line-height:1.6">Sacrifice this run — level, gear, gold, shards — for <b style="color:#ff9a5a">Soul Embers</b>.
      Mastery, conquests, unique discoveries, achievements, relics and these upgrades are <b>forever</b>.</p>
      <div class="mrow"><label>Soul Embers</label><b style="color:#ff9a5a">🔥 ${U.fmt(a.embers)}</b></div>
      <div class="mrow"><label>Ascensions completed</label><b>${a.count}</b></div>
      <div class="divider"></div>
      ${ups}
      <div class="divider"></div>
      <div class="con-head">⚔ Challenge Runs <span>ascend into a handicap, come back with a Relic</span></div>
      ${chRows}
      <div class="divider"></div>
      <div class="btnrow" style="justify-content:space-between">
        <button class="btn danger" id="asc-go" ${canAscend ? '' : 'disabled'}>${canAscend ? `Ascend now (+${gain} 🔥)` : `Ascend (requires level ${D.ASC_MIN_LEVEL})`}</button>
        <button class="btn" id="asc-close">Close</button>
      </div>`);

    const performAscension = chKey => {
      const ch = chKey && D.CHALLENGES.find(c => c.key === chKey);
      GQ.state.ascend(chKey);
      GQ.audio.ascend();
      GQ.engine.setZone('meadow', true);
      log(`<b>🔥 ASCENSION ${S().asc.count}.</b> The grind remembers you. +${gain} Soul Embers.`, 'level');
      if (ch) {
        log(`<b>${ch.icon} ${ch.name} begins.</b> ${ch.desc} Goal: ${ch.goal}. The Relic is watching.`, 'sys');
        toast(`${ch.icon} Challenge accepted: ${ch.name}`, 'gold', 5);
      } else {
        toast(`🔥 Ascended! +${gain} Soul Embers`, 'gold', 5);
      }
      markDirty('char', 'inv', 'zones', 'res', 'quests', 'records', 'zonehdr');
    };

    m.querySelectorAll('[data-up]').forEach(btn => {
      btn.onclick = () => {
        const u = D.ASC_UPGRADES.find(x => x.key === btn.dataset.up);
        const r = a.up[u.key] || 0;
        if (r >= u.max || a.embers < u.cost(r)) return;
        a.embers -= u.cost(r);
        a.up[u.key] = r + 1;
        GQ.state.recalc();
        GQ.state.save();
        GQ.audio.quest();
        markDirty('char', 'zones');
        closeModal();
        ascensionModal();
      };
    });
    m.querySelectorAll('[data-ch]').forEach(btn => {
      btn.onclick = () => {
        const ch = D.CHALLENGES.find(c => c.key === btn.dataset.ch);
        confirmModal(
          `Ascend into <b>${ch.icon} ${ch.name}</b> for <b style="color:#ff9a5a">+${gain} Soul Embers</b>?<br><br>${ch.desc} The restriction holds until you ${ch.goal.toLowerCase()} — then it lifts and <b>${ch.relic.name}</b> (${ch.relic.desc}) is yours for good.<br><br><span style="color:var(--faint);font-size:11.5px">Challenge runs start at level 1 — Head Start does not apply.</span>`,
          () => performAscension(ch.key));
      };
    });
    m.querySelector('#asc-close').onclick = closeModal;
    if (canAscend) {
      m.querySelector('#asc-go').onclick = () => confirmModal(
        `Ascend now for <b style="color:#ff9a5a">+${gain} Soul Embers</b>? Your level, gear, gold and shards will be consumed. Your permanent bonuses remain.`,
        () => performAscension(null));
    }
  }

  /* ================= records ================= */

  function renderRecords() {
    const st = S().stats;
    const zoneRows = D.ZONES
      .filter(z => st.killsByZone[z.id])
      .map(z => `<div class="stat-row"><span class="sname">${z.name}</span><span class="sval">${U.fmtInt(st.killsByZone[z.id])}</span></div>`)
      .join('');
    const best = st.bestRarity >= 0 ? `<span class="rc${st.bestRarity}">${D.RARITIES[st.bestRarity].name}</span>` : '—';
    el['records'].innerHTML = `
      <h4>Career</h4>
      <div class="stat-row"><span class="sname">Time grinding</span><span class="sval">${U.fmtTime(st.time)}</span></div>
      <div class="stat-row"><span class="sname">Monsters slain</span><span class="sval">${U.fmtInt(st.kills)}</span></div>
      <div class="stat-row"><span class="sname">Times knocked out</span><span class="sval">${U.fmtInt(st.deaths)}</span></div>
      <div class="stat-row"><span class="sname">Hardest hit</span><span class="sval">${U.fmt(st.bestHit)}</span></div>
      <h4>Wealth</h4>
      <div class="stat-row"><span class="sname">Gold earned</span><span class="sval">${U.fmt(st.goldEarned)}</span></div>
      <div class="stat-row"><span class="sname">Shards earned</span><span class="sval">${U.fmt(st.shardsEarned)}</span></div>
      <h4>Loot</h4>
      <div class="stat-row"><span class="sname">Items found</span><span class="sval">${U.fmtInt(st.itemsFound)}</span></div>
      <div class="stat-row"><span class="sname">Items salvaged</span><span class="sval">${U.fmtInt(st.itemsSalvaged)}</span></div>
      <div class="stat-row"><span class="sname">Best find</span><span class="sval">${best}</span></div>
      <div class="stat-row"><span class="sname">Uniques discovered</span><span class="sval rc6">${Object.keys(st.uniquesFound || {}).length} / ${Object.keys(D.UNIQUES).length}</span></div>
      <div class="stat-row"><span class="sname">Mastery tiers</span><span class="sval">${GQ.state.masteryTierTotal()} / ${D.ZONES.length * D.BAL.masteryTiers.length}</span></div>
      <div class="stat-row"><span class="sname">Bosses conquered</span><span class="sval">${GQ.state.conqueredCount()} / ${Object.keys(D.BOSSES).length}</span></div>
      <div class="stat-row"><span class="sname">Nightmares broken</span><span class="sval" style="color:#c9a0f0">${Object.keys(S().boss.nightmares || {}).length} / ${Object.keys(D.BOSSES).length}</span></div>
      <div class="stat-row"><span class="sname">Anomalies looted</span><span class="sval">${U.fmtInt(st.anomalies || 0)}</span></div>
      <div class="stat-row"><span class="sname">Loot Goblins caught</span><span class="sval">${U.fmtInt(st.goblins || 0)}</span></div>
      <div class="stat-row"><span class="sname">Shinies snatched</span><span class="sval">${U.fmtInt(st.shinies || 0)}</span></div>
      <div class="stat-row"><span class="sname">Manual strikes</span><span class="sval">${U.fmtInt(st.clicks || 0)}</span></div>
      <div class="stat-row"><span class="sname">Contracts fulfilled</span><span class="sval">${U.fmtInt(st.contracts || 0)}</span></div>
      <div class="stat-row"><span class="sname">Companions</span><span class="sval">${Object.keys(S().pets.owned).length} / ${Object.keys(D.COMPANIONS).length}</span></div>
      <div class="stat-row"><span class="sname">Ascensions</span><span class="sval" style="color:#ff9a5a">${S().asc.count}</span></div>
      ${S().depth.best > 0 ? `<div class="stat-row"><span class="sname">Deepest floor</span><span class="sval" style="color:var(--r5)">Depth ${S().depth.best}</span></div>` : ''}
      ${S().sector.best > 0 ? `<div class="stat-row"><span class="sname">Farthest sector</span><span class="sval" style="color:#80c0ff">Sector ${S().sector.best}</span></div>` : ''}
      ${zoneRows ? '<h4>Kills by zone</h4>' + zoneRows : ''}
      <h4>Bestiary (${Object.values(st.killsBySpecies || {}).filter(n => n >= D.BAL.bestiaryTiers[0]).length}/${Object.keys(D.LORE).length} studied)</h4>
      ${D.ZONES.map(z => z.monsters.map(sp => {
        const kills = (st.killsBySpecies || {})[sp.name] || 0;
        const tier = GQ.state.bestiaryTier(sp.name);
        const pips = D.BAL.bestiaryTiers.map((t, i) => `<span class="pip${i < tier ? ' on' : ''}">●</span>`).join('');
        return `<div class="bst ${tier > 0 ? 'known' : ''}">
          <div class="bst-top"><span class="bst-name">${sp.name}</span><span class="bst-pips">${pips}</span><span class="bst-kills">${U.fmtInt(kills)}</span></div>
          <div class="bst-lore">${tier > 0 ? D.LORE[sp.name] || '' : '— field notes pending —'}</div>
        </div>`;
      }).join('')).join('')}
      <h4>Relics (${Object.keys(S().relics || {}).length}/${D.CHALLENGES.length})</h4>
      ${D.CHALLENGES.map(ch => {
        const has = (S().relics || {})[ch.relic.key];
        return `<div class="ach ${has ? 'done' : ''}">
          <span class="ach-mark">${has ? ch.relic.icon : '·'}</span>
          <span class="ach-name">${ch.relic.name}</span>
          <span class="ach-desc">${has ? ch.relic.desc : ch.name + ' — ' + ch.goal}</span>
        </div>`;
      }).join('')}
      <h4>Achievements (${Object.keys(st.achDone || {}).length}/${D.ACHIEVEMENTS.length})</h4>
      ${D.ACHIEVEMENTS.map(a => {
        const done = (st.achDone || {})[a.key];
        return `<div class="ach ${done ? 'done' : ''}">
          <span class="ach-mark">${done ? '🏆' : '·'}</span>
          <span class="ach-name">${a.name}</span>
          <span class="ach-desc">${a.desc}</span>
        </div>`;
      }).join('')}
    `;
  }

  /* ================= log & toasts ================= */

  function log(html, cls) {
    const div = document.createElement('div');
    div.className = 'ln ' + (cls || '');
    const st = S() ? S().stats.time : 0;
    div.innerHTML = `<span class="t">${U.fmtTime(st)}</span>${html}`;
    el['log'].appendChild(div);
    logCount++;
    while (logCount > 90) { el['log'].removeChild(el['log'].firstChild); logCount--; }
    el['log'].scrollTop = el['log'].scrollHeight;
  }

  function toast(html, cls, dur) {
    const div = document.createElement('div');
    div.className = 'toast ' + (cls || '');
    div.style.setProperty('--dur', (dur || 3.2) + 's');
    div.innerHTML = html;
    el['toasts'].appendChild(div);
    setTimeout(() => div.remove(), ((dur || 3.2) + 0.6) * 1000);
  }

  /* ================= intro ================= */

  function showIntro(onStart) {
    const intro = el['intro'];
    intro.classList.remove('hidden');
    let selected = 'warrior';
    intro.innerHTML = `
      <div class="i-title">GRIND<em>QUEST</em></div>
      <div class="i-tag">All ten hunting grounds are open from level one. Most of them will kill you. That is the to-do list.</div>
      <div class="i-label">Name your hero</div>
      <input id="intro-name" maxlength="16" value="Adventurer" spellcheck="false">
      <div class="i-label">Choose your class</div>
      <div class="class-row">
        ${D.CLASSES.map(c => `
          <div class="ccard ${c.key === selected ? 'sel' : ''}" data-cls="${c.key}">
            <div class="ci">${c.icon}</div>
            <div class="cn">${c.name}</div>
            <div class="cd">${c.desc}</div>
            <div class="cs">${c.perks}</div>
          </div>`).join('')}
      </div>
      <button class="btn gold big" id="intro-start">⚔ &nbsp;Begin the Grind</button>
    `;
    intro.querySelectorAll('.ccard').forEach(card => {
      card.addEventListener('click', () => {
        selected = card.dataset.cls;
        intro.querySelectorAll('.ccard').forEach(cc => cc.classList.toggle('sel', cc === card));
      });
    });
    intro.querySelector('#intro-start').addEventListener('click', () => {
      const name = intro.querySelector('#intro-name').value.trim() || 'Adventurer';
      intro.classList.add('hidden');
      intro.innerHTML = '';
      onStart(name, selected);
    });
  }

  return {
    init, tickUI, markDirty, log, toast, closeModal, offlineModal, showIntro,
    renderResources, ascensionModal, talentsModal, completionModal, trialResults,
  };
})();
