// Orientation: mini-map, stepped zoom (wheel, trackpad pinch, two-finger pinch), and Glauka as a guide (Zelda Navi style): she flies ahead along a walkable
// route to the target, perches and hoots, circles back if the player wanders off, and shows a dotted trail in the air. Tap Glauka for 'Take me to...'.
import { g, IM, V, M, px, cx as mainCx, loadImage } from './render.js';
import { aiAssets } from './scene.js';
import { drawPin } from './markers.js';
import { el, $, clamp, dist, lerp, FLAGS } from './util.js';
import { sfx } from './audio.js';
import { me } from './store.js';
import * as ui from './ui.js';
import { astar } from './companions.js';

const LEAD = 170, OWL_SPEED = 300, ZSTOPS = [1.5, 1, .5, .25, .125];
export class Guide {
  constructor(G) {
    this.G = G; this.mode = 'next'; this.wp = null; this.fixed = null; this.T = null; this.path = null; this.cum = []; this.L = 0; this.owlS = 0; this.state = 'lead'; this.offT = 0; this.farT = 0; this.orbit = 0;
    this.perched = false; this.zt = 1; this.acc = 0; this.mm = { open: true, big: false }; this.mmT = 0; this.alt = 0; this.altT = 0; this.hints = null;
    window.__guide = this;
  }
  // ------------------------------------------------------------ DOM: mini-map and the owl button
  init() {
    const hud = $('hud'); if (!hud || $('mm')) return;
    const cv = el('canvas', { id: 'mmc', width: 140, height: 140 }), tg = el('button', { id: 'mmt', class: 'btn small', 'aria-label': 'Mini-map', text: '' });
    const box = el('div', { id: 'mm', class: 'panel' }, cv, tg); hud.append(box);
    this.cv = cv; this.k = cv.getContext('2d'); this.box = box;
    tg.addEventListener('click', e => { e.stopPropagation(); this.mm.open = !this.mm.open; this.syncMM(); sfx.tap(); });
    cv.addEventListener('click', e => { e.stopPropagation(); if (this.G.fly && this.G.fly.mmTap(e)) return; this.mm.big = !this.mm.big; sfx.tap(); this.drawMM(); });
    const b = el('button', { id: 'bGuide', class: 'btn small', 'aria-label': 'Glauka: take me to...' }); if (M.icon_owl) b.append(el('img', { src: M.icon_owl.f, class: 'ico', alt: '' }));
    b.addEventListener('click', e => { e.stopPropagation(); sfx.hoot(); this.openMenu(); }); const tl = $('topleft'); tl && tl.append(b);
    this.syncMM();
  }
  syncMM() { this.box.classList.toggle('shut', !this.mm.open); $('mmt').textContent = this.mm.open ? 'Hide' : 'Map'; }
  // ------------------------------------------------------------ zoom
  stops() { const W = this.G.world; if (W.kind !== 'live') return [1]; const fit = Math.min(V.W / W.w, V.H / W.h) * .98; return ZSTOPS.filter(z => z > fit * 1.2).concat(fit); }
  canZoom() { const G = this.G; return G.mode === 'play' && !G.busy && !G.scene && !G.flight && !G.trans && G.world.kind === 'live'; }
  zoomStep(dir) {   // +1 in, -1 out
    if (!this.canZoom()) return; const st = this.stops(); let i = 0, bd = 9; st.forEach((z, k) => { const d = Math.abs(Math.log(z / this.zt)); if (d < bd) { bd = d; i = k; } });
    const j = clamp(i + (dir > 0 ? -1 : 1), 0, st.length - 1); if (j !== i) { this.zt = st[j]; sfx.tap(); }
  }
  onWheel(dy, ctrl) { this.acc += dy * (ctrl ? .06 : .012); while (Math.abs(this.acc) >= 1) { this.zoomStep(this.acc > 0 ? -1 : 1); this.acc -= Math.sign(this.acc); } }
  // ------------------------------------------------------------ targets
  pickNearest(meet) {
    const G = this.G, W = G.world, p = G.player; let best = null, bd = 1e9;
    for (const s of G.spots) { if (s.world !== W.id || G.collected(s.id)) continue; if (meet && (!s.story.speaker || s.story.speaker === 'glauka')) continue; const d = dist(p.x, p.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  target() {
    const G = this.G; if (G.world.kind !== 'live' || this.mode === 'follow') return null;
    if (this.mode === 'waypoint' && this.wp && this.wp.world === G.world.id) return this.wp;
    if (this.mode === 'nearest' || this.mode === 'meet') {
      if (!this.fixed || G.collected(this.fixed.id) || this.fixed.world !== G.world.id) this.fixed = this.pickNearest(this.mode === 'meet');
      if (this.fixed) return this.fixed; this.mode = 'next';
    }
    return G.compassBase();
  }
  setMode(m, wp) { this.mode = m; this.fixed = null; this.wp = wp || null; this.path = null; this.state = 'lead'; this.perched = false; }
  // ------------------------------------------------------------ route
  build(T) {
    const G = this.G, W = G.world, p = G.player, dest = W.nearestWalkable(T.x, T.y, 24);
    let path = null; try { path = astar(W, { x: p.x, y: p.y }, dest); } catch (e) { }
    if (!path || path.length < 2) path = [{ x: p.x, y: p.y }, dest];
    this.path = path; this.cum = [0]; for (let i = 1; i < path.length; i++) this.cum.push(this.cum[i - 1] + dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y)); this.L = this.cum[this.cum.length - 1]; this.dest = dest;
    this.owlS = this.progress(p.x, p.y).s; this.perched = false; this.arrived = false; this.state = 'lead'; this.offT = 0;
  }
  ptAt(s) { const P = this.path, c = this.cum; s = clamp(s, 0, this.L); let i = 1; while (i < c.length - 1 && c[i] < s) i++; const a = P[i - 1], b = P[i], l = c[i] - c[i - 1] || 1, u = (s - c[i - 1]) / l; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; }
  progress(x, y) { const P = this.path; let best = { s: 0, d: 1e9 }; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1, u = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2), qx = a.x + vx * u, qy = a.y + vy * u, d = Math.hypot(x - qx, y - qy); if (d < best.d) best = { s: this.cum[i - 1] + Math.sqrt(l2) * u, d }; } return best; }
  // ------------------------------------------------------------ per frame
  update(dt) {
    const G = this.G;
    if (this.canZoom() || (!G.busy && !G.scene && !G.flight && G.world.kind === 'live')) {   // ease the camera scale towards the chosen stop (log space), snapping when close
      if (G.world.kind === 'live' && this.canZoom()) { const z = G.cam.z, r = Math.log(this.zt / z); G.cam.z = Math.abs(r) < .004 ? this.zt : z * Math.exp(r * (1 - Math.exp(-dt * 9))); }
    } else if (G.world.kind !== 'live') this.zt = 1;
    if (G.world.kind !== 'live') this.zt = 1;
    this.mmT -= dt; if (this.mmT <= 0) { this.mmT = .12; this.drawMM(); }
  }
  // drives G.owl while guiding; returns true if it did
  driveOwl(dt) {
    const G = this.G, o = G.owl, p = G.player, W = G.world, T = this.target();
    if (!T || W.kind !== 'live') { this.T = null; this.path = null; o.perched = false; this.alt += (0 - this.alt) * Math.min(1, dt * 4); o.alt = this.alt; return false; }
    if (T !== this.T || !this.path) { this.T = T; this.build(T); this.farT = 0; }
    const t = G.time, pr = this.progress(p.x, p.y);
    if (this.mode === 'waypoint' && dist(p.x, p.y, T.x, T.y) < 50) { this.setMode('next'); sfx.chime && sfx.chime(); ui.toast('Hoo! We got there.', 1800); return false; }
    this.offT = pr.d > 150 ? this.offT + dt : 0; if (this.offT > 3 && this.state === 'lead') { this.state = 'back'; this.orbit = 0; this.perched = false; }
    this.farT = dist(o.x, o.y, p.x, p.y) > 460 ? this.farT + dt : 0; if (this.farT > 6 && this.state === 'lead') { this.state = 'back'; this.orbit = 0; this.perched = false; }
    let tx, ty, talt = 18 + Math.sin(t * 3) * 3, flap = true, k = 8;
    if (this.state === 'back') {   // the player wandered off: fly to her, circle once, then lead again from here
      if (dist(o.x, o.y, p.x, p.y) > 60 && this.orbit === 0) { const d = dist(o.x, o.y, p.x, p.y), v = Math.min(1, 330 * dt / d); o.x += (p.x - o.x) * v; o.y += (p.y - o.y) * v; this.alt += (22 - this.alt) * Math.min(1, dt * 4); o.alt = this.alt; o.flap = Math.floor(t * 9) % 2 === 1; o.perched = false; return true; }
      this.orbit += dt; const a = this.orbit * 3.2; o.x = p.x + Math.cos(a) * 30; o.y = p.y + Math.sin(a) * 14; this.alt += (24 - this.alt) * Math.min(1, dt * 4); o.alt = this.alt; o.flap = Math.floor(t * 9) % 2 === 1;
      if (this.orbit > 2.2) { sfx.hoot(); this.build(T); } return true;
    }
    const nearEnd = pr.s > this.L - 70 || dist(p.x, p.y, this.dest.x, this.dest.y) < 80;
    const want = nearEnd ? this.L : Math.min(this.L, pr.s + LEAD);
    this.owlS += clamp(want - this.owlS, -OWL_SPEED * dt, OWL_SPEED * dt);
    const q = this.ptAt(this.owlS); tx = q.x; ty = q.y;
    const atEnd = this.owlS >= this.L - 1 && dist(o.x, o.y, tx, ty) < 8;
    if (atEnd) {
      if (!this.perched) { this.perched = true; if (!this.arrived) { this.arrived = true; sfx.hoot(); ui.toast('Hoo! ' + (T.story ? T.story.title : T.label || 'Here we are') + ' is right here.', 2600); } }
      talt = T.story ? 27 : T.label ? 24 : 0; flap = false; k = 10;
    } else this.perched = false;
    o.x += (tx - o.x) * Math.min(1, dt * k); o.y += (ty - o.y) * Math.min(1, dt * k);
    this.alt += (talt - this.alt) * Math.min(1, dt * 5); o.alt = this.alt; o.perched = this.perched; o.flap = flap && Math.floor(t * 8) % 2 === 1;
    return true;
  }
  drawTrail() {   // faint dotted trail in the air from the player to a little past Glauka
    const G = this.G, T = this.path && this.T; if (!T || G.world.kind !== 'live' || G.scene || this.state === 'back' || this.mode === 'follow') return;
    const pr = this.progress(G.player.x, G.player.y), a = pr.s + 22, b = Math.min(this.L, this.owlS + 40), t = G.time; if (b <= a) return;
    for (let s = a, i = 0; s < b; s += 13, i++) { const q = this.ptAt(s + ((t * 18) % 13)), al = (.62 - .4 * (s - a) / Math.max(1, b - a)); if (s + ((t * 18) % 13) > b) break; const yy = q.y - 24 + Math.sin(t * 4 + i * .8) * 1.5, aa = Math.max(.25, al + .15); px(q.x - 1, yy - 1, 4, 4, '#3a2c4c', aa * .45); px(q.x, yy, 2, 2, '#fffbe0', Math.min(1, aa + .2)); }
  }
  // Zoomed out (z < .6) the street entities are not drawn (the illustrated overview shows); instead pins at constant screen size, drawn in screen space after the world.
  far() { const G = this.G; return G.world.kind === 'live' && G.cam.z < .6 && !G.scene; }
  portraitOf(s) { return this.G.marks.portraitFor(s.story.speaker); }   // shared with js/marks.js (portrait, else the cast sprite's head, smooth-scaled)
  drawMarkers() {   // screen space (identity transform): called after endWorld
    const G = this.G, W = G.world, cam = G.cam; if (!this.far()) return; const t = G.time;
    const sx = x => (x - cam.x) * cam.z + V.W / 2, sy = y => (y - cam.y) * cam.z + V.H / 2, OL = '#3a2c4c';
    const ring = (x, y, r, col, w = 1.5) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
    const pin = (x, y, col, o = {}) => {   // teardrop with its tip at (x, y)
      if (o.mk && drawPin(g, o.mk, x, y, o.main ? 30 : 26, o.portrait, o.pkey)) return;   // art/markers pin with the portrait composited into its window
      const R = o.main ? 6 : 5, cy = y - R - 4;
      if (o.coin) { g.fillStyle = OL; g.beginPath(); g.arc(x, cy, R + 1.2, 0, 7); g.fill(); g.fillStyle = '#f5c542'; g.beginPath(); g.arc(x, cy, R, 0, 7); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(x - 1.6, cy - 1.6, R * .4, 0, 7); g.fill(); g.fillStyle = '#9a6a14'; g.fillRect(Math.round(x) - 1, Math.round(cy) - 3, 2, 6); return; }
      g.fillStyle = OL; g.beginPath(); g.arc(x, cy, R + 1.2, 0, 7); g.moveTo(x - R * .75 - 1, cy + R * .62); g.lineTo(x, y + 1.2); g.lineTo(x + R * .75 + 1, cy + R * .62); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(x, cy, R, 0, 7); g.moveTo(x - R * .75, cy + R * .6); g.lineTo(x, y); g.lineTo(x + R * .75, cy + R * .6); g.fill();
      if (o.portrait) { g.save(); g.beginPath(); g.arc(x, cy, R - 1.6, 0, 7); g.clip(); g.imageSmoothingEnabled = true; g.drawImage(o.portrait, x - R + 1.6, cy - R + 1.6, 2 * R - 3.2, 2 * R - 3.2); g.restore(); g.imageSmoothingEnabled = false; ring(x, cy, R - 1.6, OL, 1); }
      else if (o.unk) { g.fillStyle = '#2a1f3a'; [[1, 0], [2, 0], [0, 1], [3, 1], [2, 2], [1, 3], [1, 5]].forEach(([qx, qy]) => g.fillRect(Math.round(x) - 2 + qx, Math.round(cy) - 3 + qy, 1, 1)); }
      else { g.fillStyle = '#fff8e8'; g.beginPath(); g.arc(x, cy, o.main ? 2.8 : 2.2, 0, 7); g.fill(); }
    };
    const T = this.T || G.compassTarget();
    for (const s of W.signposts) { const x = sx(s.x), y = sy(s.y); if (x < -12 || y < -20 || x > V.W + 12 || y > V.H + 12) continue; pin(x, y, '#8a5fd0', { main: false }); g.fillStyle = '#fff'; g.fillRect(Math.round(x) - 1, Math.round(y) - 12, 3, 2); g.fillRect(Math.round(x), Math.round(y) - 14, 1, 6); }
    const spots = G.spots.filter(s => s.world === W.id).sort((a, b) => a.y - b.y);
    for (const s of spots) {
      const x = sx(s.x), y = sy(s.y); if (x < -12 || y < -24 || x > V.W + 12 || y > V.H + 12) continue;
      const got = G.collected(s.id), unk = !G.fly.known(s);
      pin(x, y, unk ? '#8d8798' : FLAGS[s.story.flag].color, { main: s.main, coin: got, unk, portrait: !got && !unk ? this.portraitOf(s) : null, mk: got ? 'coin' : unk ? 'unknown' : (!s.story.speaker || s.story.speaker === 'glauka') ? 'glauka:' + s.story.flag : s.story.flag, pkey: s.story.speaker });
    }
    if (T) { const p = .5 + .5 * Math.sin(t * 5); ring(sx(T.x), sy(T.y) - 10, 12 + 3 * p, '#fff', 2); }
    if (this.wp && this.mode === 'waypoint') { const x = sx(this.wp.x), y = sy(this.wp.y); pin(x, y, '#4fe08a', {}); }
    // Glauka (owl icon) and the player (bright dot with a pulsing ring)
    const o = G.owl, ox = sx(o.x), oy = sy(o.y), ow = IM.owl_0; if (drawPin(g, 'glauka', ox, oy - 2, 18)) { } else if (ow) g.drawImage(ow, Math.round(ox - ow.width / 2), Math.round(oy - ow.height - 2));
    const p = G.player, px_ = sx(p.x), py_ = sy(p.y), pu = .5 + .5 * Math.sin(t * 4);
    ring(px_, py_, 6 + 4 * pu, `rgba(255,255,255,${(.9 - .6 * pu).toFixed(2)})`, 2); if (drawPin(g, 'player', px_, py_ + 8, 22)) return; g.fillStyle = '#fff'; g.beginPath(); g.arc(px_, py_, 4.2, 0, 7); g.fill(); g.fillStyle = '#e5484d'; g.beginPath(); g.arc(px_, py_, 3, 0, 7); g.fill();
  }
  drawLabels() {   // names of the big places, crisp text on the presented canvas (after present()), constant size
    const G = this.G, W = G.world, cam = G.cam; if (!this.far() || !W.labels || !mainCx) return;
    const S = V.S, dpr = V.dpr || 1, k = mainCx; k.save(); k.textAlign = 'center'; k.textBaseline = 'middle'; k.lineJoin = 'round';
    const a = clamp((.6 - cam.z) / .1);
    for (const l of W.labels) {
      const x = ((l.x * W.ws - cam.x) * cam.z + V.W / 2) * S, y = ((l.y * W.ws - cam.y) * cam.z + V.H / 2) * S; if (x < -200 || y < -40 || x > V.W * S + 200 || y > V.H * S + 40) continue;
      if (!l.big && cam.z > .3) continue;   // small names only once the view is wide enough not to crowd
      k.font = `800 ${Math.round((l.big ? 4.6 : 3.8) * S)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`; k.globalAlpha = a; k.lineWidth = Math.round(S * 1.4); k.strokeStyle = 'rgba(255,246,220,.92)'; k.strokeText(l.name, x, y); k.fillStyle = l.big ? '#7a4a12' : '#4a2c1c'; k.fillText(l.name, x, y);
    }
    k.restore();
  }
  // ------------------------------------------------------------ mini-map
  drawMM() {
    const G = this.G, W = G.world, k = this.k; if (!k) return; const show = W.kind === 'live' && this.mm.open;
    this.box.style.display = W.kind === 'live' ? '' : 'none'; if (!show) return;
    const cv = this.cv, S = cv.width, ov = IM['ov_' + W.id]; k.fillStyle = '#2a1f3a'; k.fillRect(0, 0, S, S);
    let sc, ox, oy; const p = G.player;
    if (this.mm.big) { sc = Math.min(S / W.w, S / W.h); ox = (S - W.w * sc) / 2; oy = (S - W.h * sc) / 2; } else { sc = S / 1100; ox = S / 2 - p.x * sc; oy = S / 2 - p.y * sc; }
    this.mmView = { sc, ox, oy }; k.imageSmoothingEnabled = true; if (ov) k.drawImage(ov, ox, oy, W.w * sc, W.h * sc); if (G.fog && G.fog.W === W) G.fog.drawOn(k, ox, oy, sc);
    if (this.mm.big && W.labels) { k.save(); k.font = '700 8px ui-rounded, system-ui, sans-serif'; k.textAlign = 'center'; k.lineWidth = 3; k.strokeStyle = 'rgba(255,246,220,.9)'; k.fillStyle = '#4a2c1c'; for (const l of W.labels) if (l.big) { const x = ox + l.x * W.ws * sc, y = oy + l.y * W.ws * sc; k.strokeText(l.name, x, y); k.fillText(l.name, x, y); } k.restore(); }
    k.strokeStyle = '#ffffff'; k.lineWidth = 1.5; k.setLineDash([4, 3]); k.strokeRect(ox, oy, W.w * sc, W.h * sc); k.setLineDash([]);   // zone edge
    const m = (x, y) => [ox + x * sc, oy + y * sc], ring = (x, y, r, col) => { k.strokeStyle = col; k.lineWidth = 2; k.beginPath(); k.arc(x, y, r, 0, 7); k.stroke(); };
    const T = this.T || G.compassTarget(), t = G.time;
    for (const s of W.signposts) { const [x, y] = m(s.x, s.y); k.fillStyle = '#8a5fd0'; k.strokeStyle = '#fff'; k.lineWidth = 1; k.beginPath(); k.moveTo(x, y - 5); k.lineTo(x + 4, y + 3); k.lineTo(x - 4, y + 3); k.closePath(); k.fill(); k.stroke(); }
    for (const s of G.spots) if (s.world === W.id) {
      const [x, y] = m(s.x, s.y), got = G.collected(s.id), r = s.main ? 3.6 : 2.8;
      if (x < -4 || y < -4 || x > S + 4 || y > S + 4) continue;
      const unk = !G.fly.known(s), col = unk ? '#8d8798' : got ? '#f5c542' : FLAGS[s.story.flag].color, R = (s.main ? 3.6 : 3) , cy = y - R - 1.5;   // small teardrop pin, tip on the spot
      if (drawPin(k, got ? 'coin' : unk ? 'unknown' : (!s.story.speaker || s.story.speaker === 'glauka') ? 'glauka:' + s.story.flag : s.story.flag, x, y, s.main ? 16 : 13, !got && !unk ? this.portraitOf(s) : null, s.story.speaker)) continue;
      k.fillStyle = col; k.strokeStyle = got ? '#9a6a14' : '#3a2c4c'; k.lineWidth = 1.2; k.beginPath();
      if (got) k.arc(x, cy, R, 0, 7); else { k.arc(x, cy, R, Math.PI * .8, Math.PI * .2 + Math.PI * 2); k.lineTo(x, y); k.closePath(); }
      k.fill(); k.stroke(); if (unk) { k.fillStyle = '#2a1f3a'; k.font = 'bold 6px sans-serif'; k.textAlign = 'center'; k.fillText('?', x, cy + 2.2); } else { k.fillStyle = got ? '#9a6a14' : '#fff8e8'; if (got) k.fillRect(x - .6, cy - 1.6, 1.2, 3.2); else { k.beginPath(); k.arc(x, cy, 1.2, 0, 7); k.fill(); } }
    }
    if (T) { let [x, y] = m(T.x, T.y); const edge = x < 6 || y < 6 || x > S - 6 || y > S - 6; x = clamp(x, 7, S - 7); y = clamp(y, 7, S - 7); ring(x, y, 6 + 2 * Math.sin(t * 5), edge ? '#ffd45a' : '#ffffff'); }
    if (this.wp && this.mode === 'waypoint') { const [x, y] = m(this.wp.x, this.wp.y); ring(x, y, 5, '#4fe08a'); }
    let [gx, gy] = m(G.owl.x, G.owl.y); k.fillStyle = '#f0993c'; k.strokeStyle = '#fff'; k.lineWidth = 1.2; k.beginPath(); k.arc(gx, gy, 3, 0, 7); k.fill(); k.stroke();
    const [px_, py_] = m(p.x, p.y); k.fillStyle = '#e5484d'; k.strokeStyle = '#fff'; k.lineWidth = 2; k.beginPath(); k.arc(px_, py_, 4, 0, 7); k.stroke(); k.fill();
  }
  // ------------------------------------------------------------ taps and the menu
  tap(v, w) {
    const G = this.G, o = G.owl; if (G.world.kind !== 'live') return false;
    if (G.cam.z < .6) return false;   // zoomed out: FlyTo shows cards on a tap and a long-press sets the waypoint
    if (dist(w.x, w.y, o.x, o.y - 14 - (o.alt || 0)) < 22) { sfx.hoot(); this.openMenu(); return true; }
    return false;
  }
  async loadHints() { if (this.hints) return this.hints; try { this.hints = await (await fetch('data/guide.json')).json(); } catch (e) { this.hints = {}; } return this.hints; }
  async secretHint() {
    const G = this.G, p = me() || {}, H = await this.loadHints(), ex = G.extras, out = [];
    const st = p.stickers || {}, bd = p.badges || {};
    if (!st.tortoise_friend) out.push(H.tortoise); if (!bd['trail:Ghost of the Areopagus']) out.push(H.areopagus); if (!(ex && ex.catRevealed && ex.catRevealed())) out.push(H.cat);
    const fe = ex && ex.feathers ? ex.feathers.filter(f => !(p.feathers || {})[f.id] && !f.hidden) : [];
    if (fe.length) { const f = fe[Math.floor(Math.random() * fe.length)], near = G.spots.filter(s => s.world === 'athens').sort((a, b) => dist(a.x, a.y, f.x, f.y) - dist(b.x, b.y, f.x, f.y))[0]; out.push((H.feather || 'Hoo! Something shiny is tucked away near {area}.').replace('{area}', near ? near.story.area.toLowerCase() : 'here')); }
    const l = out.filter(Boolean); return l.length ? l[Math.floor(Math.random() * l.length)] : 'Hoo! You have found everything I know about. Well done!';
  }
  openMenu() {
    const G = this.G; if (G.busy || G.scene || G.mode !== 'play') return;
    const go = (m, msg) => () => { ui.closeOverlay(); this.setMode(m); ui.toast(msg, 2200); };
    const b = (label, sub, fn) => el('button', { class: 'btn guideopt', onclick: () => { sfx.tap(); fn(); } }, el('b', { text: label }), el('small', { text: sub }));
    const body = el('div', { class: 'guidemenu' },
      b('Next main story', 'Follow me to the next big story', go('next', 'Hoo! Follow me.')),
      b('Nearest story', 'The closest flag I know', go('nearest', 'Hoo! The closest one.')),
      b('Someone to meet', 'The nearest story with a character waiting', go('meet', 'Hoo! Someone is waiting.')),
      b('A secret', 'Just a hint, I will not say where', async () => { ui.closeOverlay(); ui.toast(await this.secretHint(), 7000); }),
      b('Just exploring', 'I will stay close and keep quiet', go('follow', 'Hoo. Lead on!')));
    ui.openOverlay('Glauka: take me to...', body);
  }
}
