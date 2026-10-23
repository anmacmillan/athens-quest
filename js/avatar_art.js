// Dresses a base character sheet for a look: recolours the reserved colour ramps (hair, chiton, sash, sandals, skin), paints the chiton
// pattern, then lays the hand-drawn overlays (tools/gen_overlays.py) at the per-frame anchor points stored in the base's json.
//   dressSheet(base, overlays, look) -> canvas (cw*5 x ch*4): rows front, back, left, right; columns idle, walk A, walk B, glide, push.
import { SKIN_TONES, HAIR_COLOURS, DRESS_COLOURS, BOW_COLOURS, BELT_COLOURS, EYE_COLOURS, SANDAL_COLOURS, makeCanvas } from './avatar_core.js';

const SHADE = [40, 24, 64], LIGHT = [255, 248, 236], OUTL = [88, 62, 84];
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const lum = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const ramp4 = c => [mix(c, SHADE, .5), mix(c, SHADE, .16), c, mix(c, LIGHT, .45)];
const ramp3 = c => [mix(c, SHADE, .42), c, mix(c, LIGHT, .38)];
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const key = (r, g, b) => (r << 16) | (g << 8) | b;

// overlay palette
const PAL = {
  o: OUTL, g: [245, 197, 66], G: [194, 138, 26], h: [255, 240, 160], l: [107, 191, 74], L: [63, 138, 58], r: [216, 69, 60], R: [158, 40, 48],
  w: [253, 252, 246], W: [205, 206, 220], p: [245, 139, 184], P: [214, 90, 144], y: [255, 227, 106], u: [61, 127, 214], U: [42, 86, 160], c: [92, 200, 230],
  b: [201, 138, 58], B: [138, 90, 34], k: [122, 82, 48], K: [78, 50, 30], n: [242, 230, 200], N: [214, 196, 154], s: [200, 204, 216], S: [138, 144, 168],
  e: [47, 184, 176], E: [30, 130, 130], a: [232, 168, 40], m: [107, 68, 41], M: [60, 36, 24],
};
const HEAD = new Set(['crown', 'helmet', 'horns', 'petasos', 'laurel', 'flowers']);
const HAT_ITEM = { crown: 'crown', helmet: 'helmet', horns: 'horns', petasos: 'petasos', laurel: 'laurel', flowers: 'flowers' };
const BACK_ITEM = { owlpack: 'owlpack', shield: 'shield', wings_sphinx: 'wings_sphinx', wings_small: 'wings_small', cape_red: 'cape', cape_blue: 'cape', feather_cape: 'feather_cape' };
const CAPE_COL = { cape_red: ['#d8453c', '#9e2830'], cape_blue: ['#3d7fd6', '#2a56a0'] };
// bow positions relative to the crown anchor (cx, ctop) per hair style, front / back / side (facing left; mirrored for right)
export const BOW_AT = {
  red: { f: [[5, 2]], b: [[-4, 3]], s: [[3, 2]] }, ponytail: { f: [[5, 2]], b: [[-4, 3]], s: [[3, 2]] },
  lilac: { f: [[-9, 3], [9, 3]], b: [[-9, 3], [9, 3]], s: [[4, 4]] }, pigtails: { f: [[-9, 3], [9, 3]], b: [[-9, 3], [9, 3]], s: [[4, 4]] },
  buns: { f: [[-7, 0], [7, 0]], b: [[-7, 0], [7, 0]], s: [[4, 1]] },
  wavy: { f: [[-6, 0]], b: [[-6, 0]], s: [[-2, 0]] }, braid: { f: [[5, 1]], b: [[5, 1]], s: [[-3, 1]] }, curly: { f: [[-6, 0]], b: [[-6, 0]], s: [[-2, 0]] },
};

// chiton pattern, painted onto the chiton pixels of one cell (px = ImageData data, regions marked in isChi)
function pattern(d, W, H, x0, y0, isChi, look, chi) {
  const dark = lum(chi) > .5, ink = look.pattern === 'olive' ? (dark ? [86, 124, 58] : [150, 196, 96]) : dark ? [61, 111, 214] : [245, 211, 106];
  const set = (x, y, c) => { const i = ((y0 + y) * W + x0 + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  const chiAt = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 52 && isChi[y * 32 + x];
  const hemY = x => { let b = -1; for (let y = 0; y < 52; y++) if (chiAt(x, y)) b = y; return b; };
  for (let x = 0; x < 32; x++) {
    const hy = hemY(x); if (hy < 0) continue;
    if (look.pattern === 'meander') { set(x, hy, ink); if (chiAt(x, hy - 1) && (x % 4 === 0 || x % 4 === 1)) set(x, hy - 1, ink); if (chiAt(x, hy - 2) && x % 4 === 0) set(x, hy - 2, ink); }
    else if (look.pattern === 'olive') { set(x, hy, ink); if (x % 5 === 0 && chiAt(x, hy - 2)) { set(x, hy - 2, ink); if (chiAt(x + 1, hy - 3)) set(x + 1, hy - 3, ink); } }
  }
  if (look.pattern === 'stars' || look.pattern === 'dots') {
    const star = look.pattern === 'stars', step = star ? 6 : 4, light = dark ? [61, 111, 214] : [255, 250, 230];
    for (let y = 0; y < 52; y++) for (let x = 0; x < 32; x++) {
      if (!chiAt(x, y)) continue;
      const rowI = Math.floor(y / step), ox = (rowI % 2) * (step >> 1);
      if (((x + ox) % step === 1) && (y % step === 2)) { set(x, y, light); if (star) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (chiAt(x + dx, y + dy)) set(x + dx, y + dy, light); }
    }
  }
}
// ---------------------------------------------------------------- recolour
// tones around the chosen colour: the ramp index holding most of a region's pixels gets the colour itself, darker below, lighter above
function centred(c, n, mid) {
  return Array.from({ length: n }, (_, i) => i === mid ? c : i < mid ? mix(c, SHADE, Math.min(.62, .2 + .16 * (mid - i - 1) + (mid - i - 1 ? 0 : 0))) : mix(c, LIGHT, .26 * (i - mid)));
}
function medianIdx(counts) { const tot = counts.reduce((a, b) => a + b, 0); let acc = 0; for (let i = 0; i < counts.length; i++) { acc += counts[i]; if (acc >= tot / 2) return i; } return 0; }
function colours(look) {
  const skin = hex(SKIN_TONES[look.skin]), hair = hex(HAIR_COLOURS[look.hair]), chi = hex(DRESS_COLOURS[look.chiton]);
  return { skin, hair, chi, belt: look.belt ? hex(BELT_COLOURS[look.belt]) : chi, sand: look.sandals ? hex(SANDAL_COLOURS[look.sandals]) : null, eye: lum(skin) < .4 ? mix(hex(EYE_COLOURS[look.eyec]), [6, 2, 8], .8) : mix(hex(EYE_COLOURS[look.eyec]), [20, 10, 20], .5) };   // on the darkest skins the eyes go near-black, or they vanish
}
export function recolour(base, look) {
  const D = base.data, W = D.cw * 5, H = D.ch * 4, cv = makeCanvas(W, H), g = cv.getContext('2d'), R = D.ramps;
  g.drawImage(base.img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data, C = colours(look);
  const info = new Map(), counts = {};
  for (const name of ['hair', 'chiton', 'sash', 'sandal', 'skin']) { counts[name] = R[name].map(() => 0); R[name].forEach((c, i) => info.set(key(c[0], c[1], c[2]), [name, i])); }
  const eK = key(D.eye[0], D.eye[1], D.eye[2]), bK = key(D.blush[0], D.blush[1], D.blush[2]);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const t = info.get(key(d[i], d[i + 1], d[i + 2])); if (t) counts[t[0]][t[1]]++; }
  const T = {
    hair: centred(C.hair, 4, medianIdx(counts.hair)), chiton: centred(C.chi, 4, medianIdx(counts.chiton)), sash: centred(C.belt, 3, medianIdx(counts.sash)),
    skin: centred(C.skin, 3, medianIdx(counts.skin)), sandal: C.sand ? centred(C.sand, 3, medianIdx(counts.sandal)) : null,
  };
  T.sandal = T.sandal || T.skin;
  const blush = mix(C.skin, [232, 100, 110], .42), chiK = new Set(R.chiton.map(c => key(c[0], c[1], c[2]))), sashK = new Set(R.sash.map(c => key(c[0], c[1], c[2])));
  const chiMask = new Uint8Array(W * H), sashAsChi = !look.belt;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (!d[i + 3]) continue; const k = key(d[i], d[i + 1], d[i + 2]); let t = null;
    const inf = info.get(k); if (inf) { t = T[inf[0]][inf[1]]; if (chiK.has(k) || (sashAsChi && sashK.has(k))) chiMask[p] = 1; } else if (k === eK) t = C.eye; else if (k === bK) t = blush;
    if (t) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; }
  }
  if (look.pattern) for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const cell = new Uint8Array(D.cw * D.ch);
    for (let y = 0; y < D.ch; y++) for (let x = 0; x < D.cw; x++) cell[y * D.cw + x] = chiMask[(r * D.ch + y) * W + c * D.cw + x];
    pattern(d, W, H, c * D.cw, r * D.ch, cell, look, C.chi);
  }
  g.putImageData(id, 0, 0); return cv;
}

// ---------------------------------------------------------------- overlays
function palFor(item, look) {
  const p = Object.assign({}, PAL);
  if (item === 'bow') { const c = hex(BOW_COLOURS[look.ribbon]); p.x = c; p.X = mix(c, SHADE, .4); p.z = mix(c, LIGHT, .5); }
  else if (CAPE_COL[item]) { const c = CAPE_COL[item]; p.x = hex(c[0]); p.X = hex(c[1]); }
  return p;
}
// draws a map with a 1px dark outline; (x, y) is the anchor pixel, flip mirrors the map about it
function stamp(g, v, x, y, pal, flip, noOutline) {
  const rows = v.rows, w = rows[0].length, h = rows.length, ox = flip ? x - (w - 1 - v.ax) : x - v.ax, oy = y - v.ay;
  const c = makeCanvas(w + 2, h + 2), cg = c.getContext('2d');
  const px = (xx, yy, col) => { cg.fillStyle = css(col); cg.fillRect(xx + 1, yy + 1, 1, 1); };
  const solid = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && rows[yy][flip ? w - 1 - xx : xx] !== '.';
  if (!noOutline) for (let yy = -1; yy <= h; yy++) for (let xx = -1; xx <= w; xx++) {
    if (solid(xx, yy)) continue;
    if (solid(xx + 1, yy) || solid(xx - 1, yy) || solid(xx, yy + 1) || solid(xx, yy - 1)) px(xx, yy, OUTL);
  }
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const ch = rows[yy][flip ? w - 1 - xx : xx]; if (ch !== '.') px(xx, yy, pal[ch] || OUTL); }
  g.drawImage(c, ox - 1, oy - 1);
}
const NECK = { f: [[-3, 0], [-2, 1], [-1, 2], [0, 2], [1, 2], [2, 1], [3, 0]], s: [[0, 0], [0, 1], [-1, 2], [-1, 3]], b: [[-1, 0], [0, 0], [1, 0]] };
function necklace(g, look, fc, a, flip) {
  const cols = look.jewellery === 'gold' ? [[245, 197, 66]] : look.jewellery === 'turq' ? [[47, 184, 176]] : [[216, 69, 60], [255, 227, 106], [47, 184, 176], [245, 139, 184]];
  const pts = NECK[fc === 'f' ? 'f' : fc === 'b' ? 'b' : 's'], cx = fc === 'f' || fc === 'b' ? a.tx : a.cx - 1, y0 = a.chin + 2;
  pts.forEach(([dx, dy], i) => { g.fillStyle = css(cols[i % cols.length]); g.fillRect(Math.round(cx + (flip ? -dx : dx)), y0 + dy, 1, 1); });
}
function skinMask(cell, cw, ch) { // opaque, skin-coloured pixels of a cell canvas: for wrists
  const d = cell.getContext('2d').getImageData(0, 0, cw, ch).data, m = new Uint8Array(cw * ch);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) if (d[i + 3] && d[i] > 190 && d[i] - d[i + 2] > 18 && d[i + 1] > 140) m[p] = 1;
  return m;
}
function hands(m, cw, ch, a, fc) {
  const out = [], y0 = a.ctop + 17, y1 = a.hem + 1, cx = a.tx;
  const best = (xa, xb) => { let by = -1, bx = 0; for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) if (m[y * cw + x] && y >= by) { by = y; bx = x; } return by < 0 ? null : [bx, by]; };
  if (fc === 'l' || fc === 'r') { const h = best(0, cw - 1); if (h) out.push(h); }
  else { const l = best(0, Math.floor(cx) - 4), r = best(Math.ceil(cx) + 4, cw - 1); if (l) out.push(l); if (r) out.push(r); }
  return out;
}

export function dressSheet(base, ov, look) {
  const D = base.data, cw = D.cw, ch = D.ch, rec = recolour(base, look), out = makeCanvas(cw * 5, ch * 4), og = out.getContext('2d');
  const hat = HAT_ITEM[look.hat] || null, back = BACK_ITEM[look.back] || null, FR = { f: 0, b: 1, l: 2, r: 3 };
  for (const fc of 'fblr') for (let col = 0; col < 5; col++) {
    const a = D.frames[fc + col] || D.frames[fc + '0']; if (!a) continue;
    const flip = fc === 'r', view = fc === 'l' || fc === 'r' ? 's' : fc;
    const cell = makeCanvas(cw, ch), g = cell.getContext('2d'); g.imageSmoothingEnabled = false;
    const crown = [a.cx, a.ctop], shoulder = [a.tx, a.ctop + 17];
    const vw = (item, which) => { const o = ov[item]; return o ? (o[which] || (which === 'b' ? o.f : null) || null) : null; };
    // ---- behind the body: back items seen from the front and the side, the long hair stays on the sheet
    const bk = back && BACK_ITEM[look.back];
    const bkView = bk ? vw(bk, view) : null, bkOver = bk && (view === 'b' || (bk === 'owlpack' && view === 'f'));
    if (bkView && !bkOver) { const sx = view === 's' ? shoulder[0] + (flip ? -2 : 2) : shoulder[0]; stamp(g, bkView, Math.round(sx), shoulder[1], palFor(look.back, look), flip); }
    g.drawImage(rec, col * cw, FR[fc] * ch, cw, ch, 0, 0, cw, ch);
    const sm = look.jewellery === 'bangles' || look.scroll ? skinMask(cell, cw, ch) : null;
    if (bkView && bkOver) stamp(g, bkView, Math.round(shoulder[0]), shoulder[1], palFor(look.back, look), flip);
    // ---- on the body
    if (look.jewellery === 'gold' || look.jewellery === 'turq' || look.jewellery === 'beads') necklace(g, look, fc, a, flip);
    if (sm) for (const [hx, hy] of hands(sm, cw, ch, a, fc)) {
      if (look.jewellery === 'bangles') { g.fillStyle = css(PAL.g); g.fillRect(hx - 1, hy - 2, 3, 1); g.fillStyle = css(PAL.G); g.fillRect(hx - 1, hy - 1, 3, 1); }
      if (look.scroll && ov.scroll && fc !== 'b') stamp(g, ov.scroll.f, hx, hy - 2, palFor('scroll', look), false);
    }
    if (look.earrings && fc !== 'b') {
      g.fillStyle = css(PAL.g);
      if (fc === 'f') { g.fillRect(Math.round(a.cx - 7), a.chin - 4, 1, 2); g.fillRect(Math.round(a.cx + 7), a.chin - 4, 1, 2); }
      else g.fillRect(Math.round(a.cx + (flip ? -1 : 1)), a.chin - 4, 1, 2);
    }
    if (look.beard && ov.beard && fc !== 'b') { const p = Object.assign({}, PAL); stamp(g, vw('beard', view), Math.round(fc === 'f' ? a.cx : a.cx + (flip ? 2 : -2)), a.chin - 1, p, flip); }
    // ---- bow(s)
    if (look.ribbon && ov.bow) {
      const spots = ((BOW_AT[look.style] || BOW_AT.red)[view] || []), pal = palFor('bow', look);
      for (const [dx, dy] of spots) stamp(g, ov.bow.f, Math.round(a.cx + (flip ? -dx : dx)), a.ctop + dy, pal, false);
    }
    // ---- hat
    if (hat) { const v = vw(hat, view); if (v) stamp(g, v, Math.round(crown[0]), crown[1], palFor(hat, look), flip); }
    if (look.sandals === 'winged') {
      const fy = a.bottom - 3; g.fillStyle = css(PAL.w);
      if (fc === 'f' || fc === 'b') for (const dx of [-5, 5]) { g.fillRect(a.tx + dx, fy, 1, 3); g.fillRect(a.tx + dx + (dx < 0 ? -1 : 1), fy - 1, 1, 2); }
      else { g.fillRect(Math.round(a.tx + (flip ? -3 : 3)), fy - 1, 2, 3); g.fillRect(Math.round(a.tx + (flip ? -5 : 5)), fy - 2, 1, 2); }
    }
    og.drawImage(cell, col * cw, FR[fc] * ch);
  }
  return out;
}
