// Local save (localStorage) plus Firebase Realtime Database over REST (same approach as Tick-Tock Boutique / Wizard Chess).
// Offline-first: every change is written locally first and pushed when the network allows. If writes are refused the game stays local.
import { CONFIG } from './config.js';
import { lsGet, lsSet } from './util.js';

const KEY = 'owlq.v1';
export const store = {
  family: null, me: null, players: {}, paid: {}, status: 'local',   // status: local | online | refused | offline
  dirty: new Set(), listeners: [],
};
const OK_CODE = /^[A-Za-z0-9]{6,12}$/;
export function cleanCode(c) { c = String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return OK_CODE.test(c) ? c : null; }
const emit = () => store.listeners.forEach(f => { try { f(); } catch (e) { } });
export const onChange = f => store.listeners.push(f);
const base = () => `${CONFIG.DB_URL}/owlq/${store.family}`;

export function loadStore() {
  const s = lsGet(KEY, {});
  const url = cleanCode(new URLSearchParams(location.search).get('f'));
  store.family = url || cleanCode(s.family) || CONFIG.DEFAULT_FAMILY;
  store.players = s.players || {}; store.paid = s.paid || {}; store.me = s.me && store.players[s.me] ? s.me : null;
  store.dirty = new Set(s.dirty || []);
  if (url) persist();
  return store;
}
export function persist() { lsSet(KEY, { family: store.family, me: store.me, players: store.players, paid: store.paid, dirty: [...store.dirty] }); }
export function setFamily(c) { c = cleanCode(c); if (!c) return false; store.family = c; persist(); pull(); return true; }
export const me = () => store.players[store.me];
export function newId(name) { return (name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'p') + Math.random().toString(36).slice(2, 6); }
export function addPlayer(name, costume) {
  const id = newId(name); store.players[id] = { name, costume, badges: {}, seen: {}, feathers: {}, stickers: {}, items: {}, outfit: {}, owls: 0, updated: Date.now() }; store.me = id; touch(id); return id;
}
export function selectPlayer(id) { if (store.players[id]) { store.me = id; persist(); } }
export function touch(id) { store.players[id].updated = Date.now(); store.dirty.add(id); persist(); emit(); push(); }
export function award(storyId) { const p = me(); if (!p || p.badges[storyId]) return false; p.badges[storyId] = Date.now(); touch(store.me); return true; }
export function setSeen(storyId, v) { const p = me(); if (!p) return; if (v) p.seen[storyId] = Date.now(); else delete p.seen[storyId]; touch(store.me); }
export const badgeCount = p => Object.keys((p || me() || {}).badges || {}).length;

// Firebase drops empty objects and may turn small integer-keyed objects into arrays: put shapes back
function norm(p) { if (!p || typeof p !== 'object') return null; p.badges = p.badges || {}; p.seen = p.seen || {}; p.feathers = p.feathers || {}; p.stickers = p.stickers || {}; p.items = p.items || {}; p.outfit = p.outfit || {}; p.owls = Math.max(0, +p.owls || 0); p.fog = typeof p.fog === 'string' && p.fog.length <= 4096 ? p.fog : ''; p.introSeen = +p.introSeen || 0; p.readSpeed = ['slow', 'normal', 'fast'].includes(p.readSpeed) ? p.readSpeed : 'normal'; p.costume = p.costume || {}; p.name = String(p.name || 'Player'); p.updated = +p.updated || 0; return p; }
function mergeFogBits(a, b) {
  if (!a) return b || ''; if (!b) return a; try { const x = atob(a), y = atob(b), n = Math.max(x.length, y.length); let r = ''; for (let i = 0; i < n; i++) r += String.fromCharCode((x.charCodeAt(i) || 0) | (y.charCodeAt(i) || 0)); return btoa(r); } catch (e) { return a; }
}
function merge(local, remote) {
  if (!local) return remote; if (!remote) return local;
  const out = (remote.updated > local.updated ? remote : local);
  const other = out === remote ? local : remote;
  out.badges = Object.assign({}, other.badges, out.badges); out.seen = Object.assign({}, other.seen, out.seen);   // badges are never lost
  for (const k of ['feathers', 'stickers', 'items']) out[k] = Object.assign({}, other[k] || {}, out[k] || {});   // collected things are never lost
  out.introSeen = Math.max(+out.introSeen || 0, +other.introSeen || 0);
  out.fog = mergeFogBits(out.fog, other.fog);   // discovered map cells are never lost (union of the bitmasks)
  out.outfit = Object.assign({}, out.outfit || {}); out.owls = +out.owls || 0;   // balance and outfit: the later record wins
  for (const k in other.badges) if (other.badges[k] < out.badges[k]) out.badges[k] = other.badges[k];
  return out;
}
let busy = false;
async function req(path, method, body) {
  const r = await fetch(base() + path + '.json', { method, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', keepalive: method === 'PUT' });
  if (r.status === 401 || r.status === 403) { store.status = 'refused'; throw new Error('refused'); }
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
export async function pull() {
  if (!navigator.onLine) { store.status = 'offline'; emit(); return; }
  try {
    const remote = await req('/players', 'GET') || {};
    for (const id in remote) { const r = norm(remote[id]); if (r) store.players[id] = merge(store.players[id], r); }
    try { store.paid = await req('/paid', 'GET') || {}; } catch (e) { }
    store.status = 'online'; persist(); emit();
    for (const id of store.dirty) await push();
  } catch (e) { if (store.status !== 'refused') store.status = 'offline'; emit(); }
}
export async function push() {
  if (busy || !store.dirty.size || store.status === 'refused') return; busy = true;
  try {
    for (const id of [...store.dirty]) { await req('/players/' + id, 'PUT', store.players[id]); store.dirty.delete(id); }
    store.status = 'online';
  } catch (e) { if (store.status !== 'refused') store.status = 'offline'; }
  busy = false; persist(); emit();
}
addEventListener('online', () => { pull(); });
setInterval(() => { if (!document.hidden && store.family) { if (store.dirty.size) push(); } }, 20000);
// parent page helpers
export async function fetchFamily(code) {
  store.family = code; const players = await req('/players', 'GET') || {}; let paid = {}; try { paid = await req('/paid', 'GET') || {}; } catch (e) { }
  for (const id in players) norm(players[id]); return { players, paid };
}
export const putPaid = (pid, rec) => req('/paid/' + pid, 'PUT', rec);
