// High-resolution marker layer, drawn on the presented canvas after the pixel buffer so everything is crisp and a constant CSS size at any zoom:
//  zoomed out (cam.z < .6): story pins with portraits (clustered when they overlap), done coins, '?' signs, signposts, Glauka, the player-face ring, big-place names;
//  street level: a name over the nearest flag and over Glauka's target, small done coins over finished spots, landmark names (with subtitles) near the player.
// Data: data/landmarks.json (names, subtitles, anchors in generated-map px), data/labels.json (short story names), art/markers (pins).
import { cx as mainCx, V, IM, loadImage } from './render.js';
import { clamp, dist, FLAGS, lsGet } from './util.js';
import { aiAssets } from './scene.js';
import { drawPin, markersOn } from './markers.js';
import { drawPlayer } from './player.js';

const FONT = 'Sprout, "Trebuchet MS", ui-rounded, monospace';
export class Marks {
  constructor(G) { this.G = G; this.landmarks = []; this.labels = {}; this.pc = {}; this.hits = []; this.focusT = 0; window.__marks = this; }
  async init() {
    try { this.landmarks = await (await fetch('data/landmarks.json')).json(); } catch (e) { }
    try { this.labels = await (await fetch('data/labels.json')).json(); } catch (e) { }
    try { this.streets = await (await fetch('data/streets.json')).json(); } catch (e) { this.streets = []; }
    try { document.fonts && document.fonts.load('16px Sprout'); } catch (e) { }
  }
  name(s) { return this.labels[s.id] || s.story.title; }
  // ------------------------------------------------------------ portraits: the speaker's portrait, else the head of their cast sprite; smooth-scaled to a 48 px square
  portraitFor(sp) {
    if (!sp || sp === 'glauka') return null; if (sp in this.pc) return this.pc[sp];
    const url = [sp + '_neutral', sp].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
    const finish = (im, head) => {
      const T = 48; let c = im, w = im.width, h = im.height;
      let sx = 0, sy = 0, sw = w, sh = h; if (head) { sw = Math.round(w * .86); sh = sw; sx = Math.round((w - sw) / 2); sy = 0; } else { sw = sh = Math.min(w, h); sx = (w - sw) / 2; sy = 0; }
      const f = document.createElement('canvas'); f.width = f.height = T; const k = f.getContext('2d'); k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
      if (!head) { while (sw > T * 2) { const n = Math.round(sw / 2), d = document.createElement('canvas'); d.width = d.height = n; const dk = d.getContext('2d'); dk.imageSmoothingEnabled = true; dk.imageSmoothingQuality = 'high'; dk.drawImage(c, sx, sy, sw, sh, 0, 0, n, n); c = d; sx = sy = 0; sw = sh = n; } }
      else { k.imageSmoothingEnabled = false; }
      k.drawImage(c, sx, sy, sw, sh, 0, 0, T, T); this.pc[sp] = f;
    };
    const sprite = IM['c_' + sp + '_0'];
    if (url) { this.pc[sp] = null; loadImage('pin_' + sp, url).then(im => { if (im) finish(im, false); else if (sprite) finish(sprite, true); else this.pc[sp] = undefined; }); return null; }
    if (sprite) { finish(sprite, true); return this.pc[sp]; }
    return (this.pc[sp] = undefined);
  }
  playerFace() {   // the head of the player's own sprite (read-only use of the player sheet)
    const G = this.G, sh = G.sheet && G.sheet(); if (!sh) return null; const key = sh.width + 'x' + sh.height + ':' + (this.faceKey = (G.player.facing || 'f'));
    if (this.face && this.face.key === key && this.face.t > G.time - 1) return this.face.c;
    const c = document.createElement('canvas'); c.width = c.height = 40; const k = c.getContext('2d'); k.imageSmoothingEnabled = false;
    try { k.drawImage(sh, 2, 1, 16, 16, 0, 0, 40, 40); } catch (e) { return null; }
    this.face = { key, c, t: G.time }; return c;
  }
  // ------------------------------------------------------------ geometry
  scr(x, y) { const G = this.G, cam = G.cam, S = V.S; return [((x - cam.x) * cam.z + V.W / 2) * S, ((y - cam.y) * cam.z + V.H / 2) * S]; }
  // text sizes follow the art-pixel scale (V.S / 3 = one art px is 3 css px), so names grow with the world even when the browser is zoomed out
  u() { return Math.max(V.dpr || 1, (V.S || 3) / 3); }
  plate(txt, x, y, size, sub, subSize) {   // a big name plate: dark rounded panel, gold rim, name over a smaller subtitle; (x, y) = bottom centre
    const k = mainCx, u = this.u(); k.font = `800 ${Math.round(size * u)}px ${FONT}`; let w = k.measureText(txt).width;
    if (sub) { k.font = `700 ${Math.round(subSize * u)}px ${FONT}`; w = Math.max(w, k.measureText(sub).width); }
    const pw = w + 22 * u, ph = (size + (sub ? subSize + 4 : 0) + 14) * u, x0 = x - pw / 2, y0 = y - ph, r = 9 * u;
    k.fillStyle = 'rgba(34,20,50,.88)'; k.strokeStyle = '#f5c542'; k.lineWidth = 2.5 * u;
    k.beginPath(); k.roundRect ? k.roundRect(x0, y0, pw, ph, r) : k.rect(x0, y0, pw, ph); k.fill(); k.stroke();
    k.beginPath(); k.moveTo(x - 7 * u, y); k.lineTo(x, y + 8 * u); k.lineTo(x + 7 * u, y); k.fill();
    k.textAlign = 'center'; k.textBaseline = 'alphabetic'; k.font = `800 ${Math.round(size * u)}px ${FONT}`; k.fillStyle = '#fff4d6'; k.fillText(txt, x, y0 + (size + 6) * u);
    if (sub) { k.font = `700 ${Math.round(subSize * u)}px ${FONT}`; k.fillStyle = '#f5c542'; k.fillText(sub, x, y0 + (size + subSize + 9) * u); }
    return { x: x0, y: y0, w: pw, h: ph + 8 * u };
  }
  lines(txt, x, y, col, size, halo, align = 'center', w = 4) {
    const k = mainCx, u = this.u(); k.font = `800 ${Math.round(size * u)}px ${FONT}`; k.textAlign = align; k.textBaseline = 'alphabetic'; k.lineJoin = 'round';
    k.lineWidth = w * u; k.strokeStyle = halo; k.strokeText(txt, x, y); k.fillStyle = col; k.fillText(txt, x, y);
  }
  textRect(txt, x, y, size, above = true) { const k = mainCx, u = this.u(); k.font = `800 ${Math.round(size * u)}px ${FONT}`; const w = k.measureText(txt).width + 8 * u, h = (size + 4) * u; return { x: x - w / 2, y: above ? y - h : y, w, h }; }
  hitRect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  // ------------------------------------------------------------ frame
  draw() {
    const G = this.G, W = G.world, k = mainCx; if (!k || G.scene || W.kind !== 'live' || G.flight || G.trans) { this.hits = []; return; }
    const far = G.cam.z < .6; this.hits = [];
    k.save(); try { if (W.id === 'athens') this.drawStreetNames(k, W); } finally { k.restore(); }
    k.save(); try { far ? this.drawFar(k, W) : this.drawStreet(k, W); } finally { k.restore(); }
  }
  // ---- street names (data/streets.json from OpenStreetMap): a blue Athens street sign, Greek over Latin letters, along the longest visible stretch
  drawStreetNames(k, W) {
    const u = this.u(), cw = k.canvas.width, ch = k.canvas.height, placed = [];
    if (!this.streetW) this.streetW = (this.streets || []).map(st => ({ st, lines: st.lines.map(l => l.map(([la, lo]) => W.project(la, lo))) }));
    for (const { st, lines } of this.streetW) {
      let best = null, bl = 90 * u;
      for (const l of lines) for (let i = 1; i < l.length; i++) {
        const [x0, y0] = this.scr(l[i - 1].x, l[i - 1].y), [x1, y1] = this.scr(l[i].x, l[i].y), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0);
        if (mx < 60 * u || my < 120 * u || mx > cw - 60 * u || my > ch - 60 * u) continue;
        if (len > bl) { bl = len; best = { mx, my, a: Math.atan2(y1 - y0, x1 - x0) }; }
      }
      if (!best) continue;
      let a = best.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      k.font = `800 ${Math.round(15 * u)}px ${FONT}`; const w1 = k.measureText(st.el).width; k.font = `700 ${Math.round(13 * u)}px ${FONT}`; const w2 = k.measureText(st.en).width;
      const w = Math.max(w1, w2) + 16 * u, h = 37 * u, r = { x: best.mx - w / 2, y: best.my - h / 2, w, h };
      if (placed.some(q => this.hitRect(q, r))) continue; placed.push(r);
      k.save(); k.translate(best.mx, best.my); k.rotate(a);
      k.fillStyle = '#1f4fa0'; k.strokeStyle = '#ffffff'; k.lineWidth = 2 * u; k.beginPath(); k.roundRect ? k.roundRect(-w / 2, -h / 2, w, h, 4 * u) : k.rect(-w / 2, -h / 2, w, h); k.fill(); k.stroke();
      k.fillStyle = '#ffffff'; k.textAlign = 'center'; k.textBaseline = 'alphabetic';
      k.font = `800 ${Math.round(15 * u)}px ${FONT}`; k.fillText(st.el, 0, -1 * u); k.font = `700 ${Math.round(13 * u)}px ${FONT}`; k.fillText(st.en, 0, 13 * u);
      k.restore();
    }
  }
  // ---- street level
  drawStreet(k, W) {
    const G = this.G, u = V.dpr || 1, t = G.time, p = G.player, T = W.T, placed = [];
    const spots = G.spots.filter(s => s.world === W.id);
    // done coins over finished spots (small, bobbing, about 20 css px)
    for (const s of spots) {
      if (!G.collected(s.id)) continue; const [x, y] = this.scr(s.x, s.y - 36); if (x < -50 || y < -50 || x > mainCx.canvas.width + 50 || y > mainCx.canvas.height + 50) continue;
      const bob = Math.sin(t * 2.4 + s.i) * 3 * u; drawPin(k, 'coin', x, y + bob, 20 * u);
    }
    // names: the nearest story marker and Glauka's target
    const near = spots.filter(s => dist(p.x, p.y, s.x, s.y) < T * 9).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y)).slice(0, 1);
    const tg = G.guide && G.guide.target && G.guide.target(); const list = [];
    if (tg && tg.story) list.push([tg, 2]); for (const s of near) if (!tg || s !== tg) list.push([s, 1]);
    for (const [s, pr] of list.sort((a, b) => b[1] - a[1])) {
      const [x, y] = this.scr(s.x, s.y - 54), txt = this.name(s), r = this.textRect(txt, x, y, 24); if (placed.some(q => this.hitRect(q, r))) continue; placed.push(r);
      const al = clamp(1 - (dist(p.x, p.y, s.x, s.y) - T * 6) / (T * 3)); k.globalAlpha = pr === 2 ? 1 : al; this.lines(txt, x, y, pr === 2 ? '#ffe9a0' : '#fff4d6', 24, 'rgba(40,24,60,.92)', 'center', 6); k.globalAlpha = 1;
    }
    // landmark names with a smaller, lighter subtitle: within about 10 tiles, fading out beyond, at most 3 at once
    const lm = (W.id === 'athens' ? this.landmarks : []).map(l => ({ l, x: l.x * W.ws, y: l.y * W.ws })).map(o => Object.assign(o, { d: dist(p.x, p.y, o.x, o.y) })).filter(o => o.d < T * 12).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const o of lm) {
      const al = clamp((T * 12 - o.d) / (T * 3)), [x, y0_] = this.scr(o.x, o.y - 70), y = clamp(y0_, 190 * this.u(), mainCx.canvas.height - 120 * this.u());
      const nm = o.l.name.toUpperCase(); k.font = `800 ${Math.round(30 * this.u())}px ${FONT}`; const w = k.measureText(nm).width + 22 * this.u(), h = 66 * this.u();
      const r = { x: x - w / 2, y: y - h, w, h }; if (placed.some(q => this.hitRect(q, r))) continue; placed.push(r);
      k.globalAlpha = al; this.plate(nm, x, y, 30, o.l.subtitle || '', 18); k.globalAlpha = 1;
    }
  }
  // ---- zoomed out
  drawFar(k, W) {
    const G = this.G, u = V.dpr || 1, t = G.time, cw = k.canvas.width, ch = k.canvas.height, p = G.player;
    const items = []; const spots = G.spots.filter(s => s.world === W.id);
    for (const s of spots) {
      const [x, y] = this.scr(s.x, s.y); if (x < -60 * u || y < -60 * u || x > cw + 60 * u || y > ch + 60 * u) continue;
      const got = G.collected(s.id), unk = !G.fly.known(s); items.push({ kind: 'spot', s, x, y, got, unk, main: !!s.main });
    }
    // greedy clustering: markers closer than a pin width merge into one bubble
    const R = 17 * u, cl = []; const taken = new Set();
    const order = items.slice().sort((a, b) => (a.got - b.got) || (b.main - a.main));
    for (const a of order) { if (taken.has(a)) continue; taken.add(a); const c = { x: a.x, y: a.y, list: [a] }; for (const b of order) { if (taken.has(b)) continue; if (Math.hypot(b.x - c.x, b.y - c.y) < R * 1.5) { taken.add(b); c.list.push(b); c.x = c.list.reduce((m, q) => m + q.x, 0) / c.list.length; c.y = c.list.reduce((m, q) => m + q.y, 0) / c.list.length; } } cl.push(c); }
    const rects = [];
    // signposts: small purple pins
    for (const s of W.signposts) { const [x, y] = this.scr(s.x, s.y); if (x < -40 || y < -40 || x > cw + 40 || y > ch + 40) continue; this.drop(k, x, y, 24 * u, '#8a5fd0'); k.fillStyle = '#fff'; k.fillRect(x - 1.5 * u, y - 19 * u, 3 * u, 3 * u); k.fillRect(x - .7 * u, y - 16 * u, 1.4 * u, 7 * u); rects.push({ x: x - 10 * u, y: y - 26 * u, w: 20 * u, h: 26 * u }); }
    // done coins first (under), then undone pins on top; clusters last
    const drawn = [];
    for (const c of cl) if (c.list.length === 1 && c.list[0].got) { const a = c.list[0]; k.globalAlpha = .8; drawPin(k, 'coin', a.x, a.y - 8 * u, 18 * u); k.globalAlpha = 1; rects.push({ x: a.x - 9 * u, y: a.y - 26 * u, w: 18 * u, h: 18 * u }); this.hits.push({ x: a.x, y: a.y - 14 * u, r: 14 * u, spot: a.s }); drawn.push(a); }
    for (const c of cl) {
      if (c.list.length === 1) { const a = c.list[0]; if (a.got) continue; const h = (a.main ? 34 : 30) * u, sp = a.s.story.speaker, glk = !sp || sp === 'glauka';
        const kind = a.unk ? 'unknown' : glk ? 'glauka:' + a.s.story.flag : a.s.story.flag; if (!drawPin(k, kind, a.x, a.y, a.unk ? 24 * u : h, a.unk || glk ? null : this.portraitFor(sp), sp || 'g')) this.drop(k, a.x, a.y, h, a.unk ? '#8d8798' : FLAGS[a.s.story.flag].color);
        rects.push({ x: a.x - 13 * u, y: a.y - h, w: 26 * u, h }); this.hits.push({ x: a.x, y: a.y - h * .55, r: 15 * u, spot: a.s }); drawn.push(a); continue; }
      // cluster bubble: count in the dominant flag colour, a tiny stack of portraits above
      const cnt = {}; c.list.forEach(a => { const f = a.s.story.flag; cnt[f] = (cnt[f] || 0) + (a.got ? .3 : 1); }); const dom = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], col = (FLAGS[dom] || FLAGS.history).color, r = 14 * u, cy = c.y - r - 6 * u;
      const ports = c.list.filter(a => !a.got && !a.unk).map(a => this.portraitFor(a.s.story.speaker)).filter(Boolean).slice(0, 3);
      ports.forEach((pc, i) => { const px_ = c.x + (i - (ports.length - 1) / 2) * 11 * u, py_ = cy - r - 5 * u; k.save(); k.beginPath(); k.arc(px_, py_, 6.5 * u, 0, 7); k.clip(); k.imageSmoothingEnabled = true; k.drawImage(pc, px_ - 6.5 * u, py_ - 6.5 * u, 13 * u, 13 * u); k.restore(); k.strokeStyle = '#fff'; k.lineWidth = 1.5 * u; k.beginPath(); k.arc(px_, py_, 6.5 * u, 0, 7); k.stroke(); });
      k.fillStyle = 'rgba(30,18,44,.9)'; k.beginPath(); k.arc(c.x, cy, r + 2 * u, 0, 7); k.moveTo(c.x - 6 * u, cy + r); k.lineTo(c.x, c.y + 1 * u); k.lineTo(c.x + 6 * u, cy + r); k.fill();
      k.fillStyle = col; k.beginPath(); k.arc(c.x, cy, r, 0, 7); k.fill(); k.strokeStyle = '#fff'; k.lineWidth = 2 * u; k.stroke();
      this.lines(String(c.list.length), c.x, cy + 5.5 * u, '#2b1b3a', 16, 'rgba(255,255,255,.85)', 'center', 3);
      rects.push({ x: c.x - r, y: cy - r - 14 * u, w: 2 * r, h: 2 * r + 20 * u }); this.hits.push({ x: c.x, y: cy, r: r + 4 * u, cluster: c.list.map(a => a.s), wx: c.list.reduce((m, a) => m + a.s.x, 0) / c.list.length, wy: c.list.reduce((m, a) => m + a.s.y, 0) / c.list.length });
    }
    // target highlight
    const tg = G.guide && G.guide.target && G.guide.target(); if (tg) { const [x, y] = this.scr(tg.x, tg.y), pu = .5 + .5 * Math.sin(t * 5); k.strokeStyle = '#fff'; k.lineWidth = 2.5 * u; k.beginPath(); k.arc(x, y - 17 * u, (20 + 3 * pu) * u, 0, 7); k.stroke(); }
    if (G.guide.wp && G.guide.mode === 'waypoint') { const [x, y] = this.scr(G.guide.wp.x, G.guide.wp.y); this.drop(k, x, y, 26 * u, '#4fe08a'); }
    // Glauka and the player-face ring
    const o = G.owl, [ox, oy] = this.scr(o.x, o.y); if (!drawPin(k, 'glauka', ox, oy - 6 * u, 24 * u)) { const ow = IM.owl_0; if (ow) k.drawImage(ow, ox - 12 * u, oy - 22 * u, 24 * u, 18 * u); }
    const [qx, qy] = this.scr(p.x, p.y), pu = .5 + .5 * Math.sin(t * 4); k.strokeStyle = `rgba(255,255,255,${(.8 - .5 * pu).toFixed(2)})`; k.lineWidth = 2 * u; k.beginPath(); k.arc(qx, qy - 14 * u, (16 + 5 * pu) * u, 0, 7); k.stroke();
    const face = this.playerFace(); if (!drawPin(k, 'player', qx, qy - 14 * u + 14 * u, 28 * u, face, 'player')) { k.fillStyle = '#fff'; k.beginPath(); k.arc(qx, qy - 14 * u, 8 * u, 0, 7); k.fill(); }
    { const f = p.facing || 'f', ax = f === 'l' ? -1 : f === 'r' ? 1 : 0, ay = f === 'b' ? -1 : f === 'f' ? 1 : 0, cxp = qx + ax * 18 * u, cyp = qy - 14 * u + ay * 18 * u; k.fillStyle = '#fff'; k.strokeStyle = '#2b1b3a'; k.lineWidth = 1.5 * u; k.beginPath(); k.moveTo(cxp + ax * 6 * u, cyp + ay * 6 * u); k.lineTo(cxp - ay * 4 * u - ax * 2 * u, cyp + ax * 4 * u - ay * 2 * u); k.lineTo(cxp + ay * 4 * u - ax * 2 * u, cyp - ax * 4 * u - ay * 2 * u); k.closePath(); k.fill(); k.stroke(); }
    rects.push({ x: qx - 16 * u, y: qy - 40 * u, w: 32 * u, h: 40 * u });
    // labels last, with a soft halo: short names under main-quest pins, then the landmark names (big ones always; small ones when wide); a label that would sit on a pin slides below it
    const placed = [];
    const place = (txt, x, y, size, col, w) => {
      let r = this.textRect(txt, x, y, size, false), tries = 0;
      while (tries < 4 && (rects.some(q => this.hitRect(q, r)) || placed.some(q => this.hitRect(q, r)))) { y += (size + 4) * u * .8; r = this.textRect(txt, x, y, size, false); tries++; }
      if (tries >= 4 && (rects.some(q => this.hitRect(q, r)) || placed.some(q => this.hitRect(q, r)))) return false; placed.push(r); this.lines(txt, x, y + size * u, col, size, 'rgba(255,248,230,.95)', 'center', w); return true;
    };
    const z = G.cam.z, ws = W.ws, al = clamp((.6 - z) / .1); k.globalAlpha = al;
    for (const l of (W.id === 'athens' ? this.landmarks : [])) {  const [x, y] = this.scr(l.x * ws, l.y * ws); if (x < -100 || y < -30 || x > cw + 100 || y > ch + 30) continue; place(l.big ? l.name : (z < .3 ? l.short : l.name), x, y - 8 * u, l.big ? 28 : 21, l.big ? '#6a3e0c' : '#4a2c1c', l.big ? 7 : 6); }
    for (const c of cl) if (c.list.length === 1) { const a = c.list[0]; if (!a.main || a.got) continue; place(a.unk ? '?' : this.name(a.s), a.x, a.y + 3 * u, 20, '#3a2250', 6); }
    k.globalAlpha = 1;
  }
  drop(k, x, y, h, col) {   // plain teardrop pin, tip at (x, y)
    const r = h * .32, cy = y - h + r + 1; k.fillStyle = '#3a2c4c'; k.beginPath(); k.arc(x, cy, r + 1.5, 0, 7); k.moveTo(x - r * .8 - 1, cy + r * .6); k.lineTo(x, y + 1.5); k.lineTo(x + r * .8 + 1, cy + r * .6); k.fill();
    k.fillStyle = col; k.beginPath(); k.arc(x, cy, r, 0, 7); k.moveTo(x - r * .75, cy + r * .6); k.lineTo(x, y); k.lineTo(x + r * .75, cy + r * .6); k.fill();
  }
  // a tap (view px) on a cluster zooms in until it splits; returns true if it was consumed
  tapCluster(v) {
    const G = this.G; if (!this.hits.length || G.cam.z >= .6) return false; const S = V.S, x = v.x * S, y = v.y * S;
    for (const h of this.hits) if (h.cluster && Math.hypot(h.x - x, h.y - y) < h.r) {
      G.focus = { x: h.wx, y: h.wy, until: G.time + 5 }; const st = G.guide.stops(); let i = 0, bd = 9; st.forEach((z, k) => { const d = Math.abs(Math.log(z / G.guide.zt)); if (d < bd) { bd = d; i = k; } });
      G.guide.zt = st[Math.max(0, i - 1)]; return true;
    }
    return false;
  }
}
