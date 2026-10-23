// Owls: the in-game currency (Athenian coins were nicknamed owls). Separate from the real EUR 1 per story tally.
// Balance, owned items, outfit, feathers and stickers live on the player record (p.owls, p.items, p.outfit, p.feathers, p.stickers) and sync like badges.
import { me, touch, store } from './store.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';

export const REWARDS = { comic: 10, quizFirst: 10, feather: 5, secret: 15, minigame: 15, seen: 20 };
export const owlsBalance = () => { const p = me(); return p ? p.owls || 0 : 0; };
export const owns = id => { const p = me(); return !!(p && p.items && p.items[id]); };
export function earnOwls(n, why) {
  const p = me(); if (!p || !n) return 0;
  p.owls = (p.owls || 0) + n; touch(store.me); sfx.coin && sfx.coin();
  ui.toast(`+${n} owls${why ? ' (' + why + ')' : ''}`, 1800); ui.refresh(); return n;
}
export function spendOwls(n) { const p = me(); if (!p || (p.owls || 0) < n) return false; p.owls -= n; touch(store.me); ui.refresh(); return true; }
export function addItem(id) { const p = me(); if (!p) return false; p.items = p.items || {}; p.items[id] = Date.now(); touch(store.me); return true; }

// ---- the stall: items from data/shop.json (shared with the wardrobe). Trophy items have an `unlock` condition and cannot be bought.
let shop = null;
export async function loadShop() { if (!shop) { try { shop = await (await fetch('data/shop.json')).json(); } catch (e) { shop = { items: [], slots: [], stops: [] }; } } return shop; }
export const shopData = () => shop || { items: [], slots: [], stops: [] };
export const itemById = id => shopData().items.find(i => i.id === id);
export function featherCount(p) { return Object.keys((p || me() || {}).feathers || {}).length; }
// unlock conditions: {stories:[ids]} {badge:id} {main:true} {feathers:n}; needs the story list for 'main'
export function unlocked(item, stories) {
  const p = me(); if (!p || !item) return false; if (!item.unlock) return true; const u = item.unlock;
  if (u.stories && !u.stories.every(s => p.badges[s])) return false;
  if (u.badge && !p.badges[u.badge]) return false;
  if (u.feathers && featherCount(p) < u.feathers) return false;
  if (u.main) { const M = (stories || []).filter(s => s.main); if (!M.length || !M.every(s => p.badges[s.id])) return false; }
  return true;
}
export const isTrophy = item => !!(item && item.unlock);
export function isOwned(item, stories) { const p = me(); if (!p || !item) return false; if (isTrophy(item)) return unlocked(item, stories); if (item.consumable) return (p.items[item.id] || 0) > 0; return !!p.items[item.id]; }
export function canAfford(item) { return owlsBalance() >= item.price; }
export function buy(id) {
  const it = itemById(id), p = me(); if (!it || !p || isTrophy(it) || !canAfford(it)) return false;
  if (!it.consumable && p.items[id]) return false;
  spendOwls(it.price); p.items[id] = it.consumable ? ((+p.items[id] || 0) + 1) : Date.now(); touch(store.me); sfx.buy(); ui.refresh(); return true;
}
// outfit: one item per slot (p.outfit[slot] = itemId). The wardrobe/avatar code reads it.
export function equip(id, stories) {
  const it = itemById(id), p = me(); if (!it || !p || !isOwned(it, stories) || it.consumable) return false;
  p.outfit = p.outfit || {}; p.outfit[it.slot] = id; touch(store.me); return true;
}
export function unequip(slot) { const p = me(); if (!p || !p.outfit || !p.outfit[slot]) return; delete p.outfit[slot]; touch(store.me); }
export const equipped = slot => { const p = me(); return p && p.outfit ? p.outfit[slot] || null : null; };
export function useOlive() { const p = me(); if (!p || !(p.items.olives > 0)) return false; p.items.olives--; touch(store.me); return true; }
// 'new!' dot: something affordable or unlocked that the player has not looked at yet
const seenKey = () => 'owlq.shopseen.' + (store.me || '');
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey())) || []); } catch (e) { return new Set(); } };
export function newItems(stories) {
  const seen = seenSet(); return shopData().items.filter(i => !isOwned(i, stories) && !seen.has(i.id) && (isTrophy(i) ? unlocked(i, stories) : canAfford(i)));
}
export function markSeen(stories) { try { const s = seenSet(); newItems(stories).forEach(i => s.add(i.id)); shopData().items.forEach(i => { if (isOwned(i, stories)) s.add(i.id); }); localStorage.setItem(seenKey(), JSON.stringify([...s])); } catch (e) { } }
