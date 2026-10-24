// Motion comic: art/comics/<story>/p1.jpeg, p2... (3:4 manga pages, a 2x2 grid of panels, or "2+1" with a merged wide bottom panel) + script.json
// [{page, panel 1..4, visual, caption, speech?:{speaker,text}, sfx?}]. A guided-view player: show the page, then pan/zoom to each panel in turn,
// caption in a Sprout box with the speaker's portrait, narration audio/comics/<story>/p<page>_<panel>.mp3 if present. Tap/A = next, Back = rewind.
import { el, clamp, eio, lerp, speakerName, FLAGS } from './util.js';
import { sfx, hasClip, clipUrl, clipInfo, playClip, stopClip, unlock, music } from './audio.js';
import { aiAssets } from './scene.js';
import { readCps, decorHold, autoTap } from './reading.js';

const EXTS = ['jpeg', 'jpg', 'png', 'webp'], PAGE_DIRS = ['art/web/comics', 'art/comics'];   // the published site ships only the web copies
const cache = {}, inflight = {};
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// does this story have a comic? resolves {id, script, pages:[{n, src, img, rects}]} or null
let known = null; const knownP = fetch('data/comics.json').then(r => r.ok ? r.json() : null).then(j => { known = j ? new Set(j) : null; }).catch(() => { });
export function loadComic(id) {   // one shared promise per story, so a prefetch and the real load are the same request
  if (cache[id] !== undefined) return Promise.resolve(cache[id]);
  if (known && !known.has(id) && id[0] !== '_') return Promise.resolve(cache[id] = null);   // data/comics.json lists the stories that have one
  if (inflight[id]) return inflight[id];
  return inflight[id] = (async () => {
    await knownP; if (known && !known.has(id) && id[0] !== '_') { delete inflight[id]; return cache[id] = null; }
    let script = null, narrVoice = null;
    try { const r = await fetch(`art/comics/${id}/script.json`); if (r.ok) { const j = await r.json(); script = Array.isArray(j) ? j : (j.panels || j.script || null); if (!Array.isArray(j)) narrVoice = j.narr_voice || null; } } catch (e) { }
    if (!script || !script.length) { cache[id] = null; return null; }
    const layouts = {}; script.forEach(s => { if (s.layout) layouts[s.page] = s.layout; });
    const nums = [...new Set(script.map(s => s.page))].sort((a, b) => a - b);
    const one = async n => {   // all pages at once; the 1600 px .jpeg web copy is the normal case, other names only as a fallback
      let img = null, src = null;
      for (const b of PAGE_DIRS) { for (const e of EXTS) { img = await loadImg(src = `${b}/${id}/p${n}.${e}`); if (img) break; } if (img) break; }
      if (!img) return null;
      const entries = script.filter(s => s.page === n).sort((a, b) => a.panel - b.panel);
      return { n, src, img, entries, rects: detectPanels(img, layouts[n] || (entries.length === 3 ? '2+1' : '2x2')) };
    };
    const pages = (await Promise.all(nums.map(one))).filter(Boolean);
    cache[id] = pages.length ? { id, script, pages, narrVoice } : null; delete inflight[id];
    return cache[id];
  })();
}
export const prefetchComic = id => { if (cache[id] === undefined && !inflight[id]) loadComic(id).catch(() => { }); };

// Find the white gutters. Returns panel rects in image pixels, in reading order (TL, TR, BL, BR; or TL, TR, wide bottom for 2+1).
export function detectPanels(img, layout = '2x2') {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, sw = 240, sh = Math.round(H * sw / W);
  const fallback = () => { const m = .03, mx = W * m, my = H * m, gx = W * .02, gy = H * .015, pw = (W - 2 * mx - gx) / 2, ph = (H - 2 * my - gy) / 2;
    const r = [[mx, my, pw, ph], [mx + pw + gx, my, pw, ph], [mx, my + ph + gy, pw, ph], [mx + pw + gx, my + ph + gy, pw, ph]].map(a => ({ x: a[0], y: a[1], w: a[2], h: a[3] }));
    return layout === '2+1' ? [r[0], r[1], { x: r[2].x, y: r[2].y, w: r[3].x + r[3].w - r[2].x, h: r[2].h }] : r; };
  try {
    const c = document.createElement('canvas'); c.width = sw; c.height = sh; const k = c.getContext('2d', { willReadFrequently: true }); k.drawImage(img, 0, 0, sw, sh);
    const d = k.getImageData(0, 0, sw, sh).data, white = (x, y) => { const i = (y * sw + x) * 4; return d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232; };
    // whiteness profile of rows/cols inside a box
    const prof = (x0, y0, x1, y1, byCol) => { const n = byCol ? x1 - x0 : y1 - y0, out = new Array(n).fill(0); for (let i = 0; i < n; i++) { let w = 0, t = 0; if (byCol) { for (let y = y0; y < y1; y++) { t++; if (white(x0 + i, y)) w++; } } else { for (let x = x0; x < x1; x++) { t++; if (white(x, y0 + i)) w++; } } out[i] = t ? w / t : 0; } return out; };
    const runs = (p, thr) => { const r = []; let s = -1; p.forEach((v, i) => { if (v >= thr && s < 0) s = i; if ((v < thr || i === p.length - 1) && s >= 0) { r.push([s, v >= thr && i === p.length - 1 ? i + 1 : i]); s = -1; } }); return r; };
    // outer content box: trim white margins
    const cols = prof(0, 0, sw, sh, true), rows = prof(0, 0, sw, sh, false);
    const first = (p, thr) => { let a = 0, b = p.length; while (a < p.length && p[a] > thr) a++; while (b > a && p[b - 1] > thr) b--; return [a, b]; };
    let [x0, x1] = first(cols, .97), [y0, y1] = first(rows, .97);
    if (x1 - x0 < sw * .6 || y1 - y0 < sh * .6) return fallback();
    // the horizontal gutter: best white run in the middle third of the content box
    const midRun = (p, a, b) => { const lo = a + (b - a) * .3, hi = a + (b - a) * .7, rs = runs(p, .9).filter(r => r[1] > lo && r[0] < hi && r[1] - r[0] >= 2); if (!rs.length) return null; return rs.sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0]; };
    const hg = midRun(rows.map((v, i) => i >= y0 && i < y1 ? v : 0), y0, y1); if (!hg) return fallback();
    const band = (ya, yb) => { const p = prof(x0, ya, x1, yb, true), vg = midRun(p.map(v => v), 0, p.length); return vg ? [x0 + vg[0], x0 + vg[1]] : null; };
    const trimBand = (ya, yb, xa, xb) => { const p = prof(xa, ya, xb, yb, false); let a = 0, b = p.length; while (a < b && p[a] > .93) a++; while (b > a && p[b - 1] > .93) b--; return [ya + a, ya + b]; };
    const S = W / sw, rect = (xa, xb, ya, yb) => ({ x: xa * S, y: ya * S, w: (xb - xa) * S, h: (yb - ya) * S });
    const out = [];
    const topV = band(y0, hg[0]), botV = band(hg[1], y1);
    const topY = [y0, hg[0]], botY = [hg[1], y1];
    if (!topV) return fallback();
    out.push(rect(x0, topV[0], ...topY), rect(topV[1], x1, ...topY));
    if (botV && layout !== '2+1') out.push(rect(x0, botV[0], ...botY), rect(botV[1], x1, ...botY)); else out.push(rect(x0, x1, ...botY));
    return out;
  } catch (e) { return fallback(); }
}

export function playComic(comic, story, opts = {}) {
  return new Promise(res => {
    unlock(); const relMusic = music.hold('comic');
    const flag = FLAGS[story.flag] || FLAGS.myth;
    const root = el('div', { id: 'comic', class: 'comic' }), view = el('div', { class: 'cview' }), img = el('img', { class: 'cpage', draggable: 'false' });
    const box = el('div', { class: 'panel cbox' }), por = el('img', { class: 'cport hidden', draggable: 'false' }), nm = el('div', { class: 'cname' }), tx = el('div', { class: 'ctext' }), sp = el('div', { class: 'cspeech' });
    const bBack = el('button', { class: 'btn small cback', text: 'Back' }), bSkip = el('button', { class: 'btn small cskip', text: 'Skip' }), dots = el('div', { class: 'cdots' });
    box.append(por, el('div', { class: 'cbody' }, nm, tx, sp));
    view.append(img); root.append(view, box, bBack, bSkip, dots); document.body.append(root);
    const steps = []; comic.pages.forEach((pg, pi) => { steps.push({ pi, kind: 'page' }); pg.entries.forEach(e => steps.push({ pi, kind: 'panel', e, idx: Math.min(e.panel - 1, pg.rects.length - 1) })); });
    let i = -1, done = false, raf = 0, st = null, timer = 0, curPage = -1, token = 0, ty = null, tyI = 0;
    const geom = () => { const vw = innerWidth, vh = innerHeight, wide = vw / vh > 1.3, bw = wide ? Math.min(420, vw * .34) : vw, bh = wide ? vh : Math.min(vh * .3, 230); return { vw, vh, wide, area: { w: wide ? vw - bw : vw, h: wide ? vh : vh - bh } }; };
    const layout = () => { const G = geom(); root.classList.toggle('wide', G.wide); view.style.width = G.area.w + 'px'; view.style.height = G.area.h + 'px'; return G; };
    // camera = {cx, cy, s}: image-pixel centre and scale (css px per image px)
    const fit = (r, G, pad = .04) => { const s = Math.min(G.area.w * (1 - pad * 2) / r.w, G.area.h * (1 - pad * 2) / r.h); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, s }; };
    const apply = c => { const G = geom(); img.style.transform = `translate(${G.area.w / 2 - c.cx * c.s}px, ${G.area.h / 2 - c.cy * c.s}px) scale(${c.s})`; };
    let cam = null;
    const tick = now => {
      raf = requestAnimationFrame(tick); if (!st || done) return;
      const u = clamp((now - st.t0) / st.dur), e = eio(u), drift = 1 + st.drift * clamp((now - st.t0) / st.hold);
      cam = { cx: lerp(st.a.cx, st.b.cx, e), cy: lerp(st.a.cy, st.b.cy, e), s: lerp(st.a.s, st.b.s, e) * (u >= 1 ? drift : 1 + (drift - 1) * u) }; apply(cam);
    };
    const moveTo = (b, ms, hold, drift = .05) => { const G = layout(); st = { a: cam || b, b, t0: performance.now(), dur: ms, hold: Math.max(1500, hold), drift }; };
    const setDots = () => { dots.textContent = ''; comic.pages.forEach((p, k) => dots.append(el('i', { class: k === steps[i].pi ? 'on' : '' }))); };
    const finish = ok => { if (done) return; done = true; relMusic(); clearTimeout(timer); clearInterval(tyI); cancelAnimationFrame(raf); stopClip(); removeEventListener('keydown', onKey, true); removeEventListener('resize', onResize); root.classList.add('out'); setTimeout(() => root.remove(), 250); res(ok === true); };
    const show = async (k, back = false) => {
      if (done) return; if (k >= steps.length) return finish(true); i = clamp(k, 0, steps.length - 1); const s = steps[i], pg = comic.pages[s.pi], my = ++token; clearTimeout(timer); clearInterval(tyI); ty = null; stopClip();
      const G = layout(); setDots();
      if (s.pi !== curPage) {   // page turn
        if (curPage >= 0) { sfx.page && sfx.page(); img.style.opacity = 0; await new Promise(r => setTimeout(r, 180)); if (my !== token) return; }
        img.src = pg.src; curPage = s.pi; img.style.width = pg.img.naturalWidth + 'px'; img.style.height = pg.img.naturalHeight + 'px';
        cam = fit({ x: 0, y: 0, w: pg.img.naturalWidth, h: pg.img.naturalHeight }, G, .02); apply(cam); img.style.opacity = 1; st = null;
      }
      if (s.kind === 'page') { box.classList.add('hidden'); const full = fit({ x: 0, y: 0, w: pg.img.naturalWidth, h: pg.img.naturalHeight }, G, .02); moveTo(full, 600, 1500, .02); timer = setTimeout(() => show(i + 1), 1600); return; }
      const e = s.e, r = pg.rects[s.idx];
      if (e.minigame && opts.minigame && !s.played) { s.played = true; root.style.display = 'none'; clearTimeout(timer); stopClip(); await opts.minigame(e.minigame); if (done || my !== token) return; root.style.display = ''; }
      sfx.whoosh(); moveTo(fit(r, G), 900, 4500);
      box.classList.remove('hidden');
      // who speaks the narration: the panel's narr_speaker (or narr_voice), else the script's narr_voice, else Glauka; a lettered speech bubble's speaker wins for the portrait
      const narrator = e.narr_speaker || e.narr_voice || comic.narrVoice || 'glauka', spk = (e.speech && e.speech.speaker) || narrator, mood = e.mood || 'neutral';
      // direction: only machine-readable forms act here ('silent', 'hold:2.5', {silent, hold}); free-text recording notes are ignored
      const dr = e.direction, dirTxt = typeof dr === 'string' ? dr : '', silent = !!(dr && (dr.silent || /^\s*silent\b/i.test(dirTxt))), holdMs = dr && dr.hold ? dr.hold * 1000 : (/hold:\s*([\d.]+)/i.exec(dirTxt) ? parseFloat(/hold:\s*([\d.]+)/i.exec(dirTxt)[1]) * 1000 : (silent ? 2500 : 0));
      nm.textContent = speakerName(spk); box.style.setProperty('--flag', flag.color);
      const clip = `comics/${comic.id}/p${pg.n}_${e.panel}`; let clipMs = 0;
      if (hasClip(clip)) { clipMs = await clipInfo(clipUrl(clip)); if (my !== token) return; }
      const voiced = clipMs > 0;   // with a narration clip the box keeps portrait and name but not the caption line; without one it shows narr (else caption)
      const vs = e.voice_speech, vsT = vs && !voiced ? `${vs.speaker ? speakerName(String(vs.speaker).toLowerCase()) + ': ' : ''}\u201C${vs.text}\u201D` : '';   // a spoken line that is not lettered: shown only when there is no clip
      const capT = silent || voiced ? '' : (e.narr || e.caption || ''), spT = silent ? '' : (e.speech ? `\u201C${e.speech.text}\u201D` : vsT), total = capT.length + spT.length; box.classList.remove('cready'); clearInterval(tyI); ty = null;
      tx.textContent = ''; sp.textContent = ''; sp.classList.toggle('hidden', !e.speech && !vsT);
      let pu = null; for (const id of [spk + '_' + mood, spk + '_neutral', spk]) if (aiAssets[id] && /portrait/.test(aiAssets[id])) { pu = aiAssets[id]; break; }
      if (!pu) for (const ext of ['jpeg']) pu = null;
      por.classList.toggle('hidden', !pu); if (pu) por.src = pu;
      let cps = readCps(), autoMs = 700;
      if (voiced) { playClip(clipUrl(clip)); if (total) cps = total / Math.max(.5, clipMs * .8 / 1000); autoMs = clipMs * .2 + 800; }
      if (e.sfx) sfx.pop && sfx.pop();
      st && (st.hold = 4500);
      // typewriter at the reading speed; a tap finishes the typing, the next tap advances. Panels with no text may time out.
      const setTyped = n => { tx.textContent = capT.slice(0, n); sp.textContent = spT.slice(0, Math.max(0, n - capT.length)); };
      const finishTyping = () => { clearInterval(tyI); setTyped(total); ty = null; box.classList.add('cready'); if (!total && !voiced) timer = setTimeout(() => show(i + 1), holdMs || decorHold('a b c')); else if (autoTap()) timer = setTimeout(() => show(i + 1), autoMs); };
      let n = 0; ty = { finish: finishTyping };
      if (!total) finishTyping(); else tyI = setInterval(() => { n++; setTyped(n); if (n % 3 === 0 && n < total) sfx.blip && sfx.blip(); if (n >= total) finishTyping(); }, 1000 / cps);
    };
    const next = () => { if (done) return; if (ty) { ty.finish(); return; } show(i + 1); }, prev = () => { let k = i - 1; while (k > 0 && steps[k].kind === 'page') k--; show(Math.max(0, k)); };
    const onKey = e => { if ([' ', 'Enter', 'ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); } else if (e.key === 'Escape') finish(); };
    const onResize = () => { if (cam && !done) { layout(); const s = steps[i]; if (s && s.kind === 'panel') { const G = geom(); cam = fit(comic.pages[s.pi].rects[s.idx], G); st = null; apply(cam); } } };
    addEventListener('keydown', onKey, true); addEventListener('resize', onResize);
    root.addEventListener('pointerdown', e => { e.stopPropagation(); }); root.addEventListener('click', e => { if (e.target === bBack || e.target === bSkip) return; next(); });
    bBack.addEventListener('click', e => { e.stopPropagation(); prev(); }); bSkip.addEventListener('click', e => { e.stopPropagation(); finish(); });
    raf = requestAnimationFrame(tick); layout(); show(0);
    window.__comic = { next, prev, finish, get step() { return i; }, steps };
  });
}
