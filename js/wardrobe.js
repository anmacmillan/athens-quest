// The wardrobe: the pixel sprite and the manga portrait of the chosen base character on a stage, tabs per slot, item tiles, Wear / Buy, saved to the player's costume + outfit.
//   openWardrobe({ first, onDone, from })  - first: the 'make your character' step (new player, name entry)
//   initWardrobe(game)                      - call once at boot: remembers the game and adds a HUD button
// Free choices are stored in p.costume (plain keys), shop items in p.outfit[slot] (js/economy.js); the look drawn = costume + outfit.
import { el } from './util.js';
import { store, me, addPlayer, touch, onChange } from './store.js';
import { speedPicker } from './reading.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';
import { loadShop, shopData, owlsBalance, isOwned, isTrophy, canAfford, buy } from './economy.js';
import { createAvatarView, renderAvatarThumb } from './avatar_view.js';
import { SKIN_TONES, SKIN_ORDER, HAIR_STYLES, EYE_STYLES, EYE_COLOURS, HAIR_COLOURS, DRESS_COLOURS, BOW_COLOURS, FREE, ITEM_LOOK, DEFAULT_COSTUME, normalizeCostume, lookOf, ensureLook } from './avatar_core.js';

let GAME = null, ICONS = null;
const css = () => { if (!document.getElementById('wdcss')) document.head.append(el('link', { id: 'wdcss', rel: 'stylesheet', href: new URL('../css/wardrobe.css', import.meta.url).href })); };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const NONE = { '': 'None' };
const LABEL = { sandals: { '': 'Bare feet', leather: 'Leather sandals' }, belt: { '': 'No belt', red: 'Red sash', rope: 'Rope belt' }, ribbon: { '': 'No bow', red: 'Red bow', lilac: 'Lilac bow', pink: 'Pink bow' },
  board: { '': 'No board', plain: 'Plain deck' }, hat: { '': 'No hat' }, back: { '': 'Nothing' }, pattern: { '': 'Plain' }, jewellery: { '': 'None' }, earrings: { '': 'None' } };
const SWATCH = { hair: HAIR_COLOURS, chiton: DRESS_COLOURS, ribbon: BOW_COLOURS };
// view used for a tile's picture, by slot
const TILE_VIEW = { style: 'head', hair: 'head', ribbon: 'head', earrings: 'head', hat: 'head', eyes: 'head', pattern: 'torso', belt: 'torso', jewellery: 'torso', sandals: 'feet', back: 'back', board: 'skate' };

const TABS = [
  { id: 'body', name: 'Body', sections: [{ t: 'Skin', k: 'skin' }, { t: 'Eye colour', k: 'eyec' }] },
  { id: 'hair', name: 'Look', sections: [{ t: 'Who you are', k: 'style' }, { t: 'Hair colour', k: 'hair' }] },
  { id: 'dress', name: 'Dress', sections: [{ t: 'Colour', k: 'chiton' }, { t: 'Pattern', k: 'pattern' }] },
  { id: 'belt', name: 'Belt', sections: [{ t: 'Belt', k: 'belt' }] },
  { id: 'feet', name: 'Sandals', sections: [{ t: 'Sandals', k: 'sandals' }] },
  { id: 'jewels', name: 'Jewels', sections: [{ t: 'Earrings', k: 'earrings' }, { t: 'Necklace and more', k: 'jewellery' }] },
  { id: 'bow', name: 'Bow', sections: [{ t: 'Bow', k: 'ribbon' }] },
  { id: 'hat', name: 'Hat', sections: [{ t: 'Hat and helmet', k: 'hat' }] },
  { id: 'back', name: 'Back', sections: [{ t: 'On your back', k: 'back' }] },
  { id: 'board', name: 'Board', sections: [{ t: 'Skateboard deck', k: 'board' }] },
];

// tiles for one section
function tilesFor(k, shop) {
  const T = [];
  if (k === 'skin') SKIN_ORDER.forEach(i => T.push({ k, v: i, label: 'Skin ' + (T.length + 1), swatch: SKIN_TONES[i] }));
  else if (k === 'eyes') EYE_STYLES.forEach(([v, n]) => T.push({ k, v, label: n }));
  else if (k === 'eyec') Object.keys(EYE_COLOURS).forEach(v => T.push({ k, v, label: cap(v), swatch: EYE_COLOURS[v] }));
  else if (k === 'freckles') [[true, 'Freckles'], [false, 'None']].forEach(([v, n]) => T.push({ k, v, label: n }));
  else if (k === 'style') HAIR_STYLES.forEach(([v, n]) => T.push({ k, v, label: n }));
  else if (k === 'dress') [['chiton', 'Chiton'], ['peplos', 'Peplos']].forEach(([v, n]) => T.push({ k, v, label: n }));
  else {
    const free = FREE[k] || (k === 'pattern' ? [''] : ['']);
    for (const v of free) T.push({ k, v, label: (LABEL[k] && LABEL[k][v] !== undefined ? LABEL[k][v] : cap(v)), swatch: SWATCH[k] && v ? SWATCH[k][v] : null });
    if (k === 'hat' || k === 'back' || k === 'jewellery' || k === 'earrings') { if (!T.length) T.push({ k, v: '', label: (LABEL[k] || NONE)[''] }); }
    for (const it of shop.items) { const m = ITEM_LOOK[it.id]; if (m && m[0] === k) T.push({ k, v: m[1], item: it, label: it.name.replace(/ (hair|chiton|bow)$/i, ''), swatch: SWATCH[k] ? SWATCH[k][m[1]] : null }); }
  }
  return T;
}

export async function openWardrobe(opts = {}) {
  css(); const G = GAME || window.__game; await loadShop();
  if (!ICONS) { try { ICONS = new Set(await (await fetch(new URL('../art/avatar/icons/index.json', import.meta.url).href)).json()); } catch (e) { ICONS = new Set(); } } const shop = shopData(), stories = (G && G.stories) || [];
  const first = !!opts.first || !me();
  // working copies
  let costume = normalizeCostume(first ? Object.assign({}, DEFAULT_COSTUME, opts.costume || {}) : me().costume), outfit = Object.assign({}, first ? {} : me().outfit || {});
  let tabId = 'body', sel = null, name = '', view = null, saving = 0, walking = false;
  const lookNow = () => lookOf(costume, outfit);
  const lookWith = t => { const c = Object.assign({}, costume), o = Object.assign({}, outfit); applyTile(c, o, t); return lookOf(c, o); };
  function applyTile(c, o, t) { if (t.item) o[t.k] = t.item.id; else { c[t.k] = t.v; delete o[t.k]; } }
  const isCurrent = t => lookNow()[t.k] === t.v && (!t.item ? !outfit[t.k] : outfit[t.k] === t.item.id);
  const owned = t => !t.item || isOwned(t.item, stories);
  function persist() {
    if (first && !store.me) return;
    const p = me(); if (!p) return; p.costume = Object.assign({}, costume); p.outfit = Object.assign({}, outfit); touch(store.me);
  }

  // ---- layout
  const viewBox = el('div', { class: 'wd-view' }), owlsEl = el('span', { class: 'wd-owls' }), detail = el('div', { class: 'wd-detail' });
  const tabsEl = el('div', { class: 'wd-tabs' }), grid = el('div', { class: 'wd-grid' });
  const nameIn = el('input', { type: 'text', maxlength: 14, placeholder: 'Your name', autocomplete: 'off', class: 'wd-name', oninput: e => { name = e.target.value.trim(); nameIn.classList.toggle('need', first && !name); } });
  const doneBtn = el('button', { class: 'btn go', text: first ? 'Start' : 'Done', onclick: () => finish() });
  if (first) nameIn.classList.add('need');   // the empty name box glows: it is the first thing to do
  let chosenSpeed = 'normal'; const speedEl = first ? el('div', { class: 'wd-speed' }, el('small', { text: 'How fast do words appear?' }), speedPicker(v => { chosenSpeed = v; }, 'normal')) : null;
  const bar = el('div', { class: 'wd-bar' }, first ? nameIn : null, speedEl, el('span', { class: 'wd-grow' }), owlsEl, doneBtn);
  const turn = el('div', { class: 'wd-turn' },
    el('button', { class: 'btn small', text: 'Wave', onclick: () => { sfx.tap(); view && view.wave(); } }),
    el('button', { class: 'btn small', text: 'Walk', onclick: e => { sfx.tap(); const on = e.currentTarget.classList.toggle('on'); walking = on; view && view.setPose(on ? 'walk' : tabId === 'board' ? 'skate' : 'idle'); } }),
    el('button', { class: 'btn small', text: 'Turn', onclick: () => { sfx.tap(); view && view.turnAround(); } }));
  const body = el('div', { class: 'wd-main' }, el('div', { class: 'wd-left' }, viewBox, turn), el('div', { class: 'wd-side' }, tabsEl, grid, detail, bar));
  const ov = ui.openOverlay(first ? 'Make your explorer' : 'Wardrobe', body, { cls: 'wd', noClose: first, onClose: () => { teardown(); opts.onClose && opts.onClose(); } });

  function teardown() { if (view) { view.dispose(); view = null; } saving = -1; }
  async function finish() {
    if (first && !store.me) { if (!name) { nameIn.classList.remove('shake'); void nameIn.offsetWidth; nameIn.classList.add('shake'); nameIn.focus(); ui.toast('Type your name first', 2200); return; } addPlayer(name, Object.assign({}, costume)); const p = me(); p.outfit = {}; p.readSpeed = chosenSpeed; touch(store.me); }
    else persist();
    teardown(); ui.closeOverlay(); sfx.tap(); refreshButton();
    if (opts.onDone) opts.onDone(); else if (first && G && G.afterPick) G.afterPick();
  }

  // ---- stage: the real sprite, integer-scaled, with the manga portrait of the chosen base
  createAvatarView(viewBox, { look: lookNow() }).then(v => {
    if (saving < 0) { v.dispose(); return; }
    view = v; if (tabId === 'board') { v.setPose('skate'); v.setDeck(lookNow().board); }
  }).catch(e => { console.error(e); viewBox.append(el('p', { class: 'wd-err', text: 'The preview could not load.' })); });
  const setView = async (l, wave) => { if (!view) return; await view.setLook(l, { wave });
    if (walking) view.setPose('walk'); else view.setPose(tabId === 'board' ? 'skate' : 'idle'); view.setDeck(l.board ? 'deck_' + String(l.board).replace(/^deck_/, '') : null); };

  // ---- tiles
  function tileEl(t, sec) {
    const own = owned(t), cur = isCurrent(t), troph = t.item && isTrophy(t.item);
    const b = el('button', { class: 'wd-tile' + (cur ? ' on' : '') + (own ? '' : ' locked') + (!own && troph ? ' trophy' : '') + (sel === t ? ' sel' : ''), 'aria-label': t.label, onclick: () => pick(t) });
    const pic = el('div', { class: 'wd-pic' }); b.append(pic);
    if (t.swatch) pic.append(el('i', { class: 'wd-sw', style: `background:${t.swatch}` }));
    else if (t.k === 'freckles' || t.k === 'dress') pic.append(el('span', { class: 'wd-txt', text: t.label }));
    else {
      const id = t.item && t.item.id, thumbView = TILE_VIEW[t.k] || 'full';
      const draw = () => renderAvatarThumb(null, { look: lookWith(t), size: 112, view: thumbView }).then(u => { const i = el('img', { src: u, alt: '' }); pic.replaceChildren(i); }).catch(() => { });
      if (id && ICONS.has(id)) { const im = new Image(); im.alt = ''; im.onload = () => pic.replaceChildren(im); im.onerror = draw; im.src = new URL('../art/avatar/icons/' + id + '.png', import.meta.url).href; } else draw();
    }
    b.append(el('small', { text: t.label }));
    if (!own) b.append(troph ? el('em', { class: 'wd-lock', text: 'Locked' }) : el('em', { class: 'wd-price', text: String(t.item.price), title: t.item.price + ' owl coins' }));
    else if (cur) b.append(el('em', { class: 'wd-worn', text: 'On' }));
    return b;
  }
  function render() {
    owlsEl.textContent = `${owlsBalance()} owl coins to spend`; owlsEl.className = 'wd-owls';
    tabsEl.replaceChildren(...TABS.map(t => el('button', { class: 'btn small' + (t.id === tabId ? ' on' : ''), text: t.name, onclick: () => { sfx.tap(); tabId = t.id; sel = null; setView(lookNow()); render(); } })));
    const tab = TABS.find(t => t.id === tabId); grid.replaceChildren();
    for (const sec of tab.sections) {
      const tiles = tilesFor(sec.k, shop);
      grid.append(el('h4', { text: sec.t }), el('div', { class: 'wd-row' }, tiles.map(t => tileEl(t, sec))));
    }
    renderDetail();
  }
  function renderDetail() {
    detail.replaceChildren();
    if (!sel) { detail.append(el('small', { text: 'Tap something to try it on.' })); return; }
    const t = sel, own = owned(t), cur = isCurrent(t), it = t.item, troph = it && isTrophy(it);
    const info = el('div', { class: 'wd-info' }, el('b', { text: t.label }));
    const acts = el('div', { class: 'wd-acts' });
    if (!own && troph) info.append(el('small', { class: 'wd-hint', text: it.hint || 'Locked' }));
    else if (!own) info.append(el('small', { text: it.desc || `${it.price} owls` }));
    else info.append(el('small', { text: cur ? 'You are wearing this.' : 'Yours.' }));
    acts.append(el('button', { class: 'btn small' + (cur ? ' on' : ''), text: cur ? 'Wearing' : 'Wear', disabled: (!own || cur) ? true : null, onclick: () => wear(t) }));
    if (!own && !troph) acts.append(el('button', { class: 'btn small', text: `Buy for ${it.price}`, disabled: canAfford(it) ? null : true, onclick: () => { if (buy(it.id)) { wear(t); } } }));
    if (!own && !troph && !canAfford(it)) info.append(el('small', { class: 'wd-hint', text: `Need ${it.price - owlsBalance()} more owls.` }));
    detail.append(info, acts);
  }
  function pick(t) {
    sfx.tap(); sel = t;
    if (owned(t)) { wear(t); return; }
    setView(lookWith(t)); render();                      // try it on, not owned: preview only
  }
  function wear(t) {
    applyTile(costume, outfit, t); persist(); setView(lookNow(), true); sfx.coin && 0; render();
  }
  render(); setTimeout(() => { if (view) view.wave(); }, 900);
}

// ---------------------------------------------------------------- HUD button with the player's face
let btn = null;
function refreshButton() {
  if (!btn) return; btn.replaceChildren();
  import('./avatar_sprite.js').then(m => {
    const p = me(); if (!p) return;
    const s = m.buildPlayerSprite(p); if (!s) { btn.textContent = 'Wardrobe'; m.preloadAvatar(p).then(refreshButton).catch(() => { }); return; }
    const c = document.createElement('canvas'); c.width = 28; c.height = 28; c.style.cssText = 'width:36px;height:36px;image-rendering:pixelated';
    c.getContext('2d').drawImage(s, 2, 9, 28, 28, 0, 0, 28, 28); btn.replaceChildren(c);
  }).catch(() => { btn.textContent = 'Wardrobe'; });
}
export function initWardrobe(game) {
  GAME = game; css();
  const top = document.getElementById('topbtns'); if (!top || document.getElementById('bWardrobe')) return;
  btn = el('button', { id: 'bWardrobe', class: 'btn small', 'aria-label': 'Wardrobe', title: 'Wardrobe', onclick: () => { if (me() && !ui.isOpen()) openWardrobe({}); } }, 'Wardrobe');
  top.prepend(btn); refreshButton(); onChange(() => refreshButton());
}
