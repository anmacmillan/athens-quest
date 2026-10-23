// Soundscape: which music track and ambient layers belong to where the player is. Called every frame from Game.update; cheap, and only acts on change.
import { music, amb } from './audio.js';
import { me } from './store.js';

// story scene id -> track (scenes that play on the Greece map or inside a stage set)
const SCENE_TRACK = {
  'lion-gate': 'mycenae', 'atreus-dinner': 'mycenae', iphigenia: 'mycenae', clytemnestra: 'mycenae', cyclopes: 'mycenae', mask: 'mycenae',
  labyrinth: 'knossos', icarus: 'knossos', 'bull-leapers': 'knossos',
  'wooden-horse': 'troy', achilles: 'troy', 'achilles-heel': 'troy', 'troy-real': 'troy',
  'spartan-fox': 'sparta', thermopylae: 'sparta', 'spartan-shield': 'sparta', lycurgus: 'sparta',
  'epidaurus-theatre': 'academy', asclepius: 'academy', oedipus: 'academy', 'philo-plato': 'academy', 'philo-aristotle': 'academy', 'plato-academy': 'academy',
  naxos: 'journey',
};
const ZONE_TRACK = { athens: 'athens', academy: 'academy', lyceum: 'academy', greece: 'journey', knossos: 'knossos', troy: 'troy', mycenae: 'mycenae', epidaurus: 'academy', nafplio: 'journey' };
// ambient mix per zone: cicadas (sunny outdoors), waves (sea), crowd (Agora), wind (high places)
const ZONE_AMB = {
  athens: { cicadas: .8 }, academy: { cicadas: .7 }, lyceum: { cicadas: .7 }, greece: { waves: .8 },
  knossos: { cicadas: .5, wind: .2 }, troy: { waves: .5, wind: .3 }, mycenae: { wind: .5, cicadas: .2 }, epidaurus: { cicadas: .6 }, nafplio: { waves: .6, cicadas: .3 },
};
const PLAKA = [{ lat: 37.9726, lon: 23.7292, r: 190 }, { lat: 37.9761, lon: 23.7256, r: 140 }];   // data/shop.json stops: Plaka, Monastiraki

function athensPlace(G) {
  const W = G.world, p = G.player; if (W.id !== 'athens' || W.kind !== 'live') return null;
  const z = G.skate && G.skate.inZone ? G.skate.inZone(W, p) : null;   // data/skate.json rects: summit, agora
  if (z) return z.id;
  for (const q of PLAKA) { const c = W.project(q.lat, q.lon); if (Math.hypot(p.x - c.x, p.y - c.y) * W.mpp < q.r) return 'plaka'; }
  return null;
}
export function updateSoundscape(G) {
  let track, mix;
  if (!me() || (G.flight && G.flight.script)) { track = 'title'; mix = {}; }   // who-is-playing screen and the new-player opening flight
  else if (G.flight) { track = 'journey'; mix = { waves: .5 }; }
  else {
    const zid = G.world.id, scId = G.scene && G.scene.data ? G.scene.data.id : null;
    track = ZONE_TRACK[zid] || 'athens'; mix = { ...(ZONE_AMB[zid] || {}) };
    if (zid === 'athens') {
      const pl = athensPlace(G);
      if (pl === 'summit') { track = 'summit'; mix = { wind: 1, cicadas: .25 }; }
      else if (pl === 'agora') { track = 'agora'; mix = { crowd: 1, cicadas: .35 }; }
      else if (pl === 'plaka') { track = 'agora'; mix = { crowd: .5, cicadas: .6 }; }
    }
    if (scId && SCENE_TRACK[scId]) track = SCENE_TRACK[scId];
  }
  music.want(track);
  if (music.held) mix = {};   // comic or mini-game on screen: just the bed, no room tone
  const key = JSON.stringify(mix); if (key !== updateSoundscape.last) { updateSoundscape.last = key; amb.set(mix); }
}
