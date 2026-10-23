// Companions and rides: the pet that follows the player (feed it olives), Glauka's outfit, the stall NPC in the Agora, the donkey cart (animated fast travel
// along the real streets) and the chariot (a faster ride-on mount with dust). Distances scale with world.ws (render scale) so they hold if the map is drawn larger.
import { g, IM, shadowAt } from './render.js';
import { R, dist, el, $ } from './util.js';
import { me, store, onChange } from './store.js';
import { sfx } from './audio.js';
import { drawPlayer, CW, CH, FEET } from './player.js';
import * as ui from './ui.js';
import { loadShop, shopData, itemById, equipped, isOwned, useOlive } from './economy.js';
import { input } from './input.js';

const U = W => (W && W.ws) || 1;
const PET_SPEED = { cat: 62, tortoise: 20, little_owl: 58, goat: 46, donkey: 42 };

export class Companions {
  constructor(game) { this.G = game; this.pet = null; this.mount = false; this.ride = null; this.dust = []; this.stall = null; this.dustT = 0; }
  async init() {
    await loadShop(); const G = this.G, st = shopData().stall, A = G.worlds.athens, sp = st && G.spotById(st.near);
    if (sp && A) { const u = U(A), q = A.nearestWalkable(sp.x + st.offset[0] * u, sp.y + st.offset[1] * u); this.stall = { x: q.x, y: q.y, label: st.label, world: 'athens' }; }
    const bar = $('topbtns'); if (bar && !$('bCart')) {
      this.bCart = el('button', { id: 'bCart', class: 'btn small hidden', text: 'Cart', onclick: () => { unlockAudio(); this.cartMenu(); } });
      this.bRide = el('button', { id: 'bRide', class: 'btn small hidden', text: 'Ride', onclick: () => { unlockAudio(); this.toggleMount(); } }); bar.prepend(this.bCart, this.bRide);
    }
    onChange(() => this.sync()); this.sync();
  }
  sync() {   // buttons and pet follow the player record
    const p = me(), S = this.G.stories; if (this.bCart) { this.bCart.classList.toggle('hidden', !(p && p.items && p.items.donkey_cart)); }
    const ch = itemById('chariot'), has = !!(p && ch && isOwned(ch, S)); if (this.bRide) { this.bRide.classList.toggle('hidden', !has); this.bRide.textContent = this.mount ? 'Walk' : 'Ride'; }
    if (!has) this.mount = false;
    const pid = this.petName(); if (!pid) this.pet = null; else if (!this.pet || this.pet.name !== pid) { const q = this.G.player; this.pet = { name: pid, x: q.x - 14, y: q.y, face: 1, hop: 0, fed: 0, moving: false, t: 0, heart: 0, world: this.G.world.id }; }
  }
  petName() { const id = equipped('pet'), it = id && itemById(id); return it ? it.pet : null; }
  glaukaItem() { return equipped('glauka'); }
  owlImg(flap) { const id = this.glaukaItem(), k = id ? `owl_${id}_${flap ? 1 : 0}` : null; return (k && IM[k]) || IM[flap ? 'owl_1' : 'owl_0']; }
  speedMul() { return this.mount && this.G.world.kind === 'live' ? 1.9 : 1; }
  // ------------------------------------------------------------ per frame
  update(dt) {
    const G = this.G, W = G.world, p = G.player, u = U(W), t = G.time;
    if (this.ride) return this.updateRide(dt);
    if (G.mode !== 'play' || G.scene || G.busy || W.kind === 'map') return;
    // pet
    const pt = this.pet;
    if (pt) {
      if (pt.world !== W.id) { pt.x = p.x - 14 * u; pt.y = p.y; pt.world = W.id; }
      const fed = t < pt.fed, want = (fed ? 11 : 20) * u, d = dist(pt.x, pt.y, p.x, p.y), sp = (PET_SPEED[pt.name] || 50) * u * (fed ? 1.5 : 1) * (d > 50 * u ? 2.2 : 1);
      pt.moving = false;
      if (d > want) {
        const nx = pt.x + (p.x - pt.x) / d * sp * dt, ny = pt.y + (p.y - pt.y) / d * sp * dt; const ok = (x, y) => W.kind !== 'live' || !W.solid(x, y);
        if (ok(nx, ny)) { pt.x = nx; pt.y = ny; pt.moving = true; } else if (ok(nx, pt.y)) { pt.x = nx; pt.moving = true; } else if (ok(pt.x, ny)) { pt.y = ny; pt.moving = true; }
        pt.face = p.x < pt.x ? -1 : 1; pt.t += dt;
      }
      if (d > 180 * u) { pt.x = p.x - 14 * u; pt.y = p.y; }
      if (pt.hop > 0) pt.hop = Math.max(0, pt.hop - dt);
      if (pt.heart > 0) pt.heart -= dt;
    }
    // dust behind the chariot
    if (this.mount && p.moving) { sfx.rumble(); this.dustT -= dt; if (this.dustT <= 0) { this.dustT = .07; const bx = p.facing === 'l' ? 14 : p.facing === 'r' ? -14 : 0, by = p.facing === 'f' ? -4 : p.facing === 'b' ? 5 : 0; this.dust.push({ x: p.x + (bx + (Math.random() - .5) * 8) * u, y: p.y + by * u, vx: (Math.random() - .5) * 10, vy: -6 - Math.random() * 6, t: 0, r: 2 + Math.random() * 2 }); } }
    for (const d of this.dust) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt * .4; } this.dust = this.dust.filter(d => d.t < .6);
  }
  // ------------------------------------------------------------ entities drawn in the world
  ents(W) {
    const out = [], t = this.G.time, u = U(W);
    if (this.stall && W.id === 'athens') {
      const s = this.stall; out.push({ y: s.y, draw: () => { const im = IM.prop_stall, m = IM.c_merchant_0, an = (window.__castAnchors || {}); shadowAt(s.x, s.y, 22, .25); if (im) g.drawImage(im, R(s.x - im.width / 2), R(s.y - im.height + 1)); if (m) g.drawImage(m, R(s.x - 34), R(s.y - m.height + 2 + Math.sin(t * 2) * .6)); } });
    }
    const pt = this.pet;
    if (pt && pt.world === W.id) out.push({ y: pt.y, box: { x0: pt.x - 12, y0: pt.y - 18, x1: pt.x + 12, y1: pt.y + 2 }, draw: () => this.drawPet(pt, t) });
    if (this.dust.length && W.id === this.G.world.id) out.push({ y: this.G.player.y - .5, draw: () => { for (const d of this.dust) { g.globalAlpha = (1 - d.t / .6) * .7; g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(R(d.x), R(d.y), d.r * (1 + d.t * 2), 0, 7); g.fill(); } g.globalAlpha = 1; } });
    return out;
  }
  drawPet(pt, t) {
    const fr = pt.moving ? Math.floor(pt.t * 6) % 2 : 0, im = IM[`pet_${pt.name}_${fr}`]; if (!im) return;
    const hop = pt.hop > 0 ? Math.abs(Math.sin(pt.hop * 9)) * 6 : 0, bob = pt.name === 'little_owl' ? Math.sin(t * 5) * 1.2 : 0;
    shadowAt(pt.x, pt.y, im.width * .45, .25);
    const x = R(pt.x - im.width / 2), y = R(pt.y - im.height + 2 - hop - (pt.name === 'little_owl' ? 3 + bob : 0));
    if (pt.face < 0) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y);
    if (pt.heart > 0) { const h = IM.emote_heart; if (h) { g.globalAlpha = Math.min(1, pt.heart); g.drawImage(h, R(pt.x - 8), R(pt.y - im.height - 16 - (1.6 - pt.heart) * 6)); g.globalAlpha = 1; } }
  }
  // the player, or the player on a mount; returns true if it drew
  drawRider(p, sheet, frame) {
    const R_ = this.ride; if (R_) return this.drawCart(R_.x, R_.y, R_.face, sheet, true);
    if (this.mount && this.G.world.kind === 'live') return this.drawChariot(p.x, p.y, p.facing, sheet, p.moving);
    return false;
  }
  drawCart(x, y, face, sheet, moving) {
    const im = IM.ride_donkey_cart; if (!im) return false; const flip = face === 'l'; shadowAt(x, y, 26, .3);
    const bob = moving ? Math.sin(this.G.time * 14) * .8 : 0; g.save(); g.translate(R(x), R(y)); if (flip) g.scale(-1, 1);
    g.drawImage(im, -26, R(-im.height + 2 + bob)); g.restore();
    const sx = x + (flip ? -9 : 9);   // the girl sits in the box, upper body only
    g.drawImage(sheet, 0, (flip ? 2 : 3) * CH + FEET - 39, CW, 28, R(sx - CW / 2), R(y - 30 + bob), CW, 28); return true;
  }
  drawChariot(x, y, facing, sheet, moving) {
    const im = IM.ride_chariot; if (!im) return false; const flip = facing === 'l' || facing === 'b' && false; const bob = moving ? Math.sin(this.G.time * 18) * .9 : 0; shadowAt(x, y, 28, .3);
    g.save(); g.translate(R(x), R(y)); if (flip) g.scale(-1, 1); g.drawImage(im, -20, R(-im.height + 3 + bob)); g.restore();
    const sx = x + (flip ? -13 : 13); drawPlayer(g, sheet, sx, y - 5 + bob, facing === 'l' ? 'l' : 'r', 0); return true;
  }
  // ------------------------------------------------------------ tapping the pet, the stall
  tapPet(w) {
    const pt = this.pet; if (!pt || pt.world !== this.G.world.id || dist(w.x, w.y, pt.x, pt.y - 6) > 16 * U(this.G.world)) return false;
    if (!useOlive()) { ui.toast('No olives. Buy some at the costume stall in the Agora.', 2600); return true; }
    pt.fed = this.G.time + 45; pt.hop = .7; pt.heart = 1.6; sfx.coin(); sfx[{ cat: 'meow', goat: 'bleat', donkey: 'heehaw', tortoise: 'munch', little_owl: 'hoot' }[pt.name] || 'tap'](); ui.toast(`${pt.name.replace('_', ' ')} loves the olive!`, 1800); return true;
  }
  nearStall() { const s = this.stall, G = this.G; if (!s || G.world.id !== 'athens' || G.world.kind !== 'live') return null; return dist(G.player.x, G.player.y, s.x, s.y) < 40 * U(G.world) ? { kind: 'stall', ref: s } : null; }
  tapStall(w) { const s = this.stall; return !!(s && this.G.world.id === 'athens' && dist(w.x, w.y, s.x - 14, s.y - 14) < 28 * U(this.G.world)); }
  async openStall() {
    const G = this.G; try { const m = await import('./wardrobe.js'); if (m && m.openWardrobe) return m.openWardrobe({ from: 'stall' }); } catch (e) { }
    const m = await import('./shop.js'); m.openShop(G);
  }
  // ------------------------------------------------------------ donkey cart
  cartMenu() {
    const G = this.G; if (G.busy || G.mode !== 'play' || G.world.id !== 'athens') { ui.toast('The cart only runs in Athens.'); return; }
    const stops = shopData().stops, body = el('div', { class: 'cartlist' }, el('p', { text: 'Where to?' }), ...stops.map(s => el('button', { class: 'btn', text: s.label, onclick: () => { ui.closeOverlay(); this.rideTo(s.id); } })));
    ui.openOverlay('Donkey cart', body);
  }
  async rideTo(stopId) {
    const G = this.G, W = G.world, st = shopData().stops.find(s => s.id === stopId); if (!st || G.busy || W.kind !== 'live') return;
    const dest = W.nearestWalkable(...Object.values(W.project(st.lat, st.lon))), path = astar(W, G.player, dest); if (!path) { ui.toast('No road that way.'); return; }
    G.busy = true; input.enabled = false; ui.hud(false); this.mount = false; this.sync();
    this.ride = { path, i: 1, x: path[0].x, y: path[0].y, face: 'r', clop: 0, label: st.label, res: null };
    sfx.heehaw(); ui.toast('Clip-clop... (tap to skip)', 1800);
    await new Promise(res => { this.ride.res = res; });
    this.ride = null; G.player.x = dest.x; G.player.y = dest.y; G.player.facing = 'f'; G.owl.x = dest.x - 18; G.owl.y = dest.y; if (this.pet) { this.pet.x = dest.x - 14; this.pet.y = dest.y; }
    G.cam.x = dest.x; G.cam.y = dest.y; G.busy = false; input.enabled = true; ui.hud(true); ui.toast('Arrived: ' + st.label, 1800);
  }
  skipRide() { if (this.ride && this.ride.res) { this.ride.i = this.ride.path.length; } }
  updateRide(dt) {
    const r = this.ride, G = this.G, W = G.world; if (!r.res) return; const sp = 130 * U(W);
    let left = sp * dt;
    while (left > 0 && r.i < r.path.length) {
      const q = r.path[r.i], d = dist(r.x, r.y, q.x, q.y);
      if (d <= left) { r.x = q.x; r.y = q.y; left -= d; r.i++; } else { r.x += (q.x - r.x) / d * left; r.y += (q.y - r.y) / d * left; if (Math.abs(q.x - r.x) > 1) r.face = q.x < r.x ? 'l' : 'r'; left = 0; }
    }
    r.clop -= dt; if (r.clop <= 0) { r.clop = .24; sfx.clop && sfx.clop(); }
    G.player.x = r.x; G.player.y = r.y; G.owl.x = r.x - 22; G.owl.y = r.y - 4; G.cam.x += (r.x - G.cam.x) * Math.min(1, dt * 6); G.cam.y += (r.y - 6 - G.cam.y) * Math.min(1, dt * 6);
    if (r.i >= r.path.length) { const res = r.res; r.res = null; res(); }
  }
  toggleMount() { const G = this.G; if (G.busy || G.mode !== 'play') return; this.mount = !this.mount; this.sync(); sfx.whoosh && sfx.whoosh(); ui.toast(this.mount ? 'Chariot! Hold on tight.' : 'Back on foot.', 1500); }
}
const unlockAudio = () => import('./audio.js').then(m => m.unlock());

// A* over the 16-px tile grid of a live world (8 directions, no corner cutting), then line-of-sight smoothing. Returns [{x, y}] in world px, or null.
export function astar(W, from, to) {
  const T = W.T || 16, cols = W.cols, rows = W.rows, ok = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !W.solid(x * T + T / 2, y * T + T / 2);
  const sx = Math.floor(from.x / T), sy = Math.floor(from.y / T), gx = Math.floor(to.x / T), gy = Math.floor(to.y / T); if (!ok(gx, gy)) return null;
  const key = (x, y) => y * cols + x, gS = new Float32Array(cols * rows).fill(1e9), prev = new Int32Array(cols * rows).fill(-1), closed = new Uint8Array(cols * rows);
  const heap = []; const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
  gS[key(sx, sy)] = 0; push(h(sx, sy), key(sx, sy)); let n = 0;
  while (heap.length && n++ < 90000) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; const x = k % cols, y = (k / cols) | 0; if (x === gx && y === gy) break;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!ok(nx, ny) || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue;
      const nk = key(nx, ny), c = gS[k] + (dx && dy ? 1.414 : 1) * (W.code(nx * T + 8, ny * T + 8) === 'S' || W.code(nx * T + 8, ny * T + 8) === 'l' ? .75 : 1);   // streets are cheaper
      if (c < gS[nk]) { gS[nk] = c; prev[nk] = k; push(c + h(nx, ny), nk); }
    }
  }
  if (prev[key(gx, gy)] < 0 && !(sx === gx && sy === gy)) return null;
  const pts = []; for (let k = key(gx, gy); k >= 0; k = prev[k]) { pts.push({ x: (k % cols) * T + T / 2, y: ((k / cols) | 0) * T + T / 2 }); if (k === key(sx, sy)) break; } pts.reverse();
  pts[0] = { x: from.x, y: from.y };
  const los = (a, b) => { const d = dist(a.x, a.y, b.x, b.y), n = Math.ceil(d / 4); for (let i = 1; i < n; i++) { if (W.solid(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; } return true; };
  const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !los(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  out[out.length - 1] = { x: to.x, y: to.y }; return out;
}
