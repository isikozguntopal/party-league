// 🪨 Sapan Arenası istemcisi: üstten 2D görünüm + birinci şahıs (FPS) 3D görünüm
// Yerleşme turunda joystick ile yürünür, ⟲/⟳ ile nişan döndürülür; nişan önizlemesi noktalı bir
// kavis (lob) olarak gösterilir. Açılışta taş kavis çizerek uçar, çarpınca toz bulutu ve sarsıntı olur.
import * as LZ from '../games/lazer.js';
import { clamp, lerp, easeOut, easeIn, easeInOut, easeOutBack, sfx } from './util.js';
import { drawTopAvatar } from './avatar2d.js';
import { loadThree, buildAvatar, animateAvatar, makeLabel } from './avatar3d.js';
import { createControls } from './controls.js';

const SHRINK_MS = 1500;
const EYE = 0.29;          // göz yüksekliği (dünya birimi)
const AV_SCALE = 0.28;     // 3D karakter ölçeği (gövde ≈ 2*BODY_R)
const WALK_SPEED = 0.42;   // yürüme hızı (birim/sn, tam boy arenada)
const TURN_SPEED = 2.4;    // nişan döndürme hızı (rad/sn)
const LIFT = 0.55;         // 2D'de yükseklik → ekranda yukarı kayma oranı
const MISS_MS = 420;       // ıskalayan taşın kenardan aşağı düşüş süresi
const STONE_C = '#d6cdbf', STONE_D = '#5e554b';

export function createLazer(ctx) {
  const { pById, pName, playerId } = ctx;
  let my = { x: 0, y: 0.5, a: -Math.PI / 2, r: LZ.DEFAULT_RANGE };
  let myKey = null;
  let anim = null;
  let drag = null;
  let parts = [], bumps = [];
  let shakeAmp = 0, shakeT0 = 0, shakeDur = 1;
  const arenaAnim = { from: 1, to: 1, t0: 0 };
  let phaseT0 = 0, lastPhase = null;
  let walkAmt = 0, stepT = 0, keyRot = 0, ctlShown = null;

  // ---------- Kumanda: joystick = yürü, ⟲/⟳ = nişanı döndür, −/+ = menzil (yalnızca yerleşme turunda) ----------
  const ctl = createControls(ctx.stage, { left: 'stick', buttons: [
    { id: 'ccw', label: '⟲', cls: 'sapan-rot' }, { id: 'cw', label: '⟳', cls: 'sapan-rot' },
    { id: 'near', label: '−', cls: 'sapan-rng' }, { id: 'far', label: '+', cls: 'sapan-rng' },
  ] });
  const ctlRoot = ctx.stage.lastElementChild;
  if (ctlRoot && ctlRoot.classList.contains('ctl')) ctlRoot.classList.add('sapan-ctl');
  ctl.show(false);
  const RANGE_SPEED = 0.8; // menzil değişimi (birim/sn)
  const keyMap = { KeyQ: -1, KeyE: 1 }, rngMap = { KeyF: -1, KeyR: 1 };
  let keyRng = 0;
  const onKeyDown = (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (keyMap[e.code]) { keyRot = keyMap[e.code]; e.preventDefault(); }
    if (rngMap[e.code]) { keyRng = rngMap[e.code]; e.preventDefault(); }
  };
  const onKeyUp = (e) => { if (keyMap[e.code] === keyRot) keyRot = 0; if (rngMap[e.code] === keyRng) keyRng = 0; };
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);

  function applyControls(dt, sc, view) {
    const c = ctl.read();
    const rot = (c.btn.cw ? 1 : 0) - (c.btn.ccw ? 1 : 0) + keyRot;
    if (rot) my.a += clamp(rot, -1, 1) * TURN_SPEED * dt;
    const rng = (c.btn.far ? 1 : 0) - (c.btn.near ? 1 : 0) + keyRng;
    if (rng) my.r = clamp(my.r + clamp(rng, -1, 1) * RANGE_SPEED * dt, LZ.MIN_RANGE, LZ.MAX_RANGE);
    let mx = c.x, mz = c.y;
    const L = Math.hypot(mx, mz);
    if (L > 1) { mx /= L; mz /= L; }
    if (L > 0.06) {
      let dx, dy;
      if (view === 'fps') {
        // İleri = baktığım yön, sağ = bakışın sağı
        const ca = Math.cos(my.a), sa = Math.sin(my.a), f = -mz, r = mx;
        dx = ca * f - sa * r; dy = sa * f + ca * r;
      } else { dx = mx; dy = mz; }
      const sp = WALK_SPEED * (0.55 + 0.45 * sc) * dt;
      const p = LZ.walk(my.x, my.y, dx * sp, dy * sp, sc);
      my.x = p.x; my.y = p.y;
      walkAmt = lerp(walkAmt, Math.min(1, L), 0.3);
      stepT += dt;
      if (stepT > 0.3) { stepT = 0; sfx('step'); }
    } else { walkAmt = lerp(walkAmt, 0, 0.2); stepT = 0.2; }
  }

  // ---------- Zaman çizelgesi ----------
  function timeline(e) {
    if (e._tl) return e._tl;
    const slots = [], shotIndex = {}, moves = {}, outAt = {}, plans = [];
    let t = LZ.INTRO_MS;
    e.shots.forEach((s, i) => {
      slots.push(t);
      shotIndex[s.by] = i;
      const plan = LZ.shotPlan(s);
      plans.push(plan);
      plan.moves.forEach((m, k) => {
        const mv = { ...m, t0: t + m.t0, t1: t + m.t1, i, k };
        (moves[m.id] = moves[m.id] || []).push(mv);
        if (m.fell) outAt[m.id] = mv.t1 + LZ.FALL_MS;
      });
      t += plan.dur;
    });
    return (e._tl = { slots, shotIndex, moves, outAt, plans, total: t + LZ.OUTRO_MS });
  }
  function stateAt(e, tl, id, t) {
    const p = e.placements[id];
    let x = p.x, y = p.y, fall = 0, slide = null, dir = null;
    for (const m of tl.moves[id] || []) {
      if (t <= m.t0) break;
      if (t < m.t1) {
        const k = easeOut((t - m.t0) / (m.t1 - m.t0));
        x = lerp(m.fx, m.tx, k); y = lerp(m.fy, m.ty, k);
        slide = { fx: m.fx, fy: m.fy, k };
        break;
      }
      x = m.tx; y = m.ty;
      if (m.fell) {
        fall = clamp((t - m.t1) / LZ.FALL_MS, 0, 1);
        const len = Math.hypot(m.tx - m.fx, m.ty - m.fy) || 1;
        dir = { x: (m.tx - m.fx) / len, y: (m.ty - m.fy) / len };
      }
    }
    return { x, y, a: p.a, r: LZ.cleanRange(p.r), fall, slide, dir };
  }

  // Bir turun t anındaki sahnesi (2D ve 3D aynı veriyi çizer)
  function sceneAt(e, t, live) {
    const tl = timeline(e);
    const ids = e.order.filter((id) => e.placements[id]);
    let cur = null;
    if (live) e.shots.forEach((sh, i) => { if (t >= tl.slots[i] && t < tl.slots[i] + tl.plans[i].dur) cur = sh.by; });
    const players = ids.map((id, idx) => {
      const s = stateAt(e, tl, id, t);
      const pop = live ? clamp((t - idx * 70) / 420, 0, 1) : 1;
      let recoil = 0;
      const si = tl.shotIndex[id];
      if (live && si !== undefined) { const dt = t - tl.slots[si]; if (dt >= 0 && dt < 180) recoil = 0.018 * Math.sin((dt / 180) * Math.PI); }
      let aim = 0, grow = 1;
      if (s.fall === 0) {
        aim = 0.6;
        if (live && si !== undefined) aim *= 1 - clamp((t - tl.slots[si]) / 250, 0, 1);
        grow = live ? easeOut(clamp((t - 350 - idx * 60) / 650, 0, 1)) : 1;
      }
      return { id, ...s, pop, recoil, ring: id === cur, aim, grow };
    });
    const tracers = [];
    if (live) {
      e.shots.forEach((sh, i) => {
        const t0 = tl.slots[i];
        if (t < t0) return;
        const dt = t - t0, fly = tl.plans[i].fly;
        tracers.push({
          i, dt, fly, hit: sh.hit, x1: sh.x1, y1: sh.y1, x2: sh.x2, y2: sh.y2, a: e.placements[sh.by].a, sc: e.scale,
          flash: dt < 140 ? 1 - dt / 140 : 0,
          impact: sh.hit && dt >= fly && dt < fly + 420 ? (dt - fly) / 420 : -1,
        });
      });
    }
    return { tl, players, tracers, cur };
  }

  // Taşın t anındaki konumu (uçuş kavisi; ıskalarsa kenardan aşağı düşer). Yoksa null.
  function stoneAt(tr, dt) {
    if (dt < 0) return null;
    if (dt < tr.fly) {
      const k = dt / tr.fly;
      return { ...LZ.arcPoint(tr.x1, tr.y1, tr.x2, tr.y2, k, tr.hit ? LZ.STONE_H : 0.02), alpha: 1, off: false };
    }
    if (tr.hit) return null;
    const q = (dt - tr.fly) / MISS_MS;
    if (q >= 1) return null;
    // menzilin sonunda yere düşer, biraz yuvarlanıp kaybolur (platform dışındaysa aşağı düşer)
    const onPf = LZ.onPlatform(tr.x2, tr.y2, tr.sc || 1);
    const roll = onPf ? 0.08 * easeOut(q) : q * 0.22;
    return { x: tr.x2 + Math.cos(tr.a) * roll, y: tr.y2 + Math.sin(tr.a) * roll, z: onPf ? 0.02 : 0.02 - q * q * 0.7, alpha: 1 - q * q, off: !onPf };
  }
  const TRAIL = 6;
  function trailOf(tr) {
    const out = [];
    for (let j = 1; j <= TRAIL; j++) { const st = stoneAt(tr, tr.dt - j * 26); if (!st || st.off) break; out.push({ ...st, alpha: 0.45 * (1 - j / (TRAIL + 1)) }); }
    return out;
  }

  function startAnim(entry, skipMs) {
    anim = { entry, t0: performance.now() - skipMs, fired: new Set() };
    const tl = timeline(entry);
    if (skipMs > 200) anim.fired.add('reveal');
    entry.shots.forEach((s, i) => {
      if (tl.slots[i] < skipMs) anim.fired.add('s' + i);
      if (tl.slots[i] + tl.plans[i].fly < skipMs) anim.fired.add('h' + i);
    });
    for (const ms of Object.values(tl.moves)) for (const m of ms) {
      if (m.t0 < skipMs) anim.fired.add(`c${m.i}_${m.k}`);
      if (m.t1 < skipMs) anim.fired.add(`f${m.i}_${m.k}`);
    }
  }

  function burst(x, y, color, n, speed, life, size = 0.008, z = LZ.STONE_H) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random());
      parts.push({ x, y, z, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 0.4 + Math.random() * 0.8, life: 0, max: life * (0.6 + Math.random() * 0.6), c: color, r: size * (0.6 + Math.random()) });
    }
  }
  const shake = (amp, dur) => { shakeAmp = amp; shakeT0 = performance.now(); shakeDur = dur; };

  // Olaylar (ses, toz, sarsıntı) — görünümden bağımsız tetiklenir
  function fireEvents(e, t, now) {
    const tl = timeline(e);
    if (!anim.fired.has('reveal')) { anim.fired.add('reveal'); sfx('reveal'); }
    e.shots.forEach((sh, i) => {
      if (t >= tl.slots[i] && !anim.fired.has('s' + i)) { anim.fired.add('s' + i); sfx('shot'); }
      if (t >= tl.slots[i] + tl.plans[i].fly && !anim.fired.has('h' + i)) {
        anim.fired.add('h' + i);
        if (sh.hit) {
          sfx('hit'); shake(6, 300);
          burst(sh.x2, sh.y2, '#e7dccb', 16, 0.9, 0.5, 0.009);           // toz bulutu
          burst(sh.x2, sh.y2, '#8c8275', 6, 0.5, 0.6, 0.012);            // taş kırıntıları
          burst(sh.x2, sh.y2, pById(sh.hit)?.color || '#fff', 8, 0.6, 0.5, 0.01);
        } else { sfx('drop'); burst(sh.x2, sh.y2, '#cfc6b8', 5, 0.35, 0.35, 0.006, 0.03); }
      }
    });
    for (const ms of Object.values(tl.moves)) for (const m of ms) {
      if (m.k > 0 && t >= m.t0 && !anim.fired.has(`c${m.i}_${m.k}`)) {
        anim.fired.add(`c${m.i}_${m.k}`); sfx('bump'); shake(3, 180);
        const prev = tl.plans[m.i].moves[m.k - 1];
        const cx = (prev.tx + m.fx) / 2, cy = (prev.ty + m.fy) / 2;
        burst(cx, cy, '#ffffff', 10, 0.7, 0.35, 0.007);
        bumps.push({ x: cx, y: cy, t0: now });
      }
      if (m.fell && t >= m.t1 && !anim.fired.has(`f${m.i}_${m.k}`)) { anim.fired.add(`f${m.i}_${m.k}`); sfx('fall'); }
    }
  }

  function bannerFor(e, t, s) {
    const tl = timeline(e);
    if (t < LZ.INTRO_MS) return '👀 Herkes görünüyor!';
    const i = tl.slots.findIndex((t0, k) => t >= t0 && t < t0 + tl.plans[k].dur);
    if (i >= 0) {
      const sh = e.shots[i], dt = t - tl.slots[i], plan = tl.plans[i];
      const cur = plan.moves.find((m) => dt >= m.t0 && dt < m.t1);
      const fell = plan.moves.filter((m) => m.fell && dt > m.t1 - 150).map((m) => pName(m.id));
      if (dt < plan.fly + 120) return `🪨 ${pName(sh.by)} taş fırlatıyor`;
      if (!sh.hit) return `💨 ${pName(sh.by)} ıskaladı`;
      if (fell.length) return `🕳️ ${fell.join(' ve ')} aşağı düştü!`;
      if (cur && cur !== plan.moves[0]) return `🎱 ${pName(plan.moves[plan.moves.indexOf(cur) - 1].id)} → ${pName(cur.id)} çarpıştı!`;
      return `💥 ${pName(sh.by)}, ${pName(sh.hit)} oyuncusunu itti`;
    }
    const falls = e.shots.reduce((n, x) => n + x.moves.filter((m) => m.fell).length, 0);
    return falls ? `Bu tur ${falls} kişi düştü` : 'Kimse düşmedi!';
  }

  // ---------- Platform ölçeği ----------
  function targetScale() {
    const s = ctx.state();
    if (anim) return anim.entry.scale;
    if (s.status !== 'playing' && s.last && s.last.kind === 'lazer') return s.last.scale;
    return LZ.arenaScale(s.round);
  }
  const shownScale = (now) => lerp(arenaAnim.from, arenaAnim.to, easeInOut(clamp((now - arenaAnim.t0) / SHRINK_MS, 0, 1)));
  function updateScale(now) {
    const target = targetScale();
    if (Math.abs(target - arenaAnim.to) > 1e-6) {
      arenaAnim.from = shownScale(now);
      arenaAnim.to = target;
      arenaAnim.t0 = now;
      if (target < arenaAnim.from) { sfx('shrink'); shake(4, 500); }
    }
    return shownScale(now);
  }
  const shrinking = (now) => arenaAnim.to < arenaAnim.from && now - arenaAnim.t0 < SHRINK_MS + 300;

  // Nişan önizlemesi: düz hat boyunca örnek noktalar (2D ve 3D ortak); menzilde ya da kenarda biter
  function aimDots(x, y, a, sc, grow, range = LZ.MAX_RANGE) {
    const edge = LZ.wallHit(x, y, a, sc);
    const w = range < edge.t ? { x: x + Math.cos(a) * range, y: y + Math.sin(a) * range, t: range, edge: false } : { ...edge, edge: true };
    const n = clamp(Math.round(w.t / 0.05), 5, 36);
    const hmax = LZ.STONE_H + LZ.arcHeight(w.t);
    const dots = [];
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (k > grow) break;
      const pt = LZ.arcPoint(x, y, w.x, w.y, k, 0.02);
      dots.push({ ...pt, k, hf: pt.z / hmax });
    }
    return { dots, end: w, done: grow > 0.98 };
  }

  // ======================================================================
  // 2D ÜSTTEN GÖRÜNÜM
  // ======================================================================
  let W = 0, H = 0, DPR = 1, S = 0, SC = 0, bg = null, floor = null, fog = null;
  const g = ctx.g2d;
  const toS = (x, y) => [W / 2 + x * SC, H / 2 + y * SC];

  function ensure2D() {
    const sz = ctx.size();
    if (sz.W === W && sz.H === H && bg) return;
    ({ W, H, DPR } = sz);
    S = Math.min(W, H);
    SC = S / 2 / 1.12;
    bg = buildBackground(); floor = buildFloor(); fog = buildFog();
  }
  function octPath(c, scale, dy = 0) {
    const v = LZ.octagonVertices(LZ.ARENA_R * scale);
    c.beginPath();
    v.forEach(([x, y], i) => { const [sx, sy] = toS(x, y); i ? c.lineTo(sx, sy + dy) : c.moveTo(sx, sy + dy); });
    c.closePath();
  }
  function hexPath(c, r, rot = 0) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + i * Math.PI / 3;
      const [sx, sy] = toS(Math.cos(a) * r, Math.sin(a) * r);
      i ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
    }
    c.closePath();
  }
  function buildBackground() {
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    const c = oc.getContext('2d');
    const gr = c.createRadialGradient(W / 2, H * 0.55, S * 0.05, W / 2, H / 2, Math.max(W, H) * 0.8);
    gr.addColorStop(0, '#1d2a52'); gr.addColorStop(0.5, '#0f1630'); gr.addColorStop(1, '#04060d');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(170,190,255,${0.05 + Math.random() * 0.18})`;
      c.beginPath(); c.arc(Math.random() * W, Math.random() * H, (0.4 + Math.random() * 1.3) * DPR, 0, Math.PI * 2); c.fill();
    }
    return oc;
  }
  function buildFog() {
    const oc = document.createElement('canvas'); oc.width = oc.height = 256;
    const c = oc.getContext('2d');
    const gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(120,150,230,.16)'); gr.addColorStop(1, 'rgba(120,150,230,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    return oc;
  }
  function buildFloor() {
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    const c = oc.getContext('2d');
    octPath(c, 1);
    const fg = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, SC);
    fg.addColorStop(0, '#8296b2'); fg.addColorStop(1, '#4c6082');
    c.fillStyle = fg; c.fill();
    c.save(); octPath(c, 1); c.clip();
    const step = 0.034 * SC;
    c.lineWidth = Math.max(1, 0.0045 * SC);
    for (const [col, off] of [['rgba(15,25,45,.33)', 0], ['rgba(255,255,255,.11)', c.lineWidth]]) {
      c.strokeStyle = col; c.beginPath();
      for (let k = -H; k < W + H; k += step) { c.moveTo(k + off, 0); c.lineTo(k + off - H, H); c.moveTo(k + off, 0); c.lineTo(k + off + H, H); }
      c.stroke();
    }
    hexPath(c, 0.34, Math.PI / 6); hexPath(c, 0.22, Math.PI / 6);
    c.fillStyle = 'rgba(25,40,65,.35)'; c.fill('evenodd');
    hexPath(c, 0.11, Math.PI / 6); c.fillStyle = 'rgba(25,40,65,.25)'; c.fill();
    c.restore();
    return oc;
  }
  function drawPlatform2D(sc, now) {
    const depth = 0.075 * SC;
    const sg = g.createRadialGradient(W / 2, H / 2 + depth * 2.5, SC * sc * 0.4, W / 2, H / 2 + depth * 2.5, SC * sc * 1.25);
    sg.addColorStop(0, 'rgba(0,0,0,.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    if (arenaAnim.to < arenaAnim.from) {
      const k = clamp((now - arenaAnim.t0) / SHRINK_MS, 0, 1);
      if (k < 1) {
        g.save(); g.globalAlpha = 1 - easeIn(k);
        const drop = easeIn(k) * 0.35 * SC;
        octPath(g, arenaAnim.from, drop); octPath(g, sc, drop);
        g.fillStyle = '#3d4f70'; g.fill('evenodd');
        g.restore();
      }
    }
    octPath(g, sc, depth);
    const side = g.createLinearGradient(0, H / 2, 0, H / 2 + SC * sc + depth);
    side.addColorStop(0, '#2b3958'); side.addColorStop(1, '#141c30');
    g.fillStyle = side; g.fill();
    g.save(); octPath(g, sc); g.clip(); g.drawImage(floor, 0, 0); g.restore();
    octPath(g, sc); g.lineWidth = 0.012 * SC; g.strokeStyle = 'rgba(200,220,250,.55)'; g.stroke();
    g.save(); octPath(g, sc - 0.035);
    g.setLineDash([0.04 * SC, 0.03 * SC]); g.lineDashOffset = -now / 60;
    g.lineWidth = 0.008 * SC; g.strokeStyle = 'rgba(255,196,64,.45)'; g.stroke(); g.restore();
  }
  function glowLine(x1, y1, x2, y2, color, core, width, alpha) {
    const [ax, ay] = toS(x1, y1), [bx, by] = toS(x2, y2);
    g.save(); g.lineCap = 'round';
    g.globalAlpha = alpha * 0.28; g.strokeStyle = color; g.lineWidth = width * 3.2 * DPR;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.globalAlpha = alpha; g.strokeStyle = core; g.lineWidth = width * DPR;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.restore();
  }
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // Nişan önizlemesi: lazer gibi düz ışın + menzilin sonunda iniş işareti
  function drawAim2D(x, y, a, sc, alpha, grow, mine, range) {
    if (alpha <= 0.01 || grow <= 0.01) return;
    const { end, done } = aimDots(x, y, a, sc, grow, range);
    const k = Math.min(1, grow);
    const sx0 = x + Math.cos(a) * LZ.BODY_R * 1.2, sy0 = y + Math.sin(a) * LZ.BODY_R * 1.2;
    const ex0 = x + (end.x - x) * k, ey0 = y + (end.y - y) * k;
    if (Math.hypot(ex0 - x, ey0 - y) > LZ.BODY_R * 1.2) {
      glowLine(sx0, sy0, ex0, ey0, mine ? '#ff9b3d' : '#e6dcc8', mine ? '#fff1cf' : '#f5efe4', mine ? 2.2 : 1.5, alpha * (mine ? 0.95 : 0.6));
    }
    g.save();
    if (done) {
      const [ex, ey] = toS(end.x, end.y);
      g.globalAlpha = alpha * 0.7; g.strokeStyle = mine ? '#ffd27a' : '#e6dcc8'; g.lineWidth = 1.4 * DPR;
      g.setLineDash([3 * DPR, 3 * DPR]);
      g.beginPath(); g.arc(ex, ey, 6 * DPR, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.moveTo(ex - 9 * DPR, ey); g.lineTo(ex - 4 * DPR, ey); g.moveTo(ex + 4 * DPR, ey); g.lineTo(ex + 9 * DPR, ey);
      g.moveTo(ex, ey - 9 * DPR); g.lineTo(ex, ey - 4 * DPR); g.moveTo(ex, ey + 4 * DPR); g.lineTo(ex, ey + 9 * DPR); g.stroke();
    }
    g.restore();
  }
  function drawStoneShadow2D(st) {
    if (st.off && st.z < 0) return;
    const [sx, sy] = toS(st.x, st.y);
    const r = 4.5 * DPR;
    g.save(); g.globalAlpha = st.alpha * 0.32 / (1 + st.z * 2.5); g.fillStyle = '#000';
    g.beginPath(); g.ellipse(sx + 2 * DPR, sy + 2.5 * DPR, r * (0.9 + st.z * 0.6), r * (0.6 + st.z * 0.4), 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawStone2D(st, r = 4.5 * DPR) {
    const [sx, sy] = toS(st.x, st.y);
    const yy = sy - st.z * SC * LIFT;
    g.save(); g.globalAlpha = st.alpha;
    g.fillStyle = STONE_C; g.strokeStyle = STONE_D; g.lineWidth = 1.2 * DPR;
    g.beginPath(); g.arc(sx, yy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(sx - r * 0.3, yy - r * 0.3, r * 0.32, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawPlayer2D(p, x, y, a, { alpha = 1, size = 1, ring = 0, me = false, label = true, spin = 0, shadow = true, recoil = 0 } = {}) {
    if (!p || alpha <= 0.01 || size <= 0.01) return;
    const [sx, sy] = toS(x - Math.cos(a) * recoil, y - Math.sin(a) * recoil);
    const r = LZ.BODY_R * SC * size;
    g.save(); g.globalAlpha = alpha;
    if (shadow) { g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.ellipse(sx + r * 0.25, sy + r * 0.4, r * 1.05, r * 0.88, 0, 0, Math.PI * 2); g.fill(); }
    if (ring) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      g.globalAlpha = alpha * ring * (0.55 + 0.45 * pulse);
      g.strokeStyle = '#fff'; g.lineWidth = 2.5 * DPR;
      g.beginPath(); g.arc(sx, sy, r * (1.45 + 0.12 * pulse), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = alpha;
    }
    g.restore();
    drawTopAvatar(g, p.look, p.color, sx, sy, r, a, { alpha, spin, gun: true });
    if (label && size > 0.6) {
      g.save(); g.globalAlpha = alpha;
      g.font = `700 ${11 * DPR}px system-ui, -apple-system, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff';
      const txt = me ? 'SEN' : p.name;
      g.strokeText(txt, sx, sy - r * 1.55); g.fillText(txt, sx, sy - r * 1.55);
      g.restore();
    }
  }
  function centerText(txt, sub) {
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(11,16,32,.6)';
    g.beginPath(); g.roundRect(W / 2 - S * 0.32, H / 2 - S * 0.08, S * 0.64, S * 0.16, 14 * DPR); g.fill();
    g.fillStyle = '#fff'; g.font = `800 ${17 * DPR}px system-ui, -apple-system, sans-serif`;
    g.fillText(txt, W / 2, H / 2 - (sub ? 9 * DPR : 0));
    if (sub) { g.fillStyle = '#c4cbe0'; g.font = `500 ${12 * DPR}px system-ui, -apple-system, sans-serif`; g.fillText(sub, W / 2, H / 2 + 13 * DPR); }
    g.restore();
  }

  function drawScene2D(e, t, sc, live, now) {
    const sn = sceneAt(e, t, live);
    const fallers = sn.players.filter((p) => p.fall > 0 && p.fall < 1);
    const drawFall = (behind) => {
      for (const p of fallers) {
        if ((p.y > 0.15) !== behind) continue;
        const f = easeIn(p.fall), k = easeOut(p.fall);
        drawPlayer2D(pById(p.id), p.x + p.dir.x * 0.16 * k, p.y + p.dir.y * 0.16 * k + (behind ? 0.28 * f : 0), p.a,
          { alpha: 1 - p.fall * p.fall, size: 1 - 0.72 * k, spin: f * 6, shadow: false, label: p.fall < 0.35, me: p.id === playerId });
      }
    };
    drawFall(true);
    drawPlatform2D(sc, now);
    drawFall(false);
    for (const p of sn.players) if (p.fall === 0) drawAim2D(p.x, p.y, p.a, sc, p.aim, p.grow, p.id === playerId, p.r);
    const stones = sn.tracers.map((tr) => ({ tr, st: stoneAt(tr, tr.dt) }));
    for (const { st } of stones) if (st) drawStoneShadow2D(st);
    for (const tr of sn.tracers) {
      if (tr.flash > 0) {
        const [mx, my2] = toS(tr.x1 + Math.cos(tr.a) * LZ.BODY_R * 1.6, tr.y1 + Math.sin(tr.a) * LZ.BODY_R * 1.6);
        g.save(); g.globalAlpha = tr.flash * 0.6;
        g.fillStyle = 'rgba(255,240,200,.5)'; dot(mx, my2, LZ.BODY_R * SC * 0.6 * (1.4 - tr.flash));
        g.restore();
      }
      if (tr.impact >= 0) {
        const [ix, iy] = toS(tr.x2, tr.y2);
        g.save(); g.globalAlpha = 1 - tr.impact;
        g.strokeStyle = '#efe4d2'; g.lineWidth = 3 * DPR * (1 - tr.impact) + DPR;
        g.beginPath(); g.arc(ix, iy, LZ.BODY_R * SC * (0.5 + easeOut(tr.impact) * 2.2), 0, Math.PI * 2); g.stroke();
        g.globalAlpha = (1 - tr.impact) * 0.35; g.fillStyle = '#d9cfc0';
        dot(ix, iy, LZ.BODY_R * SC * (0.3 + easeOut(tr.impact) * 1.6));
        g.restore();
      }
    }
    for (const p of sn.players) {
      if (p.fall > 0) continue;
      const pl = pById(p.id);
      if (p.slide && pl) glowLine(p.slide.fx, p.slide.fy, p.x, p.y, pl.color, pl.color, LZ.BODY_R * SC / DPR * 0.9, 0.22 * (1 - p.slide.k));
      drawPlayer2D(pl, p.x, p.y, p.a, { alpha: easeOut(p.pop), size: easeOutBack(p.pop), ring: p.ring ? 1 : 0, me: p.id === playerId, recoil: p.recoil });
    }
    // Taşlar oyuncuların üstünden uçar
    for (const { tr, st } of stones) {
      if (!st) continue;
      for (const tp of trailOf(tr)) drawStone2D(tp, 3 * DPR);
      drawStone2D(st);
    }
  }

  function drawEffects2D(now, dt) {
    bumps = bumps.filter((b) => now - b.t0 < 360);
    for (const b of bumps) {
      const k = (now - b.t0) / 360;
      const [bx, by] = toS(b.x, b.y);
      g.globalAlpha = 1 - k; g.strokeStyle = '#ffffff'; g.lineWidth = (2.5 * (1 - k) + 0.8) * DPR;
      g.beginPath(); g.arc(bx, by, LZ.BODY_R * SC * (0.3 + easeOut(k) * 1.4), 0, Math.PI * 2); g.stroke();
    }
    for (const p of parts) {
      const [px, py] = toS(p.x, p.y);
      g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c;
      g.beginPath(); g.arc(px, py - Math.max(0, p.z) * SC * LIFT * 0.5, p.r * SC, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  function stepParticles(dt) {
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.z += p.vz * dt; p.vz -= 2.5 * dt; }
  }

  function frame2D(now, dt, ph, sc) {
    ensure2D();
    g.drawImage(bg, 0, 0);
    const tt = now / 1000;
    for (let i = 0; i < 4; i++) {
      const size = S * (0.9 + i * 0.15);
      g.drawImage(fog, W / 2 + Math.cos(tt * 0.05 + i * 1.7) * S * 0.35 - size / 2, H / 2 + Math.sin(tt * 0.04 + i * 2.3) * S * 0.3 - size / 2, size, size);
    }
    const sk = now - shakeT0 < shakeDur ? shakeAmp * DPR * (1 - (now - shakeT0) / shakeDur) : 0;
    g.save();
    if (sk) g.translate((Math.random() - 0.5) * 2 * sk, (Math.random() - 0.5) * 2 * sk);
    const s = ctx.state();
    if (ph === 'reveal') drawScene2D(anim.entry, now - anim.t0, sc, true, now);
    else {
      drawPlatform2D(sc, now);
      if (ph === 'plan') {
        const k = easeOut(clamp((now - phaseT0) / 400, 0, 1));
        const ed = ctx.editing();
        drawAim2D(my.x, my.y, my.a, sc, ed ? k : 0.5 * k, k, true, my.r);
        const bob = walkAmt * Math.abs(Math.sin(now / 95)) * 0.06;
        drawPlayer2D(ctx.me(), my.x, my.y, my.a, { ring: ed ? 1 : 0, me: true, alpha: k, size: (0.7 + 0.3 * easeOutBack(k)) * (1 + bob) });
      } else if (ph === 'spectate') {
        centerText('İzleyici modu', 'Herkes yerleşince atışları göreceksin');
      } else if (s.last && s.last.kind === 'lazer') {
        drawScene2D(s.last, Infinity, sc, false, now);
      }
    }
    drawEffects2D(now, dt);
    g.restore();
  }

  // ======================================================================
  // 3D BİRİNCİ ŞAHIS GÖRÜNÜM
  // ======================================================================
  let T = null, R = null; // THREE modülü, 3D durumu
  let loading3D = false;
  async function ensure3D() {
    if (R || loading3D) return !!R;
    loading3D = true;
    try {
      T = await loadThree();
      R = build3D();
    } catch (err) { console.error(err); ctx.toast('3D görünüm yüklenemedi'); ctx.setView('top'); }
    loading3D = false;
    return !!R;
  }

  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080c1c');
    scene.fog = new THREE.Fog('#080c1c', 2.2, 7);
    const cam = new THREE.PerspectiveCamera(72, 1, 0.02, 40);
    scene.add(new THREE.HemisphereLight('#b8c8ff', '#1a1430', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(2, 4, 1.5);
    scene.add(sun);

    // Yıldızlar ve uçuşan kayalar (derinlik hissi)
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 600; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), r = 14 + Math.random() * 8;
      sp.push(Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r - 2, Math.sin(ph) * Math.sin(th) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#aab8ff', size: 0.06, fog: false })));
    const rocks = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: '#2a3550' });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.35), rockMat);
      const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 3;
      m.position.set(Math.cos(a) * r, -1 - Math.random() * 3, Math.sin(a) * r);
      m.userData.spin = (Math.random() - 0.5) * 0.4;
      scene.add(m); rocks.push(m);
    }

    // Platform: sekizgen prizma (üst yüz y=0)
    const shape = new THREE.Shape(LZ.octagonVertices(1).map(([x, y]) => new THREE.Vector2(x, -y)));
    const depth = 0.18;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -depth, 0);
    // Tel örgü dokusu
    const tc = document.createElement('canvas'); tc.width = tc.height = 128;
    const tg = tc.getContext('2d');
    tg.fillStyle = '#6b80a0'; tg.fillRect(0, 0, 128, 128);
    tg.strokeStyle = 'rgba(15,25,45,.45)'; tg.lineWidth = 6;
    tg.beginPath(); tg.moveTo(0, 0); tg.lineTo(128, 128); tg.moveTo(128, 0); tg.lineTo(0, 128); tg.stroke();
    tg.strokeStyle = 'rgba(255,255,255,.18)'; tg.lineWidth = 2;
    tg.beginPath(); tg.moveTo(3, 0); tg.lineTo(131, 128); tg.moveTo(131, 0); tg.lineTo(3, 128); tg.stroke();
    const tex = new THREE.CanvasTexture(tc);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const topMat = new THREE.MeshLambertMaterial({ map: tex });
    const sideMat = new THREE.MeshLambertMaterial({ color: '#26324d' });
    const platform = new THREE.Mesh(geo, [topMat, sideMat]);
    scene.add(platform);
    // Kopan dış halka (daralırken düşen eski platform)
    const crumble = new THREE.Mesh(geo, [new THREE.MeshLambertMaterial({ map: tex, transparent: true }), new THREE.MeshLambertMaterial({ color: '#26324d', transparent: true })]);
    crumble.visible = false;
    scene.add(crumble);
    // Ortadaki altıgen + kenar uyarı şeridi
    const hex = new THREE.Mesh(new THREE.CircleGeometry(0.3, 6), new THREE.MeshBasicMaterial({ color: '#1b2a45', transparent: true, opacity: 0.45 }));
    hex.rotation.x = -Math.PI / 2; hex.rotation.z = Math.PI / 6; hex.position.y = 0.002;
    scene.add(hex);
    const edgePts = LZ.octagonVertices(1).map(([x, y]) => new THREE.Vector3(x, 0.004, y));
    edgePts.push(edgePts[0].clone());
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineDashedMaterial({ color: '#ffc440', dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.7 }));
    edge.computeLineDistances();
    scene.add(edge);

    // Efekt havuzları: nişan kavisi noktaları, taşlar, iz/toz spriteları, parçacıklar
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const gg = c.getContext('2d'); const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const pool = (make) => { const arr = []; return { get(i) { while (arr.length <= i) { const o = make(); scene.add(o); arr.push(o); } return arr[i]; }, hideFrom(i) { for (let k = i; k < arr.length; k++) arr[k].visible = false; } }; };
    const AIM_N = 36;
    const ringGeo = new THREE.RingGeometry(0.028, 0.038, 24); ringGeo.rotateX(-Math.PI / 2);
    const aimPool = pool(() => {
      const grp = new THREE.Group();
      const dots = [];
      for (let i = 0; i < AIM_N; i++) {
        const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffe9bf', depthWrite: false, transparent: true }));
        d.scale.set(0.02, 0.02, 1);
        grp.add(d); dots.push(d);
      }
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      grp.add(ring);
      grp.userData = { dots, ring };
      return grp;
    });
    const stoneMat = new THREE.MeshLambertMaterial({ color: '#a39a8c' });
    const stonePool = pool(() => new THREE.Mesh(new THREE.DodecahedronGeometry(0.022), stoneMat));
    const spritePool = pool(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    const trailPool = pool(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#e8dfd0', depthWrite: false, transparent: true })); s.scale.set(0.03, 0.03, 1); return s; });
    const partGeo = new THREE.BoxGeometry(1, 1, 1);
    const partPool = pool(() => new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ transparent: true })));
    // Blob gölge
    const shadowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const gg = c.getContext('2d'); const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const shadowGeo = new THREE.PlaneGeometry(0.22, 0.22); shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const stoneShadowPool = pool(() => { const m = new THREE.Mesh(shadowGeo, shadowMat); m.position.y = 0.0035; return m; });

    // Birinci şahıs sapanı (kameraya bağlı): Y çatal, lastik, taşlı kese
    const fpGun = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: '#8a5a2b' });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0038, 0.03, 8), wood); handle.position.set(0, -0.012, 0);
    const prongL = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.028, 8), wood); prongL.position.set(-0.0085, 0.013, 0); prongL.rotation.z = 0.6;
    const prongR = prongL.clone(); prongR.position.x = 0.0085; prongR.rotation.z = -0.6;
    const rubber = new THREE.MeshBasicMaterial({ color: '#3a2f2a' });
    const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0012, 1), rubber);
    const bandR = bandL.clone();
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshLambertMaterial({ color: '#5b4a3f' }));
    const fpStone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.0035), stoneMat);
    fpGun.add(handle, prongL, prongR, bandL, bandR, pouch, fpStone);
    fpGun.position.set(0.03, -0.034, -0.085);
    fpGun.rotation.set(0.15, -0.3, 0);
    fpGun.userData = { bandL, bandR, pouch, fpStone, tipL: new THREE.Vector3(-0.0165, 0.025, 0), tipR: new THREE.Vector3(0.0165, 0.025, 0), pull: 0.028 };
    cam.add(fpGun);
    scene.add(cam);

    return { renderer, scene, cam, platform, crumble, hex, edge, rocks, aimPool, stonePool, spritePool, trailPool, partPool, stoneShadowPool, avatars: new Map(), shadowGeo, shadowMat, fpGun, w: 0, h: 0, specA: 0, tmp: new THREE.Vector3() };
  }

  // İki nokta arasına ince kutu (lastik)
  function setSeg(m, a, b) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(m.position.clone().add(b.clone().sub(a)));
    m.scale.z = Math.max(1e-4, a.distanceTo(b));
  }
  function updateSlingshot(now, recoil, walking) {
    const u = R.fpGun.userData;
    // Kese: yerleşmede gerili (kameraya doğru), atışta ileri fırlar
    const pullTarget = recoil > 0 ? -0.012 : 0.028;
    u.pull = lerp(u.pull, pullTarget, recoil > 0 ? 0.6 : 0.12);
    u.pouch.position.set(0, 0.014, u.pull);
    u.fpStone.position.set(0, 0.0165, u.pull - 0.0015);
    u.fpStone.visible = recoil <= 0 || u.pull > 0.012;
    setSeg(u.bandL, u.tipL, u.pouch.position);
    setSeg(u.bandR, u.tipR, u.pouch.position);
    R.fpGun.position.set(0.03 + Math.sin(now / 130) * 0.0015 * walking, -0.034 + Math.abs(Math.sin(now / 130)) * 0.003 * walking - recoil * 0.4, -0.085 + recoil * 0.6);
  }

  function avatarFor(id) {
    const p = pById(id);
    if (!p) return null;
    const key = JSON.stringify(p.look || {}) + p.color + p.name;
    let a = R.avatars.get(id);
    if (a && a.key !== key) { R.scene.remove(a.grp); a = null; }
    if (!a) {
      const av = buildAvatar(T, p.look, p.color, { gun: true });
      const grp = new T.Group();
      av.root.scale.setScalar(AV_SCALE);
      grp.add(av.root);
      const shadow = new T.Mesh(R.shadowGeo, R.shadowMat); shadow.position.y = 0.003;
      grp.add(shadow);
      const label = makeLabel(T, id === playerId ? 'SEN' : p.name, p.color);
      label.position.y = 0.44;
      grp.add(label);
      R.scene.add(grp);
      a = { grp, av, shadow, label, key };
      R.avatars.set(id, a);
    }
    return a;
  }

  function placeAvatar(a, x, y, ang, { fall = 0, dir = null, alpha = 1, size = 1, ring = false, me = false } = {}, now) {
    const f = easeIn(fall), k = easeOut(fall);
    const px = x + (dir ? dir.x * 0.25 * k : 0), pz = y + (dir ? dir.y * 0.25 * k : 0);
    a.grp.visible = alpha > 0.02 && size > 0.02 && fall < 1;
    a.grp.position.set(px, -f * 2.2, pz);
    a.grp.rotation.set(dir ? f * 2.5 : 0, -ang, dir ? f * 1.5 : 0);
    a.grp.scale.setScalar(size);
    a.shadow.visible = fall === 0;
    a.label.visible = !me && fall < 0.3;
    animateAvatar(a.av, now / 1000);
    a.av.root.position.y = ring ? Math.abs(Math.sin(now / 160)) * 0.02 : 0;
  }

  function frame3D(now, dt, ph, sc) {
    const sz = ctx.size3();
    if (sz.w !== R.w || sz.h !== R.h) { R.renderer.setSize(sz.w, sz.h, false); R.cam.aspect = sz.w / sz.h; R.cam.updateProjectionMatrix(); R.w = sz.w; R.h = sz.h; }
    const s = ctx.state();
    R.platform.scale.set(sc, 1, sc);
    R.hex.scale.setScalar(Math.min(1, sc * 1.4));
    R.edge.scale.set(sc * 0.96, 1, sc * 0.96);
    R.edge.material.dashOffset = -now / 3000;
    // Kopan halka
    const ck = clamp((now - arenaAnim.t0) / SHRINK_MS, 0, 1);
    R.crumble.visible = arenaAnim.to < arenaAnim.from && ck < 1;
    if (R.crumble.visible) {
      R.crumble.scale.set(arenaAnim.from, 1, arenaAnim.from);
      R.crumble.position.y = -easeIn(ck) * 1.5;
      R.crumble.material.forEach((m) => { m.opacity = 1 - ck; });
    }
    for (const r of R.rocks) { r.rotation.y += r.userData.spin * dt; r.rotation.x += r.userData.spin * 0.5 * dt; }

    // Sahne verisi
    let players = [], tracers = [];
    if (ph === 'reveal') ({ players, tracers } = sceneAt(anim.entry, now - anim.t0, true));
    else if (ph === 'plan') players = [{ id: playerId, x: my.x, y: my.y, a: my.a, r: my.r, fall: 0, pop: 1, aim: ctx.editing() ? 0.9 : 0.45, grow: 1, ring: false }];
    else if (ph !== 'spectate' && s.last && s.last.kind === 'lazer') players = sceneAt(s.last, Infinity, false).players;

    const used = new Set();
    let ai = 0;
    for (const p of players) {
      const a = avatarFor(p.id);
      if (!a) continue;
      used.add(p.id);
      placeAvatar(a, p.x, p.y, p.a, { fall: p.fall, dir: p.dir, alpha: p.pop, size: easeOutBack(p.pop), ring: p.ring, me: p.id === playerId }, now);
      if (p.aim > 0.01 && p.fall === 0) {
        const { dots, end, done } = aimDots(p.x, p.y, p.a, sc, p.grow, p.r);
        const A = R.aimPool.get(ai++);
        A.visible = true;
        const mine = p.id === playerId;
        A.userData.dots.forEach((d, i) => {
          const pt = dots[i];
          // Kendi kavisim kameranın dibinden başlamasın
          if (!pt || (mine && pt.k < 0.1)) { d.visible = false; return; }
          d.visible = true;
          d.position.set(pt.x, pt.z, pt.y);
          d.material.opacity = p.aim * (mine ? 0.75 : 0.45) * (0.5 + 0.5 * (1 - pt.k));
          d.scale.setScalar(0.014 + 0.012 * pt.hf);
        });
        A.userData.ring.visible = done;
        A.userData.ring.position.set(end.x, 0.006, end.y);
        A.userData.ring.material.opacity = p.aim * 0.8;
        A.userData.ring.rotation.y = now / 900;
      }
    }
    R.aimPool.hideFrom(ai);
    for (const [id, a] of R.avatars) if (!used.has(id)) a.grp.visible = false;
    // Birinci şahısta kendi modelimi gizle (kamera kafamın içinde)
    const meNow = players.find((p) => p.id === playerId);
    if (meNow && meNow.fall < 1 && R.avatars.get(playerId)) R.avatars.get(playerId).grp.visible = false;

    let sti = 0, si = 0, tri = 0, shi = 0;
    for (const tr of tracers) {
      const st = stoneAt(tr, tr.dt);
      if (st) {
        const m = R.stonePool.get(sti++); m.visible = true;
        m.position.set(st.x, st.z, st.y);
        m.rotation.set(tr.dt / 90, tr.dt / 130, 0);
        if (!st.off) {
          const sh = R.stoneShadowPool.get(shi++); sh.visible = true;
          sh.position.set(st.x, 0.0035, st.y);
          sh.scale.setScalar(0.28 / (1 + st.z * 1.5));
        }
        for (const tp of trailOf(tr)) {
          const t = R.trailPool.get(tri++); t.visible = true;
          t.position.set(tp.x, tp.z, tp.y); t.material.opacity = tp.alpha;
        }
      }
      if (tr.flash > 0) {
        const f = R.spritePool.get(si++); f.visible = true;
        f.position.set(tr.x1 + Math.cos(tr.a) * 0.12, LZ.STONE_H, tr.y1 + Math.sin(tr.a) * 0.12);
        f.material.color.set('#ffe9bf'); f.material.opacity = tr.flash * 0.5; f.scale.setScalar(0.1 * tr.flash + 0.04);
      }
      if (tr.impact >= 0) {
        const f = R.spritePool.get(si++); f.visible = true;
        f.position.set(tr.x2, LZ.STONE_H, tr.y2);
        f.material.color.set('#e8dccb'); f.material.opacity = 1 - tr.impact; f.scale.setScalar(0.08 + easeOut(tr.impact) * 0.4);
      }
    }
    bumps = bumps.filter((b) => now - b.t0 < 360);
    for (const b of bumps) {
      const k = (now - b.t0) / 360, f = R.spritePool.get(si++);
      f.visible = true; f.position.set(b.x, LZ.STONE_H, b.y); f.material.color.set('#ffffff'); f.material.opacity = 1 - k; f.scale.setScalar(0.06 + k * 0.25);
    }
    R.stonePool.hideFrom(sti); R.spritePool.hideFrom(si); R.trailPool.hideFrom(tri); R.stoneShadowPool.hideFrom(shi);
    parts.forEach((p, i) => {
      const m = R.partPool.get(i); m.visible = true;
      m.position.set(p.x, Math.max(0.01, p.z), p.y); m.scale.setScalar(p.r * 1.6);
      m.material.color.set(p.c); m.material.opacity = 1 - p.life / p.max;
    });
    R.partPool.hideFrom(parts.length);

    // Kamera: kendi gözümden; elendiysem/turda yoksam yukarıdan dönen izleyici kamerası
    const mine = players.find((p) => p.id === playerId);
    const cam = R.cam;
    const sk = now - shakeT0 < shakeDur ? shakeAmp * 0.002 * (1 - (now - shakeT0) / shakeDur) : 0;
    if (mine && mine.fall < 1) {
      const f = easeIn(mine.fall), k = easeOut(mine.fall);
      const cx = mine.x + (mine.dir ? mine.dir.x * 0.25 * k : 0), cz = mine.y + (mine.dir ? mine.dir.y * 0.25 * k : 0);
      const bob = ph === 'plan' ? Math.abs(Math.sin(now / 130)) * 0.006 * walkAmt : 0;
      cam.position.set(cx + (Math.random() - 0.5) * sk, EYE - f * 2.2 + bob + (Math.random() - 0.5) * sk, cz);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(-0.12 - f * 1.1, -mine.a - Math.PI / 2, f * 0.8);
      R.fpGun.visible = mine.fall === 0;
      updateSlingshot(now, mine.recoil || 0, ph === 'plan' ? walkAmt : 0);
    } else {
      R.specA += dt * 0.25;
      const r = 1.6 + sc * 0.6;
      cam.position.set(Math.cos(R.specA) * r, 1.5, Math.sin(R.specA) * r);
      cam.lookAt(0, 0, 0);
      R.fpGun.visible = false;
    }
    R.renderer.render(R.scene, cam);
  }

  // Mini harita (FPS'te konum + nişan kavisi; dokununca ışınlanır)
  function drawMini() {
    const m = ctx.mini, c = m.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(m.clientWidth * dpr);
    if (m.width !== w) { m.width = m.height = w; }
    const sc = LZ.arenaScale(ctx.state().round);
    const k = w / 2 / 1.05;
    const P = (x, y) => [w / 2 + x * k, w / 2 + y * k];
    c.clearRect(0, 0, w, w);
    c.beginPath();
    LZ.octagonVertices(sc).forEach(([x, y], i) => { const [sx, sy] = P(x, y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
    c.closePath(); c.fillStyle = 'rgba(110,130,165,.85)'; c.fill();
    c.strokeStyle = 'rgba(255,196,64,.8)'; c.lineWidth = 1.5 * dpr; c.stroke();
    const { end } = aimDots(my.x, my.y, my.a, sc, 1, my.r);
    c.strokeStyle = 'rgba(255,214,140,.95)'; c.lineWidth = 2 * dpr;
    c.beginPath(); c.moveTo(...P(my.x, my.y)); c.lineTo(...P(end.x, end.y)); c.stroke();
    c.strokeStyle = '#ffd27a'; c.lineWidth = 1.2 * dpr; c.setLineDash([2 * dpr, 2 * dpr]);
    c.beginPath(); c.arc(...P(end.x, end.y), 4 * dpr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    const me = ctx.me();
    c.fillStyle = me ? me.color : '#fff';
    c.beginPath(); c.arc(...P(my.x, my.y), 6 * dpr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2 * dpr; c.stroke();
  }

  // ---------- Dışa açık arayüz ----------
  const client = {
    kind: 'lazer',
    supports3D: true,
    onState(s) {
      if (s.status !== 'playing') return;
      const key = `${s.seq}:${s.round}`;
      if (key === myKey) return;
      myKey = key;
      const sc = LZ.arenaScale(s.round);
      const prev = s.myAction || (s.last && s.last.kind === 'lazer' && s.last.placements[playerId]);
      if (prev) { const c = LZ.clampInside(prev.x, prev.y, LZ.BODY_R + 0.01, sc); my = { x: c.x, y: c.y, a: prev.a, r: prev.r ? LZ.cleanRange(prev.r) : my.r }; }
      else { const p = LZ.randomInside(Math.random, sc); my = { x: p.x, y: p.y, a: Math.atan2(-p.y, -p.x), r: Math.min(my.r, LZ.MAX_RANGE) }; }
    },
    onEntry(entry, skipMs) { startAnim(entry, skipMs); },
    revealTotal: (entry) => LZ.revealMs(entry.shots),
    animating() { return !!anim; },
    frame(now, dt, ph, view) {
      if (anim && now - anim.t0 > timeline(anim.entry).total) anim = null;
      if (ph === 'reveal' && !anim) ph = ctx.phase(); // animasyon bu karede bitti
      if (ph !== lastPhase) { lastPhase = ph; phaseT0 = now; }
      const s = ctx.state();
      const sc = updateScale(now);
      const ed = ph === 'plan' && ctx.editing() && s.status === 'playing';
      if (ed !== ctlShown) { ctlShown = ed; ctl.show(ed); }
      if (ed) applyControls(dt, Math.min(sc, LZ.arenaScale(s.round)), view); else walkAmt = 0;
      if (ph === 'plan' && !drag) { const c = LZ.clampInside(my.x, my.y, LZ.BODY_R + 0.01, Math.min(sc, LZ.arenaScale(s.round))); my.x = c.x; my.y = c.y; }
      if (anim) fireEvents(anim.entry, now - anim.t0, now);
      stepParticles(dt);
      if (view === 'fps' && R) { frame3D(now, dt, ph, sc); if (ph === 'plan') drawMini(); }
      else { if (view === 'fps') ensure3D(); frame2D(now, dt, ph, sc); }
      if (ph === 'reveal') return bannerFor(anim.entry, now - anim.t0, s);
      if (ph === 'plan') return shrinking(now) ? '⚠️ Alan daralıyor!' : ctx.editing() ? `Tur ${s.round} • Gizlice yerleş` : `Tur ${s.round} • Bekleniyor…`;
      if (ph === 'spectate') return `Tur ${s.round} • İzliyorsun`;
      return '';
    },
    ready3D: () => !!R,
    hint(editing) {
      return editing
        ? (ctx.view() === 'fps' ? 'Joystick ile yürü • ⟲ ⟳ yön • − + menzil • ekranı yukarı/aşağı sürükle: menzil' : 'Joystick ile yürü • ⟲ ⟳ yön • − + menzil • dokunduğun yere nişan alır')
        : null;
    },
    panel() { return ''; },
    // Açılış sırasında alt panelde atış sırası (kimin sırası, kim sırası gelmeden düştü)
    revealPanel(now, chip) {
      if (!anim) return '';
      const e = anim.entry, t = now - anim.t0, tl = timeline(e);
      let html = `<div class="status">Tur ${e.round} • Atış sırası</div><div class="chips">`;
      e.order.forEach((id, idx) => {
        const si = tl.shotIndex[id];
        const out = tl.outAt[id] !== undefined && t >= tl.outAt[id];
        let cls = '', extra = '';
        if (si === undefined) { if (out) { cls = 'skip'; extra = ' 🕳️ sırası gelmeden düştü'; } }
        else {
          const t0 = tl.slots[si];
          if (t >= t0 + tl.plans[si].dur) cls = 'done'; else if (t >= t0) cls = 'cur';
          if (out) extra = ' 🕳️';
        }
        html += chip(id, cls, extra, idx + 1);
      });
      return html + '</div>';
    },
    action() { return { x: my.x, y: my.y, a: my.a, r: my.r }; },
    pointer(type, ev, target) {
      if (type === 'up' || type === 'cancel') { drag = null; return; }
      if (!ctx.editing() || ctx.phase() !== 'plan') return;
      const sc = LZ.arenaScale(ctx.state().round);
      if (target === 'fps') {
        // yatay sürükleme = dön, dikey sürükleme = menzil (yukarı = uzak)
        if (type === 'down') drag = { mode: 'turn', x: ev.clientX, y: ev.clientY };
        else if (drag && drag.mode === 'turn') {
          my.a += (ev.clientX - drag.x) * 0.006;
          my.r = clamp(my.r - (ev.clientY - drag.y) * 0.004, LZ.MIN_RANGE, LZ.MAX_RANGE);
          drag.x = ev.clientX; drag.y = ev.clientY;
        }
        return;
      }
      if (target === 'mini') {
        const r = ctx.mini.getBoundingClientRect();
        const w = { x: ((ev.clientX - r.left) / r.width - 0.5) * 2.1, y: ((ev.clientY - r.top) / r.height - 0.5) * 2.1 };
        const c = LZ.clampInside(w.x, w.y, LZ.BODY_R + 0.01, sc);
        my.x = c.x; my.y = c.y;
        drag = { mode: 'mini' };
        return;
      }
      // 2D üstten: karakteri sürükle ya da başka yere dokunarak nişan al (kumandaya ek)
      const rect = ctx.cv.getBoundingClientRect();
      const w = { x: ((ev.clientX - rect.left) * DPR - W / 2) / SC, y: ((ev.clientY - rect.top) * DPR - H / 2) / SC };
      if (type === 'down') drag = Math.hypot(w.x - my.x, w.y - my.y) < 0.17 ? { mode: 'move', dx: my.x - w.x, dy: my.y - w.y } : { mode: 'aim' };
      if (!drag) return;
      if (drag.mode === 'move') { const c = LZ.clampInside(w.x + drag.dx, w.y + drag.dy, LZ.BODY_R + 0.01, sc); my.x = c.x; my.y = c.y; }
      else if (drag.mode === 'aim' && Math.hypot(w.x - my.x, w.y - my.y) > 0.04) {
        // dokunulan nokta hem yönü hem menzili belirler
        my.a = Math.atan2(w.y - my.y, w.x - my.x);
        my.r = clamp(Math.hypot(w.x - my.x, w.y - my.y), LZ.MIN_RANGE, LZ.MAX_RANGE);
      }
    },
    hud() { return `Alan <b>%${Math.round(targetScale() * 100)}</b> · Menzil <b>${Math.round(my.r * 100)}</b>`; },
    dispose() {
      if (R) { R.renderer.dispose(); R = null; }
      anim = null;
      ctl.destroy();
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp);
    },
  };
  return client;
}
