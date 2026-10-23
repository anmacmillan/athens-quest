// Light fog of discovery: undiscovered parts of the Athens map are drawn desaturated to a parchment tone (about 60 percent), not black.
// A coarse bitmask (1 bit per 8x8 tiles) is revealed in a radius as the player walks; major landmarks are always revealed.
// Saved per player locally (localStorage) and in the player record as p.fog, a base64 string (about 180 chars for Athens, limit 4096) merged by union.
import { cx, g, V } from './render.js';
import { lsGet, lsSet, dist } from './util.js';
import { store, me, touch } from './store.js';

const CELL_TILES = 8, REVEAL = 2.6;   // cells; reveal radius around the player in cells
export function b64ToBits(s, n) { const a = new Uint8Array(n); try { const bin = atob(s || ''); for (let i = 0; i < n; i++) a[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1; } catch (e) { } return a; }
export function bitsToB64(a) { const by = new Uint8Array(Math.ceil(a.length / 8)); for (let i = 0; i < a.length; i++) if (a[i]) by[i >> 3] |= 1 << (i & 7); let s = ''; by.forEach(b => s += String.fromCharCode(b)); return btoa(s); }
export function mergeFog(a, b) {   // union of two base64 masks (the store uses it)
  if (!a) return b || ''; if (!b) return a; try { const x = atob(a), y = atob(b), n = Math.max(x.length, y.length); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode((x.charCodeAt(i) || 0) | (y.charCodeAt(i) || 0)); return btoa(s); } catch (e) { return a; }
}

export class Fog {
  constructor(G) { this.G = G; this.W = null; this.bits = null; this.pid = null; this.cv = null; this.t = 0; this.dirty = false; this.save = 0; this.landmarks = []; this.on = true; }
  async init(W) {
    this.W = W; this.cols = Math.ceil(W.dw / (16 * CELL_TILES)); this.rows = Math.ceil(W.dh / (16 * CELL_TILES)); this.cell = 16 * CELL_TILES * W.ws;   // world px per cell
    try { this.landmarks = await (await fetch('data/landmarks.json')).json(); } catch (e) { this.landmarks = []; }
    this.cv = document.createElement('canvas'); this.cv.width = this.cols; this.cv.height = this.rows; this.k = this.cv.getContext('2d');
  }
  key() { return 'owlq.fog.' + (store.me || ''); }
  load() {
    if (this.pid === store.me && this.bits) return; this.pid = store.me; const n = this.cols * this.rows, p = me();
    const loc = lsGet(this.key(), ''), rem = p && typeof p.fog === 'string' ? p.fog : '';
    this.bits = b64ToBits(mergeFog(loc, rem), n); this.alwaysRevealed(); this.paint();
  }
  alwaysRevealed() {   // landmarks flagged with a reveal radius (design px) are never in fog
    for (const l of this.landmarks) if (l.reveal) { const cx_ = l.x / (16 * CELL_TILES), cy_ = l.y / (16 * CELL_TILES), r = l.reveal / (16 * CELL_TILES); this.mark(cx_, cy_, r, true); }
  }
  mark(cxf, cyf, r, quiet) {
    let ch = false; for (let y = Math.max(0, Math.floor(cyf - r)); y <= Math.min(this.rows - 1, Math.ceil(cyf + r)); y++) for (let x = Math.max(0, Math.floor(cxf - r)); x <= Math.min(this.cols - 1, Math.ceil(cxf + r)); x++) {
      if (Math.hypot(x + .5 - cxf, y + .5 - cyf) <= r && !this.bits[y * this.cols + x]) { this.bits[y * this.cols + x] = 1; ch = true; }
    }
    if (ch && !quiet) this.dirty = true; return ch;
  }
  revealedAt(x, y) { if (!this.bits) return true; const cx_ = Math.floor(x / this.cell), cy_ = Math.floor(y / this.cell); return cx_ < 0 || cy_ < 0 || cx_ >= this.cols || cy_ >= this.rows || !!this.bits[cy_ * this.cols + cx_]; }
  paint() {   // one pixel per cell: alpha = fog strength; the scaled draw is bilinear, which gives the soft edges
    const id = this.k.createImageData(this.cols, this.rows), d = id.data;
    for (let i = 0; i < this.bits.length; i++) { d[i * 4] = 214; d[i * 4 + 1] = 190; d[i * 4 + 2] = 140; d[i * 4 + 3] = this.bits[i] ? 0 : 255; }
    this.k.putImageData(id, 0, 0);
  }
  update(dt) {
    const G = this.G, W = G.world; if (W !== this.W || !this.cv) return; this.load(); this.t -= dt; if (this.t > 0) return; this.t = .5;
    const p = G.player; this.mark(p.x / this.cell, p.y / this.cell, REVEAL);
    if (this.dirty) { this.dirty = false; this.paint(); this.saveT = 4; }
    if (this.saveT > 0) { this.saveT -= .5; if (this.saveT <= 0) { const s = bitsToB64(this.bits); lsSet(this.key(), s); const pl = me(); if (pl && pl.fog !== s) { pl.fog = s; touch(store.me); } } }
  }
  // overlay on any 2D context: ox, oy = where world (0,0) lands, sc = ctx px per world px. 'color' keeps the luminance of what is below and takes the parchment hue and a low saturation
  drawOn(ctx, ox, oy, sc, clip) {
    if (!this.on || !this.cv || !this.bits) return; this.load();
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = .62;
    if (clip) { ctx.beginPath(); ctx.rect(clip[0], clip[1], clip[2], clip[3]); ctx.clip(); }
    // draw so that cell centres line up: the 1-px-per-cell canvas covers cols*cell world px
    ctx.drawImage(this.cv, ox, oy, this.cols * this.cell * sc, this.rows * this.cell * sc);
    ctx.restore();
  }
}
