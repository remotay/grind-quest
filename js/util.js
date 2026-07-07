/* Grind Quest — utilities */
window.GQ = window.GQ || {};

GQ.util = (() => {
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function fmt(n) {
    if (n == null || isNaN(n)) return '0';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) {
      if (n < 10 && n % 1 !== 0) return n.toFixed(1);
      return String(Math.floor(n));
    }
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) return n.toExponential(2);
    const scaled = n / Math.pow(10, tier * 3);
    return (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)) + SUFFIXES[tier];
  }

  function fmtInt(n) { return fmt(Math.floor(n)); }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
          m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // entries: [{w: weight, v: value}]
  function weightedPick(entries) {
    let total = 0;
    for (const e of entries) total += e.w;
    let roll = Math.random() * total;
    for (const e of entries) {
      roll -= e.w;
      if (roll <= 0) return e.v;
    }
    return entries[entries.length - 1].v;
  }

  // deterministic PRNG for scenery layouts
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  let _uid = 0;
  function uid() {
    _uid++;
    return 'i' + Date.now().toString(36) + _uid.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  const easeOut = t => 1 - Math.pow(1 - t, 3);

  return { fmt, fmtInt, fmtTime, rand, randInt, pick, clamp, lerp, weightedPick, mulberry32, hashStr, esc, uid, easeOut };
})();
