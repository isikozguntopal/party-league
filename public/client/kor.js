// 🏃 Kör Koşu istemcisi: koşucu sisin içinde yalnızca önünü görür (2D üstten / 3D takip / FPS);
// yönlendirici her zaman tüm parkuru 2D haritada görür ve dokunarak kısa süreli işaret bırakır.
import * as K from '../games/korkosu.js';
import { lerp, clamp, sfx } from './util.js';
import { drawTopAvatar, portraitURL } from './avatar2d.js';
import { createRealtime } from './rt.js';
import { loadThree, buildAvatar, animateAvatar, makeLabel } from './avatar3d.js';

const TEAM_COLORS = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308'];
const VOID = '#07080f', ROAD = '#3d4a63', EDGE = '#facc15';
const HINT_PERIOD = 3, HINT_SHOW = 1.1; // bot rehber ipucu: her 3 sn'de 1,1 sn görünür

export function createKor(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  let shakeT = 0, pingN = 0, myPing = null, lastTap = -Infinity, parts = [], dirs = {}, intro = 0, lastIn = 0;
  let R3 = null, T = null, loading = false, cv3Cleared = false;
  const cam3 = { yaw: -Math.PI / 2, init: false, pos: null };
  // Görünümler: koşucu 2D/3D/FPS arasında geçer; rehber ve izleyici için dizi yerinde ['top']'a daraltılır
  const views = ['top', 'chase', 'fps'];

  const teamOf = (s) => (s && s.g && s.g.teams ? s.g.teams.find((t) => t.members.includes(playerId)) : null);
  const team = () => teamOf(ctx.state());
  const roleOf = (s) => { const t = teamOf(s); return !t ? 'izle' : t.runner === playerId ? 'kosucu' : 'rehber'; };
  const role = () => roleOf(ctx.state());

  // ---------- 2D kamera ----------
  let cam = { k: 40, ox: 0, oy: 0 };
  function setCam(W, H, fx, fy, zoomOut) {
    const k = zoomOut ? Math.min(W / 24, H / 32) : Math.min(W / 10, H / 13);
    cam = { k, ox: W / 2 - fx * k, oy: H * (zoomOut ? 0.5 : 0.55) - fy * k };
  }
  const sx = (x) => cam.ox + x * cam.k, sy = (y) => cam.oy + y * cam.k;
  const bboxCache = new Map();
  function bbox(c) {
    if (!bboxCache.has(c.seed)) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.px[i]); x1 = Math.max(x1, c.px[i]); y0 = Math.min(y0, c.py[i]); y1 = Math.max(y1, c.py[i]); }
      for (const st of c.stubs) { x0 = Math.min(x0, st.x, st.x + Math.cos(st.a) * st.len); x1 = Math.max(x1, st.x, st.x + Math.cos(st.a) * st.len); y0 = Math.min(y0, st.y, st.y + Math.sin(st.a) * st.len); y1 = Math.max(y1, st.y, st.y + Math.sin(st.a) * st.len); }
      bboxCache.set(c.seed, { x0: x0 - K.PW, y0: y0 - K.PW, x1: x1 + K.PW, y1: y1 + K.PW });
    }
    return bboxCache.get(c.seed);
  }

  // Yol şeridi çokgeni (ekran koordinatlarında) — s aralığı verilirse yalnızca o parça
  function ribbonPath(c, s0 = 0, s1 = c.LEN) {
    const sts = [s0];
    for (let i = Math.ceil(s0 / K.DS); i * K.DS < s1; i++) if (i * K.DS > s0) sts.push(i * K.DS);
    sts.push(s1);
    const L = [], Rr = [];
    for (const s of sts) { const f = K.frame(c, s), hw = K.widthAt(c, s) / 2; L.push([sx(f.x + f.nx * hw), sy(f.y + f.ny * hw)]); Rr.push([sx(f.x - f.nx * hw), sy(f.y - f.ny * hw)]); }
    g.beginPath();
    L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath();
  }
  // Yerel çerçeve: x ekseni = yol yönü (s), y ekseni = yanal (u); birimler dünya × k
  function local(c, s, u, fn) {
    const f = K.frame(c, s);
    g.save(); g.translate(sx(f.x + f.nx * u), sy(f.y + f.ny * u)); g.rotate(Math.atan2(f.ty, f.tx));
    fn(cam.k);
    g.restore();
  }
  const onScreen = (p, W, H, m) => { const x = sx(p.x), y = sy(p.y); return x > -m && x < W + m && y > -m && y < H + m; };

  function drawCourse(st, W, H, DPR, now) {
    const c = K.course(st.seed), t = st.el, k = cam.k;
    g.fillStyle = VOID; g.fillRect(0, 0, W, H);
    // uçurum dokusu: seyrek noktalar
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 40; i++) { const x = ((i * 977) % 1000) / 1000 * W, y = (((i * 613) % 1000) / 1000 * H + now / 80) % H; g.fillRect(x, y, 2 * DPR, 2 * DPR); }
    // sahte kollar
    for (const sb of c.stubs) {
      g.save(); g.translate(sx(sb.x), sy(sb.y)); g.rotate(sb.a);
      g.fillStyle = '#2f3950'; g.fillRect(-0.2 * k, -sb.wd / 2 * k, (sb.len + 0.2) * k, sb.wd * k);
      g.strokeStyle = '#151a28'; g.lineWidth = 3 * DPR; g.strokeRect(-0.2 * k, -sb.wd / 2 * k, (sb.len + 0.2) * k, sb.wd * k);
      g.restore();
    }
    // yol
    ribbonPath(c);
    g.fillStyle = ROAD; g.fill();
    g.strokeStyle = '#151a28'; g.lineWidth = 5 * DPR; g.stroke();
    g.strokeStyle = EDGE; g.lineWidth = 1.5 * DPR; g.stroke();
    // yol dokusu: enine çizgiler
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1 * DPR;
    for (let s = 2; s < c.LEN; s += 2) { const f = K.frame(c, s), hw = K.widthAt(c, s) / 2; if (!onScreen(f, W, H, k * 3)) continue; g.beginPath(); g.moveTo(sx(f.x + f.nx * hw), sy(f.y + f.ny * hw)); g.lineTo(sx(f.x - f.nx * hw), sy(f.y - f.ny * hw)); g.stroke(); }
    // konveyörler
    for (const b of c.belts) {
      ribbonPath(c, b.s0, b.s1); g.fillStyle = '#2b3650'; g.fill();
      const sh = (t * b.v) % 0.8;
      for (let s = b.s0 + 0.4; s < b.s1; s += 0.8) local(c, s, 0, (k) => {
        g.strokeStyle = '#94a3b8'; g.lineWidth = 2 * DPR;
        for (let u = -2.0 + sh; u < 2.0; u += 0.8) { const d = Math.sign(b.v) * 0.18; g.beginPath(); g.moveTo(-0.25 * k, (u - d) * k); g.lineTo(0, (u + d) * k); g.lineTo(0.25 * k, (u - d) * k); g.stroke(); }
      });
    }
    // sönen platformlar
    for (const b of c.blinks) {
      const on = K.blinkOn(b, t), left = K.blinkLeft(b, t);
      ribbonPath(c, b.s0, b.s1);
      if (on) { const warn = left < 0.6 && Math.floor(now / 90) % 2 === 0; g.fillStyle = warn ? '#1e3a8a' : '#2563eb'; g.fill(); g.strokeStyle = '#93c5fd'; g.lineWidth = 2 * DPR; g.stroke(); }
      else { g.fillStyle = VOID; g.fill(); g.setLineDash([6 * DPR, 6 * DPR]); g.strokeStyle = left > -0.5 ? '#93c5fd' : '#1e3a8a'; g.lineWidth = 2 * DPR; g.stroke(); g.setLineDash([]); }
    }
    // kontrol noktaları
    for (const cp of c.cps) {
      if (!cp) continue;
      const f = K.frame(c, cp), hw = K.widthAt(c, cp) / 2;
      if (!onScreen(f, W, H, k * 4)) continue;
      g.strokeStyle = 'rgba(56,189,248,.7)'; g.lineWidth = 4 * DPR; g.beginPath(); g.moveTo(sx(f.x + f.nx * hw), sy(f.y + f.ny * hw)); g.lineTo(sx(f.x - f.nx * hw), sy(f.y - f.ny * hw)); g.stroke();
      g.font = `700 ${11 * DPR}px system-ui`; g.fillStyle = '#7dd3fc'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🚩', sx(f.x + f.nx * (hw + 0.5)), sy(f.y + f.ny * (hw + 0.5)));
    }
    // başlangıç ve bitiş (dama)
    local(c, 0.5, 0, (k) => { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-0.05 * k, -K.PW / 2 * k, 0.1 * k, K.PW * k); });
    local(c, c.LEN - 1.2, 0, (k) => { const cs = 0.4; for (let i = 0; i < 3; i++) for (let j = 0; j < K.PW / cs; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * cs * k, (-K.PW / 2 + j * cs) * k, cs * k, cs * k); } });
    // duvarlar
    for (const w of c.walls) local(c, w.s, 0, (k) => {
      for (const [a, b] of w.segs) {
        g.fillStyle = '#7c2d12'; g.fillRect(-0.3 * k, a * k, 0.6 * k, (b - a) * k);
        g.fillStyle = '#c2410c'; g.fillRect(-0.3 * k, a * k, 0.6 * k - 3 * DPR, (b - a) * k);
      }
    });
    // kayan bloklar
    for (const m of c.movers) local(c, m.s, K.moverU(m, t), (k) => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-0.4 * k + 3 * DPR, -m.w / 2 * k + 4 * DPR, 0.8 * k, m.w * k);
      g.fillStyle = '#dc2626'; g.fillRect(-0.4 * k, -m.w / 2 * k, 0.8 * k, m.w * k);
      g.fillStyle = '#fbbf24'; for (let i = 0; i < 4; i++) g.fillRect(-0.4 * k, (-m.w / 2 + i * 0.35) * k, 0.8 * k, 0.12 * k);
    });
    // dönen bıçaklar
    for (const s of c.spinners) local(c, s.s, s.u, (k) => {
      const a = K.spinA(s, t);
      g.save(); g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-s.len * k + 3 * DPR, -0.13 * k + 4 * DPR, s.len * 2 * k, 0.26 * k);
      const gr = g.createLinearGradient(-s.len * k, 0, s.len * k, 0);
      gr.addColorStop(0, '#e5e7eb'); gr.addColorStop(0.5, '#9ca3af'); gr.addColorStop(1, '#e5e7eb');
      g.fillStyle = gr; g.fillRect(-s.len * k, -0.13 * k, s.len * 2 * k, 0.26 * k);
      g.restore();
      g.fillStyle = '#374151'; g.beginPath(); g.arc(0, 0, 0.22 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ef4444'; g.beginPath(); g.arc(0, 0, 0.1 * k, 0, Math.PI * 2); g.fill();
    });
    // sallanan baltalar
    for (const p of c.pends) local(c, p.s, 0, (k) => {
      const u = K.pendU(p, t), low = K.pendLow(p, t), hw = K.PW / 2 + 0.3;
      g.fillStyle = '#334155'; g.fillRect(-0.12 * k, -hw * k, 0.24 * k, hw * 2 * k);
      g.strokeStyle = '#94a3b8'; g.lineWidth = 2 * DPR; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, u * k); g.stroke();
      const r = (low ? 0.42 : 0.3) * k;
      g.fillStyle = low ? '#ef4444' : 'rgba(239,68,68,.45)'; g.beginPath(); g.moveTo(-r, u * k - r); g.lineTo(r, u * k); g.lineTo(-r, u * k + r); g.closePath(); g.fill();
      g.fillStyle = '#e5e7eb'; g.beginPath(); g.arc(0, u * k, 0.1 * k, 0, Math.PI * 2); g.fill();
    });
    // eziciler
    for (const s of c.stomps) local(c, s.s, s.u, (k) => {
      const h = K.stompH(s, t), sh = 0.15 + h * 0.5;
      g.fillStyle = `rgba(0,0,0,${0.45 - h * 0.3})`; g.fillRect((-0.5 - sh) * k, (-s.wu / 2 - sh) * k, (1 + sh * 2) * k, (s.wu + sh * 2) * k);
      g.fillStyle = h < 0.3 ? '#b91c1c' : '#6b7280'; g.fillRect(-0.5 * k, -s.wu / 2 * k, 1 * k, s.wu * k);
      g.strokeStyle = h < 0.3 ? '#fca5a5' : '#9ca3af'; g.lineWidth = 2 * DPR; g.strokeRect(-0.5 * k, -s.wu / 2 * k, 1 * k, s.wu * k);
      g.fillStyle = '#fbbf24'; g.fillRect(-0.5 * k, -s.wu / 2 * k, 1 * k, 0.1 * k); g.fillRect(-0.5 * k, (s.wu / 2 - 0.1) * k, 1 * k, 0.1 * k);
    });
    // yuvarlanan kayalar
    for (const b of c.boulders) {
      const sb = K.boulderS(b, t), p = K.world(c, sb, b.u), x = sx(p.x), y = sy(p.y), r = b.r * k;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 3 * DPR, y + 4 * DPR, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#78716c'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#57534e'; g.lineWidth = 2 * DPR; g.beginPath(); g.arc(x, y, r * 0.55, sb * 2, sb * 2 + 2); g.stroke();
    }
  }

  function drawRunner(tm, now, DPR, { alpha = 1, label = '' } = {}) {
    const t = ctx.state().g.teams.find((x) => x.id === tm.id);
    const pl = pById(t.runner) || { look: null, color: '#888' };
    const d = dirs[tm.id] || { x: tm.x, y: tm.y, a: -Math.PI / 2 };
    if (tm.fall <= 0 && Math.hypot(tm.x - d.x, tm.y - d.y) > 0.01) d.a = Math.atan2(tm.y - d.y, tm.x - d.x);
    d.x = tm.x; d.y = tm.y; dirs[tm.id] = d;
    const x = sx(tm.x), y = sy(tm.y);
    const falling = tm.fall > 0, fk = falling ? Math.max(0.15, tm.fall / K.FALL_T) : 1;
    const r = K.R * cam.k * 1.15 * fk;
    const stun = tm.stun > 0;
    if (!falling) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + r * 0.8, r, r * 0.4, 0, 0, Math.PI * 2); g.fill(); }
    drawTopAvatar(g, pl.look, pl.color, x, y, r, d.a, { gun: false, alpha: falling ? fk * alpha : stun ? 0.45 + 0.4 * Math.abs(Math.sin(now / 80)) : alpha, spin: falling ? (K.FALL_T - tm.fall) * 9 : stun ? now / 90 : 0 });
    if (label && !falling) {
      g.font = `800 ${10 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.8)'; g.fillStyle = '#fff';
      g.strokeText(label, x, y - r * 1.3); g.fillText(label, x, y - r * 1.3);
    }
  }

  // İşaret: dokunuştan sonra ~1 sn görünür, sonra söner (age = işaretin yaşı sn)
  const pingAlpha = (age) => (age < 0 || age > K.PING_SHOW ? 0 : age < K.PING_SHOW - 0.4 ? 1 : (K.PING_SHOW - age) / 0.4);
  function drawPing(x, y, age, DPR, color = '#38bdf8', txt = '') {
    const al = pingAlpha(age);
    if (al <= 0) return;
    const px = sx(x), py = sy(y), ph = clamp(age / 0.6, 0, 1);
    g.save(); g.globalAlpha = al;
    g.strokeStyle = color; g.lineWidth = 3 * DPR;
    g.globalAlpha = al * (1 - ph); g.beginPath(); g.arc(px, py, (0.3 + ph * 1.2) * cam.k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = al;
    g.fillStyle = color; g.beginPath(); g.arc(px, py, 0.2 * cam.k, 0, Math.PI * 2); g.fill();
    if (txt) { g.font = `800 ${11 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff'; g.strokeText(txt, px, py + 0.3 * cam.k); g.fillText(txt, px, py + 0.3 * cam.k); }
    g.restore();
  }
  function arrowTo(fromX, fromY, x, y, color, DPR, al = 1) {
    const ax = sx(fromX), ay = sy(fromY), a = Math.atan2(sy(y) - ay, sx(x) - ax);
    const d = 0.75 * cam.k;
    g.save(); g.globalAlpha = al; g.translate(ax + Math.cos(a) * d, ay + Math.sin(a) * d); g.rotate(a);
    g.fillStyle = color; g.beginPath(); g.moveTo(12 * DPR, 0); g.lineTo(-6 * DPR, -8 * DPR); g.lineTo(-6 * DPR, 8 * DPR); g.closePath(); g.fill();
    g.restore();
  }

  // Bot rehber: periyodik kısa ipucu (sonraki şerit + yakın tehlikede "BEKLE")
  function botHint(st, tm) {
    const c = K.course(st.seed), age = st.el % HINT_PERIOD;
    if (age > HINT_SHOW || tm.done !== null) return null;
    let tu = 0;
    const wall = c.walls.find((o) => o.s > tm.s - 0.2 && o.s < tm.s + 5);
    if (wall) tu = wall.gaps.reduce((b, gp) => { const m = (gp[0] + gp[1]) / 2; return b === null || Math.abs(m - tm.u) < Math.abs(b - tm.u) ? m : b; }, null);
    const spn = c.spinners.find((o) => o.s > tm.s - 0.5 && o.s < tm.s + 5);
    if (spn) { const ws = K.widthAt(c, spn.s), left = spn.u - spn.len + ws / 2, right = ws / 2 - (spn.u + spn.len); tu = left > right ? -ws / 2 + left / 2 : ws / 2 - right / 2; }
    const bo = c.boulders.find((o) => tm.s > o.s0 - 3 && tm.s < o.s1);
    if (bo) tu = -bo.u;
    const s = Math.min(c.LEN - 0.5, tm.s + 3);
    tu = clamp(tu, -K.widthAt(c, s) / 2 + 0.4, K.widthAt(c, s) / 2 - 0.4);
    let danger = false;
    for (let i = 1; i <= 10 && !danger; i++) danger = !!K.hazardHit(c, tm.s + i * 0.25, tm.u, st.el + i * 0.08, K.R + 0.15);
    return { ...K.world(c, s, tu), age, danger };
  }

  function overlayCount(st, W, H, DPR) {
    if (st.phase !== 'count' && st.phase !== 'wait') return false;
    const n = st.phase === 'wait' ? '…' : String(Math.max(1, Math.ceil(st.cd)));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(90 * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff';
    g.strokeText(n, W / 2, H * 0.42); g.fillText(n, W / 2, H * 0.42);
    return true;
  }
  function drawMinimap(st, W, H, DPR, follow) {
    const c = K.course(st.seed), bb = bbox(c);
    const mw = Math.min(W * 0.26, 120 * DPR), mh = Math.min(H * 0.34, 190 * DPR), mx = 8 * DPR, my = 40 * DPR;
    const sc = Math.min(mw / (bb.x1 - bb.x0), mh / (bb.y1 - bb.y0));
    const X = (x) => mx + (x - bb.x0) * sc + (mw - (bb.x1 - bb.x0) * sc) / 2, Y = (y) => my + (y - bb.y0) * sc + (mh - (bb.y1 - bb.y0) * sc) / 2;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.roundRect(mx - 4 * DPR, my - 4 * DPR, mw + 8 * DPR, mh + 8 * DPR, 8 * DPR); g.fill();
    g.strokeStyle = '#64748b'; g.lineWidth = Math.max(2 * DPR, K.PW * sc); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i < c.n; i++) (i ? g.lineTo : g.moveTo).call(g, X(c.px[i]), Y(c.py[i])); g.stroke();
    g.fillStyle = '#38bdf8'; for (const cp of c.cps) { const f = K.frame(c, cp); g.fillRect(X(f.x) - 2 * DPR, Y(f.y) - 2 * DPR, 4 * DPR, 4 * DPR); }
    st.teams.forEach((tm, i) => { g.fillStyle = TEAM_COLORS[i % TEAM_COLORS.length]; g.beginPath(); g.arc(X(tm.x), Y(tm.y), (tm === follow ? 5 : 3.5) * DPR, 0, Math.PI * 2); g.fill(); });
    // ilerleme çubuğu
    const bx = mx + mw + 10 * DPR, bh = mh;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(bx, my, 6 * DPR, bh);
    st.teams.forEach((tm, i) => { const k = clamp(tm.s / c.LEN, 0, 1); g.fillStyle = TEAM_COLORS[i % TEAM_COLORS.length]; g.beginPath(); g.arc(bx + 3 * DPR, my + bh * (1 - k), (tm === follow ? 6 : 4) * DPR, 0, Math.PI * 2); g.fill(); });
  }

  function render2D(st, now, dt) {
    const { W, H, DPR } = ctx.size();
    if (!st) { g.fillStyle = VOID; g.fillRect(0, 0, W, H); return 'Bekleniyor…'; }
    const t = team(), r = role();
    const mine = t ? st.teams.find((x) => x.id === t.id) : null;
    const follow = mine || st.teams.slice().sort((a, b) => b.s - a.s)[0];
    if (!follow) return '';
    const sk = shakeT > now ? (Math.random() - 0.5) * 8 * DPR : 0;
    setCam(W, H, follow.x, follow.y, r !== 'kosucu');
    g.save(); g.translate(sk, sk);
    drawCourse(st, W, H, DPR, now);
    for (const tm of st.teams) if (tm !== follow) drawRunner(tm, now, DPR, { alpha: r === 'kosucu' ? 0 : 0.35 });
    const tInfo = ctx.state().g.teams.find((x) => x.id === follow.id);
    drawRunner(follow, now, DPR, { label: r === 'kosucu' ? 'SEN' : pName(tInfo.runner) });
    const hint = tInfo.botGuide && r === 'kosucu' && follow.done === null ? botHint(st, follow) : null;
    // sis: koşucu yalnızca etrafındaki küçük alanı görür
    if (r === 'kosucu') {
      const d = dirs[follow.id] || { a: -Math.PI / 2 };
      const fx = sx(follow.x) + Math.cos(d.a) * 0.6 * cam.k, fy = sy(follow.y) + Math.sin(d.a) * 0.6 * cam.k, R0 = 2.6 * cam.k;
      const gr = g.createRadialGradient(fx, fy, R0 * 0.5, fx, fy, R0);
      gr.addColorStop(0, 'rgba(5,7,14,0)'); gr.addColorStop(1, 'rgba(5,7,14,1)');
      g.fillStyle = gr; g.beginPath(); g.arc(fx, fy, R0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgb(5,7,14)'; g.beginPath(); g.rect(-20, -20, W + 40, H + 40); g.arc(fx, fy, R0, 0, Math.PI * 2, true); g.fill('evenodd');
      drawRunner(follow, now, DPR, { label: 'SEN' });
    }
    // rehberin işareti: dokunuştan sonra kısa süre görünür (sisin üstünde)
    const ping = follow.ping;
    if (ping) {
      const age = st.el - (ping[3] || 0), al = pingAlpha(age);
      if (al > 0) {
        drawPing(ping[0], ping[1], age, DPR, '#38bdf8', r === 'kosucu' ? `${pName(tInfo.guide)}` : '');
        if (r === 'kosucu') arrowTo(follow.x, follow.y, ping[0], ping[1], '#38bdf8', DPR, al);
      }
    }
    if (hint) {
      drawPing(hint.x, hint.y, hint.age, DPR, hint.danger ? '#f87171' : '#a3e635', hint.danger ? '✋ BEKLE' : '🤖');
      arrowTo(follow.x, follow.y, hint.x, hint.y, hint.danger ? '#f87171' : '#a3e635', DPR, pingAlpha(hint.age));
    }
    drawParts(dt, DPR);
    g.restore();
    if (overlayCount(st, W, H, DPR)) return r === 'kosucu' ? '🙈 Sadece önünü göreceksin!' : r === 'rehber' ? '🗺️ Koşucunu yönlendir!' : '📡 Herkes hazırlanıyor…';
    if (r !== 'kosucu') drawMinimap(st, W, H, DPR, follow);
    return hudText(st, W, H, DPR, mine, r, tInfo);
  }
  function hudText(st, W, H, DPR, mine, r, tInfo) {
    g.font = `900 ${18 * DPR}px system-ui`; g.textAlign = 'right'; g.textBaseline = 'top'; g.lineWidth = 4 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff';
    const txt = `⏱️ ${Math.max(0, st.el).toFixed(1)}`;
    g.strokeText(txt, W - 10 * DPR, 10 * DPR); g.fillText(txt, W - 10 * DPR, 10 * DPR);
    if (mine && mine.done !== null) return `🏁 Bitirdiniz! ${mine.done.toFixed(1)} sn`;
    if (mine && mine.fall > 0) return '😱 Düştün! Kontrol noktasına dönüyorsun';
    if (mine && mine.stun > 0) return '💥 Çarptın! Kontrol noktasına dönüyorsun';
    if (performance.now() < intro) return r === 'kosucu' ? (tInfo.botGuide ? '🤖 Yeşil işareti takip et' : `🗣️ ${pName(tInfo.guide)} seni yönlendirecek`) : r === 'rehber' ? '👆 Haritaya dokun: koşucuna kısa bir işaret gönder' : '';
    return r === 'izle' ? '👀 İzliyorsun' : '';
  }
  function drawParts(dt, DPR) {
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c;
      g.fillRect(sx(p.x) - 3 * DPR, sy(p.y) - 3 * DPR, 6 * DPR, 6 * DPR);
    }
    g.globalAlpha = 1;
  }

  // ---------- 3D (yalnızca koşucu) ----------
  async function ensure3D() {
    if (R3 || loading) return;
    loading = true;
    try { T = await loadThree(); R3 = build3D(); } catch (e) { console.error(e); ctx.toast('3D görünüm yüklenemedi'); ctx.setView('top'); }
    loading = false;
  }
  function canvasTex(THREE, draw, w = 64, h = 64) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  // Yol şeridi geometrisi: istasyon listesi (s değerleri) + atlanacak parça filtresi
  function ribbonGeo(THREE, c, stations, skip, { y = 0, skirt = 0 } = {}) {
    const pos = [], uv = [], idx = [], side = [];
    let vi = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
      const s0 = stations[i], s1 = stations[i + 1];
      if (skip && skip((s0 + s1) / 2)) continue;
      const f0 = K.frame(c, s0), f1 = K.frame(c, s1), h0 = K.widthAt(c, s0) / 2, h1 = K.widthAt(c, s1) / 2;
      const pts = [[f0.x + f0.nx * h0, f0.y + f0.ny * h0], [f0.x - f0.nx * h0, f0.y - f0.ny * h0], [f1.x + f1.nx * h1, f1.y + f1.ny * h1], [f1.x - f1.nx * h1, f1.y - f1.ny * h1]];
      pos.push(pts[0][0], y, pts[0][1], pts[1][0], y, pts[1][1], pts[2][0], y, pts[2][1], pts[3][0], y, pts[3][1]);
      uv.push(0, s0 / 2, 1, s0 / 2, 0, s1 / 2, 1, s1 / 2);
      idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); vi += 4;
      if (skirt) {
        for (const [a, b] of [[0, 2], [3, 1]]) {
          pos.push(pts[a][0], y, pts[a][1], pts[b][0], y, pts[b][1], pts[a][0], y - skirt, pts[a][1], pts[b][0], y - skirt, pts[b][1]);
          uv.push(0, 0, 1, 0, 0, 1, 1, 1);
          side.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3, vi, vi + 2, vi + 1, vi + 2, vi + 3, vi + 1); vi += 4;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx.concat(side));
    geo.addGroup(0, idx.length, 0); geo.addGroup(idx.length, side.length, 1);
    geo.computeVertexNormals();
    return geo;
  }
  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(VOID);
    scene.fog = new THREE.Fog(VOID, 1.6, 7.5); // karanlık: kısa görüş mesafesi
    const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
    scene.add(new THREE.HemisphereLight('#8fa3cc', '#0b0e1a', 0.9));
    const torch = new THREE.PointLight('#ffd9a0', 2.4, 8, 1.4); torch.position.y = 1.2; scene.add(torch);
    const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
    return { renderer, scene, cam, torch, mat, w: 0, h: 0, seed: null, course: null, avatars: new Map(), dyn: [], beacon: null, hintBeacon: null };
  }
  function buildCourse3D(c) {
    const THREE = T, { scene, mat } = R3;
    if (R3.course) { scene.remove(R3.course); }
    const root = new THREE.Group();
    const inBlink = (s) => c.blinks.some((b) => s > b.s0 && s < b.s1);
    const stations = []; for (let i = 0; i < c.n; i++) stations.push(i * K.DS);
    const roadTex = canvasTex(THREE, (x, w, h) => { x.fillStyle = ROAD; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, h / 2, w, 3); });
    const road = new THREE.Mesh(ribbonGeo(THREE, c, stations, inBlink, { skirt: 3 }), [mat('#ffffff', { map: roadTex }), mat('#1a2030')]);
    root.add(road);
    // kenar çizgileri (uçurum kenarı)
    const ep = [];
    for (let i = 0; i + 1 < c.n; i++) { const s0 = i * K.DS, s1 = s0 + K.DS; if (inBlink((s0 + s1) / 2)) continue; const f0 = K.frame(c, s0), f1 = K.frame(c, s1), h0 = K.widthAt(c, s0) / 2, h1 = K.widthAt(c, s1) / 2; for (const sg of [1, -1]) ep.push(f0.x + f0.nx * h0 * sg, 0.01, f0.y + f0.ny * h0 * sg, f1.x + f1.nx * h1 * sg, 0.01, f1.y + f1.ny * h1 * sg); }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    root.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: EDGE })));
    // sahte kollar
    for (const sb of c.stubs) { const m = new THREE.Mesh(new THREE.BoxGeometry(sb.len + 0.2, 0.3, sb.wd), mat('#2f3950')); m.position.set(sb.x + Math.cos(sb.a) * sb.len / 2, -0.15, sb.y + Math.sin(sb.a) * sb.len / 2); m.rotation.y = -sb.a; root.add(m); }
    // yerel çerçeve grubu: x = s yönü, z = u yönü
    const localG = (s, u = 0) => { const f = K.frame(c, s); const gr = new THREE.Group(); gr.position.set(f.x + f.nx * u, 0, f.y + f.ny * u); gr.rotation.y = -Math.atan2(f.ty, f.tx); root.add(gr); return gr; };
    // kontrol noktaları ve bitiş
    for (const cp of c.cps) {
      if (!cp) continue;
      const gr = localG(cp), hw = K.widthAt(c, cp) / 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, hw * 2), mat('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 0.6 })); bar.position.y = 0.015; gr.add(bar);
      for (const sg of [1, -1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat('#7dd3fc', { emissive: '#38bdf8', emissiveIntensity: 0.3 })); post.position.set(0, 0.6, sg * (hw + 0.15)); gr.add(post); }
    }
    {
      const gr = localG(c.LEN - 1.2), hw = K.PW / 2;
      const ck = canvasTex(THREE, (x, w, h) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * w / 4, j * h / 4, w / 4, h / 4); } });
      ck.repeat.set(1, 3);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, hw * 2), mat('#ffffff', { map: ck })); fl.rotation.x = -Math.PI / 2; fl.position.set(0.6, 0.02, 0); gr.add(fl);
      for (const sg of [1, -1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), mat('#e5e7eb')); post.position.set(0.6, 1.2, sg * (hw + 0.1)); gr.add(post); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, hw * 2 + 0.35), mat('#facc15', { emissive: '#facc15', emissiveIntensity: 0.4 })); top.position.set(0.6, 2.4, 0); gr.add(top);
    }
    // duvarlar
    const brick = canvasTex(THREE, (x, w, h) => { x.fillStyle = '#c2410c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#7c2d12'; x.lineWidth = 3; for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(0, r * 16); x.lineTo(w, r * 16); x.stroke(); for (let k = 0; k < 3; k++) { const bx = (k * 32 + (r % 2) * 16) % w; x.beginPath(); x.moveTo(bx, r * 16); x.lineTo(bx, r * 16 + 16); x.stroke(); } } });
    for (const w of c.walls) { const gr = localG(w.s); for (const [a, b] of w.segs) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, b - a), mat('#ffffff', { map: brick })); m.position.set(0, 0.5, (a + b) / 2); gr.add(m); } }
    // dinamik engeller
    const dyn = [];
    const hazTex = canvasTex(THREE, (x, w, h) => { x.fillStyle = '#dc2626'; x.fillRect(0, 0, w, h); x.fillStyle = '#fbbf24'; for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16 + 8, 0); x.lineTo(i * 16 + 24, h); x.lineTo(i * 16 + 16, h); x.fill(); } });
    for (const m of c.movers) { const gr = localG(m.s); const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, m.w), mat('#ffffff', { map: hazTex })); box.position.y = 0.4; gr.add(box); dyn.push({ k: 'mover', o: m, box }); }
    for (const s of c.spinners) {
      const gr = localG(s.s, s.u);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), mat('#374151')); hub.position.y = 0.25; gr.add(hub);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.08, 0.26), mat('#cbd5e1', { emissive: '#64748b', emissiveIntensity: 0.3 })); blade.position.y = 0.35; gr.add(blade);
      dyn.push({ k: 'spinner', o: s, blade });
    }
    for (const p of c.pends) {
      const gr = localG(p.s), hw = K.PW / 2 + 0.3, top = p.arm + 0.5;
      for (const sg of [1, -1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, top, 0.18), mat('#334155')); post.position.set(0, top / 2, sg * hw); gr.add(post); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, hw * 2 + 0.2), mat('#475569')); beam.position.y = top; gr.add(beam);
      const arm = new THREE.Group(); arm.position.y = top; gr.add(arm);
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.07, p.arm, 0.07), mat('#94a3b8')); rod.position.y = -p.arm / 2; arm.add(rod);
      const axe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.12), mat('#ef4444', { emissive: '#7f1d1d', emissiveIntensity: 0.5 })); axe.position.y = -p.arm + 0.1; arm.add(axe);
      dyn.push({ k: 'pend', o: p, arm });
    }
    for (const s of c.stomps) {
      const gr = localG(s.s, s.u);
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, s.wu), mat('#6b7280')); gr.add(block);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat('#374151')); shaft.position.y = 3; gr.add(shaft);
      dyn.push({ k: 'stomp', o: s, block, shaft });
    }
    for (const b of c.blinks) {
      const sts = [b.s0]; for (let i = Math.ceil(b.s0 / K.DS); i * K.DS < b.s1; i++) if (i * K.DS > b.s0) sts.push(i * K.DS); sts.push(b.s1);
      const m = new THREE.Mesh(ribbonGeo(THREE, c, sts, null, { skirt: 0.5 }), [mat('#2563eb', { emissive: '#1d4ed8', emissiveIntensity: 0.5 }), mat('#1e3a8a')]); root.add(m);
      dyn.push({ k: 'blink', o: b, m });
    }
    for (const b of c.belts) {
      const sts = [b.s0]; for (let i = Math.ceil(b.s0 / K.DS); i * K.DS < b.s1; i++) if (i * K.DS > b.s0) sts.push(i * K.DS); sts.push(b.s1);
      const tex = canvasTex(THREE, (x, w, h) => { x.fillStyle = '#2b3650'; x.fillRect(0, 0, w, h); x.strokeStyle = '#94a3b8'; x.lineWidth = 4; x.beginPath(); x.moveTo(8, 10); x.lineTo(32, 32); x.lineTo(8, 54); x.stroke(); });
      tex.repeat.set(3, 1);
      const m = new THREE.Mesh(ribbonGeo(THREE, c, sts, null, { y: 0.015 }), [mat('#ffffff', { map: tex }), mat('#000')]); root.add(m);
      dyn.push({ k: 'belt', o: b, tex });
    }
    for (const b of c.boulders) {
      const gr = new THREE.Group(); root.add(gr);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(b.r, 1), mat('#78716c', { flatShading: true })); rock.position.y = b.r; gr.add(rock);
      dyn.push({ k: 'boulder', o: b, gr, rock });
    }
    // işaret fenerleri (sisten etkilenmez: uzaktan görünür)
    const beaconMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.6, fog: false, depthWrite: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 10, 1, true), beaconMat); beacon.position.y = 4; beacon.visible = false; root.add(beacon);
    const hintBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 10, 1, true), beaconMat.clone()); hintBeacon.position.y = 4; hintBeacon.visible = false; root.add(hintBeacon);
    scene.add(root);
    R3.course = root; R3.seed = c.seed; R3.dyn = dyn; R3.beacon = beacon; R3.hintBeacon = hintBeacon;
    for (const a of R3.avatars.values()) scene.remove(a.grp);
    R3.avatars.clear();
  }
  function avatar3(id) {
    let a = R3.avatars.get(id);
    if (a) return a;
    const p = pById(id);
    const av = buildAvatar(T, p && p.look, p ? p.color : '#888', { gun: false });
    const grp = new T.Group(); av.root.scale.setScalar(0.55); grp.add(av.root);
    const label = makeLabel(T, id === playerId ? 'SEN' : p ? p.name : '?', p ? p.color : '#fff');
    label.position.y = 0.95; label.scale.set(0.8, 0.2, 1); grp.add(label);
    R3.scene.add(grp);
    a = { grp, av, label, last: null, yaw: -Math.PI / 2 };
    R3.avatars.set(id, a);
    return a;
  }
  function updateDyn(c, t, now) {
    for (const d of R3.dyn) {
      if (d.k === 'mover') d.box.position.z = K.moverU(d.o, t);
      else if (d.k === 'spinner') d.blade.rotation.y = -K.spinA(d.o, t);
      else if (d.k === 'pend') d.arm.rotation.x = -K.pendTheta(d.o, t);
      else if (d.k === 'stomp') { const h = K.stompH(d.o, t); d.block.position.y = 0.45 + h * 2.0; d.shaft.position.y = d.block.position.y + 1.95; d.block.material.color.set(h < 0.3 ? '#b91c1c' : '#6b7280'); }
      else if (d.k === 'blink') { const on = K.blinkOn(d.o, t), left = K.blinkLeft(d.o, t); d.m.visible = on; if (on) d.m.material[0].emissiveIntensity = left < 0.6 && Math.floor(now / 90) % 2 === 0 ? 0.1 : 0.5; }
      else if (d.k === 'belt') d.tex.offset.x = -(t * d.o.v * 0.6) % 1;
      else if (d.k === 'boulder') { const sb = K.boulderS(d.o, t), f = K.frame(c, sb); d.gr.position.set(f.x + f.nx * d.o.u, 0, f.y + f.ny * d.o.u); d.gr.rotation.y = -Math.atan2(f.ty, f.tx); d.rock.rotation.z = sb / d.o.r; }
    }
  }
  function render3D(st, now, dt, view) {
    const sz = ctx.size3();
    if (sz.w !== R3.w || sz.h !== R3.h) { R3.renderer.setSize(sz.w, sz.h, false); R3.cam.aspect = sz.w / sz.h; R3.cam.updateProjectionMatrix(); R3.w = sz.w; R3.h = sz.h; }
    const { W, H, DPR } = ctx.size();
    g.clearRect(0, 0, W, H);
    if (!st) { R3.renderer.render(R3.scene, R3.cam); return 'Bekleniyor…'; }
    const c = K.course(st.seed);
    if (R3.seed !== st.seed) buildCourse3D(c);
    updateDyn(c, st.el, now);
    const t = team(), mine = t ? st.teams.find((x) => x.id === t.id) : null;
    const me = mine || st.teams.slice().sort((a, b) => b.s - a.s)[0];
    const tInfo = me && ctx.state().g.teams.find((x) => x.id === me.id);
    for (const tm of st.teams) {
      const info = ctx.state().g.teams.find((x) => x.id === tm.id);
      const a = avatar3(info.runner);
      a.grp.visible = tm === me && !(view === 'fps' && tm.fall <= 0); // diğer takımlar 2D'deki gibi görünmez
      const moving = a.last && tm.fall <= 0 && Math.hypot(tm.x - a.last.x, tm.y - a.last.y) > 0.002;
      if (moving) a.yaw = Math.atan2(tm.y - a.last.y, tm.x - a.last.x);
      a.last = { x: tm.x, y: tm.y };
      const fallK = tm.fall > 0 ? (K.FALL_T - tm.fall) : 0;
      a.grp.position.set(tm.x, -fallK * fallK * 9, tm.y);
      let d = -a.yaw - a.grp.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.grp.rotation.y += d * Math.min(1, dt * 14);
      a.grp.rotation.x = fallK * 3;
      a.av.root.visible = !(tm.stun > 0 && Math.floor(now / 80) % 2 === 0);
      a.label.visible = tm !== me;
      animateAvatar(a.av, now / 1000, { walk: moving ? 1 : 0 });
    }
    const cam = R3.cam;
    if (me) {
      const a = avatar3(tInfo.runner);
      if (!cam3.init) { cam3.yaw = a.yaw; cam3.init = true; }
      if (view === 'chase') { let d = a.yaw - cam3.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (a.last && me.fall <= 0) cam3.yaw += d * Math.min(1, dt * 3); }
      const fx = Math.cos(cam3.yaw), fy = Math.sin(cam3.yaw);
      let px, py, pz, lx, ly, lz;
      if (view === 'fps') { px = me.x + fx * 0.1; py = 0.62; pz = me.y + fy * 0.1; lx = me.x + fx * 4; ly = 0.5; lz = me.y + fy * 4; }
      else { px = me.x - fx * 2.4; py = 1.7; pz = me.y - fy * 2.4; lx = me.x + fx * 1.5; ly = 0.45; lz = me.y + fy * 1.5; }
      const k = view === 'fps' || !cam3.pos ? 1 : 1 - Math.pow(0.002, dt);
      cam3.pos = cam3.pos || { x: px, y: py, z: pz };
      cam3.pos.x = lerp(cam3.pos.x, px, k); cam3.pos.y = lerp(cam3.pos.y, py, k); cam3.pos.z = lerp(cam3.pos.z, pz, k);
      cam.position.set(cam3.pos.x, cam3.pos.y, cam3.pos.z);
      if (me.fall > 0) { const fk = K.FALL_T - me.fall; cam.position.y -= fk * fk * (view === 'fps' ? 9 : 4); ly -= fk * fk * 9; }
      if (shakeT > now) cam.position.x += (Math.random() - 0.5) * 0.08;
      cam.lookAt(lx, ly, lz);
      R3.torch.position.set(me.x, 1.2, me.y);
      // işaret fenerleri + ekranda yön oku
      const beacons = [];
      const ping = me.ping;
      if (ping) { const age = st.el - (ping[3] || 0), al = pingAlpha(age); R3.beacon.visible = al > 0; if (al > 0) { R3.beacon.position.set(ping[0], 4, ping[1]); R3.beacon.material.opacity = 0.6 * al; R3.beacon.material.color.set('#38bdf8'); beacons.push({ x: ping[0], y: ping[1], al, color: '#38bdf8', txt: pName(tInfo.guide) }); } }
      else R3.beacon.visible = false;
      const hint = tInfo.botGuide && role() === 'kosucu' && me.done === null ? botHint(st, me) : null;
      R3.hintBeacon.visible = !!hint;
      if (hint) { R3.hintBeacon.position.set(hint.x, 4, hint.y); R3.hintBeacon.material.opacity = 0.6 * pingAlpha(hint.age); R3.hintBeacon.material.color.set(hint.danger ? '#f87171' : '#a3e635'); beacons.push({ x: hint.x, y: hint.y, al: pingAlpha(hint.age), color: hint.danger ? '#f87171' : '#a3e635', txt: hint.danger ? '✋ BEKLE' : '🤖' }); }
      for (const b of beacons) {
        const ang = Math.atan2(b.y - me.y, b.x - me.x) - cam3.yaw, dist = Math.hypot(b.y - me.y, b.x - me.x);
        g.save(); g.globalAlpha = b.al; g.translate(W / 2, H * 0.3); g.rotate(ang - Math.PI / 2);
        g.fillStyle = b.color; g.beginPath(); g.moveTo(0, -26 * DPR); g.lineTo(-12 * DPR, -4 * DPR); g.lineTo(12 * DPR, -4 * DPR); g.closePath(); g.fill();
        g.restore();
        g.save(); g.globalAlpha = b.al; g.font = `800 ${12 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff';
        const txt = `${b.txt} · ${dist.toFixed(0)} m`; g.strokeText(txt, W / 2, H * 0.3 + 8 * DPR); g.fillText(txt, W / 2, H * 0.3 + 8 * DPR); g.restore();
      }
    }
    R3.renderer.render(R3.scene, cam);
    if (overlayCount(st, W, H, DPR)) return '🙈 Karanlıkta sadece önünü göreceksin!';
    return hudText(st, W, H, DPR, mine, role(), tInfo);
  }

  const spec = {
    kind: 'kor', mod: K, views,
    controls: { left: 'stick', below: true, buttons: [] },
    showControls: (s) => roleOf(s) === 'kosucu',
    onState(s) {
      // rehber/izleyici her zaman 2D haritayı görür: görünüm listesi yerinde daraltılır (app.js düğmeyi gizler)
      const runner = roleOf(s) === 'kosucu';
      if (!runner && views.length > 1) views.length = 1;
      else if (runner && views.length === 1) views.push('chase', 'fps');
    },
    input(c, view) {
      if (role() === 'rehber') return myPing ? { ping: myPing } : {};
      if (view === 'top' || !R3) return { x: c.x, y: c.y };
      // 3D: çubuk kameraya göre (ileri = kameranın baktığı yön)
      const fwd = -c.y, h = cam3.yaw, now = performance.now(), idt = Math.min(0.1, (now - lastIn) / 1000);
      lastIn = now;
      if (view === 'fps') {
        if (Math.abs(c.x) > 0.25) cam3.yaw += c.x * 2.6 * idt;
        return { x: fwd * Math.cos(h), y: fwd * Math.sin(h) };
      }
      return { x: fwd * Math.cos(h) - c.x * Math.sin(h), y: fwd * Math.sin(h) + c.x * Math.cos(h) };
    },
    pointer(type, ev, target, st) {
      if (type !== 'down' || role() !== 'rehber' || !st) return;
      const now = performance.now();
      if (now - lastTap < 500) return; // hız sınırı
      lastTap = now;
      const { DPR } = ctx.size();
      const c = K.course(st.seed), bb = bbox(c);
      const wx = (ev.offsetX * DPR - cam.ox) / cam.k, wy = (ev.offsetY * DPR - cam.oy) / cam.k;
      myPing = [Math.round(clamp(wx, bb.x0, bb.x1) * 10) / 10, Math.round(clamp(wy, bb.y0, bb.y1) * 10) / 10, ++pingN];
      sfx('pop');
    },
    setBot: (sim, id) => { for (const tm of sim.teams) if (tm.runner === id) tm.botRunner = true; },
    interp(a, b, k) {
      const c = K.course(b.seed);
      return { ...b, el: lerp(a.el, b.el, k), teams: b.teams.map((tb) => { const ta = a.teams.find((x) => x.id === tb.id) || tb; if (Math.abs(tb.s - ta.s) > 2 || tb.fall > 0) return tb; const s = lerp(ta.s, tb.s, k), u = lerp(ta.u, tb.u, k); return { ...tb, s, u, ...K.world(c, s, u) }; }) };
    },
    onEvents(evs) {
      const t = team();
      for (const e of evs) {
        if (e.e === 'beep') sfx('tick');
        if (e.e === 'go') { sfx('finish'); intro = performance.now() + 4500; }
        if (e.e === 'hit' || e.e === 'fall') {
          sfx(e.e === 'hit' ? 'crash' : 'fall');
          for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 3; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.4, c: e.e === 'hit' ? (Math.random() < 0.5 ? '#fbbf24' : '#f87171') : '#94a3b8' }); }
          if (t && e.team === t.id) { shakeT = performance.now() + 450; if (navigator.vibrate) navigator.vibrate(120); }
        }
        if (e.e === 'respawn' && t && e.team === t.id) sfx('pop');
        if (e.e === 'cp' && t && e.team === t.id) sfx('score');
        if (e.e === 'ping' && t && e.team === t.id && role() === 'kosucu') sfx('pop');
        if (e.e === 'finish') sfx(t && e.team === t.id ? 'fanfare' : 'score');
      }
    },
    render(st, now, dt, view) {
      if (role() !== 'kosucu') {
        // rehber/izleyici: her zaman 2D harita. 3D tuvalde eski kare kalmasın
        if (!cv3Cleared && ctx.cv3) { cv3Cleared = true; try { if (!R3) ctx.cv3.width = ctx.cv3.width; } catch {} }
        return render2D(st, now, dt);
      }
      if (view !== 'top') { if (!R3) { ensure3D(); return render2D(st, now, dt); } return render3D(st, now, dt, view); }
      return render2D(st, now, dt);
    },
    ready3D: () => !!R3 && role() === 'kosucu',
    panel(st) {
      const s = ctx.state();
      if (!st || !s.g.teams) return '<div class="status"><small>Oyun birazdan başlıyor…</small></div>';
      const c = K.course(st.seed);
      const face = (id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">`; };
      const rows = st.teams.slice().sort((a, b) => (a.done ?? 1e6 - a.s) - (b.done ?? 1e6 - b.s)).map((tm) => {
        const t = s.g.teams.find((x) => x.id === tm.id);
        const pct = Math.round(clamp(tm.s / c.LEN, 0, 1) * 100);
        return `<span class="chip${t.members.includes(playerId) ? ' cur' : ''}">🏃${face(t.runner)}🗺️${face(t.guide)} ${tm.done !== null ? `🏁 ${tm.done.toFixed(1)}s` : `${pct}%`}${tm.hits ? ` 💥${tm.hits}` : ''}</span>`;
      });
      return `<div class="race-board">${rows.join('')}</div>`;
    },
    hud(st) {
      const r = role(), t = team(), mine = st && t ? st.teams.find((x) => x.id === t.id) : null;
      const extra = mine ? ` · 🚩<b>${mine.cp || 0}</b>${mine.hits ? ` 💥<b>${mine.hits}</b>` : ''}` : '';
      return (r === 'kosucu' ? '🏃 Koşucu' : r === 'rehber' ? '🗺️ Rehber' : '👀 İzleyici') + extra;
    },
    dispose() { if (R3) { R3.renderer.dispose(); R3 = null; } },
  };
  return createRealtime(ctx, spec);
}
