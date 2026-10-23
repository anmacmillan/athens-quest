// Input: drag anywhere = virtual joystick, A button, keyboard, taps. Everything is polled/evented through `input`.
import { toView } from './render.js';
import { unlock } from './audio.js';

export const input = { dx: 0, dy: 0, a: false, onDoubleTap: null, onPan: null, panMode: null, onTap: null, onA: null, onZoom: null, onWheel: null, onLong: null, enabled: true };
const ptrs = new Map(); let pinch = null;   // active pointers, for two-finger zoom
const keys = new Set();
let drag = null, lastTap = null;   // lastTap: for double-tap detection
const joy = document.getElementById('joy'), knob = document.getElementById('joyknob');
const MAXR = 46;   // css px

function kbDir() {
  let x = 0, y = 0;
  if (keys.has('arrowleft') || keys.has('a')) x -= 1; if (keys.has('arrowright') || keys.has('d')) x += 1;
  if (keys.has('arrowup') || keys.has('w')) y -= 1; if (keys.has('arrowdown') || keys.has('s')) y += 1;
  return [x, y];
}
export function pollDir() {
  if (!input.enabled) return [0, 0];
  const [kx, ky] = kbDir();
  if (kx || ky) { const l = Math.hypot(kx, ky); return [kx / l, ky / l]; }
  return drag ? [drag.dx, drag.dy] : [0, 0];
}
addEventListener('keydown', e => {
  unlock();
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if ((k === ' ' || k === 'enter') && !e.repeat) { if (input.onA) input.onA('key'); return; }
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

export function bindCanvas(cv) {
  cv.addEventListener('wheel', e => { e.preventDefault(); if (input.onWheel) input.onWheel(e.deltaY, e.ctrlKey); }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    unlock(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && e.pointerType !== 'mouse') { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; if (joy) joy.style.display = 'none'; if (knob) knob.style.transform = ''; return; } if (!input.enabled) { if (input.onTap) input.onTap(toView(e.clientX, e.clientY), true); return; }
    cv.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, dx: 0, dy: 0 };
    const d0 = drag, cx0 = e.clientX, cy0 = e.clientY; d0.lt = setTimeout(() => { if (drag === d0 && !d0.moved) { d0.long = true; input.onLong && input.onLong(toView(cx0, cy0)); } }, 600);
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = d / (pinch.d || 1); if (r > 1.35) { pinch.d = d; input.onZoom && input.onZoom(1); } else if (r < .74) { pinch.d = d; input.onZoom && input.onZoom(-1); } return; }
    if (!drag || e.pointerId !== drag.id) return;
    const ox = e.clientX - drag.x0, oy = e.clientY - drag.y0, l = Math.hypot(ox, oy);
    if (l > 10 && !drag.moved && input.panMode && input.panMode()) { drag.moved = true; drag.pan = true; clearTimeout(drag.lt); drag.px = e.clientX; drag.py = e.clientY; }
    if (drag.pan) { const a = toView(drag.px, drag.py), b = toView(e.clientX, e.clientY); drag.px = e.clientX; drag.py = e.clientY; input.onPan && input.onPan(b.x - a.x, b.y - a.y); return; }
    if (l > 10) { drag.moved = true; clearTimeout(drag.lt); if (joy) { joy.style.display = 'block'; joy.style.left = drag.x0 + 'px'; joy.style.top = drag.y0 + 'px'; } }
    if (drag.moved) { const k = Math.min(l, MAXR); drag.dx = ox / l * (k / MAXR); drag.dy = oy / l * (k / MAXR); if (Math.hypot(drag.dx, drag.dy) < .18) { drag.dx = drag.dy = 0; } if (knob) knob.style.transform = `translate(${ox / l * k}px,${oy / l * k}px)`; }
  });
  const end = e => {
    ptrs.delete(e.pointerId); if (pinch) { if (!ptrs.size) pinch = null; return; }
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(drag.lt); if (drag.long) { drag = null; if (joy) joy.style.display = 'none'; return; }
    if (!drag.moved && performance.now() - drag.t0 < 450) {
      const now = performance.now(), v = toView(e.clientX, e.clientY);
      if (lastTap && now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40 && input.onDoubleTap) { lastTap = null; input.onDoubleTap(v); }
      else { lastTap = { t: now, x: e.clientX, y: e.clientY }; input.onTap && input.onTap(v, false); }
    }
    drag = null; if (joy) joy.style.display = 'none'; if (knob) knob.style.transform = '';
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', e => e.preventDefault());
}
export function cancelDrag() { drag = null; if (joy) joy.style.display = 'none'; }
