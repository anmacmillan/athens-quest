// Visions: the Athena Parthenos in her temple. When the girl walks up to the cella of the Parthenon (or taps its flag after finishing its story) the twelve-metre
// statue of Athena fades in, translucent and golden, with a lyre and choir sting, and Athena speaks one line. One-time per player (sticker), replayable by tapping
// the finished Parthenon flag. A variant plays once after the last main-quest badge (the finale). Data in data/visions.json.
import { IM, loadImage } from './render.js';
import { dist } from './util.js';
import { Scene, aiAssets, stillList } from './scene.js';
import { sfx } from './audio.js';
import { store, me, touch } from './store.js';
import * as ui from './ui.js';
import { input } from './input.js';

const first = async urls => { for (const u of urls) { const im = await loadImage('vis:' + u, u); if (im) return im; } return null; };
export class Visions {
  constructor(G) { this.G = G; this.cfg = null; this.cella = null; this.running = false; this.sprite = null; }
  async init() { try { this.cfg = await (await fetch('data/visions.json')).json(); } catch (e) { this.cfg = null; } }
  // world-px rectangle of the cella, grown by the trigger reach
  rect() {
    const G = this.G, c = this.cfg && this.cfg.parthenos, A = G.worlds.athens; if (!c || !A) return null; const T = A.T, [x0, y0, x1, y1] = c.cella.tiles, r = c.cella.reach * T;
    return { x0: x0 * T - r, y0: y0 * T - r, x1: (x1 + 1) * T + r, y1: (y1 + 1) * T + r, cx: (x0 + x1 + 1) / 2 * T, cy: (y0 + y1 + 1) / 2 * T + T };
  }
  seen(key) { const p = me(); return !!(p && p.stickers && p.stickers[key]); }
  mark(key) { const p = me(); if (p) { p.stickers = p.stickers || {}; p.stickers[key] = Date.now(); touch(store.me); } }
  update() {
    const G = this.G; this.tick(); if (!this.cfg || this.running || G.busy || G.scene || G.flight || G.mode !== 'play' || G.world.id !== 'athens') return;
    const r = this.rect(), p = G.player; if (!r || p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1) return;
    if (!this.seen(this.cfg.parthenos.sticker)) this.play('parthenos');
  }
  tick() {   // finale queued after the last main badge: plays once we are free and on the Athens map
    const G = this.G; if (this.pending && !this.running && !G.busy && !G.scene && G.mode === 'play' && G.world.id === 'athens') { this.pending = false; this.play('finale'); }
  }
  // the sprite: the art lead's file if present, else a placeholder built from the Athena cast sprite; scaled so she stands about height_m tall, with a golden halo
  async build() {
    if (this.sprite) return this.sprite; const G = this.G, A = G.worlds.athens, H = Math.round(this.cfg.parthenos.height_m / A.mpp);
    let im = await first(this.cfg.sprite || []); const glow = await first(this.cfg.glow || []);
    if (!im) im = IM.c_athena_0; if (!im) return null;
    const w = Math.round(im.width * H / im.height), pad = Math.round(H * .35), c = document.createElement('canvas'); c.width = w + pad * 2; c.height = H + pad * 2; const k = c.getContext('2d');
    k.imageSmoothingEnabled = true; const gd = k.createRadialGradient(c.width / 2, c.height * .5, H * .1, c.width / 2, c.height * .5, H * .75); gd.addColorStop(0, 'rgba(255,236,160,.55)'); gd.addColorStop(1, 'rgba(255,220,120,0)'); k.fillStyle = gd; k.fillRect(0, 0, c.width, c.height);
    if (glow) k.drawImage(glow, pad, pad, w, H);
    k.save(); k.globalAlpha = .92; k.shadowColor = 'rgba(255,225,130,.9)'; k.shadowBlur = H * .12; k.drawImage(im, pad, pad, w, H); k.restore();
    k.globalCompositeOperation = 'source-atop'; k.fillStyle = 'rgba(255,215,110,.28)'; k.fillRect(pad, pad, w, H);   // a warm gold cast
    IM.athena_parthenos = c; this.sprite = { name: 'athena_parthenos', w: c.width, h: c.height, ax: c.width / 2, ay: pad + H }; return this.sprite;
  }
  stillName() { const n = this.cfg.parthenos.still; return aiAssets[n] || (stillList.has('art/stills/' + n + '.jpg') ? 'art/stills/' + n + '.jpg' : null); }
  async play(kind = 'parthenos') {
    const G = this.G; if (this.running || G.busy || !this.cfg) return; this.running = true; G.busy = true; input.enabled = false; ui.hud(false); ui.setPrompt(null);
    const c = this.cfg.parthenos, r = this.rect(), spr = await this.build(), line = kind === 'finale' ? this.cfg.finale.line : c.line;
    this.mark(kind === 'finale' ? this.cfg.finale.sticker : c.sticker);
    const beats = [{ t: 'camera.set', to: [r.cx, r.cy - 40], zoom: 1, abs: true }];
    const still = this.stillName(); if (still) beats.push({ t: 'still', image: c.still, ms: 2600, kenBurns: { from: 1, to: 1.08 }, optional: true });
    beats.push({ t: 'fx', type: 'wash', alpha: .3, ms: 1200, color: c.gold, par: true });
    if (spr) beats.push({ t: 'actor.spawn', id: 'parthenos', sprite: spr.name, x: r.cx, y: r.cy + 10, abs: true, anchor: [spr.ax, spr.ay], ghost: true, ms: 2600, shadow: 0, glow: true, z: 3000 });   // z lifts her above the temple objects that would redraw over her
    beats.push({ t: 'camera.zoom', scale: 1.15, ms: 2400, at: [r.cx, r.cy - 40], abs: true, par: true });
    beats.push({ t: 'wait', ms: 2400 });
    beats.push({ t: 'caption', speaker: c.speaker, text: line, mood: 'neutral', audio: 'vision-parthenos-1' });
    beats.push({ t: 'wait', ms: 500 });
    if (spr) beats.push({ t: 'actor.remove', id: 'parthenos', ms: 1800 });
    beats.push({ t: 'fx', type: 'wash', alpha: 0, ms: 1400 });
    const sc = new Scene(G, { id: 'vision-' + kind, speaker: c.speaker, bars: false, startDelay: 200, beats }, { interactive: true }); G.scene = sc; sfx.choir && sfx.choir();
    ui.showSkip(() => sc.skip());
    try { await sc.run(); } catch (e) { console.error(e); }
    ui.hideSkip(); G.scene = null; G.busy = false; G.mode = 'play'; input.enabled = true; ui.hud(true); this.running = false;
  }
}
