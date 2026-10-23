// The Theseus quest as a guided chain: Tribute (Athens) -> Labyrinth (Knossos) -> Naxos -> Aegeus (Athens, Nike bastion).
// After each story Glauka offers the next leg as a flight on the shared geographic plane (game.flyTo). Data: STEPS below; the Book tracker reads the same list.
import { el } from './util.js';
import { aiAssets } from './scene.js';
import { me } from './store.js';
import { sfx } from './audio.js';

export const STEPS = [
  { id: 'tribute', label: 'The Tribute', where: 'Athens, the Agora' },
  { id: 'labyrinth', label: 'The Labyrinth', where: 'Knossos, Crete' },
  { id: 'naxos', label: 'Ariadne on Naxos', where: 'The island of Naxos' },
  { id: 'aegeus', label: "Aegeus's Leap", where: 'Athens, the Nike bastion' },
];
const OFFERS = {
  tribute: { text: 'Want to see what happened in Crete? Hold on!', yes: 'Fly to Crete', no: 'Not now', to: 'knossos', spot: 'labyrinth', dy: 22 },
  labyrinth: { text: 'Sail home with Theseus? We will stop at Naxos on the way.', yes: 'Set sail', no: 'Stay here', to: 'greece', spot: 'naxos', dy: 12, toast: 'Naxos! Walk to the flag to hear what happened to Ariadne.' },
  naxos: { text: 'Aegeus is waiting on the rock in Athens. Sail on? Look out for the sails!', yes: 'Sail to Athens', no: 'Not yet', to: 'athens', spot: 'aegeus', dy: 24 },
};
export const questDone = p => !!p && STEPS.every(s => p.badges && p.badges[s.id]);

export class Theseus {
  constructor(G) { this.G = G; }
  // Glauka's choice box: resolves true for yes
  offer(o) {
    return new Promise(res => {
      const url = ['glauka_neutral', 'glauka'].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
      const por = el('img', { class: 'toffer-por' + (url ? '' : ' pix'), src: url || 'art/owl_0.png', draggable: 'false' });
      const done = v => { b.classList.add('out'); setTimeout(() => b.remove(), 250); res(v); };
      const b = el('div', { class: 'panel toffer' }, por, el('div', { class: 'toffer-body' }, el('b', { text: 'Glauka' }), el('div', { class: 'toffer-text', text: o.text }),
        el('div', { class: 'toffer-btns' }, el('button', { class: 'btn small', text: o.yes, onclick: e => { e.stopPropagation(); done(true); } }), el('button', { class: 'btn small', text: o.no, onclick: e => { e.stopPropagation(); done(false); } }))));
      document.body.append(b); sfx.hoot && sfx.hoot(); window.__offer = b;
    });
  }
  // called after a story finishes (game.playStory tail, once control is back with the player)
  async after(story) {
    const o = OFFERS[story.id]; if (!o) return; const G = this.G; if (G.busy || G.flight) return;
    if (!await this.offer(o)) return;
    const sp = G.spotById(o.spot), W = G.worlds[o.to]; if (!sp || !W) return;
    let land = { x: sp.x, y: sp.y + o.dy }; if (W.kind === 'live') land = W.nearestWalkable(land.x, land.y);
    await G.flyTo(o.to, null, land);
    if (o.toast) import('./ui.js').then(m => m.toast(o.toast, 4200));
  }
}
// the Book's tracker: four steps, ticked as their badges are earned
export function trackerEl() {
  const p = me(), done = STEPS.filter(s => p && p.badges[s.id]).length;
  return el('div', { class: 'theseus-track' }, el('h4', { text: `Theseus quest ${done} / ${STEPS.length}${questDone(p) ? ' ✔' : ''}` }),
    el('ol', {}, STEPS.map(s => el('li', { class: p && p.badges[s.id] ? 'ok' : '' }, el('b', { text: (p && p.badges[s.id] ? '✔ ' : '○ ') + s.label }), el('small', { text: ' ' + s.where })))));
}
