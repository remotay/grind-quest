/* Grind Quest — boot & main loop */
GQ.main = (() => {
  const U = GQ.util;
  const D = GQ.data;

  let lastTs = 0;
  let running = false;
  let saveTimer = 0;
  let tipTimer = 200;
  let tipIdx = 0;

  function boot() {
    GQ.ui.init();
    GQ.scene.init(document.getElementById('scene'));

    if (GQ.state.load()) {
      startGame(true);
    } else {
      GQ.ui.showIntro((name, cls) => {
        GQ.state.newGame(name, cls);
        startGame(false);
        GQ.ui.log(`Welcome, <b>${U.esc(name)}</b> the ${GQ.state.heroClass().name}. All ten hunting grounds are open. Nine of them will flatten you. Fix that.`, 'sys');
      });
    }
  }

  function startGame(fromSave) {
    GQ.state.recalc();
    GQ.ui.markDirty('char', 'inv', 'zones', 'res', 'zonehdr', 'records');

    if (fromSave) {
      const gap = (Date.now() - (GQ.state.S.lastSeen || Date.now())) / 1000;
      if (gap > 90) {
        const rep = GQ.engine.offline(gap);
        if (rep && (rep.kills >= 1 || rep.gold > 0)) {
          GQ.ui.offlineModal(rep);
          GQ.ui.markDirty('char', 'inv', 'zones', 'res');
        }
      }
      GQ.ui.log(`Welcome back, <b>${U.esc(GQ.state.S.hero.name)}</b>.`, 'sys');
    }

    GQ.state.save();
    if (!running) {
      running = true;
      lastTs = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function loop(ts) {
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (dt > 5) {
      // tab was hidden; fast-forward up to 60s, hand longer gaps to offline calc
      if (dt > 60) {
        const rep = GQ.engine.offline(dt);
        if (rep && rep.kills >= 5) GQ.ui.offlineModal(rep);
        GQ.ui.markDirty('char', 'inv', 'zones', 'res');
        dt = 0.05;
      } else {
        let remain = dt;
        let guard = 0;
        while (remain > 0 && guard++ < 400) {
          GQ.engine.tick(Math.min(0.2, remain));
          remain -= 0.2;
        }
        dt = 0.05;
      }
    }
    dt = Math.min(dt, 0.25);

    GQ.engine.tick(dt);
    GQ.scene.render(dt);
    GQ.ui.tickUI(dt);

    saveTimer += dt;
    if (saveTimer >= 15) {
      saveTimer = 0;
      GQ.state.save();
    }

    tipTimer += dt;
    if (tipTimer >= 240) {
      tipTimer = 0;
      GQ.ui.log(D.TIPS[tipIdx % D.TIPS.length], 'sys');
      tipIdx++;
    }

    requestAnimationFrame(loop);
  }

  // browsers require a user gesture before audio can start
  const wakeAudio = () => GQ.audio.ensure();
  window.addEventListener('pointerdown', wakeAudio);
  window.addEventListener('keydown', wakeAudio);

  window.addEventListener('beforeunload', () => GQ.state.save());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) GQ.state.save();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // debug helpers (console only)
  const debug = {
    gold: n => { GQ.state.S.hero.gold += n || 10000; GQ.ui.markDirty('res'); },
    shards: n => { GQ.state.S.hero.shards += n || 100; GQ.ui.markDirty('res'); },
    level: n => {
      GQ.state.S.hero.level = n; GQ.state.S.hero.xp = 0;
      GQ.state.recalc(); GQ.state.S.hero.hp = GQ.state.drv.hpMax;
      GQ.ui.markDirty('char', 'zones');
    },
    item: (ilvl, rar) => {
      const it = GQ.items.generateItem(ilvl || 5, 0, rar != null ? rar : 3);
      GQ.state.S.hero.inventory.push(it);
      GQ.ui.markDirty('inv');
      return it;
    },
  };

  return { boot, startGame, debug };
})();
