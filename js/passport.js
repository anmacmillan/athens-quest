// Glauka's passport: one stamp per main building (data/passport.json). The game's overall goal is to fill the Athens page.
// Walking onto the doorstep of an unstamped building starts its story by itself: the host steps out, greets you, points out one
// feature you can find for real (a close-up pops up in a bubble), then the comic plays. A stamp = the badge of its headline story.
// Each new stamp gives owls and a wardrobe item that is put on at once, so the reward shows on the girl straight away.
import { el, dist } from './util.js';
import { me, touch, store } from './store.js';
import { earnOwls, addItem, loadShop, itemById } from './economy.js';
import { previewCanvas } from './player.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';

const DOOR_R = 26, LEAVE_R = 80;

export class Passport {
  constructor(G) { this.G = G; this.data = { stamps: [], pages: [], owls: 25 }; this.cool = new Set(); this.byStory = {}; }
  async init() {
    try { this.data = await (await fetch('data/passport.json')).json(); } catch (e) { console.error(e); }
    await loadShop().catch(() => { });
    const G = this.G;
    for (const st of this.data.stamps) {
      const sp = G.spotById(st.story); if (!sp) { console.warn('passport: no spot for', st.story); continue; }
      st.spot = sp; sp.stamp = st; sp.main = true;   // the compass, the guide and fast travel treat buildings as main stops
      this.byStory[st.story] = st;
    }
    this.stamps = this.data.stamps.filter(s => s.spot);
    this.pre = this.stamps.filter(s => s.host).map(s => { const i = new Image(); i.src = `art/web/portraits/${s.host}_neutral.jpeg`; return i; });   // arrival-card portraits ready before she arrives
  }
  ofStory(id) { return this.byStory[id] || null; }
  done(st) { return this.G.collected(st.story); }
  page(id) { return this.stamps.filter(s => s.page === id); }
  progress(page = 'athens') { const P = this.page(page); return { n: P.filter(s => this.done(s)).length, total: P.length }; }
  complete(page = 'athens') { const p = this.progress(page); return p.total > 0 && p.n === p.total; }

  // ---- the doorstep: an unstamped building's story starts when you walk up to it
  update() {
    const G = this.G; if (window.__noDoor) return; if (G.title && G.time - (G.title.shownAt ?? -9) < 1.5) return; if (G.mode !== 'play' || G.busy || G.scene || G.trans || G.flight || !this.stamps) return;
    const p = G.player, W = G.world;
    for (const st of this.stamps) {
      const sp = st.spot; if (sp.world !== W.id) continue;
      const d = dist(p.x, p.y, sp.x, sp.y);
      if (d > LEAVE_R) { this.cool.delete(st.id); continue; }
      if (d < DOOR_R && !this.done(st) && !this.cool.has(st.id) && W.kind !== 'map') { this.cool.add(st.id); G.playStory(sp); return; }
    }
  }
  // glowing doorstep ring, drawn under the flag of an unstamped building
  drawDoor(sp, t) {
    const st = sp.stamp; if (!st || this.done(st) || sp.world !== this.G.world.id) return null;
    return g => {
      const u = .5 + .5 * Math.sin(t * 2.6 + sp.i), r = DOOR_R - 4 + u * 3;
      g.fillStyle = `rgba(255,214,90,${(.10 + .10 * u).toFixed(3)})`; g.beginPath(); g.ellipse(sp.x, sp.y + 2, r, r * .45, 0, 0, 7); g.fill();
      g.strokeStyle = `rgba(255,226,120,${(.55 + .35 * u).toFixed(3)})`; g.lineWidth = 2; g.beginPath(); g.ellipse(sp.x, sp.y + 2, r, r * .45, 0, 0, 7); g.stroke();
      for (let k = 0; k < 6; k++) { const a = t * 1.3 + k * Math.PI / 3; const x = sp.x + Math.cos(a) * r, y = sp.y + 2 + Math.sin(a) * r * .45 - ((t * 14 + k * 5) % 14); g.fillStyle = `rgba(255,244,190,${(.8 - ((t * 14 + k * 5) % 14) / 18).toFixed(2)})`; g.fillRect(Math.round(x), Math.round(y), 2, 2); }
    };
  }

  // ---- the reward for a new stamp: owls, plus a wardrobe item put on straight away. Returns what was given (for the badge card).
  reward(story) {
    const st = this.ofStory(story.id), p = me(); if (!st || !p) return null;
    p.stickers = p.stickers || {}; if (p.stickers['stamp:' + st.id]) return null;
    p.stickers['stamp:' + st.id] = Date.now();
    const out = { stamp: st, owls: this.data.owls || 25, item: null };
    const it = st.gift && itemById(st.gift);
    if (it) { addItem(it.id); p.outfit = p.outfit || {}; p.outfit[it.slot] = it.id; out.item = it; }
    touch(store.me); earnOwls(out.owls, 'passport stamp');
    return out;
  }

  // ---- the passport screen
  open() {
    const G = this.G, p = me();
    const pr = this.progress('athens');
    const bar = el('div', { class: 'ppbar' }, el('i', { style: `width:${Math.round(pr.n / Math.max(1, pr.total) * 100)}%` }));
    const sections = (this.data.pages || []).map(pg => {
      const list = this.page(pg.id); if (!list.length) return null;
      const grid = el('div', { class: 'ppgrid' }, ...list.map(st => {
        const got = this.done(st), date = got && p && p.badges[st.story] ? new Date(p.badges[st.story]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        const face = got && st.image ? el('img', { src: st.image, alt: '' }) : el('span', { class: 'ppq', text: got ? '★' : '?' });
        return el('button', { class: 'ppstamp' + (got ? ' got' : ''), onclick: () => { sfx.tap(); this.detail(st); } }, el('div', { class: 'ppring' }, face), el('b', { text: st.name }), el('small', { text: got ? 'Stamped ' + date : 'Not yet' }));
      }));
      return el('div', { class: 'pppage' }, el('h3', { text: pg.title + (pg.id === 'athens' ? `  ${pr.n} / ${pr.total}` : '') }), grid);
    });
    ui.openOverlay("Glauka's Passport", el('div', { class: 'passport' }, el('p', { class: 'pphint', text: pr.n === pr.total ? 'Every building in Athens stamped. Athena is waiting for you on the Parthenon.' : 'Walk up to each glowing doorway. Fill the Athens page and Athena herself will appear.' }), bar, ...sections.filter(Boolean)));
  }
  detail(st) {
    const G = this.G, got = this.done(st);
    const body = el('div', { class: 'ppdetail' },
      st.image && got ? el('img', { class: 'ppbig', src: st.image, alt: '' }) : null,
      el('h3', { text: st.name }),
      got && st.feature ? el('p', { text: st.feature }) : el('p', { text: got ? '' : 'Find the glowing doorway here. Someone will come out to meet you.' }),
      el('div', { class: 'row' },
        got ? ui.button('Play the story again', () => { ui.closeOverlay(); G.goTo(st.spot); G.playStory(st.spot, { replay: true }); }) : ui.button('Take me there', () => { ui.closeOverlay(); G.fly.showCard({ kind: 'spot', ref: st.spot }); }),
        ui.button('Back', () => this.open())));
    ui.openOverlay(null, body);
  }
}

// the gift line on the badge card: the girl wearing her new item
export function giftView(r) {
  if (!r) return [];
  const out = [el('p', { class: 'ppgot', text: `Passport stamp: ${r.stamp.name}!  +${r.owls} owls` })];
  if (r.item) { const p = me(); out.push(el('div', { class: 'ppgift' }, previewCanvas(p.costume, {}, 3), el('p', { class: 'unlock', text: 'New: ' + r.item.name + '. You are wearing it now.' }))); }
  return out;
}
