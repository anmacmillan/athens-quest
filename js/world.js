// Zones. Every place is a World with one interface: live maps (chunked PNG + tile grid), the Greece journey map, and walkable stage sets.
// All worlds also carry a geographic frame (top-left corner in a shared metre plane + metres per pixel) so camera flights can glide between them.
import { g, IM, V, loadImage } from './render.js';
import { clamp } from './util.js';

const C0 = Math.cos(37.5 * Math.PI / 180);
export const geo = (lat, lon) => ({ x: lon * C0 * 111320, y: -lat * 111320 });
const waterPat = {};
export function drawWater(rect, t) {
  const f = Math.floor(t * 2.5) % 4;
  if (!waterPat[f]) waterPat[f] = g.createPattern(IM['water_' + f], 'repeat');
  g.fillStyle = waterPat[f]; g.fillRect(Math.floor(rect.x) - 1, Math.floor(rect.y) - 1, Math.ceil(rect.w) + 3, Math.ceil(rect.h) + 3);
}

export class World {
  constructor(id, o) { this.id = id; this.kind = 'plain'; this.solidCodes = ''; this.occluders = []; this.signposts = []; this.mpp = 1; this.tl = { x: 0, y: 0 }; Object.assign(this, o); }
  project() { return { x: this.w / 2, y: this.h / 2 }; }
  solid(x, y) { return x < 4 || y < 4 || x > this.w - 4 || y > this.h - 4; }
  draw() { }
  drawInset() { this.draw(0, { x: 0, y: 0, w: this.w, h: this.h }); }
  ready() { return Promise.resolve(); }
  geoOf(x, y) { return { x: this.tl.x + x * this.mpp, y: this.tl.y + y * this.mpp }; }
  nearestWalkable(x, y) { return { x, y }; }
}

// Athens, the Academy and the Lyceum: traced from OpenStreetMap, 5 m per 16-px tile
export class LiveWorld extends World {
  constructor(id, data) {
    super(id, data); this.kind = 'live'; this.solidCodes = 'CB'; this.grid = data.tiles;
    // The traced map is drawn at ws x its generated pixel size (2 = 2.5 m per 16-px tile on screen), so characters stay the same size and monuments loom over them.
    this.ws = data.ws || 2; this.dw = data.w; this.dh = data.h; this.w = data.w * this.ws; this.h = data.h * this.ws; this.T = 16 * this.ws; this.mpp = 5 / 16 / this.ws;
    this.lat0 = data.projection.lat0; this.lon0 = data.projection.lon0; this.ox = data.origin_m[0]; this.oy = data.origin_m[1];
    const o = geo(this.lat0, this.lon0); this.tl = { x: o.x + this.ox, y: o.y + this.oy };
  }
  project(lat, lon) {
    const xm = (lon - this.lon0) * Math.cos(this.lat0 * Math.PI / 180) * 111320, ym = -(lat - this.lat0) * 111320;
    return { x: (xm - this.ox) / 5 * 16 * this.ws, y: (ym - this.oy) / 5 * 16 * this.ws };
  }
  code(x, y) { const r = this.grid[Math.floor(y / this.T)]; return r ? r[Math.floor(x / this.T)] : undefined; }
  solid(x, y) { const c = this.code(x, y); if (c === undefined || this.solidCodes.includes(c)) return true; if (this.under) { const tx = Math.floor(x / this.T), ty = Math.floor(y / this.T); if (this.under[ty * this.cols + tx]) return true; } return false; }
  walkable(x, y) { return !this.solid(x, y); }
  nearestWalkable(x, y, maxR = 24) {
    if (this.walkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) for (let a = 0; a < 16 * r; a++) {
      const th = a / (16 * r) * Math.PI * 2, px = x + Math.cos(th) * r * this.T / 2, py = y + Math.sin(th) * r * this.T / 2;
      if (this.walkable(px, py)) return { x: px, y: py };
    }
    return { x, y };
  }
  async ready() {
    const [nx, ny] = this.chunks, jobs = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) jobs.push(loadImage(`w${this.id}_${i}_${j}`, this.chunk_path.replace('%d', i).replace('%d', j)));
    if (this.overview) jobs.push(loadImage('ov_' + this.id, this.overview).then(im => this.buildOverviewLevels(im)));
    if (this.overview_labels_json) jobs.push(fetch(this.overview_labels_json).then(r => r.json()).then(l => { this.labels = l; }).catch(() => { }));
    if (this.objects && typeof this.objects === 'string') jobs.push(this.loadObjects());
    await Promise.all(jobs);
  }
  // y-sorted scenery: every tall thing (building, column, tree, crane, sign, tourist) is a sprite with a base line. The ground chunks already show it;
  // anyone standing north of an object's base is covered by a redraw of it, so characters walk behind trees and columns.
  async loadObjects() {
    const d = await fetch(this.objects).then(r => r.json()); await Promise.all(d.atlases.map((u, i) => loadImage('wobj_' + this.id + '_' + i, u)));
    const CELL = 192, nx = Math.ceil(this.w / CELL) + 1; const k = this.ws; this.objs = d.objects.map(o => ({ a: o[0], sx: o[1], sy: o[2], sw: o[3], sh: o[4], w: o[3] * k, h: o[4] * k, x: o[5] * k, y: o[6] * k, base: o[7] * k }));
    this.objCell = CELL; this.objNx = nx; this.objGrid = new Map();
    this.objs.forEach((o, i) => { for (let cy = Math.floor(o.y / CELL); cy <= Math.floor((o.y + o.h) / CELL); cy++) for (let cx = Math.floor(o.x / CELL); cx <= Math.floor((o.x + o.w) / CELL); cx++) { const k = cy * nx + cx; (this.objGrid.get(k) || this.objGrid.set(k, []).get(k)).push(i); } });
    this.objects = d.objects.length;
    this.buildUnder();
  }
  // the ground hidden behind a big monument (the picture is bigger than its real footprint) is not walkable,
  // so nobody gets lost inside the Odeon; the Acropolis summit ('P') stays open, you walk behind temples there
  buildUnder() {
    const T = this.T, cols = this.cols, rows = this.rows, k = this.ws, u = new Uint8Array(cols * rows); let n = 0;
    for (const o of this.objs) {
      if (o.sw < 80 || o.sh < 90) continue;
      for (let ty = Math.floor(o.y / T); ty <= Math.floor(o.base / T); ty++) for (let tx = Math.floor(o.x / T); tx <= Math.floor((o.x + o.w) / T); tx++) {
        if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
        const cx = tx * T + T / 2, cy = ty * T + T / 2; if (!(o.x < cx - 4 && o.x + o.w > cx + 4 && o.y < cy - 6 && o.base > cy + 10)) continue;
        const c = this.code(cx, cy); if (c === 'P' || u[ty * cols + tx]) continue; u[ty * cols + tx] = 1; n++;
      }
    }
    this.under = u; this.underN = n;
  }
  // would a character standing here be hidden behind scenery (an object whose base line lies south of her)?
  hiddenBehind(x, y) {
    if (!this.objs) return false; const c = new Set(); this.objectsIn(x - 8, y - 34, x + 8, y, c);
    for (const i of c) { const o = this.objs[i]; if (o.base > y + 1 && o.x < x + 8 && o.x + o.w > x - 8 && o.y < y && o.y + o.h > y - 34) return true; }
    return false;
  }
  // nearest walkable spot that is not hidden behind scenery (used for start positions)
  clearSpot(x, y, maxR = 14) {
    const T = this.T; let best = null, bd = 1e9;
    for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = Math.round(x / T + dx) * T + T / 2, py = Math.round(y / T + dy) * T + T / 2;
      if (!this.walkable(px, py) || this.hiddenBehind(px, py)) continue;
      const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best || this.nearestWalkable(x, y);
  }
  objectsIn(x0, y0, x1, y1, out) {
    const C = this.objCell; for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) { const l = this.objGrid.get(cy * this.objNx + cx); if (l) for (const i of l) out.add(i); }
    return out;
  }
  // boxes: [{x0,y0,x1,y1,fy}] moving things; returns draw entities for scenery that stands in front of (south of) a mover it overlaps
  objectEntities(boxes) {
    if (!this.objs) return [];
    const sel = new Set(), cand = new Set();
    for (const b of boxes) { cand.clear(); this.objectsIn(b.x0, b.y0, b.x1, b.y1, cand); for (const i of cand) { const o = this.objs[i]; if (o.base > b.fy && o.x < b.x1 && o.x + o.w > b.x0 && o.y < b.y1 && o.y + o.h > b.y0) sel.add(i); } }
    if (!sel.size) return [];
    for (let pass = 0; pass < 2; pass++) {   // anything in front of a redrawn object must be redrawn too, or it would be painted over
      for (const i of [...sel]) { const a = this.objs[i]; cand.clear(); this.objectsIn(a.x, a.y, a.x + a.w, a.y + a.h, cand); for (const j of cand) { const o = this.objs[j]; if (o.base > a.base && o.x < a.x + a.w && o.x + o.w > a.x && o.y < a.y + a.h && o.y + o.h > a.y) sel.add(j); } }
    }
    const id = this.id; return [...sel].map(i => { const o = this.objs[i]; return { y: o.base, draw: () => { const im = IM['wobj_' + id + '_' + o.a]; if (im) g.drawImage(im, o.sx, o.sy, o.sw, o.sh, o.x, o.y, o.w, o.h); } }; });
  }
  // ---- level of detail. z = screen px per world px. At street scale (z >= 1) the chunks are drawn crisp; between .75 and 1 smoothed; below that the illustrated overview
  // (a smooth 0.5x downsample of the whole street map, with a halving mip chain) cross-fades in over z .5 -> .38, so the pixel map is never nearest-neighbour downscaled.
  buildOverviewLevels(im) {
    if (!im) return; const lv = [im]; let w = im.width, h = im.height;
    while (w > 200) { w = Math.round(w / 2); h = Math.round(h / 2); const c = document.createElement('canvas'); c.width = w; c.height = h; const k = c.getContext('2d'); k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high'; k.drawImage(lv[lv.length - 1], 0, 0, w, h); lv.push(c); }
    this.ovLv = lv; this.ovScale = im.width / this.dw;   // overview px per generated-map px
  }
  // The street map is exactly 1:1 on screen at z = .5 (ws 2), so it stays crisp down to there; the overview (0.5 per map px, exactly 1:1 at z = .25) takes over below.
  lodAlpha(z) { return this.ovLv ? clamp((.5 - z) / .12) : 0; }
  draw(t, rect, zIn) {
    const z = zIn || V.W / rect.w, u = this.lodAlpha(z);
    g.fillStyle = '#b8bb74'; g.fillRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
    if (u < 1) this.drawStreet(rect, z);
    if (u > 0) this.drawOverview(rect, z, u);
    if (this.fog && this.fog.W === this) this.fog.drawOn(g, 0, 0, 1, [rect.x, rect.y, rect.w, rect.h]);   // light fog of discovery (js/fog.js), in world coordinates
  }
  drawStreet(rect, z) {
    const k = this.ws, [cw, ch] = this.chunk, [nx, ny] = this.chunks;
    const i0 = clamp(Math.floor(rect.x / k / cw), 0, nx - 1), i1 = clamp(Math.floor((rect.x + rect.w) / k / cw), 0, nx - 1);
    const j0 = clamp(Math.floor(rect.y / k / ch), 0, ny - 1), j1 = clamp(Math.floor((rect.y + rect.h) / k / ch), 0, ny - 1);
    const sc = this.ws * z, sm = Math.abs(sc - Math.round(sc)) > .02; if (sm) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const im = IM[`w${this.id}_${i}_${j}`]; if (im) g.drawImage(im, i * cw * k, j * ch * k, im.width * k, im.height * k); }
    if (sm) g.imageSmoothingEnabled = false;
  }
  drawOverview(rect, z, u) {
    const lv = this.ovLv, s = this.ws * z, L = clamp(Math.floor(Math.log2(this.ovScale / s)), 0, lv.length - 1), im = lv[L];   // coarsest level that is still at least as fine as the screen
    const fx = im.width / this.w, fy = im.height / this.h, x0 = clamp(rect.x, 0, this.w), y0 = clamp(rect.y, 0, this.h), x1 = clamp(rect.x + rect.w, 0, this.w), y1 = clamp(rect.y + rect.h, 0, this.h);
    if (x1 <= x0 || y1 <= y0) return;
    g.globalAlpha = u; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(im, x0 * fx, y0 * fy, (x1 - x0) * fx, (y1 - y0) * fy, x0, y0, x1 - x0, y1 - y0);
    g.globalAlpha = 1; g.imageSmoothingEnabled = false;
  }
  drawInset(zi, rect) { this.draw(0, rect, zi); }   // flights: same LOD (zi = screen px per world px)
  drawOccluders(rect, feetY) {
    for (const o of this.occluders) {
      if (feetY >= o.feet || o.x > rect.x + rect.w || o.x + o.w < rect.x || o.y > rect.y + rect.h || o.y + o.h < rect.y) continue;
      const [cw, ch] = this.chunk;
      for (let j = Math.floor(o.y / ch); j <= Math.floor((o.y + o.h) / ch); j++) for (let i = Math.floor(o.x / cw); i <= Math.floor((o.x + o.w) / cw); i++) {
        const im = IM[`w${this.id}_${i}_${j}`]; if (!im) continue;
        const sx = Math.max(o.x, i * cw), sy = Math.max(o.y, j * ch), ex = Math.min(o.x + o.w, (i + 1) * cw), ey = Math.min(o.y + o.h, (j + 1) * ch);
        if (ex > sx && ey > sy) g.drawImage(im, sx - i * cw, sy - j * ch, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
      }
    }
  }
}

export class GreeceWorld extends World {
  constructor(data) { super('greece', data); this.kind = 'map'; this.mpp = 836; const o = geo(this.latN, this.lonW); this.tl = o; }
  project(lat, lon) { return { x: (lon - this.lonW) * this.kx, y: (this.latN - lat) * this.ky }; }
  solid(x, y) { return x < 2 || y < 2 || x > this.w - 2 || y > this.h - 2; }
  async ready() { await loadImage('greece', 'art/greece.png'); }
  draw(t, rect) { drawWater(rect, t); g.drawImage(IM.greece, 0, 0); }
  drawInset(zi, rect) { this.draw(0, rect); }
}

export class StageWorld extends World {
  constructor(id, data) {
    super(id, data); this.kind = 'stage'; this.mpp = data.mpp || .8; this.zoneGeo = data.geo || null;
    if (this.zoneGeo) { const c = geo(this.zoneGeo.lat, this.zoneGeo.lon); this.tl = { x: c.x - this.w / 2 * this.mpp, y: c.y - this.h / 2 * this.mpp }; }
  }
  project(lat, lon) { if (!this.zoneGeo) return { x: this.w / 2, y: this.h / 2 }; const c = geo(lat, lon), o = geo(this.zoneGeo.lat, this.zoneGeo.lon); return { x: this.w / 2 + (c.x - o.x) / this.mpp, y: this.h / 2 + (c.y - o.y) / this.mpp }; }
  solid(x, y) { const b = this.bounds; if (!b) return super.solid(x, y); return x < b[0] || y < b[1] || x > b[2] || y > b[3]; }
  async ready() { await loadImage('stage_' + this.id, this.img); }
  draw(t, rect) {
    if (this.water) drawWater(rect, t); else { g.fillStyle = '#b8bb74'; g.fillRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4); }
    g.drawImage(IM['stage_' + this.id], 0, 0);
  }
  drawInset(zi, rect) { if (this.water) { g.fillStyle = '#3a86c8'; g.fillRect(0, 0, this.w, this.h); } g.drawImage(IM['stage_' + this.id], 0, 0); }
}

export const Worlds = {}; export let Zones = {};
export async function loadWorlds() {
  const j = u => fetch(u).then(r => r.json());
  const [gr, st, zones] = await Promise.all([j('data/greece.json'), j('data/stages.json'), j('data/zones.json')]);
  Zones = zones;
  for (const id in zones) {
    const z = zones[id];
    if (z.kind === 'live') Worlds[id] = new LiveWorld(id, Object.assign({}, await j(z.data), { id }));
    else if (z.kind === 'map') Worlds[id] = new GreeceWorld(gr);
    else Worlds[id] = new StageWorld(id, Object.assign({}, st[id], { mpp: z.mpp, geo: z.geo, spawn: z.arrival || st[id].spawn }));
  }
  for (const k in st) if (!Worlds[k]) Worlds[k] = new StageWorld(k, st[k]);   // scene-only stage sets (sea, naxos, road, crete, ...)
  for (const id in zones) { const w = Worlds[id]; w.label = zones[id].label; w.zone = zones[id]; }
  // sign positions
  for (const id in zones) {
    const w = Worlds[id];
    w.signposts = (zones[id].signposts || []).map(s => {
      let p = s.near.lat !== undefined ? w.project(s.near.lat, s.near.lon) : { x: s.near.x * (w.ws || 1), y: s.near.y * (w.ws || 1) };
      p.x = clamp(p.x, 40, w.w - 40); p.y = clamp(p.y, 40, w.h - 40);
      if (w.kind === 'live') p = w.nearestWalkable(p.x, p.y);
      return { id: s.id, label: s.label, to: s.to, bounce: s.bounce, arrive: s.arrive, x: p.x, y: p.y, world: id };
    });
  }
  await Promise.all(Object.values(Worlds).map(w => w.ready()));
  return Worlds;
}
