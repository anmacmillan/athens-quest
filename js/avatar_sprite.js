// In-world player sprite: the pixel base character for the look's hairstyle, recoloured and dressed by avatar_art.js.
// Sheet layout (compatible with js/player.js drawPlayer): cells of CW x CH, columns = frames, rows = facings f, b, l, r.
//   frame 0 idle, 1 and 2 walking, 3 skateboard glide, 4 skateboard push. The figure is 40 px tall, feet on row FEET, like the NPC sprites.
import { lookOf, lookKey, ensureLook, lookReady, base, getOverlays } from './avatar_core.js';
import { dressSheet } from './avatar_art.js';
import { store } from './store.js';

export const CW = 32, CH = 52, FEET = 50, FRAMES = 5;

const cache = new Map();
const resolve = who => {
  if (who && who.costume !== undefined) return lookOf(who.costume, who.outfit);
  let outfit = null; try { const p = store.players[store.me]; if (p && p.costume === who) outfit = p.outfit; } catch (e) { }
  return lookOf(who, outfit);
};
export const lookOfWho = resolve;
export async function preloadAvatar(who) { const l = resolve(who); await ensureLook(l); return l; }
// the sheet for a look whose base art is loaded (see ensureLook), else null
export function buildSpriteFromLook(l) {
  const key = lookKey(l); if (cache.has(key)) return cache.get(key);
  if (!lookReady(l)) return null;
  const c = dressSheet(base(l.style), getOverlays(), l); cache.set(key, c); return c;
}
export function buildPlayerSprite(who) { return buildSpriteFromLook(resolve(who)); }
// for player.js sheetFor: the sprite if ready, else null (kicks off loading; the previous sprite is used meanwhile)
export function avatarSheet(who) {
  const s = buildPlayerSprite(who); if (s) return s;
  preloadAvatar(who).catch(() => { }); return null;
}
