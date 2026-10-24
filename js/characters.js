// Characters that are always present: every story with a non-Glauka speaker has that character standing at its spot (idle bob, gestures, a '...' bubble while the story
// is unfinished and a small gold check after). Plus a few living statues. Data-driven from data/characters.json; drawn at player scale, y-sorted with the player.
// Tapping one (or A beside the flag) starts the story through the normal flow. The Greece map is not walkable, so its stories have no standing character.
import { g, IM, shadowAt, px, loadImage } from './render.js';
import { R, dist, el, rnd, SPEAKERS } from './util.js';
import { me } from './store.js';
import { sfx } from './audio.js';
import { Scene } from './scene.js';
import * as ui from './ui.js';
import { tocaHas, tocaPose } from './toca.js';

const SPRITE_TOCA = { ae_stand: 'aegeus' };   // characters drawn from a named sprite rather than c_<who>_0
const j = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);

export class Characters {
  constructor(G) { this.G = G; this.list = []; this.ready = false; this.reachCache = {}; window.__chars = this; }
  async init() {
    const D = await j('data/characters.json') || {}; this.D = D; const G = this.G;
    const taken = [];
    const place = (W, x, y, spot) => {   // nearest reachable standing place that is not on top of a flag, a signpost or another character
      const reach = this.reachCache[W.id] || (this.reachCache[W.id] = W.kind === 'live' ? G.reachSet(W.id) : null);
      const ok = (X, Y) => {
        if (W.kind === 'live') { if (W.solid(X - 4, Y) || W.solid(X + 4, Y) || W.solid(X, Y + 1) || W.solid(X, Y - 3)) return false; const tx = Math.floor(X / W.T), ty = Math.floor(Y / W.T); if (!reach[ty * W.cols + tx]) return false; }
        else if (W.solid(X, Y)) return false;
        for (const s of G.spots) if (s.world === W.id && s !== spot && dist(X, Y, s.x, s.y) < 16) return false;
        for (const s of W.signposts) if (dist(X, Y, s.x, s.y) < 24) return false;
        for (const t of taken) if (t.w === W.id && dist(X, Y, t.x, t.y) < 22) return false;
        return true;
      };
      if (ok(x, y)) return { x, y };
      for (let r = 6; r <= 90; r += 6) for (let a = 0; a < 16; a++) { const th = a / 16 * Math.PI * 2, X = x + Math.cos(th) * r, Y = y + Math.sin(th) * r * .8; if (ok(X, Y)) return { x: X, y: Y }; }
      return null;
    };
    const mk = (W, spot, cfg, base) => {
      const q = place(W, spot.x + (cfg.dx ?? -26), spot.y + (cfg.dy ?? 8), spot); if (!q) return null; taken.push({ w: W.id, x: q.x, y: q.y });
      return { id: spot.id, world: W.id, spot, x: q.x, y: q.y + (cfg.lift ? 0 : 0), lift: cfg.lift || 0, who: cfg.who, sprite: cfg.sprite, pet: cfg.pet, anchor: cfg.anchor, shadow: cfg.shadow, name: cfg.name, lines: cfg.lines, gesture: !!cfg.gesture, stretch: !!cfg.stretch,
        phase: rnd(this.list.length + 3) * 6, gT: 3 + rnd(this.list.length) * 6, gest: 0, owner: base, parts: [] };
    };
    for (const spot of [...G.spots].sort((a, b) => (b.stamp ? 1 : 0) - (a.stamp ? 1 : 0))) {   // building hosts first, so a twin story joins the host at the door
      const W = G.worlds[spot.world]; if (!W || W.kind === 'map') continue; const st = spot.story; if ((D.skip || []).includes(spot.id)) continue;
      let cfg = (D.stories || {})[spot.id]; if (!cfg && st.speaker && st.speaker !== 'glauka' && IM['c_' + st.speaker + '_0']) cfg = { who: st.speaker };
      const host = spot.stamp && spot.stamp.host;   // a passport building: its host stands at the door (the wandering gods have their own module)
      if (host && !['zeus', 'hephaestus', 'dionysus'].includes(host) && IM['c_' + host + '_0'] && (!cfg || !cfg.who || cfg.who !== host)) cfg = Object.assign({}, cfg && cfg.who === null ? {} : (cfg || {}), { who: host, dx: (cfg && cfg.dx) ?? 26, dy: (cfg && cfg.dy) ?? 6 });
      if (!cfg) continue;
      const twin = cfg.who && this.list.find(q => q.owner && q.who === cfg.who && q.world === W.id);   // one figure per person per area: Plato tells both his stories
      if (twin) { (twin.more = twin.more || []).push(spot); spot.mergedInto = twin; continue; }
      const c = mk(W, spot, cfg, true); if (!c) { console.warn('no place for', spot.id); continue; }
      for (const pr of cfg.props || []) c.parts.push({ prop: pr.prop, x: c.x + pr.dx - (cfg.dx ?? -26), y: c.y + pr.dy - (cfg.dy ?? 8), front: !!pr.front });
      for (const ex of cfg.extra || []) { const q = place(W, spot.x + ex.dx, spot.y + ex.dy, spot); if (q) { taken.push({ w: W.id, x: q.x, y: q.y }); c.parts.push({ who: ex.who, x: q.x, y: q.y, name: ex.name, lines: ex.lines, gesture: !!ex.gesture, phase: rnd(this.list.length + 9) * 6, gT: 2 + rnd(this.list.length + 4) * 5, gest: 0 }); } }
      this.list.push(c);
    }
    for (const s of D.statues || []) {
      const spot = G.spotById(s.near); if (!spot) continue; const W = G.worlds[spot.world]; const c = mk(W, spot, { who: s.who, dx: s.dx, dy: s.dy, name: s.name, lines: s.lines }, false); if (!c) continue; c.statue = true; c.glow = s.glow; c.id = s.id; this.list.push(c);
    }
    this.ready = true;
  }
  standing(storyId) { return this.list.find(c => c.owner && c.id === storyId); }
  has(storyId) { return !!this.standing(storyId); }
  hidden(c) { const sc = this.G.scene; return !!(sc && sc.data && c.owner && sc.data.id === c.id); }   // the story's own scene stages the character itself
  update(dt) {
    if (!this.ready) return; const t = this.G.time;
    for (const c of this.list) for (const o of [c, ...c.parts]) {
      if (!o.who || o.statue) continue; o.gT -= dt;
      if (o.gT <= 0) { o.gest = (o.stretch || c.stretch) && o === c ? 2.2 : (o.gesture ? 1.1 : .9); o.gT = (o.gesture ? 2 : 6) + rnd(t + o.phase) * 7; }
      if (o.gest > 0) o.gest -= dt;
    }
  }
  // living statues: marble when far, colouring in as the girl comes near. art/chars/<who>.png and <who>_marble.png (sheets, first cell = front) when present,
  // otherwise the cast sprite and a marble copy made in code (desaturated, lightened).
  statueArt(who) {
    this._st = this._st || {}; if (this._st[who]) return this._st[who]; const o = this._st[who] = { color: null, marble: null, ax: 0, ay: 0, ready: false };
    const cut = (im, cell) => { const c = document.createElement('canvas'); c.width = cell[0]; c.height = cell[1]; c.getContext('2d').drawImage(im, 0, 0, cell[0], cell[1], 0, 0, cell[0], cell[1]); return c; };
    (async () => {
      let idx = this._idx; if (!idx) { try { idx = this._idx = await (await fetch('art/chars/index.json')).json(); } catch (e) { idx = this._idx = {}; } }
      const col = await loadImage('chr_' + who, `art/chars/${who}.png`), mar = await loadImage('chr_' + who + '_m', `art/chars/${who}_marble.png`), meta = idx[who];
      if (col && meta) { o.color = cut(col, meta.cell); o.ax = meta.anchor[0]; o.ay = meta.anchor[1] + 1; if (mar) o.marble = cut(mar, meta.cell); }
      else { const im = IM[`c_${who}_0`], a = (this.G.anchors || {})[`c_${who}_0`]; if (im) { o.color = im; o.ax = a ? a[0] : im.width / 2; o.ay = a ? a[1] : im.height - 1; } }
      if (o.color && !o.marble) {   // marble in code: grey, lightened, with a faint cool shade
        const c = document.createElement('canvas'); c.width = o.color.width; c.height = o.color.height; const k = c.getContext('2d'); k.drawImage(o.color, 0, 0);
        const d = k.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const l = a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11, m = 120 + l * .55; a[i] = m + 6; a[i + 1] = m + 4; a[i + 2] = m + 8; } k.putImageData(d, 0, 0); o.marble = c;
      }
      o.ready = !!o.color;
    })();
    return o;
  }
  drawStatue(o, t) {
    const a = this.statueArt(o.who); if (!a.ready) return false; const p = this.G.player, d = Math.hypot(p.x - o.x, p.y - o.y), k = Math.max(0, Math.min(1, (260 - d) / 170));
    shadowAt(o.x, o.y, 12, .2); const x = R(o.x - a.ax), y = R(o.y - a.ay);
    g.drawImage(a.marble, x, y); if (k > 0) { g.globalAlpha = k; g.drawImage(a.color, x, y); g.globalAlpha = 1; }
    return true;
  }
  img(who, up) { return IM[`c_${who}_${up ? 'up' : 0}`] || IM[`c_${who}_0`]; }
  drawFigure(o, t, c) {
    let im, ax, ay;
    if (o.pet) { im = IM[`pet_${o.pet}_${Math.floor(t * 1.5 + o.phase) % 2}`]; if (!im) return; ax = im.width / 2; ay = im.height - 2; shadowAt(o.x, o.y, 9, .25); g.drawImage(im, R(o.x - ax), R(o.y - ay)); return; }
    if (c.statue && !o.sprite && this.drawStatue(c, t)) return;
    const name = o.sprite || `c_${o.who}_0`, up = o.gest > 0; im = o.sprite ? IM[o.sprite] : this.img(o.who, up); if (!im) return;
    const a = o.sprite ? o.anchor : (this.G.anchors || {})[`c_${o.who}_0`]; ax = a ? a[0] : im.width / 2; ay = a ? a[1] : im.height - 1; o.top = ay + (o.lift || 0);
    const bob = c.statue ? 0 : Math.round(Math.sin(t * 2.1 + o.phase) * .6 + (o.stretch || c.stretch ? 0 : 0)), lift = o.lift || 0;
    shadowAt(o.x, o.y, 12, c.statue ? .2 : .28);
    if (c.statue) { const gl = .22 + .1 * Math.sin(t * 2 + o.phase); g.globalAlpha = gl; g.fillStyle = c.glow || '#fff'; g.beginPath(); g.ellipse(o.x, o.y - 18, 15, 24, 0, 0, 7); g.fill(); g.globalAlpha = c.statue ? .93 : 1; }
    const x = R(o.x - ax), y = R(o.y - ay - lift) - (c.statue ? 0 : (up && (o.stretch || c.stretch) && o === c ? 1 : 0)) + bob;
    if (o.flip) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y);
    g.globalAlpha = 1;
  }
  drawProp(p, t) {
    const im = IM['p_' + p.prop]; if (!im) return; const a = (this.G.anchors || {})['p_' + p.prop] || [im.width / 2, im.height - 1];
    if (p.prop === 'dog') { shadowAt(p.x, p.y, 8, .25); const hop = Math.floor(t * 1.2) % 5 === 0 ? -1 : 0; g.drawImage(im, R(p.x - a[0]), R(p.y - a[1] + hop)); return; }
    shadowAt(p.x, p.y, 14, .28); g.drawImage(im, R(p.x - a[0]), R(p.y - a[1]));
  }
  mark(c, t) {   // the '...' bubble above an unfinished story's character, a small gold check once it is done
    const G = this.G, done = G.collected(c.id) && (c.more || []).every(sp => G.collected(sp.id)), top = c.pet ? 18 : (c.top || ((IM[c.sprite || `c_${c.who}_0`] || { height: 34 }).height) + (c.lift || 0)) + 4;
    const bx = R(c.x - 8), by = R(c.y - top - 16 + Math.sin(t * 3 + c.phase) * 1.5);
    if (!done) {   // a story to hear: a bouncing gold '!' (the RPG sign every child knows)
      const X = R(c.x - 3), Y = R(c.y - top - 18 + Math.abs(Math.sin(t * 4 + c.phase)) * -3), ink = '#3a2140', gold = '#ffd23f', hi = '#fff6c0';
      px(X - 1, Y - 1, 8, 12, ink); px(X - 1, Y + 12, 8, 6, ink); px(X, Y, 6, 10, gold); px(X + 1, Y, 2, 9, hi); px(X, Y + 13, 6, 4, gold); px(X + 1, Y + 13, 2, 2, hi);
    }
    else { const X = R(c.x - 3), Y = R(c.y - top - 6); px(X - 1, Y, 7, 7, '#5b3a29'); const gold = '#f5c542'; for (const [dx, dy] of [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2]]) px(X + dx, Y + dy, 1, 1, gold); px(X + 1, Y + 3, 1, 1, gold); px(X + 4, Y + 2, 1, 1, '#fff6c0'); }
  }
  ents(W) {
    if (!this.ready) return []; const out = [], G = this.G, t = G.time, cx = G.cam.x, cy = G.cam.y;
    for (const c of this.list) {
      if (c.world !== W.id || this.hidden(c) || Math.abs(c.x - cx) > 460 || Math.abs(c.y - cy) > 340) continue;
      const parts = [...c.parts];
      const tid = c.who || SPRITE_TOCA[c.sprite], tp = tid && tocaHas(tid) && tocaPose(tid, 'f', false, t);
      if (tp) { tp.x = c.x; tp.y = c.y; c.top = tp.h; out.push({ y: c.y, box: { x0: c.x - 14, y0: c.y - tp.h, x1: c.x + 14, y1: c.y + 2 }, toca: tp, draw: () => { for (const p of parts) if (p.prop && !p.front) this.drawProp(p, t); shadowAt(c.x, c.y, 15, .3); } }); out.push({ y: c.y + .5, draw: () => { if (c.owner) this.mark(c, t); } }); }
      else out.push({ y: c.y, draw: () => { for (const p of parts) if (p.prop && !p.front) this.drawProp(p, t); this.drawFigure(c, t, c); if (c.owner && !c.statue) this.mark(c, t); } });
      for (const p of parts) {
        if (p.prop) out.push({ y: p.y + (p.front ? 1 : -1), draw: () => this.drawProp(p, t) });
        else { const pt = p.who && tocaHas(p.who) && tocaPose(p.who, 'f', false, t); if (pt) { pt.x = p.x; pt.y = p.y; out.push({ y: p.y, box: { x0: p.x - 14, y0: p.y - pt.h, x1: p.x + 14, y1: p.y + 2 }, toca: pt, draw: () => shadowAt(p.x, p.y, 14, .28) }); } else out.push({ y: p.y, draw: () => this.drawFigure(p, t, c) }); }
      }
    }
    return out;
  }
  // ---- interaction
  hit(w) {
    let best = null, bd = 17;
    for (const c of this.list) { if (c.world !== this.G.world.id || this.hidden(c)) continue; for (const o of [c, ...c.parts]) { if (o.prop) continue; const d = dist(w.x, w.y, o.x, o.y - 14); if (d < bd) { bd = d; best = { c, o }; } } }
    return best;
  }
  tap(w) {
    if (!this.ready) return false; const h = this.hit(w); if (!h) return false; const G = this.G, p = G.player;
    if (!h.c.owner) { this.chat(h.c); return true; }            // statues just talk
    if (dist(p.x, p.y, h.c.spot.x, h.c.spot.y) > 70) { ui.toast('Walk closer.'); sfx.tap(); return true; }
    if (h.o !== h.c && h.o.lines) { this.chat(h.o); return true; }   // an extra figure answers with a line; the main character starts the story
    const all = [h.c.spot, ...(h.c.more || [])], next = all.find(sp => !G.collected(sp.id)) || h.c.spot;
    G.playStory(next); return true;
  }
  async chat(o) {
    const G = this.G; if (G.scene || G.busy || !(o.lines && o.lines.length)) return; const sp = (o.name || o.who || 'npc').toLowerCase().replace(/[^a-z]/g, '');
    if (o.name) SPEAKERS[sp] = o.name;
    const sc = new Scene(G, { id: 'chat-' + sp, speaker: sp, bars: false, startDelay: 50, beats: o.lines.slice(0, 2).map(l => ({ t: 'caption', speaker: sp, text: l, hold: 1700 })) }, { interactive: true }); G.scene = sc;
    try { await sc.run(); } catch (e) { console.error(e); } G.scene = null;
  }
}
