// Exploration layer: hidden owl feathers, wandering locals (cats, a koulouri seller, tourists, the Acropolis guard, the figures in Epicurus's Garden) and secrets
// (tortoise friend, the cat on the column, the Ghost of the Areopagus). Data-driven from data/feathers.json, data/secrets.json and data/npc_spots.json.
// Everything lives on the Athens map; people are drawn at player scale. Positions come as lat/lon (world.project) or generated-map px (x world.ws).
import { g, IM, shadowAt } from './render.js';
import { R, dist, el, $, SPEAKERS, rnd } from './util.js';
import { me, store, touch, award } from './store.js';
import { sfx } from './audio.js';
import { Scene, aiAssets } from './scene.js';
import { decorHold } from './reading.js';
import { earnOwls, REWARDS } from './economy.js';
import * as ui from './ui.js';

const FEATHER_BADGE = 'trail:Feather Finder';
const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const pick = (a, k) => a[Math.floor(rnd(k) * a.length) % a.length];

export class Extras {
  constructor(G) { this.G = G; this.feathers = []; this.locals = []; this.ready = false; this.ghost = null; this.areoT = 0; this.guardCool = 0; this.followT = 0; this.sleepy = null; window.__extras = this; }
  get W() { return this.G.worlds.athens; }
  async init() {
    const [fe, sec, npc] = await Promise.all([j('data/feathers.json'), j('data/secrets.json'), j('data/npc_spots.json')]);
    this.sec = sec || {}; this.fdata = fe || []; this.npc = npc || {}; Object.assign(SPEAKERS, this.sec.names || {});
    const A = this.W; if (!A) return; this.reach = this.G.reachSet('athens');
    const ll = a => A.project(a.lat, a.lon);
    // ---- feathers: each tucked at its lat/lon, nudged to the nearest tile you can walk to if needed
    for (const f of this.fdata) { const q = this.walkNear(ll(f.pos), 6); this.feathers.push({ id: f.id, fact: f.fact, x: q.x, y: q.y, moved: q.moved, seed: this.feathers.length * 1.7 }); }
    const S = this.sec;
    // ---- cats
    if (S.cats) S.cats.places.forEach((c, i) => this.addLocal({ id: c.id, kind: 'cat', mode: c.mode, at: ll(c.at), home: c.home, lines: [pick(S.cats.lines, i + 3), pick(S.cats.lines, i + 40)], name: 'cat', speed: 26 }));
    // ---- koulouri seller, guard
    if (S.koulouri) this.addLocal({ id: 'koulouri', kind: 'npc', sprite: S.koulouri.sprite, at: ll(S.koulouri.at), home: S.koulouri.home, lines: S.koulouri.lines, name: S.koulouri.name, speed: 14 });
    if (S.guard) { this.guardCfg = S.guard; this.addLocal({ id: 'guard', kind: 'npc', sprite: S.guard.sprite, at: ll(S.guard.at), home: 0, lines: S.guard.lines, name: S.guard.name, speed: 0, guard: true }); }
    // ---- tourists on the summit and by the monuments (spots from the map generator), in small selfie groups
    const T = S.tourists; if (T && this.npc.tourists) {
      const k = A.ws; const list = this.npc.tourists.slice(0, T.limit || 40);
      const picked = [];   // variety: never the same look as the last four tourists or anyone within ~150 px
      list.forEach((t, i) => { const q = this.walkNear({ x: t[0] * k, y: t[1] * k }, 3); let sprite = null;
        for (let n = 0; n < T.sprites.length && !sprite; n++) { const c = T.sprites[(Math.floor(rnd(i * 5.3 + t[2] * 1.7) * T.sprites.length) + n * 7) % T.sprites.length];
          if (picked.slice(-4).some(p => p.s === c || (T.look && T.look[p.s] === T.look[c])) || picked.some(p => p.s === c && Math.hypot(p.x - q.x, p.y - q.y) < 150)) continue; sprite = c; }
        sprite = sprite || T.sprites[i % T.sprites.length]; picked.push({ s: sprite, x: q.x, y: q.y });
        const grp = Math.floor(i / 3); const pl = T.photoLines[grp % T.photoLines.length];
        const o = this.addLocal({ id: 'tour' + i, kind: 'npc', sprite, at: q, home: T.home, lines: t[2] === 0 ? pl : [pick(T.chatLines, i)], photo: t[2] === 0, name: T.name, speed: 8, selfie: i % 2 === 0, tourist: true }); o.face = rnd(i * 3.1) < .5 ? -1 : 1; o.t = rnd(i * 2.3) * 5; o.bobPh = rnd(i * 9.1) * 6; });
    }
    // ---- Epicurus's garden
    const Gd = S.garden; if (Gd) { const c = ll(Gd.at), u = 1 / A.mpp; for (const f of Gd.figures) this.addLocal({ id: 'garden-' + f.sprite, kind: 'npc', sprite: f.sprite, at: { x: c.x + f.dx * u, y: c.y + f.dy * u }, home: 0, lines: f.lines, name: f.name, speed: 0, still: true }); }
    // ---- secrets
    if (S.tortoise) this.tort = { kind: 'tortoise', id: S.tortoise.id, ...this.place(ll(S.tortoise.at)), hx: 0, hy: 0, home: S.tortoise.home, speed: 9, wait: 1, t: 0, face: 1, cfg: S.tortoise, name: 'tortoise', lines: S.tortoise.lines, following: false };
    if (S.tortoise) { this.tort.hx = this.tort.x; this.tort.hy = this.tort.y; }
    if (S.sleepingCat) { const q = this.walkNear(ll(S.sleepingCat.at), 6); this.sleepy = { x: q.x, y: q.y, cfg: S.sleepingCat, state: 'sleep', t: 0 }; this.hideFeather = S.sleepingCat.feather; }
    if (S.areopagus) this.areo = { ...S.areopagus, c: ll(S.areopagus.at) };
    this.glow = el('div', { id: 'sunset' }); document.body.append(this.glow);
    this.ftoast = el('div', { id: 'ftoast', class: 'hidden' }); document.body.append(this.ftoast);
    this.ready = true;
  }
  // ---- helpers
  walkable(x, y) { const W = this.W; return !W.solid(x - 4, y) && !W.solid(x + 4, y) && !W.solid(x, y + 1) && !W.solid(x, y - 3); }
  tileSeen(x, y) { const W = this.W, T = W.T, tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < W.cols && ty < W.rows && !!this.reach[ty * W.cols + tx]; }
  walkNear(p, maxR = 6) {   // nearest spot you can actually reach on foot
    const W = this.W, T = W.T; if (this.walkable(p.x, p.y) && this.tileSeen(p.x, p.y)) return { x: p.x, y: p.y, moved: 0 };
    for (let r = 1; r <= maxR * 3; r++) for (let a = 0; a < 12 * r; a++) { const th = a / (12 * r) * Math.PI * 2, x = p.x + Math.cos(th) * r * T / 3, y = p.y + Math.sin(th) * r * T / 3; if (this.walkable(x, y) && this.tileSeen(x, y)) return { x, y, moved: Math.round(r * T / 3) }; }
    return { x: p.x, y: p.y, moved: -1 };
  }
  place(p) { const q = this.walkNear(p, 5); return { x: q.x, y: q.y }; }
  anchor(name) { const a = (this.G.anchors || {})[name]; const im = IM[name]; return a || (im ? [im.width / 2, im.height - 1] : [0, 0]); }
  addLocal(o) {
    const q = this.walkNear(o.at, 5); Object.assign(o, { x: q.x, y: q.y, hx: q.x, hy: q.y, wait: 1 + rnd(this.locals.length + 5) * 4, t: 0, face: 1, moving: false, tx: q.x, ty: q.y, pose: 0, poseT: 4 + rnd(this.locals.length) * 6 });
    this.locals.push(o); return o;
  }
  // ---- feathers
  found() { const p = me(); return p ? p.feathers || {} : {}; }
  count() { return Object.keys(this.found()).length; }
  collect(f) {
    const p = me(); if (!p || p.feathers[f.id]) return; p.feathers[f.id] = Date.now(); touch(store.me); sfx.chime();
    const n = this.count(); this.showFeather(`Feather ${n}/${this.feathers.length}`, f.fact); earnOwls(REWARDS.feather, 'feather');
    if (n >= this.feathers.length && award(FEATHER_BADGE)) setTimeout(() => ui.toast('Feather Finder! You found all the feathers. The owl-feather cape is yours.', 4500), 2200);
  }
  showFeather(title, fact) {
    const t = this.ftoast, glauka = ['glauka_neutral', 'glauka'].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
    t.replaceChildren(...(glauka ? [el('img', { src: glauka })] : []), el('div', {}, el('b', { text: title }), el('p', { text: fact })));
    t.classList.remove('hidden'); clearTimeout(this._ft); this._ft = setTimeout(() => t.classList.add('hidden'), Math.max(5200, decorHold(fact) + 1500)); t.onclick = () => t.classList.add('hidden');
  }
  featherPage() {
    const p = me(), f = this.found(), list = this.fdata;
    const rows = list.map(x => el('li', { class: f[x.id] ? 'got' : '' }, f[x.id] ? x.fact : 'A hidden feather. Keep exploring.'));
    ui.openOverlay(`Feathers ${this.count()}/${list.length}`, el('div', { class: 'featherpage' }, el('p', { text: 'Glauka hid owl feathers all over Athens. Walk over one to find it.' }), el('ul', {}, ...rows), el('button', { class: 'btn', text: 'Back to the book', onclick: () => ui.bookScreen() })));
  }
  // ---- update
  update(dt) {
    const G = this.G; if (!this.ready) return; const W = G.world, p = G.player, t = G.time;
    if (W.id !== 'athens' || W.kind !== 'live') { this.glow.style.opacity = 0; return; }
    const busy = G.scene || G.busy || G.mode !== 'play' || G.flight || G.trans;
    // locals wander only near the player
    for (const o of this.locals) {
      o.moving = false; const dp = dist(o.x, o.y, p.x, p.y); if (dp > 700) continue;
      if (o.guard || o.still) continue;
      o.wait -= dt;
      if (o.wait <= 0 && !o.going) {
        const a = rnd(t * 3 + o.hx) * 6.28, r = (.3 + rnd(t + o.hy) * .7) * o.home, tx = o.hx + Math.cos(a) * r, ty = o.hy + Math.sin(a) * r * .7;
        if (this.walkable(tx, ty) && this.tileSeen(tx, ty)) { o.tx = tx; o.ty = ty; o.going = true; } else o.wait = 1.5;
      }
      if (o.going) {
        const d = dist(o.x, o.y, o.tx, o.ty); if (d < 2) { o.going = false; o.wait = 2.5 + rnd(t + o.x) * 5; } else {
          const nx = o.x + (o.tx - o.x) / d * o.speed * dt, ny = o.y + (o.ty - o.y) / d * o.speed * dt;
          if (this.walkable(nx, ny)) { o.x = nx; o.y = ny; o.moving = true; o.face = o.tx < o.x ? -1 : 1; o.t += dt; } else { o.going = false; o.wait = 2; }
        }
      }
      if (o.selfie) { o.poseT -= dt; if (o.poseT <= 0) { o.pose = o.pose ? 0 : 1; o.poseT = o.pose ? 1.4 : 5 + rnd(t + o.x) * 6; } }
    }
    this.updateTortoise(dt, p); if (busy) return;
    // feathers
    for (const f of this.feathers) { if (this.found()[f.id] || (this.hideFeather === f.id && !this.catRevealed())) continue; if (dist(p.x, p.y, f.x, f.y - 4) < 16) this.collect(f); }
    // the guard
    this.guardCool -= dt; const gc = this.guardCfg; if (gc && p.moving && this.guardCool <= 0 && this.inSummit(p)) {
      const dx = p.facing === 'r' ? 1 : p.facing === 'l' ? -1 : 0, dy = p.facing === 'f' ? 1 : p.facing === 'b' ? -1 : 0, ahead = W.code(p.x + dx * 14, p.y + dy * 14), here = W.code(p.x, p.y);
      if ((gc.bump && ahead === 'B') || (gc.offPath && here === gc.offPath)) this.whistle();
    }
    // Areopagus ghost
    const A = this.areo; if (A && !(me() && me().badges[A.badge])) {
      if (!this.ghost && dist(p.x, p.y, A.c.x, A.c.y) < A.radius * (W.ws || 1) / 2 && !p.moving) { this.areoT += dt; if (this.areoT >= A.seconds) { this.areoT = 0; this.startGhost(); } } else if (!this.ghost) this.areoT = 0;
    }
    if (this.ghost) this.updateGhost(dt);
  }
  inSummit(p) { const S = this.sec.summit, W = this.W; if (!S) return false; const a = W.project(S.latMin, S.lonMin), b = W.project(S.latMax, S.lonMax); return p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x) && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y); }
  whistle() {
    const gc = this.guardCfg; this.guardCool = gc.cooldown || 18; sfx.whistle(); ui.toast(gc.whistle, 2600); const o = this.locals.find(l => l.guard); if (o) { o.emoteT = this.G.time + 1.8; }
  }
  // ---- tortoise friend
  updateTortoise(dt, p) {
    const o = this.tort; if (!o) return; const G = this.G;
    if (o.following && G.time > this.followT) { o.following = false; o.hx = o.x; o.hy = o.y; }
    if (o.following) { const d = dist(o.x, o.y, p.x, p.y); o.moving = false; if (d > 26) { const nx = o.x + (p.x - o.x) / d * 24 * dt, ny = o.y + (p.y - o.y) / d * 24 * dt; if (this.walkable(nx, ny)) { o.x = nx; o.y = ny; o.moving = true; o.face = p.x < o.x ? -1 : 1; o.t += dt; } else if (this.walkable(nx, o.y)) { o.x = nx; o.moving = true; } else if (this.walkable(o.x, ny)) { o.y = ny; o.moving = true; } } return; }
    o.moving = false; o.wait -= dt; if (o.wait <= 0 && !o.going) { const a = rnd(G.time + 9) * 6.28, r = rnd(G.time) * o.home, tx = o.hx + Math.cos(a) * r, ty = o.hy + Math.sin(a) * r * .7; if (this.walkable(tx, ty) && this.tileSeen(tx, ty)) { o.tx = tx; o.ty = ty; o.going = true; } else o.wait = 2; }
    if (o.going) { const d = dist(o.x, o.y, o.tx, o.ty); if (d < 2) { o.going = false; o.wait = 4 + rnd(G.time) * 6; } else { const nx = o.x + (o.tx - o.x) / d * o.speed * dt, ny = o.y + (o.ty - o.y) / d * o.speed * dt; if (this.walkable(nx, ny)) { o.x = nx; o.y = ny; o.moving = true; o.face = o.tx < o.x ? -1 : 1; o.t += dt; } else { o.going = false; o.wait = 2; } } }
  }
  // ---- the cat on the column and its feather
  catRevealed() { const p = me(); return !!(p && p.stickers && p.stickers[this.sec.sleepingCat.sticker]) || (this.sleepy && this.sleepy.state === 'awake'); }
  tapSleepy() {
    const s = this.sleepy; if (!s) return; const G = this.G;
    if (s.state === 'sleep') { s.state = 'stretch'; s.t = G.time; sfx.purr(); ui.toast(s.cfg.purr, 3600); const p = me(); if (p) { p.stickers[s.cfg.sticker] = Date.now(); touch(store.me); } setTimeout(() => { s.state = 'awake'; }, 2200); const f = this.feathers.find(x => x.id === s.cfg.feather); if (f) { f.pop = G.time; f.x = s.x + 16; f.y = s.y + 8; } }
    else { sfx.purr(); ui.toast('Purr.', 1200); }
  }
  // ---- Areopagus ghost story
  startGhost() {
    const G = this.G, A = this.areo, p = G.player; this.ghost = { t: 0, x0: p.x - 150, y0: p.y + 10, x1: p.x + 170, y1: p.y - 20 }; this.glow.style.opacity = 1; sfx.whoosh && sfx.whoosh();
  }
  updateGhost(dt) {
    const gh = this.ghost; gh.t += dt;
    if (gh.t > 5.5 && !gh.owl) { gh.owl = true; sfx.owlcall(); }
    if (gh.t > 7.2) this.glow.style.opacity = 0;
    if (gh.t > 8.5) {
      this.ghost = null; const A = this.areo; if (award(A.badge)) { earnOwls(A.owls || REWARDS.secret, 'secret'); ui.toast('Ghost of the Areopagus! A secret badge.', 3800); ui.refresh(); } else ui.toast(A.text, 3200);
    }
  }
  // ---- drawing
  ents(W) {
    if (!this.ready || W.id !== 'athens') return [];
    const out = [], G = this.G, t = G.time, cx = G.cam.x, cy = G.cam.y, f = this.found(), near = (x, y, r) => Math.abs(x - cx) < r && Math.abs(y - cy) < r;
    for (const ft of this.feathers) {
      if (f[ft.id] || !near(ft.x, ft.y, 420) || (this.hideFeather === ft.id && !this.catRevealed())) continue;
      out.push({ y: ft.y, draw: () => { const sp = ((t * .8 + ft.seed) % 4) < .35 ? 1 : 0, hop = ft.pop && t - ft.pop < .6 ? Math.abs(Math.sin((t - ft.pop) * 5.2)) * 14 * (1 - (t - ft.pop) / .6) : 0, im = IM['p_feather_' + sp]; if (!im) return; shadowAt(ft.x, ft.y, 5, .2); g.drawImage(im, R(ft.x - 5), R(ft.y - 14 - hop + Math.sin(t * 2 + ft.seed) * 1)); } });
    }
    const draw = o => ({ y: o.y, box: { x0: o.x - 12, y0: o.y - 38, x1: o.x + 12, y1: o.y + 2 }, draw: () => this.drawLocal(o, t) });
    for (const o of this.locals) if (near(o.x, o.y, 420)) out.push(draw(o));
    if (this.tort && near(this.tort.x, this.tort.y, 420)) { const o = this.tort; out.push({ y: o.y, draw: () => { const im = IM['pet_tortoise_' + (o.moving ? Math.floor(o.t * 4) % 2 : 0)]; if (!im) return; shadowAt(o.x, o.y, 9, .25); const x = R(o.x - im.width / 2), y = R(o.y - im.height + 2); if (o.face < 0) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y); if (o.following) { const h = IM.emote_heart; h && g.drawImage(h, R(o.x - 8), R(o.y - 28 + Math.sin(t * 3) * 1.5)); } } }); }
    if (this.sleepy && near(this.sleepy.x, this.sleepy.y, 420)) {
      const s = this.sleepy; out.push({ y: s.y, draw: () => { const key = s.state === 'sleep' ? 'p_cat_sleep' : s.state === 'stretch' ? 'p_cat_stretch' : 'pet_cat_orange_0', im = IM[key]; if (!im) return; shadowAt(s.x, s.y, 12, .2); g.drawImage(im, R(s.x - im.width / 2), R(s.y - im.height + 2 - (s.state === 'sleep' ? 5 : 0)));
        if (s.state === 'sleep') { g.fillStyle = '#5b3a29'; const z = (t * 1.2) % 3; g.globalAlpha = 1 - z / 3; g.fillRect(R(s.x + 8 + z * 2), R(s.y - 20 - z * 5), 3, 1); g.fillRect(R(s.x + 10 + z * 2), R(s.y - 21 - z * 5), 1, 3); g.fillRect(R(s.x + 8 + z * 2), R(s.y - 18 - z * 5), 3, 1); g.globalAlpha = 1; } } });
    }
    if (this.ghost) out.push(...this.ghostEnts(t));
    return out;
  }
  drawLocal(o, t) {
    let im, x, y;
    if (o.kind === 'cat') { im = IM[`pet_cat_${o.mode}_${o.moving ? Math.floor(o.t * 5) % 2 : 0}`]; if (!im) return; shadowAt(o.x, o.y, 8, .22); x = R(o.x - im.width / 2); y = R(o.y - im.height + 2); }
    else {
      const nm = o.sprite, fr = o.moving ? [1, 0, 2, 0][Math.floor(o.t * 6) % 4] : 0, key = o.pose && !o.moving ? `c_${nm}_up` : `c_${nm}_${fr}`; im = IM[key] || IM[`c_${nm}_0`]; if (!im) return;
      const a = this.anchor(`c_${nm}_0`); shadowAt(o.x, o.y, 12, .28); x = R(o.x - a[0]); y = R(o.y - a[1]) - (o.emoteT > t ? Math.abs(Math.sin(t * 14)) * 2 : 0) - (!o.moving && o.bobPh !== undefined && Math.sin(t * 2.2 + o.bobPh) > .8 ? 1 : 0);   // idle shift so a group never moves in lockstep
      if (o.face < 0 && !o.guard && !o.still) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y);
      if (o.emoteT > t) { const e = IM.emote_exclaim; e && g.drawImage(e, R(o.x - 8), R(y - 16)); }
      if (o.pose && !o.moving && o.photo) { /* camera flash twinkle */ if (Math.floor(t * 8) % 5 === 0) { g.fillStyle = '#fff'; g.fillRect(R(o.x + 7), R(y + 8), 2, 2); } }
      return;
    }
    if (o.face < 0) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y);
  }
  ghostEnts(t) {
    const gh = this.ghost, u = Math.min(1, Math.max(0, (gh.t - 1) / 4.5)), mk = (name, dx, dy, a, dark) => ({ y: gh.y0 + (gh.y1 - gh.y0) * u + dy, draw: () => {
      const im = IM['c_' + name + '_' + (Math.floor(gh.t * 7) % 2 ? 1 : 2)] || IM['c_' + name + '_0']; if (!im || u <= 0 || u >= 1) return; const an = this.anchor('c_' + name + '_0');
      g.globalAlpha = Math.sin(u * Math.PI) * a; const x = R(gh.x0 + (gh.x1 - gh.x0) * u + dx - an[0]), y = R(gh.y0 + (gh.y1 - gh.y0) * u + dy - an[1]);
      if (dark) { const k = this.dark(name, im); g.drawImage(k, x, y); } else g.drawImage(im, x, y); g.globalAlpha = 1; } });
    return [mk('orestes', 0, 0, .55, false), mk('fury', -40, -6, .6, true), mk('fury', -66, 10, .5, true), mk('fury', -92, -8, .45, true)];
  }
  dark(name, im) { this._dk = this._dk || {}; const k = name + im.src; if (!this._dk[k]) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(22,10,44,.85)'; x.fillRect(0, 0, c.width, c.height); this._dk[k] = c; } return this._dk[k]; }
  // ---- interaction
  interactables() {
    const out = [...this.locals.map(o => ({ o, kind: 'local' }))]; if (this.tort) out.push({ o: this.tort, kind: 'tortoise' }); if (this.sleepy) out.push({ o: this.sleepy, kind: 'sleepy' }); return out;
  }
  tap(w) {
    if (!this.ready || this.G.world.id !== 'athens') return false; let best = null, bd = 18;
    for (const it of this.interactables()) { const d = dist(w.x, w.y, it.o.x, it.o.y - 10); if (d < bd) { bd = d; best = it; } }
    if (!best) return false; const p = this.G.player; if (dist(p.x, p.y, best.o.x, best.o.y) > 70) { ui.toast('Walk closer.'); sfx.tap(); return true; }
    this.interact(best); return true;
  }
  aTap() {
    if (!this.ready || this.G.world.id !== 'athens') return false; const p = this.G.player; let best = null, bd = 40;
    for (const it of this.interactables()) { const d = dist(p.x, p.y, it.o.x, it.o.y); if (d < bd) { bd = d; best = it; } }
    if (!best) return false; this.interact(best); return true;
  }
  async interact(it) {
    const G = this.G; if (G.scene || G.busy) return; const o = it.o;
    if (it.kind === 'sleepy') return this.tapSleepy();
    if (it.kind === 'tortoise') {
      const p = me(); if (p && !p.stickers[o.cfg.sticker]) { p.stickers[o.cfg.sticker] = Date.now(); touch(store.me); sfx.chime(); ui.toast(o.cfg.friend, 3800); earnOwls(REWARDS.secret, 'secret'); }
      else sfx.munch(); o.following = true; this.followT = G.time + (o.cfg.follow || 150); return this.say('tortoise', pickLine(o.lines));
    }
    const beats = o.photo ? [o.lines[0], '*', o.lines[1]] : o.lines.slice(0, 2);
    const nm = o.kind === 'cat' ? 'cat' : o.name;
    if (o.guard) { sfx.whistle(); }
    this.say(nm, beats);
  }
  async say(speaker, lines) {
    const G = this.G; lines = [].concat(lines); const beats = [];
    for (const l of lines) { if (l === '*') beats.push({ t: 'fx', type: 'flash', ms: 700 }); else beats.push({ t: 'caption', speaker, text: l, hold: 1600 }); }
    const sc = new Scene(G, { id: 'local-' + speaker, speaker, bars: false, startDelay: 50, beats }, { interactive: true }); G.scene = sc;
    try { await sc.run(); } catch (e) { console.error(e); } G.scene = null;
  }
}
const pickLine = a => a[Math.floor(Math.random() * a.length)];
