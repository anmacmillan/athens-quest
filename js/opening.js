// Opening sequence for a new player: title card, then a continuous zoom from the whole of Greece down to the foot of the Acropolis (one scripted flight on
// the shared geographic plane), Glauka swooping in as an in-world scene, then a three-step tutorial that waits for the player to do each thing.
// Skippable with a tap or the Skip button, replayable from the scoreboard. Also hosts Glauka's idle hint (60 s without input). Data: data/opening.json.
import { g, IM, V, label, loadImage } from './render.js';
import { el, $, clamp, lerp, eio, dist, lsGet, lsSet } from './util.js';
import { me, touch, store } from './store.js';
import { sfx, unlock } from './audio.js';
import { input } from './input.js';
import { Scene, aiAssets } from './scene.js';
import { readCps, decorHold } from './reading.js';
import * as ui from './ui.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export class Opening {
  constructor(game) { this.G = game; this.cfg = null; this.running = false; this.skipped = false; this.bubbleEl = null; this.idle = 0; this.lastPos = null; this.seen = false; }
  async init() {
    try { this.cfg = await (await fetch('data/opening.json')).json(); } catch (e) { this.cfg = { labels: [], captions: {}, glauka: [], tutorial: [] }; }
    const bump = () => { this.idle = 0; };
    addEventListener('keydown', bump); addEventListener('pointerdown', bump);
    setInterval(() => this.idleTick(), 1000);
  }
  seenIntro(p) { return !!(p && (p.introSeen || Object.keys(p.badges || {}).length)); }
  // ------------------------------------------------------------ helpers
  startPos() {
    if (this.G.worlds.syntagma && this.G.hotelDoor) return this.G.hotelDoor();   // the new-player start is the hotel door in Syntagma
    const G = this.G, A = G.worlds.athens, c = this.cfg.start, q = A.project(c.lat, c.lon); let best = null, bd = 1e9;
    const T = A.T, tx0 = Math.floor(q.x / T), ty0 = Math.floor(q.y / T);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const ch = A.grid[ty0 + dy] && A.grid[ty0 + dy][tx0 + dx]; if (!ch || !'Sl'.includes(ch)) continue;
      const x = (tx0 + dx) * T + T / 2, y = (ty0 + dy) * T + T / 2, d = Math.hypot(x - q.x, y - q.y); if (d < bd && A.walkable(x, y) && !A.hiddenBehind(x, y)) { bd = d; best = { x, y }; }
    }
    return best || A.clearSpot(q.x, q.y);
  }
  say(text, ms = 4200) {   // Glauka's speech bubble (DOM): portrait, typed text; resolves when it closes (tap or timeout)
    return new Promise(res => {
      this.closeBubble(); const url = ['glauka_neutral', 'glauka'].map(k => aiAssets[k]).find(u => u && /portrait/.test(u));
      const por = el('img', { class: 'gpor' + (url ? '' : ' pix'), src: url || 'art/owl_0.png', draggable: 'false' }), tx = el('div', { class: 'gtext' }), b = el('div', { class: 'panel gbubble' }, por, el('div', { class: 'gbody' }, el('b', { text: 'Glauka' }), tx));
      document.body.append(b); this.bubbleEl = b; let n = 0; const ti = setInterval(() => { n++; tx.textContent = text.slice(0, n); if (n % 3 === 0) sfx.blip(); if (n >= text.length) clearInterval(ti); }, Math.round(1000 / readCps()));
      const done = () => { clearInterval(ti); clearTimeout(to); b.classList.add('out'); setTimeout(() => b.remove(), 250); if (this.bubbleEl === b) this.bubbleEl = null; res(); };
      const to = setTimeout(done, Math.max(ms, decorHold(text)) + text.length * 1000 / readCps()); b.addEventListener('pointerdown', e => { e.stopPropagation(); if (n < text.length) { n = text.length; tx.textContent = text; } else done(); });
      b._done = done;
    });
  }
  closeBubble() { if (this.bubbleEl && this.bubbleEl._done) this.bubbleEl._done(); }
  // ------------------------------------------------------------ the sequence
  async play(o = {}) {
    if (this.running) return; const G = this.G; unlock(); this.running = true; this.skipped = false; this.cancel = null;
    const prev = { world: G.world.id, x: G.player.x, y: G.player.y };
    G.busy = true; input.enabled = false; ui.hud(false); ui.setPrompt(null);
    const skipBtn = el('button', { class: 'btn small opskip', text: 'Skip', onclick: e => { e.stopPropagation(); this.skip(); } }), catcher = el('div', { class: 'opcatch', onpointerdown: () => this.skip() });
    document.body.append(catcher, skipBtn); this.catcher = catcher;
    const start = this.startPos();
    try {
      await this.title();
      if (!this.skipped) await this.flight(start);
      this.land(start);
      catcher.remove();
      if (!this.skipped) await this.glaukaScene();
    } catch (e) { console.error(e); }
    catcher.remove(); skipBtn.remove(); this.closeBubble();
    if (o.replay) { G.enterWorld(prev.world, false); G.player.x = prev.x; G.player.y = prev.y; G.owl.x = prev.x - 18; G.owl.y = prev.y; G.cam.x = prev.x; G.cam.y = prev.y; }
    G.busy = false; input.enabled = true; ui.hud(true); G.flight = null; this.running = false;
    const p = me(); if (p && !p.introSeen) { p.introSeen = Date.now(); touch(store.me); }
    if (!this.skipped && !o.replay) await this.tutorial();
  }
  skip() {
    this.skipped = true; const G = this.G; if (G.flight && G.flight.script) G.flight.t = 1e9; if (G.scene) G.scene.skip(); if (this.titleEl) this.endTitle && this.endTitle();
    this.closeBubble();
  }
  async title() {
    const key = Object.keys(aiAssets).find(k => /title/i.test(k) && !/portrait/.test(aiAssets[k])), art = key ? aiAssets[key] : null;
    const root = el('div', { class: 'optitle' }, art ? el('img', { src: art, draggable: 'false' }) : null,
      el('div', { class: 'optext' }, el('h1', { text: 'Owl Quest: Athens' }), el('p', { text: 'Stories, flags and a skateboard' }), el('img', { src: 'art/owl_0.png', class: 'opowl', draggable: 'false' }), el('small', { text: 'Tap to begin' })));
    if (!art) root.classList.add('code'); document.body.append(root); this.titleEl = root; sfx.hoot();
    await new Promise(res => { this.endTitle = () => { this.endTitle = null; res(); }; root.addEventListener('pointerdown', e => { e.stopPropagation(); this.endTitle && this.endTitle(); }); setTimeout(() => this.endTitle && this.endTitle(), 3800); });
    root.classList.add('out'); setTimeout(() => root.remove(), 400); this.titleEl = null;
  }
  async flight(start) {
    const G = this.G, GR = G.worlds.greece, A = G.worlds.athens, cfg = this.cfg, ln = Math.log;
    const m0 = Math.max(GR.w / V.W, GR.h / V.H) * GR.mpp * 1.04, mAtt = 45, mAth = 4.2, m1 = (G.worlds.syntagma || A).mpp, mSy = 9, TW = G.worlds.syntagma || A;
    const gC = GR.geoOf(GR.w / 2, GR.h / 2), gT = TW.geoOf(start.x, start.y);
    const acro = A.project(cfg.acropolis.lat, cfg.acropolis.lon), gAcro = A.geoOf(acro.x, acro.y);
    const K = [[0, ln(m0)], [2.6, ln(m0)], [5.8, ln(mAtt)], [7.2, ln(mAth)], [8.6, ln(mAth)], [10.6, ln(mSy)], [13.4, ln(m1)]];
    const total = K[K.length - 1][0];
    const mask = this.seaMask(GR); const tl = { a: 0 };
    const keyframes = t => {
      let lm = K[K.length - 1][1]; for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1][0]) { const u = clamp((t - K[i][0]) / (K[i + 1][0] - K[i][0])); lm = lerp(K[i][1], K[i + 1][1], eio(u)); break; }
      // the centre glides Greece -> the Acropolis (held through the Athens overview) -> Syntagma and the hotel door
      let c; if (t <= 2.6) c = gC; else if (t <= 7.2) { const u = eio(clamp((t - 2.6) / 4.6)); c = { x: lerp(gC.x, gAcro.x, u), y: lerp(gC.y, gAcro.y, u) }; } else if (t <= 8.6) c = gAcro; else { const u = eio(clamp((t - 8.6) / 4.8)); c = { x: lerp(gAcro.x, gT.x, u), y: lerp(gAcro.y, gT.y, u) }; }
      return { m: Math.exp(lm), c };
    };
    const lab = cfg.labels.map(l => { const q = GR.project(l.lat, l.lon), gg = GR.geoOf(q.x, q.y); return { ...l, g: gg }; });
    const overlay = (c, m, t, scr) => {
      const tt = G.flight ? G.flight.t : 0;
      // the Aegean sparkles
      if (mask && m > 300) for (let i = 0; i < 70; i++) {
        const k = Math.floor(tt * 2 + i * 0.37), r1 = frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453), r2 = frac(Math.sin(i * 39.346 + k * 11.135) * 24634.6345), sx = r1 * V.W, sy = r2 * V.H;
        const gx = (sx - V.W / 2) * m + c.x, gy = (sy - V.H / 2) * m + c.y, px_ = (gx - GR.tl.x) / GR.mpp, py_ = (gy - GR.tl.y) / GR.mpp;
        const sea = px_ < 0 || py_ < 0 || px_ >= GR.w || py_ >= GR.h || mask(px_, py_); if (!sea) continue;
        const a = .35 + .6 * Math.abs(Math.sin(tt * 3 + i)); g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; g.fillRect(Math.round(sx), Math.round(sy), 1, 1); if (i % 5 === 0) { g.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1); g.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3); }
      }
      // labels fade in one by one, then out as we dive
      const vis = clamp((m - 90) / 400); lab.forEach((l, i) => { const a = clamp((tt - .6 - i * .22) / .5) * vis; if (a <= .02) return; const s = scr(l.g); g.globalAlpha = a; if (!l.sea) { g.fillStyle = '#e5484d'; g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3); } label(l.name, s.x, s.y - (l.sea ? 0 : 12), l.sea ? '#cfe9ff' : l.big ? '#ffe9a0' : '#fff4d6', '#1b3a5c', true); g.globalAlpha = 1; });
      // the Acropolis ring
      const ha = clamp((tt - 5.6) / .6) * (1 - clamp((tt - 9.8) / 1.2)); if (ha > .02) { const s = scr(gAcro), r = 14 + 4 * Math.sin(tt * 5); g.strokeStyle = `rgba(255,233,160,${ha.toFixed(2)})`; g.lineWidth = 2; g.beginPath(); g.arc(Math.round(s.x), Math.round(s.y), r, 0, 7); g.stroke(); g.globalAlpha = ha; label('The Acropolis', s.x, s.y - r - 14, '#ffe9a0', '#3a2c4c', true); g.globalAlpha = 1; }
    };
    G.enterWorld(TW.id, false); G.player.x = start.x; G.player.y = start.y; G.player.facing = 'f';
    sfx.whoosh(); const done = G.scriptFlight(total, keyframes, overlay); G.flight.land = { x: start.x, y: start.y }; G.flight.B = TW;
    const caps = [[.3, cfg.captions.greece], [3.0, cfg.captions.attica], [6.2, cfg.captions.acropolis], [9.4, cfg.captions.syntagma || 'Syntagma Square, and our hotel.']];
    caps.forEach(([t, txt]) => setTimeout(() => { if (G.flight && !this.skipped) this.say(txt, 2400); }, t * 1000));
    await done; G.flight = null; this.closeBubble();
  }
  seaMask(GR) {   // 1/6-size alpha map of the Greece image: transparent = sea
    const im = IM.greece; if (!im) return null; const k = 6, c = document.createElement('canvas'); c.width = Math.ceil(im.width / k); c.height = Math.ceil(im.height / k); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data; return (px, py) => d[((Math.floor(py / k)) * c.width + Math.floor(px / k)) * 4 + 3] < 40;
  }
  land(start) {
    const G = this.G; G.flight = null; const TW = G.worlds.syntagma || G.worlds.athens; G.enterWorld(TW.id, false); G.saved[TW.id] = { x: start.x, y: start.y }; G.player.x = start.x; G.player.y = start.y; G.player.facing = 'f'; G.player.moving = false;
    G.owl.x = start.x - 18; G.owl.y = start.y - 4; G.cam.x = start.x; G.cam.y = start.y; G.cam.z = 1; G.skate.vx = G.skate.vy = 0; lsSet('owlq.pos2', { athens: G.saved.athens, [TW.id]: { x: start.x, y: start.y }, zone: TW.id });
  }
  async glaukaScene() {
    const G = this.G, L = this.cfg.glauka, cap = text => ({ t: 'caption', speaker: 'glauka', text, hold: 1700 });
    const beats = [
      { t: 'actor.place', id: 'girl', x: 0, y: -40, facing: 'f' },
      { t: 'camera.set', to: [0, -20], zoom: 1 },
      { t: 'wait', ms: 400 },
      { t: 'actor.move', id: 'girl', to: [0, 4], ms: 1700, par: true },
      { t: 'wait', ms: 1100 },
      { t: 'sfx', name: 'whoosh' },
      { t: 'actor.fall', id: 'owl', path: [[-12, 46], [-44, 118], [-74, 160], [-92, 176]], ms: 2300, vanish: false, remove: false, speedlines: false, sfx: false, par: true },
      { t: 'camera.pan', to: [-10, -40], ms: 1200, par: true },
      { t: 'wait', ms: 2300 },
      { t: 'actor.jump', id: 'owl', height: 7, ms: 320 }, { t: 'actor.jump', id: 'owl', height: 7, ms: 320 }, { t: 'sfx', name: 'hoot' },
      { t: 'camera.pan', to: [10, -10], ms: 600, par: true },
      cap(L[0]), cap(L[1]), cap(L[2]), { t: 'actor.emote', id: 'owl', emote: 'happy', ms: 1500 }, { t: 'wait', ms: 500 },
    ];
    const sc = new Scene(G, { id: 'intro-glauka', speaker: 'glauka', bars: false, startDelay: 100, party: { girl: [0, 0], owl: [92, -176], girlFacing: 'f' }, beats }, { interactive: true }); G.scene = sc;
    ui.showSkip(() => this.skip());
    try { await sc.run(); } catch (e) { console.error(e); }
    ui.hideSkip(); G.scene = null;
  }
  // three steps in Glauka's voice; each waits for the player to really do it
  async tutorial() {
    const G = this.G, T = this.cfg.tutorial, wait = async (cond, max = 120000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < max && !this.skipped && me()) await sleep(250); };
    const p0 = { x: G.player.x, y: G.player.y };
    this.say(T[0].text, 6000); await wait(() => dist(G.player.x, G.player.y, p0.x, p0.y) > 90); this.closeBubble(); if (!me()) return;
    sfx.coin(); await sleep(600); this.say(T[1].text, 6000);
    await wait(() => G.busy || (G.nearest && G.nearest.kind === 'spot' && (this.say('Press A now!', 2500), true)), 90000);
    await wait(() => G.busy, 90000); await wait(() => !G.busy, 600000); this.closeBubble(); await sleep(800);
    if (!me()) return; this.say(T[2].text, 7000); await sleep(6500);
  }
  // ------------------------------------------------------------ idle hint
  idleTick() {
    const G = this.G; if (!me() || this.running || G.busy || G.scene || G.flight || ui.isOpen() || document.hidden) { this.idle = 0; return; }
    const p = G.player; if (this.lastPos && dist(p.x, p.y, this.lastPos.x, this.lastPos.y) > 2) this.idle = 0; this.lastPos = { x: p.x, y: p.y };
    if (++this.idle < 60) return; this.idle = 0;
    const t = G.compassTarget(), title = t && t.story ? t.story.title : null;
    this.say(title ? this.cfg.idleHint.replace('{title}', title) : 'Hoo! Try the flags: walk close and press A.', 4000);
  }
}
const frac = v => v - Math.floor(v);
