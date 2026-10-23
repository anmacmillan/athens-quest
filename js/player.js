// Player look: recolour the palette-slot sheets, add unlockable pieces, add the outline. Sheets are cached per look.
import { IM } from './render.js';
import { avatarSheet } from './avatar_sprite.js';
export const SKINS = ['#f7cfa8', '#eab98c', '#c48a5c', '#8d5a3b', '#5b3724'];
export const HAIRS = ['#5a3826', '#2a1f1f', '#a8581e', '#e3bd62', '#c9453a', '#7a4fa3'];
export const CHITONS = ['#f6a9c4', '#9ecbf0', '#b79df0', '#f5c06a', '#8fd1a2', '#ffffff'];
export const BOWS = ['#e8443c', '#3d7fd6', '#f5c542', '#8a5fd0', '#2fa58a', '#f28bb8'];
export const STYLES = [['bob', 'Bob'], ['long', 'Long'], ['pigtails', 'Pigtails'], ['bun', 'Bun']];
export const DEFAULT_COSTUME = { skin: 0, hair: 0, style: 'bob', chiton: 0, bow: 0 };
export const CW = 32, CH = 52, FEET = 50;   // matches avatar_sprite.js: a 40 px figure like the NPC sprites
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
const cache = {};

export function unlocks(badges, coreDone) { return { laurel: badges >= 5, cape: badges >= 10, helmet: !!coreDone }; }

let blank = null;
export function sheetFor(costume, un) {
  const av = avatarSheet(costume); if (av) return av;      // pixel base character (avatar_sprite.js); a clear sheet shows only while its art loads
  if (!blank) { blank = document.createElement('canvas'); blank.width = CW * 5; blank.height = CH * 4; }
  return blank;
}
const ROW = { f: 0, b: 1, l: 2, r: 3 };
// draw with feet at (x, y). frame 0 idle, 1 and 2 walking
export function drawPlayer(ctx, sheet, x, y, facing, frame, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sheet, frame * CW, ROW[facing] * CH, CW, CH, Math.round(x - CW / 2), Math.round(y - FEET), CW, CH);
  if (alpha !== 1) ctx.globalAlpha = 1;
}
// a small preview for menus (css canvas): the standing figure, front view, cropped to the figure
export function previewCanvas(costume, un, scale = 4) {
  const c = document.createElement('canvas'); c.width = 28 * scale; c.height = 42 * scale; c.className = 'pv';
  const k = c.getContext('2d'); k.imageSmoothingEnabled = false;
  const draw = () => { const s = avatarSheet(costume); if (!s) return false; k.clearRect(0, 0, c.width, c.height); k.drawImage(s, 2, 9, 28, 42, 0, 0, c.width, c.height); return true; };
  if (!draw()) { let n = 0; const iv = setInterval(() => { if (draw() || ++n > 60) clearInterval(iv); }, 150); }
  return c;
}
