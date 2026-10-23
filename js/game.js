// Game core: zones (live maps, Greece, stage sets), story spots, signposts, camera flights, scene/quiz flow, save.
import { g, IM, V, beginWorld, endWorld, viewRect, clampCam, present, toWorld, shadowAt, px, label, text, textW } from './render.js';
import { clamp, lerp, seg, eio, R, dist, lsGet, lsSet } from './util.js';
import { Worlds, Zones } from './world.js';
import { input, pollDir } from './input.js';
import { Scene } from './scene.js';
import { pennant } from './markers.js';
import { sheetFor, drawPlayer, unlocks } from './player.js';
import { store, me, award, badgeCount, touch } from './store.js';
import { earnOwls, REWARDS } from './economy.js';
import { sfx, unlock, music } from './audio.js';
import { updateSoundscape } from './soundscape.js';
import * as ui from './ui.js';
import { loadComic, playComic } from './comic.js';
import { Theseus } from './theseus.js';
import { loadMinigames, playMinigame } from './minigame.js';
import { Skate } from './skate.js';
import { Opening } from './opening.js';
import { Companions } from './companions.js';
import { Extras } from './extras.js';
import { Visions } from './visions.js';
import { Guide } from './guide.js';
import { Marks } from './marks.js';
import { Fog } from './fog.js';
import { Characters } from './characters.js';
import { Gods } from './gods.js';
import { Evzones } from './evzones.js';
import { FlyTo } from './flyto.js';
import { Edges } from './edges.js';
import { Passport } from './passport.js';
import { TitleCard } from './titlecard.js';
import { astar } from './companions.js';

const SPEED = { live: 100, map: 80, stage: 58 };
export class Game {
  constructor() {
    this.worlds = Worlds; this.world = Worlds.athens; this.time = 0; this.mode = 'play';
    this.player = { x: 0, y: 0, facing: 'f', moving: false, walkT: 0, goto: null }; this.owl = { x: 0, y: 0 };
    this.cam = { x: 0, y: 0, z: 1 }; this.scene = null; this.busy = false; this.nearest = null; this.stories = []; this.spots = []; this.target = null; this.heading = null; this.gps = null;
    this.comp = new Companions(this); this.guide = new Guide(this); this.marks = new Marks(this); this.fog = new Fog(this); this.extras = new Extras(this); this.chars = new Characters(this); this.gods = new Gods(this); this.vis = new Visions(this); this.evz = new Evzones(this); this.fly = new FlyTo(this); this.edges = new Edges(this); this.skate = new Skate(this); this.opening = new Opening(this); this.passport = new Passport(this); this.title = new TitleCard(this); this.trans = null; this.flight = null; this.sceneCache = {}; this.saved = {};
  }
  // ------------------------------------------------------------ setup
  async init(stories) {
    this.stories = stories; this.buildSpots(); await this.passport.init();
    await this.marks.init(); this.title.bind(this.marks.landmarks); await this.fog.init(this.worlds.athens); this.worlds.athens.fog = this.fog;   // high-res markers and names, and the light fog of discovery
    this.theseus = new Theseus(this);
    try { this.anchors = await (await fetch('data/cast_anchors.json')).json(); } catch (e) { this.anchors = {}; }
    const A = this.worlds.athens, prop = this.spotById('propylaia'), p0 = prop ? A.clearSpot(prop.x + 8, prop.y + 38) : A.nearestWalkable(A.w / 2, A.h / 2);
    this.saved.athens = { x: p0.x, y: p0.y };
    for (const id in this.worlds) if (!this.saved[id]) {
      const w = this.worlds[id], z = Zones[id]; if (!z) continue;
      const s = w.signposts[0], back = w.signposts.find(q => q.to === 'athens') || s;
      if (w.kind === 'stage') this.saved[id] = { x: w.spawn[0], y: w.spawn[1] };
      else if (id === 'greece') { const q = this.landPos(w, 'athens'); this.saved[id] = q; }
      else this.saved[id] = this.landPos(w, 'athens');
    }
    const sv = lsGet('owlq.pos2', null);
    if (sv && sv.athens && A.walkable(sv.athens.x, sv.athens.y)) this.saved.athens = sv.athens;
    const SY = this.worlds.syntagma; let startZone = 'athens';
    if (SY) { const d = this.hotelDoor(); this.saved.syntagma = d; if (sv && sv.zone === 'syntagma' && sv.syntagma && SY.walkable(sv.syntagma.x, sv.syntagma.y)) { this.saved.syntagma = sv.syntagma; startZone = 'syntagma'; } }
    this.nudgeSpots(); this.frontDoors(); await this.comp.init().catch(e => console.error(e)); await this.extras.init().catch(e => console.error(e)); await this.chars.init().catch(e => console.error(e)); await this.gods.init().catch(e => console.error(e)); await this.vis.init().catch(e => console.error(e)); this.evz.init(); await this.edges.init(); await this.skate.init().catch(e => console.error(e)); await this.opening.init().catch(e => console.error(e));
    this.enterWorld(startZone, false);
    input.onLong = v => this.fly.long(v); input.onZoom = d => this.guide.zoomStep(d); input.onWheel = (dy, c) => this.guide.onWheel(dy, c); this.guide.init();
    input.onTap = (v, blocked) => this.onTap(v, blocked); input.onA = () => this.onA(); input.onDoubleTap = v => this.onDoubleTap(v);
    input.panMode = () => this.world.kind === 'live' && this.cam.z < .6 && this.mode === 'play' && !this.busy && !this.scene; input.onPan = (dx, dy) => { this.panHold = true; this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; clampCam(this.cam, this.world.w, this.world.h); };
    window.__game = this;
  }
  // the hotel's front door in Syntagma (a few steps south of it, on the pavement)
  hotelDoor() { const W = this.worlds.syntagma; if (!W) return null; const q = W.project(37.97831, 23.73299); return W.clearSpot ? W.clearSpot(q.x, q.y) : W.nearestWalkable(q.x, q.y); }
  // where you land when you arrive from zone `src`: beside the signpost that leads back
  landPos(w, src) {
    let s = w.signposts.find(q => q.to === src) || (['academy', 'lyceum'].includes(src) ? w.signposts.find(q => q.to === 'athens') : null);
    if (s) { let p = { x: s.x, y: s.y + (w.kind === 'map' ? 12 : 26) }; if (w.kind === 'live') p = w.nearestWalkable(p.x, p.y); return p; }
    if (w.spawn) return { x: w.spawn[0], y: w.spawn[1] };
    return { x: w.w / 2, y: w.h / 2 };
  }
  buildSpots() {
    this.spots = [];
    const stages = Object.keys(Zones).filter(id => Zones[id].kind === 'stage');
    for (const s of this.stories) {
      let zone = s.pos.zone || 'athens', lat = s.pos.lat, lon = s.pos.lon;
      if (zone === 'greece' && lat !== undefined) {   // a Greece stop that sits in a walkable stage zone moves into it
        for (const id of stages) { const gz = Zones[id].geo; if (Math.hypot((lat - gz.lat) * 111, (lon - gz.lon) * 88) < 5) { zone = id; break; } }
      }
      const W = this.worlds[zone] || this.worlds.athens;
      const p = lat !== undefined ? W.project(lat, lon) : { x: s.pos.x, y: s.pos.y };
      if (W.kind === 'stage' && W.bounds) { p.x = clamp(p.x, W.bounds[0] + 16, W.bounds[2] - 16); p.y = clamp(p.y, W.bounds[1] + 24, W.bounds[3] - 8); }
      this.spots.push({ story: s, id: s.id, world: W.id, x: p.x, y: p.y, i: this.spots.length, main: !!s.main });
    }
    // fan out spots that share a place
    for (const id in this.worlds) {
      const gs = this.spots.filter(s => s.world === id), done = new Set(), W = this.worlds[id];
      for (const a of gs) {
        if (done.has(a)) continue;
        const grp = gs.filter(b => !done.has(b) && dist(a.x, a.y, b.x, b.y) < (W.kind === 'map' ? 9 : 18)); grp.forEach(b => done.add(b));
        if (grp.length > 1) { const R0 = W.kind === 'map' ? 13 : 30; grp.forEach((b, k) => { const th = -Math.PI / 2 + k / grp.length * Math.PI * 2; b.x = a.x + Math.cos(th) * R0; b.y = a.y + Math.sin(th) * R0 * .8; if (W.kind === 'live') { const q = W.nearestWalkable(b.x, b.y, 4); if (!W.solid(b.x, b.y)) { } } }); }
      }
    }
  }
  spotById(id) { return this.spots.find(s => s.id === id); }
  collected(id) { const p = me(); return !!(p && p.badges[id]); }
  mainStories() { const m = this.stories.filter(s => s.main); return m.length ? m : this.stories; }
  sheet() { const p = me(), n = this.stories.filter(s => p && p.badges[s.id]).length, M = this.mainStories(); return sheetFor(p ? p.costume : {}, unlocks(n, M.length && M.every(s => p && p.badges[s.id]))); }
  enterWorld(id, keepPos = true) {
    if (keepPos && this.world) this.saved[this.world.id] = { x: this.player.x, y: this.player.y };
    this.world = this.worlds[id]; const s = this.saved[id] || { x: this.world.w / 2, y: this.world.h / 2 };
    this.player.x = s.x; this.player.y = s.y; this.owl.x = s.x - 18; this.owl.y = s.y - 4; this.player.goto = null;
    this.cam.x = s.x; this.cam.y = s.y; this.cam.z = 1; clampCam(this.cam, this.world.w, this.world.h);
  }
  // ------------------------------------------------------------ entities
  spotEntities(wid) {
    const out = [], t = this.time, id = wid || (this.scene ? this.scene.world.id : this.world.id), W = this.worlds[id];
    for (const s of this.spots) if (s.world === id) { const dr = this.passport.drawDoor(s, t); if (dr) out.push({ y: s.y - 30, draw: () => dr(g) }); out.push({ y: s.y, draw: () => this.drawSpot(s, t) }); }
    for (const s of W.signposts) out.push({ y: s.y, draw: () => this.drawSign(s, W) });
    out.push(...this.comp.ents(W)); out.push(...this.extras.ents(W)); out.push(...this.chars.ents(W)); out.push(...this.gods.ents(W));
    if (this.gps && this.gps.world === id) out.push({ y: this.gps.y, draw: () => { const r = 3 + Math.sin(t * 4); g.fillStyle = 'rgba(60,130,255,.35)'; g.beginPath(); g.arc(this.gps.x, this.gps.y, r + 5, 0, 7); g.fill(); g.fillStyle = '#3d7fd6'; g.beginPath(); g.arc(this.gps.x, this.gps.y, 3, 0, 7); g.fill(); } });
    return out;
  }
  drawSign(s, W) {
    shadowAt(s.x, s.y, 12, .3); g.drawImage(IM.sign, R(s.x - 8), R(s.y - 16));
    const near = this.nearest && this.nearest.kind === 'sign' && this.nearest.ref === s;
    label(s.label, s.x, s.y - 30 - (near ? 2 : 0), near ? '#ffffff' : '#fff4d6', '#3a2c4c', true);
  }
  drawSpot(s, t) {
    const got = this.collected(s.id), fr = Math.floor(t * 3 + s.i) % 2, f = IM['flag_' + s.story.flag + '_' + fr] || IM.flag_history_0;
    if (!got) { const p = .5 + .5 * Math.sin(t * 3 + s.i); g.strokeStyle = `rgba(255,255,255,${(.25 + .3 * p).toFixed(2)})`; g.lineWidth = 1; g.beginPath(); g.ellipse(s.x, s.y + 1, 6 + 3 * p, 2 + p, 0, 0, 7); g.stroke(); }
    shadowAt(s.x, s.y, 6, .3); const mk = pennant(s.story.flag, t, s.i); if (mk) g.drawImage(mk.im, R(s.x - mk.ax), R(s.y - mk.ay)); else g.drawImage(f, R(s.x - 5), R(s.y - 12));   // the art lead's pennant when art/markers exists
    if (s.main && !got) { g.drawImage(IM.coin_grey, R(s.x - 7), R(s.y - 31 + Math.sin(t * 3) * 1.5)); }   // main quest flags carry a grey coin
    // the done coin is drawn by js/marks.js (small, bobbing, crisp)
    if (this.nearest && this.nearest.ref === s && !this.scene && !got) { px(s.x - 1, s.y - 22 + Math.sin(t * 6) * 1.5, 2, 5, '#ffffff'); px(s.x - 1, s.y - 15 + Math.sin(t * 6) * 1.5, 2, 2, '#ffffff'); }
  }
  playerEnts(W, pp, owl) {
    if (!pp && this.fly && this.fly.f) return [];   // carried by Glauka: drawn by fly.draw()
    const t = this.time, p = pp || this.player, o = owl || this.owl, out = [];
    if (W.kind === 'map') {
      const fr = ['ship_1_0', 'ship_1_1', 'ship_1_2', 'ship_1_1'][Math.floor(t * 3) % 4], im = IM[fr];
      out.push({ y: p.y, draw: () => { shadowAt(p.x, p.y + 2, 16, .2); g.drawImage(im, R(p.x - 15), R(p.y - 18 + Math.sin(t * 2.3))); } });
    } else {
      out.push({ y: p.y, box: { x0: p.x - 12, y0: p.y - 44, x1: p.x + 12, y1: p.y + 2 }, draw: () => { const fr = p.moving ? 1 + (Math.floor((p.walkT || 0) * 7) % 2) : 0; if ((!pp && this.comp.drawRider(p, this.sheet(), fr)) || this.skate.draw(p, this.sheet(), fr, !!pp)) return; shadowAt(p.x, p.y, 14, .3); drawPlayer(g, this.sheet(), p.x, p.y, p.facing || 'f', fr); } });
      out.push({ y: o.y + 6, box: { x0: o.x - 10, y0: o.y - 16, x1: o.x + 10, y1: o.y + 10 }, draw: () => { const fl = Math.floor(t * 5) % 2 && p.moving; const al = o.alt || 0, fl2 = o.flap !== undefined && al > 1 ? o.flap : fl; shadowAt(o.x, o.y + 12, 8 - Math.min(3, al / 8), .2); g.drawImage(this.comp.owlImg(fl2), R(o.x - 9), R(o.y - 14 - al + (o.perched ? 0 : Math.sin(t * 3) * 1.5))); } });
    }
    return out;
  }
  entities() { return [...this.playerEnts(this.world), ...this.spotEntities(this.world.id)]; }
  // ------------------------------------------------------------ frame
  frame(now) {
    const dt = Math.min(.1, (now - (this.last || now)) / 1000); this.last = now;
    if (document.hidden) return;
    this.time += dt; this.update(dt); this.render();
  }
  update(dt) {
    updateSoundscape(this); this.guide.update(dt); this.fog.update(dt); this.fly.update(dt); this.comp.update(dt); this.skate.update(dt); this.extras.update(dt); this.chars.update(dt); this.gods.update(dt); this.vis.update(); this.evz.update(dt); this.edges.update(dt);
    if (this.scene) this.scene.update(dt);
    if (this.flight) this.updateFlight(dt);
    if (this.trans) { this.trans.t += dt; if (this.trans.t >= this.trans.dur) { const r = this.trans.res; this.trans = null; r && r(); } }
    if (this.mode === 'play' && !this.scene && !this.trans && !this.busy && !this.flight) {
      this.unstick();
      this.movePlayer(dt); this.updateOwl(dt); this.passport.update(); this.title.update(dt);
      const W = this.world, p = this.player, rr = W.kind === 'map' ? 17 : 40; let best = null, bd = 1e9;
      for (const s of this.spots) if (s.world === W.id) { const d = dist(p.x, p.y, s.x, s.y); if (d < rr && d < bd) { bd = d; best = { kind: 'spot', ref: s }; } }
      for (const s of W.signposts) { const d = dist(p.x, p.y, s.x, s.y); if (d < (W.kind === 'map' ? 15 : 36) && d < bd) { bd = d; best = { kind: 'sign', ref: s }; } }
      const stl = this.comp.nearStall(); if (stl && dist(p.x, p.y, stl.ref.x, stl.ref.y) < bd) best = stl;
      if (!best !== !this.nearest || (best && this.nearest && best.ref !== this.nearest.ref)) { this.nearest = best; ui.setPrompt(best); }
      if (this.panHold && (p.moving || this.cam.z >= .6)) this.panHold = false;
      const fo = this.focus && this.focus.until > this.time ? this.focus : null;   // a tapped cluster pulls the camera to it while zooming in
      if (!this.panHold) this.cam.x += ((fo ? fo.x : p.x) - this.cam.x) * Math.min(1, dt * 6); if (!this.panHold) this.cam.y += ((fo ? fo.y : p.y - 6) - this.cam.y) * Math.min(1, dt * 6);
      clampCam(this.cam, W.w, W.h);
      this.posT = (this.posT || 0) + dt; if (this.posT > 3 && (W.id === 'athens' || W.id === 'syntagma')) { this.posT = 0; this.saved[W.id] = { x: p.x, y: p.y }; lsSet('owlq.pos2', { athens: this.saved.athens, syntagma: this.saved.syntagma, zone: W.id }); }
    } else if (this.nearest) { this.nearest = null; ui.setPrompt(null); }
    ui.tick(dt);
  }
  movePlayer(dt) {
    const p = this.player, W = this.world; let [dx, dy] = pollDir();
    if (dx || dy) { if (p.goto || p.route) this.pendingAct = null; p.goto = null; p.route = null; }
    else if (p.goto) { const d = dist(p.x, p.y, p.goto.x, p.goto.y); if (d < 3 && p.route && p.route.length) { p.goto = p.route.shift(); } else if (d < 3) { p.goto = null; p.route = null; if (this.pendingAct) { const a = this.pendingAct; this.pendingAct = null; this.activate(a); } } else { dx = (p.goto.x - p.x) / d; dy = (p.goto.y - p.y) / d; } }
    if (this.skate.drive(dt, dx, dy)) return;   // rolling on the board: momentum, twice the speed
    p.skating = false;
    const sp = (SPEED[W.kind] || 58) * this.comp.speedMul() * Math.min(1, Math.hypot(dx, dy));
    p.moving = !!((dx || dy) && sp > 2);
    if (p.moving) {
      const l = Math.hypot(dx, dy) || 1, nx = p.x + dx / l * sp * dt, ny = p.y + dy / l * sp * dt;
      const ok = (x, y) => W.kind === 'map' ? !W.solid(x, y) : !(W.solid(x - 4, y) || W.solid(x + 4, y) || W.solid(x, y + 1) || W.solid(x, y - 3));
      let moved = false;
      if (ok(nx, ny)) { p.x = nx; p.y = ny; moved = true; } else if (ok(nx, p.y)) { p.x = nx; moved = true; } else if (ok(p.x, ny)) { p.y = ny; moved = true; }
      if (!moved && p.goto) { p.goto = null; p.route = null; if (this.pendingAct) { const a = this.pendingAct; this.pendingAct = null; if (a.ref && dist(p.x, p.y, a.ref.x, a.ref.y) < 60) this.activate(a); } }
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'f' : 'b'); p.walkT += dt;
    }
  }
  updateOwl(dt) {
    if (this.guide.driveOwl(dt)) return;
    const p = this.player, o = this.owl, d = dist(p.x, p.y, o.x, o.y);
    const tx = p.x + (p.facing === 'l' ? 14 : p.facing === 'r' ? -14 : 8), ty = p.y + (p.facing === 'f' ? -10 : p.facing === 'b' ? 8 : -2);
    if (d > 60) { o.x = p.x - 18; o.y = p.y; }
    const k = Math.min(1, dt * 3.2); o.x += (tx - o.x) * k; o.y += (ty - o.y) * k;
  }
  render() {
    if (this.flight) { this.renderFlight(); present(); return; }
    const t = this.time, sc = this.scene, W = sc ? sc.world : this.world, base = sc ? sc.cam : this.cam;
    g.fillStyle = '#1b1424'; g.fillRect(0, 0, V.W, V.H);
    const off = sc ? sc.camOffset() : this.gods.shakeOffset(), cam = { x: base.x + off[0] / base.z, y: base.y + off[1] / base.z, z: base.z };
    beginWorld(cam); const rect = viewRect(cam); W.draw(t, rect); const far = !sc && this.guide.far(); if (!sc && !far) this.guide.drawTrail();
    const ents = far ? [] : sc ? sc.entities() : this.entities();
    if (W.objectEntities) { const boxes = ents.filter(e => e.box).map(e => Object.assign({ fy: e.y }, e.box)); ents.push(...W.objectEntities(boxes)); }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();
    if (!sc && !far && W.hiddenBehind && W.kind === 'live' && !(this.fly && this.fly.f)) { const p = this.player; if (W.hiddenBehind(p.x, p.y)) { const fr = p.moving ? 1 + (Math.floor((p.walkT || 0) * 7) % 2) : 0; drawPlayer(g, this.sheet(), p.x, p.y, p.facing || 'f', fr, .55); } }
    if (!sc) { this.fly.draw(); }
    if (W.drawOccluders) { const gi = sc ? sc.actors.get('girl') : this.player; W.drawOccluders(rect, gi ? gi.y : 0); }
    if (sc) sc.drawWorldFx();
    endWorld();
    if (!sc) this.edges.draw();
    if (sc) sc.drawScreen();
    if (this.trans) this.drawTrans();
    present();
    if (!sc) this.marks.draw();
  }
  drawTrans() { const tr = this.trans, u = clamp(tr.t / tr.dur); if (tr.kind === 'fadeIn') { g.fillStyle = `rgba(27,20,36,${(1 - u).toFixed(3)})`; g.fillRect(0, 0, V.W, V.H); } else if (tr.kind === 'fadeOut') { g.fillStyle = `rgba(27,20,36,${u.toFixed(3)})`; g.fillRect(0, 0, V.W, V.H); } }
  // ------------------------------------------------------------ camera flights between zones
  // The camera keeps a continuous scale (metres per screen pixel) and a centre on one shared geographic plane.
  // Every zone is drawn at its true place and size, so street level -> Athens -> Attica -> the Aegean is one unbroken zoom.
  async flyTo(toId, fromSign, landAt) {
    if (this.busy || this.flight) return; const A = this.world, B = this.worlds[toId]; if (!B || B === A) return;
    this.busy = true; input.enabled = false; ui.setPrompt(null); ui.hud(false); this.nearest = null;
    this.saved[A.id] = { x: this.player.x, y: this.player.y };
    const land = landAt ? landAt : (fromSign && fromSign.arrive && B.kind === 'live') ? (() => { const q = B.project(fromSign.arrive.lat, fromSign.arrive.lon); return B.nearestWalkable(q.x, q.y); })() : this.landPos(B, A.id), gA = A.geoOf(this.player.x, this.player.y), gB = B.geoOf(land.x, land.y);
    const d = Math.hypot(gA.x - gB.x, gA.y - gB.y), mA = A.mpp, mB = B.mpp, peak = Math.max(mA, mB, d / (V.W * .5), 6);
    const dec = m => Math.log10(peak / m), tU = dec(mA) * .85, tD = dec(mB) * .85, tG = d > 50 ? .8 : .15, total = clamp(tU + tG + tD + .4, 1.4, 6.5), k = total / (tU + tG + tD + .4);
    this.flight = { A, B, land, pA: { x: this.player.x, y: this.player.y, facing: this.player.facing }, gA, gB, mA, mB, peak, tU: tU * k, tG: tG * k, tD: tD * k, pad: .2 * k, t: 0, total, m: mA, c: { x: gA.x, y: gA.y }, route: d > 50 };
    sfx.whoosh(); sfx.owlflap();
    await new Promise(res => { this.flight.res = res; });
    this.enterWorld(B.id, false); this.player.x = land.x; this.player.y = land.y; this.owl.x = land.x - 18; this.owl.y = land.y; this.player.facing = 'f'; this.cam.x = land.x; this.cam.y = land.y; clampCam(this.cam, B.w, B.h);
    this.flight = null; this.busy = false; input.enabled = true; ui.hud(true); ui.toast(B.label || toId, 2200);
  }
  // a scripted camera flight (the new-player opening): keyframes(t) -> {m, c} on the shared geographic plane; overlay(c, m, t, scr) draws labels on top
  scriptFlight(total, keyframes, overlay) {
    return new Promise(res => { this.flight = { script: keyframes, overlay, A: this.worlds.greece, B: this.worlds.athens, land: { x: -1e9, y: -1e9 }, pA: { x: -1e9, y: -1e9, facing: 'f' }, gA: { x: 0, y: 0 }, gB: { x: 0, y: 0 }, mA: 1, mB: 1, peak: 1, tU: 0, tG: 0, tD: 0, pad: 0, t: 0, total, m: 1, c: { x: 0, y: 0 }, route: false, res }; });
  }
  updateFlight(dt) {
    const f = this.flight; f.t += dt;
    if (f.script) { const r = f.script(Math.min(f.t, f.total)); f.m = r.m; f.c = r.c; if (f.t >= f.total) { const rs = f.res; f.res = null; rs && rs(); } return; }
    const { tU, tG, tD, pad } = f, ln = Math.log, t = f.t;
    let lm, cu;
    if (t < pad) { lm = ln(f.mA); cu = 0; }
    else if (t < pad + tU) { lm = lerp(ln(f.mA), ln(f.peak), eio((t - pad) / Math.max(1e-3, tU))); cu = 0; }
    else if (t < pad + tU + tG) { lm = ln(f.peak); cu = eio((t - pad - tU) / Math.max(1e-3, tG)); }
    else { lm = lerp(ln(f.peak), ln(f.mB), eio(clamp((t - pad - tU - tG) / Math.max(1e-3, tD)))); cu = 1; }
    f.m = Math.exp(lm); f.c = { x: lerp(f.gA.x, f.gB.x, cu), y: lerp(f.gA.y, f.gB.y, cu) }; f.cu = cu;
    if (t >= f.total) { const r = f.res; f.res = null; r && r(); }
  }
  renderFlight() {
    const f = this.flight, m = f.m, c = f.c, t = this.time, W = this.worlds;
    g.fillStyle = f.script && f.m > 12 ? '#3a86c8' : '#b8bb74'; g.fillRect(0, 0, V.W, V.H);
    const tf = w => { const zi = w.mpp / m, ox = (w.tl.x - c.x) / m + V.W / 2, oy = (w.tl.y - c.y) / m + V.H / 2; return { zi, ox, oy, rect: { x: -ox / zi, y: -oy / zi, w: V.W / zi, h: V.H / zi } }; };
    const set = q => g.setTransform(q.zi, 0, 0, q.zi, q.zi >= 1 ? R(q.ox) : q.ox, q.zi >= 1 ? R(q.oy) : q.oy);
    const G = W.greece, qg = tf(G);
    if (qg.zi <= 70) { g.save(); set(qg); G.draw(t, qg.rect); g.restore(); }
    const insets = Object.values(W).filter(w => w.kind === 'live' || (w.kind === 'stage' && w.zoneGeo));
    for (const w of insets) {
      const q = tf(w), sw = w.w * q.zi; if (sw < 2) continue;
      if (q.ox > V.W || q.oy > V.H || q.ox + sw < 0 || q.oy + w.h * q.zi < 0) continue;
      g.save(); set(q); g.beginPath(); g.rect(0, 0, w.w, w.h); g.clip();
      w.drawInset(q.zi, { x: Math.max(0, q.rect.x), y: Math.max(0, q.rect.y), w: Math.min(w.w, q.rect.w + q.rect.x) - Math.max(0, q.rect.x), h: Math.min(w.h, q.rect.h + q.rect.y) - Math.max(0, q.rect.y) });
      g.restore();
      if (sw < 300) { g.strokeStyle = 'rgba(58,44,76,.9)'; g.lineWidth = 1; g.strokeRect(R(q.ox) + .5, R(q.oy) + .5, R(sw), R(w.h * q.zi)); }
      if (sw > 14 && sw < 460 && w.label) label(w.label, q.ox + sw / 2, q.oy - 14, '#fff4d6', '#3a2c4c', true);
    }
    // characters while we are still close enough to see them
    for (const [w, pp, vis] of [[f.A, f.pA, f.t < f.pad + f.tU + f.tG], [f.B, { x: f.land.x, y: f.land.y, facing: 'f' }, f.t >= f.pad + f.tU + f.tG]]) {
      if (!vis || m > w.mpp * 4) continue;
      const q = tf(w); g.save(); set(q); const owl = { x: pp.x - 18, y: pp.y - 4 };
      const ents = [...this.playerEnts(w, pp, owl), ...this.spotEntities(w.id)].sort((a, b) => a.y - b.y); for (const e of ents) e.draw(); g.restore();
    }
    // route + ship token once the view is wide
    const scr = p => ({ x: (p.x - c.x) / m + V.W / 2, y: (p.y - c.y) / m + V.H / 2 });
    if (m > 12 && !f.script) {
      const a = scr(f.gA), b = scr(f.gB);
      if (f.route) { g.fillStyle = '#f5c542'; const n = Math.max(2, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 6)); for (let i = 0; i <= n; i++) g.fillRect(R(lerp(a.x, b.x, i / n)) - 1, R(lerp(a.y, b.y, i / n)) - 1, 2, 2); }
      const sh = IM['ship_1_' + [0, 1, 2, 1][Math.floor(t * 3) % 4]]; shadowAt(V.W / 2, V.H / 2 + 2, 16, .2); g.drawImage(sh, R(V.W / 2 - 15), R(V.H / 2 - 18 + Math.sin(t * 2.3)));
    }
    if (f.overlay) f.overlay(c, m, t, p => ({ x: (p.x - c.x) / m + V.W / 2, y: (p.y - c.y) / m + V.H / 2 }));
    // scale bar
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000]; let L = nice[0]; for (const n of nice) if (n / m <= 110) L = n;
    const bw = R(L / m), bx = 16, by = V.H - 18; g.fillStyle = '#1b1424'; g.fillRect(bx - 2, by - 3, bw + 4, 8); g.fillStyle = '#fff4d6'; g.fillRect(bx, by, bw, 2); g.fillRect(bx, by - 2, 1, 6); g.fillRect(bx + bw - 1, by - 2, 1, 6);
    label(L >= 1000 ? (L / 1000) + ' km' : L + ' m', bx + bw + 8, by - 8, '#fff4d6', '#1b1424');
  }
  async zoomTo(x, y, zin) {   // dive into a stop on the map (and out again)
    const z0 = this.cam.z, x0 = this.cam.x, y0 = this.cam.y, dur = 700, t0 = performance.now();
    await new Promise(res => { const st = () => { const u = clamp((performance.now() - t0) / dur), e = eio(u); this.cam.z = lerp(z0, zin, e); this.cam.x = lerp(x0, x, e); this.cam.y = lerp(y0, y, e); if (u < 1) requestAnimationFrame(st); else res(); }; st(); });
  }
  // ------------------------------------------------------------ interaction
  onTap(v, blocked) {
    if (this.scene) { this.scene.tap(); return; }
    if (this.comp.ride) { this.comp.skipRide(); return; }
    if (blocked || this.busy || this.trans || this.flight) return;
    const w = toWorld(this.cam, v.x, v.y), W = this.world;
    if (this.marks.tapCluster(v)) return; if (this.fly.tap(v, w)) return; if (this.guide.tap(v, w)) return; if (this.evz.tap(w)) return; if (this.gods.tap(w)) return; if (this.chars.tap(w)) return; if (this.extras.tap(w)) return; if (this.comp.tapPet(w)) return; if (this.comp.tapStall(w)) { if (this.comp.nearStall()) this.comp.openStall(); else { ui.toast('Walk closer.'); sfx.tap(); } return; } let best = null, bd = W.kind === 'map' ? 16 : 22;
    for (const s of this.spots) if (s.world === W.id) { const d = dist(w.x, w.y, s.x, s.y - 8); if (d < bd) { bd = d; best = { kind: 'spot', ref: s }; } }
    for (const s of W.signposts) { const d = dist(w.x, w.y, s.x, s.y - 10); if (d < bd + 6 && d < bd + 6) { bd = d; best = { kind: 'sign', ref: s }; } }
    if (best) {
      const s = best.ref;
      if (W.kind === 'map') { this.player.goto = { x: s.x, y: s.y + 6 }; this.pendingAct = best; return; }
      if (dist(this.player.x, this.player.y, s.x, s.y) < 44) this.activate(best); else { sfx.tap(); this.walkTo(s.x, s.y + 6, best); }
    } else if (W.kind === 'map') { if (!W.solid(w.x, w.y)) { this.player.goto = { x: w.x, y: w.y }; this.pendingAct = null; } }
  }
  // double-tap a building or flag: Glauka flies her to its doorway, the title slams in, then the host steps out
  onDoubleTap(v) {
    if (this.scene || this.busy || this.trans || this.flight || this.mode !== 'play' || this.world.kind !== 'live') return;
    const W = this.world, w = toWorld(this.cam, v.x, v.y), z = this.cam.z; let target = null, bd = Math.max(120, 70 / z);
    const P = this.passport.stamps || [];
    for (const st of P) if (st.spot.world === W.id) { const d = dist(w.x, w.y, st.spot.x, st.spot.y - 20); if (d < bd) { bd = d; target = st.spot; } }
    if (this.marks && this.marks.landmarks) for (const l of this.marks.landmarks) { const d = dist(w.x, w.y, l.x * W.ws, l.y * W.ws); if (d < 50 / Math.min(1, z)) { let b2 = 400, s2 = null; for (const st of P) if (st.spot.world === W.id) { const e = dist(l.x * W.ws, l.y * W.ws, st.spot.x, st.spot.y); if (e < b2) { b2 = e; s2 = st.spot; } } if (s2) { target = s2; break; } } }
    if (!target) { const h = this.fly.hitAt(w, 26 / Math.min(1, z)); if (h && h.kind === 'spot') target = h.ref; }
    this.player.goto = null; this.player.route = null; this.pendingAct = null; this.fly.closeCard();
    if (target) {
      if (!this.fly.known(target)) { ui.toast('Not discovered yet, explore!', 2200); return; }
      if (dist(this.player.x, this.player.y, target.x, target.y) < 60) { this.arrive(target); return; }
      this.fly.fly({ x: target.x, y: target.y, then: () => this.arrive(target) });
    } else {
      const q = W.solid(w.x, w.y) ? W.nearestWalkable(w.x, w.y, 12) : w; this.fly.fly({ x: q.x, y: q.y - 16 });
    }
  }
  // landed at a place: its title, a beat, then its story (if not done yet)
  arrive(spot) {
    const W = this.world; let best = null, bd = 420;
    if (this.marks && this.marks.landmarks) for (const l of this.marks.landmarks) { const d = dist(spot.x, spot.y, l.x * W.ws, l.y * W.ws); if (d < bd) { bd = d; best = l; } }
    if (best && W.id === 'athens') { this.title.away.delete(best.id); this.title.show(best); }
    const st = spot.stamp; if (st) this.passport.cool.add(st.id);
    if (this.collected(spot.id)) return;
    this.busy = true; input.enabled = false;
    setTimeout(() => { this.busy = false; input.enabled = true; if (!this.scene && this.mode === 'play') this.playStory(spot); }, best ? 1700 : 300);
  }
  unstick() {
    const W = this.world, p = this.player; if (W.kind !== 'live') return;
    if (!W.solid(p.x, p.y) && !W.solid(p.x - 4, p.y) && !W.solid(p.x + 4, p.y)) return;
    const q = W.clearSpot ? W.clearSpot(p.x, p.y + 20, 20) : W.nearestWalkable(p.x, p.y); if (q) { p.x = q.x; p.y = q.y; p.goto = null; p.route = null; }
  }
  // walk along a real path (A* over the tile grid) and do `act` on arrival
  walkTo(x, y, act) {
    const W = this.world, p = this.player; let path = null;
    if (W.kind === 'live' && W.solid(x, y)) { const q = W.nearestWalkable(x, y); x = q.x; y = q.y; }
    if (W.kind === 'live') { try { path = astar(W, { x: p.x, y: p.y }, { x, y }); } catch (e) { path = null; } }
    p.route = path && path.length > 1 ? path.slice(1).map(q => ({ x: q.x, y: q.y })) : [{ x, y }];
    if (p.route.length) { const last = p.route[p.route.length - 1]; if (dist(last.x, last.y, x, y) > 4) p.route.push({ x, y }); }
    p.goto = p.route.shift(); this.pendingAct = act || null;
  }
  activate(n) { if (n.kind === 'spot' && n.ref.id === 'parthenon' && this.collected('parthenon') && this.vis.cfg) { this.vis.play('parthenos'); return; } if (n.kind === 'stall') { sfx.tap(); this.comp.openStall(); return; } if (n.kind === 'sign') { sfx.tap(); if (!n.ref.to) this.edges.bounce(n.ref); else this.flyTo(n.ref.to, n.ref); } else this.playStory(n.ref); }
  onA() {
    unlock();
    if (this.scene) { this.scene.tap(); return; }
    if (this.mode !== 'play' || this.busy || this.trans || this.flight) return;
    if (this.nearest) this.activate(this.nearest); else if (!this.extras.aTap()) { sfx.hoot(); ui.toast('Find a flag. Hoot!'); }
  }
  async loadScene(story) {
    if (!story.scene) return null;
    if (this.sceneCache[story.id] !== undefined) return this.sceneCache[story.id];
    if (this.sceneIndex === undefined) { try { const r = await fetch('scenes/index.json'); this.sceneIndex = r.ok ? await r.json() : null; } catch (e) { this.sceneIndex = null; } }
    const file = story.scene.replace(/^scenes\//, '');
    if (this.sceneIndex && !this.sceneIndex.includes(file)) { this.sceneCache[story.id] = null; return null; }   // not written yet: story card pages instead
    try { const r = await fetch(story.scene); this.sceneCache[story.id] = r.ok ? await r.json() : null; } catch (e) { this.sceneCache[story.id] = null; }
    return this.sceneCache[story.id];
  }
  cardScene(story) {
    return { id: story.id, speaker: story.speaker, flag: story.flag, startDelay: 300, interactive: true,
      beats: story.pages.map((p, i) => ({ t: 'caption', speaker: p[2] || story.speaker, text: p[1], flag: p[0], wait: 'tap', audio: `${story.id}-${i + 1}` })) };
  }
  async playStory(spot, opts = {}) {
    if (this.busy) return; this.busy = true; input.enabled = false; ui.setPrompt(null); ui.hud(false); this.pendingAct = null; this.player.goto = null; this.player.route = null; this.player.moving = false; this.title.hide();
    const wasDone = this.collected(spot.story.id);
    const story = spot.story, comic = window.__noComic ? null : await loadComic(story.id).catch(() => null), found = await this.loadScene(story);
    await this.intro(story, found);   // (1) the owning character steps out and says hello (not for Glauka's own stories)
    const sceneData = comic ? null : (found || this.cardScene(story));   // one telling: the comic; a puppet scene only where no comic exists yet
    if (sceneData) {
      const onMap = this.world.kind === 'map';
      if (onMap) await this.zoomTo(spot.x, spot.y, 8);
      this.player.goto = null; this.player.moving = false; sfx.flourish();
      this.scene = new Scene(this, Object.assign({}, sceneData, { origin: sceneData.origin || { x: spot.x / (this.world.ws || 1), y: spot.y / (this.world.ws || 1) } }), { interactive: true });
      ui.showSkip(() => this.scene && this.scene.skip());
      try { await this.scene.run(); } catch (e) { console.error(e); }
      ui.hideSkip(); this.scene = null;
      if (onMap) { this.cam.z = 8; await this.zoomTo(this.player.x, this.player.y, 1); }
    }
    let mini = story.minigame && (await loadMinigames())[story.minigame], miniDone = false;
    const runMini = async () => { if (!mini || miniDone || window.__noMini) return; miniDone = true; const r = await playMinigame(story.minigame, mini, this, story).catch(e => { console.error(e); return null; }); if (r && r.solved && r.badge && award(r.badge.id)) { ui.toast('Badge: ' + r.badge.title + '!', 3500); ui.refresh(); }
      const pl = me(); if (r && r.solved && pl && !pl.stickers['mini:' + story.id]) { pl.stickers['mini:' + story.id] = Date.now(); touch(store.me); earnOwls(REWARDS.minigame, 'mini-game'); } };
    if (comic) { try { const full = await playComic(comic, story, { minigame: runMini }); const pl = me(); if (full && pl && !pl.stickers['comic:' + story.id]) { pl.stickers['comic:' + story.id] = Date.now(); touch(store.me); earnOwls(REWARDS.comic, 'comic'); } } catch (e) { console.error(e); } }
    await runMini();   // before the quiz if the comic did not stop for it
    if (!opts.replay && !this.collected(story.id)) {
      const ok = await ui.quiz(story, this);
      if (ok) { if (ok === 'first') earnOwls(REWARDS.quizFirst, 'first try'); award(story.id); const gift = this.passport.reward(story); sfx.win(); await ui.earned(story, this, gift); this.checkTrails(); }
    }
    // overlays opened while busy (quiz, badge) leave mode at 'ui'; hand control back explicitly
    ui.closeOverlay && ui.closeOverlay();
    this.busy = false; this.mode = 'play'; input.enabled = true; ui.hud(true); ui.refresh();
    if (!opts.replay && !wasDone && this.collected(story.id) && this.theseus) this.theseus.after(story);   // Theseus quest: Glauka offers the next leg
  }
  // in-world greeting: the story's speaker appears beside the player as a sprite and speaks one or two lines, with their portrait beside the caption
  async intro(story, sceneData) {
    const st = this.passport.ofStory(story.id), sp = (st && st.host) || story.speaker;
    if (!sp || sp === 'glauka' || (sceneData && sceneData.intro === false && !st)) return;
    if (this.greet === undefined) { try { this.greet = await (await fetch('data/greetings.json')).json(); } catch (e) { this.greet = {}; } }
    const lines = st && st.hello ? [st.hello] : (story.greeting || this.greet[story.id] || this.greet[sp] || this.greet.default);
    if (!lines || !lines.length || !(IM['c_' + sp + '_0'] || (this.chars && this.chars.has(story.id)))) return;
    const p = this.player, sx = p.x + 30, sy = p.y + 2;
    const standing = this.chars && this.chars.has(story.id) && (!st || st.host === story.speaker);   // already standing at the flag: greet from there, no second sprite
    const beats = standing ? [] : [{ t: 'actor.spawn', id: sp, sprite: 'c_' + sp + '_0', x: sx, y: sy, abs: true, ghost: true, ms: 900, shadow: 12, anchor: this.anchorOf(sp) }];
    lines.slice(0, st ? 1 : 2).forEach((l, i) => beats.push({ t: 'caption', speaker: sp, actor: sp, text: l, hold: 1500, mood: 'neutral', audio: `intro-${sp}-${i + 1}` }));
    if (st && st.feature) {   // one thing to look for, with a close-up in a bubble
      if (st.image) beats.push({ t: 'bubble', image: st.image, label: 'Look!', par: true });
      beats.push({ t: 'caption', speaker: sp, actor: sp, text: st.feature, wait: 'tap', mood: 'neutral', audio: `feature-${st.id}` });
      if (st.image) beats.push({ t: 'bubble', off: true });
    }
    if (!standing) beats.push({ t: 'actor.remove', id: sp, ms: 500 });
    const sc = new Scene(this, { id: 'intro-' + sp, speaker: sp, bars: false, startDelay: 100, beats }, { interactive: true }); this.scene = sc;
    setTimeout(() => { if (this.scene === sc && !sc.skipping) this.title.showChar(sp); }, standing ? 150 : 650);
    ui.showSkip(() => sc.skip());
    try { await sc.run(); } catch (e) { console.error(e); }
    sc.bubbleOff && sc.bubbleOff(); ui.hideSkip(); this.scene = null;
  }
  anchorOf(sp) { const im = IM['c_' + sp + '_0'], a = (this.anchors || {})['c_' + sp + '_0']; return a || [im.width / 2, im.height - 1]; }
  checkTrails() {
    const p = me(); if (!p) return; const S = this.stories, M = this.stories.filter(s => s.main);
    const trails = [
      { id: 'trail:main', title: 'Main Quest complete', set: M },
      { id: 'trail:Theseus Quest', title: 'Theseus Quest', set: ['tribute', 'labyrinth', 'naxos', 'aegeus'].map(id => S.find(s => s.id === id)).filter(Boolean) },
      { id: 'trail:acropolis', title: 'Acropolis Explorer', set: S.filter(s => /acropolis|erechtheion/i.test(s.area)) },
      { id: 'trail:mycenae', title: 'Lion Gate Explorer', set: S.filter(s => /mycenae/i.test(s.area)) },
      { id: 'trail:myths', title: 'Myth Hunter', set: S.filter(s => s.flag === 'myth') },
      { id: 'trail:philosophers', title: 'Philosophers', set: S.filter(s => /academy|lyceum/i.test(s.pos.zone || '')) },
      { id: 'trail:greece', title: 'Aegean Traveller', set: S.filter(s => s.pos && s.pos.zone && s.pos.zone !== 'athens') },
    ];
    for (const t of trails) { if (t.set.length < 2 || p.badges[t.id]) continue; if (t.set.every(s => p.badges[s.id])) { award(t.id); ui.toast('Trail badge: ' + t.title + '!', 3500); if (t.id === 'trail:main') { sfx.triumph(); const rel = music.hold('finale'); setTimeout(rel, 45000); } } }
    if (this.passport.complete('athens') && !p.badges['trail:passport']) { award('trail:passport'); ui.toast('Passport complete! Every building in Athens.', 4000); sfx.triumph(); }
    if ((p.badges['trail:main'] || p.badges['trail:passport']) && this.vis && this.vis.cfg && !this.vis.seen(this.vis.cfg.finale.sticker)) this.vis.pending = true;   // the finale vision plays once, when free
  }
  goTo(spot) {
    this.world = this.worlds[spot.world]; this.player.x = spot.x; this.player.y = spot.y + 14;
    if (this.world.kind === 'live') { const q = this.world.nearestWalkable(this.player.x, this.player.y); this.player.x = q.x; this.player.y = q.y; }
    this.owl.x = this.player.x - 18; this.owl.y = this.player.y; this.cam.x = this.player.x; this.cam.y = this.player.y; this.cam.z = 1;
  }
  // compass: nearest unfinished MAIN story first, then side stories; if none here, the signpost on the way to one
  compassTarget() { const gt = this.guide && this.guide.target(); return gt || this.compassBase(); }
  compassBase() {
    if (this.target && !this.collected(this.target.id) && (this.target.world === this.world.id)) return this.target;
    const W = this.world, p = this.player, left = s => !this.collected(s.id);
    const near = list => { let b = null, bd = 1e9; for (const s of list) { const d = dist(p.x, p.y, s.x, s.y); if (d < bd) { bd = d; b = s; } } return b; };
    const here = this.spots.filter(s => s.world === W.id && left(s));
    const m = near(here.filter(s => s.main)); if (m) return m;
    const hop = pred => { // first signpost of a shortest route to a zone that has a spot matching pred
      const seen = new Set([W.id]), q = W.signposts.filter(s => s.to).map(s => ({ first: s, z: s.to }));
      while (q.length) { const { first, z } = q.shift(); if (seen.has(z)) continue; seen.add(z); if (this.spots.some(s => s.world === z && left(s) && pred(s))) return first; for (const s of this.worlds[z].signposts) if (s.to) q.push({ first, z: s.to }); }
      return null; };
    const h = hop(s => s.main); if (h) return h;
    const sd = near(here); if (sd) return sd;
    return hop(() => true);
  }
  // flood fill of the walkable tiles reachable from the zone's start
  reachSet(zone) {
    const A = this.worlds[zone], T = A.T, cols = A.cols, rows = A.rows, seen = new Uint8Array(cols * rows);
    const s0 = this.saved[zone], q = [[Math.floor(s0.x / T), Math.floor(s0.y / T)]]; seen[q[0][1] * cols + q[0][0]] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx]) continue; if (A.solid(nx * T + T / 2, ny * T + T / 2)) continue; seen[ny * cols + nx] = 1; q.push([nx, ny]); } }
    return seen;
  }
  // a flag inside a big footprint (a theatre, a stoa) is moved to the nearest tile you can actually walk to
  nudgeSpots() {
    for (const zone in this.worlds) {
      const A = this.worlds[zone]; if (A.kind !== 'live') continue; const T = A.T, seen = this.reachSet(zone), cols = A.cols, rows = A.rows;
      const near = (x, y, lim) => { let best = null, bd = lim; for (let ty = Math.max(0, Math.floor((y - lim) / T)); ty <= Math.min(rows - 1, Math.floor((y + lim) / T)); ty++) for (let tx = Math.max(0, Math.floor((x - lim) / T)); tx <= Math.min(cols - 1, Math.floor((x + lim) / T)); tx++) if (seen[ty * cols + tx]) { const d = dist(tx * T + T / 2, ty * T + T / 2, x, y); if (d < bd) { bd = d; best = { x: tx * T + T / 2, y: ty * T + T / 2 }; } } return best; };
      for (const s of [...this.spots.filter(s => s.world === zone), ...A.signposts]) { if (near(s.x, s.y, 30 + A.T / 2 - 2)) continue; const q = near(s.x, s.y, 220 * A.ws); if (q) { s.moved = dist(s.x, s.y, q.x, q.y); s.x = q.x; s.y = q.y - 6; } }
    }
  }
  // a flag hidden behind a building (a monument sprite whose base is south of it) moves to the open ground in front of that building
  frontDoors() {
    for (const s of this.spots) {
      const W = this.worlds[s.world]; if (!W || W.kind !== 'live' || !W.objs || !W.hiddenBehind(s.x, s.y)) continue;
      const c = new Set(); W.objectsIn(s.x - 8, s.y - 34, s.x + 8, s.y, c); let o = null;
      for (const i of c) { const q = W.objs[i]; if (q.base > s.y + 1 && q.x < s.x + 8 && q.x + q.w > s.x - 8 && q.y < s.y && q.y + q.h > s.y - 34 && (!o || q.base > o.base)) o = q; }
      if (!o) continue;
      const x = clamp(s.x, o.x + 16, o.x + o.w - 16), q = W.clearSpot(x, o.base + 18, 10);
      if (q && !W.hiddenBehind(q.x, q.y)) { s.moved = dist(s.x, s.y, q.x, q.y); s.x = q.x; s.y = q.y; }
    }
  }
  checkReach(zone = 'athens') {
    const A = this.worlds[zone], T = A.T, cols = A.cols, rows = A.rows, seen = this.reachSet(zone), bad = [];
    const reach = (x, y) => { for (let ty = Math.floor((y - 40) / T); ty <= Math.floor((y + 40) / T); ty++) for (let tx = Math.floor((x - 40) / T); tx <= Math.floor((x + 40) / T); tx++) { if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue; if (seen[ty * cols + tx] && dist(tx * T + T / 2, ty * T + T / 2, x, y) < 38 + T / 2) return true; } return false; };
    for (const s of this.spots) if (s.world === zone && !reach(s.x, s.y)) bad.push(s.id);
    for (const s of A.signposts) if (!reach(s.x, s.y)) bad.push('sign:' + s.id);
    return bad;
  }
}
