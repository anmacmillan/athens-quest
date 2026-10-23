// Soft map edges, so there are no invisible walls: a vignette that deepens towards the edge (sea haze on the sea side), Glauka's line when you get there, the busy ring road
// heard beyond some edges, and exit signposts that are not in the game yet ('To Syntagma ...') which politely bounce you back. Data-driven from data/edges.json.
import { g, V, viewRect } from './render.js';
import { clamp, dist } from './util.js';
import { trafficNoise } from './audio.js';
import { Scene } from './scene.js';
import * as ui from './ui.js';

export class Edges {
  constructor(G) { this.G = G; this.D = {}; this.cool = 0; this.dist = { n: 1e9, e: 1e9, s: 1e9, w: 1e9 }; this.k = 0; this.bn = 0; window.__edges = this; }
  async init() { try { this.D = await (await fetch('data/edges.json')).json(); } catch (e) { this.D = {}; } }
  cfg() { return this.D[this.G.world.id]; }
  update(dt) {
    const G = this.G, W = G.world, c = W.kind === 'live' ? this.cfg() : null; this.cool -= dt;
    if (!c || G.scene || G.flight || G.busy) { this.k = Math.max(0, this.k - dt * 2); if (!c) trafficNoise(0); return; }
    const p = G.player, T = W.T, M = (c.margin || 7) * T;
    const d = { n: p.y, s: W.h - p.y, w: p.x, e: W.w - p.x }; this.dist = d;
    let side = null, m = 1e9; for (const s in d) if (d[s] < m) { m = d[s]; side = s; }
    this.k = clamp(1 - m / M); this.side = side;
    let tr = 0; for (const s of c.noise || []) tr = Math.max(tr, clamp(1 - d[s] / (M * 1.6)));
    trafficNoise(tr * .9);
    if (m < 2.6 * T && this.cool <= 0) { this.cool = 28; ui.toast('Glauka: ' + ((c.sides && c.sides[side]) || c.default || 'The stories are this way!'), 4200); }
  }
  draw() {   // screen-space vignette (called after the world, before captions)
    if (this.k <= .02) return; const G = this.G, W = G.world; if (W.kind !== 'live' || G.scene) return;
    const c = this.cfg(), cam = G.cam, M = (c.margin || 7) * W.T; const view = viewRect({ x: cam.x, y: cam.y, z: cam.z });
    // for each side, a strip whose strength follows the distance from the player to that side
    const edge = { n: [0, 0, V.W, 1, 0, 1], s: [0, 0, V.W, 1, 0, -1], w: [0, 0, 1, V.H, 1, 0], e: [0, 0, 1, V.H, -1, 0] };
    for (const s of ['n', 's', 'w', 'e']) {
      const a = clamp(1 - this.dist[s] / M); if (a <= .01) continue; const haze = c.haze && c.haze[s], col = haze || '#1b1424', rgb = col === '#1b1424' ? '27,20,36' : '184,216,232';
      const len = Math.round(V.H * .55 * a + 20), hor = s === 'n' || s === 's';
      let gr; const al = (haze ? .78 : .62) * a;
      if (s === 'n') gr = g.createLinearGradient(0, 0, 0, len); else if (s === 's') gr = g.createLinearGradient(0, V.H, 0, V.H - len); else if (s === 'w') gr = g.createLinearGradient(0, 0, len, 0); else gr = g.createLinearGradient(V.W, 0, V.W - len, 0);
      gr.addColorStop(0, `rgba(${rgb},${al.toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, V.W, V.H);
    }
  }
  // an exit signpost that goes nowhere yet: Glauka says so and the girl is walked back a little
  async bounce(sign) {
    const G = this.G; if (G.scene || G.busy) return; const lines = (this.D.bounce || {})[sign.bounce] || ['Not that way!'], line = lines[Math.floor(Math.random() * lines.length)];
    G.busy = true; const W = G.world, p = G.player, cx = W.w / 2, cy = W.h / 2, d = dist(p.x, p.y, cx, cy) || 1;
    const sc = new Scene(G, { id: 'bounce-' + sign.id, speaker: 'glauka', bars: false, startDelay: 50, beats: [{ t: 'caption', speaker: 'glauka', text: line, hold: 2600 }] }, { interactive: true }); G.scene = sc;
    try { await sc.run(); } catch (e) { console.error(e); } G.scene = null;
    // step back towards the middle of the map, onto walkable ground
    const q = W.nearestWalkable(p.x + (cx - p.x) / d * 110, p.y + (cy - p.y) / d * 110); p.x = q.x; p.y = q.y; G.owl.x = p.x - 18; G.owl.y = p.y - 4; p.goto = null; G.busy = false;
  }
}
