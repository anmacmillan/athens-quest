// DOM interface on top of the canvas: HUD, prompts, quiz, Book, Map, scoreboard, player picker, costume maker.
import { el, $, FLAGS, speakerName, shuffle, clamp, dist } from './util.js';
import { store, me, addPlayer, selectPlayer, award, setSeen, badgeCount, setFamily, onChange, touch } from './store.js';
import { SKINS, HAIRS, CHITONS, BOWS, STYLES, DEFAULT_COSTUME, previewCanvas, unlocks } from './player.js';
import { sfx, sound, unlock } from './audio.js';
import { openSoundPanel } from './soundpanel.js';
import { IM, M } from './render.js';
import { CONFIG } from './config.js';
import { earnOwls, REWARDS } from './economy.js';
import { trackerEl } from './theseus.js';
import { giftView } from './passport.js';

let G = null, overlayEl = null, skipFn = null, toastT = 0, compassOn = false;
const icon = n => el('img', { src: M['icon_' + n].f, class: 'ico', alt: '' });
export const isOpen = () => !!overlayEl;

export function init(game) {
  G = game;
  const bind = (id, fn) => $(id).addEventListener('click', e => { unlock(); sfx.tap(); fn(e); });
  bind('bBook', () => bookScreen()); bind('bMap', () => mapScreen()); bind('bBoard', () => boardScreen());
  bind('bSound', () => openSoundPanel(open, refresh));
  $('btnA').addEventListener('pointerdown', e => { e.preventDefault(); unlock(); G.onA(); });
  $('compass').addEventListener('click', () => enableCompass());
  $('skip').addEventListener('click', () => skipFn && skipFn());
  $('bBook').prepend(icon('book')); $('bMap').prepend(icon('map')); $('bBoard').prepend(icon('trophy'));
  $('btnA').append(el('img', { src: M.btn_a.f, alt: 'A' }));
  $('cnt').before(el('img', { src: 'art/ui/passport.png', class: 'coin pass', alt: 'Passport', onerror: e => { e.target.src = M.coin.f; } }));
  $('counter').addEventListener('click', () => { unlock(); sfx.tap(); G.passport && G.passport.open(); }); $('counter').style.cursor = 'pointer';
  onChange(refresh); refresh();
}
export function refresh() {
  if (!G) return; const p = me(), total = G.stories.length, n = p ? G.stories.filter(s => p.badges[s.id]).length : 0;
  const pp = G.passport && G.passport.stamps ? G.passport.progress('athens') : null;
  $('cnt').textContent = pp ? `${pp.n} / ${pp.total}` : `${n} / ${total}`;
  const snd = $('bSound'); snd.textContent = ''; snd.append(icon(sound.on ? 'sound' : 'mute'));
  $('sync').className = 'sync ' + store.status; $('sync').title = { online: 'Saved online', local: 'Saved on this iPad', offline: 'Offline: will sync later', refused: 'Saved on this iPad only' }[store.status];
  $('who').textContent = p ? p.name : '';
}
export function hud(on) { document.body.classList.toggle('nohud', !on); }
export function setPrompt(n) {
  const pr = $('prompt'); if (!n) { pr.classList.add('hidden'); $('btnA').classList.remove('ready'); return; }
  const spot = n.kind === 'spot';
  pr.textContent = spot ? n.ref.story.title : n.ref.label; pr.style.setProperty('--flag', spot ? FLAGS[n.ref.story.flag].color : '#8a5fd0'); pr.classList.remove('hidden'); $('btnA').classList.add('ready'); sfx.tap();
}
export function toast(msg, ms = 2400) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
export function showSkip(fn) { skipFn = fn; $('skip').classList.remove('hidden'); }
export function hideSkip() { skipFn = null; $('skip').classList.add('hidden'); }

// ------------------------------------------------------------ overlay helper
function open(title, body, opts = {}) {
  closeOverlay();
  const close = el('button', { class: 'btn small close', onclick: () => { sfx.tap(); closeOverlay(); opts.onClose && opts.onClose(); }, 'aria-label': 'Close' }, icon('close'));
  overlayEl = el('div', { class: 'overlay' }, el('div', { class: 'panel big ' + (opts.cls || '') }, opts.noClose ? null : close, title ? el('h2', { text: title }) : null, body));
  document.body.append(overlayEl); G.mode = 'ui'; hud(false); G.nearest = null;
  return overlayEl;
}
export { open as openOverlay };
const theseusTracker = () => trackerEl();
export function closeOverlay() { if (overlayEl) { overlayEl.remove(); overlayEl = null; } if (G) { G.mode = 'play'; if (!G.busy) hud(true); } }   // mode always returns to play (busy still gates movement), so no flow can leave the girl frozen
export function button(label, fn, cls = '') { return btn(label, fn, cls); }
const btn = (label, fn, cls = '') => el('button', { class: 'btn ' + cls, text: label, onclick: e => { unlock(); sfx.tap(); fn(e); } });
const flagChip = f => el('span', { class: 'chip', style: `--c:${FLAGS[f].color}`, text: FLAGS[f].name });

// ------------------------------------------------------------ who is playing / costume maker
export function whoScreen() {
  const list = el('div', { class: 'players' });
  for (const id in store.players) {
    const p = store.players[id];
    list.append(el('button', { class: 'pcard', onclick: () => { unlock(); selectPlayer(id); closeOverlay(); G.afterPick && G.afterPick(); } }, previewCanvas(p.costume, unlocksFor(p), 4), el('b', { text: p.name }), el('small', { text: `${badgeCount(p)} badges` })));
  }
  list.append(el('button', { class: 'pcard add', onclick: () => { unlock(); costumeScreen(); } }, el('span', { class: 'plus', text: '+' }), el('b', { text: 'New player' })));
  const fam = el('p', { class: 'fam' }, 'Family code: ', el('b', { text: store.family }), ' ', el('a', { href: '#', text: 'change', onclick: e => { e.preventDefault(); const c = prompt('Family code (6 to 12 letters or numbers)', store.family); if (c && setFamily(c)) { whoScreen(); } } }));
  open("Who's playing?", el('div', {}, list, fam), { noClose: !Object.keys(store.players).length || true, cls: 'who' });
}
// scoreboard / picker thumbnail: the manga portrait of the player's base character beside the pixel sprite
function thumbBox(p) {
  const box = el('div', { class: 'thumbbox' });
  const style = (p.costume && p.costume.style) || 'red';
  import('./avatar_core.js').then(m => { const l = m.normalizeCostume(p.costume); box.prepend(el('img', { class: 'tport', src: m.portraitUrl(l.style), alt: '', onerror: e => e.target.remove() })); });
  box.append(previewCanvas(p.costume, unlocksFor(p), 3));
  return box;
}
function unlocksFor(p) { const n = G.stories.filter(s => p.badges[s.id]).length, core = G.mainStories(); return unlocks(n, core.length && core.every(s => p.badges[s.id])); }
export function costumeScreen() {
  import('./wardrobe.js').then(m => m.openWardrobe({ first: true })); return;   // the wardrobe replaces the old 2D maker below
  const c = Object.assign({}, DEFAULT_COSTUME); let name = '';
  const pv = el('div', { class: 'pvbox' }), nameIn = el('input', { type: 'text', maxlength: 14, placeholder: 'Your name', autocomplete: 'off', oninput: e => { name = e.target.value.trim(); go.disabled = !name; } });
  const redraw = () => { pv.replaceChildren(previewCanvas(c, {}, 8)); };
  const swatches = (key, arr) => el('div', { class: 'sw' }, arr.map((col, i) => el('button', { class: 'swatch' + (c[key] === i ? ' on' : ''), style: `background:${col}`, 'aria-label': col, onclick: e => { c[key] = i; e.target.parentNode.querySelectorAll('.swatch').forEach((b, j) => b.classList.toggle('on', j === i)); redraw(); sfx.tap(); } })));
  const styles = el('div', { class: 'sw' }, STYLES.map(([k, label]) => el('button', { class: 'btn small' + (c.style === k ? ' on' : ''), text: label, onclick: e => { c.style = k; e.target.parentNode.querySelectorAll('.btn').forEach(b => b.classList.toggle('on', b === e.target)); redraw(); sfx.tap(); } })));
  const go = btn('Start', () => { if (!name) return; addPlayer(name, Object.assign({}, c)); closeOverlay(); G.afterPick && G.afterPick(); }, 'go'); go.disabled = true;
  const body = el('div', { class: 'maker' }, pv, el('div', { class: 'opts' }, nameIn,
    el('label', { text: 'Skin' }), swatches('skin', SKINS), el('label', { text: 'Hair colour' }), swatches('hair', HAIRS), el('label', { text: 'Hair style' }), styles,
    el('label', { text: 'Chiton (dress)' }), swatches('chiton', CHITONS), el('label', { text: 'Bow' }), swatches('bow', BOWS), go));
  redraw(); open('Make your explorer', body, { noClose: true });
}

// ------------------------------------------------------------ quiz
export function quiz(story) {
  return new Promise(resolve => {
    const opts = shuffle(story.opts.map((t, i) => ({ t, ok: i === 0 })));
    const msg = el('p', { class: 'qmsg', text: 'Glauka asks:' });
    const list = el('div', { class: 'opts q' }), done = { v: false }; let wrongs = 0;
    opts.forEach(o => {
      const b = el('button', { class: 'btn opt', text: o.t, onclick: () => {
        if (done.v) return; unlock();
        if (o.ok) { done.v = true; b.classList.add('right'); sfx.correct(); msg.textContent = 'Yes! Hoot hoot!'; setTimeout(() => { closeOverlayKeep(); resolve(wrongs ? true : 'first'); }, 900); }
        else { wrongs++; b.classList.add('wrong'); b.disabled = true; sfx.wrong(); msg.textContent = 'Not quite, hoot. Try again?'; }
      } }); list.append(b);
    });
    open(null, el('div', { class: 'quiz' }, el('div', { class: 'qhead' }, flagChip(story.flag), el('b', { text: story.title })), el('h3', { text: story.q }), msg, list), { noClose: true, cls: 'qpanel' });
  });
}
function closeOverlayKeep() { if (overlayEl) { overlayEl.remove(); overlayEl = null; } }
export function earned(story, G_, gift) {
  return new Promise(resolve => {
    const p = me(), n = badgeCount(p), msgs = [];
    const core = G.mainStories(), all = core.every(s => p.badges[s.id]);
    const stories = G.stories.filter(s => p.badges[s.id]).length;
    if (stories === 5) msgs.push('New costume piece: the laurel wreath!'); if (stories === 10) msgs.push('New costume piece: the owl-feather cape!'); if (all) msgs.push("Main Quest complete! New costume piece: Athena's helmet!");
    const coin = el('img', { src: M.coin.f, class: 'bigcoin', alt: '' });
    const body = el('div', { class: 'earned' }, coin, el('h2', { text: 'Owl coin!' }), el('p', { text: `${story.title}: badge earned. +€${CONFIG.EURO_PER_STORY}` }), ...giftView(gift), ...msgs.map(m => el('p', { class: 'unlock', text: m })),
      btn('Hoot!', () => { closeOverlayKeep(); resolve(); }, 'go'));
    open(null, body, { noClose: true, cls: 'earnedp' }); sfx.win(); refresh();
  });
}

// ------------------------------------------------------------ Book
const cleanArea = a => a.replace(/\s*\(.*?\)/g, '').trim();
export function bookScreen(focusId) {
  const p = me(), groups = {}, order = [];
  const main = G.stories.filter(s => s.main), side = G.stories.filter(s => !s.main);
  for (const s of side) { const z = s.pos.zone && s.pos.zone !== 'athens' ? (G.worlds[s.pos.zone] && G.worlds[s.pos.zone].label) || s.pos.zone : ''; const k = (z && z !== cleanArea(s.area) ? z + ': ' : '') + cleanArea(s.area); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(s); }
  const legend = el('div', { class: 'legend' }, Object.keys(FLAGS).map(f => flagChip(f)));
  const detail = el('div', { class: 'detail' });
  const grid = el('div', { class: 'book' });
  const show = s => {
    const got = !!p.badges[s.id], seen = !!p.seen[s.id];
    detail.replaceChildren(el('h3', { text: s.title }), el('div', {}, flagChip(s.flag), ' ', el('small', { text: s.area + (s.main ? ' · Main Quest' : '') })),
      el('p', { class: 'mission' }, el('b', { text: 'In real Athens: ' }), s.mission),
      el('label', { class: 'tick' }, el('input', { type: 'checkbox', checked: seen ? 'checked' : null, onchange: e => { setSeen(s.id, e.target.checked); sfx.coin(); if (e.target.checked && !p.stickers['seen:' + s.id]) { p.stickers['seen:' + s.id] = Date.now(); touch(store.me); earnOwls(REWARDS.seen, 'seen in Athens'); } } }), ' Seen in Athens'),
      el('div', { class: 'row' }, got ? btn('Play it again', () => { const sp = G.spotById(s.id); closeOverlay(); G.goTo(sp); G.playStory(sp, { replay: true }); }) : null,
        btn('Point my compass here', () => { G.target = G.spotById(s.id); toast('Compass set: ' + s.title); closeOverlay(); })));
    detail.scrollIntoView && detail.scrollIntoView({ block: 'nearest' });
  };
  const cellsFor = list => { const row = el('div', { class: 'cells' }); for (const s of list) { const got = !!p.badges[s.id];
    row.append(el('button', { class: 'cell' + (got ? ' got' : ''), onclick: () => show(s) }, el('img', { src: M[got ? 'coin' : 'coin_grey'].f, alt: '' }), el('span', { class: 'dot', style: `background:${FLAGS[s.flag].color}` }), el('small', { text: got ? s.title : '???' }), p.seen[s.id] ? el('i', { class: 'seen', text: 'seen' }) : null)); } return row; };
  if (main.length) {
    const n = main.filter(s => p.badges[s.id]).length;
    grid.append(el('h4', { text: 'Main Quest' }), el('div', { class: 'prog', title: `${n} of ${main.length}` }, el('div', { class: 'bar', style: `width:${Math.round(n / main.length * 100)}%` }), el('span', { text: `${n} / ${main.length}` })), cellsFor(main));
    if (side.length) grid.append(el('h3', { class: 'sidehead', text: 'Side quests' }));
  }
  for (const k of order) { grid.append(el('h4', { text: k }), cellsFor(groups[k])); }
  const trails = Object.keys(p.badges).filter(k => k.startsWith('trail:'));
  const fx = window.__extras, fbtn = fx && fx.ready ? el('div', { class: 'row' }, btn(`Feathers ${fx.count()}/${fx.feathers.length}`, () => fx.featherPage())) : null;
  open('Badge book', el('div', { class: 'bookwrap' }, legend, theseusTracker(), fbtn, trails.length ? el('p', { class: 'trails', text: 'Trail badges: ' + trails.map(t => t.slice(6)).join(', ') }) : null, grid, detail));
  if (focusId) { const s = G.stories.find(x => x.id === focusId); s && show(s); }
}

// ------------------------------------------------------------ Map
export function mapScreen() {
  const W = G.world, p = me(), cvs = el('canvas', { class: 'mapcv' });
  const img = W.kind === 'map' ? IM.greece : W.kind === 'stage' ? IM['stage_' + W.id] : IM['ov_' + W.id];
  const row = el('div', { class: 'row' });
  if (W.id !== 'greece') row.append(btn('Where am I in Greece?', () => { closeOverlay(); G.flyTo('greece'); }, 'go'));
  else row.append(btn('Back to Athens', () => { closeOverlay(); G.flyTo('athens'); }, 'go'));
  if (W.kind === 'live') row.append(btn('You are here', () => locate()));
  const hint = el('p', { class: 'hint', text: W.id === 'greece' ? 'Tap a sign to sail there. Tap the sea to steer.' : 'Gold needle: the nearest flag. Tap a signpost to travel. The red dot is you.' });
  open(W.label || 'Map', el('div', { class: 'mapwrap' }, cvs, row, hint));
  let hits = [];
  const draw = () => {
    if (!img) return; const w = cvs.parentNode.clientWidth || 600;
    const sc = Math.min(w / W.w, (innerHeight * .58) / W.h), cw = Math.floor(W.w * sc), ch = Math.floor(W.h * sc);
    cvs.width = cw; cvs.height = ch; const k = cvs.getContext('2d'); k.imageSmoothingEnabled = W.kind === 'live';
    if (W.kind === 'map' || W.water) { k.fillStyle = '#3a86c8'; k.fillRect(0, 0, cw, ch); } else { k.fillStyle = '#b8bb74'; k.fillRect(0, 0, cw, ch); }
    k.drawImage(img, 0, 0, cw, ch); hits = [];
    const f = sc;
    for (const s of G.spots) if (s.world === W.id) {
      const x = s.x * f, y = s.y * f, got = p.badges[s.id];
      const unk = W.kind === 'live' && G.fly && !G.fly.known(s);   // undiscovered side spots show as '?'
      k.fillStyle = '#3a2c4c'; k.beginPath(); k.arc(x, y, s.main ? 8 : 6.5, 0, 7); k.fill(); k.fillStyle = unk ? '#8d8798' : FLAGS[s.story.flag].color; k.beginPath(); k.arc(x, y, s.main ? 6.5 : 5, 0, 7); k.fill();
      if (unk) { k.fillStyle = '#2a1f3a'; k.font = 'bold 10px sans-serif'; k.textAlign = 'center'; k.fillText('?', x, y + 3.5); }
      if (got) k.drawImage(IM.coin, x - 9, y - 22, 18, 16);
      if (W.kind === 'live') hits.push({ x, y, spot: s, r: 12 });
    }
    for (const s of W.signposts) {
      const x = s.x * f, y = s.y * f; k.drawImage(IM.sign, x - 12, y - 24, 24, 30);
      k.font = '700 13px ui-rounded, system-ui'; k.textAlign = 'center'; k.lineWidth = 4; k.strokeStyle = '#3a2c4c'; k.strokeText(s.label, x, y - 28); k.fillStyle = '#fff4d6'; k.fillText(s.label, x, y - 28);
      hits.push({ x, y: y - 10, s });
    }
    const pl = G.player; k.fillStyle = '#fff'; k.beginPath(); k.arc(pl.x * f, pl.y * f, 8, 0, 7); k.fill(); k.fillStyle = '#e5484d'; k.beginPath(); k.arc(pl.x * f, pl.y * f, 5.5, 0, 7); k.fill();
    if (G.gps && G.gps.world === W.id) { k.fillStyle = '#3d7fd6'; k.beginPath(); k.arc(G.gps.x * f, G.gps.y * f, 6, 0, 7); k.fill(); k.strokeStyle = '#fff'; k.lineWidth = 2; k.stroke(); }
  };
  cvs.addEventListener('click', e => { const r = cvs.getBoundingClientRect(), x = (e.clientX - r.left) * cvs.width / r.width, y = (e.clientY - r.top) * cvs.height / r.height; const h = hits.find(h => Math.hypot(h.x - x, h.y - y) < (h.r || 26)); if (h && h.spot) { G.fly.showCard({ kind: 'spot', ref: h.spot }, true); return; } if (h) { sfx.tap(); closeOverlay(); G.flyTo(h.s.to, h.s); } });
  draw(); window.__mapRedraw = draw;
}
function locate() {
  if (!navigator.geolocation) { toast('No location on this device.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const A = G.world.kind === 'live' ? G.world : G.worlds.athens, q = A.project(pos.coords.latitude, pos.coords.longitude);
    if (q.x < 0 || q.y < 0 || q.x > A.w || q.y > A.h) { toast('You are not in the Athens map area yet.'); return; }
    G.gps = { world: A.id, x: q.x, y: q.y }; let best = null, bd = 1e9; for (const s of G.spots) if (s.world === A.id && !G.collected(s.id)) { const d = dist(q.x, q.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
    if (best) { G.target = best; toast(`Nearest flag: ${best.story.title} (about ${Math.round(bd * A.mpp)} m)`); }
    window.__mapRedraw && window.__mapRedraw();
  }, () => toast('Location was not allowed.'), { enableHighAccuracy: true, timeout: 8000 });
}

// ------------------------------------------------------------ scoreboard
export function boardScreen() {
  const cards = el('div', { class: 'board' });
  const ids = Object.keys(store.players).sort((a, b) => badgeCount(store.players[b]) - badgeCount(store.players[a]));
  for (const id of ids) {
    const p = store.players[id], latest = Object.entries(p.badges).filter(([k]) => !k.startsWith('trail:')).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const title = k => (G.stories.find(s => s.id === k) || { title: k }).title;
    cards.append(el('div', { class: 'bcard' + (id === store.me ? ' me' : '') }, thumbBox(p), el('div', { class: 'binfo' }, el('b', { class: 'bname', text: p.name }),
      el('span', { class: 'bn' }, el('img', { src: M.coin.f, class: 'coin', alt: '' }), ` ${G.stories.filter(s => p.badges[s.id]).length} / ${G.stories.length}`),
      el('small', { text: latest.length ? 'Latest: ' + latest.map(([k]) => title(k)).join(', ') : 'No badges yet' }),
      id !== store.me ? btn('Play as ' + p.name, () => { selectPlayer(id); closeOverlay(); refresh(); G.afterPick && G.afterPick(); }, 'small') : el('small', { class: 'cur', text: 'Playing now' }))));
  }
  const status = { online: 'Saved online.', local: 'Saved on this iPad.', offline: 'Offline: will sync later.', refused: 'Saved on this iPad only (the online scoreboard is not switched on yet).' }[store.status];
  open('Scoreboard', el('div', {}, cards, el('div', { class: 'row' }, btn('New player', () => costumeScreen(), 'small'), btn('Switch player', () => whoScreen(), 'small'), btn('Replay intro', () => { closeOverlay(); G.opening.play({ replay: true }); }, 'small')),
    el('p', { class: 'fam' }, status, ' Family code ', el('b', { text: store.family }))));
}

// ------------------------------------------------------------ compass
async function enableCompass() {
  unlock();
  if (compassOn) { toast('Compass is on. Turn around!'); return; }
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Compass was not allowed.'); return; } }
    const on = e => { const h = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (h != null && !isNaN(h)) G.heading = h; };
    addEventListener('deviceorientation', on, true); addEventListener('deviceorientationabsolute', on, true); compassOn = true; toast('Compass on: it turns with your iPad.');
  } catch (e) { toast('No compass on this device.'); }
}
const cc = $('compass'), ck = cc && cc.getContext('2d');
function drawCompass() {
  const S = 31, c = S / 2 | 0; ck.imageSmoothingEnabled = false; ck.clearRect(0, 0, S, S);
  const hd = (G.heading || 0) * Math.PI / 180;
  ck.save(); ck.translate(c + .5, c + .5);
  ck.fillStyle = '#8b5e3c'; ck.beginPath(); ck.arc(0, 0, 15, 0, 7); ck.fill(); ck.fillStyle = '#f3e6c4'; ck.beginPath(); ck.arc(0, 0, 13, 0, 7); ck.fill();
  ck.save(); ck.rotate(-hd);
  ck.fillStyle = '#5b3a29'; for (const a of [0, 90, 180, 270]) { ck.save(); ck.rotate(a * Math.PI / 180); ck.fillRect(-1, -12, 2, 3); ck.restore(); }
  ck.fillStyle = '#e5484d'; ck.fillRect(-1, -12, 2, 3); ck.fillStyle = '#5b3a29'; ck.fillRect(-2, -9, 1, 1); ck.fillRect(1, -9, 1, 1);
  let th = 0; const t = G.compassTarget(); if (t) { const dx = t.x - G.player.x, dy = t.y - G.player.y; th = Math.atan2(dx, -dy); }
  ck.rotate(th); ck.fillStyle = '#f5c542'; ck.strokeStyle = '#9a6a14'; ck.beginPath(); ck.moveTo(0, -10); ck.lineTo(3, 0); ck.lineTo(-3, 0); ck.closePath(); ck.fill(); ck.stroke();
  ck.fillStyle = '#6b5a52'; ck.beginPath(); ck.moveTo(0, 8); ck.lineTo(3, 0); ck.lineTo(-3, 0); ck.closePath(); ck.fill();
  ck.restore(); ck.restore();
}
let ct = 0;
export function tick(dt) { ct += dt; if (ct > .08 && cc && !document.body.classList.contains('nohud')) { ct = 0; drawCompass(); } }
