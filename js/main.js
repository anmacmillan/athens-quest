// Boot: load art, worlds and stories, start the loop, ask who is playing.
import { initRender, loadManifest, cv } from './render.js';
import { loadWorlds } from './world.js';
import { bindCanvas } from './input.js';
import { loadStore, store, pull, me } from './store.js';
import { loadAudioManifest } from './audio.js';
import { Game } from './game.js';
import { stillList, loadAiManifest } from './scene.js';
import { loadMarkers } from './markers.js';
import * as ui from './ui.js';
import { preloadAvatar } from './avatar_sprite.js';
import { $ } from './util.js';

async function loadStories() {
  for (const u of ['data/stories.json', 'data/stories.sample.json']) {
    try { const r = await fetch(u); if (r.ok) { const j = await r.json(); return Array.isArray(j) ? j : j.stories; } } catch (e) { }
  }
  return [];
}
// loading screen progress: a fraction and a line of what is happening
const step = (f, msg) => { const b = document.querySelector('#loading .ld-bar i'), m = document.querySelector('#loading small'); if (b) b.style.width = Math.round(f * 100) + '%'; if (m && msg) m.textContent = msg; };
async function boot() {
  loadStore(); try { await preloadAvatar(me()); } catch (e) { }
  initRender($('cv')); bindCanvas(cv);
  step(.1, 'Sharpening pencils...'); await loadManifest('art/manifest.json'); step(.35, 'Tuning the lyres...'); await loadAudioManifest();
  step(.45, 'Building Athens...'); await loadWorlds();
  try { const r = await fetch('art/stills/index.json'); if (r.ok) (await r.json()).forEach(f => stillList.add(f)); } catch (e) { }
  step(.7, 'Unrolling the scrolls...'); await loadAiManifest(); await loadMarkers();
  const stories = await loadStories();
  step(.8, 'Waking the gods...'); const game = new Game(); await game.init(stories); ui.init(game); step(1, 'Ready!');
  import('./wardrobe.js').then(m => m.initWardrobe(game)).catch(e => console.warn('wardrobe', e));
  game.afterPick = () => {
    ui.refresh(); ui.hud(true);
    if (!window.__noIntro && !/nointro/.test(location.search) && !game.opening.seenIntro(me())) game.opening.play(); else ui.toast(`Hello ${me().name}! Tap the ground to walk. Look for people with a gold !`, 4200);
  };
  const loop = now => { game.frame(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  $('loading').classList.add('done');
  if (me()) ui.hud(true); else ui.whoScreen();
  pull();
  // narration helper: every line of every story, so make_audio.py can render them (id matches audio/<id>.mp3)
  window.__oqLines = async () => {
    const out = [];
    for (const s of stories) {
      const sc = await game.loadScene(s); let n = 0;
      if (sc) for (const b of sc.beats) { if ((b.t || b.type) === 'caption') { n++; out.push({ id: `${s.id}-${n}`, speaker: b.speaker || sc.speaker || s.speaker, text: b.text }); } }
      else s.pages.forEach((p, i) => out.push({ id: `${s.id}-${i + 1}`, speaker: p[2] || s.speaker, text: p[1] }));
    }
    return out;
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__ready = true;
}
setTimeout(() => { if (!window.__ready) { const m = document.querySelector('#loading small'); if (m) { m.textContent = 'Slow connection... still loading. Tap here to try again.'; m.style.cursor = 'pointer'; m.onclick = () => location.reload(); } } }, 30000);   // hotel wifi
boot().catch(e => { console.error(e); document.querySelector('#loading small').textContent = 'Something went wrong: ' + e.message; });
