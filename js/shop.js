// Fallback stall screen (the wardrobe, when present, replaces it): browse by slot, buy with owls, equip. Reads data/shop.json via economy.js.
import { el } from './util.js';
import { me } from './store.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';
import { shopData, loadShop, owlsBalance, isOwned, isTrophy, unlocked, canAfford, buy, equip, unequip, equipped, newItems, markSeen } from './economy.js';

export async function openShop(G) {
  await loadShop(); const S = shopData(), stories = G.stories; let slot = S.slots[0];
  const body = el('div', { class: 'shop' }), render = () => {
    const nw = new Set(newItems(stories).map(i => i.id));
    const tabs = el('div', { class: 'shoptabs' }, S.slots.map(s => { const dot = S.items.some(i => i.slot === s && nw.has(i.id)); return el('button', { class: 'btn small' + (s === slot ? ' on' : ''), onclick: () => { slot = s; sfx.tap(); render(); } }, S.slotNames[s] || s, dot ? el('i', { class: 'newdot' }) : null); }));
    const grid = el('div', { class: 'shopgrid' });
    for (const it of S.items.filter(i => i.slot === slot)) {
      const owned = isOwned(it, stories), troph = isTrophy(it), eq = equipped(it.slot) === it.id; let act;
      if (it.consumable) act = el('button', { class: 'btn small', text: `Buy (${it.price}) - have ${(me().items[it.id] || 0)}`, disabled: !canAfford(it) || null, onclick: () => { if (buy(it.id)) render(); } });
      else if (troph && !owned) act = el('small', { class: 'hint', text: it.hint || 'Locked' });
      else if (!owned) act = el('button', { class: 'btn small', text: `Buy for ${it.price} owls`, disabled: !canAfford(it) || null, onclick: () => { if (buy(it.id)) render(); } });
      else if (it.ride) act = el('small', { class: 'hint', text: troph ? 'Yours! Use the Ride button.' : 'Yours! Use the Cart button.' });
      else act = el('button', { class: 'btn small' + (eq ? ' on' : ''), text: eq ? 'Take off' : 'Wear / use', onclick: () => { eq ? unequip(it.slot) : equip(it.id, stories); sfx.tap(); render(); } });
      grid.append(el('div', { class: 'scard' + (owned ? ' own' : '') }, el('b', { text: it.name }), el('small', { text: troph ? 'Trophy' : it.consumable ? '' : owned ? 'Owned' : `${it.price} owls` }), it.desc ? el('small', { text: it.desc }) : null, act));
    }
    body.replaceChildren(el('p', { class: 'owlsbar' }, el('b', { text: `${owlsBalance()} owls` })), tabs, grid);
  };
  render(); ui.openOverlay('Costume stall', body, { onClose: () => markSeen(stories) });
}
