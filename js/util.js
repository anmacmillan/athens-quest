// Small helpers shared by every module.
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const eio = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
export const eio2 = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
export const lerp = (a, b, u) => a + (b - a) * u;
export const R = Math.round;
export function rnd(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function shuffle(a, seed) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((seed === undefined ? Math.random() : rnd(seed + i)) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
export const $ = id => document.getElementById(id);
export function lsGet(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const FLAGS = {
  history: { name: 'True history', color: '#f5c542', tag: 'History' },
  myth: { name: 'Myth', color: '#a88bff', tag: 'Myth' },
  legend: { name: 'Old story, maybe not true', color: '#ff9b4a', tag: 'Legend' },
  tourist: { name: 'Tourist myth', color: '#e5484d', tag: 'Tourist myth' },
};
export const SPEAKERS = { glauka: 'Glauka', caryatid: 'The Caryatid', tortoise: 'The Tortoise', socrates: 'Socrates', minos: 'King Minos', arrephoros: 'The Arrephoros', priestess: 'The Priestess',
  ariadne: 'Ariadne', aegeus: 'King Aegeus', theseus: 'Theseus', athena: 'Athena', poseidon: 'Poseidon', medea: 'Medea', narrator: 'Glauka', plato: 'Plato', aristotle: 'Aristotle', diogenes: 'Diogenes', solon: 'Solon', pericles: 'Pericles', minotaur: 'The Minotaur', cyclops: 'A Cyclops',
  agamemnon: 'Agamemnon', clytemnestra: 'Clytemnestra', atreus: 'Atreus', thyestes: 'Thyestes', iphigenia: 'Iphigenia', procrustes: 'Procrustes', hera: 'Hera', aphrodite: 'Aphrodite', paris: 'Paris',
  odysseus: 'Odysseus', phaedra: 'Phaedra', hippolytus: 'Hippolytus', croesus: 'Croesus', cyrus: 'Cyrus', hermes: 'Hermes', zeus: 'Zeus', persian: 'A Persian', soldier: 'A soldier', citizen: 'An Athenian',
  traveller: 'A traveller', boy: 'A boy', girl: 'A girl', sinon: 'Sinon', trojan: 'A Trojan', priestess: 'The Priestess' };
export const speakerName = s => SPEAKERS[s] || (s ? s[0].toUpperCase() + s.slice(1) : 'Glauka');
