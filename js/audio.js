/* Grind Quest — procedural audio (WebAudio, no assets) */
GQ.audio = (() => {
  let ctx = null, master = null;
  let lastHit = 0, lastHurt = 0;

  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }

  function vol() {
    const s = GQ.state && GQ.state.S;
    if (!s || !s.settings.sound) return 0;
    return (s.settings.volume != null ? s.settings.volume : 0.5);
  }

  function ready() { return ctx && ctx.state === 'running' && vol() > 0; }

  // one enveloped oscillator
  function beep(freq, dur, opts) {
    if (!ready()) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + opts.slide), t0 + dur);
    const v = (opts.v || 0.5) * vol();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // filtered noise burst
  function thud(dur, filterFreq, v, delay) {
    if (!ready()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = (v || 0.5) * vol();
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const R = (a, b) => a + Math.random() * (b - a);

  const api = {
    ensure,
    hit(crit) {
      const now = performance.now();
      if (now - lastHit < 90) return;
      lastHit = now;
      if (crit) {
        thud(0.06, 3200, 0.5);
        beep(R(620, 700), 0.09, { type: 'square', v: 0.22, slide: 260 });
      } else {
        thud(0.05, 1600, 0.4);
        beep(R(180, 240), 0.06, { type: 'triangle', v: 0.2 });
      }
    },
    hurt() {
      const now = performance.now();
      if (now - lastHurt < 200) return;
      lastHurt = now;
      thud(0.09, 500, 0.5);
      beep(110, 0.1, { type: 'sawtooth', v: 0.12, slide: -40 });
    },
    kill() {
      beep(520, 0.06, { type: 'triangle', v: 0.2 });
      beep(760, 0.07, { type: 'triangle', v: 0.16, delay: 0.05 });
    },
    coin() { beep(1180, 0.05, { type: 'sine', v: 0.1 }); },
    drop(rar) {
      const base = 440;
      const steps = Math.min(3 + rar, 7);
      for (let i = 0; i < steps; i++) {
        beep(base * Math.pow(1.25, i), 0.1, { type: rar >= 4 ? 'square' : 'triangle', v: 0.16 + rar * 0.015, delay: i * 0.07 });
      }
    },
    level() {
      [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.14, { type: 'triangle', v: 0.22, delay: i * 0.09 }));
    },
    ko() {
      [392, 330, 262, 196].forEach((f, i) => beep(f, 0.18, { type: 'sawtooth', v: 0.12, delay: i * 0.14 }));
    },
    ability(kind) {
      if (kind === 'strike') { thud(0.08, 2400, 0.55); beep(300, 0.12, { type: 'sawtooth', v: 0.2, slide: 500 }); }
      else if (kind === 'heal') { beep(520, 0.12, { type: 'sine', v: 0.2 }); beep(780, 0.14, { type: 'sine', v: 0.18, delay: 0.09 }); }
      else if (kind === 'stun') { beep(900, 0.16, { type: 'square', v: 0.14, slide: -500 }); }
      else { beep(340, 0.16, { type: 'square', v: 0.16, slide: 180 }); }
    },
    boss() {
      thud(0.4, 260, 0.8);
      beep(82, 0.55, { type: 'sawtooth', v: 0.28, slide: -18 });
      beep(123, 0.55, { type: 'sawtooth', v: 0.2, delay: 0.08, slide: -25 });
    },
    conquer() {
      [392, 523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, { type: 'triangle', v: 0.24, delay: i * 0.1 }));
    },
    quest() { beep(880, 0.09, { type: 'triangle', v: 0.2 }); beep(1175, 0.12, { type: 'triangle', v: 0.18, delay: 0.08 }); },
    ascend() {
      for (let i = 0; i < 8; i++) beep(220 * Math.pow(1.3, i), 0.2, { type: 'sine', v: 0.2, delay: i * 0.1 });
      thud(0.5, 900, 0.4, 0.7);
    },
    click() { beep(660, 0.03, { type: 'sine', v: 0.07 }); },
  };
  return api;
})();
