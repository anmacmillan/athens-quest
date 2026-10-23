// Sound: music, ambient layers and sample SFX (audio/manifest.json "sounds"), tiny synthesised effects as the fallback, plus narration clips (audio/<scene>-<n>.mp3).
// Nothing plays before the first tap: the AudioContext is made in unlock(), and anything asked for earlier is remembered and started then.
import { lsGet, lsSet } from './util.js';
let ac = null, master = null, musicBus = null, sfxBus = null, duckG = null, on = lsGet('owlq.sound', true), unlocked = false, current = null;
const vol = { music: lsGet('owlq.vol.music', .8), sfx: lsGet('owlq.vol.sfx', .9) };
export const sound = {
  get on() { return on; },
  set(v) { on = v; lsSet('owlq.sound', v); if (!v) stopClip(); applyVol(); music.refresh(); amb.refresh(); },
  get music() { return vol.music; }, get sfx() { return vol.sfx; },
  setVol(kind, v) { vol[kind] = Math.max(0, Math.min(1, v)); lsSet('owlq.vol.' + kind, vol[kind]); applyVol(); },
};
const curve = v => v * v;   // slider -> gain: perceptually even
function applyVol() {
  if (!ac) return; const t = ac.currentTime;
  musicBus.gain.setTargetAtTime(on ? curve(vol.music) : 0, t, .08); sfxBus.gain.setTargetAtTime(on ? curve(vol.sfx) : 0, t, .08);
}
export function unlock() {
  if (unlocked) return; unlocked = true;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    sfxBus = ac.createGain(); sfxBus.connect(ac.destination);
    duckG = ac.createGain(); musicBus = ac.createGain(); duckG.connect(musicBus); musicBus.connect(ac.destination);
    master = ac.createGain(); master.gain.value = .5; master.connect(sfxBus);
    applyVol(); if (ac.state === 'suspended') ac.resume();
    setInterval(keepTick, 120);
  } catch (e) { ac = null; }
  if (ac) { preloadSfx(); music.refresh(); amb.refresh(); }
}
function tone(freq, t0, dur, type = 'square', vol = .12, slide = 0) {
  if (!ac || !on) return;
  const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + .02);
}
// the synthesised set: still used for anything without a sample (and while samples load)
const synth = {
  blip() { tone(700 + Math.random() * 120, 0, .035, 'square', .04); },
  tap() { tone(520, 0, .06, 'triangle', .1); },
  coin() { tone(988, 0, .08, 'square', .1); tone(1319, .08, .28, 'square', .1); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .22, 'triangle', .13)); tone(1319, .4, .5, 'square', .06); },
  wrong() { tone(300, 0, .14, 'triangle', .12, -80); tone(240, .12, .2, 'triangle', .1, -60); },
  hoot() { tone(420, 0, .12, 'sine', .14, -60); tone(380, .16, .2, 'sine', .14, -80); },
  pop() { tone(300, 0, .12, 'sine', .16, 500); },
  whoosh() { tone(900, 0, .5, 'sawtooth', .03, -700); },
  splash() { tone(200, 0, .3, 'sawtooth', .05, -150); },
  // lyre arpeggio and a soft choir pad: the Athena Parthenos vision
  choir() { [220, 330, 440, 554, 660, 880].forEach((f, i) => tone(f, i * .22, 1.6, 'triangle', .07)); [220, 277, 330, 440].forEach(f => { tone(f, 1.2, 3.2, 'sine', .05); tone(f * 2.005, 1.3, 3, 'sine', .025); }); },
  thud() { tone(110, 0, .22, 'sine', .3, -60); tone(70, .02, .3, 'triangle', .2, -30); },
  chime() { [1319, 1760, 2093].forEach((f, i) => tone(f, i * .07, .35, 'sine', .1)); },
  purr() { for (let i = 0; i < 9; i++) tone(58 + (i % 2) * 6, i * .09, .1, 'sawtooth', .05); },
  owlcall() { tone(520, 0, .22, 'sine', .14, -90); tone(430, .3, .5, 'sine', .14, -120); tone(440, .95, .22, 'sine', .1, -60); tone(360, 1.25, .5, 'sine', .1, -90); },
  clop() { tone(260, 0, .05, 'square', .09, -90); tone(200, .1, .05, 'square', .07, -60); },
  roll(sp = 100) { tone(55 + sp * .12 + Math.random() * 14, 0, .07, 'triangle', .045); },
  whistle() { tone(1900, 0, .12, 'sine', .12, 300); tone(2200, .14, .3, 'sine', .12, -250); },
  page() { tone(1400, 0, .22, 'sawtooth', .025, -1100); tone(300, .05, .12, 'triangle', .05, 200); },
  flash() { tone(1200, 0, .4, 'sine', .05, 600); },
};

// ------------------------------------------------------------ sample library
let defs = {};   // id -> { file, type, loop, volume }
const bufs = new Map();   // id -> AudioBuffer | Promise | null
function decode(data) { return new Promise((res, rej) => { const p = ac.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); }); }
function load(id) {
  if (!ac || !defs[id]) return Promise.resolve(null);
  if (!bufs.has(id)) bufs.set(id, fetch(defs[id].file).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(decode).then(b => { bufs.set(id, b); return b; }).catch(() => { bufs.set(id, null); return null; }));
  const b = bufs.get(id); return b && b.then ? b : Promise.resolve(b);
}
const ready = id => { const b = bufs.get(id); return b && !b.then ? b : null; };
function preloadSfx() { for (const id in defs) if (defs[id].type !== 'music') load(id); }
const rand = a => a[Math.floor(Math.random() * a.length)];
// one-shot; true if it played (or sound is off), false if the sample is not ready (caller falls back to the synth)
function shot(id, o = {}) {
  const d = defs[id]; if (!d) return false; if (!ac || !on) return true;
  const b = ready(id); if (!b) { load(id); return false; }
  const s = ac.createBufferSource(), gn = ac.createGain(), t = ac.currentTime + (o.delay || 0);
  s.buffer = b; s.playbackRate.value = o.rate || 1; gn.gain.value = (o.vol ?? 1) * d.volume;
  if (o.dur) { gn.gain.setValueAtTime(gn.gain.value, t + o.dur - .25); gn.gain.linearRampToValueAtTime(0, t + o.dur); }
  s.connect(gn); gn.connect(sfxBus); s.start(t); if (o.dur) s.stop(t + o.dur + .05);
  return true;
}
// keep-alive loops: runs while something keeps asking for it (skate wheels, hooves, chariot), fades out when the asking stops
const keeps = new Map();
function keep(id, o = {}) {
  const d = defs[id]; if (!d) return false; if (!ac || !on) return true;
  const b = ready(id); if (!b) { load(id); return false; }
  let k = keeps.get(id);
  if (!k) { const s = ac.createBufferSource(), gn = ac.createGain(); s.buffer = b; s.loop = true; gn.gain.value = 0; s.connect(gn); gn.connect(sfxBus); s.start(); k = { s, gn }; keeps.set(id, k); }
  k.last = performance.now(); k.gn.gain.setTargetAtTime((o.vol ?? 1) * d.volume, ac.currentTime, .05); if (o.rate) k.s.playbackRate.setTargetAtTime(o.rate, ac.currentTime, .1);
  return true;
}
function keepTick() {
  const now = performance.now();
  for (const [id, k] of keeps) if (now - k.last > 380) { k.gn.gain.setTargetAtTime(0, ac.currentTime, .06); keeps.delete(id); setTimeout(() => { try { k.s.stop(); } catch (e) { } }, 400); }
}

// Existing event names use a sample when it is loaded and the synth otherwise. Every other manifest id is reachable as sfx['kebab-id'] or sfx.camelId
// (scene {"t":"sfx","name":"boom"} beats use these names).
const pick = (name, fn) => { const f = synth[name]; return (...a) => { if (!fn(...a)) f(...a); }; };
const sfxBase = {
  ...synth,
  tap: pick('tap', () => shot('menu-tap')),
  coin: pick('coin', () => shot('coin-pickup')),
  win: pick('win', () => shot('badge-fanfare')),
  wrong: pick('wrong', () => shot('quiz-wrong')),
  hoot: pick('hoot', () => shot(rand(['owl-hoot-1', 'owl-hoot-2']))),
  owlcall: pick('owlcall', () => shot('owl-hoot-2')),
  whoosh: pick('whoosh', () => shot('panel-whoosh', { rate: .9 + Math.random() * .2 })),
  splash: pick('splash', () => shot('splash')),
  chime: pick('chime', () => shot('feather-chime')),
  whistle: pick('whistle', () => shot('guard-whistle')),
  page: pick('page', () => shot('page-turn')),
  purr: pick('purr', () => { const m = shot(rand(['cat-meow-1', 'cat-meow-2'])); return shot('cat-purr', { delay: .8, dur: 2.6, vol: .8 }) && m; }),
  clop: pick('clop', () => keep('donkey-clop')),
  roll: pick('roll', sp => keep('skate-roll', { vol: Math.min(1, .25 + (sp || 100) / 220), rate: .8 + Math.min(.5, (sp || 100) / 320) })),
  buy() { if (!shot('coin-purchase')) synth.coin(); },
  correct() { if (!shot('quiz-correct')) synth.coin(); },
  owlflap() { shot('owl-flap'); }, push() { shot('skate-push'); }, clack() { shot('skate-clack'); },
  meow() { shot(rand(['cat-meow-1', 'cat-meow-2'])); }, heehaw() { shot('donkey-heehaw'); }, rumble() { keep('chariot-rumble'); },
  bleat() { shot('goat-bleat'); }, munch() { shot('tortoise-munch'); },
  boom() { if (!shot('boom')) synth.thud(); }, clang() { shot('sword-clang'); }, stone() { shot('stone-grind'); },
  bull() { shot('bull-roar'); }, breath() { shot('minotaur-breath'); }, shriek() { shot('sphinx-shriek'); }, gasp() { shot('crowd-gasp'); },
  thunder() { shot('thunder'); }, flourish() { shot('lyre-flourish'); }, heartbeat() { shot('heartbeat', { dur: 4 }); },
  sadsting() { shot('sad-sting'); }, triumph() { shot('triumph-sting'); }, fire() { shot('fire-crackle', { dur: 6 }); },
  play(id, o) { return shot(id, o); },
};
const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
export const sfx = new Proxy(sfxBase, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k !== 'string') return undefined;
    const id = defs[k] ? k : Object.keys(defs).find(i => camel(i) === k);
    return id && defs[id].type !== 'music' ? (o => shot(id, o)) : undefined;
  },
});

// ------------------------------------------------------------ music: one track at a time, 2.5 s crossfades; the files carry their own crossfaded loop seam
let want = null, playing = null, holds = [];
const effective = () => (holds.length ? holds[holds.length - 1].id : want);
export const music = {
  want(id) { if (id === want) return; want = id; this.refresh(); },   // the zone's track, played when nothing holds the music
  hold(id) { const h = { id }; holds.push(h); this.refresh(); return () => { holds = holds.filter(x => x !== h); this.refresh(); }; },   // comic bed, mini-game: call the result to give it back
  get held() { return holds.length > 0; },
  get now() { return playing && playing.id; },
  refresh() {
    if (!ac) return; const id = on ? effective() : null, t = ac.currentTime;
    if (playing && playing.id === id) return;
    if (playing) { const p = playing; playing = null; if (p.gn) { p.gn.gain.cancelScheduledValues(t); p.gn.gain.setValueAtTime(p.gn.gain.value, t); p.gn.gain.linearRampToValueAtTime(0, t + (on ? 2.5 : .3)); } setTimeout(() => { try { p.s && p.s.stop(); } catch (e) { } }, 2800); }
    if (!id || !defs[id]) return;
    const mine = { id, s: null, gn: null }; playing = mine;
    load(id).then(b => {
      if (!b || playing !== mine || !ac) return;
      const s = ac.createBufferSource(), gn = ac.createGain(), t0 = ac.currentTime; s.buffer = b; s.loop = true; gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(defs[id].volume, t0 + 2.5);
      s.connect(gn); gn.connect(duckG); s.start(); mine.s = s; mine.gn = gn;
    });
  },
};
// ------------------------------------------------------------ ambient layers: id -> level 0..1, eased
const layers = {}, target = {};
export const amb = {
  set(levels) { for (const k in target) if (!(k in levels)) target[k] = 0; Object.assign(target, levels); this.refresh(); },
  refresh() {
    if (!ac) return;
    for (const id in target) {
      if (!defs[id]) continue; const lv = on ? target[id] : 0; let L = layers[id];
      if (!L) {
        if (lv <= 0) continue; L = layers[id] = { gn: null };
        load(id).then(b => { if (!b || !ac) return; const s = ac.createBufferSource(), gn = ac.createGain(); s.buffer = b; s.loop = true; gn.gain.value = 0; s.connect(gn); gn.connect(sfxBus); s.start(0, Math.random() * b.duration); L.gn = gn; this.refresh(); });
        continue;
      }
      if (L.gn) L.gn.gain.setTargetAtTime(lv * defs[id].volume, ac.currentTime, 1.1);
    }
  },
};
function duck(d) { if (ac) duckG.gain.setTargetAtTime(d ? .3 : 1, ac.currentTime, .25); }

// ------------------------------------------------------------ manifest + narration clips
let clips = new Set();
// audio/manifest.json: { sounds: { id: { file, type, loop, volume } }, clips: [narration ids] }; a bare array of clip ids still works
export async function loadAudioManifest() {
  try {
    const r = await fetch('audio/manifest.json'); const j = r.ok ? await r.json() : [];
    if (Array.isArray(j)) clips = new Set(j);
    else { defs = j.sounds || {}; clips = new Set(Array.isArray(j.clips) ? j.clips : Object.keys(j.clips || {})); }
  } catch (e) { }
}
export const clipId = a => String(a || '').replace(/^audio\//, '').replace(/\.mp3$/, '');
export const hasClip = a => clips.has(clipId(a));
export const clipUrl = a => `audio/${clipId(a)}.mp3`;
export function playClip(src) {
  stopClip(); if (!on || !unlocked) return null;
  try {
    const a = new Audio(src.endsWith('.mp3') ? src : clipUrl(src)); current = a; a.play().catch(() => { });
    const done = () => { if (current === a) { current = null; duck(false); } }; a.addEventListener('ended', done); a.addEventListener('error', done);
    a.volume = Math.min(1, .6 + vol.sfx * .4); duck(true);   // the music sits under the narration while it speaks
    return a;
  } catch (e) { return null; }
}
export function stopClip() { if (current) { try { current.pause(); } catch (e) { } current = null; } duck(false); }
// does the clip exist? resolves duration in ms, or 0
export function clipInfo(src) {
  return new Promise(res => {
    const a = new Audio(); let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    a.preload = 'metadata'; a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration * 1000 : 0); a.onerror = () => fin(0); setTimeout(() => fin(0), 1500); a.src = src;
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopClip(); if (ac && ac.state === 'running') ac.suspend().catch(() => { }); }
  else if (ac && unlocked) ac.resume().catch(() => { });
});

// ------------------------------------------------------------ edge traffic: the busy ring road beyond the map edge (synth: low rumble plus the odd car going by)
let trafficN = null, trafficT = 0;
export function trafficNoise(level) {
  if (!ac || !on) { if (trafficN) trafficN.gain.gain.setTargetAtTime(0, ac ? ac.currentTime : 0, .3); return; }
  if (!trafficN) {
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * .08) * .985; d[i] = last * 6; }
    const s = ac.createBufferSource(), lp = ac.createBiquadFilter(), gn = ac.createGain(); s.buffer = buf; s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 520; gn.gain.value = 0;
    s.connect(lp); lp.connect(gn); gn.connect(sfxBus); s.start(); trafficN = { gain: gn };
  }
  trafficN.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * .28, ac.currentTime, .6);
  const now = ac.currentTime;
  if (level > .12 && now > trafficT) {   // a car passing: a short filtered whoosh with a doppler-ish slide
    trafficT = now + 1.6 + Math.random() * 3.5; const f = 140 + Math.random() * 60, dir = Math.random() < .5 ? -1 : 1;
    const o = ac.createOscillator(), gn = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, now); o.frequency.linearRampToValueAtTime(f + dir * 40, now + 1.2);
    lp.type = 'lowpass'; lp.frequency.value = 420; gn.gain.setValueAtTime(0.0001, now); gn.gain.linearRampToValueAtTime(.05 * level, now + .6); gn.gain.linearRampToValueAtTime(.0001, now + 1.3);
    o.connect(lp); lp.connect(gn); gn.connect(sfxBus); o.start(now); o.stop(now + 1.4);
  }
}

// ------------------------------------------------------------ the Minotaur: a quiet stone-room tone plus heavy breathing that grows with `level` (0 far .. 1 on top of him); level < 0 stops it
let mnN = null;
export function minotaurBreath(level) {
  if (!ac || !on || level < 0) { if (mnN) mnN.gain.gain.setTargetAtTime(0, ac ? ac.currentTime : 0, .2); return; }
  if (!mnN) {
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * .1) * .97; d[i] = last * 5; }
    const s = ac.createBufferSource(), lp = ac.createBiquadFilter(), gn = ac.createGain(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    s.buffer = buf; s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 380; gn.gain.value = 0; am.gain.value = .5;
    lfo.type = 'sine'; lfo.frequency.value = .42; lg.gain.value = .5; lfo.connect(lg); lg.connect(am.gain);   // slow in-and-out breathing
    s.connect(lp); lp.connect(am); am.connect(gn); gn.connect(sfxBus); s.start(); lfo.start(); mnN = { gain: gn, lfo, lp };
  }
  const L = Math.max(0, Math.min(1, level));
  mnN.gain.gain.setTargetAtTime(.04 + L * .5, ac.currentTime, .25); mnN.lfo.frequency.setTargetAtTime(.35 + L * .5, ac.currentTime, .5); mnN.lp.frequency.setTargetAtTime(300 + L * 420, ac.currentTime, .4);
}
