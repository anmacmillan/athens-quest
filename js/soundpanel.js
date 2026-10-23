// Sound settings: on/off plus separate Music and Effects sliders. Opened from the speaker button.
import { el } from './util.js';
import { sound, sfx } from './audio.js';
import { speedPicker } from './reading.js';

export function openSoundPanel(open, onChange) {
  const slider = (label, kind) => {
    const val = el('b', { text: Math.round(sound[kind] * 100) + '%' });
    const inp = el('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(sound[kind] * 100), 'aria-label': label + ' volume',
      oninput: e => { sound.setVol(kind, e.target.value / 100); val.textContent = e.target.value + '%'; },
      onchange: () => { if (kind === 'sfx') sfx.coin(); } });
    inp.style.cssText = 'width:100%;height:28px;accent-color:#f5c542';
    return el('label', { class: 'sndrow', style: 'display:block;margin:14px 0' }, el('span', { text: label + ' ' }), val, inp);
  };
  const tog = el('button', { class: 'btn', text: sound.on ? 'Sound: on' : 'Sound: off', onclick: () => { sound.set(!sound.on); tog.textContent = sound.on ? 'Sound: on' : 'Sound: off'; onChange && onChange(); } });
  const rd = el('div', { style: 'margin:14px 0' }, el('p', { text: 'Reading speed', style: 'margin:4px 0;font-weight:700' }), speedPicker());
  open('Settings', el('div', { style: 'min-width:min(78vw,320px);text-align:center' }, tog, slider('Music', 'music'), slider('Effects', 'sfx'), rd), { cls: 'soundp' });
}
