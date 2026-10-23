// The wardrobe stage and menu thumbnails, drawn from the real pixel sprite (avatar_sprite.js): integer-scaled, crisp, 2D canvas only.
//   createAvatarView(container, { look }) -> { setLook(look, { wave }), wave(), setPose('idle'|'walk'|'skate'), turnAround(), setDeck(id), dispose() }
//   renderAvatarThumb(who, { look, size, view }) -> Promise<dataURL>   view: full | head | hair | torso | feet | back | skate
import { lookOf, ensureLook, base, portraitUrl, makeCanvas } from './avatar_core.js';
import { buildSpriteFromLook, CW, CH, FEET } from './avatar_sprite.js';

const ORDER = ['f', 'r', 'b', 'l'], ROW = { f: 0, b: 1, l: 2, r: 3 };
const DECKS = { deck_meander: ['#3d7fd6', '#f5c542'], deck_owl: ['#8a5a2c', '#f0d7a8'], deck_medusa: ['#2fa58a', '#f5c542'], deck_parthenon: ['#e8dcc0', '#c9a050'], default: ['#e8443c', '#f5c542'] };

export async function createAvatarView(container, opts = {}) {
  let look = opts.look, sheet = null, facing = 0, pose = 'idle', hop = 0, raf = 0, alive = true, deck = null, t0 = performance.now();
  const stage = document.createElement('canvas'); stage.className = 'wd-stage'; container.append(stage);
  const portrait = document.createElement('img'); portrait.className = 'wd-portrait'; portrait.alt = ''; container.append(portrait);
  const ctx = stage.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const size = () => {
    const r = container.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
    const w = Math.max(80, Math.round(r.width * dpr)), h = Math.max(80, Math.round(r.height * dpr));
    if (w !== W || h !== H) { W = stage.width = w; H = stage.height = h; stage.style.width = r.width + 'px'; stage.style.height = r.height + 'px'; }
  };
  const setPortrait = style => { const u = portraitUrl(style); if (portrait.dataset.s !== style) { portrait.dataset.s = style; portrait.style.visibility = 'hidden'; portrait.onload = () => { portrait.style.visibility = 'visible'; }; portrait.onerror = () => { portrait.style.visibility = 'hidden'; }; portrait.src = u; } };
  const apply = async l => { await ensureLook(l); if (!alive) return; look = l; sheet = buildSpriteFromLook(l); setPortrait(l.style); };
  await apply(look);
  function frameNo(t) {
    if (pose === 'walk') return [1, 0, 2, 0][Math.floor(t * 6.5) % 4];
    if (pose === 'skate') return Math.floor(t * 2) % 4 === 3 ? 4 : 3;
    return 0;
  }
  function draw(now) {
    if (!alive) return; raf = requestAnimationFrame(draw); size(); if (!sheet) return;
    const t = (now - t0) / 1000; ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = false;
    const fc = ORDER[facing], fr = frameNo(t), s = Math.max(2, Math.min(Math.round(dpr * 9), Math.floor(Math.min(H * .86 / 44, W * .8 / 30))));
    const cx = Math.round(W / 2), foot = Math.round(H * .9 - (portrait.dataset.s ? 0 : 0));
    // floor shadow
    ctx.fillStyle = 'rgba(70,50,70,.28)'; ctx.beginPath(); ctx.ellipse(cx, foot, 9 * s, 2.2 * s, 0, 0, 7); ctx.fill();
    let dy = 0; if (hop > 0) { hop -= 1 / 60; dy = Math.round(Math.abs(Math.sin((1 - hop / .7) * Math.PI * 2)) * 6) * s * (hop > 0 ? 1 : 0); }
    if (pose === 'skate') {
      const [c1, c2] = DECKS[deck] || DECKS.default, side = fc === 'l' || fc === 'r', bw = side ? 16 : 9;
      const bx = cx - Math.round(bw / 2 * s), by = foot - 4 * s;
      ctx.fillStyle = '#3a2c4c'; ctx.fillRect(bx - s, by - s, (bw + 2) * s, 4 * s); ctx.fillStyle = c1; ctx.fillRect(bx, by, bw * s, 2 * s); ctx.fillStyle = c2; ctx.fillRect(bx, by, bw * s, s);
      ctx.fillStyle = '#f0e6c8'; ctx.fillRect(bx + 2 * s, by + 2 * s, 2 * s, 2 * s); ctx.fillRect(bx + (bw - 4) * s, by + 2 * s, 2 * s, 2 * s);
      dy += 4 * s;
    }
    ctx.drawImage(sheet, fr * CW, ROW[fc] * CH, CW, CH, cx - Math.round(CW / 2 * s), foot - dy - FEET * s - s, CW * s, CH * s);
  }
  raf = requestAnimationFrame(draw);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(container);
  return {
    async setLook(l, o = {}) { await apply(l); if (o.wave) hop = .7; },
    wave() { hop = .7; },
    setPose(p) { pose = p; },
    turnAround() { facing = (facing + 1) % 4; },
    setDeck(d) { deck = d; },
    get facing() { return ORDER[facing]; },
    dispose() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); stage.remove(); portrait.remove(); },
  };
}

// crop boxes (cell px) per view, from the frame's anchor points
function box(d, fc, view) {
  const a = d.frames[fc + '0'] || d.frames.f0, cx = Math.round(a.cx);
  switch (view) {
    case 'head': case 'hair': return [cx - 14, a.ctop - 9, 28, 28];
    case 'torso': return [Math.round(a.tx) - 14, a.ctop + 12, 28, 28];
    case 'skate': return [Math.round(a.tx) - 15, 14, 30, 38];
    case 'feet': return [Math.round(a.tx) - 14, FEET - 22, 28, 24];
    default: return [Math.round(a.tx) - 14, 9, 28, 43];
  }
}
export async function renderAvatarThumb(who, o = {}) {
  const l = o.look || lookOf(who && who.costume !== undefined ? who.costume : who, who && who.outfit);
  await ensureLook(l); const sh = buildSpriteFromLook(l), b = base(l.style), size = o.size || 112;
  const view = o.view === 'back' ? 'full' : (o.view || 'full'), fc = o.view === 'back' ? 'b' : 'f', col = view === 'skate' ? 3 : 0;
  const [x, y, w, h] = box(b.data, fc, view), s = Math.max(1, Math.floor(Math.min(size / w, size / h)));
  const c = makeCanvas(size, size), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const dx = Math.round((size - w * s) / 2), dy = Math.round((size - h * s) / 2);
  g.drawImage(sh, col * CW + x, ROW[fc] * CH + y, w, h, dx, dy - (view === 'skate' ? 3 * s : 0), w * s, h * s);
  if (view === 'skate') {          // the deck under her feet, in the look's deck colours
    const [c1, c2] = DECKS['deck_' + String(l.board || '').replace(/^deck_/, '')] || DECKS.default, bx = dx + Math.round((w * s - 9 * s) / 2), by = dy + (FEET - y - 3) * s - 3 * s;
    g.fillStyle = '#3a2c4c'; g.fillRect(bx - s, by - s, 11 * s, 4 * s); g.fillStyle = c1; g.fillRect(bx, by, 9 * s, 2 * s); g.fillStyle = c2; g.fillRect(bx, by, 9 * s, s);
    g.fillStyle = '#f0e6c8'; g.fillRect(bx + s, by + 2 * s, 2 * s, s); g.fillRect(bx + 6 * s, by + 2 * s, 2 * s, s);
  }
  return c.toDataURL('image/png');
}
