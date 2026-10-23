// Canvas renderer: a native-resolution buffer scaled by an integer factor, smoothing off. Also bitmap text, nine-slice boxes, camera transform.
import { R, clamp } from './util.js';
export const IM = {}; export let M = {};
export const V = { W: 393, H: 273, S: 6, dpr: 1 };
export let cv, cx, buf, g, tmp, tg;
const tints = {};

export async function loadManifest(url) {
  M = await (await fetch(url)).json();
  await Promise.all(Object.keys(M).map(k => loadImage(k, M[k].f)));
  return M;
}
export function loadImage(key, src) {
  if (IM[key]) return Promise.resolve(IM[key]);
  return new Promise(res => { const i = new Image(); i.onload = () => { IM[key] = i; res(i); }; i.onerror = () => res(null); i.src = src; });
}
export function initRender(canvas) { cv = canvas; cx = cv.getContext('2d'); fit(); addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); }
// choose integer scale S so one art pixel is about 3 css px; view size follows the window
export function fit() {
  const dpr = window.devicePixelRatio || 1, w = innerWidth, h = innerHeight;
  let S = Math.round(3 * dpr);
  S = Math.max(1, Math.min(S, Math.floor(w * dpr / 300)));
  V.S = S; V.dpr = dpr; V.W = Math.ceil(w * dpr / S); V.H = Math.ceil(h * dpr / S);
  cv.width = V.W * S; cv.height = V.H * S; cv.style.width = (V.W * S / dpr) + 'px'; cv.style.height = (V.H * S / dpr) + 'px';
  buf = document.createElement('canvas'); buf.width = V.W; buf.height = V.H; g = buf.getContext('2d'); g.imageSmoothingEnabled = false;
  tmp = document.createElement('canvas'); tmp.width = V.W; tmp.height = V.H; tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false;
  window.dispatchEvent(new Event('oq-fit'));
}
export function present() { cx.imageSmoothingEnabled = false; cx.drawImage(buf, 0, 0, cv.width, cv.height); }
// css pixel -> view pixel
export function toView(clientX, clientY) { const r = cv.getBoundingClientRect(); return { x: (clientX - r.left) / r.width * V.W, y: (clientY - r.top) / r.height * V.H }; }

// camera: centre (x, y) in world px, zoom z. All world drawing happens between begin/end.
export function beginWorld(cam) {
  const z = cam.z, ox = R(V.W / 2 - cam.x * z), oy = R(V.H / 2 - cam.y * z);
  g.save(); g.setTransform(z, 0, 0, z, ox, oy);
}
export function endWorld() { g.restore(); }
export function viewRect(cam) { const w = V.W / cam.z, h = V.H / cam.z; return { x: cam.x - w / 2, y: cam.y - h / 2, w, h }; }
export function clampCam(cam, ww, wh) {
  const hw = V.W / cam.z / 2, hh = V.H / cam.z / 2;
  cam.x = ww <= hw * 2 ? ww / 2 : clamp(cam.x, hw, ww - hw); cam.y = wh <= hh * 2 ? wh / 2 : clamp(cam.y, hh, wh - hh);
}
export const toWorld = (cam, vx, vy) => ({ x: cam.x + (vx - V.W / 2) / cam.z, y: cam.y + (vy - V.H / 2) / cam.z });
export const toScreen = (cam, wx, wy) => ({ x: (wx - cam.x) * cam.z + V.W / 2, y: (wy - cam.y) * cam.z + V.H / 2 });

// ------------------------------------------------------------ text (8x16 bitmap glyphs, mixed case)
export function tint(col) {
  if (!tints[col]) {
    const c = document.createElement('canvas'); c.width = IM.font.width; c.height = IM.font.height;
    const k = c.getContext('2d'); k.drawImage(IM.font, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = col; k.fillRect(0, 0, c.width, c.height);
    tints[col] = c;
  }
  return tints[col];
}
export function text(s, x, y, col, sc = 1, n = s.length, ctx = g) {
  const f = tint(col);
  for (let i = 0; i < n && i < s.length; i++) {
    const code = s.charCodeAt(i) - 32;
    if (code <= 0 || code > 94) continue;
    ctx.drawImage(f, code * 8, 0, 8, 16, x + i * 8 * sc, y, 8 * sc, 16 * sc);
  }
}
export const textW = (s, sc = 1) => s.length * 8 * sc;
export function wrap(s, n) {
  const out = []; let line = '';
  for (const w of s.split(' ')) {
    if ((line + (line ? ' ' : '') + w).length > n) { out.push(line); line = w; } else line += (line ? ' ' : '') + w;
  }
  if (line) out.push(line);
  return out;
}
export function px(x, y, w, h, col, a) {
  if (a !== undefined) g.globalAlpha = a;
  g.fillStyle = col; g.fillRect(R(x), R(y), w, h);
  if (a !== undefined) g.globalAlpha = 1;
}
// nine-slice from the Sprout dialog box art (corners 5 px)
export function box(x, y, w, h, ctx = g) {
  const s = IM.box_3, c = 5, W = s.width, H = s.height; x = R(x); y = R(y);
  if (!box.ctr) { const t = document.createElement('canvas'); t.width = t.height = 1; const k = t.getContext('2d'); k.drawImage(s, W >> 1, H >> 1, 1, 1, 0, 0, 1, 1); const p = k.getImageData(0, 0, 1, 1).data; box.ctr = `rgb(${p[0]},${p[1]},${p[2]})`; }
  ctx.fillStyle = box.ctr; ctx.fillRect(x + c, y + c, w - 2 * c, h - 2 * c);
  const mx = W >> 1, my = H >> 1;
  ctx.drawImage(s, mx, 0, 1, c, x + c, y, w - 2 * c, c); ctx.drawImage(s, mx, H - c, 1, c, x + c, y + h - c, w - 2 * c, c);
  ctx.drawImage(s, 0, my, c, 1, x, y + c, c, h - 2 * c); ctx.drawImage(s, W - c, my, c, 1, x + w - c, y + c, c, h - 2 * c);
  ctx.drawImage(s, 0, 0, c, c, x, y, c, c); ctx.drawImage(s, W - c, 0, c, c, x + w - c, y, c, c);
  ctx.drawImage(s, 0, H - c, c, c, x, y + h - c, c, c); ctx.drawImage(s, W - c, H - c, c, c, x + w - c, y + h - c, c, c);
}
// ghostly scanline shimmer used for story characters
export function ghostDraw(im, x, y, alpha, t) {
  const w = im.width, h = im.height;
  for (let r = 0; r < h; r += 2) {
    const off = Math.sin(t * 23 + r * .9) > .55 ? 1 : 0;
    g.globalAlpha = alpha * (.5 + .5 * Math.abs(Math.sin(t * 9 + r * .35)));
    g.drawImage(im, 0, r, w, 2, R(x) + off, R(y) + r, w, 2);
  }
  g.globalAlpha = 1;
}
export function shadowAt(wx, wy, w, a = .3) {
  g.fillStyle = 'rgba(70,50,70,' + a + ')'; const x = R(wx), y = R(wy);
  g.fillRect(x - (w >> 1) + 1, y - 1, w - 2, 1); g.fillRect(x - (w >> 1), y, w, 1); g.fillRect(x - (w >> 1) + 1, y + 1, w - 2, 1);
}

// text with a dark halo, for map labels
export function label(s, x, y, col = '#fff4d6', halo = '#3a2c4c', center = false) {
  if (center) x -= textW(s) / 2; x = R(x); y = R(y);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) text(s, x + dx, y + dy, halo);
  text(s, x, y, col);
}
