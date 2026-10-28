// 🐾 Pati Koşusu — düz 2D çizim (three.js YOK). Yandan görünen çizgi film dünyası: gökyüzü, bulutlar, tepeler, çim kenarlı platformlar,
// engeller, ❓ kutular, güçlendirmeler ve koyu dış çizgili hayvanlar. Turnuva istemcisi (client/pati-rt.js) kullanır.
// `st`: simülasyon (sim) YA DA readSnapshot() sonucu. g: ana 2D tuval bağlamı (ctx.g2d), W/H tuval pikseli.
import * as P from '../games/pati.js';
import { sfx, clamp, lerp } from './util.js';
import { drawAnimal } from './pati-sprites.js';

const FEED = { saw: '⚙️', zap: '⚡', trap: '🪤', crate: '📦', punch: '🥊', meteor: '☄️', pbox: '🥊', ice: '🧊' };
const FANS = ['🦊', '🐰', '🐱', '🐼', '🐸', '🐧', '🐻', '🐶', '🐵', '🦁', '🐯', '🐮'];
const SPR = 320, PPU = 78, FX0 = 160, FY0 = 250;   // pati-sprites.js ile aynı
const OUT = '#1f2937';
const THEMES = {
  orman: { sky: ['#4cc3ff', '#bfeaff'], hill: ['#7fd36b', '#5cbf55'], cloud: '#ffffff', top: '#5fd04a', lip: '#9cf070', dirt: ['#a86f3c', '#7a4a24'], dirtDot: '#5f3a1b' },
  magara: { sky: ['#0b0a22', '#2a2560'], hill: ['#3b3f78', '#2b2e5e'], cloud: '#6d63c9', top: '#8e9ebd', lip: '#c3cfe6', dirt: ['#5a6684', '#3b445d'], dirtDot: '#2a3146' },
  seker: { sky: ['#ff9fd2', '#ffe2f1'], hill: ['#ffc2dd', '#ff9fc8'], cloud: '#ffffff', top: '#ff7fb9', lip: '#ffc4e1', dirt: ['#d29a6b', '#a56f45'], dirtDot: '#ffffff' },
  kar: { sky: ['#7aa7d9', '#e6f1ff'], hill: ['#dfe9f5', '#c4d6ea'], cloud: '#ffffff', top: '#f8fbff', lip: '#ffffff', dirt: ['#8fa4bd', '#667b94'], dirtDot: '#dbe7f5' },
  col: { sky: ['#ffb36b', '#ffe9b8'], hill: ['#e8b36a', '#d19a52'], cloud: '#fff4dc', top: '#f3d28a', lip: '#ffe7ad', dirt: ['#c98f4f', '#9c6a33'], dirtDot: '#7b5226' },
};
const COL = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export function createPatiView2D(o) {
  const { mapId, track, racers, meId } = o;
  const th = THEMES[mapId] || THEMES.orman;
  const R = P.rng((track.seed ^ 0xdec0de) >>> 0);
  // ---- karakter tuvalleri ----
  const sprites = new Map();
  racers.forEach((r, i) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
    sprites.set(r.id, { cv, g: cv.getContext('2d'), st: { phase: Math.random() * 6 }, blink: 2 + Math.random() * 3, mark: COL[i % COL.length], r });
  });
  // ---- dekor (tohumdan, deterministik) ----
  const clouds = Array.from({ length: 22 }, (_, i) => ({ x: i * 26 + R() * 14, y: 0.08 + R() * 0.25, s: 0.7 + R() * 0.9 }));
  const hills = Array.from({ length: 30 }, (_, i) => ({ x: i * 22 + R() * 10, w: 22 + R() * 16, h: 5 + R() * 5 }));
  const hills2 = Array.from({ length: 40 }, (_, i) => ({ x: i * 14 + R() * 8, w: 14 + R() * 10, h: 3 + R() * 3.5 }));
  const decor = Array.from({ length: Math.ceil((track.len + 160) / 6) }, (_, i) => ({ x: -10 + i * 6 + R() * 3, k: Math.floor(R() * 4), s: 0.8 + R() * 0.7, c: Math.floor(R() * 3) }));
  const floorY = (x) => { const gy = P.groundAt(track, x); if (gy !== null) return gy; let best = 0, bd = 1e9; for (const p of track.plats) { const d = Math.min(Math.abs(p.x0 - x), Math.abs(p.x1 - x)); if (d < bd) { bd = d; best = p.y; } } return best; };
  const surf = (x, y) => { let best = P.groundAt(track, x); for (const u of track.up || []) if (x >= u.x0 && x < u.x1 && u.y <= y + 0.1 && (best === null || u.y > best)) best = u.y; return best; };
  // ---- durum ----
  let aimDir = null;
  const meteors = []; const flip = {}; const splats = []; const squashT = {}; let shake = 0, flash = 0, boltT = 0, boltFrom = null, boltTo = null, camX = 0, camY = 0, camInit = false, confetti = [], parts = [];
  const feed = (t) => o.onFeed && o.onFeed(t), banner = (t, ms, c) => o.onBanner && o.onBanner(t, ms, c), toast = (t) => o.onToast && o.onToast(t);
  const nameOf = (id) => { const r = racers.find((x) => x.id === id); return r ? r.name : '?'; };
  function emit(x, y, n, p = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (p.speed || 3) * (0.3 + Math.random() * 0.7);
      parts.push({ x: x + (Math.random() - 0.5) * (p.spread || 0.3), y, vx: (p.dirX != null ? p.dirX : Math.cos(a)) * sp, vy: (p.up != null ? p.up : Math.abs(Math.sin(a))) * sp, life: 0, max: (p.life || 0.6) * (0.7 + Math.random() * 0.6), g: p.g != null ? p.g : 9, s: p.size || 1, c: p.color || '#e5e7eb' });
    }
  }
  function events(evs, st) {
    const t = performance.now() / 1000;
    for (const e of evs) {
      const r = e.id && st.byId[e.id], me = e.id === meId;
      switch (e.e) {
        case 'beep': sfx('tick'); break;
        case 'go': sfx('finish'); banner('BAŞLA!', 900, 'go'); break;
        case 'jump': if (me) sfx('pop'); if (r) emit(r.x, r.y, 5, { color: '#e5e7eb', speed: 2, up: 0.4, size: 0.9, life: 0.4, g: 2 }); break;
        case 'jump2': if (me) sfx('tick'); flip[e.id] = t; if (r) emit(r.x, r.y + 0.3, 8, { color: '#bae6fd', speed: 3, up: 0.2, size: 0.9, life: 0.35, g: 0 }); break;
        case 'slide': if (me) sfx('step'); if (r) emit(r.x, r.y, 6, { color: '#d6d3d1', speed: 2.5, up: 0.3, size: 1, life: 0.45, g: 1, dirX: -1 }); break;
        case 'land': if (r) { if (e.hard) { if (me) { sfx('bump'); shake = Math.max(shake, 0.25); } emit(r.x, r.y, 16, { color: '#d6d3d1', speed: 5, up: 0.25, size: 1.3, life: 0.5, g: 3, spread: 0.6 }); } else if (e.impact > 14) emit(r.x, r.y, 5, { color: '#e5e7eb', speed: 2, up: 0.3, size: 0.9, life: 0.35, g: 2 }); } break;
        case 'bump': if (r) emit(r.x + 0.4, r.y + 0.7, 8, { color: '#fcd34d', speed: 3, size: 0.9, life: 0.35, g: 4 }); if (me) { sfx('bump'); shake = Math.max(shake, 0.2); } break;
        case 'hit':
          if (r) emit(r.x, r.y + 0.9, 12, { color: '#fde047', speed: 5, size: 1.1, life: 0.5, g: 4 });
          if (me) { sfx('crash'); shake = Math.max(shake, 0.5); flash = 1; } else sfx('hit');
          if (e.by && e.by !== e.id && FEED[e.kind]) feed(`${nameOf(e.by)} ${FEED[e.kind]} ➜ ${nameOf(e.id)}`);
          break;
        case 'gore': {   // testere / ayı kapanı: kanlar içinde parçalanır
          const b = st.byId[e.id], col = (sprites.get(e.id) || {}).mark || '#f97316';
          if (b) { emit(b.x, b.y + 0.8, 34, { color: '#dc2626', speed: 8, size: 1.5, life: 0.9, g: 14 }); emit(b.x, b.y + 0.8, 16, { color: '#7f1d1d', speed: 6, size: 1.1, life: 1.0, g: 12 }); emit(b.x, b.y + 0.8, 12, { color: col, speed: 7, size: 1.8, life: 0.8, g: 16 }); splats.push({ x: b.x, y: b.y, t: 0 }); }
          sfx('crash'); shake = Math.max(shake, e.id === meId ? 0.7 : 0.3); if (e.id === meId) flash = 1;
          if (e.by && e.by !== e.id) feed(`${nameOf(e.by)} ${FEED[e.kind] || '☠️'} ➜ ${nameOf(e.id)} 💀`);
          break;
        }
        case 'tramp': { squashT[e.x] = t; if (r) emit(r.x, r.y, 10, { color: '#fde047', speed: 4, up: 0.9, size: 1.1, life: 0.5, g: 6 }); sfx(me ? 'pop' : 'tick'); break; }
        case 'pad': if (r) emit(r.x, r.y + 0.3, 10, { color: '#4ade80', speed: 5, size: 1.1, life: 0.4, g: 0, dirX: -1 }); if (me) sfx('engine'); break;
        case 'head': if (r) emit(r.x, r.y + 1.4, 6, { color: '#fcd34d', speed: 3, up: 0.2, size: 0.9, life: 0.3, g: 4 }); if (me) { sfx('bump'); shake = Math.max(shake, 0.2); } break;
        case 'stuck': if (r) emit(r.x, r.y + 0.1, 8, { color: '#a8a29e', speed: 2.5, size: 1, life: 0.4, g: 3 }); if (me) toast('Kuyuya takıldın: zıpla!'); break;
        case 'iced': if (r) emit(r.x, r.y + 0.8, 16, { color: '#bae6fd', speed: 4, size: 1.2, life: 0.6, g: 1 }); if (me) { sfx('pop'); flash = 0; toast('Buzlandın! Bir süre zıplayamazsın'); } if (e.by && e.by !== e.id) feed(`${nameOf(e.by)} 🧊 ➜ ${nameOf(e.id)}`); break;
        case 'pboxHit': if (e.by && e.by !== e.id) feed(`${nameOf(e.by)} 🥊 ➜ ${nameOf(e.id)}`); if (r) emit(r.x, r.y + 0.9, 14, { color: '#f87171', speed: 6, size: 1.3, life: 0.45, g: 2 }); sfx('crash'); if (me) shake = Math.max(shake, 0.4); break;
        case 'meteor': {
          sfx('crash'); shake = Math.max(shake, 0.35);
          for (const id of e.to || []) { const b = st.byId[id]; if (!b) continue; meteors.push({ id, t: 0 }); emit(b.x, b.y + 0.9, 18, { color: '#fb923c', speed: 6, size: 1.4, life: 0.7, g: 3 }); if (id === meId) { flash = 1; shake = Math.max(shake, 0.6); } if (e.id !== id) feed(`${nameOf(e.id)} ☄️ ➜ ${nameOf(id)}`); }
          break;
        }
        case 'block': if (r) emit(r.x, r.y + 0.8, 14, { color: '#7dd3fc', speed: 5, size: 1.2, life: 0.5, g: 0 }); sfx('pop'); if (me) feed('🛡️ Kalkan darbeyi yuttu!'); break;
        case 'pickup': if (me) sfx('item'); emit(e.x, e.y, 12, { color: '#fde047', speed: 4, size: 1, life: 0.5, g: 2 }); break;
        case 'use': if (me) { if (e.item === 4) { sfx('engine'); shake = Math.max(shake, 0.2); } else if (e.item === 5) sfx('item'); } break;
        case 'sawFire': sfx('shot'); break;
        case 'throw': sfx('shot'); break;
        case 'zap': { sfx('hit'); const a = st.byId[e.id], b = st.byId[e.to]; if (a && b) { boltFrom = a.id; boltTo = b.id; boltT = 0.45; } if (e.to === meId) { flash = 1; shake = Math.max(shake, 0.4); } break; }
        case 'punch': { sfx('crash'); const b = st.byId[e.to]; if (b) emit(b.x, b.y + 0.9, 14, { color: '#f87171', speed: 6, size: 1.3, life: 0.45, g: 2 }); break; }
        case 'trapSet': if (me) sfx('pop'); break;
        case 'done': if (e.dnf && e.dnf.length) feed('⏱️ Süre doldu: ' + e.dnf.map(nameOf).join(', ') + ' DNF'); break;
        case 'trapSnap': sfx('bump'); if (r) emit(e.x, r.y + 0.2, 10, { color: '#9ca3af', speed: 4, size: 1, life: 0.4, g: 5 }); break;
        case 'crateSpawn': sfx('pop'); emit(e.x, 1, 14, { color: '#a78bfa', speed: 4, size: 1.2, life: 0.5, g: 2, spread: 1 }); if (e.to === meId) feed('📦 Önüne sandık çıktı!'); break;
        case 'fall': if (me) { sfx('fall'); shake = Math.max(shake, 0.4); } else sfx('drop'); break;
        case 'respawn': if (r) emit(r.x, r.y + 0.5, 14, { color: '#bfdbfe', speed: 4, size: 1.1, life: 0.6, g: 0 }); break;
        case 'noTarget': if (me) toast('Önünde rakip yok!'); break;
        case 'finish':
          if (me) { sfx('fanfare'); banner(`${e.place}. SIRA!`, 2200, e.place === 1 ? 'win' : ''); spawnConfetti(e.place === 1 ? 160 : 70); if (o.onFinishMe) o.onFinishMe(e.place); }
          else sfx('pop');
          break;
        default: break;
      }
    }
  }
  function spawnConfetti(n) { for (let i = 0; i < n; i++) confetti.push({ x: Math.random(), y: -Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.12, vy: 0.08 + Math.random() * 0.25, r: 4 + Math.random() * 7, c: ['#f43f5e', '#fde047', '#4ade80', '#38bdf8', '#c084fc', '#fb923c'][i % 6], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 }); }
  const poseOf = (r, t) => {
    const fl = flip[r.id]; let f = -1;
    if (fl !== undefined) { const k = (t - fl) / 0.5; if (k >= 0 && k <= 1 && !r.grounded) f = k; }
    return { sp: r.sp, grounded: r.grounded, vy: r.vy, slide: r.slideT > 0, slam: r.slamming, stun: r.stun, trap: r.trap, zap: r.zapT > 0, fallT: r.fall, flip: f, squash: r.squash, boost: r.boost > 0, shield: r.shield, win: r.done !== null && r.sp < 3 && r.fall === null, inv: r.inv };
  };

  // ---------- çizim yardımcıları ----------
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  function drawSky(g, W, H, cx, S) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (mapId === 'magara') { g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 40; i++) { const x = ((i * 137 + 11) % 1000) / 1000 * W, y = ((i * 71 + 5) % 600) / 1000 * H; g.fillRect(x, y, 2, 2); } }
    else { g.fillStyle = 'rgba(255,244,176,.95)'; g.beginPath(); g.arc(W * 0.82, H * 0.16, S * 1.5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(W * 0.82, H * 0.16, S * 2.1, 0, 7); g.fill(); }
    // bulutlar (yavaş kayar)
    g.fillStyle = th.cloud; g.globalAlpha = mapId === 'magara' ? 0.35 : 0.95;
    for (const c of clouds) { const x = (c.x - cx * 0.1) * S * 0.6, px = ((x % (W + 400)) + W + 400) % (W + 400) - 200, py = c.y * H, s = c.s * S * 0.7; g.beginPath(); g.arc(px, py, s, 0, 7); g.arc(px + s * 1.1, py + s * 0.15, s * 0.8, 0, 7); g.arc(px - s * 1.1, py + s * 0.2, s * 0.7, 0, 7); g.arc(px + s * 0.3, py - s * 0.55, s * 0.75, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  function drawHills(g, W, H, cx, cy, S, groundSY) {
    const layer = (arr, par, color, base) => {
      g.fillStyle = color;
      for (const h of arr) {
        const wx = h.x - cx * par; const px = (((wx * S) % (W * 3 + 600)) + W * 3 + 600) % (W * 3 + 600) - 300;
        const by = groundSY + base * S - cy * 0.0, hw = h.w * S * 0.5, hh = h.h * S;
        if (px + hw < -50 || px - hw > W + 50) continue;
        g.beginPath(); g.moveTo(px - hw, by + S * 6); g.quadraticCurveTo(px - hw * 0.55, by - hh * 1.1, px, by - hh); g.quadraticCurveTo(px + hw * 0.55, by - hh * 1.1, px + hw, by + S * 6); g.closePath(); g.fill();
      }
    };
    layer(hills, 0.18, th.hill[1], 1.2);
    layer(hills2, 0.34, th.hill[0], 2.2);
  }
  function drawDecor(g, W, S, X, Y) {
    for (const d of decor) {
      const sx = X(d.x); if (sx < -90 || sx > W + 90) continue;
      if ((track.pits || []).some((pt) => d.x > pt.x0 - 0.8 && d.x < pt.x1 + 0.8)) continue;
      const fy = Y(floorY(d.x)), s = d.s * S;
      g.lineWidth = 3; g.strokeStyle = OUT;
      if (mapId === 'orman') {
        if (d.k === 0 || d.k === 1) { g.fillStyle = '#8d5a2b'; rr(g, sx - s * 0.18, fy - s * 1.5, s * 0.36, s * 1.5, 4); g.fill(); g.stroke(); g.fillStyle = ['#2f9e44', '#37b24d', '#51cf66'][d.c]; g.beginPath(); g.arc(sx, fy - s * 1.9, s * 0.95, 0, 7); g.arc(sx - s * 0.6, fy - s * 1.5, s * 0.6, 0, 7); g.arc(sx + s * 0.6, fy - s * 1.5, s * 0.6, 0, 7); g.fill(); }
        else if (d.k === 2) { g.fillStyle = '#40c057'; g.beginPath(); g.ellipse(sx, fy - s * 0.25, s * 0.7, s * 0.4, 0, Math.PI, 0); g.fill(); g.stroke(); }
        else { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(sx, fy - s * 0.45, s * 0.42, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = '#fef3c7'; rr(g, sx - s * 0.12, fy - s * 0.45, s * 0.24, s * 0.45, 3); g.fill(); g.stroke(); }
      } else if (mapId === 'magara') {
        const c = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399'][d.c % 4];
        if (d.k % 2 === 0) { g.fillStyle = '#4b5578'; g.beginPath(); g.ellipse(sx, fy - s * 0.3, s * 0.75, s * 0.42, 0, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.ellipse(sx - s * 0.2, fy - s * 0.45, s * 0.25, s * 0.12, -0.3, 0, 7); g.fill(); }
        else { g.fillStyle = '#dbeafe'; rr(g, sx - s * 0.09, fy - s * 0.7, s * 0.18, s * 0.7, 4); g.fill(); g.stroke(); g.fillStyle = c; g.beginPath(); g.arc(sx, fy - s * 0.75, s * 0.5, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(sx - s * 0.18, fy - s * 0.95, s * 0.08, 0, 7); g.arc(sx + s * 0.15, fy - s * 0.88, s * 0.06, 0, 7); g.fill(); }
      } else if (mapId === 'kar') {
        if (d.k % 2 === 0) { g.fillStyle = '#8d5a2b'; rr(g, sx - s * 0.1, fy - s * 0.7, s * 0.2, s * 0.7, 3); g.fill(); g.stroke(); for (let k = 0; k < 3; k++) { g.fillStyle = k % 2 ? '#2f855a' : '#38a169'; g.beginPath(); g.moveTo(sx - s * (0.8 - k * 0.15), fy - s * (0.5 + k * 0.6)); g.lineTo(sx, fy - s * (1.4 + k * 0.6)); g.lineTo(sx + s * (0.8 - k * 0.15), fy - s * (0.5 + k * 0.6)); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx - s * 0.3, fy - s * (1.05 + k * 0.6)); g.lineTo(sx, fy - s * (1.4 + k * 0.6)); g.lineTo(sx + s * 0.3, fy - s * (1.05 + k * 0.6)); g.closePath(); g.fill(); } }
        else { g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(sx, fy - s * 0.35, s * 0.4, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.arc(sx, fy - s * 0.95, s * 0.3, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#1f2937'; g.beginPath(); g.arc(sx - s * 0.1, fy - s * 1.0, s * 0.04, 0, 7); g.arc(sx + s * 0.1, fy - s * 1.0, s * 0.04, 0, 7); g.fill(); g.fillStyle = '#fb923c'; g.beginPath(); g.moveTo(sx, fy - s * 0.93); g.lineTo(sx + s * 0.28, fy - s * 0.88); g.lineTo(sx, fy - s * 0.85); g.fill(); }
      } else if (mapId === 'col') {
        if (d.k % 2 === 0) { g.fillStyle = '#4caf50'; rr(g, sx - s * 0.17, fy - s * 1.5, s * 0.34, s * 1.5, s * 0.17); g.fill(); g.stroke(); rr(g, sx - s * 0.55, fy - s * 1.05, s * 0.2, s * 0.6, s * 0.1); g.fill(); g.stroke(); rr(g, sx + s * 0.35, fy - s * 1.2, s * 0.2, s * 0.65, s * 0.1); g.fill(); g.stroke(); g.fillRect(sx - s * 0.5, fy - s * 0.65, s * 0.4, s * 0.2); g.fillRect(sx + s * 0.1, fy - s * 0.7, s * 0.45, s * 0.2); }
        else { g.fillStyle = '#d6a65e'; g.beginPath(); g.ellipse(sx, fy - s * 0.3, s * 0.8, s * 0.4, 0, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(sx + s * 0.2, fy - s * 0.25, s * 0.35, s * 0.15, 0, Math.PI, 0); g.fill(); }
      } else {
        const c = ['#ff6fae', '#7dd3fc', '#fde047', '#86efac', '#c4b5fd'][d.c % 5];
        if (d.k % 2 === 0) { g.fillStyle = '#fef3c7'; rr(g, sx - s * 0.06, fy - s * 1.6, s * 0.12, s * 1.6, 3); g.fill(); g.stroke(); g.fillStyle = c; g.beginPath(); g.arc(sx, fy - s * 1.85, s * 0.6, 0, 7); g.fill(); g.stroke(); g.strokeStyle = '#fff'; g.beginPath(); g.arc(sx, fy - s * 1.85, s * 0.3, 0, 7); g.stroke(); }
        else { g.fillStyle = c; g.beginPath(); g.ellipse(sx, fy - s * 0.5, s * 0.55, s * 0.6, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, fy - s * 1.1, s * 0.12, 0, 7); g.fill(); }
      }
    }
  }
  // thin: üst kat (yüzen ince platform); aksi hâlde ekranın altına kadar uzanan toprak gövde
  function drawPlat(g, p, W, H, S, X, Y, thin) {
    const x0 = X(p.x0), x1 = X(p.x1), y = Y(p.y);
    if (x1 < -20 || x0 > W + 20) return;
    const lipS = Math.max(10, S * 0.42);
    if (p.y1 !== undefined) {                 // yokuş aşağı: eğimli zemin + kalın çim şerit
      const y1 = Y(p.y1);
      const gr = g.createLinearGradient(0, Math.min(y, y1), 0, Math.min(y, y1) + S * 7); gr.addColorStop(0, th.dirt[0]); gr.addColorStop(1, th.dirt[1]);
      g.fillStyle = gr; g.strokeStyle = OUT; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y1); g.lineTo(x1, H + 30); g.lineTo(x0, H + 30); g.closePath(); g.fill(); g.stroke();
      g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = lipS * 1.2 + 7; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = th.top; g.lineWidth = lipS * 1.2; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = th.lip; g.lineWidth = lipS * 0.4; g.beginPath(); g.moveTo(x0, y - lipS * 0.25); g.lineTo(x1, y1 - lipS * 0.25); g.stroke();
      // yön okları (aşağı eğim)
      g.lineCap = 'butt'; g.fillStyle = 'rgba(255,255,255,.55)';
      for (let k = 1; k <= 3; k++) { const f = k / 4, ax = x0 + (x1 - x0) * f, ay = y + (y1 - y) * f - lipS * 1.4, a = Math.atan2(y1 - y, x1 - x0); g.save(); g.translate(ax, ay); g.rotate(a); g.beginPath(); g.moveTo(-S * 0.25, -S * 0.2); g.lineTo(S * 0.25, 0); g.lineTo(-S * 0.25, S * 0.2); g.closePath(); g.fill(); g.restore(); }
      return;
    }
    if (p.pit) {                               // kuyu: koyu, içi çukur; kenarları ana zeminin çimiyle çevrili
      const gr = g.createLinearGradient(0, y, 0, y + S * 2.5); gr.addColorStop(0, '#3b2412'); gr.addColorStop(1, '#1d1209');
      g.fillStyle = gr; g.strokeStyle = OUT; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(x0, y - S * 1.0); g.lineTo(x0, y); g.lineTo(x1, y); g.lineTo(x1, y - S * 1.0); g.lineTo(x1, H + 30); g.lineTo(x0, H + 30); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x0, y - S * 1.0, x1 - x0, S * 1.0);
      g.beginPath(); g.moveTo(x0, y - S * 1.0); g.lineTo(x0, y); g.lineTo(x1, y); g.lineTo(x1, y - S * 1.0); g.stroke();
      g.fillStyle = '#6b4a2a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x0 + (x1 - x0) * (0.15 + k * 0.23), y + S * 0.08, S * 0.16, S * 0.07, 0, 0, 7); g.fill(); }
      return;
    }
    const w = x1 - x0, depth = thin ? S * 0.7 : H - y + 30, lipH = Math.max(10, S * 0.42);
    // toprak gövde
    const gr = g.createLinearGradient(0, y, 0, y + Math.min(depth, S * 6)); gr.addColorStop(0, th.dirt[0]); gr.addColorStop(1, th.dirt[1]);
    g.fillStyle = gr; g.strokeStyle = OUT; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.lineTo(x1, y + depth); g.lineTo(x0, y + depth); g.closePath(); g.fill(); g.stroke();
    // toprak benekleri
    g.fillStyle = th.dirtDot; g.globalAlpha = 0.35;
    for (let i = 0; i < Math.ceil(w / (S * 1.3)); i++) { const bx = x0 + (i + 0.5) * S * 1.3 + ((i * 53) % 7) * 3, by = y + lipH + ((i * 37) % 5) * S * 0.45 + S * 0.5; g.beginPath(); g.ellipse(bx, by, S * 0.26, S * 0.15, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // çim şerit (üst) + sarkan püsküller
    g.fillStyle = th.top; g.strokeStyle = OUT; g.lineWidth = 3.5;
    rr(g, x0 - 4, y - lipH * 0.45, w + 8, lipH * 1.5, lipH * 0.6); g.fill(); g.stroke();
    g.fillStyle = th.lip; rr(g, x0 + 4, y - lipH * 0.3, w - 8, lipH * 0.45, lipH * 0.25); g.fill();
    g.fillStyle = th.top;
    for (let x = x0 + S * 0.35; x < x1 - S * 0.2; x += S * 0.8) { g.beginPath(); g.moveTo(x - S * 0.2, y + lipH * 0.9); g.quadraticCurveTo(x, y + lipH * 1.9, x + S * 0.2, y + lipH * 0.9); g.fill(); }
  }
  function drawObst(g, o, S, X, Y) {
    const sx = X(o.x), sw = o.w * S, y0 = Y(o.y0), y1 = Y(o.y1);
    g.lineWidth = 3.5; g.strokeStyle = OUT;
    if (o.k === 'block') {
      g.fillStyle = '#c8924f'; rr(g, sx, y1, sw, y0 - y1, 6); g.fill(); g.stroke();
      g.strokeStyle = '#7c4a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx + 4, y1 + (y0 - y1) * 0.33); g.lineTo(sx + sw - 4, y1 + (y0 - y1) * 0.33); g.moveTo(sx + 4, y1 + (y0 - y1) * 0.66); g.lineTo(sx + sw - 4, y1 + (y0 - y1) * 0.66); g.moveTo(sx + 4, y1 + 4); g.lineTo(sx + sw - 4, y0 - 4); g.stroke();
    } else if (o.k === 'spike') {
      g.fillStyle = '#64748b'; rr(g, sx - 2, y0 - S * 0.14, sw + 4, S * 0.18, 4); g.fill(); g.stroke();
      const n = Math.max(2, Math.round(o.w / 0.5));
      for (let i = 0; i < n; i++) { const a = sx + (i / n) * sw, b = sx + ((i + 1) / n) * sw; g.fillStyle = '#e2e8f0'; g.strokeStyle = OUT; g.beginPath(); g.moveTo(a, y0 - S * 0.1); g.lineTo((a + b) / 2, y1); g.lineTo(b, y0 - S * 0.1); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo((a + b) / 2 - 3, y1 + S * 0.14); g.lineTo((a + b) / 2, y1); g.lineTo((a + b) / 2 + 3, y1 + S * 0.14); g.closePath(); g.fill(); }
    } else { // bar: zincirlerle asılı demir kiriş (sarı-siyah ikaz şeritli)
      const cx = sx + sw / 2, bw = sw + 10, bh = Math.max(14, y0 - y1);
      g.strokeStyle = '#94a3b8'; g.lineWidth = 3; g.lineCap = 'round';
      for (const fx of [sx + sw * 0.15, sx + sw * 0.85]) { for (let cy = y1 - 8; cy > -30; cy -= 11) { g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.moveTo(fx, cy); g.lineTo(fx, cy - 7); g.stroke(); g.strokeStyle = '#cbd5e1'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(fx, cy); g.lineTo(fx, cy - 7); g.stroke(); } }
      g.lineCap = 'butt';
      g.save(); rr(g, cx - bw / 2, y1, bw, bh, 8); g.clip(); g.fillStyle = '#f5c518'; g.fillRect(cx - bw / 2, y1, bw, bh);
      g.fillStyle = '#1f2937'; for (let k = -2; k < bw / 14 + 2; k++) { g.beginPath(); g.moveTo(cx - bw / 2 + k * 14, y1 + bh); g.lineTo(cx - bw / 2 + k * 14 + 7, y1 + bh); g.lineTo(cx - bw / 2 + k * 14 + 7 + bh, y1); g.lineTo(cx - bw / 2 + k * 14 + bh, y1); g.closePath(); g.fill(); }
      g.restore(); g.strokeStyle = OUT; g.lineWidth = 3.5; rr(g, cx - bw / 2, y1, bw, bh, 8); g.stroke();
      g.fillStyle = '#e2e8f0'; for (const fx of [cx - bw / 2 + 7, cx + bw / 2 - 7]) { g.beginPath(); g.arc(fx, y1 + bh / 2, 3.4, 0, 7); g.fill(); g.stroke(); }
    }
  }
  function drawTramp(g, tp, S, X, Y, t) {
    const x = X(tp.x), y = Y(tp.y), w = tp.w * S, sq = squashT[tp.x] !== undefined && t - squashT[tp.x] < 0.35 ? Math.sin((t - squashT[tp.x]) / 0.35 * Math.PI) : 0;
    g.lineWidth = 3.5; g.strokeStyle = OUT;
    g.fillStyle = '#475569'; rr(g, x - w * 0.5, y - S * 0.32, S * 0.14, S * 0.32, 3); g.fill(); g.stroke(); rr(g, x + w * 0.5 - S * 0.14, y - S * 0.32, S * 0.14, S * 0.32, 3); g.fill(); g.stroke();
    g.fillStyle = '#ef4444'; rr(g, x - w * 0.55, y - S * 0.42 + sq * S * 0.14, w * 1.1, S * 0.16, S * 0.08); g.fill(); g.stroke();
    g.fillStyle = '#fde047'; rr(g, x - w * 0.5, y - S * 0.43 + sq * S * 0.14, w, S * 0.07, S * 0.04); g.fill();
    g.strokeStyle = '#cbd5e1'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k <= 4; k++) { const sx2 = x - w * 0.35 + (w * 0.7) * (k / 4); g.moveTo(sx2, y - S * 0.26 + sq * S * 0.12); g.lineTo(sx2 + (k % 2 ? 4 : -4), y - S * 0.06); } g.stroke();
  }
  function drawPad(g, pd, S, X, Y, t) {
    const x = X(pd.x), y = Y(pd.y), w = pd.w * S;
    g.fillStyle = '#16a34a'; g.strokeStyle = OUT; g.lineWidth = 3; rr(g, x - w / 2, y - S * 0.12, w, S * 0.2, S * 0.08); g.fill(); g.stroke();
    g.fillStyle = '#bbf7d0'; for (let k = 0; k < 3; k++) { const ax = x - w * 0.28 + k * w * 0.28 + ((t * 2) % 1) * 4; g.beginPath(); g.moveTo(ax - S * 0.12, y - S * 0.09); g.lineTo(ax + S * 0.12, y - S * 0.02); g.lineTo(ax - S * 0.12, y + S * 0.05); g.closePath(); g.fill(); }
    g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 6); g.fillStyle = '#86efac'; g.beginPath(); g.ellipse(x, y - S * 0.2, w * 0.6, S * 0.35, 0, 0, 7); g.fill(); g.globalAlpha = 1;
  }
  // buz: beyaz, üstünde çivi gibi sivri sarkıtlar (kristaller) olan buz parçası
  function drawIce(g, x, y, S, t, sc = 1) {
    S *= sc; g.save(); g.lineJoin = 'round';
    const slab = g.createLinearGradient(0, y - S * 0.3, 0, y); slab.addColorStop(0, '#ffffff'); slab.addColorStop(1, '#cfe9fb');
    g.fillStyle = slab; g.strokeStyle = '#38a3d8'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y - S * 0.1, S * 0.74, S * 0.2, 0, 0, 7); g.fill(); g.stroke();
    const spikes = [[-0.5, 0.55, 0.14], [-0.25, 0.85, 0.17], [0, 1.1, 0.2], [0.27, 0.78, 0.16], [0.52, 0.5, 0.13]];
    for (const [dx, h, w] of spikes) {
      const bx = x + dx * S, by = y - S * 0.14;
      const gr = g.createLinearGradient(bx, by - h * S, bx, by); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bfe3fa');
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - w * S, by); g.lineTo(bx + (dx * 0.1) * S, by - h * S); g.lineTo(bx + w * S, by); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(56,163,216,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, by - h * S * 0.2); g.lineTo(bx + dx * 0.05 * S, by - h * S * 0.8); g.stroke(); g.strokeStyle = '#38a3d8'; g.lineWidth = 3;
    }
    // zeminin kenarından sarkan küçük sarkıtlar
    g.fillStyle = '#e6f5ff';
    for (const dx of [-0.6, -0.3, 0.1, 0.45, 0.65]) { const bx = x + dx * S; g.beginPath(); g.moveTo(bx - S * 0.06, y - S * 0.06); g.lineTo(bx, y + S * (0.2 + 0.05 * Math.sin(dx * 9))); g.lineTo(bx + S * 0.06, y - S * 0.06); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#fff'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5 + x); g.fillRect(x - S * 0.05, y - S * 0.7, 3, 3); g.globalAlpha = 1;
    g.restore();
  }
  // elde tutulan / havada giden güç simgesi
  function drawItemIcon(g, k, x, y, S, t) {
    const sc = 0.55;
    if (k === 1) { g.save(); g.translate(x, y); g.scale(sc, sc); drawSaw(g, 0, 0, S * 0.9, t); g.restore(); }
    else if (k === 10) drawIce(g, x, y + S * 0.25, S, t, 0.45);
    else if (k === 3) drawTrap(g, x, y + S * 0.2, S * 0.55);
    else if (k === 9) { g.save(); g.translate(x, y + S * 0.3); g.scale(0.5, 0.5); drawPbox(g, 0, 0, S); g.restore(); }
    else { g.font = `${Math.round(S * 0.62)}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((P.ITEMS[k] || {}).emoji || '❓', x, y); }
  }
  function drawPbox(g, x, y, S) {
    g.fillStyle = '#dc2626'; g.strokeStyle = OUT; g.lineWidth = 3.5; rr(g, x - S * 0.45, y - S * 0.9, S * 0.9, S * 0.9, 8); g.fill(); g.stroke();
    g.strokeStyle = '#fca5a5'; g.lineWidth = 2.5; rr(g, x - S * 0.36, y - S * 0.81, S * 0.72, S * 0.72, 5); g.stroke();
    g.font = `${Math.round(S * 0.55)}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🥊', x, y - S * 0.44);
  }
  // arka plan tribünü: taraftar hayvanlar (yavaş kayan paralaks), zıplar, bayrak sallar
  function drawStands(g, W, H, cx, cy, S, anchorY, t) {
    const par = 0.55, step = 96;
    const k0 = Math.floor((cx - W / S) / step) - 1, k1 = Math.ceil((cx + W / S) / step) + 1;
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const wx = 30 + k * step;
      const px = W / 2 + (wx - cx) * S * par;
      const w = 20 * S * par * 1.4, by = anchorY + S * 0.4 + cy * S * 0.5;
      if (px + w / 2 < -20 || px - w / 2 > W + 20) continue;
      const tiers = 3, th2 = S * 0.95 * par * 1.4;
      for (let ti = 0; ti < tiers; ti++) {
        const ty = by - (ti + 1) * th2, tw = w * (1 - ti * 0.1);
        g.fillStyle = ['#64748b', '#78859b', '#94a3b8'][ti]; g.strokeStyle = OUT; g.lineWidth = 2.5; g.fillRect(px - tw / 2, ty, tw, th2); g.strokeRect(px - tw / 2, ty, tw, th2);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const fx = px - tw / 2 + tw * (i + 0.5) / n, a = FANS[(k * 5 + ti * 3 + i * 7) % FANS.length];
          const bob = Math.abs(Math.sin(t * (2.5 + ((i + ti) % 3) * 0.7) + i * 1.3 + k)) * th2 * 0.28;
          g.font = `${Math.round(th2 * 0.95)}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(a, fx, ty + th2 - bob + 2);
          if ((i + ti + k) % 4 === 0) { const fy = ty + th2 * 0.1 - bob; g.strokeStyle = '#e5e7eb'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx + th2 * 0.4, ty + th2 * 0.7 - bob); g.lineTo(fx + th2 * 0.4, fy - th2 * 0.5); g.stroke(); g.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#22c55e'][(i + k) % 4]; g.beginPath(); g.moveTo(fx + th2 * 0.4, fy - th2 * 0.5); g.lineTo(fx + th2 * 0.4 + th2 * 0.5, fy - th2 * 0.38 + Math.sin(t * 6 + i) * 3); g.lineTo(fx + th2 * 0.4, fy - th2 * 0.2); g.fill(); }
        }
      }
      // üstte afiş
      g.fillStyle = '#b91c1c'; g.strokeStyle = OUT; g.lineWidth = 2.5; rr(g, px - w * 0.3, by - tiers * th2 - th2 * 0.7, w * 0.6, th2 * 0.6, 6); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(th2 * 0.42)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PARTİ LİGİ', px, by - tiers * th2 - th2 * 0.4);
    }
  }
  function drawGate(g, x, text, bg, S, X, Y, hgt) {
    const sx = X(x), fy = Y(floorY(x)), top = fy - hgt * S;
    g.lineWidth = 3.5; g.strokeStyle = OUT; g.fillStyle = '#f8fafc';
    rr(g, sx - S * 0.18, top, S * 0.36, hgt * S, 4); g.fill(); g.stroke();
    g.fillStyle = bg; rr(g, sx - S * 1.6, top - S * 0.2, S * 3.2, S * 1.1, 10); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `1000 ${Math.round(S * 0.62)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, sx, top + S * 0.35);
  }
  function drawQBox(g, bx, by, S, t, i) {
    const s = S * 0.9, a = Math.sin(t * 3 + i) * 0.08 * S, x = bx - s / 2, y = by - s / 2 - a;
    g.save(); g.translate(bx, by - a); g.rotate(Math.sin(t * 2.2 + i) * 0.1); g.translate(-bx, -(by - a));
    const gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, '#fef08a'); gr.addColorStop(1, '#f59e0b');
    g.fillStyle = gr; g.strokeStyle = OUT; g.lineWidth = 3.5; rr(g, x, y, s, s, 8); g.fill(); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; rr(g, x + 4, y + 4, s - 8, s - 8, 5); g.stroke();
    g.fillStyle = '#7c2d12'; g.font = `1000 ${Math.round(s * 0.72)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', bx, by - a + 2);
    g.restore();
  }
  function drawSaw(g, x, y, S, t) {
    g.save(); g.translate(x, y); g.rotate(-t * 18); g.fillStyle = '#e5e7eb'; g.strokeStyle = OUT; g.lineWidth = 3;
    g.beginPath(); for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = k % 2 ? S * 0.42 : S * 0.58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#94a3b8'; g.beginPath(); g.arc(0, 0, S * 0.14, 0, 7); g.fill(); g.stroke(); g.restore();
  }
  function drawTrap(g, x, y, S) {       // ayı kapanı: metal, yuvarlak, dişli çene
    g.strokeStyle = OUT; g.lineWidth = 3;
    const gr = g.createRadialGradient(x - S * 0.15, y - S * 0.18, S * 0.05, x, y - S * 0.1, S * 0.65); gr.addColorStop(0, '#e5e7eb'); gr.addColorStop(0.6, '#9ca3af'); gr.addColorStop(1, '#4b5563');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y - S * 0.08, S * 0.62, S * 0.2, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#374151'; g.beginPath(); g.ellipse(x, y - S * 0.08, S * 0.34, S * 0.11, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#e5e7eb'; for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI, tx = x + Math.cos(a) * S * 0.56, ty = y - S * 0.08 + Math.sin(a) * S * 0.17; g.beginPath(); g.moveTo(tx - S * 0.06, ty + S * 0.03); g.lineTo(tx, ty - S * 0.2); g.lineTo(tx + S * 0.06, ty + S * 0.03); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#ef4444'; g.beginPath(); g.arc(x, y - S * 0.08, S * 0.05, 0, 7); g.fill();
  }
  function drawCrate(g, c, S, X, Y, t) {
    const x = X(c.x), w = c.w * S, y1 = Y(c.y1), y0 = Y(c.y0); const fl = c.life < 2 ? (Math.sin(t * 30) > 0 ? 1 : 0.4) : 1;
    g.globalAlpha = fl; g.fillStyle = '#a78bfa'; g.strokeStyle = OUT; g.lineWidth = 3.5; rr(g, x, y1, w, y0 - y1, 7); g.fill(); g.stroke();
    g.strokeStyle = '#4c1d95'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 5, y1 + 5); g.lineTo(x + w - 5, y0 - 5); g.moveTo(x + w - 5, y1 + 5); g.lineTo(x + 5, y0 - 5); g.stroke(); g.globalAlpha = 1;
  }

  // ---------- kare ----------
  function frame(st, now, dt, W, H, g, DPR) {
    const t = now / 1000, land = W / H > 1.25;
    const lead = st.racers.reduce((a, b) => (b.x > a.x ? b : a), st.racers[0]);
    const me = st.byId[meId] || lead;
    const S = land ? H / 9.6 : W / 10.5;                    // piksel / birim: dikeyde geniş görüş (üst katlar görünsün)
    const tx = me.x + (W / S) * 0.2, ty = me.y;
    if (!camInit) { camX = tx; camY = ty; camInit = true; }
    camX = lerp(camX, tx, 1 - Math.pow(0.0006, dt)); camY = lerp(camY, ty + (me.grounded ? 0.9 : 0.4), 1 - Math.pow(0.012, dt));
    shake = Math.max(0, shake - dt * 1.6);
    const shx = (Math.random() - 0.5) * shake * S * 0.25, shy = (Math.random() - 0.5) * shake * S * 0.25;
    const anchorY = H * (land ? 0.72 : 0.66);
    const X = (x) => W / 2 + (x - camX) * S + shx, Y = (y) => anchorY - (y - camY) * S + shy;
    const groundSY = Y(0);
    drawSky(g, W, H, camX, S);
    drawHills(g, W, H, camX, camY, S, groundSY);
    drawStands(g, W, H, camX, camY, S, anchorY, t);
    drawDecor(g, W, S, X, Y);
    for (const p of track.plats) drawPlat(g, p, W, H, S, X, Y);
    for (const p of track.up || []) drawPlat(g, p, W, H, S, X, Y, true);
    drawGate(g, P.START_X + 3.5, 'BAŞLA', '#22c55e', S, X, Y, 3.4);
    drawGate(g, track.finishX, 'BİTİŞ', '#111827', S, X, Y, 3.8);
    // bitiş çizgisi (damalı)
    { const fx = X(track.finishX), fy = Y(floorY(track.finishX)); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#111827' : '#fff'; g.fillRect(fx - S * 0.3, fy - S * 0.1 - i * 0.12 * S, S * 0.6, 0.12 * S); } }
    for (const o of track.obst) { const sx = X(o.x); if (sx < -S * 3 || sx > W + S) continue; drawObst(g, o, S, X, Y); }
    for (let i = 0; i < track.boxes.length; i++) { const b = track.boxes[i], sx = X(b.x); if (sx < -S || sx > W + S) continue; if (st.boxT[i] > 0) continue; drawQBox(g, sx, Y(b.y), S, t, i); }
    for (const tp of track.tramps || []) { const sx = X(tp.x); if (sx < -S * 2 || sx > W + S * 2) continue; drawTramp(g, tp, S, X, Y, t); }
    for (const pd of track.pads || []) { const sx = X(pd.x); if (sx < -S * 3 || sx > W + S * 3) continue; drawPad(g, pd, S, X, Y, t); }
    for (const sp of splats) { const k = sp.t / 6; if (k >= 1) continue; g.globalAlpha = 0.65 * (1 - k); g.fillStyle = '#991b1b'; g.beginPath(); g.ellipse(X(sp.x), Y(sp.y) + 2, S * 0.9, S * 0.14, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
    for (const tr of st.traps) { const k = tr.kind || 'trap'; if (k === 'ice') drawIce(g, X(tr.x), Y(tr.y), S, t); else if (k === 'pbox') drawPbox(g, X(tr.x), Y(tr.y), S); else drawTrap(g, X(tr.x), Y(tr.y), S); }
    for (const c of st.crates) drawCrate(g, c, S, X, Y, t);
    for (const s of st.saws) { const gy = s.y !== undefined ? s.y : (P.groundAt(st.track, s.x) ?? 0) + 0.45; drawSaw(g, X(s.x), Y(gy), S, t * (s.dir === 'b' ? -1 : 1)); }
    for (const sp of splats) sp.t += dt;
    // karakterler: yerel oyuncu en üstte
    const order = st.racers.slice().sort((a, b) => (a.id === meId) - (b.id === meId));
    for (const r of order) {
      const sp = sprites.get(r.id); if (!sp) continue;
      const sx = X(r.x), sy = Y(r.y);
      if (sx < -S * 2 || sx > W + S * 2) continue;
      // gölge
      const gy = surf(r.x, r.y);
      if (gy !== null && r.fall === null) { const k = clamp(1 - (r.y - gy) / 6, 0.35, 1); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(sx, Y(gy) + 2, S * 0.6 * k, S * 0.14 * k, 0, 0, 7); g.fill(); }
      sp.st.phase += dt * (3 + r.sp * 1.45) * (r.grounded ? 1 : 0.2);
      sp.blink -= dt; const blinkNow = sp.blink < 0.1 && sp.blink > 0; if (sp.blink < 0) sp.blink = 2.5 + Math.random() * 3;
      const inv = r.inv > 0 && r.fall === null && Math.sin(t * 40) < -0.3;
      if (!inv && !r.gore) {
        drawAnimal(sp.g, r.animal || sp.r.animal, null, sp.r.hat || 'yok', { ...poseOf(r, t), blink: blinkNow }, t, sp.st);
        const k = S / PPU, dim = r.id !== meId && order.length > 1 && Math.abs(r.x - me.x) < 1.6 ? 0.78 : 1;
        g.globalAlpha = dim; g.drawImage(sp.cv, sx - FX0 * k, sy - FY0 * k, SPR * k, SPR * k); g.globalAlpha = 1;
        if (r.ice > 0) { g.fillStyle = 'rgba(186,230,253,.45)'; g.strokeStyle = '#7dd3fc'; g.lineWidth = 3; rr(g, sx - S * 0.5, sy - S * 1.45, S * 1.0, S * 1.5, S * 0.18); g.fill(); g.stroke(); }
      }
      // başın üstünde renkli ▼ işareti (ekran görüntüsündeki gibi) + isim
      const hy = sy - S * 2.55, bob = Math.sin(t * 6 + sx * 0.01) * 3;
      g.fillStyle = sp.mark; g.strokeStyle = OUT; g.lineWidth = 2.5; g.beginPath(); g.moveTo(sx - S * 0.17, hy + bob); g.lineTo(sx + S * 0.17, hy + bob); g.lineTo(sx, hy + S * 0.24 + bob); g.closePath(); g.fill(); g.stroke();
      if (r.id !== meId) { g.font = `800 ${Math.round(S * 0.3)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(sp.r.name, sx, hy - 4); g.fillStyle = '#fff'; g.fillText(sp.r.name, sx, hy - 4); }
      if (r.grounded && r.sp > 5 && r.fall === null && Math.random() < 0.35) emit(r.x - 0.3, r.y, 1, { color: '#e5e7eb', speed: 1.4, up: 0.3, size: 0.75, life: 0.35, g: 0.5, dirX: -1 });
      if (r.boost > 0 && Math.random() < 0.8) emit(r.x - 0.6, r.y + 0.6, 1, { color: Math.random() < 0.5 ? '#fb923c' : '#fde047', speed: 2, up: 0.2, size: 1.1, life: 0.35, g: 0, dirX: -1 });
    }
    // havada giden güçler (elden fırlatılmış): kapan, yumruk kutusu, buz, sandık, eldiven, şok
    for (const pj of st.proj || []) {
      const px = X(pj.x), py = Y(pj.y); if (px < -S * 2 || px > W + S * 2) continue;
      if (pj.k === 'zap') { g.strokeStyle = '#fde047'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.lineTo(px - pj.vx * 0.05 * S / 10 * 2, py + pj.vy * 0.05 * S / 10 * 2); g.stroke(); g.lineCap = 'butt'; g.fillStyle = '#fef9c3'; g.beginPath(); g.arc(px, py, S * 0.14, 0, 7); g.fill(); continue; }
      if (pj.k === 'glove') { g.font = `${Math.round(S * 0.8)}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(px, py); if (pj.vx < 0) g.scale(-1, 1); g.fillText('🥊', 0, 0); g.restore(); continue; }
      g.save(); g.translate(px, py); g.rotate(t * 8 * (pj.vx < 0 ? -1 : 1)); drawItemIcon(g, pj.k === 'trap' ? 3 : pj.k === 'pbox' ? 9 : pj.k === 'ice' ? 10 : 6, 0, 0, S, t); g.restore();
    }
    // elde tutulan güç (herkesin elinde görünür) + eldeki gücü yön seçerken ok/yol önizlemesi
    for (const r of order) {
      if (!r.item || r.fall !== null || r.gore) continue;
      const sx2 = X(r.x), sy2 = Y(r.y); if (sx2 < -S * 2 || sx2 > W + S * 2) continue;
      const hx = sx2 + S * 0.55, hy = sy2 - S * 0.95 + Math.sin(t * 7) * S * 0.04;
      g.save(); g.fillStyle = '#fff'; drawItemIcon(g, r.item, hx, hy, S, t); g.restore();
      if (r.id === meId && aimDir) {
        const dir = aimDir, sp0 = Math.max(0, r.sp);
        if (r.item === 4 || r.item === 5) continue;
        const tv = (P.THROW[dir] || P.THROW.f)(sp0), ray = r.item === 2 || r.item === 7;
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (let i = 1; i <= 16; i++) {
          const tt = i * 0.06; let ex, ey;
          if (ray) { const v = r.item === 2 ? 48 : 26; ex = r.x + (dir === 'f' ? v * tt : dir === 'b' ? -v * tt : 0); ey = r.y + 0.95 + (dir === 'u' ? v * tt : dir === 'd' ? -v * tt : 0); }
          else { ex = r.x + tv.vx * tt; ey = r.y + 0.95 + tv.vy * tt - 0.5 * P.PROJ_G * tt * tt; }
          g.globalAlpha = 1 - i / 18; g.beginPath(); g.arc(X(ex), Y(ey), Math.max(2.5, S * 0.07), 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        const ar = { f: '➡️', b: '⬅️', u: '⬆️', d: '⬇️' }[dir]; g.font = `${Math.round(S * 0.6)}px system-ui, "Apple Color Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ar, sx2, sy2 - S * 2.9);
      }
    }
    // meteorlar: gökten hedefin üstüne iner
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.t += dt; const b = st.byId[m.id];
      if (m.t > 0.7 || !b) { meteors.splice(i, 1); continue; }
      const k = m.t / 0.7, mx = X(b.x) + (1 - k) * S * 3, my = Y(b.y + 0.9) - (1 - k) * H * 0.9;
      g.save(); g.font = `${Math.round(S * 1.1)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('☄️', mx, my); g.restore();
    }
    // yıldırım
    if (boltT > 0) {
      boltT -= dt; const a = st.byId[boltFrom], b = st.byId[boltTo];
      if (a && b) { g.strokeStyle = '#fde047'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath(); for (let i = 0; i <= 10; i++) { const k = i / 10, jx = i === 0 || i === 10 ? 0 : (Math.random() - 0.5) * S * 0.5, jy = i === 0 || i === 10 ? 0 : (Math.random() - 0.5) * S * 0.5; const px = X(a.x + (b.x - a.x) * k) + jx, py = Y(a.y + 0.9 + (b.y - a.y) * k) + jy; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); }
    }
    // parçacıklar
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      g.fillStyle = p.c; g.globalAlpha = 1 - p.life / p.max; g.beginPath(); g.arc(X(p.x), Y(p.y), Math.max(1, S * 0.09 * p.s * (1 - p.life / p.max)), 0, 7); g.fill(); g.globalAlpha = 1;
    }
    // hız çizgileri, kırmızı flaş, konfeti
    const spd = me.boost > 0 ? 1 : clamp((me.sp - 9.6) / 3, 0, 0.5);
    if (spd > 0.05 && me.fall === null) {
      g.strokeStyle = `rgba(255,255,255,${0.22 + spd * 0.3})`; g.lineWidth = Math.max(1.5, 2 * DPR); g.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const y = ((i * 0.137 + 0.05) % 1) * H, ph = ((performance.now() / (260 - spd * 120)) + i * 0.37) % 1, x = W * (1 - ph * 1.3), len = W * (0.08 + 0.14 * spd); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke(); }
    }
    if (flash > 0) { g.fillStyle = `rgba(239,68,68,${flash * 0.35})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 3); }
    for (let i = confetti.length - 1; i >= 0; i--) { const c = confetti[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; if (c.y > 1.05) { confetti.splice(i, 1); continue; } g.save(); g.translate(c.x * W, c.y * H); g.rotate(c.rot); g.fillStyle = c.c; g.fillRect(-c.r * DPR / 2, -c.r * DPR / 4, c.r * DPR, c.r * DPR / 2); g.restore(); }
    return me;
  }
  return { frame, events, setAim(d) { aimDir = d; }, dispose() { sprites.clear(); parts = []; confetti = []; }, emit, get shake() { return shake; }, set shake(v) { shake = v; } };
}
