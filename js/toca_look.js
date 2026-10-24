// Cartoon wardrobe: the cartoon girl dressed in the player's look. Base art per hairstyle (art/toca/girl/<style>_<pose>.png) is drawn in reserved key
// colours (hair blue, dress green, sash cyan, sandals yellow, skin peach); each key colour is recoloured to the look with its shading kept, then the
// accessories (art/toca/acc/<item>.png) are placed from anchors measured on the masks (head top, shoulders, neck). Built once per look and pose, cached.
//   girlPose(look, facing, moving, t, H) -> pose for toca.js (or null while loading)
import { SKIN_TONES, HAIR_COLOURS, DRESS_COLOURS, BELT_COLOURS, SANDAL_COLOURS, BOW_COLOURS, lookKey, lookOf } from './avatar_core.js';
import { store } from './store.js';

const POSES = ['f', 'fw', 's', 'sw', 'b'];
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lum = (r, g, b) => .299 * r + .587 * g + .114 * b;
const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------------------------------------------------------------- classes
const HAIR = 1, DRESS = 2, SASH = 3, SANDAL = 4, SKIN = 5, BLUSH = 6;
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (s < .22 || v < .12) return 0;
  let h; const d = mx - mn || 1;
  if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360;
  if (h >= 203 && h <= 255 && s > .3) return HAIR;
  if (h >= 168 && h < 203 && s > .3) return SASH;
  if (h >= 85 && h < 168 && s > .25) return DRESS;
  if (h >= 38 && h < 70 && s > .4 && v > .35) return SANDAL;
  if ((h >= 352 || h < 9) && s > .35 && s < .75 && v > .75) return BLUSH;
  if (h >= 9 && h < 38 && s > .2 && s < .78 && v > .45) return SKIN;
  return 0;
}
// a base pose: pixel classes, the reference brightness of each class (its most common lightness) and anchors measured on the masks
function analyse(im) {
  const w = im.naturalWidth, h = im.naturalHeight, c = canvas(w, h), k = c.getContext('2d'); k.drawImage(im, 0, 0);
  const d = k.getImageData(0, 0, w, h), px = d.data, cls = new Uint8Array(w * h), L = new Float32Array(w * h), hist = {};
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    if (px[i + 3] < 20) continue; const q = classify(px[i], px[i + 1], px[i + 2]); cls[p] = q; L[p] = lum(px[i], px[i + 1], px[i + 2]);
    if (q) { const hh = hist[q] || (hist[q] = new Uint32Array(52)); hh[Math.min(51, Math.floor(L[p] / 5))]++; }
  }
  const ref = {}; for (const q in hist) { const hh = hist[q]; let bi = 0; for (let i = 1; i < 52; i++) if (hh[i] > hh[bi]) bi = i; ref[q] = bi * 5 + 2.5; }
  // anchors
  let top = h, hx0 = w, hx1 = 0, dTop = h, dx0 = w, dx1 = 0, skinTop = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = cls[y * w + x]; if ((q === HAIR || q === SKIN) && y < top) top = y; if (q === DRESS && y < dTop) dTop = y; if (q === SKIN && y < skinTop) skinTop = y; }
  const headBand = Math.round(top + (dTop - top) * .35);   // the widest part of the head
  for (let y = top; y < dTop; y++) for (let x = 0; x < w; x++) { const q = cls[y * w + x]; if ((q === HAIR || q === SKIN) && Math.abs(y - headBand) < (dTop - top) * .12) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; } }
  const shoulder = Math.min(h - 1, dTop + Math.round((h - dTop) * .06));
  for (let x = 0; x < w; x++) { const q = cls[shoulder * w + x]; if (q === DRESS || q === SKIN) { if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; } }
  // the head's own centre: hair+skin columns in the head band, not a ponytail swinging off to one side
  let sx = 0, n = 0; for (let y = top; y < dTop; y++) for (let x = 0; x < w; x++) if (cls[y * w + x] === SKIN) { sx += x; n++; }
  const faceX = n ? sx / n : (hx0 + hx1) / 2;
  return { w, h, cls, L, ref, img: im, top, headW: Math.max(10, hx1 - hx0), headX: (hx0 + hx1) / 2, faceX, dTop, shoulderW: Math.max(10, dx1 - dx0), bodyX: (dx0 + dx1) / 2 };
}

// ---------------------------------------------------------------- loading
const bases = {}, loading = {}, acc = {}, accLoading = {};
function loadStyle(style) {
  if (bases[style] || loading[style]) return; loading[style] = true;
  Promise.all(POSES.map(p => img(`art/toca/girl/${style}_${p}.png`))).then(ims => {
    if (!ims.every(Boolean)) { bases[style] = 'missing'; return; }
    const B = Object.fromEntries(POSES.map((p, i) => [p, analyse(ims[i])])), F = B.f;
    // long hair hides the shoulders from behind and from the side: take the shoulder line (as a share of height) and width from the front view
    for (const p of POSES) { const q = B[p]; q.dTop = Math.round(F.dTop / F.h * q.h); if (p === 'b' || p === 'fw') { q.shoulderW = F.shoulderW * q.h / F.h; q.bodyX = q.w / 2; } else if (p === 's' || p === 'sw') q.shoulderW = Math.min(q.shoulderW, F.shoulderW * .8 * q.h / F.h); }
    bases[style] = B; });
}
function loadAcc(name) {
  if (acc[name] !== undefined || accLoading[name]) return; accLoading[name] = true;
  img(`art/toca/acc/${name}.png`).then(i => { acc[name] = i || null; built.clear(); });
}

// ---------------------------------------------------------------- recolour
function tint(base, lumv, refL, col, out, i) {   // map the class's lightness ramp onto the target colour: darker below the reference, lighter above
  const k = lumv / Math.max(1, refL);
  if (k <= 1) { out[i] = col[0] * k; out[i + 1] = col[1] * k; out[i + 2] = col[2] * k; }
  else { const u = Math.min(1, (lumv - refL) / Math.max(1, 255 - refL)); out[i] = col[0] + (255 - col[0]) * u; out[i + 1] = col[1] + (255 - col[1]) * u; out[i + 2] = col[2] + (255 - col[2]) * u; }
}
const PAT_INK = (chi, pat) => { const dark = lum(...chi) > 140; return pat === 'olive' ? (dark ? [86, 124, 58] : [150, 196, 96]) : dark ? [61, 111, 214] : [245, 211, 106]; };
function body(B, look) {
  const { w, h, cls, L, ref } = B, c = canvas(w, h), k = c.getContext('2d'); k.drawImage(B.img, 0, 0);
  const d = k.getImageData(0, 0, w, h), px = d.data;
  const skin = hex(SKIN_TONES[look.skin] || SKIN_TONES[0]), hair = hex(HAIR_COLOURS[look.hair] || HAIR_COLOURS.chestnut), chi = hex(DRESS_COLOURS[look.chiton] || DRESS_COLOURS.white);
  const belt = look.belt ? hex(BELT_COLOURS[look.belt] || BELT_COLOURS.red) : chi, sand = look.sandals ? hex(SANDAL_COLOURS[look.sandals] || SANDAL_COLOURS.leather) : skin;
  const blush = [Math.min(255, skin[0] * .55 + 232 * .45), skin[1] * .55 + 120 * .45, skin[2] * .55 + 130 * .45];
  const target = { [HAIR]: hair, [DRESS]: chi, [SASH]: belt, [SANDAL]: sand, [SKIN]: skin, [BLUSH]: blush };
  // a white dress: keep its shadow tone visible (pure white would wash out the folds)
  const refOf = q => q === BLUSH ? (ref[SKIN] || 200) * 1.02 : (ref[q] || 160);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) { const q = cls[p]; if (!q || px[i + 3] < 20) continue; tint(px, L[p], refOf(q), q === DRESS && lum(...chi) > 235 ? [238, 236, 230] : target[q], px, i); }
  if (look.pattern) pattern(px, w, h, cls, look.pattern, PAT_INK(chi, look.pattern));
  k.putImageData(d, 0, 0); return c;
}
function pattern(px, w, h, cls, pat, ink) {
  const set = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h || cls[y * w + x] !== DRESS) return; const i = (y * w + x) * 4; px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2]; };
  const u = Math.max(2, Math.round(h / 75));   // pattern unit in base pixels
  if (pat === 'dots' || pat === 'stars') {
    for (let y = 0; y < h; y += u * 5) for (let x = (Math.floor(y / (u * 5)) % 2) * u * 2; x < w; x += u * 5) {
      if (cls[y * w + x] !== DRESS) continue;
      for (let dy = -u; dy <= u; dy++) for (let dx = -u; dx <= u; dx++) if (pat === 'dots' ? dx * dx + dy * dy <= u * u : (dx === 0 || dy === 0)) set(x + dx, y + dy);
    }
    return;
  }
  // meander / olive: a band along the hem
  for (let x = 0; x < w; x++) {
    let hem = -1; for (let y = h - 1; y >= 0; y--) if (cls[y * w + x] === DRESS) { hem = y; break; } if (hem < 0) continue;
    const y0 = hem - u * 4;
    if (pat === 'meander') { for (let t = 0; t < u; t++) { set(x, y0 + t); set(x, hem - u * 1 + t - u); } const ph = Math.floor(x / (u * 3)) % 2; if (ph === 0) for (let y = y0; y < hem - u; y++) if (x % (u * 3) < u) set(x, y); }
    else { for (let t = 0; t < u; t++) set(x, hem - u * 2 + t); if (x % (u * 5) < u * 2) for (let t = 0; t < u * 2; t++) set(x, hem - u * 4 + t); }
  }
}

// ---------------------------------------------------------------- accessories
const HAT = { petasos: [1.32, .36], flowers: [1.04, .46], crown: [.6, .12], laurel: [1.06, .44], horns: [1.2, .55], helmet: [1.1, .55] };   // [width / head width, how far it sinks onto the head, in head widths]
const BACK = { cape_red: ['cape', 2.0, '#d8453c'], cape_blue: ['cape', 2.0, '#3d7fd6'], feather_cape: ['feather_cape', 2.0], wings_small: ['wings_small', 2.2], wings_sphinx: ['wings_sphinx', 2.7], shield: ['shield', 1.15], owlpack: ['owlpack', .95] };
const NECK = { gold: 'gold', beads: 'beads', turq: 'turq', bangles: 'gold' };
function tinted(im, col) {   // a sticker recoloured to one colour, shading kept
  const c = canvas(im.naturalWidth, im.naturalHeight), k = c.getContext('2d'); k.drawImage(im, 0, 0); const d = k.getImageData(0, 0, c.width, c.height), px = d.data, t = hex(col);
  let hist = new Uint32Array(52); for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 40) hist[Math.min(51, Math.floor(lum(px[i], px[i + 1], px[i + 2]) / 5))]++;
  let bi = 0; for (let i = 1; i < 52; i++) if (hist[i] > hist[bi]) bi = i; const ref = bi * 5 + 2.5;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) tint(px, lum(px[i], px[i + 1], px[i + 2]), ref, t, px, i);
  k.putImageData(d, 0, 0); return c;
}
const tintCache = new Map();
const tintOf = (name, col) => { const im = acc[name]; if (!im) return null; const key = name + col; if (!tintCache.has(key)) tintCache.set(key, tinted(im, col)); return tintCache.get(key); };
function wanted(look) {
  const a = []; if (look.hat && HAT[look.hat]) a.push(look.hat); if (look.ribbon && !look.hat) a.push('bow');
  if (look.back && BACK[look.back]) a.push(BACK[look.back][0]); if (look.jewellery && NECK[look.jewellery]) a.push(NECK[look.jewellery]); return a;
}
// compose body + accessories on a padded canvas; returns { c, scale } where scale = canvas height / base height (feet stay on the bottom edge)
function compose(B, look, pose) {
  const side = pose === 's' || pose === 'sw', back = pose === 'b', bodyC = body(B, look);
  const items = [];   // [image, x, y, w, h, behind]
  const hw = B.headW, cx = side ? B.headX : B.headX;
  if (look.back && BACK[look.back]) {
    const [nm, k, col] = BACK[look.back], im = col ? tintOf(nm, col) : acc[nm];
    if (im) { const iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, w = B.shoulderW * k, h = w * ih / iw, x = B.bodyX - w / 2 + (side ? -B.shoulderW * .28 : 0), y = B.dTop - B.shoulderW * (nm === 'cape' || nm === 'feather_cape' ? .18 : .1); items.push([im, x, y, w, h, !back]); }
  }
  if (look.jewellery && NECK[look.jewellery] && !side && !back) {
    const im = acc[NECK[look.jewellery]]; if (im) { const w = B.shoulderW * .48, h = w * im.naturalHeight / im.naturalWidth; items.push([im, B.faceX - w / 2, B.dTop - h * .25, w, h, false]); }
  }
  if (look.hat && HAT[look.hat]) {
    const im = acc[look.hat]; if (im) { const [kw, sink] = HAT[look.hat], w = hw * kw, h = w * im.naturalHeight / im.naturalWidth; items.push([im, cx - w / 2, B.top + hw * sink - h, w, h, false]); }
  } else if (look.ribbon) {
    const im = tintOf('bow', BOW_COLOURS[look.ribbon] || BOW_COLOURS.red); if (im) { const w = hw * .5, h = w * im.height / im.width, x = back ? cx - w / 2 : side ? B.headX - hw * .42 - w / 2 : cx + hw * .18; items.push([im, x, B.top - h * .25, w, h, side ? false : back ? false : false]); }
  }
  let x0 = 0, y0 = 0, x1 = B.w, y1 = B.h; for (const it of items) { x0 = Math.min(x0, it[1]); y0 = Math.min(y0, it[2]); x1 = Math.max(x1, it[1] + it[3]); y1 = Math.max(y1, it[2] + it[4]); }
  const padX = Math.ceil(Math.max(-x0, x1 - B.w)), padT = Math.ceil(-y0), W = B.w + padX * 2, H = B.h + padT;
  const c = canvas(W, H), k = c.getContext('2d'); k.imageSmoothingQuality = 'high';
  for (const it of items) if (it[5]) k.drawImage(it[0], it[1] + padX, it[2] + padT, it[3], it[4]);
  k.drawImage(bodyC, padX, padT);
  for (const it of items) if (!it[5]) k.drawImage(it[0], it[1] + padX, it[2] + padT, it[3], it[4]);
  if (back && look.back && /cape/.test(look.back)) k.drawImage(hairOnly(B, bodyC), padX, padT);   // long hair falls over the cape
  return { c, scale: H / B.h };
}

function hairOnly(B, bodyC) {
  const c = canvas(B.w, B.h), k = c.getContext('2d'); k.drawImage(bodyC, 0, 0); const d = k.getImageData(0, 0, B.w, B.h), px = d.data;
  for (let p = 0, i = 3; p < B.w * B.h; p++, i += 4) if (B.cls[p] !== HAIR) px[i] = 0; k.putImageData(d, 0, 0); return c;
}
// ---------------------------------------------------------------- public
const built = new Map();
export function girlReady(look) { loadStyle(look.style); return !!(bases[look.style] && bases[look.style] !== 'missing'); }
export function girlCanvas(look, pose) {
  if (!girlReady(look)) return null; for (const a of wanted(look)) loadAcc(a);
  const key = lookKey(look) + pose; let r = built.get(key);
  if (!r) { r = compose(bases[look.style][pose], look, pose); if (built.size > 60) built.clear(); built.set(key, r); }
  return r;
}
export function girlPose(look, facing, moving, t, H) {
  const step = moving && Math.floor(t * 6) % 2 === 1;
  const p = facing === 'b' ? 'b' : (facing === 'l' || facing === 'r') ? (step ? 'sw' : 's') : (step ? 'fw' : 'f');
  const r = girlCanvas(look, p); if (!r) return null;
  return { im: r.c, flip: facing === 'l', h: H * r.scale, bob: moving && p === 'b' ? (Math.floor(t * 6) % 2) : 0, natW: r.c.width, natH: r.c.height };
}
// the current player's look (costume + worn shop items)
let lastP = null, lastSig = '', lastLook = null;
export function currentLook() {
  const p = store.players && store.players[store.me]; if (!p) return null;
  const sig = JSON.stringify([p.costume, p.outfit]); if (p !== lastP || sig !== lastSig) { lastP = p; lastSig = sig; lastLook = lookOf(p.costume, p.outfit); }
  return lastLook;
}
export function girlNow(facing, moving, t, H) { const l = currentLook(); return l ? girlPose(l, facing, moving, t, H) : null; }
