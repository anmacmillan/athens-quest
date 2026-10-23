// Arrival titles: walking up to a landmark slams its name onto the screen in a big manga title over a speed-line burst,
// with the subtitle underneath. Never blocks play. Shows again only after you have walked well away and come back.
import { dist } from './util.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';

export class TitleCard {
  constructor(G) { this.G = G; this.away = new Set(); this.cur = null; this.el = null; this.t = 0; this.cool = 0; }
  bind(landmarks) { this.list = (landmarks || []).filter(l => !l.noTitle); this.list.forEach(l => this.away.add(l.id)); }
  update(dt) {
    const G = this.G, W = G.world; this.cool -= dt;
    if (!this.list || W.kind !== 'live' || G.mode !== 'play' || G.busy || G.scene || G.flight || G.trans) return;
    const p = G.player, T = W.T || 32, near = T * 4, far = T * 7; let best = null, bd = 1e9;
    const here = W.id === 'athens' ? this.list.map(l => ({ l, x: l.x * W.ws, y: l.y * W.ws }))
      : ((G.passport && G.passport.stamps) || []).filter(st => st.spot.world === W.id).map(st => ({ l: { id: 'stamp:' + st.id, name: st.name, subtitle: st.sub || '' }, x: st.spot.x, y: st.spot.y }));
    for (const { l, x, y } of here) {
      if (!this.seen) this.seen = new Set(); if (!this.seen.has(l.id)) { this.seen.add(l.id); this.away.add(l.id); }
      const d = dist(p.x, p.y, x, y);
      if (d > far) this.away.add(l.id);
      else if (d < near && this.away.has(l.id) && d < bd) { bd = d; best = l; }
    }
    if (best && this.cool <= 0) { this.away.delete(best.id); this.show(best); }
  }
  show(l) {
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'titlecard'; this.el.innerHTML = '<div class="tc-burst"></div><div class="tc-name"></div><div class="tc-sub"></div>'; document.body.append(this.el); }
    const e = this.el; e.querySelector('.tc-name').textContent = l.name; e.querySelector('.tc-sub').textContent = l.subtitle || '';
    e.classList.toggle('long', l.name.length > 16);
    e.classList.remove('in', 'out'); void e.offsetWidth; e.classList.add('in'); sfx.whoosh && sfx.whoosh();
    clearTimeout(this.tm); this.tm = setTimeout(() => { e.classList.add('out'); }, 2300);
    this.cool = 1; this.shownAt = this.G.time;
    clearTimeout(this.ntm); if (l.note) this.ntm = setTimeout(() => ui.toast('Glauka: ' + l.note, 9000), 1500);   // a place with no story of its own: what it is
  }
  // a character's name card, when a host or story character steps out
  async showChar(sp) {
    if (this.ep === undefined) { try { this.ep = await (await fetch('data/epithets.json')).json(); } catch (e) { this.ep = {}; } }
    const t = this.ep[sp]; if (!t) return;
    if (!this.cel) { this.cel = document.createElement('div'); this.cel.id = 'charcard'; this.cel.innerHTML = '<div class="cc-band"></div><div class="cc-name"></div><div class="cc-sub"></div>'; document.body.append(this.cel); }
    const e = this.cel; e.querySelector('.cc-name').textContent = t[0]; e.querySelector('.cc-sub').textContent = t[1];
    let im = e.querySelector('.cc-port'); if (!im) { im = document.createElement('img'); im.className = 'cc-port'; im.alt = ''; e.prepend(im); }
    e.classList.remove('hasport'); im.style.display = 'none';
    im.onload = () => { im.style.display = ''; e.classList.add('hasport'); }; im.onerror = () => { if (!im.dataset.f) { im.dataset.f = 1; im.src = `art/portraits/${sp}_neutral.jpeg`; } };
    im.dataset.f = ''; im.src = `art/web/portraits/${sp}_neutral.jpeg`;
    e.classList.remove('in', 'out'); void e.offsetWidth; e.classList.add('in'); sfx.flourish && sfx.flourish();
    clearTimeout(this.ctm); this.ctm = setTimeout(() => e.classList.add('out'), 2600);
  }
  hide() { if (this.el) { clearTimeout(this.tm); this.el.classList.add('out'); } }
}
