// The Labyrinth: a dark procedurally generated maze seen from above. Theseus carries a torch (a light radius), paying out Ariadne's red thread behind him.
// Reach the centre (the Minotaur's breathing and a red screen-edge pulse warn you), win the short scripted fight, then follow the thread back out before the torch burns down.
// Data-driven (data/minigames.json type 'maze'): size, torch radius, time, speaker. Slow readers (js/reading.js) get a bigger torch and more time.
import { el, clamp } from './util.js';
import { IM } from './render.js';
import { sfx, minotaurBreath, unlock } from './audio.js';
import { aiAssets, stillList, resolveStill } from './scene.js';
import { readSpeed } from './reading.js';

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// maze as passages: open[y][x] = {n,e,s,w} booleans, carved by randomised depth-first search (a perfect maze: always solvable)
export function makeMaze(N, seed) {
  const rnd = mulberry(seed), open = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ n: 0, e: 0, s: 0, w: 0 }))), seen = Array.from({ length: N }, () => Array(N).fill(false));
  const D = { n: [0, -1, 's'], e: [1, 0, 'w'], s: [0, 1, 'n'], w: [-1, 0, 'e'] }, st = [[N >> 1, N - 1]]; seen[N - 1][N >> 1] = true;
  while (st.length) {
    const [x, y] = st[st.length - 1], opts = Object.keys(D).filter(k => { const nx = x + D[k][0], ny = y + D[k][1]; return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[ny][nx]; });
    if (!opts.length) { st.pop(); continue; }
    const k = opts[Math.floor(rnd() * opts.length)], nx = x + D[k][0], ny = y + D[k][1]; open[y][x][k] = 1; open[ny][nx][D[k][2]] = 1; seen[ny][nx] = true; st.push([nx, ny]);
  }
  return { N, open, start: [N >> 1, N - 1], centre: [N >> 1, N >> 1], D };
}
export function solvePath(m, from, to) {   // BFS over cells -> list of [x,y]
  const { N, open, D } = m, key = (x, y) => y * N + x, prev = new Map([[key(...from), null]]), q = [from];
  while (q.length) { const [x, y] = q.shift(); if (x === to[0] && y === to[1]) break; for (const k in D) if (open[y][x][k]) { const nx = x + D[k][0], ny = y + D[k][1]; if (!prev.has(key(nx, ny))) { prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); } } }
  const out = []; let c = to; while (c) { out.push(c); c = prev.get(key(...c)); } return out.reverse();
}
const loopErase = cells => { const out = [], at = new Map(); for (const c of cells) { const k = c[0] + ',' + c[1]; if (at.has(k)) { const i = at.get(k); for (const r of out.splice(i + 1)) at.delete(r[0] + ',' + r[1]); } else { at.set(k, out.length); out.push(c); } } return out; };
function stillUrl(id) { const u = resolveStill(id); if (u) return u; return aiAssets[id] || null; }

export function playMaze(def, game, story) {
  return new Promise(res => {
    unlock(); const slow = readSpeed() === 'slow', N = def.size || 13, seed = window.__mazeSeed || ((Date.now() ^ (Math.random() * 1e9)) | 0);
    const M = makeMaze(N, seed), R0 = (def.torch || 2.3) * (slow ? 1.45 : 1), TIME = (def.time || 80) * (slow ? 1.6 : 1);
    const root = el('div', { class: 'mini maze' }), top = el('div', { class: 'mzbar' }), msg = el('div', { class: 'mmsg mzmsg' }), cv = el('canvas', { class: 'mzcv' }), edge = el('div', { class: 'mzedge' }), burst = el('div', { class: 'mburst hidden' });
    const torchBar = el('div', { class: 'mztorch hidden' }, el('img', { src: 'art/p_torch.png', class: 'pix' }), el('div', { class: 'mzfuel' }, el('i'))), hint = el('button', { class: 'btn small mzhint hidden', text: 'Hint', onclick: e => { e.stopPropagation(); hintT = 1.6; sfx.chime && sfx.chime(); } });
    top.append(el('div', { class: 'mtitle', text: def.title || 'The Labyrinth' }), torchBar, hint); root.append(top, msg, cv, edge, burst); document.body.append(root);
    const fit = () => { const s = Math.max(240, Math.min(innerWidth - 16, innerHeight - 130, 760)); cv.width = cv.height = s; cv.style.width = cv.style.height = s + 'px'; cp = s / (N + .4); };
    let cp = 40; fit(); addEventListener('resize', fit);
    const g = cv.getContext('2d'), mem = document.createElement('canvas'), floor = document.createElement('canvas'), tmp = document.createElement('canvas');
    const buildFloor = () => {
      floor.width = mem.width = tmp.width = cv.width; floor.height = mem.height = tmp.height = cv.height; const f = floor.getContext('2d'), o = cp * .2;
      f.fillStyle = '#5a4a3e'; f.fillRect(0, 0, cv.width, cv.height); const rr = mulberry(seed + 1);
      for (let i = 0; i < 900; i++) { f.fillStyle = rr() < .5 ? '#6a5848' : '#4a3c32'; f.fillRect(rr() * cv.width, rr() * cv.height, 2, 2); }
      f.strokeStyle = '#2a2024'; f.lineWidth = Math.max(4, cp * .14); f.lineCap = 'square';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = M.open[y][x], X = o + x * cp, Y = o + y * cp;
        if (!c.n) { f.beginPath(); f.moveTo(X, Y); f.lineTo(X + cp, Y); f.stroke(); } if (!c.w) { f.beginPath(); f.moveTo(X, Y); f.lineTo(X, Y + cp); f.stroke(); }
        if (!c.s && y === N - 1 && x !== M.start[0]) { f.beginPath(); f.moveTo(X, Y + cp); f.lineTo(X + cp, Y + cp); f.stroke(); } if (!c.e && x === N - 1) { f.beginPath(); f.moveTo(X + cp, Y); f.lineTo(X + cp, Y + cp); f.stroke(); }
        if (!c.s && y < N - 1) { f.beginPath(); f.moveTo(X, Y + cp); f.lineTo(X + cp, Y + cp); f.stroke(); } if (!c.e && x < N - 1) { f.beginPath(); f.moveTo(X + cp, Y); f.lineTo(X + cp, Y + cp); f.stroke(); } }
      f.fillStyle = '#7a1a1a'; f.beginPath(); f.arc(o + (M.centre[0] + .5) * cp, o + (M.centre[1] + .5) * cp, cp * .34, 0, 7); f.fill();   // the Minotaur's den
      f.fillStyle = '#e8d89a'; f.fillRect(o + M.start[0] * cp + cp * .15, o + N * cp - 2, cp * .7, 5);   // the way in and out
    }; buildFloor();
    const pos = { x: M.start[0] + .5, y: M.start[1] + .5 }, trail = [{ x: pos.x, y: pos.y }], cells = [M.start.slice()];
    const o = () => cp * .2, sx = x => o() + x * cp, sy = y => o() + y * cp;
    // walls as thin rectangles for collision (in cell units)
    const walls = []; const T = .07;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = M.open[y][x];
      if (!c.n) walls.push([x - T, y - T, x + 1 + T, y + T]); if (!c.w) walls.push([x - T, y - T, x + T, y + 1 + T]);
      if (!c.s && !(y === N - 1 && x === M.start[0])) walls.push([x - T, y + 1 - T, x + 1 + T, y + 1 + T]); if (!c.e) walls.push([x + 1 - T, y - T, x + 1 + T, y + 1 + T]); }
    const RAD = .17, hits = (x, y) => walls.some(w => x + RAD > w[0] && x - RAD < w[2] && y + RAD > w[1] && y - RAD < w[3]);
    let phase = 'seek', t0 = performance.now(), last = t0, fuel = 1, hintT = 0, done = false, ended = false, face = 1, fightT = 0, raf = 0, dragV = null;
    const keys = new Set();
    const onKey = e => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k)) { e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown') keys.add(k); else keys.delete(k); } };
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
    cv.style.touchAction = 'none'; let dr = null;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); dr = { x: e.clientX, y: e.clientY }; dragV = [0, 0]; e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (!dr) return; const dx = e.clientX - dr.x, dy = e.clientY - dr.y, l = Math.hypot(dx, dy); dragV = l > 8 ? [dx / l, dy / l] : [0, 0]; });
    const upP = () => { dr = null; dragV = null; }; cv.addEventListener('pointerup', upP); cv.addEventListener('pointercancel', upP);
    const dir = () => { let dx = 0, dy = 0; if (keys.has('arrowleft') || keys.has('a')) dx -= 1; if (keys.has('arrowright') || keys.has('d')) dx += 1; if (keys.has('arrowup') || keys.has('w')) dy -= 1; if (keys.has('arrowdown') || keys.has('s')) dy += 1;
      if (!dx && !dy && dragV) [dx, dy] = dragV; const l = Math.hypot(dx, dy); return l ? [dx / l, dy / l] : [0, 0]; };
    const cellOf = () => [clamp(Math.floor(pos.x), 0, N - 1), clamp(Math.floor(pos.y), 0, N - 1)];
    const say = (t, good) => { msg.textContent = t; msg.classList.toggle('good', !!good); };
    const maxD = Math.hypot(M.centre[0] - M.start[0], M.centre[1] - M.start[1]);
    const sprite = () => IM['c_theseus_0'];
    function step(dt) {
      if (phase === 'fight') return;
      const [dx, dy] = dir(), sp = 2.9;
      if (dx || dy) {
        const nx = pos.x + dx * sp * dt, ny = pos.y + dy * sp * dt; let moved = false;
        if (!hits(nx, ny)) { pos.x = nx; pos.y = ny; moved = true; } else if (!hits(nx, pos.y)) { pos.x = nx; moved = true; } else if (!hits(pos.x, ny)) { pos.y = ny; moved = true; }
        if (moved) { if (dx) face = dx < 0 ? -1 : 1; const lt = trail[trail.length - 1]; if (Math.hypot(pos.x - lt.x, pos.y - lt.y) > .12) trail.push({ x: pos.x, y: pos.y }); const c = cellOf(), lc = cells[cells.length - 1]; if (c[0] !== lc[0] || c[1] !== lc[1]) cells.push(c); }
      }
      pos.x = clamp(pos.x, .15, N - .15); pos.y = clamp(pos.y, .15, N + .45);
      if (phase === 'seek') {
        const d = Math.hypot(pos.x - (M.centre[0] + .5), pos.y - (M.centre[1] + .5)), lvl = clamp(1 - d / (maxD + 1.5)) ** 1.6; minotaurBreath(lvl); edge.style.opacity = (lvl * (.55 + .45 * Math.sin(performance.now() / 240))).toFixed(2);
        if (d < .55) encounter();
      } else if (phase === 'out') {
        fuel = Math.max(0, fuel - dt / TIME); torchBar.querySelector('i').style.width = (fuel * 100) + '%';
        if (pos.y > N - .12 && Math.abs(pos.x - (M.start[0] + .5)) < .45) win(); else if (fuel <= 0) fail();
      }
    }
    function encounter() {
      phase = 'fight'; minotaurBreath(1); sfx.bull && sfx.bull(); say('');
      const u = stillUrl('minotaur_eyes'); const still = u ? el('img', { class: 'mzstill', src: u, draggable: 'false' }) : null; if (still) root.append(still);
      root.classList.add('impact'); burst.textContent = 'HHHRRRR'; burst.classList.remove('hidden'); sfx.whoosh && sfx.whoosh();
      setTimeout(() => { burst.classList.add('hidden'); root.classList.remove('impact'); still && still.remove(); fightT = 0.001; phase = 'fight'; say('Theseus draws his sword!'); }, 2300);
    }
    function fightDone() {
      phase = 'out'; fuel = 1; minotaurBreath(-1); edge.style.opacity = 0; sfx.win(); torchBar.classList.remove('hidden'); hint.classList.remove('hidden');
      thread = loopErase(cells).map(c => ({ x: c[0] + .5, y: c[1] + .5 })); say('Follow the thread out!', true);
    }
    let thread = null;
    function win() { if (done) return; done = true; phase = 'won'; say('You found the way out! Ariadne’s thread did it.', true); sfx.win(); finish(true); }
    function fail() { if (done) return; say('The torch is nearly out... but the thread still glows. Try again!'); fuel = 1; sfx.wrong && sfx.wrong(); pos.x = M.centre[0] + .5; pos.y = M.centre[1] + .5; }
    function finish(ok) {
      cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true); removeEventListener('resize', fit); minotaurBreath(-1);
      const b = el('button', { class: 'btn mdone', text: 'Onwards', onclick: () => { root.classList.add('out'); setTimeout(() => root.remove(), 250); res({ solved: ok, badge: ok ? { id: 'trail:Labyrinth Runner', title: 'Labyrinth Runner' } : null }); } });
      root.append(b); ended = true;
    }
    function draw(now) {
      raf = requestAnimationFrame(draw); const dt = Math.min(.05, (now - last) / 1000); last = now; if (!ended) step(dt); if (hintT > 0) hintT -= dt;
      const W = cv.width, torchR = R0 * cp * (phase === 'out' ? .55 + .45 * Math.min(1, fuel * 1.4) : 1) * (phase === 'won' ? 1.8 : 1), px = sx(pos.x), py = sy(pos.y);
      // explored memory: punch a soft disc into the memory mask
      const mc = mem.getContext('2d'); const gr = mc.createRadialGradient(px, py, torchR * .3, px, py, torchR); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); mc.fillStyle = gr; mc.fillRect(px - torchR, py - torchR, torchR * 2, torchR * 2);
      g.fillStyle = '#050308'; g.fillRect(0, 0, W, W);
      const tc = tmp.getContext('2d'); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, W); tc.drawImage(mem, 0, 0); tc.globalCompositeOperation = 'source-in'; tc.drawImage(floor, 0, 0); g.globalAlpha = .32; g.drawImage(tmp, 0, 0); g.globalAlpha = 1;
      const flick = 1 + Math.sin(now / 90) * .03 + Math.sin(now / 37) * .02, rr2 = torchR * flick; tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, W);
      const lg = tc.createRadialGradient(px, py, rr2 * .15, px, py, rr2); lg.addColorStop(0, 'rgba(255,220,150,1)'); lg.addColorStop(.7, 'rgba(255,170,90,.7)'); lg.addColorStop(1, 'rgba(255,140,60,0)'); tc.fillStyle = lg; tc.fillRect(0, 0, W, W);
      tc.globalCompositeOperation = 'source-in'; tc.drawImage(floor, 0, 0); g.drawImage(tmp, 0, 0);
      g.globalCompositeOperation = 'lighter'; const wg = g.createRadialGradient(px, py, 0, px, py, rr2); wg.addColorStop(0, 'rgba(255,160,60,.22)'); wg.addColorStop(1, 'rgba(255,100,20,0)'); g.fillStyle = wg; g.fillRect(0, 0, W, W); g.globalCompositeOperation = 'source-over';
      // the thread: his trail in red, the loop-erased route glowing once he turns back
      g.lineCap = g.lineJoin = 'round'; const line = (pts, col, w, blur) => { g.strokeStyle = col; g.lineWidth = w; g.shadowColor = col; g.shadowBlur = blur; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(sx(p.x), sy(p.y)) : g.moveTo(sx(p.x), sy(p.y))); g.lineTo(px, py); g.stroke(); g.shadowBlur = 0; };
      if (phase === 'out' || phase === 'won') { line(trail, 'rgba(160,30,30,.55)', Math.max(2, cp * .07), 0); const gl = hintT > 0 ? 18 + Math.sin(now / 90) * 10 : 8 + Math.sin(now / 300) * 4; line(thread || trail, hintT > 0 ? '#ffe9a0' : '#ff5a4a', Math.max(3, cp * .1), gl); }
      else line(trail, '#e8443c', Math.max(2, cp * .08), 6);
      // Minotaur eyes in the dark when close, otherwise nothing
      if (phase === 'seek') { const d = Math.hypot(pos.x - (M.centre[0] + .5), pos.y - (M.centre[1] + .5)); if (d < 4.5) { const a = clamp(1 - d / 4.5) * (.6 + .4 * Math.sin(now / 200)), cx = sx(M.centre[0] + .5), cy = sy(M.centre[1] + .5); g.fillStyle = `rgba(255,50,40,${a.toFixed(2)})`; g.shadowColor = '#f33'; g.shadowBlur = 10; g.fillRect(cx - cp * .16, cy - cp * .06, cp * .09, cp * .06); g.fillRect(cx + cp * .07, cy - cp * .06, cp * .09, cp * .06); g.shadowBlur = 0; } }
      // Theseus
      const im = sprite(); if (phase !== 'fight' && im) { const h = cp * .95, w = im.width * h / im.height; g.save(); g.translate(px, py + h * .35); g.scale(face, 1); g.imageSmoothingEnabled = false; g.drawImage(im, -w / 2, -h, w, h); g.restore(); }
      if (phase === 'fight' && fightT > 0) { fightT += dt; fightScene(g, W, fightT, now); if (fightT > 3.4) { fightT = 0; fightDone(); } }
    }
    function fightScene(g, W, t, now) {
      g.fillStyle = 'rgba(10,5,10,.88)'; g.fillRect(0, 0, W, W); const th = IM['c_theseus_0'], mi = IM[t > 2.2 ? 'c_minotaur_lie' : 'c_minotaur_0']; const k = W / 150, sh = (Math.sin(now / 35) * 3 * (t < 2.2 ? 1 : 0));
      if (th) { const lunge = t < 2.2 ? Math.max(0, Math.sin(t * 7)) * 18 : 4; g.imageSmoothingEnabled = false; g.drawImage(th, W * .28 - th.width * k / 2 + lunge * k * .3 + sh, W * .72 - th.height * k, th.width * k, th.height * k); }
      if (mi) { const w = mi.width * k * .8, h = mi.height * k * .8; g.drawImage(mi, W * .68 - w / 2 - sh, W * .72 - h + (t > 2.2 ? -h * .0 : 0), w, h); }
      if (t < 2.2 && Math.sin(t * 7) > .9) { g.fillStyle = '#fff'; g.fillRect(W * .45, W * .4, W * .1, 4); g.fillRect(W * .49, W * .36, 4, W * .1); }
      g.fillStyle = '#ffe9a0'; g.font = `bold ${Math.round(W / 14)}px Sprout, monospace`; g.textAlign = 'center'; g.fillText(t < 2.2 ? 'CLANG!' : 'Theseus wins!', W / 2, W * .18);
    }
    say('Follow the red thread. Listen for the Minotaur...'); raf = requestAnimationFrame(draw);
    window.__maze = { M, seed, get phase() { return phase; }, get pos() { return { x: pos.x, y: pos.y }; },
      // debug helpers for the headless test: walk Theseus along the solution (moves him cell by cell through the real collision-free corridor)
      walkPath(path) { for (const c of path) { pos.x = c[0] + .5; pos.y = c[1] + .5; trail.push({ x: pos.x, y: pos.y }); const lc = cells[cells.length - 1]; if (lc[0] !== c[0] || lc[1] !== c[1]) cells.push([c[0], c[1]]); } },
      toCentre() { this.walkPath(solvePath(M, M.start, M.centre)); }, toExit() { this.walkPath(solvePath(M, M.centre, M.start).slice(1)); pos.y = N - .05; }, solve: () => solvePath(M, M.start, M.centre) };
  });
}
