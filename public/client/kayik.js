// 🛶 Kayık Kafilesi istemcisi: 2D (nehir yönüne dönen takip kamerası) + 3D takip
// Nehir tohumdan üretilir (K.course); yuvarlak kayığın dış kenarında iki oyuncunun avatarı durur, gaz salarak kayığı iter.
import * as K from '../games/kayik.js';
import { lerp, clamp, sfx, esc } from './util.js';
import { drawTopAvatar, portraitURL } from './avatar2d.js';
import { createRealtime } from './rt.js';
import { loadThree, buildAvatar, animateAvatar, startEmote, makeLabel } from './avatar3d.js';

const TEAM_COLORS = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#3b82f6', '#14b8a6', '#f43f5e', '#84cc16', '#8b5cf6'];
const GRASS = '#4f8a3c', GRASS2 = '#3f7431', SAND = '#d8c48f', WATER = '#2f86c4', WATER2 = '#246fa6', ROCK = '#8b8f97', ROCK2 = '#5f636b', WOOD = '#8a5a2b', WOOD2 = '#6b4220';
const SEAT_NAME = ['1. OYUNCU', '2. OYUNCU'];
const RIM = 0.82;   // avatarların kayık merkezine uzaklığı (dünya birimi)

// Kıyı süsleri (ağaç, çalı, kaya) — tohumdan, her cihazda aynı
function makeDecor(c) {
  const R = K.rng(c.seed + 11), out = [];
  const clearOf = (x, y, m) => { for (let i = 0; i < c.n; i += 3) { const dx = c.px[i] - x, dy = c.py[i] - y; if (dx * dx + dy * dy < (c.w[i] + m) ** 2) return false; } return true; };
  for (let s = -6; s < c.LEN + 10; s += 1.3) for (const side of [-1, 1]) {
    if (R() < 0.25) continue;
    const ss = clamp(s, 0, c.LEN), hw = K.widthAt(c, ss), d = side * (hw + 0.9 + R() * 6.5);
    const f = K.frame(c, ss), x = f.x + f.nx * d + (s - ss) * f.tx, y = f.y + f.ny * d + (s - ss) * f.ty;
    const r = 0.45 + R() * 0.55, kind = R() < 0.72 ? 'tree' : R() < 0.6 ? 'bush' : 'stone';
    if (!clearOf(x, y, r + 0.5)) continue;
    out.push({ x, y, s: ss, r, kind, tone: R() });
  }
  return out;
}

export function createKayik(ctx) {
  const { pById, playerId } = ctx;
  const g = ctx.g2d;
  let c = null, decor = [];
  const cam = { x: 0, y: 0, a: -Math.PI / 2, init: false };
  let parts = [], shakeT = 0, goAt = 0, lastBurstUI = '';
  let R3 = null, T = null, loading = false;
  const portraits = new Map();

  const teamsG = () => (ctx.state() && ctx.state().g && ctx.state().g.teams) || [];
  const myTeam = () => teamsG().find((t) => t.members.includes(playerId)) || null;
  const mySeat = () => { const t = myTeam(); return t ? t.members.indexOf(playerId) : -1; };
  const teamColor = (id) => TEAM_COLORS[id % TEAM_COLORS.length];
  const names = (t) => t.members.filter((id, i, a) => a.indexOf(id) === i).map((id) => (pById(id) || { name: '?' }).name);
  const portraitImg = (id) => {
    const p = pById(id); if (!p) return null;
    let im = portraits.get(id);
    if (!im) { im = new Image(); im.src = portraitURL(p.look, p.color, 20); portraits.set(id, im); }
    return im.complete && im.naturalWidth ? im : null;
  };
  const standings = (st) => K.standings(st.boats);
  const placeOf = (st, id) => standings(st).findIndex((b) => b.id === id) + 1;

  function setCourse(seed) {
    if (seed == null || (c && c.seed === (seed >>> 0))) return;
    c = K.course(seed);
    decor = makeDecor(c);
    cam.init = false;
    if (R3) buildRiver3D();
  }

  // ---------- 2D ----------
  // Dünya dönüşümü: kamera nehrin akış yönüne döner (akış ekranda yukarı)
  let sc = 30;
  const worldXf = (W, H, shake) => {
    g.translate(W / 2 + shake, H * 0.64 + shake);
    g.rotate(-cam.a - Math.PI / 2);
    g.scale(sc, sc);
    g.translate(-cam.x, -cam.y);
  };
  const toScreen = (W, H, shake) => {
    const cs = Math.cos(-cam.a - Math.PI / 2), sn = Math.sin(-cam.a - Math.PI / 2);
    return (x, y) => { const dx = (x - cam.x) * sc, dy = (y - cam.y) * sc; return [W / 2 + dx * cs - dy * sn + shake, H * 0.64 + dx * sn + dy * cs + shake]; };
  };
  function edgePath(s0, s1, off, close = true) {
    // nehir kıyı çokgeni: sol kenar ileri, sağ kenar geri (off: genişliğe eklenen pay)
    const L = [], Rr = [];
    for (let s = s0; s <= s1 + 1e-6; s += K.DS) { const f = K.frame(c, s), hw = K.widthAt(c, s) + off; L.push([f.x + f.nx * hw, f.y + f.ny * hw]); Rr.push([f.x - f.nx * hw, f.y - f.ny * hw]); }
    g.beginPath();
    L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    if (close) g.closePath();
  }
  function drawRiver2D(st, s0, s1, now) {
    const el = st ? st.el : 0;
    // kum kıyı + su
    edgePath(s0, s1, 0.35); g.fillStyle = SAND; g.fill();
    edgePath(s0, s1, 0); g.fillStyle = WATER; g.fill();
    // ortada daha açık akıntı şeridi
    g.save(); edgePath(s0, s1, 0); g.clip();
    g.lineCap = 'round';
    for (let s = Math.floor(s0 / 1.5) * 1.5; s < s1; s += 1.5) {
      const hw = K.widthAt(c, s);
      for (let k = 0; k < 3; k++) {
        const h = Math.sin(s * 12.9898 + k * 78.233) * 43758.5453, fr = h - Math.floor(h);
        const d = (fr - 0.5) * 2 * (hw - 0.4);
        const sp = K.CURRENT * (1 - 0.45 * (d / hw) ** 2) * (K.inRapids(c, s) ? 2.6 : 1);
        const ss = s + ((el * sp + fr * 7) % 1.5);
        const a = K.world(c, ss, d), b = K.world(c, ss + 0.45, d);
        g.strokeStyle = K.inRapids(c, s) ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)'; g.lineWidth = 0.07;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // kenar gölgesi (sığ su)
    edgePath(s0, s1, -0.05, false); g.strokeStyle = 'rgba(180,230,255,.35)'; g.lineWidth = 0.18; g.stroke();
    // akıntılı bölgeler: köpük şeritleri
    for (const rp of c.rapids) {
      if (rp.s1 < s0 || rp.s0 > s1) continue;
      for (let s = rp.s0; s < rp.s1; s += 0.9) {
        const hw = K.widthAt(c, s), ph = (el * 2.4 + s) % 0.9;
        for (const d of [-hw * 0.6, 0, hw * 0.6]) {
          const p = K.world(c, s + ph, d + Math.sin(s * 3) * 0.3), f = K.frame(c, s + ph);
          g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.08;
          g.beginPath(); g.moveTo(p.x - f.nx * 0.35 - f.tx * 0.2, p.y - f.ny * 0.35 - f.ty * 0.2); g.lineTo(p.x, p.y); g.lineTo(p.x + f.nx * 0.35 - f.tx * 0.2, p.y + f.ny * 0.35 - f.ty * 0.2); g.stroke();
        }
      }
    }
    // girdaplar
    for (const wh of c.whirls) {
      if (wh.s < s0 - 3 || wh.s > s1 + 3) continue;
      const p = K.world(c, wh.s, wh.d);
      const gr = g.createRadialGradient(p.x, p.y, 0.1, p.x, p.y, wh.r);
      gr.addColorStop(0, '#0d3a5c'); gr.addColorStop(1, 'rgba(47,134,196,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, wh.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.06;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        for (let q = 0; q <= 24; q++) { const u = q / 24, rr = wh.r * (0.15 + u * 0.8), a = wh.spin * (el * 2.2 + u * 5) + k * 2.094; const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr; q ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    }
    g.restore();
    // dar boğaz: kıyıda kayalık
    for (const nw of c.narrows) {
      if (nw.s1 < s0 || nw.s0 > s1) continue;
      for (let s = nw.s0 - 2; s < nw.s1 + 2; s += 0.7) for (const sd of [-1, 1]) {
        const p = K.world(c, s, sd * (K.widthAt(c, s) + 0.35));
        g.fillStyle = ROCK2; g.beginPath(); g.arc(p.x, p.y, 0.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = ROCK; g.beginPath(); g.arc(p.x - 0.08, p.y - 0.08, 0.36, 0, Math.PI * 2); g.fill();
      }
    }
    // kontrol noktaları: iki yanda şamandıra
    for (const cp of c.cps) {
      if (!cp || cp < s0 || cp > s1) continue;
      for (const sd of [-1, 1]) {
        const p = K.world(c, cp, sd * (K.widthAt(c, cp) - 0.25));
        g.fillStyle = '#facc15'; g.beginPath(); g.arc(p.x, p.y, 0.22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ef4444'; g.beginPath(); g.arc(p.x, p.y, 0.12, 0, Math.PI * 2); g.fill();
      }
    }
    // bitiş kapısı (dama) + şelale
    if (c.FIN > s0 && c.FIN < s1 + 2) {
      const f = K.frame(c, c.FIN), hw = K.widthAt(c, c.FIN), sq = 0.35;
      for (let i = -Math.ceil(hw / sq); i < Math.ceil(hw / sq); i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        const x = f.x + f.nx * i * sq + f.tx * j * sq, y = f.y + f.ny * i * sq + f.ty * j * sq;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(f.ny, f.nx)); g.fillRect(0, 0, sq, sq); g.restore();
      }
    }
    if (c.LEN - 1 < s1 + 4) {
      const f = K.frame(c, c.LEN), hw = K.widthAt(c, c.LEN) + 0.35;
      g.save(); g.translate(f.x, f.y); g.rotate(Math.atan2(f.ty, f.tx));
      const gr = g.createLinearGradient(-0.6, 0, 3, 0); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.3, '#9fd3f0'); gr.addColorStop(1, '#0b2236');
      g.fillStyle = gr; g.fillRect(-0.6, -hw - 0.5, 12, hw * 2 + 1);
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (let k = 0; k < 14; k++) { const yy = -hw + (k / 13) * hw * 2, ph = (now / 600 + k * 0.37) % 1; g.beginPath(); g.arc(-0.3 + ph * 1.2, yy, 0.25 * (1 - ph) + 0.05, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    // kayalar
    for (const rk of c.rocks) {
      if (rk.s < s0 - 2 || rk.s > s1 + 2) continue;
      const p = K.world(c, rk.s, rk.d);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(p.x, p.y, rk.r + 0.12 + Math.sin(now / 300 + rk.s) * 0.03, 0, Math.PI * 2); g.fill();
      g.fillStyle = ROCK2; g.beginPath(); g.arc(p.x, p.y, rk.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = ROCK; g.beginPath(); g.arc(p.x - rk.r * 0.2, p.y - rk.r * 0.2, rk.r * 0.7, 0, Math.PI * 2); g.fill();
    }
    // kütükler
    for (const lg of c.logs) {
      if (lg.s < s0 - 2 || lg.s > s1 + 2) continue;
      const f = K.frame(c, lg.s), ld = K.logD(lg, el), x = f.x + f.nx * ld, y = f.y + f.ny * ld;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(f.ny, f.nx));
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.roundRect(-lg.half + 0.08, -lg.r + 0.1, lg.half * 2, lg.r * 2, lg.r); g.fill();
      g.fillStyle = WOOD; g.beginPath(); g.roundRect(-lg.half, -lg.r, lg.half * 2, lg.r * 2, lg.r); g.fill();
      g.strokeStyle = WOOD2; g.lineWidth = 0.05;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 0.35 - 0.1, -lg.r * 0.6); g.lineTo(k * 0.35 + 0.1, lg.r * 0.6); g.stroke(); }
      g.fillStyle = '#c89a62'; g.beginPath(); g.ellipse(lg.half - 0.05, 0, 0.07, lg.r * 0.9, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  function drawDecor2D(s0, s1) {
    for (const d of decor) {
      if (d.s < s0 - 4 || d.s > s1 + 4) continue;
      if (d.kind === 'tree') {
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(d.x + 0.25, d.y + 0.3, d.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = d.tone < 0.5 ? '#1f5a2a' : '#2a6b2f'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = d.tone < 0.5 ? '#2e7d3a' : '#3c8f3b'; g.beginPath(); g.arc(d.x - d.r * 0.25, d.y - d.r * 0.25, d.r * 0.6, 0, Math.PI * 2); g.fill();
      } else if (d.kind === 'bush') {
        g.fillStyle = '#5b9a3e'; g.beginPath(); g.arc(d.x, d.y, d.r * 0.55, 0, Math.PI * 2); g.fill();
      } else { g.fillStyle = ROCK; g.beginPath(); g.arc(d.x, d.y, d.r * 0.5, 0, Math.PI * 2); g.fill(); }
    }
  }
  // Kayık (ekran uzayında): yuvarlak şamandıra, takım rengi, kenarda duran avatarlar, gaz bulutları
  function drawBoat2D(b, toS, now) {
    const t = teamsG().find((x) => x.id === b.id);
    if (!t) return;
    if (b.dead > 0) return;                                   // patladı: yeniden doğmayı bekliyor
    const [x, y] = toS(b.x, b.y), rot = cam.a + Math.PI / 2;      // dünya açısı → ekran açısı: a' = a - rot
    const R = K.RAFT_R * 1.25 * sc, col = teamColor(b.id);
    g.save();
    if (b.inv > 0) g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 80));
    g.translate(x, y);
    // gölge + dalga halkası
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(sc * 0.1, sc * 0.14, R, 0, Math.PI * 2); g.fill();
    if (b.sp > 0.5) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, sc * 0.05); g.beginPath(); g.arc(0, 0, R * (1.05 + 0.05 * Math.sin(now / 150)), 0, Math.PI * 2); g.stroke(); }
    // şamandıra halkası (takım renginde şeritli)
    g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = R * 0.26; g.strokeStyle = col; g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.setLineDash([R * 0.5, R * 0.5]); g.stroke(); g.setLineDash([]);
    g.lineWidth = Math.max(1, sc * 0.05); g.strokeStyle = 'rgba(15,23,42,.7)'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.66, 0, Math.PI * 2); g.stroke();
    // ahşap zemin
    g.fillStyle = WOOD; g.beginPath(); g.arc(0, 0, R * 0.64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = WOOD2; g.lineWidth = Math.max(1, sc * 0.03); for (let q = -2; q <= 2; q++) { g.beginPath(); g.moveTo(-R * 0.6, q * R * 0.24); g.lineTo(R * 0.6, q * R * 0.24); g.stroke(); }
    g.restore();
    // kenardaki avatarlar (gaz salan yön dışarıya bakar); gaz oku
    for (let k = 0; k < 2; k++) {
      const id = t.members[k], p = pById(id) || { look: null, color: '#888' }, st = b.seats[k];
      const wa = st.a - rot;                                     // ekran açısı
      const px = x + Math.cos(wa) * K.RAFT_R * 1.25 * sc * 0.92, py = y + Math.sin(wa) * K.RAFT_R * 1.25 * sc * 0.92;
      drawTopAvatar(g, p.look, p.color, px, py, sc * 0.29, wa, { gun: false, alpha: b.inv > 0 ? 0.6 : 1, spin: 0 });
      if (st.gas) { g.fillStyle = 'rgba(190,242,100,.55)'; g.beginPath(); g.arc(px + Math.cos(wa) * sc * 0.35, py + Math.sin(wa) * sc * 0.35, sc * (0.14 + Math.random() * 0.06), 0, Math.PI * 2); g.fill(); }
    }
    // isim etiketi
    const { DPR } = ctx.size();
    const mine = t.members.includes(playerId);
    const txt = mine ? 'SİZ' : names(t).join(' & ');
    g.save(); g.font = `800 ${Math.round(10 * DPR)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = mine ? '#fff' : col;
    g.strokeText(txt, x, y - sc * 1.15); g.fillText(txt, x, y - sc * 1.15);
    if (b.done !== null) { g.fillText('🏁', x, y - sc * 1.15 - 12 * DPR); }
    g.restore();
  }
  // gaz bulutu üret (her karede, gaz basan koltuk için): kenardan dışarı, rastgele yayılımla
  function emitGas(b, dt) {
    for (let k = 0; k < 2; k++) {
      const st = b.seats[k]; if (!st.gas) continue;
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = st.a + (Math.random() - 0.5) * 0.7, v = 1.4 + Math.random() * 1.5;
        parts.push({ x: b.x + Math.cos(st.a) * RIM, y: b.y + Math.sin(st.a) * RIM, vx: Math.cos(a) * v + b.sp * 0, vy: Math.sin(a) * v, life: 0, max: 0.55 + Math.random() * 0.45, c: i % 2 ? '#bef264' : '#a3e635', r: 0.08, grow: true });
      }
      if (R3) puff3D(b.x + Math.cos(st.a) * RIM, b.y + Math.sin(st.a) * RIM, st.a, 2, '#bef264');
    }
  }
  function drawParts(dt, toS) {
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      const [px, py] = toS(p.x, p.y);
      g.globalAlpha = Math.max(0, 1 - p.life / p.max); g.fillStyle = p.c;
      g.beginPath(); g.arc(px, py, p.r * sc * (p.grow ? 1 + p.life * 2.5 : 1), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  function followBoat(st) {
    const t = myTeam();
    const mine = t && st.boats.find((b) => b.id === t.id);
    return mine || standings(st)[0] || null;
  }

  function render2D(st, now, dt) {
    const { W, H, DPR } = ctx.size();
    g.fillStyle = GRASS; g.fillRect(0, 0, W, H);
    if (!c || !st) return overlay(st, W, H, DPR, now);
    const fb = followBoat(st);
    const s = fb ? fb.s : 6, tx = fb ? fb.x : K.frame(c, 6).x, ty = fb ? fb.y : K.frame(c, 6).y;
    const f = K.frame(c, Math.min(c.LEN, s + 2.5)), ta = Math.atan2(f.ty, f.tx);
    const k = cam.init ? 1 - Math.pow(0.003, dt) : 1;
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
    cam.a += K.angN(ta - cam.a) * (cam.init ? 1 - Math.pow(0.05, dt) : 1);
    cam.init = true;
    sc = (Math.min(W, H) / 10.5) * (1 - clamp((fb ? fb.sp : 0) / 6, 0, 1) * 0.18);
    const shake = shakeT > now ? (Math.random() - 0.5) * 6 * DPR : 0;
    const s0 = Math.max(0, s - 22), s1 = Math.min(c.LEN, s + 34);
    g.save(); worldXf(W, H, shake);
    // çimen dokusu
    g.fillStyle = GRASS2;
    for (const d of decor) if (d.s > s0 - 4 && d.s < s1 + 4 && d.kind === 'bush') { g.beginPath(); g.arc(d.x + 1.3, d.y - 0.7, d.r * 1.6, 0, Math.PI * 2); g.fill(); }
    drawRiver2D(st, s0, s1, now);
    drawDecor2D(s0, s1);
    g.restore();
    const toS = toScreen(W, H, shake);
    const list = st.boats.slice().sort((a, b) => (myTeam() && a.id === myTeam().id) - (myTeam() && b.id === myTeam().id));
    for (const b of list) if (Math.abs(b.s - s) < 30) { drawBoat2D(b, toS, now); emitGas(b, dt); }
    drawParts(dt, toS);
    drawMinimap(st, W, H, DPR, fb);
    return overlay(st, W, H, DPR, now);
  }

  // Sağ kenarda ilerleme çubuğu (takım renkleri)
  function drawMinimap(st, W, H, DPR, fb) {
    const x = W - 14 * DPR, y0 = 70 * DPR, h = Math.min(H * 0.42, 220 * DPR);
    g.save();
    g.fillStyle = 'rgba(8,12,28,.5)'; g.beginPath(); g.roundRect(x - 6 * DPR, y0 - 8 * DPR, 12 * DPR, h + 16 * DPR, 6 * DPR); g.fill();
    g.fillStyle = '#93c5fd'; g.fillRect(x - 1.5 * DPR, y0, 3 * DPR, h);
    g.fillStyle = '#fff'; g.font = `${Math.round(11 * DPR)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('🏁', x, y0 - 8 * DPR);
    for (const cp of c.cps) if (cp) { g.fillStyle = '#facc15'; g.fillRect(x - 4 * DPR, y0 + h * (1 - cp / c.FIN) - 1 * DPR, 8 * DPR, 2 * DPR); }
    for (const b of st.boats) {
      const k = clamp(b.s / c.FIN, 0, 1);
      g.fillStyle = teamColor(b.id); g.beginPath(); g.arc(x, y0 + h * (1 - k), (b === fb ? 6 : 4) * DPR, 0, Math.PI * 2); g.fill();
      if (b === fb) { g.strokeStyle = '#fff'; g.lineWidth = 2 * DPR; g.stroke(); }
    }
    g.restore();
  }

  // Ortak üst katman (2D ve 3D): sıralama, koltuk göstergesi, ritim, ipucu, geri sayım
  function drawStandings(st, DPR) {
    const order = standings(st), row = 20 * DPR, x = 8 * DPR;
    let y = 8 * DPR;
    const mt = myTeam();
    g.save(); g.textBaseline = 'middle';
    g.fillStyle = 'rgba(8,12,28,.5)'; g.beginPath(); g.roundRect(x - 4 * DPR, y - 4 * DPR, 104 * DPR, order.length * row + 8 * DPR, 8 * DPR); g.fill();
    order.forEach((b, i) => {
      const t = teamsG().find((q) => q.id === b.id); if (!t) return;
      const me = mt && mt.id === b.id, cy = y + row / 2;
      if (me) { g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(x - 2 * DPR, y, 100 * DPR, row, 5 * DPR); g.fill(); }
      g.font = `800 ${Math.round(10 * DPR)}px system-ui`; g.textAlign = 'right'; g.fillStyle = i === 0 ? '#fbbf24' : '#e5e7eb';
      g.fillText(String(i + 1), x + 9 * DPR, cy);
      g.fillStyle = teamColor(b.id); g.fillRect(x + 12 * DPR, y + 3 * DPR, 3 * DPR, row - 6 * DPR);
      t.members.forEach((id, k) => { const im = portraitImg(id); if (im) g.drawImage(im, x + (18 + k * 16) * DPR, cy - 7 * DPR, 14 * DPR, 14 * DPR); else { const p = pById(id); g.fillStyle = p ? p.color : '#888'; g.beginPath(); g.arc(x + (25 + k * 16) * DPR, cy, 6 * DPR, 0, Math.PI * 2); g.fill(); } });
      g.textAlign = 'right'; g.fillStyle = me ? '#fff' : '#cbd5e1'; g.font = `700 ${Math.round(9 * DPR)}px system-ui`;
      g.fillText(b.done !== null ? `🏁${b.done.toFixed(0)}s` : `${Math.round(clamp(b.s / c.FIN, 0, 1) * 100)}%`, x + 96 * DPR, cy);
      y += row;
    });
    g.restore();
    return y;
  }
  function pill(txt, x, y, DPR, bg, fg = '#fff', size = 13) {
    g.save(); g.font = `900 ${Math.round(size * DPR)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(txt).width + 18 * DPR, h = (size + 11) * DPR;
    g.fillStyle = bg; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
    g.fillStyle = fg; g.fillText(txt, x, y + 1 * DPR); g.restore();
  }
  function overlay(st, W, H, DPR, now) {
    if (!st || !c) return 'Bekleniyor…';
    const listBottom = drawStandings(st, DPR);
    const t = myTeam(), seat = mySeat();
    const b = t && st.boats.find((x) => x.id === t.id);
    if (st.phase === 'count' || st.phase === 'wait') {
      const n = st.phase === 'wait' ? '…' : String(Math.max(1, Math.ceil(st.cd)));
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${Math.round(90 * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff';
      g.strokeText(n, W / 2, H * 0.36); g.fillText(n, W / 2, H * 0.36); g.restore();
      if (b) { pill('🕹️ Çubukla kayığın kenarında yerini seç', W / 2, H * 0.5, DPR, teamColor(b.id), '#fff', 14); pill('💨 GAZ: karakterin tersine iter', W / 2, H * 0.5 + 34 * DPR, DPR, 'rgba(8,12,28,.7)', '#bef264', 13); }
      return st.phase === 'wait' ? '📡 Herkes bağlanıyor…' : '🛶 Hazır ol!';
    }
    if (b) {
      pill(`${seat === 0 ? '1.' : '2.'} oyuncu · takım arkadaşın ${names(t).filter((_, k) => k !== seat).join('')}`, W / 2, 20 * DPR, DPR, teamColor(b.id), '#fff', 11);
      // sıra
      const total = st.boats.length, place = placeOf(st, b.id);
      g.save(); g.font = `900 ${Math.round(24 * DPR)}px system-ui`; g.textAlign = 'left'; g.textBaseline = 'top';
      g.lineWidth = 5 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = place === 1 ? '#fbbf24' : '#93c5fd';
      const pt = `${place}./${total}`; g.strokeText(pt, 10 * DPR, listBottom + 8 * DPR); g.fillText(pt, 10 * DPR, listBottom + 8 * DPR);
      // gaz depoları: benimki büyük, arkadaşımınki küçük
      const yy = listBottom + 40 * DPR;
      g.font = `800 ${Math.round(10 * DPR)}px system-ui`; g.lineWidth = 3 * DPR; g.fillStyle = '#fff';
      g.strokeText('GAZ', 10 * DPR, yy); g.fillText('GAZ', 10 * DPR, yy);
      for (let k = 0; k < 2; k++) {
        const stt = b.seats[k], me = k === seat, y2 = yy + 14 * DPR + k * 11 * DPR, w = (me ? 84 : 84) * DPR;
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(10 * DPR, y2, w, (me ? 8 : 6) * DPR);
        g.fillStyle = stt.tank < 0.25 ? '#f87171' : me ? '#a3e635' : '#86efac'; g.fillRect(10 * DPR, y2, w * clamp(stt.tank, 0, 1), (me ? 8 : 6) * DPR);
      }
      g.restore();
      updateGasButton(b.seats[seat]);
    }
    if (st.phase === 'race' && performance.now() - goAt < 1300) return '🟢 GAZ!';
    if (b && b.dead > 0) return '💥 Patladınız! Son kontrol noktasında yeniden doğuyorsunuz';
    if (b && b.done !== null) return `🏁 Şelaleye vardınız! ${placeOf(st, b.id)}. sıra · ${b.done.toFixed(1)} sn`;
    if (!b) return '👀 İzliyorsun';
    return '';
  }
  // 💨 GAZ düğmesi: depo yüzdesini üstünde göster
  const ctlBtn = (id) => (ctx.stage.parentNode || ctx.stage).querySelector(`.ctl [data-b="${id}"]`);
  let lastGasUI = '';
  function updateGasButton(stt) {
    const el = ctlBtn('push');
    if (!el || !stt) return;
    const txt = stt.lock ? '⏳' : `${Math.round(clamp(stt.tank, 0, 1) * 100)}%`;
    const key = txt + (stt.gas ? 'g' : '');
    if (key === lastGasUI) return;
    lastGasUI = key; el.innerHTML = `<span class="kk-ic">💨</span><small>GAZ ${txt}</small>`; el.classList.toggle('kk-cd', !!stt.lock);
  }

  async function ensure3D() {
    if (R3 || loading) return;
    loading = true;
    try { T = await loadThree(); R3 = build3D(); if (c) buildRiver3D(); } catch (e) { console.error(e); ctx.toast('3D görünüm yüklenemedi'); ctx.setView('top'); }
    loading = false;
  }
  function canvasTex(draw, w = 128, h = 128) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#a7d8ff');
    scene.fog = new THREE.Fog('#c6e6ff', 14, 46);
    const cam3 = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
    scene.add(new THREE.HemisphereLight('#ffffff', '#4b6b3a', 1.4));
    const sun = new THREE.DirectionalLight('#fff3d0', 1.6); sun.position.set(-6, 12, 4); scene.add(sun);
    scene.add(cam3);
    // gaz bulutu parçacıkları (havuz)
    const puffs = [];
    const puffGeo = new THREE.SphereGeometry(0.18, 8, 6);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#bef264', transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); puffs.push({ m, life: 1, max: 1, vx: 0, vy: 0, vz: 0 }); }
    return { renderer, scene, cam: cam3, w: 0, h: 0, river: null, boats: new Map(), dyn: [], puffs, camPos: null, camYaw: null, waterTex: null, foamTex: null, fallTex: null };
  }
  // Nehir şeridi + kıyılar + süsler + engeller
  function buildRiver3D() {
    const THREE = T, { scene } = R3;
    if (R3.river) { scene.remove(R3.river); R3.river.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    for (const bm of R3.boats.values()) scene.remove(bm.grp);
    R3.boats.clear();
    const root = new THREE.Group(); R3.river = root;
    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
    // su dokusu (kayan dalgacıklar)
    R3.waterTex = canvasTex((x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(30,90,150,.35)'; x.lineWidth = 3; for (let i = 0; i < 26; i++) { const px = (i * 53) % w, py = (i * 37) % h; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 10, py - 5, px + 22, py); x.stroke(); } x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2; for (let i = 0; i < 14; i++) { const px = (i * 71) % w, py = (i * 29 + 11) % h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 8, py); x.stroke(); } });
    R3.waterTex.repeat.set(2, 1);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < c.n; i++) {
      const s = i * K.DS, f = K.frame(c, s), hw = K.widthAt(c, s) + 0.2;
      pos.push(f.x + f.nx * hw, 0, f.y + f.ny * hw, f.x - f.nx * hw, 0, f.y - f.ny * hw);
      uv.push(0, s / 4, 1, s / 4);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    root.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: WATER, map: R3.waterTex, side: THREE.DoubleSide })));
    // kıyılar: su kenarından dışa doğru kum → çimen; dar boğazda kayalık yükselti
    const narrowK = (s) => { let k = 0; for (const nw of c.narrows) { const dd = s < nw.s0 ? nw.s0 - s : s > nw.s1 ? s - nw.s1 : 0; k = Math.max(k, 1 - clamp(dd / 3, 0, 1)); } return k; };
    const bp = [], bc = [], bi = [];
    const C = (hex) => { const q = new THREE.Color(hex); return [q.r, q.g, q.b]; };
    const sand = C(SAND), grass = C(GRASS), grass2 = C(GRASS2), cliff = C(ROCK2);
    const prof = [[0.05, -0.2], [0.2, 0.3], [1.2, 0.35], [2.2, 0.45], [9, 0.6], [22, 1.6]];
    for (const sd of [1, -1]) {
      const base = bp.length / 3;
      for (let i = 0; i < c.n; i++) {
        const s = i * K.DS, f = K.frame(c, s), hw = K.widthAt(c, s), nk = narrowK(s);
        prof.forEach(([o, h], j) => {
          const hh = h + (j >= 1 && j <= 3 ? nk * 1.3 : 0);
          bp.push(f.x + f.nx * sd * (hw + o), hh, f.y + f.ny * sd * (hw + o));
          const col = j <= 1 ? (nk > 0.3 ? cliff : sand) : j === 2 ? (nk > 0.3 ? cliff : sand) : (i + j) % 2 ? grass : grass2;
          bc.push(...col);
        });
        if (i) for (let j = 0; j < prof.length - 1; j++) {
          const a = base + (i - 1) * prof.length + j, b2 = base + i * prof.length + j;
          bi.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        }
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); bg.setIndex(bi); bg.computeVertexNormals();
    root.add(new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // başlangıç arkası duvarı
    { const f = K.frame(c, 0); const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, K.widthAt(c, 0) * 2 + 2), mat(ROCK2)); wall.position.set(f.x - f.tx * 0.6, 0.3, f.y - f.ty * 0.6); wall.rotation.y = -Math.atan2(f.ty, f.tx); root.add(wall); }
    // ağaçlar / çalılar / taşlar
    const trees = decor.filter((d) => d.kind === 'tree'), others = decor.filter((d) => d.kind !== 'tree');
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6), mat('#6b4423'), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.0, 7), mat('#2f7d3a', { flatShading: true }), trees.length);
    trees.forEach((d, i) => {
      m4.makeTranslation(d.x, 0.95, d.y); trunk.setMatrixAt(i, m4);
      m4.compose(v1.set(d.x, 1.3 + d.r * 1.1, d.y), q, v2.set(d.r, d.r * (0.9 + d.tone * 0.5), d.r)); crown.setMatrixAt(i, m4);
    });
    const bush = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), mat('#5b9a3e', { flatShading: true }), others.length);
    others.forEach((d, i) => { m4.compose(v1.set(d.x, 0.55, d.y), q, v2.set(d.r, d.r * 0.7, d.r)); bush.setMatrixAt(i, m4); });
    root.add(trunk, crown, bush);
    // kayalar
    const rockMat = mat(ROCK, { flatShading: true });
    for (const rk of c.rocks) { const p = K.world(c, rk.s, rk.d); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r, 0), rockMat); m.position.set(p.x, 0.1, p.y); m.scale.y = 0.75; m.rotation.y = rk.s; root.add(m); }
    // akıntı köpüğü
    R3.foamTex = canvasTex((x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5; for (let i = 0; i < 9; i++) { const yy = (i / 9) * h; x.beginPath(); x.moveTo(10 + (i % 3) * 30, yy + 12); x.lineTo(30 + (i % 3) * 30, yy); x.lineTo(50 + (i % 3) * 30, yy + 12); x.stroke(); } });
    for (const rp of c.rapids) {
      const pp = [], uu = [], ii = [];
      let k = 0;
      for (let s = rp.s0; s <= rp.s1 + 1e-6; s += K.DS, k++) { const f = K.frame(c, s), hw = K.widthAt(c, s) - 0.1; pp.push(f.x + f.nx * hw, 0.02, f.y + f.ny * hw, f.x - f.nx * hw, 0.02, f.y - f.ny * hw); uu.push(0, s / 3, 1, s / 3); if (k) { const a = (k - 1) * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2)); gg.setIndex(ii);
      root.add(new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: R3.foamTex, transparent: true, depthWrite: false })));
    }
    // dinamik: kütükler, girdaplar
    const dyn = [];
    for (const lg of c.logs) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(lg.r, lg.r, lg.half * 2, 10), mat(WOOD));
      const capM = mat('#c89a62');
      for (const sg of [1, -1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(lg.r * 0.95, 10), capM); cap.position.y = sg * lg.half + sg * 0.001; cap.rotation.x = -sg * Math.PI / 2; m.add(cap); }
      const grp = new THREE.Group(); grp.add(m); m.rotation.x = Math.PI / 2; root.add(grp);
      dyn.push({ k: 'log', o: lg, grp, m });
    }
    const swirl = canvasTex((x, w, h) => { x.clearRect(0, 0, w, h); x.translate(w / 2, h / 2); for (let k = 0; k < 3; k++) { x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 4; x.beginPath(); for (let q = 0; q <= 40; q++) { const u = q / 40, r = (0.1 + u * 0.85) * w / 2, a = u * 5 + k * 2.094; q ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke(); } const gr = x.createRadialGradient(0, 0, 0, 0, 0, w / 2); gr.addColorStop(0, 'rgba(8,40,70,.8)'); gr.addColorStop(1, 'rgba(8,40,70,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, w / 2, 0, Math.PI * 2); x.fill(); }, 256, 256);
    for (const wh of c.whirls) {
      const p = K.world(c, wh.s, wh.d);
      const m = new THREE.Mesh(new THREE.CircleGeometry(wh.r, 32), new THREE.MeshBasicMaterial({ map: swirl, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.03, p.y); root.add(m);
      dyn.push({ k: 'whirl', o: wh, m });
    }
    // kontrol şamandıraları
    const buoyM = mat('#facc15'), buoyR = mat('#ef4444');
    for (const cp of c.cps) if (cp) for (const sd of [-1, 1]) {
      const p = K.world(c, cp, sd * (K.widthAt(c, cp) - 0.25));
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), buoyM); b1.position.set(p.x, 0.1, p.y); root.add(b1);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), buoyR); b2.position.set(p.x, 0.5, p.y); root.add(b2);
    }
    // bitiş kapısı
    {
      const f = K.frame(c, c.FIN), hw = K.widthAt(c, c.FIN) + 0.4, ang = -Math.atan2(f.ty, f.tx);
      for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat('#e5e7eb')); post.position.set(f.x + f.nx * sd * hw, 1.4, f.y + f.ny * sd * hw); root.add(post); }
      const chk = canvasTex((x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * w / 16, j * h / 2, w / 16, h / 2); } }, 256, 32);
      chk.wrapS = chk.wrapT = THREE.ClampToEdgeWrapping;
      // kutu: yerel x = akış yönü (damalı yüzler ±x), yerel z = nehir genişliği
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, hw * 2), [mat('#fff', { map: chk }), mat('#fff', { map: chk }), mat('#111'), mat('#111'), mat('#111'), mat('#111')]);
      banner.position.set(f.x, 2.7, f.y); banner.rotation.y = ang; root.add(banner);
    }
    // şelale: nehrin sonunda aşağı akan perde + sis
    {
      const f = K.frame(c, c.LEN), hw = K.widthAt(c, c.LEN) + 0.4;
      R3.fallTex = canvasTex((x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e0f2fe'); gr.addColorStop(1, '#60a5fa'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; for (let i = 0; i < 20; i++) { const px = (i * 41) % w; x.beginPath(); x.moveTo(px, (i * 23) % h); x.lineTo(px, (i * 23) % h + 30); x.stroke(); } });
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 8), new THREE.MeshBasicMaterial({ map: R3.fallTex, side: THREE.DoubleSide }));
      fall.position.set(f.x, -4, f.y); fall.rotation.y = -Math.atan2(f.ty, f.tx) + Math.PI / 2; root.add(fall);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(30, 24), mat('#1e5a8a')); lake.rotation.x = -Math.PI / 2; lake.position.set(f.x + f.tx * 30, -8, f.y + f.ty * 30); root.add(lake);
      const mist = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
      mist.scale.set(hw * 1.2, 1.4, 2); mist.position.set(f.x + f.tx * 1.2, 0.3, f.y + f.ty * 1.2); root.add(mist);
    }
    scene.add(root);
    R3.dyn = dyn;
    R3.camPos = null;
  }
  // Kayık modeli: yuvarlak şamandıra; iki avatar dış kenarında durur (konumları her karede durumdan gelir)
  function boat3(b) {
    let bm = R3.boats.get(b.id);
    if (bm) return bm;
    const THREE = T, t = teamsG().find((x) => x.id === b.id);
    const grp = new THREE.Group(), col = teamColor(b.id);
    const R = K.RAFT_R * 1.25;
    const tube = new THREE.Mesh(new THREE.TorusGeometry(R * 0.82, R * 0.2, 10, 28), new THREE.MeshLambertMaterial({ color: '#f8fafc' })); tube.rotation.x = Math.PI / 2; tube.position.y = 0.06; grp.add(tube);
    for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2; const band = new THREE.Mesh(new THREE.BoxGeometry(R * 0.34, R * 0.3, R * 0.42), new THREE.MeshLambertMaterial({ color: col })); band.position.set(Math.cos(a) * R * 0.82, 0.07, Math.sin(a) * R * 0.82); band.rotation.y = -a; grp.add(band); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, 0.08, 24), new THREE.MeshLambertMaterial({ color: WOOD })); deck.position.y = -0.02; grp.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5), new THREE.MeshLambertMaterial({ color: '#e5e7eb' })); mast.position.set(0, 0.35, 0); grp.add(mast);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), new THREE.MeshLambertMaterial({ color: col })); flag.position.set(0.16, 0.55, 0); grp.add(flag);
    const seats = [0, 1].map((k) => {
      const id = t ? t.members[k] : null, p = id && pById(id);
      const av = buildAvatar(THREE, p && p.look, p ? p.color : '#888', { gun: false });
      av.root.scale.setScalar(0.5);
      grp.add(av.root);
      return { av };
    });
    const label = makeLabel(THREE, t ? (t.members.includes(playerId) ? 'SİZ' : names(t).join(' & ')) : '?', col);
    label.position.y = 1.15; label.scale.set(1.1, 0.27, 1); grp.add(label);
    R3.scene.add(grp);
    bm = { grp, seats, label };
    R3.boats.set(b.id, bm);
    return bm;
  }
  function render3D(st, now, dt, view) {
    const sz = ctx.size3();
    if (sz.w !== R3.w || sz.h !== R3.h) { R3.renderer.setSize(sz.w, sz.h, false); R3.cam.aspect = sz.w / sz.h; R3.cam.updateProjectionMatrix(); R3.w = sz.w; R3.h = sz.h; }
    const { W, H, DPR } = ctx.size();
    g.clearRect(0, 0, W, H);
    if (!st || !c) { R3.renderer.render(R3.scene, R3.cam); return overlay(st, W, H, DPR, now); }
    if (!R3.river) buildRiver3D();
    const el = st.el, ts = now / 1000;
    R3.waterTex.offset.y = -(el * K.CURRENT / 4) % 1;
    if (R3.foamTex) R3.foamTex.offset.y = -(el * 0.9) % 1;
    if (R3.fallTex) R3.fallTex.offset.y = (ts * 0.8) % 1;
    for (const d of R3.dyn) {
      if (d.k === 'log') { const f = K.frame(c, d.o.s), ld = K.logD(d.o, el); d.grp.position.set(f.x + f.nx * ld, 0.08 + Math.sin(ts * 2 + d.o.s) * 0.03, f.y + f.ny * ld); d.grp.rotation.y = -Math.atan2(f.ny, f.nx) + Math.PI / 2; d.m.rotation.y = ld * 1.5; }
      else if (d.k === 'whirl') d.m.rotation.z = -d.o.spin * el * 2.2;
    }
    const t = myTeam(), seat = mySeat();
    const fb = followBoat(st);
    for (const b of st.boats) {
      const bm = boat3(b);
      bm.grp.position.set(b.x, Math.sin(ts * 2.2 + b.id) * 0.03, b.y);
      bm.grp.rotation.set(Math.sin(ts * 1.7 + b.id) * 0.03, 0, Math.sin(ts * 1.3) * 0.02);
      bm.grp.visible = !(b.dead > 0) && !(b.inv > 0 && Math.floor(now / 90) % 2 === 0);
      bm.label.visible = !(t && t.id === b.id);
      for (let k = 0; k < 2; k++) {
        const s3 = bm.seats[k], ss = b.seats[k];
        animateAvatar(s3.av, ts, { walk: 0, idle: b.done !== null });
        s3.av.root.position.set(Math.cos(ss.a) * RIM, 0.0, Math.sin(ss.a) * RIM);
        s3.av.root.rotation.y = -ss.a;                          // dışarıya bakar (gaz yönü)
        if (!s3.av.emote && b.done === null) for (const arm of s3.av.arms) { arm.rotation.z = ss.gas ? 1.5 : 0.2; arm.rotation.x = 0; }
        s3.av.root.visible = true;
      }
      emitGas(b, dt);
    }
    // gaz bulutları
    for (const p of R3.puffs) {
      if (!p.m.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.m.visible = false; continue; }
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(1 + p.life * 3); p.m.material.opacity = 0.75 * (1 - p.life / p.max);
    }
    const cam = R3.cam;
    if (fb) {
      const f = K.frame(c, Math.min(c.LEN, fb.s + 2));
      const riverYaw = Math.atan2(f.ty, f.tx);
      // takip kamerası: nehir yönü + biraz kayık yönü (kayık fırıl dönerken kamera savrulmaz)
      const want = riverYaw + K.angN(fb.h - riverYaw) * 0.35;
      if (R3.camYaw === null) R3.camYaw = want;
      R3.camYaw += K.angN(want - R3.camYaw) * (1 - Math.pow(0.05, dt));
      let px, py, pz, lx, ly, lz;
      if (false) {
        px = py = pz = lx = ly = lz = 0;
      } else {
        const fx = Math.cos(R3.camYaw), fy = Math.sin(R3.camYaw);
        px = fb.x - fx * 3.4; py = 2.3; pz = fb.y - fy * 3.4; lx = fb.x + fx * 2.5; ly = 0.2; lz = fb.y + fy * 2.5;
      }
      const k = view === 'fps' || !R3.camPos ? 1 : 1 - Math.pow(0.004, dt);
      R3.camPos = R3.camPos || { x: px, y: py, z: pz };
      R3.camPos.x = lerp(R3.camPos.x, px, k); R3.camPos.y = lerp(R3.camPos.y, py, k); R3.camPos.z = lerp(R3.camPos.z, pz, k);
      cam.position.set(R3.camPos.x, R3.camPos.y, R3.camPos.z);
      if (shakeT > now) { cam.position.x += (Math.random() - 0.5) * 0.08; cam.position.y += (Math.random() - 0.5) * 0.05; }
      cam.lookAt(lx, ly, lz);
    }
    R3.renderer.render(R3.scene, cam);
    drawMinimap(st, W, H, DPR, fb);
    return overlay(st, W, H, DPR, now);
  }
  function puff3D(x, y, a0, n, color) {
    if (!R3) return;
    let k = 0;
    for (const p of R3.puffs) {
      if (p.m.visible) continue;
      if (k++ >= n) break;
      const a = a0 + (Math.random() - 0.5) * 0.9, v = 1.3 * (0.5 + Math.random());
      p.m.visible = true; p.life = 0; p.max = 0.6 + Math.random() * 0.5;
      p.m.material.color.set(color);
      p.m.position.set(x, 0.3, y);
      p.vx = Math.cos(a) * v; p.vz = Math.sin(a) * v; p.vy = 0.3 + Math.random() * 0.5;
    }
  }

  // çubuk (ekran/kamera yönü) → dünya yönü; 2D'de kamera nehir yönüne döner, 3D takipte kamera yönüne göre
  const stickWorld = (x, y, view) => {
    const L = Math.hypot(x, y);
    if (L < 0.25) return { x: 0, y: 0 };
    if (view !== 'top' && R3 && R3.camYaw !== null) { const fx = Math.cos(R3.camYaw), fy = Math.sin(R3.camYaw); return { x: x * -fy + -y * fx, y: x * fx + -y * fy }; }
    const phi = cam.a + Math.PI / 2;
    return { x: x * Math.cos(phi) - y * Math.sin(phi), y: x * Math.sin(phi) + y * Math.cos(phi) };
  };
  const spec = {
    kind: 'kayik', mod: K, views: ['top', 'chase'],
    controls: { left: 'stick', below: true, buttons: [{ id: 'push', label: '<span class="kk-ic">💨</span><small>GAZ</small>', cls: 'kk-push' }] },
    input: (cc, view) => { const w = stickWorld(cc.x, cc.y, view); return { push: !!cc.btn.push, x: w.x, y: w.y }; },
    setBot: (sim, id) => { for (const b of sim.boats) b.members.forEach((m, k) => { if (m === id) b.bots[k] = true; }); },
    onState(s) { if (s.g && s.g.seed != null) setCourse(s.g.seed); },
    interp(a, b, k) {
      return {
        ...b, el: lerp(a.el, b.el, k), t: lerp(a.t, b.t, k),
        boats: b.boats.map((bb) => {
          const ba = a.boats.find((x) => x.id === bb.id) || bb;
          if (Math.hypot(bb.x - ba.x, bb.y - ba.y) > 3) return bb; // yeniden doğuş: atla
          return { ...bb, x: lerp(ba.x, bb.x, k), y: lerp(ba.y, bb.y, k), h: ba.h + K.angN(bb.h - ba.h) * k, s: lerp(ba.s, bb.s, k), seats: bb.seats.map((sb, q) => ({ ...sb, a: ba.seats[q].a + K.angN(sb.a - ba.seats[q].a) * k, tank: lerp(ba.seats[q].tank, sb.tank, k) })) };
        }),
      };
    },
    onEvents(evs, st) {
      const t = myTeam();
      for (const e of evs) {
        const mine = t && e.team === t.id;
        const b = st && st.boats && st.boats.find((x) => x.id === e.team);
        if (e.e === 'beep') sfx('tick');
        if (e.e === 'go') { sfx('finish'); goAt = performance.now(); }
        if (e.e === 'bump') {
          sfx(mine ? 'crash' : 'bump');
          if (mine) { shakeT = performance.now() + 250; if (navigator.vibrate) navigator.vibrate(60); }
          for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 2; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5, c: '#e0f2fe', r: 0.08 }); }
          if (mine && R3 && R3.boats.get(e.team) && (e.k || 0) >= 2) for (const s3 of R3.boats.get(e.team).seats) startEmote(s3.av, 'surprise', performance.now() / 1000);
        }
        if (e.e === 'boom') {
          sfx('boom'); if (mine) { shakeT = performance.now() + 500; if (navigator.vibrate) navigator.vibrate([80, 40, 120]); }
          for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 4; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.6, c: ['#f97316', '#fde047', '#ef4444', '#475569'][i % 4], r: 0.12, grow: true }); }
          if (R3) puff3D(e.x, e.y, 0, 6, '#f97316');
        }
        if (e.e === 'cp' && mine) sfx('score');
        if (e.e === 'respawn') { if (mine) sfx('pop'); for (let i = 0; i < 8; i++) parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0, max: 0.5, c: '#93c5fd', r: 0.08 }); }
        if (e.e === 'finish') {
          sfx(mine ? 'fanfare' : 'pop');
          if (R3 && R3.boats.get(e.team)) for (const s3 of R3.boats.get(e.team).seats) startEmote(s3.av, mine || Math.random() < 0.5 ? 'cheer' : 'dance', performance.now() / 1000);
          for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 3; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.9, c: ['#facc15', '#f472b6', '#60a5fa', '#4ade80'][i % 4], r: 0.07 }); }
        }
      }
    },
    render(st, now, dt, view) {
      if (st && st.seed != null) setCourse(st.seed);
      if (view !== 'top') { if (!R3) { ensure3D(); return render2D(st, now, dt); } return render3D(st, now, dt, view); }
      return render2D(st, now, dt);
    },
    ready3D: () => !!R3,
    panel(st) {
      if (!st || !c) return '<div class="status"><small>Kayıklar suya iniyor…</small></div>';
      const face = (id) => { const p = pById(id) || { look: null, color: '#888' }; return `<img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">`; };
      const rows = standings(st).map((b, i) => {
        const t = teamsG().find((x) => x.id === b.id); if (!t) return '';
        const pct = Math.round(clamp(b.s / c.FIN, 0, 1) * 100);
        return `<span class="chip${t.members.includes(playerId) ? ' cur' : ''}" style="border-color:${teamColor(b.id)}"><span class="n">${i + 1}</span>${face(t.members[0])}${face(t.members[1])} ${esc(names(t).join(' & '))} ${b.done !== null ? `🏁 ${b.done.toFixed(1)}s` : `${pct}%`}</span>`;
      });
      return `<div class="race-board">${rows.join('')}</div>`;
    },
    hud(st) {
      const t = myTeam();
      if (!t) return '👀 İzleyici';
      const b = st && st.boats.find((x) => x.id === t.id), seat = mySeat();
      return `🛶 <b>${SEAT_NAME[seat]}</b>${b ? ` · Sıra <b>${placeOf(st, b.id)}/${st.boats.length}</b> · 💨 <b>%${Math.round(clamp(b.seats[seat].tank, 0, 1) * 100)}</b>` : ''}`;
    },
    dispose() { if (R3) { R3.renderer.dispose(); R3 = null; } },
  };
  return createRealtime(ctx, spec);
}
