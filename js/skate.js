// Skateboard: every player owns one. On streets, lanes and gravel (data/skate.json "rideable") the girl rolls at about twice walking speed with a little
// momentum; on grass, steps, rough ground and archaeological dust she steps off automatically, and on the Acropolis summit and in the Agora a guard whistles
// (once per player) and she tucks the board under her arm. A HUD button toggles the board; the choice is remembered per player on this device.
import { g, shadowAt } from './render.js';
import { R, el, $, lsGet, lsSet } from './util.js';
import { me } from './store.js';
import { sfx } from './audio.js';
import * as ui from './ui.js';
import { equipped } from './economy.js';
import { CW, CH, FEET } from './player.js';

const DECKS = { deck_meander: ['#3d7fd6', '#f5c542'], deck_owl: ['#8a5a2c', '#f0d7a8'], deck_medusa: ['#2fa58a', '#f5c542'], deck_parthenon: ['#e8dcc0', '#c9a050'], default: ['#e8443c', '#f5c542'] };
export class Skate {
  constructor(game) { this.G = game; this.cfg = null; this.vx = 0; this.vy = 0; this.ground = false; this.carry = false; this.zone = null; this.rollT = 0; this.kickT = 0; this.btn = null; this.zones = []; this.speedNow = 0; this.pushing = false; }
  async init() {
    try { this.cfg = await (await fetch('data/skate.json')).json(); } catch (e) { this.cfg = { rideable: 'Slp', zones: [], maxMul: 2 }; }
    const A = this.G.worlds.athens; this.zones = (this.cfg.zones || []).map(z => { const a = A.project(z.rect[0], z.rect[1]), b = A.project(z.rect[2], z.rect[3]); return { id: z.id, label: z.label, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }; });
    const bar = $('topbtns'); if (bar && !$('bSkate')) { this.btn = el('button', { id: 'bSkate', class: 'btn small', onclick: () => { this.toggle(); } }); bar.prepend(this.btn); }
    this.sync();
  }
  key(s) { const p = me(); return `owlq.skate.${s}.${p ? p.name : ''}`; }
  get pref() { return lsGet(this.key('on'), true); }
  toggle() { lsSet(this.key('on'), !this.pref); if (!this.pref) { this.vx = this.vy = 0; } this.sync(); sfx.clack(); ui.toast(this.pref ? 'Board on. Streets are fast now.' : 'Board under your arm. Walking.', 1800); }
  sync() { if (this.btn) { this.btn.textContent = this.pref ? 'Walk' : 'Board'; this.btn.title = this.pref ? 'Step off the skateboard' : 'Ride the skateboard'; } }
  // is she on the board right now?
  active() {
    const G = this.G, W = G.world; if (W.kind !== 'live' || G.comp.mount || G.comp.ride || G.scene) return false;
    return this.pref && !this.carry && this.ground;
  }
  codeAt(W, p) { return W.code(p.x, p.y); }
  inZone(W, p) { if (W.id !== 'athens') return null; for (const z of this.zones) if (p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) return z; return null; }
  update(dt) {
    const G = this.G, W = G.world, p = G.player; if (W.kind !== 'live' || !this.cfg) { this.ground = false; return; }
    const code = this.codeAt(W, p), zone = this.inZone(W, p);
    this.ground = !!code && this.cfg.rideable.includes(code) && !(code === 'P');
    if (zone && !this.zone) {   // stepping into a monument area
      if (this.pref && this.speedNow > 5 || this.pref && this.ground) {
        const wk = this.key('warn.' + zone.id), first = !lsGet(wk, false);
        if (first) { lsSet(wk, true); sfx.whistle && sfx.whistle(); ui.toast(this.cfg.whistle, 3200); } else ui.toast('Board under your arm.', 1400);
      }
    }
    this.zone = zone; const wasCarry = this.carry; this.carry = !!zone && this.pref; if (this.carry && !wasCarry) sfx.clack(); if (this.carry) this.vx = this.vy = 0;
    if (this.active() && this.speedNow > 8) { this.rollT += dt; if (this.rollT > .11) { this.rollT = 0; sfx.roll && sfx.roll(this.speedNow); } }
  }
  // called from Game.movePlayer with the wanted direction; returns true if it moved the player
  drive(dt, dx, dy) {
    const G = this.G, W = G.world, p = G.player; if (!this.active()) { this.vx = this.vy = 0; this.speedNow = 0; this.pushing = false; return false; }
    const max = (this.cfg.maxMul || 2) * 100 * Math.min(1, Math.hypot(dx, dy) || 0), want = Math.hypot(dx, dy) > .05;
    const l = Math.hypot(dx, dy) || 1, tx = want ? dx / l * max : 0, ty = want ? dy / l * max : 0;
    const k = want ? 2.6 : 0.9;   // push eases in, coasting rolls out
    this.vx += (tx - this.vx) * Math.min(1, dt * k); this.vy += (ty - this.vy) * Math.min(1, dt * k);
    const sp = Math.hypot(this.vx, this.vy); this.speedNow = sp; this.pushing = want && sp < max * .85; if (this.pushing) { const kk = Math.floor(this.kickT / 2); if (kk !== this._kk) { this._kk = kk; sfx.push(); } }
    if (sp < 3) { p.moving = false; this.vx = this.vy = 0; return true; }
    const ok = (x, y) => !(W.solid(x - 4, y) || W.solid(x + 4, y) || W.solid(x, y + 1) || W.solid(x, y - 3));
    const nx = p.x + this.vx * dt, ny = p.y + this.vy * dt; let moved = false;
    if (ok(nx, ny)) { p.x = nx; p.y = ny; moved = true; } else if (ok(nx, p.y)) { p.x = nx; this.vy = 0; moved = true; } else if (ok(p.x, ny)) { p.y = ny; this.vx = 0; moved = true; } else { this.vx = this.vy = 0; }
    p.moving = moved; p.skating = true;
    p.facing = Math.abs(this.vx) > Math.abs(this.vy) ? (this.vx > 0 ? 'r' : 'l') : (this.vy > 0 ? 'f' : 'b'); p.walkT += dt; this.kickT += dt * (this.pushing ? 5 : 0);
    return true;
  }
  deck() { const id = equipped('board'), c = DECKS[id] || DECKS.default; return c; }
  // draws the girl standing on the board (rolling or stopped); returns true if it drew. still = flight/intro preview
  draw(p, sheet, fr, still) {
    const G = this.G, W = G.world; if (W.kind !== 'live' && !still) return false;
    const on = still ? this.pref : this.active(), tucked = this.carry || (!on && this.pref === false);
    if (!on && !(this.carry && this.pref)) return false;
    const f = p.facing || 'f', t = G.time, [c1, c2] = this.deck();
    if (this.carry) { shadowAt(p.x, p.y, 14, .3); this.drawBody(sheet, p, f, fr); this.drawTucked(p, f, c1, c2); return true; }
    const moving = p.moving && !still, bob = moving ? Math.round(Math.sin(t * 20) * .6) : 0, side = f === 'l' || f === 'r';
    shadowAt(p.x, p.y, 16, .3);
    // board: deck seen from the side or end-on, four wheels
    const bx = R(p.x), by = R(p.y);
    if (side) { g.fillStyle = '#3a2c4c'; g.fillRect(bx - 9, by - 4, 18, 3); g.fillStyle = c1; g.fillRect(bx - 8, by - 4, 16, 2); g.fillStyle = c2; g.fillRect(bx - 8, by - 4, 16, 1); g.fillStyle = c1; g.fillRect(bx - 11, by - 5, 2, 1); g.fillRect(bx + 9, by - 5, 2, 1);
      g.fillStyle = '#f0e6c8'; g.fillRect(bx - 6, by - 1, 3, 2); g.fillRect(bx + 3, by - 1, 3, 2); g.fillStyle = '#5b3a29'; g.fillRect(bx - 5, by, 1, 1); g.fillRect(bx + 4, by, 1, 1); }
    else { g.fillStyle = '#3a2c4c'; g.fillRect(bx - 5, by - 4, 10, 3); g.fillStyle = c1; g.fillRect(bx - 4, by - 4, 8, 2); g.fillStyle = c2; g.fillRect(bx - 4, by - 4, 8, 1); g.fillStyle = '#f0e6c8'; g.fillRect(bx - 6, by - 1, 2, 2); g.fillRect(bx + 4, by - 1, 2, 2); }
    // the girl, standing on the deck; a push-kick: the sheet's step frame plus one foot reaching the ground behind
    const kick = !still && this.pushing && Math.floor(this.kickT) % 2 === 0;
    const av = sheet.width >= CW * 5;   // the avatar sheet carries skateboard frames: 3 glide, 4 push
    this.drawBody(sheet, { x: p.x, y: p.y - 4 + bob }, f, av ? (kick ? 4 : 3) : (kick ? 1 : 0));
    if (kick && !av) { const dir = f === 'l' ? 1 : f === 'r' ? -1 : 0; g.fillStyle = '#f7cfa8'; g.fillRect(bx + dir * 9 - 1, by - 4, 2, 4); g.fillStyle = '#8a5c3c'; g.fillRect(bx + dir * 9 - 1, by - 1, 3, 1); }
    return true;
  }
  drawBody(sheet, p, f, fr) { const ROW = { f: 0, b: 1, l: 2, r: 3 }; g.drawImage(sheet, fr * CW, ROW[f] * CH, CW, CH, R(p.x - CW / 2), R(p.y - FEET), CW, CH); }
  drawTucked(p, f, c1, c2) { const side = f === 'r' ? 6 : f === 'l' ? -6 : 7; g.fillStyle = '#3a2c4c'; g.fillRect(R(p.x + side) - 2, R(p.y) - 24, 4, 12); g.fillStyle = c1; g.fillRect(R(p.x + side) - 1, R(p.y) - 23, 2, 10); g.fillStyle = c2; g.fillRect(R(p.x + side) - 1, R(p.y) - 23, 1, 10); }
}
