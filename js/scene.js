/* Grind Quest — canvas battle scene (all procedural, no assets) */
GQ.scene = (() => {
  const U = GQ.util;
  const D = GQ.data;

  let cv, ctx, W = 0, H = 0, dpr = 1;
  let t = 0;
  let floats = [];      // {x,y,vy,txt,color,size,life,max}
  let parts = [];       // {x,y,vx,vy,life,max,color,size,grav}
  let ambient = [];     // ambient particles
  let props = null;     // cached scenery layout
  let propsZone = '';
  let heroLunge = 0, heroHurt = 0, monFlash = 0, monLunge = 0;
  let spawnT = 1;       // monster scale-in
  let zoneFade = 0;
  let levelGlow = 0;
  let shake = 0;
  let banner = { t: 0, text: '' };
  let shiny = null;      // {x, y, t}

  const api = { ready: false };

  function heroX() { return W * 0.30; }
  function monX() { return W * 0.70; }
  function groundY() { return H * 0.78; }

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(cv.parentElement);
    }
    // the battlefield is interactive: snatch shinies, strike the monster
    cv.addEventListener('pointerdown', e => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (shiny && Math.hypot(x - shiny.x, y - shiny.y) < 36) {
        GQ.engine.collectShiny();
        for (let i = 0; i < 12; i++) {
          parts.push({
            x: shiny.x, y: shiny.y,
            vx: U.rand(-90, 90), vy: U.rand(-120, 20),
            life: 0, max: U.rand(0.3, 0.7), color: '#f6dfa0', size: U.rand(1.5, 3), grav: 180,
          });
        }
        shiny = null;
        return;
      }
      const m = GQ.engine.combat.monster;
      if (m && Math.abs(x - monX()) < 75 && y > groundY() - 135 && y < groundY() + 25) {
        if (GQ.engine.manualStrike()) addShake(1);
      }
    });
    api.ready = true;
  }

  function hasShiny() { return !!shiny; }
  function spawnShiny() {
    shiny = {
      x: U.rand(W * 0.12, W * 0.88),
      y: U.rand(H * 0.18, H * 0.55),
      t: 0,
    };
  }

  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(300, r.width);
    H = Math.max(200, r.height);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    props = null; // relayout scenery
  }

  /* ================= events from engine ================= */

  function onPlayerHit(dmg, crit) {
    heroLunge = 1;
    monFlash = 1;
    if (!GQ.state.S.settings.dmgNumbers) return;
    floats.push({
      x: monX() + U.rand(-24, 24), y: groundY() - 90 + U.rand(-14, 6),
      vy: -46, txt: U.fmt(dmg) + (crit ? '!' : ''),
      color: crit ? '#f6dfa0' : '#ffffff',
      size: crit ? 22 : 15, life: 0, max: crit ? 1.1 : 0.85,
    });
  }

  function onHeroHit(dmg, heavy) {
    heroHurt = 1;
    addShake(heavy ? 5 : 1.5);
    if (!GQ.state.S.settings.dmgNumbers) return;
    floats.push({
      x: heroX() + U.rand(-18, 18), y: groundY() - 96,
      vy: -38, txt: '-' + U.fmt(dmg), color: '#f28d84', size: heavy ? 17 : 14, life: 0, max: 0.8,
    });
  }

  function addShake(n) { shake = Math.min(14, shake + n); }

  function onBossStart(name) {
    banner = { t: 3, text: '☠  ' + name + '  ☠' };
    addShake(9);
  }

  function onHeal() {
    for (let i = 0; i < 14; i++) {
      parts.push({
        x: heroX() + U.rand(-16, 16), y: groundY() - U.rand(10, 80),
        vx: U.rand(-15, 15), vy: U.rand(-60, -20),
        life: 0, max: U.rand(0.5, 1), color: '#6fe89a', size: U.rand(2, 3.5), grav: -30,
      });
    }
    floats.push({ x: heroX(), y: groundY() - 110, vy: -30, txt: '+HEAL', color: '#6fe89a', size: 15, life: 0, max: 1 });
  }

  function onBuff() {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      parts.push({
        x: heroX() + Math.cos(a) * 26, y: groundY() - 44 + Math.sin(a) * 34,
        vx: Math.cos(a) * 30, vy: -40,
        life: 0, max: 0.7, color: '#f6dfa0', size: 2.5, grav: -20,
      });
    }
  }

  function onPetHit(dmg) {
    if (!GQ.state.S.settings.dmgNumbers) return;
    floats.push({
      x: monX() + U.rand(-26, 26), y: groundY() - 60,
      vy: -30, txt: U.fmt(dmg), color: '#8fd0a0', size: 12, life: 0, max: 0.7,
    });
  }

  function onArc(dmg) {
    floats.push({
      x: monX() + U.rand(-20, 20), y: groundY() - 105,
      vy: -34, txt: '⚡' + U.fmt(dmg), color: '#9ecfff', size: 13, life: 0, max: 0.8,
    });
    if (GQ.state.S.settings.particles) {
      for (let i = 0; i < 6; i++) {
        parts.push({
          x: monX() + U.rand(-18, 18), y: groundY() - U.rand(30, 90),
          vx: U.rand(-60, 60), vy: U.rand(-80, 20),
          life: 0, max: U.rand(0.2, 0.45), color: '#cfe6ff', size: U.rand(1.5, 2.5), grav: 0,
        });
      }
    }
  }

  function onStun() {
    for (let i = 0; i < 12; i++) {
      parts.push({
        x: monX() + U.rand(-24, 24), y: groundY() - U.rand(30, 90),
        vx: U.rand(-25, 25), vy: U.rand(-40, 0),
        life: 0, max: 0.8, color: '#9ecfff', size: U.rand(2, 3.5), grav: 30,
      });
    }
    floats.push({ x: monX(), y: groundY() - 105, vy: -24, txt: 'STUNNED', color: '#9ecfff', size: 13, life: 0, max: 1 });
  }

  function onKill(m, gold) {
    const hue = m.sp.hue;
    if (GQ.state.S.settings.particles) {
      for (let i = 0; i < 26; i++) {
        parts.push({
          x: monX() + U.rand(-16, 16), y: groundY() - 40 + U.rand(-30, 10),
          vx: U.rand(-110, 110), vy: U.rand(-190, -20),
          life: 0, max: U.rand(0.5, 1.0),
          color: `hsl(${hue + U.rand(-14, 14)}, 65%, ${U.rand(48, 68)}%)`,
          size: U.rand(2, 4.5), grav: 340,
        });
      }
    }
    floats.push({
      x: monX(), y: groundY() - 118, vy: -30,
      txt: '+' + U.fmt(gold) + ' g', color: '#e6c15c', size: 13, life: 0, max: 1.0,
    });
  }

  function onSpawn() { spawnT = 0; }

  function onHeroDown() {
    if (GQ.state.S.settings.particles) {
      for (let i = 0; i < 16; i++) {
        parts.push({
          x: heroX() + U.rand(-14, 14), y: groundY() - 40 + U.rand(-30, 10),
          vx: U.rand(-70, 70), vy: U.rand(-140, -10),
          life: 0, max: U.rand(0.4, 0.9), color: '#f28d84', size: U.rand(2, 4), grav: 300,
        });
      }
    }
  }

  function onLevelUp() {
    levelGlow = 1;
    if (GQ.state.S.settings.particles) {
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2;
        parts.push({
          x: heroX(), y: groundY() - 46,
          vx: Math.cos(a) * U.rand(60, 170), vy: Math.sin(a) * U.rand(60, 170) - 60,
          life: 0, max: U.rand(0.6, 1.2), color: i % 2 ? '#f6dfa0' : '#e6c15c',
          size: U.rand(2, 4), grav: 120,
        });
      }
    }
  }

  function onDrop(rar) {
    const color = D.RARITIES[rar].color;
    if (!GQ.state.S.settings.particles) return;
    for (let i = 0; i < 8 + rar * 5; i++) {
      parts.push({
        x: monX() + U.rand(-10, 10), y: groundY() - 8,
        vx: U.rand(-40, 40), vy: U.rand(-230, -110),
        life: 0, max: U.rand(0.5, 1.1), color, size: U.rand(2, 3.5), grav: 260,
      });
    }
  }

  function onZoneChange() { zoneFade = 1; props = null; }

  /* ================= drawing ================= */

  function render(dt) {
    if (!api.ready || !GQ.state.S) return;
    t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) {
      shake *= Math.pow(0.002, dt);
      if (shake < 0.15) shake = 0;
      ctx.translate(U.rand(-shake, shake), U.rand(-shake, shake));
    }
    const z = GQ.engine ? GQ.engine.currentZone() : (D.ZONE_BY_ID[GQ.state.S.zoneId] || D.ZONES[0]);

    drawBackground(z);

    // world event atmosphere
    const ev = GQ.engine && GQ.engine.activeEvent();
    if (ev && ev.zoneId === GQ.state.S.zoneId) {
      ctx.fillStyle = ev.def.tint;
      ctx.fillRect(0, 0, W, H);
    }

    drawActors(z, dt);
    updateDrawParticles(dt);
    updateDrawFloats(dt);

    // boss banner
    if (banner.t > 0) {
      banner.t -= dt;
      const a = Math.min(1, banner.t / 0.6) * Math.min(1, (3 - banner.t) / 0.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = '700 26px Georgia';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(banner.text, W / 2 + 2, H * 0.26 + 2);
      ctx.fillStyle = '#f7526f';
      ctx.fillText(banner.text, W / 2, H * 0.26);
      ctx.restore();
    }

    // the shiny twinkles, briefly
    if (shiny) {
      shiny.t += dt;
      if (shiny.t >= D.BAL.shinyLife) {
        shiny = null;
      } else {
        const a = Math.min(1, shiny.t * 3) * Math.min(1, (D.BAL.shinyLife - shiny.t) / 0.8);
        const pulse = 1 + 0.25 * Math.sin(t * 7);
        ctx.save();
        ctx.globalAlpha = a;
        const sg = ctx.createRadialGradient(shiny.x, shiny.y, 1, shiny.x, shiny.y, 22 * pulse);
        sg.addColorStop(0, '#fff7d8');
        sg.addColorStop(0.4, '#f6dfa0');
        sg.addColorStop(1, 'rgba(246,223,160,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(shiny.x, shiny.y, 22 * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(15 * pulse)}px Georgia`;
        ctx.textAlign = 'center';
        ctx.fillText('✦', shiny.x, shiny.y + 5);
        ctx.restore();
      }
    }

    // trial clock
    const tr = GQ.engine.combat.trial;
    if (tr) {
      const def = D.TRIALS[tr.i];
      const urgent = tr.t < 10;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 30px Georgia';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(Math.ceil(tr.t) + 's', W / 2 + 2, 50);
      ctx.fillStyle = urgent ? '#f7526f' : '#f6dfa0';
      ctx.fillText(Math.ceil(tr.t) + 's', W / 2, 48);
      ctx.font = '700 15px Georgia';
      ctx.fillStyle = '#e8edf7';
      ctx.fillText(tr.kills + ' kills', W / 2, 70);
      ctx.font = '11px Georgia';
      ctx.fillStyle = '#8d97b2';
      ctx.fillText('bronze ' + def.medals[0] + '  ·  silver ' + def.medals[1] + '  ·  gold ' + def.medals[2], W / 2, 88);
      ctx.restore();
    }

    // low HP warning vignette
    const hpFrac = GQ.state.S.hero.hp / Math.max(1, GQ.state.drv.hpMax);
    if (hpFrac < 0.25 && GQ.engine.combat.recover <= 0) {
      const pulse = 0.25 + 0.15 * Math.sin(t * 6);
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      rg.addColorStop(0, 'rgba(200,30,30,0)');
      rg.addColorStop(1, `rgba(200,30,30,${pulse * (1 - hpFrac / 0.25)})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // zone fade transition
    if (zoneFade > 0) {
      zoneFade = Math.max(0, zoneFade - dt * 1.8);
      ctx.fillStyle = `rgba(6,8,16,${zoneFade})`;
      ctx.fillRect(0, 0, W, H);
    }
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,6,12,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackground(z) {
    const p = z.pal;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY());
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(1, p.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY());

    // celestial body
    const mx = W * 0.82, my = H * 0.18, mr = 26;
    const glow = ctx.createRadialGradient(mx, my, 2, mx, my, mr * 3.2);
    glow.addColorStop(0, hexA(p.accent, 0.5));
    glow.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 3.2, my - mr * 3.2, mr * 6.4, mr * 6.4);
    ctx.fillStyle = hexA('#ffffff', 0.85);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = p.skyTop;
    ctx.beginPath(); ctx.arc(mx - 9, my - 6, mr * 0.82, 0, 7); ctx.fill();

    if (!props || propsZone !== z.id) buildProps(z);

    // far hills
    drawRidge(props.hillFar, mixColor(p.ground, p.skyBot, 0.55), groundY() - 70);
    drawRidge(props.hillNear, mixColor(p.ground, p.skyBot, 0.25), groundY() - 30);

    // scenery silhouettes
    ctx.fillStyle = p.prop;
    for (const pr of props.items) drawProp(pr, z);

    // ground
    const gnd = ctx.createLinearGradient(0, groundY(), 0, H);
    gnd.addColorStop(0, p.ground);
    gnd.addColorStop(1, mixColor(p.ground, '#05070d', 0.65));
    ctx.fillStyle = gnd;
    ctx.fillRect(0, groundY(), W, H - groundY());
    // ground texture strokes
    ctx.strokeStyle = hexA('#000000', 0.16);
    ctx.lineWidth = 1;
    for (const g of props.grass) {
      ctx.beginPath();
      ctx.moveTo(g.x, groundY() + g.y);
      ctx.lineTo(g.x + g.w, groundY() + g.y);
      ctx.stroke();
    }

    // drifting fog bands
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const fy = groundY() - 14 - i * 26;
      const off = Math.sin(t * 0.07 + i * 2.1) * 40;
      const fg = ctx.createLinearGradient(0, fy - 16, 0, fy + 18);
      fg.addColorStop(0, hexA(p.skyBot, 0));
      fg.addColorStop(0.5, hexA(p.skyBot, 0.13));
      fg.addColorStop(1, hexA(p.skyBot, 0));
      ctx.fillStyle = fg;
      ctx.fillRect(-60 + off, fy - 16, W + 120, 34);
    }
    ctx.restore();

    updateDrawAmbient(z);
  }

  function buildProps(z) {
    propsZone = z.id;
    const rng = U.mulberry32(U.hashStr(z.id) ^ 0x9e3779b9);
    const items = [];
    const type = z.props;
    const count = 9;
    for (let i = 0; i < count; i++) {
      const x = 20 + rng() * (W - 40);
      const s = 0.5 + rng() * 0.9;
      items.push({ type, x, s, r1: rng(), r2: rng(), r3: rng() });
    }
    // hills as jagged ridge points
    const hillFar = [], hillNear = [];
    for (let i = 0; i <= 16; i++) {
      hillFar.push({ x: (W / 16) * i, y: rng() * 46 });
      hillNear.push({ x: (W / 16) * i, y: rng() * 30 });
    }
    const grass = [];
    for (let i = 0; i < 26; i++) {
      grass.push({ x: rng() * W, y: 8 + rng() * (H - groundY() - 14), w: 12 + rng() * 40 });
    }
    props = { items, hillFar, hillNear, grass };

    // rebuild ambient
    ambient = [];
    const n = 34;
    for (let i = 0; i < n; i++) {
      ambient.push({
        x: Math.random() * W, y: Math.random() * H * 0.9,
        sp: U.rand(4, 16), ph: Math.random() * 7, sz: U.rand(1, 2.6),
      });
    }
  }

  function drawRidge(points, color, baseY) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, baseY + 80);
    for (const pt of points) ctx.lineTo(pt.x, baseY - pt.y);
    ctx.lineTo(W + 10, baseY + 80);
    ctx.closePath();
    ctx.fill();
  }

  function drawProp(pr, z) {
    const gy = groundY() + 2;
    const s = pr.s;
    const x = pr.x;
    ctx.save();
    ctx.globalAlpha = 0.55 + pr.r3 * 0.35;
    switch (pr.type) {
      case 'meadow': { // round tree
        const h = 60 * s;
        ctx.fillRect(x - 3 * s, gy - h * 0.5, 6 * s, h * 0.5);
        ctx.beginPath(); ctx.arc(x, gy - h * 0.62, 24 * s, 0, 7); ctx.fill();
        break;
      }
      case 'forest': { // pine
        const h = 110 * s;
        for (let i = 0; i < 3; i++) {
          const w = (34 - i * 8) * s, yy = gy - h * (0.3 + i * 0.28);
          tri(x, yy - 30 * s, w);
        }
        ctx.fillRect(x - 3 * s, gy - h * 0.25, 6 * s, h * 0.25);
        break;
      }
      case 'camp': { // tent or spike
        if (pr.r1 > 0.5) { tri(x, gy - 44 * s, 40 * s); }
        else { ctx.fillRect(x - 2, gy - 60 * s, 4, 60 * s); tri(x, gy - 66 * s, 10 * s); }
        break;
      }
      case 'cavern': { // stalagmite + hanging stalactite
        tri(x, gy - 60 * s, 22 * s);
        ctx.beginPath();
        ctx.moveTo(x - 16 * s + 30, 0); ctx.lineTo(x + 16 * s + 30, 0); ctx.lineTo(x + 30, 54 * s);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'marsh': { // cattails / twisted tree
        if (pr.r1 > 0.4) {
          for (let i = 0; i < 3; i++) {
            const xx = x + i * 7 * s;
            ctx.fillRect(xx, gy - 40 * s - i * 6, 2, 40 * s + i * 6);
            ctx.fillRect(xx - 2, gy - 46 * s - i * 6, 6, 12 * s);
          }
        } else {
          ctx.fillRect(x - 3 * s, gy - 70 * s, 6 * s, 70 * s);
          ctx.fillRect(x - 24 * s, gy - 66 * s, 30 * s, 4 * s);
          ctx.fillRect(x, gy - 52 * s, 28 * s, 4 * s);
        }
        break;
      }
      case 'ember': { // jagged rock
        ctx.beginPath();
        ctx.moveTo(x - 26 * s, gy);
        ctx.lineTo(x - 8 * s, gy - 52 * s);
        ctx.lineTo(x + 4 * s, gy - 26 * s);
        ctx.lineTo(x + 16 * s, gy - 60 * s);
        ctx.lineTo(x + 30 * s, gy);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'frost': { // snowy pine
        for (let i = 0; i < 3; i++) tri(x, gy - (36 + i * 26) * s, (32 - i * 8) * s);
        break;
      }
      case 'temple': { // pillar
        const h = (70 + pr.r1 * 40) * s;
        ctx.fillRect(x - 8 * s, gy - h, 16 * s, h);
        ctx.fillRect(x - 13 * s, gy - h - 7 * s, 26 * s, 8 * s);
        if (pr.r2 > 0.6) ctx.fillRect(x - 13 * s, gy - h - 15 * s, 26 * s, 5 * s);
        break;
      }
      case 'ridge': { // rib bones / spikes
        ctx.beginPath();
        ctx.moveTo(x - 20 * s, gy);
        ctx.quadraticCurveTo(x - 26 * s, gy - 90 * s, x + 8 * s, gy - 100 * s);
        ctx.quadraticCurveTo(x - 10 * s, gy - 84 * s, x - 8 * s, gy);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'rift': { // floating shard
        const bob = Math.sin(t * 0.7 + pr.r1 * 7) * 6;
        const yy = gy - 70 * s + bob;
        ctx.save();
        ctx.translate(x, yy);
        ctx.rotate(pr.r2 * 0.8 - 0.4);
        ctx.beginPath();
        ctx.moveTo(0, -26 * s); ctx.lineTo(12 * s, 0); ctx.lineTo(0, 30 * s); ctx.lineTo(-12 * s, 0);
        ctx.closePath();
        ctx.fillStyle = hexA(z.pal.prop, 0.9);
        ctx.fill();
        ctx.strokeStyle = hexA(z.pal.accent, 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
    ctx.restore();

    function tri(cx, cy, w) {
      ctx.beginPath();
      ctx.moveTo(cx - w, gy < cy ? cy : gy);
      ctx.moveTo(cx - w, Math.max(cy + 30 * s, cy));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - w, cy + 44 * s);
      ctx.lineTo(cx + w, cy + 44 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  function updateDrawAmbient(z) {
    const kind = z.pal.ambient;
    const col = z.pal.ambColor;
    ctx.save();
    for (const a of ambient) {
      let x = a.x, y = a.y, alpha = 0.5, sz = a.sz;
      switch (kind) {
        case 'snow':
          y = (a.y + t * a.sp * 2.4) % (H + 10);
          x = a.x + Math.sin(t * 0.8 + a.ph) * 14;
          alpha = 0.7;
          break;
        case 'embers':
          y = H - ((a.y * 0.5 + t * a.sp * 2.2) % (H + 10));
          x = a.x + Math.sin(t * 1.1 + a.ph) * 10;
          alpha = 0.35 + 0.3 * Math.sin(t * 3 + a.ph);
          break;
        case 'bubbles':
          y = H - ((a.y * 0.6 + t * a.sp * 1.6) % (H + 10));
          x = a.x + Math.sin(t * 1.4 + a.ph) * 6;
          alpha = 0.3;
          break;
        case 'fireflies':
          x = a.x + Math.sin(t * 0.5 + a.ph) * 26;
          y = a.y + Math.cos(t * 0.4 + a.ph * 2) * 16;
          alpha = 0.25 + 0.55 * Math.max(0, Math.sin(t * 1.8 + a.ph * 3));
          sz = a.sz * 0.8;
          break;
        case 'void':
          x = a.x + Math.sin(t * 0.3 + a.ph) * 30;
          y = (a.y + t * a.sp * 0.8) % (H + 10);
          alpha = 0.3 + 0.3 * Math.sin(t * 2 + a.ph);
          break;
        default: // motes
          x = a.x + Math.sin(t * 0.4 + a.ph) * 18;
          y = (a.y + t * a.sp * 0.6) % (H + 10);
          alpha = 0.28;
      }
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- actors ---------- */

  function drawActors(z, dt) {
    heroLunge = Math.max(0, heroLunge - dt * 5);
    heroHurt = Math.max(0, heroHurt - dt * 4);
    monFlash = Math.max(0, monFlash - dt * 6);
    levelGlow = Math.max(0, levelGlow - dt * 1.2);
    spawnT = Math.min(1, spawnT + dt * 4);

    const S = GQ.state.S;
    const drv = GQ.state.drv;
    const combat = GQ.engine.combat;
    const gy = groundY();
    const hx = heroX() + U.easeOut(heroLunge) * 26;

    // the Solid Gold Boar (it does nothing, magnificently)
    if (S.shop && S.shop.boar > 0) {
      const bx = W * 0.09;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.08 * Math.sin(t * 1.4);
      const bg = ctx.createRadialGradient(bx, gy - 30, 4, bx, gy - 30, 52);
      bg.addColorStop(0, '#f6dfa0');
      bg.addColorStop(1, 'rgba(246,223,160,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, gy - 30, 52, 0, 7); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#2a2438';
      ctx.fillRect(bx - 26, gy - 6, 52, 8);
      ctx.translate(bx, gy - 5);
      ctx.scale(0.45, 0.45);
      drawMonster(ctx, { shape: 'beast', hue: 46, size: 1 }, 0, 0);
      ctx.restore();
    }

    // shadows
    shadow(heroX(), gy, 34);
    if (combat.monster) shadow(monX(), gy, 40 * combat.monster.sp.size);

    // level-up glow ring
    if (levelGlow > 0) {
      ctx.save();
      ctx.globalAlpha = levelGlow * 0.6;
      ctx.strokeStyle = '#f6dfa0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(heroX(), gy - 44, 20 + (1 - levelGlow) * 70, 0, 7);
      ctx.stroke();
      ctx.restore();
    }

    // hero (weapon glows with its rarity)
    const recovering = combat.recover > 0;
    const wpn = S.hero.equipment.weapon;
    if (wpn && wpn.rar >= 2 && !recovering) {
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 2.6);
      const wg = ctx.createRadialGradient(hx + 14, gy - 70, 2, hx + 14, gy - 70, 34);
      wg.addColorStop(0, D.RARITIES[wpn.rar].color);
      wg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(hx + 14, gy - 70, 34, 0, 7); ctx.fill();
      ctx.restore();
    }
    drawHero(ctx, hx, gy, t, GQ.state.heroClass(), { hurt: heroHurt, down: recovering });

    // the companion, at heel (a much smaller boss, facing the fight)
    const petKey = S.pets && S.pets.active;
    if (petKey && S.pets.owned[petKey] && D.BOSSES[petKey] && !recovering) {
      const b = D.BOSSES[petKey];
      shadow(heroX() - 56, gy, 14);
      ctx.save();
      ctx.translate(heroX() - 56, gy + Math.sin(t * 3.1) * 1.5);
      ctx.scale(-0.32 * b.size, 0.32 * b.size);
      drawMonster(ctx, { shape: b.shape, hue: b.hue, size: 1 }, t * 1.4, 0);
      ctx.restore();
    }

    // hero bar + name
    nameBar(heroX(), gy - 128, U.esc ? S.hero.name : S.hero.name, S.hero.hp / Math.max(1, drv.hpMax),
      '#e0554f', '#f28d84', recovering ? 'Recovering…' : null);

    // monster
    if (combat.monster) {
      const m = combat.monster;
      const scale = (0.5 + 0.5 * U.easeOut(spawnT)) * (m.elite ? 1.22 : 1);
      const mx = monX() - U.easeOut(monLunge) * 18;
      if (m.elite || m.bossZone) {
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 3.2);
        ctx.strokeStyle = m.bossZone ? (m.enraged ? '#f7526f' : '#e06a6a') : '#f6dfa0';
        ctx.lineWidth = m.bossZone ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.ellipse(mx, gy + 4, 46 * m.sp.size, 11 * m.sp.size, 0, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
      if (m.enraged) {
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.14 * Math.sin(t * 8);
        const eg = ctx.createRadialGradient(mx, gy - 50, 8, mx, gy - 50, 90 * m.sp.size);
        eg.addColorStop(0, '#f7526f');
        eg.addColorStop(1, 'rgba(247,82,111,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(mx, gy - 50, 90 * m.sp.size, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (m.stun > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.font = '13px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9ecfff';
        const sx = mx + Math.cos(t * 5) * 16;
        ctx.fillText('✦', sx, gy - 110 * m.sp.size * 0.8);
        ctx.fillText('✦', mx - Math.cos(t * 5) * 16, gy - 118 * m.sp.size * 0.8);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(mx, gy);
      ctx.scale(scale * m.sp.size, scale * m.sp.size);
      drawMonster(ctx, m.sp, t, monFlash);
      ctx.restore();
      if (m.goblin && GQ.state.S.settings.particles && Math.random() < 0.25) {
        parts.push({
          x: mx + U.rand(-20, 20), y: gy - U.rand(10, 60),
          vx: U.rand(-15, 15), vy: U.rand(-50, -10),
          life: 0, max: 0.5, color: '#f6dfa0', size: U.rand(1.2, 2.2), grav: 60,
        });
      }
      nameBar(monX(), gy - 128, (m.goblin ? '💰 ' : m.bossZone ? '☠ ' : m.elite ? '★ ' : '') + m.name + (m.enraged ? ' — ENRAGED' : ''),
        m.hp / m.hpMax, '#b0483f', '#e0837a',
        m.goblin ? 'flees in ' + Math.ceil(Math.max(0, m.fleeT)) + 's' : null,
        m.goblin ? '#f6dfa0' : m.bossZone ? (m.enraged ? '#f7526f' : '#f28d84') : m.elite ? '#f6dfa0' : '#e8edf7');
    } else if (!recovering) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 4);
      ctx.fillStyle = '#cdd6e4';
      ctx.font = 'italic 12px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('something stirs…', monX(), gy - 60);
      ctx.restore();
    }

    if (recovering) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,10,18,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f28d84';
      ctx.font = '700 17px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('K N O C K E D   O U T', W / 2, H * 0.4);
      ctx.font = '12px Georgia';
      ctx.fillStyle = '#cdd6e4';
      ctx.fillText('recovering ' + Math.ceil(combat.recover) + 's…', W / 2, H * 0.4 + 22);
      ctx.restore();
    }
  }

  function shadow(x, y, r) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, r, r * 0.22, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  function nameBar(x, y, name, hp01, c1, c2, sub, nameColor) {
    hp01 = U.clamp(hp01, 0, 1);
    const w = 108;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 12px Georgia';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(name, x + 1, y + 1);
    ctx.fillStyle = nameColor || '#e8edf7';
    ctx.fillText(name, x, y);
    // bar
    ctx.fillStyle = 'rgba(6,8,14,0.8)';
    roundRect(x - w / 2, y + 6, w, 8, 4);
    ctx.fill();
    if (hp01 > 0) {
      const g = ctx.createLinearGradient(0, y + 6, 0, y + 14);
      g.addColorStop(0, c2); g.addColorStop(1, c1);
      ctx.fillStyle = g;
      roundRect(x - w / 2 + 1, y + 7, (w - 2) * hp01, 6, 3);
      ctx.fill();
    }
    if (sub) {
      ctx.font = 'italic 10px Georgia';
      ctx.fillStyle = '#f28d84';
      ctx.fillText(sub, x, y + 26);
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- hero ---------- */

  function drawHero(c, x, y, time, cls, opts) {
    opts = opts || {};
    const bob = opts.down ? 0 : Math.sin(time * 2.4) * 2.5;
    c.save();
    c.translate(x, y + bob);
    if (opts.down) {
      c.rotate(-Math.PI / 2.2);
      c.translate(0, 26);
    }
    if (opts.hurt > 0) c.translate(U.rand(-1.5, 1.5), 0);

    const tint = cls.tint, metal = cls.metal;

    // cape
    c.fillStyle = shade(tint, -25);
    c.beginPath();
    c.moveTo(-6, -74);
    c.quadraticCurveTo(-26 - Math.sin(time * 2) * 4, -40, -16, -6);
    c.lineTo(-4, -12);
    c.closePath();
    c.fill();

    // legs
    c.fillStyle = '#2a3040';
    c.fillRect(-9, -30, 7, 30);
    c.fillRect(2, -30, 7, 30);
    c.fillStyle = '#1c202c';
    c.fillRect(-10, -6, 9, 6);
    c.fillRect(1, -6, 9, 6);

    // torso
    c.fillStyle = metal;
    roundRectOn(c, -12, -66, 24, 38, 6);
    c.fill();
    c.fillStyle = shade(metal, -30);
    c.fillRect(-12, -48, 24, 4);
    // belt
    c.fillStyle = '#3a2c1a';
    c.fillRect(-12, -34, 24, 5);
    c.fillStyle = '#e6c15c';
    c.fillRect(-3, -34, 6, 5);

    // head
    if (cls.key === 'mage') {
      c.fillStyle = '#e8c9a8';
      c.beginPath(); c.arc(0, -78, 9, 0, 7); c.fill();
      c.fillStyle = shade(tint, -10);
      c.beginPath();
      c.moveTo(-14, -80); c.lineTo(14, -80); c.lineTo(0, -108);
      c.closePath(); c.fill();
      c.fillRect(-16, -82, 32, 4);
    } else if (cls.key === 'ranger') {
      c.fillStyle = '#e8c9a8';
      c.beginPath(); c.arc(0, -78, 9, 0, 7); c.fill();
      c.fillStyle = shade(tint, -18);
      c.beginPath();
      c.arc(0, -80, 10.5, Math.PI * 0.95, Math.PI * 2.05);
      c.lineTo(11, -72);
      c.lineTo(-11, -72);
      c.closePath(); c.fill();
    } else {
      c.fillStyle = metal;
      c.beginPath(); c.arc(0, -78, 10, 0, 7); c.fill();
      c.fillStyle = '#10141f';
      c.fillRect(-7, -80, 14, 4);
      c.fillStyle = tint;
      c.beginPath();
      c.moveTo(0, -88); c.quadraticCurveTo(10, -96, 16, -86);
      c.quadraticCurveTo(8, -88, 2, -84);
      c.closePath(); c.fill();
    }

    // weapon arm
    c.save();
    c.translate(10, -56);
    c.rotate(opts.down ? 0.8 : -0.5 + Math.sin(time * 2.4) * 0.06);
    c.fillStyle = metal;
    c.fillRect(-2, 0, 5, 16);
    if (cls.key === 'mage') {
      c.strokeStyle = '#6a4a2a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 16); c.lineTo(4, -30); c.stroke();
      c.fillStyle = tint;
      c.beginPath(); c.arc(4.5, -33, 5, 0, 7); c.fill();
      c.fillStyle = hexA('#ffffff', 0.6);
      c.beginPath(); c.arc(3, -34.5, 1.8, 0, 7); c.fill();
    } else if (cls.key === 'ranger') {
      c.strokeStyle = '#5a4326'; c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(2, 24);
      c.quadraticCurveTo(16, 0, 2, -26);
      c.stroke();
      c.strokeStyle = hexA('#ffffff', 0.5); c.lineWidth = 1;
      c.beginPath(); c.moveTo(2, 24); c.lineTo(2, -26); c.stroke();
    } else {
      c.fillStyle = '#cfd8e8';
      c.beginPath();
      c.moveTo(-1, 14); c.lineTo(5, 14); c.lineTo(4, -26); c.lineTo(2, -32); c.lineTo(0, -26);
      c.closePath(); c.fill();
      c.fillStyle = '#8a6a2a';
      c.fillRect(-5, 10, 14, 4);
    }
    c.restore();

    // off arm
    c.fillStyle = shade(metal, -15);
    c.fillRect(-14, -58, 5, 18);

    c.restore();
  }

  function roundRectOn(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------- monsters ---------- */
  // All drawn facing left, feet at (0,0), roughly 90px tall at scale 1.

  function drawMonster(c, sp, time, flash) {
    const hue = sp.hue;
    const body = `hsl(${hue}, 42%, 40%)`;
    const dark = `hsl(${hue}, 45%, 26%)`;
    const lite = `hsl(${hue}, 55%, 58%)`;
    const bob = Math.sin(time * 2.1 + hue) * 3;

    c.save();
    c.translate(0, bob * 0.5);

    switch (sp.shape) {
      case 'slime': {
        const squish = 1 + Math.sin(time * 3.2) * 0.06;
        c.save();
        c.scale(1 / squish, squish);
        const g = c.createRadialGradient(-8, -46, 4, 0, -34, 42);
        g.addColorStop(0, lite); g.addColorStop(1, body);
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-36, 0);
        c.bezierCurveTo(-42, -52, -14, -66, 0, -64);
        c.bezierCurveTo(22, -66, 44, -44, 36, 0);
        c.closePath();
        c.fill();
        c.fillStyle = hexA('#ffffff', 0.35);
        c.beginPath(); c.ellipse(-12, -48, 8, 5, -0.5, 0, 7); c.fill();
        eyes(c, -14, -34, 5, hue);
        c.restore();
        break;
      }
      case 'beast': {
        c.fillStyle = body;
        c.beginPath(); c.ellipse(6, -30, 34, 20, 0.05, 0, 7); c.fill();
        // head
        c.fillStyle = lite;
        c.beginPath(); c.ellipse(-30, -44, 15, 12, -0.15, 0, 7); c.fill();
        // snout
        c.fillStyle = dark;
        c.beginPath(); c.ellipse(-42, -40, 8, 5, -0.1, 0, 7); c.fill();
        // ears
        c.fillStyle = body;
        tri3(c, -34, -56, -28, -68, -24, -54);
        tri3(c, -26, -56, -20, -66, -16, -52);
        // legs
        c.fillStyle = dark;
        c.fillRect(-18, -14, 7, 14);
        c.fillRect(-2, -14, 7, 14);
        c.fillRect(14, -14, 7, 14);
        c.fillRect(26, -14, 7, 14);
        // tail
        c.strokeStyle = body; c.lineWidth = 5;
        c.beginPath(); c.moveTo(38, -34);
        c.quadraticCurveTo(52, -44 + Math.sin(time * 4) * 4, 56, -30);
        c.stroke();
        eyes(c, -34, -47, 3.4, hue);
        break;
      }
      case 'wisp': {
        const g = c.createRadialGradient(0, -44, 2, 0, -44, 34);
        g.addColorStop(0, hexA(lite, 0.95));
        g.addColorStop(0.55, hexA(body, 0.5));
        g.addColorStop(1, hexA(body, 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(0, -44, 34, 0, 7); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(0, -44, 8 + Math.sin(time * 5) * 1.5, 0, 7); c.fill();
        for (let i = 0; i < 3; i++) {
          const a = time * 1.8 + i * 2.1;
          c.fillStyle = hexA(lite, 0.7);
          c.beginPath();
          c.arc(Math.cos(a) * 24, -44 + Math.sin(a) * 14, 3, 0, 7);
          c.fill();
        }
        eyes(c, -5, -46, 3, hue, '#1a1030');
        break;
      }
      case 'humanoid': {
        // legs
        c.fillStyle = dark;
        c.fillRect(-10, -22, 8, 22);
        c.fillRect(3, -22, 8, 22);
        // torso
        c.fillStyle = body;
        roundRectOn(c, -14, -58, 28, 38, 6); c.fill();
        // rag/armor line
        c.fillStyle = dark;
        c.fillRect(-14, -34, 28, 5);
        // head
        c.fillStyle = lite;
        c.beginPath(); c.arc(-2, -68, 11, 0, 7); c.fill();
        // ears
        tri3(c, -13, -70, -22, -74, -12, -64);
        tri3(c, 9, -70, 18, -74, 8, -64);
        // weapon arm with club
        c.save();
        c.translate(-14, -50);
        c.rotate(0.5 + Math.sin(time * 2.6) * 0.1);
        c.fillStyle = dark;
        c.fillRect(-3, 0, 6, 14);
        c.fillStyle = '#5a4326';
        c.fillRect(-2.5, 8, 5, 22);
        c.beginPath(); c.arc(0, 32, 7, 0, 7); c.fillStyle = '#4a3620'; c.fill();
        c.restore();
        eyes(c, -7, -70, 3.2, hue);
        break;
      }
      case 'spider': {
        // legs
        c.strokeStyle = dark; c.lineWidth = 3.5; c.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const a = -0.7 + i * 0.42 + Math.sin(time * 6 + i) * 0.05;
          c.beginPath();
          c.moveTo(0, -30);
          c.lineTo(Math.cos(a + Math.PI) * 34, -30 + Math.sin(a) * 10 + 8);
          c.lineTo(Math.cos(a + Math.PI) * 46, 0);
          c.stroke();
          c.beginPath();
          c.moveTo(0, -30);
          c.lineTo(Math.cos(a) * 34, -30 + Math.sin(a) * 10 + 8);
          c.lineTo(Math.cos(a) * 46, 0);
          c.stroke();
        }
        // abdomen
        const g2 = c.createRadialGradient(10, -40, 3, 14, -36, 26);
        g2.addColorStop(0, lite); g2.addColorStop(1, body);
        c.fillStyle = g2;
        c.beginPath(); c.ellipse(14, -36, 22, 18, 0.2, 0, 7); c.fill();
        // head
        c.fillStyle = dark;
        c.beginPath(); c.arc(-16, -30, 12, 0, 7); c.fill();
        // many eyes
        c.fillStyle = '#ffdf70';
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.arc(-24 + (i % 2) * 7, -36 + Math.floor(i / 2) * 6, 2, 0, 7);
          c.fill();
        }
        break;
      }
      case 'serpent': {
        c.strokeStyle = body; c.lineWidth = 16; c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i <= 14; i++) {
          const px = 34 - i * 5;
          const py = -14 - Math.sin(i * 0.55 + time * 2.4) * 10 - i * 1.6;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
        // head
        const hx2 = 34 - 14 * 5, hy2 = -14 - Math.sin(14 * 0.55 + time * 2.4) * 10 - 14 * 1.6;
        c.fillStyle = lite;
        c.beginPath(); c.ellipse(hx2 - 6, hy2, 14, 10, -0.15, 0, 7); c.fill();
        // fangs
        c.fillStyle = '#fff';
        tri3(c, hx2 - 16, hy2 + 4, hx2 - 14, hy2 + 12, hx2 - 12, hy2 + 4);
        eyes(c, hx2 - 10, hy2 - 3, 3, hue);
        break;
      }
      case 'golem': {
        const g3 = c.createLinearGradient(0, -80, 0, 0);
        g3.addColorStop(0, lite); g3.addColorStop(1, dark);
        // legs
        c.fillStyle = dark;
        roundRectOn(c, -26, -24, 16, 24, 4); c.fill();
        roundRectOn(c, 10, -24, 16, 24, 4); c.fill();
        // torso
        c.fillStyle = g3;
        roundRectOn(c, -30, -70, 60, 48, 10); c.fill();
        // head
        c.fillStyle = body;
        roundRectOn(c, -14, -88, 28, 20, 5); c.fill();
        // arms
        c.fillStyle = dark;
        roundRectOn(c, -44, -64, 13, 36, 5); c.fill();
        roundRectOn(c, 31, -64, 13, 36, 5); c.fill();
        // glowing cracks
        c.strokeStyle = `hsl(${hue}, 90%, 65%)`;
        c.lineWidth = 2;
        c.globalAlpha = 0.6 + 0.3 * Math.sin(time * 3);
        c.beginPath();
        c.moveTo(-12, -60); c.lineTo(-4, -50); c.lineTo(-10, -40);
        c.moveTo(10, -64); c.lineTo(16, -52);
        c.stroke();
        c.globalAlpha = 1;
        eyes(c, -6, -80, 3.4, hue);
        break;
      }
      case 'dragon': {
        // wings
        const flap = Math.sin(time * 3.4) * 0.35;
        c.fillStyle = hexA(dark, 0.85);
        c.save();
        c.translate(8, -52);
        c.rotate(-0.3 + flap);
        tri3(c, 0, 0, 44, -30, 30, 6);
        c.restore();
        c.save();
        c.translate(16, -50);
        c.rotate(0.15 + flap * 0.7);
        tri3(c, 0, 0, 48, -22, 34, 10);
        c.restore();
        // body
        c.fillStyle = body;
        c.beginPath(); c.ellipse(6, -34, 30, 18, 0.1, 0, 7); c.fill();
        // neck + head
        c.fillStyle = body;
        c.beginPath();
        c.moveTo(-18, -40);
        c.quadraticCurveTo(-30, -58, -34, -66);
        c.lineTo(-22, -70);
        c.quadraticCurveTo(-16, -52, -8, -44);
        c.closePath(); c.fill();
        c.fillStyle = lite;
        c.beginPath(); c.ellipse(-32, -68, 12, 8, -0.3, 0, 7); c.fill();
        // horns
        c.fillStyle = '#e8e0d0';
        tri3(c, -28, -74, -24, -86, -22, -72);
        // tail
        c.strokeStyle = body; c.lineWidth = 7; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(32, -30);
        c.quadraticCurveTo(52, -26 + Math.sin(time * 2.5) * 5, 58, -40);
        c.stroke();
        // legs
        c.fillStyle = dark;
        c.fillRect(-10, -18, 8, 18);
        c.fillRect(14, -18, 8, 18);
        eyes(c, -36, -70, 3, hue);
        break;
      }
      case 'bat': {
        const fl = Math.sin(time * 7) * 0.5;
        const fy = -52 + Math.sin(time * 3.5) * 6;
        c.fillStyle = dark;
        c.save(); c.translate(-4, fy); c.rotate(-fl * 0.6);
        tri3(c, 0, 0, -36, -16, -30, 10); c.restore();
        c.save(); c.translate(4, fy); c.rotate(fl * 0.6);
        tri3(c, 0, 0, 36, -16, 30, 10); c.restore();
        c.fillStyle = body;
        c.beginPath(); c.ellipse(0, fy, 12, 15, 0, 0, 7); c.fill();
        tri3(c, -8, fy - 12, -6, fy - 22, -2, fy - 12);
        tri3(c, 8, fy - 12, 6, fy - 22, 2, fy - 12);
        eyes(c, -4, fy - 4, 3, hue);
        break;
      }
    }

    // hit flash
    if (flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = flash * 0.55;
      const fg = c.createRadialGradient(0, -40, 4, 0, -40, 56);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(0, -40, 56, 0, 7); c.fill();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();

    function tri3(cc, x1, y1, x2, y2, x3, y3) {
      cc.beginPath(); cc.moveTo(x1, y1); cc.lineTo(x2, y2); cc.lineTo(x3, y3);
      cc.closePath(); cc.fill();
    }
  }

  function eyes(c, x, y, r, hue, pupil) {
    c.fillStyle = `hsl(${(hue + 180) % 360}, 90%, 72%)`;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.beginPath(); c.arc(x + r * 2.4, y, r * 0.85, 0, 7); c.fill();
    c.fillStyle = pupil || '#141824';
    c.beginPath(); c.arc(x - r * 0.25, y, r * 0.45, 0, 7); c.fill();
    c.beginPath(); c.arc(x + r * 2.2, y, r * 0.4, 0, 7); c.fill();
  }

  /* ---------- particles & floats ---------- */

  function updateDrawParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function updateDrawFloats(dt) {
    ctx.textAlign = 'center';
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life += dt;
      if (f.life >= f.max) { floats.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= (1 - dt * 1.6);
      const a = 1 - Math.pow(f.life / f.max, 2);
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px Georgia`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.txt, f.x + 1.5, f.y + 1.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- portrait ---------- */

  function drawPortrait(canvas) {
    const c = canvas.getContext('2d');
    const s = canvas.width;
    c.clearRect(0, 0, s, s);
    const cls = GQ.state.heroClass();
    c.save();
    c.translate(s / 2, s * 0.94);
    c.scale(0.62, 0.62);
    drawHero(c, 0, 0, 1.2, cls, {});
    c.restore();
  }

  /* ---------- color helpers ---------- */

  function hexA(hex, a) {
    if (hex.startsWith('hsl')) return hex.replace(')', `, ${a})`).replace('hsl', 'hsla');
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function mixColor(h1, h2, m) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - m) + ((b >> 16) & 255) * m);
    const g = Math.round(((a >> 8) & 255) * (1 - m) + ((b >> 8) & 255) * m);
    const bl = Math.round((a & 255) * (1 - m) + (b & 255) * m);
    return `rgb(${r},${g},${bl})`;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = U.clamp(((n >> 16) & 255) + amt, 0, 255);
    const g = U.clamp(((n >> 8) & 255) + amt, 0, 255);
    const b = U.clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  api.init = init;
  api.render = render;
  api.onPlayerHit = onPlayerHit;
  api.onHeroHit = onHeroHit;
  api.onKill = onKill;
  api.onSpawn = onSpawn;
  api.onHeroDown = onHeroDown;
  api.onLevelUp = onLevelUp;
  api.onDrop = onDrop;
  api.onZoneChange = onZoneChange;
  api.addShake = addShake;
  api.onBossStart = onBossStart;
  api.onHeal = onHeal;
  api.onBuff = onBuff;
  api.onStun = onStun;
  api.onArc = onArc;
  api.onPetHit = onPetHit;
  api.hasShiny = hasShiny;
  api.spawnShiny = spawnShiny;
  api.drawPortrait = drawPortrait;
  api.drawHeroFn = drawHero;
  return api;
})();
