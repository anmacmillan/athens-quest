// The changing of the guard at Syntagma: the two evzones (standing figures from data/characters.json, story 'evzones') swap posts in the famous slow march:
// high stamping steps, iron-nailed shoes (thud), moving as if time had slowed. It starts when the player taps a guard, on a 3-minute timer while in Syntagma, and on the hour by the real clock.
import { dist } from './util.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';

export class Evzones {
  constructor(G) { this.G = G; this.c = null; this.parts = []; this.state = 'idle'; this.t = 150; this.hourDone = -1; this.legs = []; window.__evz = this; }
  init() {
    const ch = this.G.chars; this.c = ch && ch.standing && ch.standing('evzones'); if (!this.c) return;
    const b = this.c.parts.find(p => p.who === 'evzone'); if (!b) { this.c = null; return; }
    this.a = this.c; this.b = b; this.home = [{ x: this.a.x, y: this.a.y }, { x: b.x, y: b.y }]; this.a.lines = this.a.lines || ['Shh. I am on duty.']; this.a.noGest = this.b.noGest = true;
  }
  get ready() { return !!this.c; }
  start() {
    if (!this.c || this.state !== 'idle') return false; const [A, B] = this.home, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    // A passes on the north side, B on the south, so they never collide; each pauses and stamps at the post
    this.legs = [[{ x: A.x, y: A.y - 12 }, { x: mx, y: my - 14 }, { x: B.x, y: B.y - 12 }, { x: B.x, y: B.y }], [{ x: B.x, y: B.y + 12 }, { x: mx, y: my + 14 }, { x: A.x, y: A.y + 12 }, { x: A.x, y: A.y }]];
    this.os = [this.a, this.b]; this.wp = [0, 0]; this.state = 'march'; this.ph = 0; this.done = 0; this.t = 180; return true;
  }
  update(dt) {
    const G = this.G; if (!this.c) return;
    this.a.gT = this.b.gT = 1e9; this.a.gest = this.b.gest = 0;   // guards never fidget
    if (G.world.id !== 'syntagma') return;
    if (this.state === 'idle') {
      this.t -= dt; const now = new Date(), h = now.getHours();
      if (now.getMinutes() === 0 && this.hourDone !== h) { this.hourDone = h; this.start(); }
      else if (this.t <= 0 && !G.scene && !G.busy) this.start();
      return;
    }
    const near = dist(G.player.x, G.player.y, this.a.x, this.a.y) < 240; this.ph += dt * .9; const sp = 15;   // one stamp about every 1.1 s: slow motion
    let finished = 0;
    this.os.forEach((o, i) => {
      const L = this.legs[i];
      if (this.wp[i] >= L.length) { finished++; o.sprite = null; o.lift = 0; return; }
      const q = L[this.wp[i]], d = dist(o.x, o.y, q.x, q.y), step = sp * dt;
      if (d <= step) { o.x = q.x; o.y = q.y; this.wp[i]++; } else { o.x += (q.x - o.x) / d * step; o.y += (q.y - o.y) / d * step; o.flip = q.x < o.x; }
      const ph = (this.ph + i * .5) % 1, name = ph < .5 ? 'c_evzone_1' : 'c_evzone_2'; o.sprite = name; o.anchor = (G.anchors || {})[name] || null; o.lift = Math.round(Math.sin(Math.PI * ph) * 3);
      if (o.lastPh !== undefined && o.lastPh > ph && near) { sfx.thud && sfx.thud(); }
      o.lastPh = ph;
    });
    if (finished === 2) { this.os.forEach(o => { o.sprite = null; o.lift = 0; o.flip = false; }); [this.a.lines, this.b.lines] = [this.b.lines, this.a.lines]; this.home.reverse(); this.state = 'idle'; ui.toast('The guard has changed. Not a smile in sight.', 2600); }
  }
  // a tap on either guard starts the change; returns true when it consumed the tap
  tap(w) {
    if (!this.c || this.G.world.id !== 'syntagma') return false;
    const hit = [this.a, this.b].some(o => dist(w.x, w.y, o.x, o.y - 14) < 18); if (!hit) return false;
    if (this.state === 'idle') { ui.toast('Change of guard! Watch the slow march.', 2400); sfx.tap(); this.start(); } else ui.toast('Shh... they are marching.', 1400);
    return true;
  }
}
