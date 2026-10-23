// Map markers from the art lead's set, optional and data-driven: art/markers/markers.json. Without it every caller keeps its built-in drawing.
// Schema read here (paths relative to art/markers/; each entry may use either spelling shown):
//   pennant: { "<flag>": { frames: ["pennant_<flag>_0.png", ...], ax, ay, fps } }      street-level flag, ax/ay = the foot of the pole in image px
//   pin:     { "<flag>": { file, window: {cx, cy, r}  (or wx, wy, wr), tip: [x, y] (or tipx, tipy) } }   teardrop with a transparent portrait window
//   coin / unknown / player / glauka: { file, window?, tip? }                              gold owl coin (done), '?' signpost (undiscovered), player ring (face window), owl icon
// Portraits are smooth-scaled into the pin windows (cached canvases); the pin image is drawn over them so the window frames the face.
import { IM, loadImage } from './render.js';

const M = { on: false, cfg: null, base: 'art/markers/' };
const cache = {};
const num = (o, ...ks) => { for (const k of ks) if (o && o[k] !== undefined) return +o[k]; return undefined; };
const win = o => { const w = o && (o.window || o.portrait_window || o.win); return w ? { cx: num(w, 'cx', 'x'), cy: num(w, 'cy', 'y'), r: num(w, 'r', 'radius') } : (o && o.wx !== undefined ? { cx: o.wx, cy: o.wy, r: o.wr } : null); };
const tip = (o, im) => { const t = o && (o.tip || o.anchor); if (Array.isArray(t)) return t; if (o && o.tipx !== undefined) return [o.tipx, o.tipy]; return [im.width / 2, im.height - 1]; };

export async function loadMarkers() {
  try {
    const r = await fetch(M.base + 'markers.json'); if (!r.ok) return false; M.cfg = await r.json(); const jobs = [];
    const get = f => { if (f && !IM['mk_' + f]) jobs.push(loadImage('mk_' + f, M.base + String(f).replace(/^art\/markers\//, ''))); };
    for (const k of ['pennant', 'banner', 'pin', 'pin_glauka']) for (const fl in (M.cfg[k] || {})) { const e = M.cfg[k][fl]; (e.frames || [e.file]).forEach(get); }
    for (const k of ['coin', 'unknown', 'sign', 'player', 'player_ring', 'glauka', 'owl']) { const e = M.cfg[k]; if (e) get(e.file); }
    await Promise.all(jobs); M.on = true; return true;
  } catch (e) { return false; }
}
export const markersOn = () => M.on;
const img = f => IM['mk_' + f];
// street-level pennant frame for a flag: { im, ax, ay } or null (use the built-in)
export function pennant(flag, t, phase = 0) {
  const set = M.on && (M.cfg.banner || M.cfg.pennant), e = set && (set[flag] || set[flag === 'tourist' ? 'tourist_myth' : flag]); if (!e || !e.frames || !e.frames.length) return null;
  const f = e.frames[Math.floor(t * (e.fps || 4) + phase) % e.frames.length], im = img(f); return im ? { im, ax: e.ax ?? im.width / 2, ay: e.ay ?? im.height - 1 } : null;
}
// kind: a flag name ('history', 'myth', ...) for story pins, or 'coin' | 'unknown' | 'player' | 'glauka'. h = drawn height in screen px. portrait: a canvas/image or null.
// Returns { c: canvas, tx, ty } (the tip of the pin inside c) or null.
export function pinCanvas(kind, h, portrait, key = '') {
  if (!M.on) return null; const C = M.cfg, fk = kind === 'tourist' ? 'tourist_myth' : kind;
  // kind: a flag, 'glauka:<flag>' (pin with the owl in the window), or coin | unknown (= sign) | player (= player_ring) | glauka (= owl)
  const e = kind.startsWith('glauka:') ? (C.pin_glauka || {})[kind.slice(7) === 'tourist' ? 'tourist_myth' : kind.slice(7)] : (C.pin && C.pin[fk]) || C[kind] || (kind === 'unknown' && C.sign) || (kind === 'player' && C.player_ring) || (kind === 'glauka' && C.owl);
  if (!e || !e.file) return null; const im = img(e.file); if (!im) return null;
  const ck = [kind, h, key, portrait ? 1 : 0].join('|'); if (cache[ck]) return cache[ck];
  const sc = h / im.height, w = Math.max(1, Math.round(im.width * sc)), c = document.createElement('canvas'); c.width = w; c.height = Math.round(h); const k = c.getContext('2d'); k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high';
  const W = win(e);
  if (portrait && W && W.r) { k.save(); k.beginPath(); k.arc(W.cx * sc, W.cy * sc, W.r * sc, 0, 7); k.clip(); const m = Math.min(portrait.width, portrait.height), d = W.r * 2 * sc; k.drawImage(portrait, (portrait.width - m) / 2, 0, m, m, W.cx * sc - d / 2, W.cy * sc - d / 2, d, d); k.restore(); }
  k.drawImage(im, 0, 0, w, c.height); const t = tip(e, im);
  return (cache[ck] = { c, tx: t[0] * sc, ty: t[1] * sc });
}
// draw a pin with its tip at (x, y) on ctx; returns true when drawn
export function drawPin(ctx, kind, x, y, h, portrait, key) {
  const p = pinCanvas(kind, h, portrait, key); if (!p) return false; if (kind === 'coin') y -= h * .7;   // the coin's anchor is its centre, so it floats above the spot
  ctx.drawImage(p.c, Math.round(x - p.tx), Math.round(y - p.ty)); return true;
}
