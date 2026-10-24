// Roaming gods (data/gods.json): coloured Olympians with a halo and aura wander near their temples and are rude to mortals. Separate from the marble story statues (js/characters.js).
// They ignore the player until within `near` tiles, then face her and say a rotating one-liner in a DOM speech bubble (never blocks movement). Talking to one 3+ times within 60 s
// triggers its harmless pester effect. Everything draws on the Athens map at player scale.
import { g, IM, shadowAt, px } from './render.js';
import { tocaHas, tocaPose } from './toca.js';
import { R, dist, el, rnd, SPEAKERS } from './util.js';
import { sfx } from './audio.js';
import { aiAssets } from './scene.js';
import { decorHold, autoTap } from './reading.js';
import { me } from './store.js';
import { earnOwls, spendOwls } from './economy.js';
import * as ui from './ui.js';

const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const lerp = (a, b, u) => a + (b - a) * u;
const NAMES = { hephaestus: 'Hephaestus', dionysus: 'Dionysus', ares: 'Ares', demeter: 'Demeter', nike: 'Nike', hermes: 'Hermes', hera: 'Hera', zeus: 'Zeus', aphrodite: 'Aphrodite', athena: 'Athena', poseidon: 'Poseidon' };
const glows = {};   // soft radial glow sprites by colour
function glowImg(rgb, r) {
  const k = rgb + r; if (glows[k]) return glows[k];
  const c = document.createElement('canvas'); c.width = c.height = r * 2; const x = c.getContext('2d'), gr = x.createRadialGradient(r, r, 1, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},.55)`); gr.addColorStop(.5, `rgba(${rgb},.22)`); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.fillRect(0, 0, r * 2, r * 2); return glows[k] = c;
}

export class Gods {
  constructor(G) { this.G = G; this.list = []; this.cfg = null; this.ready = false; this.bubble = null; this.fxs = []; this.shake = null; this.wet = 0; this.flashEl = null; this.stolen = null; window.__gods = this; }
  get W() { return this.G.worlds.athens; }
  async init() {
    this.cfg = await j('data/gods.json'); const A = this.W; if (!this.cfg || !A) return; const X = this.G.extras; if (!X || !X.ready) return;
    Object.assign(SPEAKERS, Object.fromEntries(Object.entries(NAMES).filter(([k]) => !SPEAKERS[k])));
    for (const d of this.cfg.gods) {
      if (!IM['c_' + d.sprite + '_0'] && !tocaHas(d.sprite)) continue;   // no sprite yet (the Bacchae exist only as cartoons)
      const h = d.home, c = h.lat !== undefined ? A.project(h.lat, h.lon) : { x: h.x * A.ws, y: h.y * A.ws }; c.x += (h.dx || 0); c.y += (h.dy || 0);
      const q = X.walkNear(c, 5); if (q.moved === -1) continue;
      this.list.push({ d, id: d.id, x: q.x, y: q.y, hx: q.x, hy: q.y, tx: q.x, ty: q.y, going: false, wait: .5 + rnd(this.list.length + 2) * 3, t: 0, moving: false, face: 1, armed: true, cool: 0, last: -1, talks: [], speakT: -99, seed: this.list.length * 2.3 });
    }
    this.flashEl = el('div', { id: 'godflash' }); document.body.append(this.flashEl); this.ready = true;
  }
  walkable(x, y) { const W = this.W; return !W.solid(x - 4, y) && !W.solid(x + 4, y) && !W.solid(x, y + 1) && !W.solid(x, y - 3); }
  // ------------------------------------------------------------ update
  update(dt) {
    const G = this.G; if (!this.ready) return; const W = G.world, p = G.player, t = G.time;
    for (const f of this.fxs.slice()) { f.t += dt; if (f.t > f.dur) this.fxs.splice(this.fxs.indexOf(f), 1); }
    if (this.wet > 0) this.wet -= dt;
    if (W.id !== 'athens' || W.kind !== 'live') { this.closeBubble(); return; }
    const near = (this.cfg.near || 3) * W.T, busy = G.scene || G.busy || G.mode !== 'play' || G.flight || G.trans;
    for (const o of this.list) {
      o.moving = false; const dp = dist(o.x, o.y, p.x, p.y); o.cool -= dt;
      if (o.d.follow && dp < 900) {   // a troop: run after the leader, keeping a place beside her
        const L = this.list.find(q => q.id === o.d.follow); if (L) { const tx = L.x + (o.d.off || [0, 0])[0], ty = L.y + (o.d.off || [0, 0])[1], dd = dist(o.x, o.y, tx, ty);
          if (dd > 3) { const sp = Math.min(dd * 4, o.d.speed), nx = o.x + (tx - o.x) / dd * sp * dt, ny = o.y + (ty - o.y) / dd * sp * dt; if (this.walkable(nx, ny)) { o.x = nx; o.y = ny; } else { o.x = tx; o.y = ty; } o.moving = true; o.face = tx < o.x ? -1 : 1; o.t += dt; } else o.face = L.face; }
      } else if (dp < 900 && !(o.talking && dp < near * 1.5)) {
        o.wait -= dt; const d = o.d;
        if (o.wait <= 0 && !o.going) {
          const a = rnd(t * 3 + o.hx) * 6.28, r = (.25 + rnd(t + o.hy) * .75) * d.radius * W.T, tx = o.hx + Math.cos(a) * r, ty = o.hy + Math.sin(a) * r * .7;
          if (this.walkable(tx, ty) && G.extras.tileSeen(tx, ty)) { o.tx = tx; o.ty = ty; o.going = true; } else o.wait = .8;
        }
        if (o.going) {
          const dd = dist(o.x, o.y, o.tx, o.ty);
          if (dd < 2) { o.going = false; o.wait = (d.wait !== undefined ? d.wait : 2.5) + rnd(t + o.x) * (d.wait !== undefined ? 1.5 : 5); }
          else {
            const nx = o.x + (o.tx - o.x) / dd * d.speed * dt, ny = o.y + (o.ty - o.y) / dd * d.speed * dt;
            if (this.walkable(nx, ny) && G.extras.tileSeen(nx, ny)) { o.x = nx; o.y = ny; o.moving = true; o.face = o.tx < o.x ? -1 : 1; o.t += dt; } else { o.going = false; o.wait = 1; }
          }
        }
      }
      if (o.talking) o.face = p.x < o.x ? -1 : 1;
      // proximity: speak once, re-arm after she leaves, or again after a pause if she loiters (that is how pestering happens)
      if (dp > near * 1.8) o.armed = true;
      if (!busy && dp < near && o.cool <= 0 && (o.armed || t - o.speakT > 9)) this.talk(o);
      if (!busy && o.d.skate && dp < near * 1.6 && G.skate && G.skate.active && G.skate.active() && G.skate.speedNow > 20 && t - (o.skateT || -99) > 14 && !this.bubble) { o.skateT = t; this.say(o, o.d.skate); }
    }
  }
  // ------------------------------------------------------------ talking
  nearest(w, r) { let b = null, bd = r; for (const o of this.list) { const d = dist(w.x, w.y, o.x, o.y - 14); if (d < bd) { bd = d; b = o; } } return b; }
  tap(w) {
    if (!this.ready || this.G.world.id !== 'athens' || this.G.busy || this.G.scene) return false; const o = this.nearest(w, 24); if (!o) return false;
    const p = this.G.player; if (dist(p.x, p.y, o.x, o.y) > 110) { ui.toast(`${o.d.name} is too far. Walk closer.`, 1800); sfx.tap(); return true; }
    if (o.d.story && this.G.time - o.speakT < 6 && !this.G.busy && !this.G.scene) { const sp = this.G.spotById(o.d.story); if (sp) { this.closeBubble(); this.G.playStory(sp); return true; } }   // second tap: the story
    if (this.G.time - o.speakT < 1.2) return true; this.talk(o); return true;
  }
  nextLine(o) { const L = o.d.lines; let i; do { i = Math.floor(Math.random() * L.length); } while (L.length > 1 && i === o.last); o.last = i; return L[i]; }
  talk(o) {
    const G = this.G, t = G.time; o.armed = false; o.speakT = t; o.cool = 3; o.talks = o.talks.filter(x => t - x < (this.cfg.pesterWindow || 60)); o.talks.push(t);
    const line = this.nextLine(o), text = typeof line === 'string' ? line : line.t, pester = o.talks.length >= (this.cfg.pesterCount || 3);
    if (o.d.story && !this.G.collected(o.d.story)) setTimeout(() => ui.toast(`Tap ${o.d.name} again for the story`, 2600), 900);
    this.say(o, text);
    if (typeof line !== 'string' && line.steal) this.steal(o, 900);
    if (pester) { o.talks = []; setTimeout(() => this.pester(o), 1100); }
  }
  say(o, text) {
    this.closeBubble(); const id = o.d.sprite, url = [id + '_neutral', id].map(k => aiAssets[k]).find(u => u && /portrait/.test(u)); o.talking = true;
    const por = el('img', { class: 'gpor' + (url ? '' : ' pix'), src: url || `art/c_${id}_0.png`, draggable: 'false' }), tx = el('div', { class: 'gtext' });
    const b = el('div', { class: 'panel gbubble godbubble' }, por, el('div', { class: 'gbody' }, el('b', { text: o.d.name }), tx)); document.body.append(b); this.bubble = b;
    let n = 0; const ti = setInterval(() => { n++; tx.textContent = text.slice(0, n); if (n % 3 === 0) sfx.blip && sfx.blip(); if (n >= text.length) clearInterval(ti); }, 22);
    const done = () => { clearInterval(ti); clearTimeout(to); b.classList.add('out'); setTimeout(() => b.remove(), 250); if (this.bubble === b) this.bubble = null; o.talking = false; };
    const to = setTimeout(done, Math.max(3400, decorHold(text) * (autoTap() ? .5 : 1))); b._done = done;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); if (n < text.length) { n = text.length; tx.textContent = text; } else done(); });
  }
  closeBubble() { if (this.bubble && this.bubble._done) this.bubble._done(); }
  // ------------------------------------------------------------ pestering (all harmless, nothing is ever removed)
  pester(o) {
    const G = this.G, p = G.player, t = G.time, k = o.d.pester; o.pestered = (o.pestered || 0) + 1;
    const add = (type, dur, o2 = {}) => this.fxs.push({ type, t: 0, dur, x: p.x, y: p.y, ...o2 });
    switch (k) {
      case 'lightning': { const a = Math.random() * 6.28, x = p.x + Math.cos(a) * 64, y = p.y + Math.sin(a) * 40; add('bolt', .6, { x, y }); this.flash('#fff', .5); sfx.thunder(); this.shake = { t0: t, ms: 600, amp: 4 }; break; }
      case 'splash': add('splash', 1.2); this.wet = 4.5; sfx.splash(); this.flash('rgba(120,200,255,.5)', .6); break;
      case 'owlglare': this.glare(); break;
      case 'steal': this.steal(o, 0); break;
      case 'sparks': add('sparks', 1.4); sfx.pop && sfx.pop(); break;
      case 'vines': add('vines', 3); sfx.chime && sfx.chime(); break;
      case 'hearts': add('hearts', 2.4, { ox: o.x - p.x, oy: o.y - p.y }); sfx.chime && sfx.chime(); setTimeout(() => this.say(o, 'Sigh.'), 700); break;
    }
  }
  flash(col, s) { const f = this.flashEl; if (!f) return; f.style.background = col; f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = `opacity ${s}s ease-out`; f.style.opacity = 0; }
  glare() {   // Athena's owl stares: a close-up of two huge eyes, then it blinks away
    const w = el('div', { class: 'owlglare' }, el('img', { src: 'art/owl_0.png', draggable: 'false' })); document.body.append(w); sfx.hoot && sfx.hoot(); setTimeout(() => w.classList.add('out'), 900); setTimeout(() => w.remove(), 1250);
  }
  // Hermes takes one owl and flicks it back two seconds later
  steal(o, delay) {
    const G = this.G; if (this.stolen) return;
    setTimeout(() => {
      if (this.stolen) return; if (!spendOwls(1)) return; this.stolen = true; sfx.whoosh(); o.dash = G.time; this.fxs.push({ type: 'coin', t: 0, dur: 2, o });
      setTimeout(() => { this.stolen = null; earnOwls(1, 'hermes'); sfx.chime && sfx.chime(); this.say(o, 'Kidding. Mostly.'); }, 2000);
    }, delay);
  }
  shakeOffset() { const s = this.shake, t = this.G.time; if (!s) return [0, 0]; const u = (t - s.t0) / (s.ms / 1000); if (u >= 1) { this.shake = null; return [0, 0]; } const a = s.amp * (1 - u); return [Math.round((rnd(t * 60) - .5) * 2 * a), Math.round((rnd(t * 60 + 9) - .5) * 2 * a)]; }
  // ------------------------------------------------------------ drawing
  ents(W) {
    if (!this.ready || W.id !== 'athens') return [];
    const G = this.G, t = G.time, cx = G.cam.x, cy = G.cam.y, out = [], near = (x, y, r) => Math.abs(x - cx) < r && Math.abs(y - cy) < r;
    for (const o of this.list) if (near(o.x, o.y, 480)) {
      const tp = tocaHas(o.d.sprite) && tocaPose(o.d.sprite, o.moving ? (o.face < 0 ? 'l' : 'r') : 'f', o.moving, t * (o.d.speed > 30 ? 1.8 : 1));
      if (tp) { tp.x = o.x; tp.y = o.y; out.push({ y: o.y, box: { x0: o.x - 16, y0: o.y - 66, x1: o.x + 16, y1: o.y + 2 }, toca: tp, draw: () => { shadowAt(o.x, o.y, 15, .26); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .35 + .15 * Math.sin(t * 2 + o.seed); g.fillStyle = `rgb(${o.d.glow})`; g.beginPath(); g.ellipse(o.x, o.y - 30, 22, 36, 0, 0, 7); g.fill(); g.restore(); } });
        if (o.talking) out.push({ y: o.y + .5, draw: () => { const e = IM.emote_exclaim; e && g.drawImage(e, R(o.x - 8), R(o.y - 72 + Math.sin(t * 5))); } }); continue; }
      out.push({ y: o.y, box: { x0: o.x - 14, y0: o.y - 42, x1: o.x + 14, y1: o.y + 2 }, draw: () => this.drawGod(o, t) });
    }
    for (const f of this.fxs) out.push({ y: (f.o ? f.o.y : f.y) + (f.type === 'vines' || f.type === 'bolt' ? 2 : 40), draw: () => this.drawFx(f, t) });
    if (this.wet > 0) out.push({ y: G.player.y + 1, draw: () => this.drawWet(t) });
    return out;
  }
  drawGod(o, t) {
    const d = o.d, nm = d.sprite, fr = o.moving ? [1, 0, 2, 0][Math.floor(o.t * (d.fx === 'streak' ? 10 : 5)) % 4] : 0, im = IM[`c_${nm}_${fr}`] || IM[`c_${nm}_0`]; if (!im) return;
    const a = (this.G.anchors || {})[`c_${nm}_0`] || [im.width / 2, im.height - 1], x = R(o.x - a[0]), bob = o.moving ? 0 : Math.round(Math.sin(t * 1.8 + o.seed) * .8), y = R(o.y - a[1]) + bob - (o.talking ? Math.round(Math.abs(Math.sin(t * 9)) * 2) : 0), hy = y - 3;
    shadowAt(o.x, o.y, 13, .26);
    // additive aura behind, then a soft halo ring above the head
    g.save(); g.globalCompositeOperation = 'lighter'; const gr = Math.round(im.height * .95 + Math.sin(t * 2 + o.seed) * 2), gi = glowImg(d.glow, 48); g.globalAlpha = .55 + .15 * Math.sin(t * 2.6 + o.seed);
    g.drawImage(gi, R(o.x - gr), R(o.y - im.height * .55 - gr), gr * 2, gr * 2);
    g.globalAlpha = .9; g.strokeStyle = `rgb(${d.glow})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(R(o.x), hy, 8, 2.4, 0, 0, 7); g.stroke();
    g.globalAlpha = .35; g.lineWidth = 3; g.stroke(); g.restore();
    this.drawFlavour(o, t, y, im);
    if (o.face < 0) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y);
    if (o.talking) { const e = IM.emote_exclaim; e && g.drawImage(e, R(o.x - 8), R(hy - 16 + Math.sin(t * 5))); }
  }
  drawFlavour(o, t, y, im) {
    const d = o.d, fx = d.fx, top = y + 2;
    const dot = (px_, py_, c, al, s = 1) => { g.globalAlpha = al; g.fillStyle = c; g.fillRect(R(px_), R(py_), s, s); g.globalAlpha = 1; };
    if (fx === 'sparkle') for (let i = 0; i < 5; i++) { const ph = (t * .7 + o.seed + i * .37) % 1; if (ph < .45) { const sx = o.x + Math.sin(i * 2.1 + o.seed) * 13, sy = top + 6 + ((i * 7) % 26) - ph * 6, al = Math.sin(ph / .45 * Math.PI); dot(sx, sy, '#fff6c0', al); dot(sx - 1, sy, `rgb(${d.glow})`, al * .7); dot(sx + 1, sy, `rgb(${d.glow})`, al * .7); dot(sx, sy - 1, `rgb(${d.glow})`, al * .7); dot(sx, sy + 1, `rgb(${d.glow})`, al * .7); } }
    if (fx === 'drip') for (let i = 0; i < 4; i++) { const ph = (t * .9 + o.seed + i * .31) % 1, sx = o.x - 9 + i * 6 + Math.sin(i) * 2, sy = top + 12 + ph * (im.height - 10); dot(sx, sy, '#8fd8ff', 1 - ph * .6); dot(sx, sy + 1, '#cfeeff', 1 - ph * .6); }
    if (fx === 'ember') for (let i = 0; i < 6; i++) { const ph = (t * .8 + o.seed + i * .23) % 1, sx = o.x + Math.sin(i * 1.7 + ph * 3) * 10, sy = o.y - 6 - ph * 30; dot(sx, sy, ph < .5 ? '#ffd27a' : '#ff7a3a', 1 - ph); }
    if (fx === 'streak' && (o.moving || (o.dash && t - o.dash < 1))) for (let i = 1; i < 5; i++) { const dx = -o.face * i * 6, sy = top + 12 + i * 4 - 8; g.globalAlpha = .45 - i * .08; g.fillStyle = '#fff6c0'; g.fillRect(R(o.x + dx - 6), R(sy), 10, 1); g.fillRect(R(o.x + dx - 4), R(sy + 8), 8, 1); g.globalAlpha = 1; }
  }
  drawFx(f, t) {
    const u = f.t / f.dur, p = this.G.player;
    if (f.type === 'bolt') {
      if (u > .5) return; g.strokeStyle = '#fff'; g.lineWidth = 2; g.globalAlpha = 1 - u * 2; g.beginPath(); let bx = f.x + 18, by = f.y - 210; g.moveTo(bx, by);
      for (let i = 1; i <= 8; i++) { bx += (rnd(i + Math.floor(f.t * 30)) - .5) * 26 + (f.x - bx) / (9 - i); by += (f.y - by) / (9 - i + .2) + 3; g.lineTo(bx, by); }
      g.lineTo(f.x, f.y); g.stroke(); g.strokeStyle = '#ffe98a'; g.lineWidth = 5; g.globalAlpha *= .35; g.stroke(); g.globalAlpha = 1; for (let i = 0; i < 6; i++) px(f.x + (rnd(i) - .5) * 20, f.y - rnd(i + 5) * 6, 2, 1, '#fff6c0', 1 - u * 2);
    }
    if (f.type === 'splash') {
      for (let i = 0; i < 16; i++) { const a = rnd(i) * Math.PI - Math.PI, v = 16 + rnd(i + 5) * 28; px(p.x + Math.cos(a) * v * u, p.y - 10 + Math.sin(a) * v * u + 46 * u * u, 2, 2, i % 2 ? '#ffffff' : '#bfe6ff', 1 - u); }
      for (let r = 0; r < 3; r++) { const rr = 5 + u * 26 + r * 6; g.strokeStyle = `rgba(190,235,255,${((1 - u) * .8).toFixed(2)})`; g.strokeRect(R(p.x - rr), R(p.y - rr / 3), rr * 2, R(rr * .66)); }
    }
    if (f.type === 'sparks') for (let i = 0; i < 18; i++) { const a = rnd(i) * 6.28, v = 8 + rnd(i + 3) * 26; px(p.x + Math.cos(a) * v * u, p.y - 14 + Math.sin(a) * v * u * .8 + 20 * u * u, 2, 2, i % 3 ? '#ffb040' : '#fff2b0', 1 - u); }
    if (f.type === 'vines') {
      const grow = Math.min(1, u * 1.6); if (u > .75) g.globalAlpha = Math.max(0, 1 - (u - .75) * 4);
      for (let k = 0; k < 4; k++) {
        const dir = k < 2 ? -1 : 1, base = p.x + dir * (4 + k % 2 * 5); g.strokeStyle = '#4a9a4a'; g.lineWidth = 1; g.beginPath();
        for (let i = 0; i <= 14 * grow; i++) { const yy = p.y - i * 1.9, xx = base + Math.sin(i * .6 + k) * 3 * (1 + i / 14); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
        const n = Math.floor(8 * grow); for (let i = 1; i <= n; i++) { const yy = p.y - i * 3.2, xx = base + Math.sin(i * 1.05 + k) * 3 * (1 + i / 9); px(xx + (i % 2 ? 1 : -2), yy, 2, 1, '#7ad05a', 1); if (i === 5) { px(xx, yy + 1, 2, 2, '#8a3ab8', 1); px(xx + 2, yy + 2, 2, 2, '#a85ad0', 1); } }
      }
    }
    if (f.type === 'hearts') for (let i = 0; i < 6; i++) { const ph = (u * 1.2 + i * .17) % 1, im = IM.emote_heart; if (!im) continue; g.globalAlpha = Math.sin(ph * Math.PI) * (1 - u * .5); const src = i % 2 ? { x: p.x, y: p.y } : { x: p.x + f.ox, y: p.y + f.oy }; g.drawImage(im, R(src.x - 8 + Math.sin(i * 2 + t * 2) * 8), R(src.y - 34 - ph * 30)); g.globalAlpha = 1; }
    if (f.type === 'coin') {
      const im = IM.coin, o = f.o; if (!im) return; const u2 = Math.min(1, f.t / .5), back = f.t > 1.4 ? Math.min(1, (f.t - 1.4) / .6) : 0, sx = lerp(p.x, o.x, u2), sy = lerp(p.y - 14, o.y - 22, u2);
      const x = lerp(sx, p.x, back), y = lerp(sy, p.y - 14, back) - Math.sin(back * Math.PI) * 18; g.drawImage(im, R(x - 6), R(y - 6), 12, 10);
    }
    g.globalAlpha = 1;
  }
  drawWet(t) {   // the girl drips for a few seconds after Poseidon's wave
    const p = this.G.player, u = this.wet / 4.5; g.fillStyle = `rgba(90,160,220,${(.3 * Math.min(1, u * 2)).toFixed(2)})`; g.beginPath(); g.ellipse(R(p.x), R(p.y + 1), 12, 3.5, 0, 0, 7); g.fill();
    for (let i = 0; i < 5; i++) { const ph = (t * 1.6 + i * .21) % 1; px(p.x - 8 + i * 4 + Math.sin(i) * 2, p.y - 24 + ph * 24, 1, 2, '#8fd8ff', u); }
  }
}
