// Mini-games, data-driven from data/minigames.json. Type "riddle": a full-screen still, the riddle lettered (and narrated if audio/minigames/<id>.mp3 exists),
// four options plus a free-text box. Wrong answers shake the screen and the monster leans closer; after `tries` wrong answers a hint appears; the right answer
// plays the impact frame. Resolves {solved, tries}.
import { el, clamp } from './util.js';
import { sfx, hasClip, clipUrl, clipInfo, playClip, stopClip, unlock, music } from './audio.js';
import { aiAssets, stillList } from './scene.js';
import { playMaze } from './minigame_maze.js';
import { store } from './store.js';
import { readCps } from './reading.js';

let defs = null;
export async function loadMinigames() { if (defs) return defs; try { defs = await (await fetch('data/minigames.json')).json(); } catch (e) { defs = {}; } return defs; }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// code-drawn fallback when art/stills_ai/<still> has not arrived: a sphinx silhouette on her rock at dusk
function fallbackArt() {
  const c = document.createElement('canvas'); c.width = 800; c.height = 450; const k = c.getContext('2d');
  const g = k.createLinearGradient(0, 0, 0, 450); g.addColorStop(0, '#2a1b4a'); g.addColorStop(.6, '#c8655a'); g.addColorStop(1, '#f0a060'); k.fillStyle = g; k.fillRect(0, 0, 800, 450);
  k.fillStyle = '#f5e6b0'; k.beginPath(); k.arc(620, 90, 38, 0, 7); k.fill();
  k.fillStyle = '#4a3040'; k.beginPath(); k.moveTo(0, 450); k.lineTo(0, 360); k.lineTo(180, 330); k.lineTo(330, 300); k.lineTo(560, 310); k.lineTo(800, 360); k.lineTo(800, 450); k.fill();
  k.fillStyle = '#1b1020'; k.beginPath(); k.ellipse(430, 270, 130, 50, 0, 0, 7); k.fill(); k.beginPath(); k.ellipse(330, 300, 60, 40, 0, 0, 7); k.fill();   // body and paws
  k.beginPath(); k.ellipse(330, 200, 40, 50, 0, 0, 7); k.fill(); k.fillRect(300, 210, 60, 70);                                                   // head and neck
  k.beginPath(); k.moveTo(300, 190); k.lineTo(270, 270); k.lineTo(300, 260); k.fill(); k.beginPath(); k.moveTo(360, 190); k.lineTo(390, 270); k.lineTo(360, 260); k.fill();
  k.fillStyle = '#6a4a6a'; k.beginPath(); k.moveTo(480, 240); k.quadraticCurveTo(560, 140, 600, 120); k.quadraticCurveTo(590, 200, 520, 270); k.fill();   // wing
  k.fillStyle = '#ffd45a'; k.fillRect(318, 196, 8, 6); k.fillRect(338, 196, 8, 6);
  return c.toDataURL();
}
function stillUrl(id) {
  if (aiAssets[id]) return aiAssets[id];
  for (const ext of ['.jpg', '.png']) if (stillList.has('art/stills/' + id + ext)) return 'art/stills/' + id + ext;
  return null;
}

export async function playMinigame(id, def, game, story) {
  const rel = music.hold('minigame'); try { return await playMinigameInner(id, def, game, story); } finally { rel(); }
}
function playMinigameInner(id, def, game, story) {
  const t = def.type || 'riddle';
  if (t === 'maze') return playMaze(def, game, story);
  if (t === 'questions') return playQuestions(def); if (t === 'circle') return playCircle(def, id); if (t === 'drop') return playDrop(def);
  return playRiddle(id, def, game, story);
}
// ---- shared shell: dark full-screen panel with the character's portrait (or sprite) and a speech box
const best = id => { try { return JSON.parse(localStorage.getItem('owlq.best.' + (store.me || '') + '.' + id)) || 0; } catch (e) { return 0; } };
const setBest = (id, v) => { try { localStorage.setItem('owlq.best.' + (store.me || '') + '.' + id, JSON.stringify(v)); } catch (e) { } };
function avatar(speaker) {
  const url = [speaker + '_neutral', speaker].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
  return el('img', { class: 'mav' + (url ? '' : ' pix'), src: url || `art/c_${speaker}_0.png`, draggable: 'false' });
}
function shell(def) {
  const root = el('div', { class: 'mini plain' }), head = el('div', { class: 'mhead' }), say = el('div', { class: 'msay panel' }), body = el('div', { class: 'mbody' });
  head.append(avatar(def.speaker), say); root.append(el('div', { class: 'mtitle', text: def.title || '' }), head, body); document.body.append(root); sfx.pop();
  const type = (txt) => new Promise(r => { say.textContent = ''; let n = 0; clearInterval(root._ti); root._ti = setInterval(() => { n++; say.textContent = txt.slice(0, n); if (n % 3 === 0) sfx.blip(); if (n >= txt.length) { clearInterval(root._ti); r(); } }, Math.round(1000 / readCps())); });
  const close = (v) => { root.classList.add('out'); setTimeout(() => root.remove(), 250); return v; };
  return { root, body, say, type, close };
}
const btn = (text, fn) => el('button', { class: 'btn small mopt', text, onclick: e => { e.stopPropagation(); fn(); } });

async function playQuestions(def) {
  unlock(); const S = shell(def);
  await S.type(def.intro); await new Promise(r => setTimeout(r, 500));
  for (const rd of def.rounds) {
    S.body.textContent = ''; await S.type(rd.q);
    const i = await new Promise(res => { const row = el('div', { class: 'mopts col' }); rd.options.forEach((o, k) => row.append(btn(o, () => res(k)))); S.body.append(row); });
    S.body.textContent = ''; await S.type(rd.follow[i]); await new Promise(res => { S.body.append(btn('Hmm...', res)); });
  }
  S.body.textContent = ''; await S.type(def.end); sfx.win();
  await new Promise(res => S.body.append(el('button', { class: 'btn mdone', text: 'Onwards', onclick: res })));
  return S.close({ solved: true });
}

async function playCircle(def, id) {
  unlock(); const S = shell(def); let top = best(id);
  const cv = el('canvas', { class: 'mdraw' }), info = el('div', { class: 'mmsg' }), row = el('div', { class: 'mopts' });
  const fit = () => { const w = Math.min(innerWidth - 28, innerHeight - 260, 520); cv.width = cv.height = Math.max(240, w); cv.style.width = cv.style.height = cv.width + 'px'; };
  fit(); S.body.append(cv, info, row); await S.type(def.intro);
  const k = cv.getContext('2d'); let pts = [], down = false, result = null;
  const redraw = () => {
    k.clearRect(0, 0, cv.width, cv.height); k.fillStyle = '#e8d6a0'; k.fillRect(0, 0, cv.width, cv.height);
    k.strokeStyle = 'rgba(120,90,50,.18)'; k.lineWidth = 1; for (let i = 0; i < 60; i++) { k.beginPath(); k.moveTo(0, i * 9 + 4); k.lineTo(cv.width, i * 9 + 4); k.stroke(); }
    if (result && result.ok) { k.setLineDash([8, 6]); k.strokeStyle = '#e8a010'; k.lineWidth = 4; k.beginPath(); k.arc(result.cx, result.cy, result.r, 0, 7); k.stroke(); k.setLineDash([]); }
    k.strokeStyle = '#5b3a29'; k.lineWidth = 5; k.lineCap = k.lineJoin = 'round'; k.beginPath(); pts.forEach((p, i) => i ? k.lineTo(p.x, p.y) : k.moveTo(p.x, p.y)); k.stroke();
  };
  redraw();
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; };
  cv.addEventListener('pointerdown', e => { if (result) return; cv.setPointerCapture(e.pointerId); down = true; pts = [pos(e)]; redraw(); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!down) return; pts.push(pos(e)); redraw(); });
  const up = () => { if (!down) return; down = false; if (pts.length) finish(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.style.touchAction = 'none';
  function finish() {
    result = scoreCircle(pts);
    if (!result.ok) { info.textContent = def.low; sfx.wrong(); result = null; pts = []; setTimeout(redraw, 700); return; }
    redraw(); const sc = result.score; const isBest = sc > top; if (isBest) { top = sc; setBest(id, sc); }
    info.textContent = `${sc.toFixed(1)}% perfect${isBest ? '  (your best!)' : `  (best ${top.toFixed(1)}%)`}`; sfx.win(); S.type(sc >= 97 ? def.verdictHigh : def.verdict);
    row.textContent = ''; row.append(btn('Try again', () => { result = null; pts = []; info.textContent = ''; row.textContent = ''; redraw(); }), btn('Done', () => res(S.close({ solved: true, score: sc }))));
  }
  let res; return new Promise(r => { res = r; });
}
// circularity from the drawn stroke: radius spread about the centroid, and how far the ends miss each other
export function scoreCircle(pts) {
  if (pts.length < 12) return { ok: false };
  const n = pts.length, cx = pts.reduce((a, p) => a + p.x, 0) / n, cy = pts.reduce((a, p) => a + p.y, 0) / n;
  const rs = pts.map(p => Math.hypot(p.x - cx, p.y - cy)), r = rs.reduce((a, b) => a + b, 0) / n; if (r < 25) return { ok: false };
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - r) * (b - r), 0) / n), gap = Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) / (2 * Math.PI * r);
  const bins = new Set(pts.map(p => Math.floor((Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (Math.PI / 12)))); if (bins.size < 21) return { ok: false };
  const score = Math.max(0, Math.min(99.9, 100 * (1 - (sd / r) * 2.2 - gap * .6)));
  return { ok: true, score, cx, cy, r };
}

async function playDrop(def) {
  unlock(); const S = shell(def); const cv = el('canvas', { class: 'mdraw wide' }), row = el('div', { class: 'mopts col' }), info = el('div', { class: 'mmsg' });
  cv.width = 480; cv.height = 300; cv.style.width = 'min(480px, 94vw)'; cv.style.height = 'auto'; S.body.append(cv, info, row); const k = cv.getContext('2d'); k.imageSmoothingEnabled = false;
  const scene = (y1, y2, land) => {
    const g = k.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#8ccbf0'); g.addColorStop(1, '#e8f4ff'); k.fillStyle = g; k.fillRect(0, 0, 480, 300);
    k.fillStyle = '#b8bb74'; k.fillRect(0, 262, 480, 38); k.fillStyle = '#a9ad66'; for (let i = 0; i < 40; i++) k.fillRect((i * 37) % 480, 266 + (i * 7) % 28, 3, 2);
    k.fillStyle = '#c4684a'; k.fillRect(66, 70, 70, 192); k.fillStyle = '#a8452f'; k.beginPath(); k.moveTo(60, 70); k.lineTo(101, 18); k.lineTo(142, 70); k.fill();   // the tower with its spire
    k.fillStyle = '#f4eee0'; k.fillRect(90, 90, 22, 30); k.fillStyle = '#3b3b44'; k.fillRect(96, 96, 10, 24); k.fillStyle = '#8a3a2a'; k.fillRect(66, 240, 70, 22);
    k.fillStyle = '#5b3a29'; k.fillRect(146, 96, 6, 12);   // the beam they hang from
    const ball = (x, y, c, c2) => { k.fillStyle = 'rgba(60,50,40,.25)'; k.beginPath(); k.ellipse(x, 266, 12, 3, 0, 0, 7); k.fill(); k.fillStyle = c; k.beginPath(); k.arc(x, y, 11, 0, 7); k.fill(); k.fillStyle = c2; k.beginPath(); k.arc(x - 3, y - 3, 4, 0, 7); k.fill(); };
    ball(190, y1, '#5a5f72', '#9aa0b4'); ball(250, y2, '#b8844a', '#e0b078');
  };
  scene(104, 104); await S.type(def.intro);
  const pick = await new Promise(res => def.options.forEach(([key, text]) => row.append(btn(text, () => res(key))))); row.textContent = '';
  // the drop: both fall under the same gravity, so both land at the same moment (a thud, and a puff of dust)
  S.say.textContent = '';
  await new Promise(done => { const t0 = performance.now(), T = 1100; const f = now => { const u = Math.min(1, (now - t0) / T), y = 104 + (255 - 104) * u * u; scene(y, y); if (u < 1) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  sfx.thud(); cv.classList.add('thud'); setTimeout(() => cv.classList.remove('thud'), 400);
  k.fillStyle = 'rgba(230,220,190,.8)'; for (let i = 0; i < 10; i++) { k.fillRect(190 + (i - 5) * 3 - 6, 258 - (i % 3) * 3, 3, 3); k.fillRect(250 + (i - 5) * 3 + 6, 258 - (i % 3) * 3, 3, 3); }
  info.textContent = 'Both landed at the same moment!'; await S.type(def.after[pick]);
  await new Promise(res => S.body.append(el('button', { class: 'btn mdone', text: 'Onwards', onclick: res })));
  return S.close({ solved: true });
}

function playRiddle(id, def, game, story) {
  return new Promise(async res => {
    unlock();
    const url = stillUrl(def.still) || fallbackArt();
    const root = el('div', { class: 'mini' }), art = el('div', { class: 'mart' }), img = el('img', { src: url, draggable: 'false' });
    const rid = el('div', { class: 'mriddle panel' }), msg = el('div', { class: 'mmsg' }), ops = el('div', { class: 'mopts' });
    const inp = el('input', { type: 'text', placeholder: 'or type your answer', maxlength: 40, autocomplete: 'off', autocapitalize: 'off' }), go = el('button', { class: 'btn small', text: 'Answer' });
    const row = el('div', { class: 'mfree' }, inp, go), burst = el('div', { class: 'mburst hidden' });
    art.append(img, burst); root.append(art, rid, msg, ops, row); document.body.append(root);
    let wrong = 0, done = false, leaned = 0;
    for (const t of def.options) ops.append(el('button', { class: 'btn small mopt', text: t, onclick: e => { e.stopPropagation(); submit(t, def.options.indexOf(t)); } }));
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') submit(inp.value, -1); });   // keep game keys (space, arrows) out of the box
    go.addEventListener('click', () => submit(inp.value, -1));
    // the riddle, lettered
    const text = def.riddle; let n = 0; rid.textContent = ''; const ti = setInterval(() => { n++; rid.textContent = text.slice(0, n); if (n % 3 === 0) sfx.blip(); if (n >= text.length) clearInterval(ti); }, Math.round(1000 / readCps()));
    if (def.audio && hasClip(def.audio)) { const ms = await clipInfo(clipUrl(def.audio)); if (ms > 0) playClip(clipUrl(def.audio)); }
    const correct = (val, idx) => idx >= 0 ? idx === def.answer : def.accept.includes(norm(val)) || def.options[def.answer] && norm(val) === norm(def.options[def.answer]);
    const shake = () => { root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); sfx.wrong(); };
    function submit(val, idx) {
      if (done || !norm(val)) return;
      if (correct(val, idx)) return win();
      wrong++; shake(); leaned = Math.min(leaned + 1, 3); img.style.transform = `scale(${1 + leaned * .07}) translateY(${leaned * 1.5}%)`;
      const left = def.tries - wrong;
      if (left > 0) msg.textContent = (def.wrong[def.tries - 1 - left] || def.wrong[0]).replace('{n}', left);
      else { msg.textContent = def.wrong[2] + ' ' + (def.hintSpeaker === 'glauka' ? 'Glauka whispers: ' : '') + '“' + def.hint + '”'; wrong = 0; }
      msg.classList.remove('good'); inp.value = '';
    }
    function win() {
      done = true; clearInterval(ti); stopClip(); ops.classList.add('hidden'); row.classList.add('hidden'); msg.classList.add('good'); msg.textContent = def.success;
      burst.textContent = def.burst || 'AIIIEEE!'; burst.classList.remove('hidden'); root.classList.add('impact'); sfx.whoosh(); sfx.shriek(); setTimeout(() => sfx.pop(), 250);
      setTimeout(() => { burst.classList.add('hidden'); root.classList.remove('impact'); root.classList.add('falls'); sfx.splash(); }, 900);
      setTimeout(() => {
        const b = el('button', { class: 'btn mdone', text: 'Onwards', onclick: () => { root.classList.add('out'); setTimeout(() => root.remove(), 250); res({ solved: true, badge: def.badge }); } });
        root.append(b); sfx.win();
      }, 2600);
    }
    window.__mini = { submit, get wrong() { return wrong; } };
  });
}
