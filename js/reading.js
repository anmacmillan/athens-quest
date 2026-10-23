// Reading speed: per-player Slow / Normal / Fast (p.readSpeed). Drives the typewriter, the minimum holds on decorative text, and the test auto-tap flag.
import { me, store, touch } from './store.js';
import { el } from './util.js';
export const SPEEDS = { slow: { cps: 12, hold: 1.6, label: 'Slow' }, normal: { cps: 20, hold: 1, label: 'Normal' }, fast: { cps: 35, hold: .8, label: 'Fast' } };
export const readSpeed = () => { const p = me(); return p && SPEEDS[p.readSpeed] ? p.readSpeed : 'normal'; };
export const readCps = () => SPEEDS[readSpeed()].cps;
// decorative text (no story content) may time out: max(3 s, words / 2 + 1.5 s), scaled by the speed
export const decorHold = text => Math.max(3000, ((String(text).split(/\s+/).length / 2) + 1.5) * 1000) * SPEEDS[readSpeed()].hold;
// headless tests and screenshots: ?autotap=1 (or window.__autoTap) taps through content captions after they finish typing
export const autoTap = () => !!(window.__autoTap || /[?&]autotap=1/.test(location.search));
export function setReadSpeed(v, touch) { const p = me(); if (!p || !SPEEDS[v]) return; p.readSpeed = v; touch && touch(); }

// Slow / Normal / Fast buttons. onPick(v) is called after the choice is applied; with no player yet (first-time creation) it only reports the choice.
export function speedPicker(onPick, current) {
  let cur = current || readSpeed(); const wrap = el('div', { class: 'speedpick' }), btns = {};
  for (const k of ['slow', 'normal', 'fast']) {
    btns[k] = el('button', { class: 'btn small' + (k === cur ? ' on' : ''), text: SPEEDS[k].label, type: 'button', onclick: e => {
      e.stopPropagation(); cur = k; for (const j in btns) btns[j].classList.toggle('on', j === k);
      if (me()) { me().readSpeed = k; touch(store.me); } onPick && onPick(k);
    } });
    wrap.append(btns[k]);
  }
  return wrap;
}
