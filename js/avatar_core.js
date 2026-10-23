// Avatar core: the look model and the catalogue of free and shop items. Shared by the in-world sprite (avatar_sprite.js),
// the wardrobe preview (avatar_view.js) and the wardrobe (wardrobe.js). The look is drawn from pixel base characters
// (art/player/bases/<style>.png + .json, cut from Gemini sheets by tools/build_player_bases.py) that are recoloured and dressed at runtime (avatar_art.js).
//
// A "costume" is what the player record stores (p.costume): free choices as plain keys.
// Shop items live in p.outfit[slot] = itemId (js/economy.js). The look drawn on screen is costume + outfit overrides:
//   lookOf(costume, outfit) -> look (every field resolved to a key).

export const BASES_DIR = new URL('../art/player/bases/', import.meta.url).href;
export const PORTRAIT_DIR = new URL('../art/player/portraits/', import.meta.url).href;
export const OVERLAYS_URL = new URL('../art/player/overlays.json', import.meta.url).href;
export const SKIN_TONES = ['#f7cfa8', '#eab98c', '#c48a5c', '#8d5a3b', '#5b3724', '#fbe1d0'];
export const SKIN_ORDER = [5, 0, 1, 2, 3, 4];                       // light to dark, for display
export const HAIR_STYLES = [['red', 'Red bow girl'], ['lilac', 'Lilac bow girl'], ['wavy', 'Long wavy'], ['buns', 'Two buns'], ['braid', 'Braid'], ['pigtails', 'Pigtails'], ['curly', 'Short curly'], ['ponytail', 'Ponytail']];
export const SANDAL_COLOURS = { leather: '#8a5a32', gold: '#e8b83a', red: '#d8453c', winged: '#8a5a32' };
export const EYE_STYLES = [['classic', 'Classic'], ['manga', 'Manga']];
export const EYE_COLOURS = { brown: '#6b3f23', blue: '#3c82d6', green: '#3f9a52', violet: '#8a4fd0', grey: '#6a7a88' };
export const HAIR_COLOURS = { chestnut: '#6b4429', black: '#2b2430', auburn: '#a8481c', blonde: '#e8c25e', red: '#cf4a3a', purple: '#7a4fb3', ginger: '#c8641e', midnight: '#222250', silver: '#c4c9d8', teal: '#2fa58a' };
export const DRESS_COLOURS = { pink: '#f6a9c4', sky: '#9ecbf0', lilac: '#b79df0', yellow: '#f5c06a', green: '#8fd1a2', white: '#f3eee4', sunset: '#ff9a5a', sea: '#3aa0c8', royal: '#7a3ac8', gold: '#e8b83a', olive: '#8aa04c' };
export const BOW_COLOURS = { red: '#e8443c', lilac: '#a98be8', pink: '#f28bb8', gold: '#f5c542', teal: '#2fb8b0', white: '#fdfcf6' };
export const BELT_COLOURS = { red: '#d8453c', lilac: '#a98be8', blue: '#3d7fd6', gold: '#f3c340', leather: '#8a5a32', rope: '#e8d6a8' };

export const FREE = {          // free choices per costume key (shown to everyone from the start)
  hair: ['chestnut', 'black', 'auburn', 'blonde', 'red', 'purple'],
  chiton: ['white', 'pink', 'sky', 'lilac', 'yellow', 'green'],
  ribbon: ['', 'red', 'lilac', 'pink'],
  sandals: ['', 'leather'],
  belt: ['', 'red', 'rope'],
  board: ['', 'plain'],
};
// shop item id -> the costume key and look value it sets. Slots follow data/shop.json (plus belt, earrings).
export const ITEM_LOOK = {
  chiton_sunset: ['chiton', 'sunset'], chiton_sea: ['chiton', 'sea'], chiton_royal: ['chiton', 'royal'], chiton_gold: ['chiton', 'gold'], chiton_olive: ['chiton', 'olive'],
  pat_meander: ['pattern', 'meander'], pat_olive: ['pattern', 'olive'], pat_stars: ['pattern', 'stars'], pat_dots: ['pattern', 'dots'],
  hair_ginger: ['hair', 'ginger'], hair_midnight: ['hair', 'midnight'], hair_silver: ['hair', 'silver'], hair_teal: ['hair', 'teal'],
  ribbon_gold: ['ribbon', 'gold'], ribbon_teal: ['ribbon', 'teal'], ribbon_white: ['ribbon', 'white'],
  sandals_gold: ['sandals', 'gold'], sandals_red: ['sandals', 'red'], sandals_winged: ['sandals', 'winged'],
  necklace_beads: ['jewellery', 'beads'], necklace_gold: ['jewellery', 'gold'], necklace_turq: ['jewellery', 'turq'], bangles: ['jewellery', 'bangles'], philosopher_scroll_beard: ['jewellery', 'philosopher'],
  earrings_gold: ['earrings', 'gold'],
  belt_lilac: ['belt', 'lilac'], belt_blue: ['belt', 'blue'], belt_gold: ['belt', 'gold'], belt_leather: ['belt', 'leather'],
  cape_red: ['back', 'cape_red'], cape_blue: ['back', 'cape_blue'], feather_cape: ['back', 'feather_cape'], wings_small: ['back', 'wings_small'], sphinx_wings: ['back', 'wings_sphinx'], spartan_shield: ['back', 'shield'], owl_backpack: ['back', 'owlpack'],
  hat_petasos: ['hat', 'petasos'], hat_flowers: ['hat', 'flowers'], hat_crown: ['hat', 'crown'], hat_laurel: ['hat', 'laurel'], minotaur_horns: ['hat', 'horns'], athena_helmet: ['hat', 'helmet'],
  deck_meander: ['board', 'meander'], deck_owl: ['board', 'owl'], deck_medusa: ['board', 'medusa'], deck_parthenon: ['board', 'parthenon'],
};
export const DEFAULT_COSTUME = { v: 2, skin: 0, eyes: 'manga', eyec: 'brown', freckles: true, style: 'red', hair: 'chestnut', dress: 'chiton', chiton: 'white', pattern: '', belt: 'red', sandals: 'leather', earrings: '', jewellery: '', ribbon: 'red', hat: '', back: '', board: '' };
const LEGACY_HAIR = ['chestnut', 'black', 'auburn', 'blonde', 'red', 'purple'], LEGACY_CHITON = ['pink', 'sky', 'lilac', 'yellow', 'green', 'white'], LEGACY_BOW = ['red', 'blue', 'gold', 'purple', 'teal', 'pink'];
const LEGACY_STYLE = { bob: 'curly', long: 'wavy', pigtails: 'pigtails', bun: 'buns' };

// Fill in a stored costume: new keys get defaults, the first version's numeric choices are translated.
export function normalizeCostume(c) {
  const o = Object.assign({}, DEFAULT_COSTUME), s = c || {};
  for (const k in DEFAULT_COSTUME) if (s[k] !== undefined && s[k] !== null) o[k] = s[k];
  if (typeof s.hair === 'number') o.hair = LEGACY_HAIR[s.hair] || 'chestnut';
  if (typeof s.chiton === 'number') o.chiton = LEGACY_CHITON[s.chiton] || 'white';
  if (typeof s.bow === 'number' && s.ribbon === undefined) { const b = LEGACY_BOW[s.bow]; o.ribbon = BOW_COLOURS[b] ? b : 'red'; }
  if (LEGACY_STYLE[s.style] && !HAIR_STYLES.some(h => h[0] === s.style)) o.style = LEGACY_STYLE[s.style];
  if (!HAIR_STYLES.some(h => h[0] === o.style)) o.style = 'red';
  if (!(+s.v >= 2)) {                                   // first pixel-character version: the old blocky looks map to the nearest base
    if (o.style === 'ponytail' && o.ribbon === 'red') o.style = 'red'; else if (o.style === 'pigtails' && o.ribbon === 'lilac') o.style = 'lilac';
    o.v = 2;
  }
  o.skin = Math.max(0, Math.min(SKIN_TONES.length - 1, +o.skin || 0));
  if (!EYE_COLOURS[o.eyec]) o.eyec = 'brown'; if (!EYE_STYLES.some(e => e[0] === o.eyes)) o.eyes = 'manga';
  if (!HAIR_COLOURS[o.hair]) o.hair = 'chestnut'; if (!DRESS_COLOURS[o.chiton]) o.chiton = 'white';
  if (o.dress !== 'peplos') o.dress = 'chiton'; o.freckles = !!o.freckles;
  return o;
}
// costume + outfit overrides (item id per slot) -> look
export function lookOf(costume, outfit, itemLook) {
  const l = normalizeCostume(costume), map = itemLook || ITEM_LOOK;
  for (const slot in (outfit || {})) {
    const m = map[outfit[slot]]; if (m) l[m[0]] = m[1];
  }
  if (l.jewellery === 'philosopher') { l.beard = true; l.scroll = true; } else { l.beard = false; l.scroll = false; }
  return l;
}
export const lookKey = l => JSON.stringify([l.skin, l.eyec, l.style, l.hair, l.chiton, l.pattern, l.belt, l.sandals, l.earrings, l.jewellery, l.ribbon, l.hat, l.back]);

// ---------------------------------------------------------------- base art loading
const bases = new Map(), pend = new Map();
let overlays = null, ovPend = null;
export function loadBase(id) {
  if (bases.has(id)) return Promise.resolve(bases.get(id));
  if (pend.has(id)) return pend.get(id);
  const p = (async () => {
    const [im, data] = await Promise.all([
      new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing base ' + id)); i.src = BASES_DIR + id + '.png'; }),
      fetch(BASES_DIR + id + '.json').then(r => { if (!r.ok) throw new Error('missing base data ' + id); return r.json(); })]);
    const b = { id, img: im, data }; bases.set(id, b); return b;
  })();
  pend.set(id, p); p.catch(() => pend.delete(id)); return p;
}
export const base = id => bases.get(id) || null;
export function loadOverlays() {
  if (overlays) return Promise.resolve(overlays);
  return ovPend || (ovPend = fetch(OVERLAYS_URL).then(r => r.json()).then(o => (overlays = o)).catch(e => { ovPend = null; throw e; }));
}
export const getOverlays = () => overlays;
export async function ensureLook(l) { await Promise.all([loadBase(l.style), loadOverlays()]); return l; }
export const lookReady = l => bases.has(l.style) && !!overlays;
export const portraitUrl = style => PORTRAIT_DIR + style + '.jpeg';
export const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return c; };
