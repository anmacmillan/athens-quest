// The Grand Tour: the must-see list, always on screen as a sidebar (folds to a small tab). One row per Athens passport stamp, ticked
// when its story is done. Tap a row and Glauka flies her there, even to the Academy and the Lyceum in their own areas.
import { el, lsGet, lsSet } from './util.js';
import { sfx, unlock } from './audio.js';
import { portraitSrc } from './arrival.js';

export class Tour {
  constructor(G) { this.G = G; this.box = null; this.open = lsGet('owlq.tour.open', innerWidth >= 900); }
  async init() {
    try { this.people = await (await fetch('data/people.json')).json(); } catch (e) { this.people = []; }
    const head = el('button', { class: 'tr-head', onclick: () => { unlock(); sfx.tap(); this.open = !this.open; lsSet('owlq.tour.open', this.open); this.refresh(); } },
      el('span', { class: 'tr-title', text: 'Grand Tour' }), el('span', { class: 'tr-n' }), el('span', { class: 'tr-fold' }));
    this.list = el('div', { class: 'tr-list' });
    this.box = el('div', { id: 'tour' }, head, el('div', { class: 'tr-bar' }, el('i')), this.list);
    this.box.addEventListener('pointerdown', e => e.stopPropagation());
    document.body.append(this.box); this.refresh(); addEventListener('resize', () => { this.key = null; this.refresh(); }); setInterval(() => this.place(), 1500);
  }
  place() { const tl = document.getElementById('topleft'); if (!tl || !this.box) return; const b = tl.getBoundingClientRect().bottom; if (b > 0) { this.box.style.top = Math.round(b + 8) + 'px'; this.box.style.maxHeight = `calc(100vh - ${Math.round(b + 30)}px)`; } }
  refresh() {
    const G = this.G, P = G.passport; if (!this.box || !P || !P.stamps) return;
    const list = P.page('athens'), n = list.filter(s => P.done(s)).length;
    this.box.classList.toggle('closed', !this.open);
    const tl = document.getElementById('topleft'); if (tl) { const b = tl.getBoundingClientRect().bottom; if (b > 0) this.box.style.top = Math.round(b + 8) + 'px'; this.box.style.maxHeight = `calc(100vh - ${Math.round(b + 30)}px)`; }
    this.box.querySelector('.tr-n').textContent = `${n} / ${list.length}`;
    this.box.querySelector('.tr-fold').textContent = this.open ? '▾' : '▸';
    this.box.querySelector('.tr-bar i').style.width = Math.round(n / Math.max(1, list.length) * 100) + '%';
    const ppl = (this.people || []).filter(q => G.spotById(q.story));
    const key = list.map(s => P.done(s) ? 1 : 0).join('') + ppl.map(q => G.collected(q.story) ? 1 : 0).join('') + G.world.id; if (key === this.key) return; this.key = key;
    // unvisited first, nearest-to-hand order kept from the passport; done ones sink to the bottom
    const rows = [...list.filter(s => !P.done(s)), ...list.filter(s => P.done(s))];
    const face = (who, cls, src) => { const im = el('img', { class: cls, src: src || `art/web/portraits/${who}_neutral.jpeg`, alt: '' }); im.onerror = () => { if (!im.dataset.f) { im.dataset.f = 1; im.src = `art/toca/${who}_f.png`; } else im.style.visibility = 'hidden'; }; return im; };
    const people = ppl.length ? [el('div', { class: 'tr-sec', text: 'People to meet' }), ...[...ppl.filter(q => !G.collected(q.story)), ...ppl.filter(q => G.collected(q.story))].map(q => {
      const got = G.collected(q.story);
      return el('button', { class: 'tr-row' + (got ? ' got' : ''), onclick: () => { unlock(); sfx.tap(); if (G.busy || G.scene || G.flight) return; G.goWho(q); } },
        el('span', { class: 'tr-tick', text: got ? '✓' : '' }), face(q.who, 'tr-face', q.face), el('span', { class: 'tr-name' }, q.name, el('small', { class: 'tr-sub', text: ' ' + (q.sub || '') })));
    })] : [];
    this.list.replaceChildren(el('div', { class: 'tr-sec', text: 'Buildings' }), ...rows.map(st => {
      const got = P.done(st), far = st.spot.world !== G.world.id;
      const face = el('img', { class: 'tr-face', src: portraitSrc(st.host), alt: '' }); face.onerror = () => { if (!face.dataset.f) { face.dataset.f = 1; face.src = `art/portraits/${st.host}_neutral.jpeg`; } else face.style.visibility = 'hidden'; };
      return el('button', { class: 'tr-row' + (got ? ' got' : ''), title: got ? 'Done. Tap to fly back there' : 'Tap to fly there',
        onclick: () => { unlock(); sfx.tap(); if (G.busy || G.scene || G.flight) return; G.goPlace(st.spot); } },
        el('span', { class: 'tr-tick', text: got ? '✓' : '' }), face,
        el('span', { class: 'tr-name' }, st.name, far && !got ? el('small', { text: ' ✈' }) : null));
    }), ...people);
  }
}
