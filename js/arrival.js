// The arrival card: one screen when you reach a building whose stamp you have not got yet. The place name slams in, the host's manga
// portrait slides in with their name band and hello line, and the "look for" close-up sits beside them. Two buttons: Start the story, or Not now.
// No waiting: everything is on screen at once, and the comic loads behind the card.
import { el } from './util.js';
import { sfx, playClip, stopClip, hasClip, clipUrl } from './audio.js';

let ep = null;
const epithets = async () => { if (!ep) { try { ep = await (await fetch('data/epithets.json')).json(); } catch (e) { ep = {}; } } return ep; };
export const portraitSrc = host => host ? `art/web/portraits/${host}_neutral.jpeg` : null;
const fallback = host => `art/portraits/${host}_neutral.jpeg`;

// resolves 'go' or 'later'
export async function arrivalCard(st) {
  if (navigator.webdriver && !window.__showArrival) return 'go';   // automated tests click straight through
  const E = await epithets(), nm = (st.host && E[st.host]) || [st.host || '', ''];
  return new Promise(res => {
    let done = false;
    const finish = v => { if (done) return; done = true; stopClip(); card.classList.add('out'); setTimeout(() => card.remove(), 260); res(v); };
    const img = st.host ? el('img', { class: 'ar-port', src: portraitSrc(st.host), alt: '' }) : null;
    if (img) img.onerror = () => { if (!img.dataset.f) { img.dataset.f = 1; img.src = fallback(st.host); } else img.remove(); };
    const go = el('button', { class: 'ar-go', text: '▶  Start the story', onclick: e => { e.stopPropagation(); sfx.tap(); finish('go'); } });
    const later = el('button', { class: 'ar-later', text: 'Not now', onclick: e => { e.stopPropagation(); sfx.tap(); finish('later'); } });
    const card = el('div', { id: 'arrival' },
      el('div', { class: 'ar-burst' }),
      el('div', { class: 'ar-top' }, el('div', { class: 'ar-kicker', text: 'You have arrived at' }), el('div', { class: 'ar-place' + (st.name.length > 16 ? ' long' : ''), text: st.name }), st.sub ? el('div', { class: 'ar-sub', text: st.sub }) : null),
      el('div', { class: 'ar-body' },
        el('div', { class: 'ar-host' }, img, el('div', { class: 'ar-band' }, el('b', { text: nm[0] }), el('small', { text: nm[1] }))),
        el('div', { class: 'ar-right' },
          st.hello && st.hello !== '...' ? el('div', { class: 'ar-say', text: '“' + st.hello + '”' }) : el('div', { class: 'ar-say', text: '(He says nothing. Evzones on guard never speak.)' }),
          st.feature ? el('div', { class: 'ar-look' }, st.image ? el('img', { src: st.image, alt: '' }) : null, el('p', {}, el('b', { text: 'Look for: ' }), st.feature)) : null,
          el('div', { class: 'ar-btns' }, go, later))));
    card.addEventListener('pointerdown', e => e.stopPropagation());
    const tc = document.getElementById('titlecard'); if (tc) tc.classList.add('out');   // the card carries the place name itself
    document.body.append(card); void card.offsetWidth; card.classList.add('in');
    sfx.whoosh && sfx.whoosh(); setTimeout(() => sfx.flourish && sfx.flourish(), 250);
    if (st.host && hasClip(`intro-${st.host}-1`)) playClip(clipUrl(`intro-${st.host}-1`));
    card._finish = finish; window.__arrival = card;
  });
}
