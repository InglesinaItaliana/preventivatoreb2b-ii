/**
 * SIDERA · Star Avatar engine
 * ---------------------------------------------------------------------------
 * Avatar deterministici, senza foto e senza storage di immagini.
 * Principio: l'avatar e' una FUNZIONE pura dei suoi ingredienti.
 *
 *   forma  = categoria (n. punte)        -> uguale per tutto il reparto
 *   colore = hueIndex (slot del registro)-> unico e stabile per persona
 *   dettagli fini = seed (uid/nome)      -> micro-variazioni di carattere
 *
 * In Firestore salvi SOLO: { category, hueIndex }. Forma e colore si
 * ricalcolano qui nel client. Cambi la tassonomia -> tutti gli avatar si
 * aggiornano da soli, senza migrazioni.
 *
 * Zero dipendenze. ES module. Usabile in React/Vue/Svelte/vanilla.
 */

/* ============================ TASSONOMIA ============================ */
/**
 * La forma della luce per categoria. Scala punte 1..6:
 *   pari/dispari scelti per restare leggibili anche a 28px.
 *   In uso: Produzione 3 · Amministrazione 4 · Direzione 6.
 * Aggiungere una categoria = aggiungere una riga qui (1, 5 ancora liberi).
 */
export const CATEGORIES = {
  direzione:       { label: 'Direzione',       points: 6, sat: 84, light: 60, coreR: 0.058, halo: 5.2, spikeLen: 0.40, spikeW: 0.85, pulseTempo: 0.55, pulseAmp: 0.10 },
  amministrazione: { label: 'Amministrazione', points: 4, sat: 70, light: 70, coreR: 0.052, halo: 4.4, spikeLen: 0.38, spikeW: 0.95, pulseTempo: 1.20, pulseAmp: 0.05 },
  produzione:      { label: 'Produzione',      points: 3, sat: 80, light: 58, coreR: 0.054, halo: 4.6, spikeLen: 0.44, spikeW: 0.90, pulseTempo: 0.95, pulseAmp: 0.06 },
  tecnico:         { label: 'Tecnico',         points: 5, sat: 76, light: 56, coreR: 0.054, halo: 4.8, spikeLen: 0.42, spikeW: 0.88, pulseTempo: 0.80, pulseAmp: 0.07 },
  logistica:       { label: 'Logistica',       points: 2, sat: 66, light: 64, coreR: 0.050, halo: 4.2, spikeLen: 0.46, spikeW: 1.05, pulseTempo: 1.05, pulseAmp: 0.05 },
  commerciale:     { label: 'Commerciale',     points: 1, sat: 88, light: 62, coreR: 0.060, halo: 5.4, spikeLen: 0.00, spikeW: 0.90, pulseTempo: 0.70, pulseAmp: 0.12 },
};

const FALLBACK = CATEGORIES.direzione;

/* ============================ DETERMINISMO ============================ */
/** Hash stringa -> intero 53-bit (cyrb53). */
function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** PRNG deterministico (mulberry32) -> funzione che ritorna [0,1). */
function rngFrom(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Palette M3 curata: 6 hue in famiglie cromatiche nettamente diverse
 * (red, amber, green, blue, violet, pink). Distanza minima ~50° HSL
 * (vs 35° prima); ordine alternato caldo/freddo per il counter monotono.
 * Niente cyan/sky/indigo/lime: erano percettivamente troppo vicini ai
 * vicini di palette su sfondo scuro a 40px (vedi feedback prod 2026-05-25).
 * Per workers che condividono lo stesso hue (categorie numerose), la
 * distinzione la fa la variance di luminosita' (+/-10) per individuo.
 */
export const PALETTE_HUES = [
  10,   // red
  220,  // blue
  45,   // amber
  285,  // violet
  130,  // green
  335,  // pink
];

/** Colore-firma dallo slot del registro: lookup su palette curata. */
export function hueFromIndex(index) {
  const i = ((Number(index) | 0) % PALETTE_HUES.length + PALETTE_HUES.length) % PALETTE_HUES.length;
  return PALETTE_HUES[i];
}

/* ============================ MODELLO STELLA ============================ */
/**
 * Costruisce i parametri (deterministici) di una stella.
 * @param {Object} o
 * @param {string} o.seed       identita' stabile (uid Firestore, o nome)
 * @param {string} o.category   chiave di CATEGORIES
 * @param {number} [o.hueIndex] slot colore dal registro (consigliato)
 * @param {number} [o.hue]      hue esplicito 0..360 (override; per anteprime)
 */
export function makeStar({ seed, category, hueIndex, hue }) {
  const role = CATEGORIES[category] || FALLBACK;
  const rnd = rngFrom(hashString(String(seed ?? '·')));
  // Fallback senza hueIndex (backfill non ancora eseguito): quantizza un indice
  // deterministico dal seed sulla stessa palette curata. Cosi' i path con/senza
  // hueIndex condividono i 9 colori. Quando arrivera' il backfill, l'hue cambiera'
  // dal valore "seed-quantizzato" a quello assegnato dal counter (entrambi nella palette).
  const finalHue = (hue != null) ? hue
                  : (hueIndex != null) ? hueFromIndex(hueIndex)
                  : PALETTE_HUES[Math.floor(rnd() * PALETTE_HUES.length)];
  return {
    category, label: role.label, points: role.points, hue: finalHue,
    sat:   role.sat   + (rnd() * 8 - 4),
    light: role.light + (rnd() * 20 - 10),  // +/-10 (era +/-4): distingue workers che condividono lo stesso hue tramite chiaroscuro
    coreR: role.coreR * (0.9 + rnd() * 0.2),
    halo:  role.halo  * (0.92 + rnd() * 0.16),
    spikeLen: role.spikeLen * (0.88 + rnd() * 0.24),
    spikeW:   role.spikeW   * (0.85 + rnd() * 0.30),
    // Varianza forma intra-categoria (stesso numero punte, geometria diversa):
    innerRatio:  0.12 + rnd() * 0.10,                                  // base spike piu' tozza/affilata
    phaseOffset: rnd() * (Math.PI * 2 / Math.max(1, role.points)),     // orientamento di partenza
    pulseSpeed: role.pulseTempo * (0.85 + rnd() * 0.30),
    pulseAmp:   role.pulseAmp   * (0.85 + rnd() * 0.30),
    pulsePhase: rnd() * Math.PI * 2,
    spin:      (rnd() * 0.06 + 0.02) * (rnd() < 0.5 ? -1 : 1),
    spinPhase:  rnd() * Math.PI * 2,
    twinkle:    rnd() * Math.PI * 2,
  };
}

/* ============================ RENDER (canvas) ============================ */
const hsla = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a})`;

function drawSpike(ctx, cx, cy, a, len, w, h, s, l, alpha, innerRatio) {
  const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len;
  const pa = a + Math.PI / 2, baseD = len * (innerRatio ?? 0.16);
  const bx = cx + Math.cos(a) * baseD, by = cy + Math.sin(a) * baseD;
  const sx = Math.cos(pa) * w, sy = Math.sin(pa) * w;
  const grd = ctx.createLinearGradient(cx, cy, tx, ty);
  // Fade spostato piu' avanti (0.55) per dare un corpo "pieno" piu' definito
  // prima della sfumatura: contorni leggibili anche a 28px.
  grd.addColorStop(0, hsla(h, s, Math.min(94, l + 20), alpha));
  grd.addColorStop(0.55, hsla(h, s, l, alpha * 0.65));
  grd.addColorStop(1, hsla(h, s, l, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(bx + sx, by + sy); ctx.lineTo(tx, ty); ctx.lineTo(bx - sx, by - sy);
  ctx.closePath(); ctx.fill();
}

/**
 * Disegna la stella. size = lato CSS in px; t = tempo in secondi (0 = statica).
 */
export function drawStar(ctx, size, star, t = 0) {
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  const pulse = 1 + Math.sin(t * star.pulseSpeed + star.pulsePhase) * star.pulseAmp;
  const coreR = star.coreR * size * pulse;
  const glowR = coreR * star.halo;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  g.addColorStop(0,    hsla(star.hue, star.sat, star.light, 0.50));
  g.addColorStop(0.2,  hsla(star.hue, star.sat, star.light, 0.26));
  g.addColorStop(0.55, hsla(star.hue, star.sat, star.light, 0.07));
  g.addColorStop(1,    hsla(star.hue, star.sat, star.light, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, 7); ctx.fill();

  if (star.points > 1 && star.spikeLen > 0) {
    const spin = t * star.spin + star.spinPhase + (star.phaseOffset ?? 0);
    const len = size * star.spikeLen * pulse;
    const w = coreR * star.spikeW;
    for (let i = 0; i < star.points; i++) {
      const a = spin + i * (Math.PI * 2 / star.points);
      drawSpike(ctx, cx, cy, a, len, w, star.hue, star.sat, star.light, 0.7, star.innerRatio);
    }
  }

  const tw = 0.85 + Math.sin(t * 2.2 + star.twinkle) * 0.15;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  cg.addColorStop(0, `rgba(255,255,255,${0.98 * tw})`);
  cg.addColorStop(0.45, hsla(star.hue, star.sat, Math.min(92, star.light + 22), 0.95));
  cg.addColorStop(1, hsla(star.hue, star.sat, star.light, 0));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 7); ctx.fill();
  ctx.restore();
}

/* ====================== LOOP CONDIVISO (1 solo rAF) ====================== */
const _instances = new Set();
let _raf = null, _t0 = 0;
function _tick(now) {
  const t = (now - _t0) / 1000;
  for (const inst of _instances) drawStar(inst.ctx, inst.size, inst.star, t);
  _raf = _instances.size ? requestAnimationFrame(_tick) : (_raf = null);
}
function _start() { if (!_raf) { _t0 = performance.now(); _raf = requestAnimationFrame(_tick); } }

/* ============================ MOUNT (helper) ============================ */
/**
 * Monta un avatar su un <canvas>. Gestisce DPR, animazione (loop condiviso),
 * e prefers-reduced-motion. Ritorna { update, destroy }.
 *
 *   const inst = mountStarAvatar(canvasEl, { seed: uid, category, hueIndex, size: 40 });
 *   inst.update({ size: 64 });   // cambia prop a caldo
 *   inst.destroy();              // sempre alla smontata (no memory leak)
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} opts {seed, category, hueIndex, hue?, size=40, animated=true}
 */
export function mountStarAvatar(canvas, opts) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inst = { ctx: null, size: 0, star: null };

  function size(canvas, sz) {
    canvas.style.width = sz + 'px';
    canvas.style.height = sz + 'px';
    canvas.width = Math.round(sz * dpr);
    canvas.height = Math.round(sz * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function apply(o) {
    inst.size = o.size ?? inst.size ?? 40;
    inst.ctx = size(canvas, inst.size);
    inst.star = makeStar({ seed: o.seed, category: o.category, hueIndex: o.hueIndex, hue: o.hue });
    const animated = (o.animated ?? true) && !reduce;
    _instances.delete(inst);
    if (animated) { _instances.add(inst); _start(); }
    else { drawStar(inst.ctx, inst.size, inst.star, 0); } // statica
  }

  apply(opts);
  return {
    update(next) { apply({ ...opts, ...next }); },
    destroy() { _instances.delete(inst); },
  };
}
