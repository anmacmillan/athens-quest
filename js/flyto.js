// Fast travel: Glauka picks the girl up and flies her over the rooftops to a place she has already discovered. Also the fog of discovery ("seen" spots,
// kept per player in localStorage), the small info card shown when a flag, character or signpost is tapped (zoomed out, on the mini-map or on the Map screen),
// and the long-press waypoint. Main-quest flags are always allowed; unseen side spots show as '?' and cannot be flown to.
import { g, IM, V, viewRect, clampCam, shadowAt, px } from './render.js';
import { el, clamp, lerp, eio, dist, R, FLAGS, speakerName, lsGet, lsSet } from './util.js';
import { sfx, unlock } from './audio.js';
import { store, me } from './store.js';
import { aiAssets } from './scene.js';
import { drawPlayer } from './player.js';
import { input } from './input.js';
import * as ui from './ui.js';

export class FlyTo {
  constructor(G) { this.G = G; this.f = null; this.seen = new Set(); this.pid = null; this.card = null; this.t = 0; this.dirty = false; window.__fly = this; }
  // ------------------------------------------------------------ fog of discovery
  key() { return 'owlq.seen.' + (store.me || ''); }
  load() { if (this.pid === store.me) return; this.pid = store.me; this.seen = new Set(lsGet(this.key(), [])); }
  known(s) { this.load(); const f = this.G.fog; return !!(s.main || this.seen.has(s.id) || this.G.collected(s.id) || (f && f.W && s.world === f.W.id && f.bits && f.revealedAt(s.x, s.y))); }   // fog and seen agree: a spot in revealed ground is known
  update(dt) {
    const G = this.G, W = G.world; this.load();
    if (this.f) return this.step(dt);
    this.t -= dt; if (this.t > 0 || W.kind !== 'live' || G.scene || G.busy) return; this.t = .4;
    if (G.cam.z < .75) return;   // zoomed out you see everything: only street-level views count as having explored
    const r = viewRect(G.cam), p = G.player;
    for (const s of G.spots) {
      if (s.world !== W.id || this.seen.has(s.id)) continue;
      const inView = s.x > r.x && s.x < r.x + r.w && s.y > r.y && s.y < r.y + r.h;
      if (inView || dist(p.x, p.y, s.x, s.y) < 300) { this.seen.add(s.id); this.dirty = true; }
    }
    if (this.dirty) { this.dirty = false; lsSet(this.key(), [...this.seen]); }
  }
  // ------------------------------------------------------------ taps
  hitAt(w, rad) {   // a flag, a standing character or a signpost under a world point (rad in world px)
    const G = this.G, W = G.world; let best = null, bd = rad;
    const up = G.cam.z < .6 ? 10 / G.cam.z : 6;   // zoomed out the pin body hangs about 10 screen px above its tip
    for (const s of G.spots) if (s.world === W.id) { const d = dist(w.x, w.y, s.x, s.y - up); if (d < bd) { bd = d; best = { kind: 'spot', ref: s }; } }
    if (G.chars && G.chars.ready) for (const c of G.chars.list) if (c.owner && c.world === W.id) { const d = dist(w.x, w.y, c.x, c.y - 12); if (d < bd) { bd = d; best = { kind: 'spot', ref: c.spot }; } }
    for (const s of W.signposts) { const d = dist(w.x, w.y, s.x, s.y - 8); if (d < bd) { bd = d; best = { kind: 'sign', ref: s }; } }
    return best;
  }
  tap(v, w) {   // zoomed-out street view: everything tappable; a tap on empty ground does nothing (long-press sets a waypoint)
    const G = this.G; if (G.world.kind !== 'live' || G.cam.z >= .6) return false;
    const h = this.hitAt(w, 14 / G.cam.z); if (h) this.showCard(h); return true;
  }
  long(v) {
    const G = this.G; if (G.world.kind !== 'live' || G.cam.z >= .6 || G.busy || G.scene || G.mode !== 'play') return;
    const w = { x: G.cam.x + (v.x - V.W / 2) / G.cam.z, y: G.cam.y + (v.y - V.H / 2) / G.cam.z }, W = G.world;
    const q = W.solid(w.x, w.y) ? W.nearestWalkable(w.x, w.y, 12) : { x: w.x, y: w.y };
    G.guide.setMode('waypoint', { x: q.x, y: q.y, world: W.id, waypoint: true, label: 'your waypoint' }); sfx.hoot(); ui.toast('Hoo! Follow me.', 1800);
  }
  mmTap(e) {   // tap on a dot in the mini-map; returns true if it hit one
    const gd = this.G.guide, vw = gd.mmView; if (!vw) return false; const cv = gd.cv, r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
    const W = this.G.world; let best = null, bd = 9;
    for (const s of this.G.spots) if (s.world === W.id) { const d = Math.hypot(vw.ox + s.x * vw.sc - x, vw.oy + s.y * vw.sc - y); if (d < bd) { bd = d; best = { kind: 'spot', ref: s }; } }
    for (const s of W.signposts) { const d = Math.hypot(vw.ox + s.x * vw.sc - x, vw.oy + s.y * vw.sc - y); if (d < bd) { bd = d; best = { kind: 'sign', ref: s }; } }
    if (best) this.showCard(best); return !!best;
  }
  // ------------------------------------------------------------ the card
  closeCard() { if (this.card) { this.card.remove(); this.card = null; } }
  portrait(speaker) {
    const url = speaker && [speaker + '_neutral', speaker].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
    if (url) return el('img', { class: 'fcport', src: url, draggable: 'false' });
    if (speaker && IM['c_' + speaker + '_0']) return el('img', { class: 'fcport pix', src: `art/c_${speaker}_0.png`, draggable: 'false' });
    return el('img', { class: 'fcport pix', src: 'art/owl_0.png', draggable: 'false' });
  }
  showCard(it, fromMap) {
    const G = this.G, W = G.world; this.closeCard(); sfx.tap();
    if (it.kind === 'spot' && !this.known(it.ref)) { ui.toast('Not discovered yet, explore!', 2200); return; }
    const sp = it.kind === 'spot', s = it.ref, title = sp ? s.story.title : s.label, flag = sp ? FLAGS[s.story.flag] : null, done = sp && G.collected(s.id);
    const can = W.kind === 'live' && !G.busy && !G.scene;
    const fly = el('button', { class: 'btn small', text: 'Fly there', onclick: e => { e.stopPropagation(); this.closeCard(); ui.closeOverlay(); this.fly({ x: s.x, y: s.y, sign: !sp }); } });
    if (!can) fly.disabled = true;
    const body = el('div', { class: 'fcbody' }, el('div', { class: 'fctitle', text: title }),
      sp ? el('span', { class: 'chip', style: `--c:${flag.color}`, text: flag.name }) : el('span', { class: 'chip', style: '--c:#8a5fd0', text: 'Signpost' }),
      el('div', { class: 'fcstate', text: sp ? (done ? 'Done: you have this coin' : 'Not done yet') : 'A way out of this map' }),
      el('div', { class: 'fcrow' }, fly, el('button', { class: 'btn small', text: 'Close', onclick: e => { e.stopPropagation(); this.closeCard(); } })));
    this.card = el('div', { class: 'flycard panel', style: `--flag:${flag ? flag.color : '#8a5fd0'}` }, this.portrait(sp && s.story.speaker !== 'glauka' ? s.story.speaker : null), body);
    this.card.addEventListener('pointerdown', e => e.stopPropagation()); document.body.append(this.card);
  }
  // ------------------------------------------------------------ the flight
  fly(dest) {
    const G = this.G, W = G.world; unlock();
    if (this.f || G.busy || G.scene || G.flight || G.mode !== 'play' || W.kind !== 'live') return false;
    if (G.comp.ride) { ui.toast('The cart ride is on.'); return false; }
    const p = G.player; let q = W.nearestWalkable(dest.x + (dest.sign ? 0 : 0), dest.y + (dest.sign ? 26 : 16), 14);
    if (dist(q.x, q.y, dest.x, dest.y) < 8) q = { x: dest.x, y: dest.y + 18 };
    const d = dist(p.x, p.y, q.x, q.y), dur = clamp(1.6 + d / 900, 2, 4);
    G.busy = true; input.enabled = false; ui.setPrompt(null); ui.hud(false); G.nearest = null; p.moving = false; if (G.skate) { G.skate.vx = G.skate.vy = 0; }
    const o = G.owl;
    this.f = { then: dest.then || null, a: { x: p.x, y: p.y }, b: q, d, dur, grab: .55, land: .6, t: 0, z0: G.cam.z, zm: Math.min(G.cam.z, .8), H: 60 + Math.min(d / 12, 140), x: p.x, y: p.y, alt: 0, o0: { x: o.x, y: o.y - (o.alt || 0) }, ph: 'grab', whoosh: false, face: q.x >= p.x ? 'r' : 'l' };
    sfx.hoot(); return true;
  }
  step(dt) {
    const G = this.G, f = this.f, W = G.world; f.t += dt;
    const T = f.grab + f.dur + f.land;
    if (f.t < f.grab) { f.ph = 'grab'; f.x = f.a.x; f.y = f.a.y; f.alt = 0; }
    else if (f.t < f.grab + f.dur) {
      f.ph = 'glide'; if (!f.whoosh) { f.whoosh = true; sfx.whoosh(); } const u = (f.t - f.grab) / f.dur, e = eio(u);
      f.x = lerp(f.a.x, f.b.x, e); f.y = lerp(f.a.y, f.b.y, e); f.alt = 10 + Math.pow(Math.sin(Math.PI * u), .8) * f.H; if (Math.floor(f.t * 9) !== f.wk) { f.wk = Math.floor(f.t * 9); if (f.wk % 3 === 0) sfx.whoosh(); }
    } else { f.ph = 'land'; const u = clamp((f.t - f.grab - f.dur) / f.land); f.x = f.b.x; f.y = f.b.y; f.alt = 10 * (1 - eio(u)); }
    // camera: follow the carried pair, zoom out slightly while airborne, back to street level on landing
    const air = f.ph === 'glide' ? 1 : f.ph === 'grab' ? eio(clamp(f.t / f.grab)) : 1 - eio(clamp((f.t - f.grab - f.dur) / f.land));
    G.cam.x = f.x; G.cam.y = f.y - f.alt - 16;   // locked on: the eased path is already smooth
    G.cam.z = f.ph === 'land' ? lerp(f.zm, 1, eio(clamp((f.t - f.grab - f.dur) / f.land))) : lerp(f.z0, f.zm, air); clampCam(G.cam, W.w, W.h);
    if (f.t >= T) this.land();
  }
  land() {
    const G = this.G, f = this.f, p = G.player, o = G.owl; this.f = null;
    p.x = f.b.x; p.y = f.b.y; p.facing = 'f'; p.moving = false; o.x = p.x - 18; o.y = p.y - 4; o.alt = 0; o.perched = false;
    G.cam.z = 1; G.guide.zt = 1; G.guide.path = null; G.busy = false; input.enabled = true; ui.hud(true); sfx.hoot();
    G.cam.x = p.x; G.cam.y = p.y - 6; clampCam(G.cam, G.world.w, G.world.h); G.panHold = false;
    if (f.then) f.then();
  }
  draw() {   // the girl dangling from Glauka's talons, y-sorted above everything
    const G = this.G, f = this.f; if (!f) return; const t = G.time, a = f.alt;
    const grabU = f.ph === 'grab' ? eio(clamp(f.t / f.grab)) : 1, ox = lerp(f.o0.x, f.x, grabU), oy = lerp(f.o0.y, f.y - 36 - a, grabU);
    shadowAt(f.x, f.y, 14 - Math.min(5, a / 20), .3 * (1 - Math.min(a, 150) / 190));
    const flap = Math.floor(t * (f.ph === 'glide' ? 12 : 8)) % 2 === 1, sheet = G.sheet();
    // wind streaks behind her while gliding
    if (f.ph === 'glide') for (let i = 0; i < 6; i++) { const k = (t * 3 + i * .37) % 1, dx = (f.face === 'r' ? -1 : 1) * (14 + k * 34), yy = f.y - a - 8 - i * 7 - 6; px(f.x + dx, yy, 8 + i % 3 * 3, 1, '#ffffff', (1 - k) * .55); }
    drawPlayer(g, sheet, f.x, f.y - a + (f.ph === 'grab' ? 0 : 0), f.ph === 'glide' ? f.face : 'f', f.ph === 'glide' ? 1 + (Math.floor(t * 6) % 2) : 0);   // legs dangle and kick
    const im = G.comp.owlImg(flap); g.drawImage(im, R(ox - 9), R(oy - 14));
    // talons gripping her shoulders
    if (grabU > .85) { g.fillStyle = '#3a2c4c'; g.fillRect(R(f.x) - 6, R(f.y - a) - 30, 1, 5); g.fillRect(R(f.x) + 5, R(f.y - a) - 30, 1, 5); g.fillStyle = '#f0993c'; g.fillRect(R(f.x) - 7, R(f.y - a) - 30, 3, 1); g.fillRect(R(f.x) + 4, R(f.y - a) - 30, 3, 1); }
  }
}
