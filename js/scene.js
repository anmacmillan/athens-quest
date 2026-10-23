// Data-driven cutscene engine, generalising the approved Aegeus prototype.
// A scene is JSON: { id, flag, speaker, origin?, party?, beats:[...] }. Beats run in order; a beat with "par": true starts and the next one runs at once.
// Beat types: caption, actor.spawn/move/emote/jump/fall/anim/sprite/face/place/remove, camera.pan/set/follow/zoom, fx, still, wait, badge, stage, bars, sfx, audio.
import { g, tg, tmp, IM, V, M, box, text, textW, wrap, px, ghostDraw, shadowAt, tint, loadImage, beginWorld, endWorld, viewRect, clampCam, present } from './render.js';
import { clamp, seg, eio, eio2, lerp, R, rnd, FLAGS, speakerName } from './util.js';
import { sfx, playClip, clipInfo, stopClip, hasClip, clipUrl } from './audio.js';
import { drawPlayer } from './player.js';
import { readCps, decorHold, autoTap } from './reading.js';
import { el } from './util.js';

const CPS = 32;
const ghostCache = {};
function ghostImg(name) {
  if (IM[name + '_g']) return IM[name + '_g'];
  if (!ghostCache[name]) {
    const s = IM[name], c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const k = c.getContext('2d');
    k.drawImage(s, 0, 0); k.globalCompositeOperation = 'source-atop'; k.fillStyle = 'rgba(206,232,255,.55)'; k.fillRect(0, 0, c.width, c.height); ghostCache[name] = c;
  }
  return ghostCache[name];
}
function motes(t, p, wx, wy, n, rise) {
  for (let i = 0; i < n; i++) {
    const s = rnd(i + 3), s2 = rnd(i + 90), big = i % 3 === 0;
    px(wx + (s - .5) * 30, wy - 3 - rise * ((p * 1.3 + s2) % 1), big ? 2 : 1, big ? 2 : 1, i % 2 ? '#e6f4ff' : '#a9d6ff', Math.max(0, (1 - p)) * (.6 + .4 * Math.sin(t * 10 + i)));
  }
}
const pillCache = {};
export function pill(label, color, scale = 1) {
  const key = label + color + scale;
  if (!pillCache[key]) {
    const w = textW(label, scale) + 14, h = 16 * scale + 6, c = document.createElement('canvas'); c.width = w; c.height = h; const k = c.getContext('2d');
    k.fillStyle = '#3a2c4c'; k.fillRect(1, 0, w - 2, h); k.fillRect(0, 1, w, h - 2); k.fillStyle = color; k.fillRect(2, 1, w - 4, h - 3); k.fillRect(1, 2, w - 2, h - 5);
    k.fillStyle = 'rgba(255,255,255,.35)'; k.fillRect(2, 1, w - 4, 1);
    const f = tint('#2b1b3a'); for (let i = 0; i < label.length; i++) { const code = label.charCodeAt(i) - 32; if (code > 0 && code <= 94) k.drawImage(f, code * 8, 0, 8, 16, 7 + i * 8 * scale, 3, 8 * scale, 16 * scale); }
    pillCache[key] = c;
  }
  return pillCache[key];
}

export const stillList = new Set();
// a still is named by id or path; the AI manga version (<id>.jpg) wins over the code-drawn <id>.png, and parthenon_boom_1687 falls back to parthenon_boom
// optional art/ai_manifest.json (written by the art agent): any image path inside it is registered by its basename, so stills like <story>_b2 and
// portraits like <speaker>_<mood> are picked up without code changes. Absent manifest = nothing changes.
export const aiAssets = {};
export async function loadAiManifest() {
  try {
    const r = await fetch('art/ai_manifest.json'); if (!r.ok) return;
    const walk = v => { if (typeof v === 'string') { if (/\.(jpe?g|png|webp)$/i.test(v)) { const id = v.split('/').pop().replace(/\.\w+$/, ''); if (!aiAssets[id] || /\/web\//.test(v)) aiAssets[id] = v; } } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(await r.json());
  } catch (e) { }
}
export function resolveStill(name) {
  const bare = String(name).replace(/^art\/stills\//, '').replace(/\.(png|jpg|jpeg|svg)$/, '');
  if (aiAssets[bare] && !stillList.has('art/stills/' + bare + '.jpg')) return aiAssets[bare];
  return resolveStillLocal(name);
}
function resolveStillLocal(name) {
  const base = String(name).replace(/^art\/stills\//, '').replace(/\.(png|jpg|jpeg|svg)$/, ''), ids = [base, base.replace(/_\d+$/, '')];
  for (const id of ids) for (const ext of ['.jpg', '.png']) if (stillList.has('art/stills/' + id + ext)) return 'art/stills/' + id + ext;
  return null;
}
export class Scene {
  constructor(game, data, opts = {}) {
    this.game = game; this.data = data; this.opts = opts; this.t = 0; this.skipping = false;
    this.actors = new Map(); this.tweens = []; this.sleeps = []; this.fx = []; this.caption = null; this.tapWait = null;
    this.barsOn = 0; this.barT = 0; this.barTarget = 0; this.still = null; this.badge = null; this.letters = null; this.shake = null; this.sun = null;
    this.speaker = data.speaker || 'glauka'; this.flag = data.flag || null;
    this.world = game.world; this.baseWorld = game.world;
    this.cam = { x: game.cam.x, y: game.cam.y, z: 1 }; this.follow = null; this.camTween = null; this.zoomTween = null;
    this.ended = false; this.interactive = opts.interactive !== false;
  }
  // ------------------------------------------------------------ coordinates
  origin() { return this._origin; }
  pt(p, abs) {
    if (typeof p === 'string') { const a = this.actors.get(p); return a ? { x: a.x, y: a.y } : { x: this.cam.x, y: this.cam.y }; }
    const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
    if (this.world.kind === 'live' && !abs && !p.abs) return { x: this._origin.x + x, y: this._origin.y + y };
    return { x, y };
  }
  // ------------------------------------------------------------ run
  async run() {
    const d = this.data, G = this.game;
    this._origin = d.origin ? this.projectOrigin(d.origin) : { x: G.player.x, y: G.player.y };
    this.mkActors();
    const party = d.party || {};
    if (party.girl) { const a = this.actors.get('girl'); a.x = this._origin.x + party.girl[0]; a.y = this._origin.y + party.girl[1]; a.facing = party.girlFacing || 'r'; }
    if (party.owl) { const a = this.actors.get('owl'); a.x = this._origin.x + party.owl[0]; a.y = this._origin.y + party.owl[1]; }
    const gA = this.actors.get('girl'); this.cam.x = d.camera ? this.pt(d.camera).x : gA.x; this.cam.y = d.camera ? this.pt(d.camera).y : gA.y;
    if (d.bars !== false) this.barTarget = 1;
    await this.sleep(d.startDelay ?? 600);
    await this.runBeats(d.beats || []);
    this.barTarget = 0; await this.sleep(700);
    this.ended = true; stopClip(); this.destroy();
    // leave the player where the scene put her
    if (this.world === this.baseWorld) { G.player.x = gA.x; G.player.y = gA.y; G.player.facing = gA.facing; const o = this.actors.get('owl'); G.owl.x = o.x; G.owl.y = o.y; }
    return { badge: !!this.badge };
  }
  projectOrigin(o) { const k = this.game.world.ws || 1; if (o.lat !== undefined) return this.game.world.project(o.lat, o.lon); return { x: o.x * k, y: o.y * k }; }   // explicit px origins are in generated-map pixels
  mkActors() {
    const G = this.game;
    if (this.world.kind === 'map') {   // on the journey map the girl is a little ship
      this.actors.set('girl', { id: 'girl', kind: 'sprite', sprite: 'ship_1_0', ax: 15, ay: 18, x: G.player.x, y: G.player.y, world: this.world.id, alpha: 1, shadow: 0, wake: false, anim: { frames: ['ship_1_0', 'ship_1_1', 'ship_1_2', 'ship_1_1'], fps: 3, loop: true, t0: 0 } });
      this.actors.set('owl', { id: 'owl', kind: 'owl', sprite: 'owl_0', x: G.owl.x, y: G.owl.y, world: 'none', alpha: 1, shadow: 10 });
      return;
    }
    this.actors.set('girl', { id: 'girl', kind: 'player', x: G.player.x, y: G.player.y, facing: G.player.facing, world: this.world.id, alpha: 1, shadow: 12 });
    this.actors.set('owl', { id: 'owl', kind: 'owl', sprite: 'owl_0', x: G.owl.x, y: G.owl.y, world: this.world.id, alpha: 1, shadow: 10, owl: true });
  }
  async runBeats(beats) { for (const b of beats) { if (this.ended) return; const p = this.exec(b); if (!b.par && p) await p; } }
  // ------------------------------------------------------------ clock
  sleep(ms) { if (this.skipping || ms <= 0) return Promise.resolve(); return new Promise(res => this.sleeps.push({ t: this.t + ms / 1000, res })); }
  tween(dur, fn) {   // fn(u) each frame, resolves at end
    if (this.skipping || dur <= 0) { fn(1); return Promise.resolve(); }
    return new Promise(res => this.tweens.push({ t0: this.t, dur: dur / 1000, fn, res }));
  }
  skip() { this.skipping = true; this.bubbleOff(); this.flushAll(); }
  destroy() { if (this.capEl) { this.capEl.remove(); this.capEl = null; } }
  flushAll() {
    if (this.caption && !this.caption.finished) { const c = this.caption; c.finished = true; c.res(); }
    for (const tw of this.tweens.splice(0)) { tw.fn(1); tw.res(); }
    for (const s of this.sleeps.splice(0)) s.res();
    if (this.tapWait) { const r = this.tapWait; this.tapWait = null; r(); }
  }
  update(dt) {
    this.t += dt;
    this.barT += (this.barTarget - this.barT) * Math.min(1, dt * 7); if (Math.abs(this.barTarget - this.barT) < .01) this.barT = this.barTarget;
    for (const tw of this.tweens.slice()) { const u = clamp((this.t - tw.t0) / tw.dur); tw.fn(u); if (u >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.res(); } }
    for (const s of this.sleeps.slice()) if (this.t >= s.t) { this.sleeps.splice(this.sleeps.indexOf(s), 1); s.res(); }
    for (const f of this.fx.slice()) { f.u = clamp((this.t - f.t0) / f.dur); if (f.mid && !f.midDone && f.u >= .5) { f.midDone = true; this.runBeats(f.mid); } if (f.u >= 1) { this.fx.splice(this.fx.indexOf(f), 1); f.res && f.res(); } }
    const c = this.caption; if (c) {
      c.typed = Math.min(c.text.length, Math.floor((this.t - c.t0) * c.cps));
      if (c.typed >= c.text.length && c.doneAt === undefined) c.doneAt = this.t;
      if (c.doneAt !== undefined && !c.finished && (c.hold !== null ? this.t - c.doneAt >= c.hold / 1000 : (autoTap() && this.t - c.doneAt >= c.autoHold / 1000))) { c.finished = true; c.res(); }
    }
    // camera
    if (this.follow) { const a = this.actors.get(this.follow); if (a) { this.cam.x += (a.x - this.cam.x) * Math.min(1, dt * 5); this.cam.y += (a.y - 14 - this.cam.y) * Math.min(1, dt * 5); } }
    for (const a of this.actors.values()) {
      if (a.moving && a.world === this.world.id) a.walkT = (a.walkT || 0) + dt;
    }
    clampCam(this.cam, this.world.w, this.world.h);
  }
  tap() {   // tap or A: finish typing, then advance
    const c = this.caption;
    if (c && !c.finished) {
      if (c.typed < c.text.length) { c.t0 = this.t - c.text.length / c.cps - .01; c.typed = c.text.length; if (c.audioEl) { /* keep clip */ } }
      else if (this.interactive || c.hold === null) { c.finished = true; c.res(); }
      return true;
    }
    return false;
  }
  // ------------------------------------------------------------ beats
  exec(b) {
    const t = b.t || b.type;
    switch (t) {
      case 'caption': return this.doCaption(b);
      case 'wait': return this.sleep(b.ms);
      case 'actor.spawn': return this.doSpawn(b);
      case 'actor.place': { const a = this.actors.get(b.id), p = this.pt(b); a.x = p.x; a.y = p.y; a.world = this.world.id; if (b.facing) a.facing = b.facing; return null; }
      case 'actor.move': return this.doMove(b);
      case 'actor.emote': { const a = this.actors.get(b.id); a.emote = { name: b.emote, t0: this.t, ms: b.ms || 3000 }; return null; }
      case 'actor.jump': return this.doJump(b);
      case 'actor.fall': return this.doFall(b);
      case 'actor.anim': { const a = this.actors.get(b.id); a.anim = { frames: b.frames, fps: b.fps || 8, loop: b.loop !== false, t0: this.t }; return null; }
      case 'actor.sprite': { const a = this.actors.get(b.id); a.anim = null; a.sprite = b.sprite; return null; }
      case 'actor.flip': { this.actors.get(b.id).flip = b.flip !== false; return null; }
      case 'actor.face': { this.actors.get(b.id).facing = b.dir; return null; }
      case 'actor.remove': { const a = this.actors.get(b.id); if (!a) return null; if (b.ms) return this.tween(b.ms, u => { a.alpha = 1 - u; if (u >= 1) this.actors.delete(b.id); }); this.actors.delete(b.id); return null; }
      case 'camera.pan': return this.doPan(b);
      case 'camera.set': { const p = this.pt(b.to, b.abs); this.cam.x = p.x; this.cam.y = p.y; this.follow = null; if (b.zoom) this.cam.z = b.zoom; return null; }
      case 'camera.follow': this.follow = b.id || null; return null;
      case 'camera.zoom': return this.doZoom(b);
      case 'fx': return this.doFx(b);
      case 'still': return this.doStill(b);
      case 'bubble': return this.doBubble(b);
      case 'badge': return this.doBadge(b);
      case 'stage': return this.doStage(b);
      case 'bars': this.barTarget = b.on === false ? 0 : 1; return null;
      case 'sfx': if (sfx[b.name]) sfx[b.name](); return null;
      case 'audio': playClip(b.src); return null;
      default: console.warn('unknown beat', b); return null;
    }
  }
  // Content captions (story text, in-character lines) type at the player's reading speed and wait for a tap or A; only decorative beats
  // (silent sound-words, decorative:true) time out. A caption never starts while the previous one is still waiting to be read.
  doCaption(b) {
    return new Promise(async res => {
      while (this.pendingCap && !this.skipping) await this.pendingCap;
      const text_ = b.text, deco = !!(b.silent || b.decorative); let cps = deco ? (b.cps || readCps()) : readCps(), audioMs = 0, autoHold = 700;
      let hold = null; if (deco) hold = b.silent ? (b.hold ?? 500) : Math.max(b.hold || 0, decorHold(text_));
      this.capN = (this.capN || 0) + 1; const aid = b.audio || `${this.data.id}-${this.capN}`;
      if (hasClip(aid) && !this.skipping) {   // narration present: the text follows the voice, and the caption waits for the clip to end + 0.8 s before auto-tapping
        audioMs = await clipInfo(clipUrl(aid));
        if (audioMs > 0) { cps = text_.length / Math.max(.5, audioMs * .8 / 1000); autoHold = audioMs * .2 + 800; if (deco) hold = Math.max(hold, audioMs * .2 + 800); playClip(clipUrl(aid)); }
      }
      let pcRes; const pc = new Promise(r => pcRes = r); this.pendingCap = pc;
      this.caption = { speaker: b.speaker || this.speaker, text: text_, t0: this.t, cps, hold, autoHold, flag: b.flag === undefined ? null : b.flag, mood: b.mood, typed: 0, silent: !!b.silent, actor: b.actor, res: () => { if (this.caption === cp) this.caption = null; if (this.pendingCap === pc) this.pendingCap = null; pcRes(); res(); } };
      const cp = this.caption; this.lastBlip = 0;
      if (this.skipping) { cp.finished = true; this.caption = null; this.pendingCap = null; pcRes(); res(); }
    });
  }
  doSpawn(b) {
    let a = this.actors.get(b.id);
    if (a && (a.kind === 'player' || a.kind === 'owl')) { const p = this.pt(b); a.x = p.x; a.y = p.y; a.world = this.world.id; return null; }
    const p = this.pt(b), spr = b.sprite, im = IM[spr] || {};
    a = { id: b.id, kind: 'sprite', sprite: spr, x: p.x, y: p.y, world: this.world.id, alpha: b.alpha ?? 1, scale: b.scale || 1, flip: !!b.flip, shadow: b.shadow === undefined ? (b.id.startsWith('ship') ? 0 : 14) : b.shadow,
      ax: b.anchor ? b.anchor[0] : (im.width || 0) / 2, ay: b.anchor ? b.anchor[1] : (spr.startsWith('ae_') ? 32 : spr.startsWith('ship') ? (im.height || 0) - 2 : im.height || 0),
      walk: b.walk, glow: b.glow !== false && !!b.ghost, smooth: !!b.smooth, wake: !!b.wake, z: b.z || 0, ghost: b.ghost ? { t0: this.t, dur: (b.ms || 1700) / 1000 } : null };
    if (b.ghost && this.skipping) a.ghost = null;
    this.actors.set(b.id, a);
    if (b.ghost) { sfx.whoosh(); return this.sleep(b.ms || 1700); }
    return null;
  }
  doMove(b) {
    const a = this.actors.get(b.id), to = this.pt(b.to, b.abs), x0 = a.x, y0 = a.y, d = Math.hypot(to.x - x0, to.y - y0);
    const ms = b.ms || (d / (b.speed || 40) * 1000), s0 = a.scale || 1, sc = b.scale;
    const dx = to.x - x0, dy = to.y - y0;
    if (d > 0.5 && b.face !== false) a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'f' : 'b');
    if (a.flipOnMove && Math.abs(dx) > 1) a.flip = dx < 0;
    a.moving = true; const ease = b.ease === 'eio' ? eio : (u => u);
    return this.tween(ms, u => {
      const e = ease(u); a.x = x0 + dx * e; a.y = y0 + dy * e; if (sc) a.scale = lerp(sc[0] ?? s0, sc[1], e);
      if (u >= 1) { a.moving = false; if (b.faceAfter) a.facing = b.faceAfter; }
    });
  }
  doJump(b) {
    const a = this.actors.get(b.id), h = b.height || 12; a.jumping = true;
    return this.tween(b.ms || 500, u => { a.dy = -h * 4 * u * (1 - u); if (u >= 1) { a.dy = 0; a.jumping = false; } });
  }
  doFall(b) {
    const a = this.actors.get(b.id), x0 = a.x, y0 = a.y, pts = [[0, 0], ...b.path];
    const cr = (p0, p1, p2, p3, t) => .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    a.falling = { t0: this.t, ms: b.ms, vanish: b.vanish !== false, frames: b.frames, speed: b.speedlines !== false }; if (b.sfx !== false) sfx.whoosh();
    return this.tween(b.ms || 1500, u => {
      const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, P = k => pts[clamp(k, 0, pts.length - 1)];
      a.x = x0 + cr(P(i - 1)[0], P(i)[0], P(i + 1)[0], P(i + 2)[0], t); a.y = y0 + cr(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1], t);
      a.falling.u = u; if (b.frames) a.sprite = b.frames[Math.floor(this.t * 11) % b.frames.length];
      if (u >= 1) { a.falling.done = true; if (b.remove !== false) { this.actors.delete(a.id); } }
    });
  }
  doPan(b) {
    const to = this.pt(b.to, b.abs), x0 = this.cam.x, y0 = this.cam.y; this.follow = null; const ease = b.ease === 'linear' ? (u => u) : eio;
    return this.tween(b.ms || 1500, u => { const e = ease(u); this.cam.x = lerp(x0, to.x, e); this.cam.y = lerp(y0, to.y, e); });
  }
  doZoom(b) {
    const z0 = this.cam.z, z1 = b.scale, x0 = this.cam.x, y0 = this.cam.y, to = b.at ? this.pt(b.at, b.abs) : null;
    return this.tween(b.ms || 800, u => { const e = eio(u); this.cam.z = lerp(z0, z1, e); if (to) { this.cam.x = lerp(x0, to.x, e); this.cam.y = lerp(y0, to.y, e); } });
  }
  doStage(b) {
    const G = this.game, W = b.set === 'live' || b.set === 'athens' ? this.baseWorld : G.worlds[b.set];
    if (!W) return null;
    this.world = W; this.letters = null;
    const sp = b.camera ? this.pt(b.camera, W !== this.baseWorld) : (W === this.baseWorld ? { x: this.cam.x, y: this.cam.y } : { x: W.w / 2, y: W.h / 2 });
    this.cam.x = sp.x; this.cam.y = sp.y; this.cam.z = b.zoom || 1; this.follow = null;
    return null;
  }
  // a close-up in a comic bubble (DOM, crisp at any size) that pops up beside the speaker while the caption runs
  doBubble(b) {
    if (b.off) { this.bubbleOff(); return null; }
    let e = document.getElementById('featbubble');
    if (!e) { e = document.createElement('div'); e.id = 'featbubble'; e.innerHTML = '<img alt=""><span></span>'; document.body.append(e); }
    const im = e.querySelector('img'); im.src = b.image; e.querySelector('span').textContent = b.label || '';
    e.classList.remove('in'); void e.offsetWidth; requestAnimationFrame(() => e.classList.add('in')); sfx.pop && sfx.pop();
    this.bubbleOn = true; return null;
  }
  bubbleOff() { const e = document.getElementById('featbubble'); if (e) e.classList.remove('in'); this.bubbleOn = false; }
  doBadge(b) { this.badge = { t0: this.t, flag: b.flag || this.flag || 'myth' }; sfx.win(); return null; }
  doStill(b) {
    return new Promise(async res => {
      const img = resolveStill(b.image);
      if (b.optional && !img) { res(); return; }
      const key = 'still:' + (img || b.image); const im = await loadImage(key, img || b.image);
      if (!im) { if (!b.optional) console.warn('still missing', b.image); res(); return; }
      const st = this.still = { im, t0: this.t, ms: b.ms || 3000, kb: b.kenBurns || null, shake: b.shake || 0, punch: b.transition !== 'fade' };
      if (b.shake) this.shake = { t0: this.t, ms: 500, amp: b.shake };
      sfx.pop();
      const fin = () => { if (this.still === st) this.still = null; res(); };
      if (b.par) { res(); this.sleep(st.ms).then(fin); } else this.sleep(st.ms).then(fin);
      if (this.skipping) fin();
    });
  }
  doFx(b) {
    const ms = b.ms || 800;
    switch (b.type) {
      case 'shimmer': case 'flash': {
        sfx.flash(); return new Promise(res => this.fx.push({ type: b.type, t0: this.t, dur: ms / 1000, mid: b.mid, res, color: b.color }));
      }
      case 'wash': { const w = this.wash || (this.wash = { a: 0, col: '20,10,40' }), a0 = w.a, a1 = b.alpha ?? .4; if (b.color) w.col = b.color; return this.tween(ms, u => { w.a = lerp(a0, a1, u); }); }
      case 'shake': this.shake = { t0: this.t, ms, amp: b.amp || 3 }; return null;
      case 'splash': { sfx.splash(); const p = this.pt(b, b.abs); this.fx.push({ type: 'splash', t0: this.t, dur: ms / 1000, x: p.x, y: p.y }); return null; }
      case 'speedlines': this.fx.push({ type: 'speed', t0: this.t, dur: ms / 1000, id: b.id }); return null;
      case 'sunReverse': return new Promise(res => this.fx.push({ type: 'sun', t0: this.t, dur: ms / 1000, res }));
      case 'textWrite': { const p = this.pt(b, b.abs); this.letters = { text: b.text, x: p.x, y: p.y, t0: this.t, per: (b.per || 260) / 1000, scale: b.scale || 2 }; return null; }
      default: return null;
    }
  }
  // ------------------------------------------------------------ drawing
  camOffset() {
    const s = this.shake; if (!s) return [0, 0];
    const u = (this.t - s.t0) / (s.ms / 1000); if (u >= 1) { this.shake = null; return [0, 0]; }
    const a = s.amp * (1 - u); return [Math.round((rnd(this.t * 60) - .5) * 2 * a), Math.round((rnd(this.t * 60 + 9) - .5) * 2 * a)];
  }
  entities() {
    const out = [], t = this.t;
    for (const a of this.actors.values()) {
      if (a.world !== this.world.id) continue;
      const im = a.kind === 'sprite' ? IM[a.sprite] : null, sc = a.scale || 1, w = im ? im.width * sc : 24, h = im ? im.height * sc : 40, ax = im ? (a.ax ?? im.width / 2) * sc : 12, ay = im ? (a.ay ?? im.height) * sc : 36;
      out.push({ y: a.y + (a.z || 0), box: { x0: a.x - ax, y0: a.y - ay, x1: a.x - ax + w, y1: a.y + 2 }, draw: () => this.drawActor(a, t) });
    }
    if (this.world === this.baseWorld) out.push(...this.game.spotEntities());
    return out;
  }
  drawActor(a, t) {
    const dy = a.dy || 0;
    if (a.kind === 'player') {
      shadowAt(a.x, a.y, 14, .3);
      const fr = a.moving ? 1 + (Math.floor((a.walkT || 0) * 7) % 2) : 0;
      drawPlayer(g, this.game.sheet(), a.x, a.y + dy, a.facing || 'f', fr, a.alpha); return;
    }
    if (a.kind === 'owl') {
      let hop = 0, flap = false; const c = this.caption;
      if (c && !c.silent && (c.actor || c.speaker) === 'glauka' && c.typed < c.text.length + 4) { const ph = ((t - c.t0) * 2.3) % 1; hop = R(5 * Math.sin(Math.PI * ph)); flap = hop >= 2; }
      if (a.dy) { hop = -a.dy; flap = true; }
      shadowAt(a.x, a.y, 10 - (hop > 2 ? 2 : 0), .26);
      const im = this.game.comp.owlImg(flap); g.globalAlpha = a.alpha; g.drawImage(im, R(a.x - 9), R(a.y - 14 - hop)); g.globalAlpha = 1; return;
    }
    // generic sprite actor
    let name = a.sprite;
    if (a.anim) { const k = Math.floor((t - a.anim.t0) * a.anim.fps); name = a.anim.frames[a.anim.loop ? k % a.anim.frames.length : Math.min(k, a.anim.frames.length - 1)]; }
    else if (a.moving && a.walk) name = a.walk[Math.floor((a.walkT || 0) * 7) % a.walk.length];
    const im = IM[name]; if (!im) return;
    let x = a.x - (a.ax ?? im.width / 2), y = a.y - (a.ay ?? im.height) + dy;
    // speaker hop for talking characters
    const c = this.caption;
    if (c && !c.silent && (c.actor || c.speaker) === a.id && c.typed < c.text.length + 4 && !a.moving) y -= R(2 * Math.sin(Math.PI * (((t - c.t0) * 2.3) % 1)));
    if (a.shadow && !(a.falling && a.falling.u > 0)) shadowAt(a.x, a.y, a.shadow, .3);
    if (a.wake) this.drawWake(a, t);
    const sc = a.scale || 1;
    if (a.ghost && t - a.ghost.t0 < a.ghost.dur) {
      const f = (t - a.ghost.t0) / a.ghost.dur; ghostDraw(ghostImg(name), x, y, f, t); motes(t, f, a.x, a.y, 16, 34);
      if (f > .6) { g.globalAlpha = (f - .6) / .4 * .7; g.drawImage(im, R(x), R(y)); g.globalAlpha = 1; }
      return;
    }
    if (a.falling && a.falling.vanish && a.falling.u > .8) { ghostDraw(ghostImg(name), x, y, 1 - seg(a.falling.u, .8, 1), t); if (a.falling.u > .8) motes(t, seg(a.falling.u, .8, 1), a.x, a.y, 14, 18); return; }
    if (a.glow) { const gl = .22 + .1 * Math.sin(t * 3); g.globalAlpha = gl; g.drawImage(ghostImg(name), R(x) - 1, R(y)); g.drawImage(ghostImg(name), R(x) + 1, R(y)); g.globalAlpha = 1; }
    g.globalAlpha = a.alpha;
    if (sc !== 1) { const w = im.width * sc, h = im.height * sc; g.imageSmoothingEnabled = a.smooth !== false; g.drawImage(im, R(a.x - (a.ax ?? im.width / 2) * sc), R(a.y - (a.ay ?? im.height) * sc), R(w), R(h)); g.imageSmoothingEnabled = false; }
    else if (a.flip) { g.save(); g.translate(R(x) + im.width, R(y)); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); }
    else g.drawImage(im, R(x), R(y));
    g.globalAlpha = 1;
    // emote bubble and tears
    if (a.emote && t - a.emote.t0 < a.emote.ms / 1000) {
      const e = IM['emote_' + a.emote.emote]; if (e && t - a.emote.t0 > .15) g.drawImage(e, R(a.x - (a.ax ? 7 : 8) + 1), R(a.y - (a.ay ?? im.height) * sc - 15 + Math.sin(t * 4)));
      if (a.emote.emote === 'sad' && a.tears !== false) this.drawTears(a, t);
    }
  }
  drawTears(a, t) {
    for (let k = 0; k < 24; k++) {
      const tb = a.emote.t0 + k * .34, s = t - tb; if (s < 0 || s > .85) continue;
      const ex = a.x + (k % 2 ? 2 : -3), ey = a.y - 20 + 34 * s * s; if (ey > a.y - 1) continue;
      px(ex, ey, 1, 2, '#8fd0ff'); px(ex, ey, 1, 1, '#ffffff');
    }
  }
  drawWake(a, t) {
    const im = IM[a.sprite], w = im.width * (a.scale || 1), hw = w * .42, ph = Math.floor(t * 4), idx = Math.round(((a.scale || 1) - .36) / .64 * 5), bob = R(Math.sin(t * 2.3 + 1) * 1.1);
    g.fillStyle = '#f2fbfb'; g.globalAlpha = .85;
    for (let k = 0; k < 3 + idx; k++) { const dx = ((k * 7 + ph * 2) % Math.max(8, R(hw * 2))) - hw; g.fillRect(R(a.x + dx), R(a.y + 1 + (k % 2)) + bob, 2 + (idx > 2 ? 1 : 0), 1); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(30,70,120,.25)'; g.fillRect(R(a.x - hw), R(a.y + 3 + idx * .3), R(hw * 2), 1);
  }
  // world-space overlays drawn inside the camera transform, after entities
  drawWorldFx() {
    const t = this.t;
    for (const f of this.fx) {
      if (f.type === 'splash') { const p = f.u; for (let i = 0; i < 14; i++) { const a = rnd(i) * Math.PI - Math.PI, v = 18 + rnd(i + 5) * 26; px(f.x + Math.cos(a) * v * p, f.y - 8 + Math.sin(a) * v * p + 40 * p * p, 2, 2, i % 2 ? '#ffffff' : '#bfe6ff', 1 - p); } for (let r = 0; r < 3; r++) { const rr = 4 + p * 22 + r * 5; g.strokeStyle = 'rgba(255,255,255,' + (1 - p) * .7 + ')'; g.strokeRect(R(f.x - rr), R(f.y - rr / 3), rr * 2, R(rr * .66)); } }
      if (f.type === 'speed') { const a = this.actors.get(f.id); if (a) for (let i = 0; i < 6; i++) { const off = [-11, -6, -2, 3, 8, 12][i], L = 6 + 10 * rnd(i + Math.floor(t * 14)) + 8; px(a.x + off, a.y - 37 - L - 2 * i % 5, 1, L, i % 2 ? '#ffffff' : '#dfeeff', .75); } }
    }
    if (this.letters) this.drawLetters(t);
    // falling speed lines automatically
    for (const a of this.actors.values()) if (a.falling && a.falling.speed && a.falling.u > .22 && a.falling.u < 1 && a.world === this.world.id) {
      const u = a.falling.u, al = Math.min(1, (u - .22) * 4) * (1 - (u > .8 ? seg(u, .8, 1) * .8 : 0));
      for (let i = 0; i < 6; i++) { const off = [-11, -6, -2, 3, 8, 12][i], L = 6 + 10 * rnd(i + Math.floor(t * 14)) + u * 8; px(a.x + off, a.y - 37 - L - 2 * i % 5, 1, L, i % 2 ? '#ffffff' : '#dfeeff', al * .75); }
    }
  }
  drawLetters(t) {
    const L = this.letters, s = L.scale, step = 8 * s, lv = [];
    for (let i = 0; i < L.text.length; i++) {
      const ti = L.t0 + i * L.per; if (t < ti || L.text[i] === ' ') continue;
      const dt = t - ti, dy = dt < .1 ? -5 : dt < .2 ? -3 : dt < .3 ? -1 : 0, done = L.t0 + L.text.length * L.per + .4, bob = t > done ? R(Math.sin(t * 2.2 + i * .7)) : 0;
      lv.push([i, L.x + i * step, L.y + dy + bob, dt]);
    }
    const draw = (col, ox, oy) => { const f = tint(col); for (const [i, x, y] of lv) g.drawImage(f, (L.text.charCodeAt(i) - 32) * 8, 0, 8, 16, x + ox, y + oy, 8 * s, 16 * s); };
    for (const o of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2], [-2, 2], [0, 4], [2, 4]]) draw('#7a4a12', o[0], o[1]);
    draw('#f5c542', 0, 0); draw('#f5c542', 0, 1);
    const done = L.t0 + L.text.length * L.per + .4;
    if (t > done) { const sx = L.x - 30 + ((t - done) * 55) % (L.text.length * step + 80); g.save(); g.beginPath(); g.rect(sx, L.y - 10, 7, 60); g.clip(); draw('#fffbe0', 0, 0); g.restore(); }
    for (const [i, x, y, dt] of lv) if (dt < .5) { const p = dt / .5; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .6; px(x + 8 + Math.cos(a) * (6 + 12 * p), y + 16 + Math.sin(a) * (4 + 10 * p), 2, 2, '#fff3b0', 1 - p); } }
  }
  // screen-space passes: washes, stills, bars, caption, badge
  drawScreen() {
    const t = this.t;
    for (const f of this.fx) {
      if (f.type === 'shimmer' || f.type === 'flash') {
        const w = f.u < .5 ? f.u * 2 : 2 - f.u * 2, amp = f.type === 'shimmer' ? 2.4 * Math.sin(Math.PI * w) : 0;
        if (amp > 0) { tg.clearRect(0, 0, V.W, V.H); tg.drawImage(g.canvas, 0, 0); g.clearRect(0, 0, V.W, V.H); for (let r = 0; r < V.H; r++) g.drawImage(tmp, 0, r, V.W, 1, R(Math.sin(r * .09 + t * 7) * amp), r, V.W, 1); }
        g.fillStyle = f.type === 'flash' ? `rgba(255,255,255,${Math.pow(w, 1.2).toFixed(3)})` : `rgba(196,226,255,${(Math.pow(w, 1.4) * .92).toFixed(3)})`; g.fillRect(0, 0, V.W, V.H);
      }
      if (f.type === 'sun') this.drawSun(f, t);
    }
    if (this.wash && this.wash.a > .005) { g.fillStyle = `rgba(${this.wash.col},${this.wash.a.toFixed(3)})`; g.fillRect(0, 0, V.W, V.H); }
    if (this.still) this.drawStill(t);
    const bh = R(16 * eio(this.barT));
    g.fillStyle = '#1b1424'; g.fillRect(0, 0, V.W, bh); g.fillRect(0, V.H - bh, V.W, bh);
    if (bh >= 16) { g.fillStyle = '#3a2c4c'; g.fillRect(0, bh - 1, V.W, 1); g.fillRect(0, V.H - bh, V.W, 1); }
    this.barPx = bh;
    if (this.caption) this.drawCaption(t); else if (this.capEl) { this.capEl.classList.remove('in'); this.capRef.key = ''; }
    if (this.badge) this.drawBadge(t);
  }
  drawSun(f, t) {   // the sun turns back in its course: it rises, stops, and runs backwards across the sky
    const u = f.u, a = u < .35 ? seg(u, 0, .35) : u < .6 ? 1 - seg(u, .35, .6) * 1 : 0;
    const dir = u < .35 ? 1 : -1, x = u < .35 ? lerp(V.W * .15, V.W * .6, seg(u, 0, .35)) : lerp(V.W * .6, V.W * .1, seg(u, .35, .95));
    const y = 52 - 24 * Math.sin(Math.PI * (x / V.W)), w = Math.sin(Math.PI * u);
    g.fillStyle = `rgba(255,140,60,${(w * .28).toFixed(3)})`; g.fillRect(0, 0, V.W, V.H);
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(R(x), R(y), 13, 0, 6.3); g.fill(); g.fillStyle = '#f5c542'; g.beginPath(); g.arc(R(x), R(y), 10, 0, 6.3); g.fill();
    for (let i = 0; i < 10; i++) { const an = i * Math.PI / 5 + t * 1.5 * -dir; px(x + Math.cos(an) * 19, y + Math.sin(an) * 19, 3, 3, '#ffd45a'); }
    g.globalAlpha = 1;
  }
  drawStill(t) {
    const s = this.still, u = (this.t - s.t0) / (s.ms / 1000), fi = seg(u, 0, .08), fo = 1 - seg(u, .9, 1);
    const im = s.im, cover = Math.max(V.W / im.width, V.H / im.height);
    let sc = cover * (1 + (s.kb ? (s.kb.to - 1) * u : 0.03 * u)) * (s.punch ? lerp(1.25, 1, eio(fi)) : 1);
    const w = im.width * sc, h = im.height * sc; let ox = 0, oy = 0;
    if (s.kb && s.kb.pan) { ox = s.kb.pan[0] * u; oy = s.kb.pan[1] * u; }
    const [sx, sy] = this.camOffset();
    g.globalAlpha = Math.min(fi * 1.4, fo, 1); g.imageSmoothingEnabled = true;
    g.fillStyle = '#1b1424'; g.fillRect(0, 0, V.W, V.H); g.drawImage(im, R((V.W - w) / 2 + ox + sx), R((V.H - h) / 2 + oy + sy), R(w), R(h));
    g.imageSmoothingEnabled = false; g.globalAlpha = 1;
  }
  layout() { const bw = Math.min(V.W - 24, 520), cols = Math.floor((bw - 28) / 8); return { bw, cols, bx: R((V.W - bw) / 2) }; }
  // The caption is a DOM box (crisp text in a real font, much easier to read than the 8-px bitmap); it ignores pointer events so taps reach the canvas.
  drawCaption(t) {
    const c = this.caption;
    if (!this.capEl) {
      const por = el('img', { class: 'scap-por hidden', draggable: 'false' }), nm = el('span', { class: 'scap-name' }), fl = el('span', { class: 'chip scap-flag hidden' });
      const on = el('span', { class: 'on' }), off = el('span', { class: 'off' }), arrow = el('i', { class: 'scap-arrow' });
      this.capEl = el('div', { class: 'scap panel' }, por, el('div', { class: 'scap-body' }, el('div', { class: 'scap-head' }, nm, fl), el('div', { class: 'scap-text' }, on, off)), arrow);
      this.capRef = { por, nm, fl, on, off, arrow, key: '', typed: -1 }; document.body.append(this.capEl);
    }
    const E = this.capEl, r = this.capRef, key = c.speaker + '|' + c.text;
    if (r.key !== key) {
      r.key = key; r.typed = -1; r.nm.textContent = speakerName(c.speaker);
      const F = c.flag && FLAGS[c.flag]; r.fl.classList.toggle('hidden', !F); if (F) { r.fl.textContent = F.tag; r.fl.style.setProperty('--c', F.color); }
      E.classList.remove('in'); void E.offsetWidth; E.classList.add('in');
      const pt = this.portrait(c); r.por.classList.toggle('hidden', !pt); if (pt) r.por.src = pt.src;
    }
    if (r.por.classList.contains('hidden')) { const pt = this.portrait(c); if (pt && r.por.getAttribute('src') !== pt.src) { r.por.src = pt.src; r.por.classList.remove('hidden'); } }
    if (r.typed !== c.typed) { r.typed = c.typed; r.on.textContent = c.text.slice(0, c.typed); r.off.textContent = c.text.slice(c.typed); }
    const done = c.typed >= c.text.length; r.arrow.classList.toggle('show', done && (c.hold === null || this.interactive));
    const k = V.S / V.dpr; E.style.bottom = Math.round(Math.max(this.barPx || 0, 16) * k + 8) + 'px';
    this.captionTop = Math.max(20, E.getBoundingClientRect().top / k);
    if (c.typed < c.text.length && !c.silent && Math.floor(t * 30) !== this.lastBlip) { this.lastBlip = Math.floor(t * 30); if (this.lastBlip % 3 === 0 && c.text[c.typed - 1] !== ' ') sfx.blip(); }
  }
  // (smoothScaled is a module-level helper: see below the class)
  portrait(c) {   // dialogue portrait beside the caption, from art/portraits/<speaker>_<mood>
    const sp = c.actor || c.speaker, mood = c.mood || 'neutral';
    for (const id of [sp + '_' + mood, sp + '_neutral', sp + '_calm', sp]) { const u = aiAssets[id]; if (!u || !/portrait/.test(u)) continue; const k = 'portrait:' + id; if (IM[k]) return IM[k]; loadImage(k, u); return null; }
    return null;
  }
  drawBadge(t) {
    const b = this.badge, s = t - b.t0, F = FLAGS[b.flag] || FLAGS.myth, pl = pill(F.tag, F.color, 1);
    const sc = s < .07 ? .35 : s < .14 ? .65 : s < .21 ? 1.25 : 1, { bw, bx } = this.layout();
    const cx_ = bx + bw - pl.width / 2 - 14, cy_ = (this.captionTop ?? V.H - 80) - 26, bob = s > .4 ? R(Math.sin(t * 3.2)) : 0;
    const w = R(pl.width * sc), h = R(pl.height * sc); g.drawImage(pl, R(cx_ - w / 2), R(cy_ - h / 2 + bob), w, h);
    if (s < .5) { const p = s / .5; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + .3; px(cx_ + Math.cos(a) * (pl.width / 2 + 6 + 16 * p), cy_ + Math.sin(a) * (10 + 10 * p), 2, 2, k % 2 ? '#ffffff' : '#d6c4ff', 1 - p); } }
  }
}

// Shrink a big portrait to `h` px tall with proper smoothing (halving steps), cached per image and size.
// Drawing a 512 px image straight into the small pixel canvas with smoothing off crushes it to noise.
const _smoothCache = new WeakMap();
function smoothScaled(im, h) {
  let per = _smoothCache.get(im); if (!per) { per = {}; _smoothCache.set(im, per); }
  if (per[h]) return per[h];
  const w = Math.max(1, Math.round(im.width * h / im.height));
  let src = im, sw = im.width, sh = im.height;
  while (sw / 2 > w * 1.5) {
    const c = document.createElement('canvas'); c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d'); o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high'; o.drawImage(src, 0, 0, w, h);
  per[h] = out; return out;
}
