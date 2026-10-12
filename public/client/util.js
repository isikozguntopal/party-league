// İstemci ortak yardımcıları: DOM, matematik, yumuşatma, ses
export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Ses (WebAudio, dosya gerektirmez) ----------
let ac = null;
export function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
export function sfx(kind) {
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime;
  const g = ac.createGain();
  g.connect(ac.destination);
  const tone = (type, f0, f1, dur, vol, delay = 0) => {
    const o = ac.createOscillator();
    const gg = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now + delay);
    o.frequency.exponentialRampToValueAtTime(f1, now + delay + dur);
    gg.gain.setValueAtTime(vol, now + delay);
    gg.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    o.connect(gg); gg.connect(ac.destination); o.start(now + delay); o.stop(now + delay + dur);
  };
  const noise = (dur, freq, vol, type = 'bandpass') => {
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    const src = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    src.buffer = buf; src.connect(f); f.connect(g);
    g.gain.value = vol; src.start(now);
  };
  switch (kind) {
    case 'shot': noise(0.16, 1400, 0.6); break;
    case 'hit': tone('square', 220, 70, 0.22, 0.18); break;
    case 'fall': tone('sine', 700, 60, 0.9, 0.16); break;
    case 'reveal': tone('sawtooth', 220, 660, 0.3, 0.06); break;
    case 'shrink': tone('triangle', 160, 50, 0.8, 0.2); break;
    case 'bump': tone('sine', 320, 120, 0.14, 0.25); break;
    case 'pop': tone('sine', 880, 1320, 0.09, 0.08); break;
    case 'boom': noise(0.6, 300, 0.9, 'lowpass'); tone('sine', 120, 35, 0.5, 0.35); break;
    case 'step': tone('triangle', 520, 380, 0.05, 0.05); break;
    case 'drop': tone('square', 300, 200, 0.08, 0.08); break;
    case 'item': tone('sine', 660, 1320, 0.15, 0.12); tone('sine', 990, 1980, 0.15, 0.08, 0.08); break;
    case 'engine': tone('sawtooth', 90, 160, 0.7, 0.05); break;
    case 'crash': noise(0.4, 700, 0.6); tone('square', 200, 50, 0.3, 0.12); break;
    case 'finish': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f * 1.01, 0.18, 0.12, i * 0.11)); break;
    case 'fanfare': [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.22, 0.13, i * 0.15)); break;
    case 'tick': tone('square', 1200, 1100, 0.03, 0.04); break;
    case 'score': tone('sine', 600, 900, 0.12, 0.1); break;
  }
}
