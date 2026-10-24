// Pilot: smooth cartoon figures (art/toca/<id>_<pose>.png) drawn at full screen resolution instead of the pixel sprites, for the girl and a few
// characters. Switched on with ?toca=1 (remembered) and off with ?toca=0. The renderer splits the y-sorted entity list at each cartoon figure:
// everything behind is drawn and presented, the smooth figure goes on the screen canvas, then the entities in front are drawn over it.
import { lsGet, lsSet } from './util.js';
import { girlNow } from './toca_look.js';

const q = new URLSearchParams(location.search).get('toca');
if (q !== null) lsSet('owlq.toca', q === '1');
export const TOCA = !!lsGet('owlq.toca', false);
const CAST = { girl: 64, socrates: 66, phidias: 66, nike: 68, pericles: 66, caryatid: 66, dionysus: 66, playwright: 66, paul: 62, hephaestus: 68, solon: 66, marcus: 66, zeus: 72, plato: 68, aristotle: 66, evzone: 70, glauka: 21,
  agamemnon: 68, ariadne: 64, arrephoros: 58, athena: 72, citizen2: 64, diogenes: 64, hermes: 66, hypatia: 64, medea: 64, minos: 68, poseidon: 72, priestess: 64, youth_a: 60, youth_b: 60, zeno: 64, aphrodite: 70, ares: 70, demeter: 68, hera: 70, aegeus: 66, phaedra: 64, maenad_a: 62, maenad_b: 62 };   // height in art pixels (the pixel girl is 44); a missing image falls back to the pixel sprite
const K = .8;   // overall cartoon scale against the pixel world (1 = the heights in CAST)
const IMG = {};
if (TOCA) for (const id in CAST) for (const p of ['f', 'fw', 's', 'sw', 'b']) { const i = new Image(); i.src = `art/toca/${id}_${p}.png`; IMG[id + '_' + p] = i; }
export const tocaHas = id => TOCA && id in CAST;
// pose image for a facing ('f' | 'b' | 'l' | 'r') and walking state
export function tocaPose(id, facing, moving, t) {
  if (id === 'girl' && TOCA) { const gp = girlNow(facing, moving, t, CAST.girl * K); if (gp) return gp; }   // the player's own look (js/toca_look.js)
  const step = moving && Math.floor(t * 6) % 2 === 1;
  const p = facing === 'b' ? 'b' : (facing === 'l' || facing === 'r') ? (step ? 'sw' : 's') : (step ? 'fw' : 'f');
  const im = IMG[id + '_' + p]; return im && im.complete && im.naturalWidth ? { im, flip: facing === 'l', h: CAST[id] * K, bob: moving && p === 'b' ? (Math.floor(t * 6) % 2) : 0 } : null;
}
// draw one figure on the screen canvas k, feet at world (x, y)
export function tocaDraw(k, cam, V, e) {
  const S = V.S, z = cam.z, pose = e.toca; if (!pose) return;
  const h = pose.h * z * S, w = h * (pose.im.naturalWidth || pose.im.width) / (pose.im.naturalHeight || pose.im.height);
  const sx = ((e.toca.x - cam.x) * z + V.W / 2) * S, sy = ((e.toca.y - cam.y) * z + V.H / 2) * S - (pose.bob || 0) * z * S;
  k.save(); k.imageSmoothingEnabled = true; k.imageSmoothingQuality = 'high'; if (pose.alpha) k.globalAlpha = pose.alpha;
  if (pose.flip) { k.translate(sx, 0); k.scale(-1, 1); k.drawImage(pose.im, -w / 2, sy - h, w, h); } else k.drawImage(pose.im, sx - w / 2, sy - h, w, h);
  k.restore();
}
// Glauka's poses (her sheet: f sitting, fw / s front flying wings up / down, sw / b side flying wings up / down, facing right)
export function tocaOwl(mode, face, flapUp) {
  const p = mode === 'sit' ? 'f' : mode === 'side' ? (flapUp ? 'sw' : 'b') : (flapUp ? 'fw' : 's');
  const im = IMG['glauka_' + p]; return im && im.complete && im.naturalWidth ? { im, flip: mode === 'side' && face === 'l', h: (mode === 'sit' ? CAST.glauka : CAST.glauka + 6) * K } : null;
}
