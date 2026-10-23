// Pilot: smooth cartoon figures (art/toca/<id>_<pose>.png) drawn at full screen resolution instead of the pixel sprites, for the girl and a few
// characters. Switched on with ?toca=1 (remembered) and off with ?toca=0. The renderer splits the y-sorted entity list at each cartoon figure:
// everything behind is drawn and presented, the smooth figure goes on the screen canvas, then the entities in front are drawn over it.
import { lsGet, lsSet } from './util.js';

const q = new URLSearchParams(location.search).get('toca');
if (q !== null) lsSet('owlq.toca', q === '1');
export const TOCA = !!lsGet('owlq.toca', false);
const CAST = { girl: 64, socrates: 66, phidias: 64, nike: 68 };   // height in art pixels (the pixel girl is 44)
const IMG = {};
if (TOCA) for (const id in CAST) for (const p of ['f', 'fw', 's', 'sw', 'b']) { const i = new Image(); i.src = `art/toca/${id}_${p}.png`; IMG[id + '_' + p] = i; }
export const tocaHas = id => TOCA && id in CAST;
// pose image for a facing ('f' | 'b' | 'l' | 'r') and walking state
export function tocaPose(id, facing, moving, t) {
  const step = moving && Math.floor(t * 6) % 2 === 1;
  const p = facing === 'b' ? 'b' : (facing === 'l' || facing === 'r') ? (step ? 'sw' : 's') : (step ? 'fw' : 'f');
  const im = IMG[id + '_' + p]; return im && im.complete && im.naturalWidth ? { im, flip: facing === 'l', h: CAST[id], bob: moving && p === 'b' ? (Math.floor(t * 6) % 2) : 0 } : null;
}
// draw one figure on the screen canvas k, feet at world (x, y)
export function tocaDraw(k, cam, V, e) {
  const S = V.S, z = cam.z, pose = e.toca; if (!pose) return;
  const h = pose.h * z * S, w = h * pose.im.naturalWidth / pose.im.naturalHeight;
  const sx = ((e.toca.x - cam.x) * z + V.W / 2) * S, sy = ((e.toca.y - cam.y) * z + V.H / 2) * S - (pose.bob || 0) * z * S;
  k.save(); k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high'; if (pose.alpha) k.globalAlpha = pose.alpha;
  if (pose.flip) { k.translate(sx, 0); k.scale(-1, 1); k.drawImage(pose.im, -w / 2, sy - h, w, h); } else k.drawImage(pose.im, sx - w / 2, sy - h, w, h);
  k.restore();
}
