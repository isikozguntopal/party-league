// 🏎️ Pist Canavarı istemcisi: 2D (yöne dönen takip kamerası) + 3D takip + FPS (kokpit)
// Pist her yarışta tohumdan üretilir (Y.buildTrack); boşluk üzerinde yüzen bir şerit, bir köprüyle kendi
// üzerinden geçer. Pistin dışı uçurumdur.
import * as Y from '../games/yaris.js';
import { lerp, clamp, sfx, esc } from './util.js';
import { portraitURL } from './avatar2d.js';
import { lookColors } from '../games/avatar.js';
import { createRealtime } from './rt.js';
import { loadThree, makeLabel } from './avatar3d.js';

const SEA = '#17406b', SEA2 = '#123457';
const ROCK = '#6b5a4a', ROCK2 = '#4e4136';
const RAIL_W = Y.HALF_W + Y.CURB + 0.12;

// Pist çevresi süsleri: adalar (boşlukta), tribün yeri — tohumdan, her cihazda aynı
function makeDecor(track) {
  const R = Y.rng(track.seed + 77);
  const { x0, y0, x1, y1 } = track.bounds;
  const islands = [];
  for (let i = 0; i < 400 && islands.length < 14; i++) {
    const x = x0 - 2 + R() * (x1 - x0 + 4), y = y0 - 2 + R() * (y1 - y0 + 4), r = 1.1 + R() * 1.4;
    if (track.nearest(x, y).dist < Y.HALF_W + Y.CURB + r + 2.2) continue;
    if (islands.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 1.5)) continue;
    const trees = [];
    const nt = 2 + Math.floor(R() * 4);
    for (let k = 0; k < nt; k++) { const a = R() * Math.PI * 2, d = R() * r * 0.55; trees.push([x + Math.cos(a) * d, y + Math.sin(a) * d, 0.4 + R() * 0.45]); }
    islands.push({ x, y, r, trees });
  }
  // tribün: başlangıç düzlüğünün solunda, boş yer varsa
  const p = track.pointAt(4);
  const side = -1, nx = -Math.sin(p.a) * side, ny = Math.cos(p.a) * side;
  const sx = p.x + nx * (Y.HALF_W + Y.CURB + 2.2), sy = p.y + ny * (Y.HALF_W + Y.CURB + 2.2);
  const stand = track.nearest(sx, sy).dist > Y.HALF_W + Y.CURB + 1.6 ? { x: sx, y: sy, a: p.a } : null;
  return { islands, stand };
}

export function createYaris(ctx) {
  const { pById, playerId } = ctx;
  const g = ctx.g2d;
  let track = null, decor = null, world = null, deck = null, tiles = null, WB = null, K = 22;
  const cam = { x: 5, y: 20, a: -Math.PI / 2, z: 1, init: false };
  let parts = [];
  let shakeT = 0;
  let R3 = null, T = null, loading = false;
  const portraits = new Map();

  const carColor = (p) => (p && p.look ? lookColors(p.look).shirt : '#3b82f6');
  const portraitImg = (p) => {
    let im = portraits.get(p.id);
    if (!im) { im = new Image(); im.src = portraitURL(p.look, p.color, 20); portraits.set(p.id, im); }
    return im.complete && im.naturalWidth ? im : null;
  };

  // Pist değişince (yeni tohum) tüm türetilmiş veriler yeniden kurulur
  function setTrack(seed) {
    if (seed == null || (track && track.seed === (seed >>> 0))) return;
    track = Y.buildTrack(seed);
    decor = makeDecor(track);
    const b = track.bounds;
    WB = { x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3 };
    K = Math.min(22, 1500 / Math.max(WB.x1 - WB.x0, WB.y1 - WB.y0));
    world = null; deck = null; tiles = null;
    cam.init = false;
    if (R3) build3DTrack();
  }

  // ---------- 2D dünya görüntüsü ----------
  // Orta çizginin [sa, sb] aralığını yol olarak çizer (kalınlık, renk)
  function strokeRange(t, P, sa, sb, width, color, dash) {
    t.beginPath();
    let first = true;
    for (let s = sa; s <= sb + 1e-6; s += 0.25) { const p = track.pointAt(s); const [px, py] = P(p.x, p.y); first ? t.moveTo(px, py) : t.lineTo(px, py); first = false; }
    t.strokeStyle = color; t.lineWidth = width * K; if (dash) t.setLineDash(dash); t.stroke(); if (dash) t.setLineDash([]);
  }
  function roadStyle(t, P, sa, sb, closed) {
    const path = () => { if (closed) { t.beginPath(); track.pts.forEach((p, i) => (i ? t.lineTo(...P(p[0], p[1])) : t.moveTo(...P(p[0], p[1])))); t.closePath(); } else { t.beginPath(); let f = true; for (let s = sa; s <= sb + 1e-6; s += 0.25) { const p = track.pointAt(s); const [px, py] = P(p.x, p.y); f ? t.moveTo(px, py) : t.lineTo(px, py); f = false; } } };
    t.lineJoin = 'round'; t.lineCap = closed ? 'round' : 'butt';
    // uçurum: kaya yüzü (aşağı kaydırılmış), bordür (kırmızı-beyaz), asfalt
    t.save(); t.translate(0, 0.42 * K); path(); t.strokeStyle = ROCK2; t.lineWidth = (Y.HALF_W + Y.CURB) * 2 * K; t.stroke(); t.restore();
    t.save(); t.translate(0, 0.2 * K); path(); t.strokeStyle = ROCK; t.lineWidth = (Y.HALF_W + Y.CURB) * 2 * K; t.stroke(); t.restore();
    path(); t.strokeStyle = '#f2f2f2'; t.lineWidth = (Y.HALF_W + Y.CURB) * 2 * K; t.stroke();
    path(); t.strokeStyle = '#e03131'; t.setLineDash([K * 0.7, K * 0.7]); t.stroke(); t.setLineDash([]);
    path(); t.strokeStyle = '#3d424d'; t.lineWidth = Y.HALF_W * 2 * K; t.stroke();
  }
  function roadLines(t, P, sa, sb) {
    for (const side of [-1, 1]) {
      t.beginPath();
      for (let s = sa; s <= sb + 1e-6; s += 0.4) { const o = track.offset(s, side * (Y.HALF_W - 0.15)); const [px, py] = P(o.x, o.y); s === sa ? t.moveTo(px, py) : t.lineTo(px, py); }
      t.strokeStyle = 'rgba(255,255,255,.8)'; t.lineWidth = K * 0.09; t.stroke();
    }
    strokeRange(t, P, sa, sb, 0.1, 'rgba(255,255,255,.22)', [K * 1.1, K * 1.1]);
  }
  function railings(t, P, sa, sb) {
    for (const side of [-1, 1]) {
      t.beginPath();
      for (let s = sa; s <= sb + 1e-6; s += 0.3) { const o = track.offset(s, side * RAIL_W); const [px, py] = P(o.x, o.y); s === sa ? t.moveTo(px, py) : t.lineTo(px, py); }
      t.strokeStyle = '#e5e7eb'; t.lineWidth = K * 0.14; t.stroke();
      for (let s = sa; s <= sb + 1e-6; s += 1.2) { const o = track.offset(s, side * RAIL_W); const [px, py] = P(o.x, o.y); t.fillStyle = '#9ca3af'; t.beginPath(); t.arc(px, py, K * 0.12, 0, Math.PI * 2); t.fill(); }
    }
  }
  function buildWorld() {
    const { x0, y0, x1, y1 } = WB;
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * K); c.height = Math.ceil((y1 - y0) * K);
    const t = c.getContext('2d');
    const P = (x, y) => [(x - x0) * K, (y - y0) * K];
    const R = Y.rng(track.seed + 3);
    // deniz / boşluk
    const grad = t.createLinearGradient(0, 0, 0, c.height); grad.addColorStop(0, SEA); grad.addColorStop(1, SEA2);
    t.fillStyle = grad; t.fillRect(0, 0, c.width, c.height);
    t.strokeStyle = 'rgba(255,255,255,.07)'; t.lineWidth = 1.5;
    for (let i = 0; i < 700; i++) { const x = R() * c.width, y = R() * c.height, w = K * (0.6 + R() * 1.2); t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + w / 2, y - K * 0.15, x + w, y); t.stroke(); }
    // adalar
    for (const is of decor.islands) {
      const [px, py] = P(is.x, is.y);
      t.fillStyle = 'rgba(0,0,0,.25)'; t.beginPath(); t.arc(px + K * 0.2, py + K * 0.35, is.r * K, 0, Math.PI * 2); t.fill();
      t.fillStyle = '#c9b48a'; t.beginPath(); t.arc(px, py, is.r * K, 0, Math.PI * 2); t.fill();
      t.fillStyle = '#3f8f3a'; t.beginPath(); t.arc(px, py, is.r * K * 0.78, 0, Math.PI * 2); t.fill();
      for (const [tx, ty, s] of is.trees) {
        const [qx, qy] = P(tx, ty);
        t.fillStyle = 'rgba(0,0,0,.28)'; t.beginPath(); t.arc(qx + K * 0.2, qy + K * 0.25, K * s, 0, Math.PI * 2); t.fill();
        t.fillStyle = '#1f5a2a'; t.beginPath(); t.arc(qx, qy, K * s, 0, Math.PI * 2); t.fill();
        t.fillStyle = '#2e7d3a'; t.beginPath(); t.arc(qx - K * s * 0.25, qy - K * s * 0.25, K * s * 0.62, 0, Math.PI * 2); t.fill();
      }
    }
    // pistin gölgesi (boşluk üstünde yüzer)
    t.save(); t.translate(0.6 * K, 1.1 * K); t.beginPath(); track.pts.forEach((p, i) => (i ? t.lineTo(...P(p[0], p[1])) : t.moveTo(...P(p[0], p[1])))); t.closePath();
    t.lineJoin = 'round'; t.strokeStyle = 'rgba(0,0,0,.3)'; t.lineWidth = (Y.HALF_W + Y.CURB) * 2 * K; t.stroke(); t.restore();
    roadStyle(t, P, 0, 0, true);
    // asfalt dokusu
    for (let i = 0; i < 5000; i++) {
      const o = track.offset(R() * track.length, (R() - 0.5) * 2 * Y.HALF_W);
      const [px, py] = P(o.x, o.y);
      t.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; t.fillRect(px, py, 2, 2);
    }
    roadLines(t, P, 0, track.length);
    // rampalar: yükseldikçe açılan ton + korkuluk
    const br = track.bridge;
    for (const [sa, sb] of [[br.s0, br.top0], [br.top1, br.s1]]) {
      for (let s = sa; s < sb; s += 0.5) {
        const z = track.elev(s + 0.25) / Y.BRIDGE_H;
        strokeRange(t, P, s, s + 0.5, Y.HALF_W * 2, `rgba(255,255,255,${(0.04 + z * 0.14).toFixed(3)})`);
      }
      railings(t, P, sa, sb);
    }
    // köprünün alt yola düşen gölgesi
    t.save(); t.translate(0.5 * K, 0.9 * K); strokeRange(t, P, br.top0 - 1.2, br.top1 + 1.2, (Y.HALF_W + Y.CURB) * 2, 'rgba(0,0,0,.35)'); t.restore();
    // başlangıç ızgarası kutuları
    t.strokeStyle = 'rgba(255,255,255,.75)'; t.lineWidth = K * 0.07;
    for (const [x, y, a] of track.grid) {
      const [px, py] = P(x, y);
      t.save(); t.translate(px, py); t.rotate(a); t.beginPath(); t.moveTo(K * 0.5, -K * 0.45); t.lineTo(K * 0.5, K * 0.45); t.stroke(); t.restore();
    }
    // bitiş çizgisi (damalı)
    const a = track.pointAt(0), sq = 0.4, n = Math.ceil(Y.HALF_W / sq);
    for (let i = -n; i < n; i++) for (let j = 0; j < 2; j++) {
      t.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      const px = a.x + Math.cos(a.a + Math.PI / 2) * i * sq + Math.cos(a.a) * j * sq, py = a.y + Math.sin(a.a + Math.PI / 2) * i * sq + Math.sin(a.a) * j * sq;
      t.save(); t.translate(...P(px, py)); t.rotate(a.a + Math.PI / 2); t.fillRect(0, 0, sq * K, sq * K); t.restore();
    }
    // tribün (kendi platformunda)
    if (decor.stand) {
      const st = decor.stand;
      t.save(); t.translate(...P(st.x, st.y)); t.rotate(st.a);
      t.fillStyle = ROCK2; t.fillRect(-K * 5.5, -K * 1.6 + 0.35 * K, K * 11, K * 3.2);
      t.fillStyle = '#9ca3af'; t.fillRect(-K * 5.5, -K * 1.6, K * 11, K * 3.2);
      t.fillStyle = '#6b7280'; t.fillRect(-K * 5, -K * 1.3, K * 10, K * 2.2);
      for (let i = 0; i < 700; i++) { t.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#fff', '#a855f7'][Math.floor(R() * 6)]; t.fillRect(-K * 5 + R() * K * 10, -K * 1.3 + R() * K * 2.2, 3, 3); }
      t.fillStyle = '#374151'; t.fillRect(-K * 5, K * 0.9, K * 10, K * 0.3);
      t.restore();
    }
    // köprü tablası: ayrı şeffaf katman (alt yoldaki arabalar bunun altında çizilir)
    const pts = [];
    for (let s = br.top0 - 1.5; s <= br.top1 + 1.5; s += 0.25) { const p = track.pointAt(s); pts.push(p); }
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const p of pts) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); }
    const m = Y.HALF_W + Y.CURB + 1;
    const dc = document.createElement('canvas');
    dc.width = Math.ceil((bx1 - bx0 + 2 * m) * K); dc.height = Math.ceil((by1 - by0 + 2 * m) * K);
    const dt = dc.getContext('2d');
    const DP = (x, y) => [(x - bx0 + m) * K, (y - by0 + m) * K];
    roadStyleOn(dt, DP, br.top0 - 1.2, br.top1 + 1.2);
    deck = { c: dc, x: (bx0 - m - x0) * K, y: (by0 - m - y0) * K };
    return c;
  }
  function roadStyleOn(t, P, sa, sb) {
    roadStyle(t, P, sa, sb, false);
    for (let i = 0; i < 400; i++) { const o = track.offset(sa + Math.random() * (sb - sa), (Math.random() - 0.5) * 2 * Y.HALF_W); const [px, py] = P(o.x, o.y); t.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; t.fillRect(px, py, 2, 2); }
    roadLines(t, P, sa, sb);
    railings(t, P, sa, sb);
  }

  // Dünya görüntüsü 256 px'lik karolara bölünür
  const TILE = 256;
  function buildTiles() {
    if (!world) world = buildWorld();
    tiles = [];
    for (let y = 0; y < world.height; y += TILE) for (let x = 0; x < world.width; x += TILE) {
      const c = document.createElement('canvas');
      c.width = Math.min(TILE, world.width - x); c.height = Math.min(TILE, world.height - y);
      c.getContext('2d').drawImage(world, -x, -y);
      tiles.push({ x, y, c });
    }
  }
  function paintSkid(wx, wy, color) {
    const px = (wx - WB.x0) * K, py = (wy - WB.y0) * K;
    const t = tiles[Math.floor(py / TILE) * Math.ceil(world.width / TILE) + Math.floor(px / TILE)];
    if (!t) return;
    const c = t.c.getContext('2d');
    c.fillStyle = color; c.fillRect(px - t.x - 1.5, py - t.y - 1.5, 3, 3);
  }
  function drawCar2D(c, sc, toS, now) {
    const p = pById(c.id);
    if (!p) return;
    const falling = c.fall !== null;
    if (falling && c.fall > Y.FALL_T) return;
    const fk = falling ? clamp(c.fall / Y.FALL_T, 0, 1) : 0;
    const [sx, sy] = toS(c.x, c.y);
    const lift = Math.max(0, c.z) / Y.BRIDGE_H;
    const scale = (1 + lift * 0.08) * (1 - fk * 0.75);
    const L = 0.95 * sc * scale, Wd = 0.5 * sc * scale;
    g.save();
    if (falling) g.globalAlpha = 1 - fk * 0.85;
    else if (c.inv > 0) g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 70));
    g.translate(sx, sy); g.rotate(c.h - cam.a - Math.PI / 2 + fk * 2.5); // ekrana göre yön (kamera aracın yönüne döner)
    const shx = 3 + lift * 9, shy = 4 + lift * 12;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(-L / 2 + shx, -Wd / 2 + shy, L, Wd, Wd * 0.3); g.fill();
    g.fillStyle = '#111';
    for (const [wx, wy] of [[-0.3, -0.56], [0.3, -0.56], [-0.3, 0.56], [0.3, 0.56]]) {
      g.save(); g.translate(wx * L, wy * Wd); if (wx > 0) g.rotate((c.steer || 0) * 0.45); g.fillRect(-L * 0.1, -Wd * 0.12, L * 0.2, Wd * 0.24); g.restore();
    }
    g.fillStyle = carColor(p); g.beginPath(); g.roundRect(-L / 2, -Wd / 2, L, Wd, Wd * 0.35); g.fill();
    g.fillStyle = p.color; g.fillRect(-L / 2, -Wd * 0.1, L, Wd * 0.2);
    g.fillStyle = 'rgba(160,210,255,.9)'; g.beginPath(); g.roundRect(L * 0.06, -Wd * 0.32, L * 0.18, Wd * 0.64, Wd * 0.1); g.fill();
    g.fillStyle = p.color; g.beginPath(); g.arc(-L * 0.1, 0, Wd * 0.25, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.fillRect(-L * 0.52, -Wd * 0.45, L * 0.08, Wd * 0.9);
    g.fillStyle = '#ffe9a8'; g.fillRect(L * 0.44, -Wd * 0.38, L * 0.06, Wd * 0.18); g.fillRect(L * 0.44, Wd * 0.2, L * 0.06, Wd * 0.18);
    g.restore();
    if (falling) return;
    g.save(); g.font = `700 ${Math.round(10 * ctx.size().DPR)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 3 * ctx.size().DPR; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = '#fff';
    const txt = c.id === playerId ? 'SEN' : p.name;
    g.strokeText(txt, sx, sy - Wd * 1.2); g.fillText(txt, sx, sy - Wd * 1.2); g.restore();
  }

  function render2D(st, now, dt, info) {
    const { W, H, DPR } = ctx.size();
    if (!track) { g.fillStyle = SEA; g.fillRect(0, 0, W, H); return overlay2D(st, W, H, DPR); }
    if (!tiles) buildTiles();
    const me = st && st.cars[playerId];
    const follow = me || (st && st.cars[standings(st)[0]]);
    const start = track.pointAt(0);
    const tx = follow ? follow.x : start.x, ty = follow ? follow.y : start.y;
    const ta = follow ? follow.h : start.a;
    const k = cam.init ? 1 - Math.pow(0.004, dt) : 1;
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
    let da = ta - cam.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    cam.a += da * (cam.init ? 1 - Math.pow(0.02, dt) : 1);
    const zt = 1 - clamp(Math.abs(follow ? follow.sp : 0) / 9, 0, 1) * 0.35;
    cam.z = lerp(cam.z, zt, cam.init ? 1 - Math.pow(0.1, dt) : 1);
    cam.init = true;
    const sc = (Math.min(W, H) / 9.5) * cam.z;
    // kayma izleri doğrudan dünya karolarına işlenir (köprü üstünde atlanır)
    if (st) for (const c of Object.values(st.cars)) {
      if (c.fall !== null || c.z > 0.3) continue;
      const curb = Math.abs(c.d) > Y.HALF_W;
      if (!(c.slip > 1.3 || (Math.abs(c.sp) > 3 && curb))) continue;
      for (const side of [-1, 1]) {
        paintSkid(c.x + Math.cos(c.h + Math.PI / 2) * side * 0.22 - Math.cos(c.h) * 0.3, c.y + Math.sin(c.h + Math.PI / 2) * side * 0.22 - Math.sin(c.h) * 0.3, curb ? 'rgba(80,20,20,.3)' : 'rgba(20,20,20,.35)');
      }
    }
    const shake = shakeT > now ? (Math.random() - 0.5) * 6 * DPR : 0;
    g.fillStyle = SEA2; g.fillRect(0, 0, W, H);
    const worldXf = () => {
      g.save();
      g.translate(W / 2 + shake, H * 0.62 + shake);
      g.rotate(-cam.a - Math.PI / 2);
      g.scale(sc / K, sc / K);
      g.translate(-(cam.x - WB.x0) * K, -(cam.y - WB.y0) * K);
    };
    worldXf();
    // yalnızca ekrana giren karoları çiz (büyük resmi her karede döndürmek telefonda yavaş)
    const Rr = Math.hypot(W, H) / sc * 0.75 * K;
    const cx = (cam.x - WB.x0) * K, cy = (cam.y - WB.y0) * K;
    for (const t of tiles) {
      if (t.x + TILE < cx - Rr || t.x > cx + Rr || t.y + TILE < cy - Rr || t.y > cy + Rr) continue;
      g.drawImage(t.c, t.x, t.y);
    }
    g.restore();
    // dünya → ekran
    const cs = Math.cos(-cam.a - Math.PI / 2), sn = Math.sin(-cam.a - Math.PI / 2);
    const toS = (x, y) => { const dx = (x - cam.x) * sc, dy = (y - cam.y) * sc; return [W / 2 + dx * cs - dy * sn + shake, H * 0.62 + dx * sn + dy * cs + shake]; };
    if (st) {
      const list = Object.values(st.cars).sort((a, b) => (a.id === playerId) - (b.id === playerId));
      const upper = (c) => c.fall === null && c.z > Y.BRIDGE_H * 0.5;
      for (const c of list) if (!upper(c)) drawCar2D(c, sc, toS, now);
      // köprü tablası alt yoldaki arabaların üstüne
      if (deck && Math.hypot(track.bridge.x - cam.x, track.bridge.y - cam.y) < Rr / K + 8) { worldXf(); g.drawImage(deck.c, deck.x, deck.y); g.restore(); }
      for (const c of list) if (upper(c)) drawCar2D(c, sc, toS, now);
    } else if (deck) { worldXf(); g.drawImage(deck.c, deck.x, deck.y); g.restore(); }
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      const [px, py] = toS(p.x, p.y);
      g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c;
      g.beginPath(); g.arc(px, py, p.r * sc * (p.smoke ? 1 + p.life * 2 : 1), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    drawMinimap(st, W, H, DPR);
    return overlay2D(st, W, H, DPR);
  }

  function drawMinimap(st, W, H, DPR) {
    if (!track) return;
    const b = track.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const s = Math.min((84 * DPR) / bw, (120 * DPR) / bh);
    const ox = W - bw * s - 10 * DPR, oy = 10 * DPR;
    g.save();
    g.fillStyle = 'rgba(8,12,28,.55)'; g.beginPath(); g.roundRect(ox - 6 * DPR, oy - 6 * DPR, bw * s + 12 * DPR, bh * s + 12 * DPR, 10 * DPR); g.fill();
    g.beginPath(); track.pts.forEach(([x, y], i) => { const px = ox + (x - b.x0) * s, py = oy + (y - b.y0) * s; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3 * DPR; g.stroke();
    // köprü
    const br = track.bridge; g.beginPath();
    for (let sv = br.top0; sv <= br.top1; sv += 0.5) { const p = track.pointAt(sv); const px = ox + (p.x - b.x0) * s, py = oy + (p.y - b.y0) * s; sv === br.top0 ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.strokeStyle = '#fbbf24'; g.lineWidth = 3 * DPR; g.stroke();
    if (st) for (const c of Object.values(st.cars)) {
      if (c.fall !== null) continue;
      const p = pById(c.id);
      g.fillStyle = p ? p.color : '#fff';
      g.beginPath(); g.arc(ox + (c.x - b.x0) * s, oy + (c.y - b.y0) * s, (c.id === playerId ? 4.5 : 3) * DPR, 0, Math.PI * 2); g.fill();
      if (c.id === playerId) { g.strokeStyle = '#fff'; g.lineWidth = 1.5 * DPR; g.stroke(); }
    }
    g.restore();
  }

  // Sıralama listesi (portreli) — sol üst; 2D ve 3D'de ortak
  function drawStandings(st, W, H, DPR) {
    const order = standings(st);
    const row = 19 * DPR, x = 10 * DPR;
    let y = 10 * DPR;
    g.save(); g.textBaseline = 'middle';
    g.fillStyle = 'rgba(8,12,28,.5)'; g.beginPath(); g.roundRect(x - 5 * DPR, y - 4 * DPR, 112 * DPR, order.length * row + 8 * DPR, 8 * DPR); g.fill();
    order.forEach((id, i) => {
      const p = pById(id) || { name: '?', color: '#888' }, c = st.cars[id];
      const me = id === playerId, cy = y + row / 2;
      if (me) { g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(x - 3 * DPR, y, 108 * DPR, row, 5 * DPR); g.fill(); }
      g.font = `800 ${Math.round(10 * DPR)}px system-ui`; g.textAlign = 'right'; g.fillStyle = i === 0 ? '#fbbf24' : '#e5e7eb';
      g.fillText(String(i + 1), x + 10 * DPR, cy);
      const im = portraitImg(p);
      if (im) g.drawImage(im, x + 14 * DPR, cy - 7 * DPR, 14 * DPR, 14 * DPR);
      else { g.fillStyle = p.color; g.beginPath(); g.arc(x + 21 * DPR, cy, 6 * DPR, 0, Math.PI * 2); g.fill(); }
      g.textAlign = 'left'; g.font = `${me ? 800 : 600} ${Math.round(10 * DPR)}px system-ui`; g.fillStyle = me ? '#fff' : '#d1d5db';
      let nm = me ? 'SEN' : String(p.name); if (nm.length > 9) nm = nm.slice(0, 8) + '…';
      g.fillText(nm, x + 32 * DPR, cy);
      g.textAlign = 'right'; g.fillStyle = '#9ca3af'; g.font = `600 ${Math.round(9 * DPR)}px system-ui`;
      g.fillText(c.done !== null ? '🏁' : c.fall !== null ? '💨' : `${c.lap}/${Y.LAPS}`, x + 103 * DPR, cy);
      y += row;
    });
    g.restore();
    return y + 8 * DPR;
  }

  // Ortak üst katman (2D ve 3D): geri sayım, hız, sıra, liste
  function overlay2D(st, W, H, DPR) {
    if (!st) return 'Bekleniyor…';
    const me = st.cars[playerId];
    if (st.phase === 'count' || st.phase === 'wait') {
      const n = st.phase === 'wait' ? '…' : String(Math.max(1, Math.ceil(st.cd)));
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${Math.round(90 * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)';
      g.fillStyle = st.phase === 'wait' ? '#fff' : ['#22c55e', '#facc15', '#ef4444'][Math.max(0, Math.ceil(st.cd) - 1)] || '#fff';
      g.strokeText(n, W / 2, H * 0.38); g.fillText(n, W / 2, H * 0.38); g.restore();
      drawStandings(st, W, H, DPR);
      return st.phase === 'wait' ? '📡 Herkes bağlanıyor…' : '🚦 Hazır ol!';
    }
    const listBottom = drawStandings(st, W, H, DPR);
    if (me) {
      const total = Object.keys(st.cars).length, place = placeOf(st, playerId);
      const by = Math.max(H * 0.36, listBottom + 34 * DPR);
      g.save(); g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.font = `900 ${Math.round(26 * DPR)}px system-ui`; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 5 * DPR;
      const kmh = `${Math.round(Math.abs(me.sp) * 22)}`;
      g.strokeText(kmh, 12 * DPR, by); g.fillText(kmh, 12 * DPR, by);
      const kw = g.measureText(kmh).width;
      g.font = `700 ${Math.round(11 * DPR)}px system-ui`; g.fillText('km/s', 14 * DPR, by + 14 * DPR);
      // sıra: hızın yanında
      g.font = `900 ${Math.round(22 * DPR)}px system-ui`; g.fillStyle = place === 1 ? '#fbbf24' : '#93c5fd';
      const pt = `${place}./${total}`;
      g.strokeText(pt, 12 * DPR + kw + 12 * DPR, by); g.fillText(pt, 12 * DPR + kw + 12 * DPR, by);
      g.restore();
      if (me.fall !== null) {
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `900 ${Math.round(30 * DPR)}px system-ui`; g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fca5a5';
        const txt = me.fall < Y.FALL_T ? '😱 Uçurum!' : `⏳ ${Math.max(0, Y.RESPAWN_T - me.fall).toFixed(1)}`;
        g.strokeText(txt, W / 2, H * 0.3); g.fillText(txt, W / 2, H * 0.3); g.restore();
      }
    }
    if (st.phase === 'race' && spec.goAt && performance.now() - spec.goAt < 1200) return '🟢 BAŞLA!';
    if (me && me.done !== null) return `🏁 Bitirdin! ${placeOf(st, playerId)}. sıra`;
    return '';
  }

  const standings = (st) => {
    const key = (c) => (c.done !== null ? c.done - 1e6 : -c.prog);
    return Object.values(st.cars).sort((a, b) => key(a) - key(b)).map((c) => c.id);
  };
  const placeOf = (st, id) => standings(st).indexOf(id) + 1;

  // ---------- 3D ----------
  async function ensure3D() {
    if (R3 || loading) return;
    loading = true;
    try { T = await loadThree(); R3 = build3D(); if (track) build3DTrack(); } catch (e) { console.error(e); ctx.toast('3D görünüm yüklenemedi'); ctx.setView('top'); }
    loading = false;
  }
  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9fd3ff');
    scene.fog = new THREE.Fog('#bfe3ff', 16, 60);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 140);
    scene.add(new THREE.HemisphereLight('#ffffff', '#355a7a', 1.5));
    const sun = new THREE.DirectionalLight('#fff4d6', 1.7); sun.position.set(-8, 14, 6); scene.add(sun);
    // deniz (boşluk) — pistin çok altında
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#1d4f85' }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(10, -7, 16); scene.add(sea);
    // uzaktaki dağlar
    const mtMat = new THREE.MeshLambertMaterial({ color: '#7aa38a', flatShading: true });
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2, r = 70 + (i % 3) * 8;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(9 + (i % 4) * 3, 12 + (i % 5) * 4, 6), mtMat);
      mt.position.set(10 + Math.cos(ang) * r, -3, 16 + Math.sin(ang) * r); scene.add(mt);
    }
    // kokpit: direksiyon simidi ve kaput (kameraya bağlı)
    const cockpit = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.013, 8, 24), new THREE.MeshLambertMaterial({ color: '#111' }));
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.015), new THREE.MeshLambertMaterial({ color: '#222' }));
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.016), new THREE.MeshLambertMaterial({ color: '#ff3355' }));
    mark.position.y = 0.1;
    const wheelG = new THREE.Group(); wheelG.add(wheel, hub, mark);
    wheelG.position.set(0, -0.23, -0.42); wheelG.rotation.x = -0.4;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: '#1f2937' }));
    dash.position.set(0, -0.33, -0.55);
    cockpit.add(wheelG, dash);
    cam.add(cockpit); scene.add(cam);
    return { renderer, scene, cam, cars: new Map(), cockpit, wheelG, w: 0, h: 0, camPos: null, trackG: null };
  }
  // Üretilen pistin 3D modeli: şerit (asfalt, bordür, kenar çizgisi), kaya yan yüzler, köprü alt yüzü, korkuluklar, adalar, tribün
  function build3DTrack() {
    const THREE = T;
    if (R3.trackG) { R3.scene.remove(R3.trackG); R3.trackG.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.length) o.material.dispose(); }); }
    const G = new THREE.Group(); R3.trackG = G; R3.scene.add(G);
    const pos = [], col = [];
    const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
    const asph = C('#3d424d'), asph2 = C('#363b45'), red = C('#e03131'), white = C('#f2f2f2'), line = C('#e5e7eb'), rock = C(ROCK), rock2 = C(ROCK2), under = C('#2b2622');
    const quad = (a, b, c, d, color) => { for (const v of [a, b, c, a, c, d]) pos.push(v[0], v[1], v[2]); for (let i = 0; i < 6; i++) col.push(color[0], color[1], color[2]); };
    const { n, ds } = track;
    const ring = (i) => {
      const s = (i % n) * ds, p = track.pointAt(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      const depth = 1.4 - (1.4 - 0.45) * clamp(p.z / Y.BRIDGE_H, 0, 1);
      const at = (d, dz) => [p.x + nx * d, p.z + dz, p.y + ny * d];
      return { at, z: p.z, depth };
    };
    const step = 1; // her örnek (≈0,3 birim)
    for (let i = 0; i < n; i += step) {
      const r0 = ring(i), r1 = ring(i + step);
      const hw = Y.HALF_W, cw = Y.HALF_W + Y.CURB;
      const stripe = Math.floor((i * ds) / 0.7) % 2 ? red : white;
      const shade = Math.floor((i * ds) / 2.1) % 2 ? asph : asph2;
      // asfalt (üst yüz)
      quad(r0.at(-hw, 0), r1.at(-hw, 0), r1.at(hw, 0), r0.at(hw, 0), shade);
      // kenar çizgileri (biraz yukarıda)
      for (const sd of [-1, 1]) quad(r0.at(sd * (hw - 0.22), 0.004), r1.at(sd * (hw - 0.22), 0.004), r1.at(sd * (hw - 0.1), 0.004), r0.at(sd * (hw - 0.1), 0.004), line);
      // bordür
      quad(r0.at(-cw, 0), r1.at(-cw, 0), r1.at(-hw, 0), r0.at(-hw, 0), stripe);
      quad(r0.at(hw, 0), r1.at(hw, 0), r1.at(cw, 0), r0.at(cw, 0), stripe);
      // kaya yan yüzler (uçurum)
      quad(r0.at(-cw, 0), r0.at(-cw, -r0.depth), r1.at(-cw, -r1.depth), r1.at(-cw, 0), rock);
      quad(r0.at(cw, 0), r1.at(cw, 0), r1.at(cw, -r1.depth), r0.at(cw, -r0.depth), rock2);
      // alt yüz (köprü altından görünür)
      if (r0.z > 0.02 || r1.z > 0.02) quad(r0.at(-cw, -r0.depth), r1.at(-cw, -r1.depth), r1.at(cw, -r1.depth), r0.at(cw, -r0.depth), under);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    G.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // köprü korkulukları: direkler + ray parçaları
    const br = track.bridge, posts = [], rails = [];
    for (let s = br.s0; s <= br.s1 + 1e-6; s += 1.2) for (const sd of [-1, 1]) {
      const a = track.offset(s, sd * RAIL_W), b = track.offset(Math.min(s + 1.2, br.s1), sd * RAIL_W);
      posts.push(a); rails.push([a, b]);
    }
    const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), new THREE.MeshLambertMaterial({ color: '#d1d5db' }), posts.length);
    posts.forEach((p, i) => { m.makeTranslation(p.x, p.z + 0.45, p.y); post.setMatrixAt(i, m); });
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshLambertMaterial({ color: '#ef4444' }), rails.length * 2);
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    rails.forEach(([a, b], i) => {
      for (const [k, h] of [[0, 0.88], [1, 0.5]]) {
        va.set(a.x, a.z + h, a.y); vb.set(b.x, b.z + h, b.y);
        const len = va.distanceTo(vb) || 0.01;
        m.lookAt(vb, va, up); m.setPosition((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
        m.multiply(new THREE.Matrix4().makeScale(1, 1, len));
        rail.setMatrixAt(i * 2 + k, m);
      }
    });
    G.add(post, rail);
    // adalar
    const nTrees = decor.islands.reduce((a, is) => a + is.trees.length, 0);
    const isl = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.8, 5.2, 10), new THREE.MeshLambertMaterial({ color: '#8a7a5a', flatShading: true }), decor.islands.length);
    const top = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 10), new THREE.MeshLambertMaterial({ color: '#3f8f3a' }), decor.islands.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6), new THREE.MeshLambertMaterial({ color: '#6b4423' }), nTrees);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.2, 7), new THREE.MeshLambertMaterial({ color: '#2f7d3a', flatShading: true }), nTrees);
    let ti = 0;
    decor.islands.forEach((is, i) => {
      m.compose(new THREE.Vector3(is.x, -4.4, is.y), new THREE.Quaternion(), new THREE.Vector3(is.r, 1, is.r)); isl.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(is.x, -1.8, is.y), new THREE.Quaternion(), new THREE.Vector3(is.r, 1, is.r)); top.setMatrixAt(i, m);
      for (const [x, y, s] of is.trees) {
        m.makeTranslation(x, -1.5, y); trunk.setMatrixAt(ti, m);
        m.compose(new THREE.Vector3(x, -1.2 + s * 1.1, y), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); crown.setMatrixAt(ti, m);
        ti++;
      }
    });
    G.add(isl, top, trunk, crown);
    // tribün (platform üstünde)
    if (decor.stand) {
      const st = decor.stand;
      const crowdC = document.createElement('canvas'); crowdC.width = 256; crowdC.height = 64;
      const cg = crowdC.getContext('2d'); cg.fillStyle = '#4b5563'; cg.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 700; i++) { cg.fillStyle = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#fff', '#a855f7'][i % 6]; cg.fillRect(Math.random() * 256, Math.random() * 64, 3, 3); }
      const crowdTex = new THREE.CanvasTexture(crowdC); crowdTex.colorSpace = THREE.SRGBColorSpace;
      const grey = new THREE.MeshLambertMaterial({ color: '#374151' });
      const plat = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, 3.2), new THREE.MeshLambertMaterial({ color: ROCK }));
      plat.position.set(st.x, -0.7, st.y); plat.rotation.y = -st.a; G.add(plat);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(10, 1.8, 2.2), [grey, grey, new THREE.MeshLambertMaterial({ color: '#9ca3af' }), grey, grey, new THREE.MeshLambertMaterial({ map: crowdTex })]);
      stand.position.set(st.x, 0.9, st.y); stand.rotation.y = -st.a; stand.rotation.x = 0.3; G.add(stand);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.08, 2.8), new THREE.MeshLambertMaterial({ color: '#ef4444' }));
      roof.position.set(st.x, 2.3, st.y); roof.rotation.y = -st.a; G.add(roof);
    }
    // başlangıç kapısı
    const a = track.pointAt(0), nx = -Math.sin(a.a), ny = Math.cos(a.a);
    const postMat = new THREE.MeshLambertMaterial({ color: '#e5e7eb' });
    for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), postMat); p.position.set(a.x + nx * side * (Y.HALF_W + 0.6), 1.3, a.y + ny * side * (Y.HALF_W + 0.6)); G.add(p); }
    const chk = document.createElement('canvas'); chk.width = 256; chk.height = 32;
    const kg = chk.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { kg.fillStyle = (i + j) % 2 ? '#111' : '#fff'; kg.fillRect(i * 16, j * 16, 16, 16); }
    const chkTex = new THREE.CanvasTexture(chk);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, (Y.HALF_W + 0.6) * 2 + 0.2), new THREE.MeshLambertMaterial({ map: chkTex }));
    beam.position.set(a.x, 2.6, a.y); beam.rotation.y = -a.a; G.add(beam);
    // damalı bitiş çizgisi (yerde)
    const fchk = document.createElement('canvas'); fchk.width = 32; fchk.height = 256;
    const fg = fchk.getContext('2d'); for (let i = 0; i < 2; i++) for (let j = 0; j < 16; j++) { fg.fillStyle = (i + j) % 2 ? '#111' : '#fff'; fg.fillRect(i * 16, j * 16, 16, 16); }
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.8, Y.HALF_W * 2), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(fchk) }));
    fin.rotation.x = -Math.PI / 2; fin.rotation.z = -a.a; fin.position.set(a.x, 0.006, a.y);
    G.add(fin);
    R3.camPos = null;
  }
  function carMesh(id) {
    let c = R3.cars.get(id);
    if (c) return c;
    const THREE = T, p = pById(id);
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: carColor(p) }));
    body.position.y = 0.14; grp.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: carColor(p) })); nose.position.set(0.5, 0.11, 0); grp.add(nose);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.17, 0.1), new THREE.MeshLambertMaterial({ color: p ? p.color : '#fff' })); stripe.position.y = 0.145; grp.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.75 })); cabin.position.set(0.05, 0.27, 0); grp.add(cabin);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshLambertMaterial({ color: p ? p.color : '#fff' })); helmet.position.set(-0.08, 0.3, 0); grp.add(helmet);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.56), new THREE.MeshLambertMaterial({ color: '#111' })); wing.position.set(-0.5, 0.3, 0); grp.add(wing);
    const wheels = [];
    for (const [x, z] of [[0.32, 0.29], [0.32, -0.29], [-0.32, 0.29], [-0.32, -0.29]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 12), new THREE.MeshLambertMaterial({ color: '#111' }));
      w.rotation.x = Math.PI / 2; w.position.set(x, 0.11, z); grp.add(w); wheels.push(w);
    }
    const label = makeLabel(THREE, id === playerId ? 'SEN' : p ? p.name : '?', p ? p.color : '#fff');
    label.position.y = 0.75; label.scale.set(0.9, 0.22, 1); grp.add(label);
    R3.scene.add(grp);
    c = { grp, wheels, label };
    R3.cars.set(id, c);
    return c;
  }
  const pitchAt = (s) => Math.atan2(track.elev(s + 0.5) - track.elev(s - 0.5), 1);
  function render3D(st, now, dt, view) {
    const sz = ctx.size3();
    if (sz.w !== R3.w || sz.h !== R3.h) { R3.renderer.setSize(sz.w, sz.h, false); R3.cam.aspect = sz.w / sz.h; R3.cam.updateProjectionMatrix(); R3.w = sz.w; R3.h = sz.h; }
    if (st && track) for (const c of Object.values(st.cars)) {
      const m = carMesh(c.id);
      const falling = c.fall !== null;
      m.grp.position.set(c.x, c.z, c.y);
      m.grp.rotation.set(0, -c.h, 0);
      if (falling) { const fk = clamp(c.fall / Y.FALL_T, 0, 1); m.grp.rotation.x = fk * 2.2; m.grp.rotation.z = fk * 1.1; m.grp.visible = c.fall < Y.RESPAWN_T - 0.1; }
      else { m.grp.rotation.z = pitchAt(c.s); m.grp.visible = true; }
      if (view === 'fps' && c.id === playerId) m.grp.visible = false;
      if (c.inv > 0 && !falling) m.grp.visible = Math.sin(now / 60) > -0.3;
      m.label.visible = c.id !== playerId && !falling;
      for (const w of m.wheels) w.rotation.y += c.sp * dt * 6;
    }
    const me = st && (st.cars[playerId] || st.cars[standings(st)[0]]);
    const cam = R3.cam;
    if (me && track) {
      const fx = Math.cos(me.h), fy = Math.sin(me.h);
      const falling = me.fall !== null;
      const z = falling ? Math.max(me.z, -4) : me.z;
      const za = falling ? z : track.elev(me.s + 2.5);
      let px, py, pz, lx, ly, lz;
      if (view === 'fps' && !falling) { px = me.x + fx * 0.02; py = z + 0.36; pz = me.y + fy * 0.02; lx = me.x + fx * 5; ly = track.elev(me.s + 5) + 0.25; lz = me.y + fy * 5; }
      else { px = me.x - fx * 2.6; py = Math.max(z, -1) + 1.25 + (falling ? 1.5 : 0); pz = me.y - fy * 2.6; lx = me.x + fx * 2; ly = za + 0.3; lz = me.y + fy * 2; }
      const k = (view === 'fps' && !falling) || !R3.camPos ? 1 : 1 - Math.pow(0.002, dt);
      R3.camPos = R3.camPos || { x: px, y: py, z: pz };
      R3.camPos.x = lerp(R3.camPos.x, px, k); R3.camPos.y = lerp(R3.camPos.y, py, k); R3.camPos.z = lerp(R3.camPos.z, pz, k);
      cam.position.set(R3.camPos.x, R3.camPos.y, R3.camPos.z);
      if (shakeT > now) cam.position.x += (Math.random() - 0.5) * 0.06;
      cam.lookAt(lx, ly, lz);
      R3.cockpit.visible = view === 'fps' && !falling;
      R3.wheelG.rotation.z = -(me.steer || 0) * 1.6;
    }
    R3.renderer.render(R3.scene, cam);
    // 2D üst katman (geri sayım/hız/sıralama) ana tuvalde, şeffaf
    const { W, H, DPR } = ctx.size();
    g.clearRect(0, 0, W, H);
    drawMinimap(st, W, H, DPR);
    return overlay2D(st, W, H, DPR);
  }

  const spec = {
    kind: 'yaris', mod: Y, views: ['top', 'chase', 'fps'],
    controls: { left: 'wheel', below: true, buttons: [{ id: 'gas', label: 'GAZ', cls: 'gas' }, { id: 'brake', label: 'FREN', cls: 'brake' }] },
    input: (c) => ({ steer: c.x, gas: !!c.btn.gas, brake: !!c.btn.brake }),
    setBot: (sim, id) => { if (sim.cars[id]) sim.cars[id].bot = true; },
    onState(s) { if (s.g && s.g.seed != null) setTrack(s.g.seed); },
    interp(a, b, k) {
      const cars = {};
      const L = track ? track.length : 0;
      for (const [id, cb] of Object.entries(b.cars)) {
        const ca = a.cars[id] || cb;
        let dh = cb.h - ca.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        let dsv = cb.s - ca.s; if (L) { while (dsv > L / 2) dsv -= L; while (dsv < -L / 2) dsv += L; }
        cars[id] = { ...cb, x: lerp(ca.x, cb.x, k), y: lerp(ca.y, cb.y, k), h: ca.h + dh * k, sp: lerp(ca.sp, cb.sp, k), prog: lerp(ca.prog, cb.prog, k), z: lerp(ca.z, cb.z, k), s: ca.s + dsv * k };
      }
      return { ...b, t: lerp(a.t, b.t, k), cars };
    },
    onEvents(evs, st) {
      for (const e of evs) {
        if (e.e === 'beep') sfx('tick');
        if (e.e === 'go') { sfx('finish'); sfx('engine'); spec.goAt = performance.now(); }
        if (e.e === 'fall') {
          if (e.id === playerId) { sfx('fall'); shakeT = performance.now() + 300; } else sfx('drop');
          for (let i = 0; i < 10; i++) parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 0, max: 0.6, c: i % 2 ? '#d1d5db' : '#9ca3af', r: 0.12, smoke: true });
        }
        if (e.e === 'respawn') { if (e.id === playerId) { sfx('engine'); } for (let i = 0; i < 8; i++) parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0, max: 0.5, c: '#93c5fd', r: 0.08 }); }
        if (e.e === 'bump') {
          if (e.id === playerId) { sfx('crash'); shakeT = performance.now() + 200; } else sfx('bump');
          for (let i = 0; i < 6; i++) parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0, max: 0.6, c: '#d1d5db', r: 0.15, smoke: true });
        }
        if (e.e === 'finish') { sfx(e.id === playerId ? 'fanfare' : 'pop'); }
      }
    },
    render(st, now, dt, view, info) {
      if (st && st.seed != null) setTrack(st.seed);
      if (view !== 'top') { if (!R3) { ensure3D(); return render2D(st, now, dt, info); } return render3D(st, now, dt, view); }
      return render2D(st, now, dt, info);
    },
    ready3D: () => !!R3,
    panel(st) {
      if (!st) return '<div class="status"><small>Yarış birazdan başlıyor…</small></div>';
      const order = standings(st);
      return `<div class="race-board">${order.map((id, i) => { const p = pById(id) || { name: '?', color: '#888' }; const c = st.cars[id]; return `<span class="chip${id === playerId ? ' cur' : ''}"><span class="n">${i + 1}</span><img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">${esc(p.name)}${c.done !== null ? ' 🏁' : c.fall !== null ? ' 💨' : ` · ${c.lap}/${Y.LAPS}`}</span>`; }).join('')}</div>`;
    },
    hud(st) {
      if (!st) return '';
      const me = st.cars[playerId];
      return me ? `Tur <b>${me.lap}/${Y.LAPS}</b> · Sıra <b>${placeOf(st, playerId)}/${Object.keys(st.cars).length}</b>` : '👀 İzliyorsun';
    },
    dispose() { if (R3) { R3.renderer.dispose(); R3 = null; } },
  };
  return createRealtime(ctx, spec);
}
