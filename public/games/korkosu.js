// 🏃 Kör Koşu — ikili takım, gerçek zamanlı
// Koşucu karakterini yönetir ama yalnızca önündeki küçük alanı görür. Yönlendirici tüm parkuru görür
// ve konuşarak (ya da haritaya dokunup kısa süreli işaret bırakarak) yol gösterir. Parkur uçurumun
// üstünde kıvrılan bir yoldur: kenardan düşen ya da engele çarpan kontrol noktasına döner.
// Parkuru en hızlı bitiren takım kazanır. Sayı tekse takımlara bot eklenir.
//
// Koordinatlar: parkur, tohumdan üretilen yoğun bir orta çizgidir (DS aralıklı örnekler). Koşucu
// (s, u) yerel koordinatlarında hareket eder: s = yol boyunca ilerleme, u = yanal sapma (0 = orta).
// world(c, s, u) dünya (x, y) konumunu verir. Tüm engeller (s, u) uzayında tanımlıdır ve
// tohum + zaman ile belirlenir; böylece her telefon aynı parkuru görür.
import { realtimeServer, pairUp } from './util.js';

export const KIND = 'kor';
export const TITLE = 'Kör Koşu';
export const EMOJI = '🏃';
export const RULES = [
  'İkili takım: koşucu sadece önünü görür, yönlendirici tüm parkuru.',
  'Yol uçurumun üstünde kıvrılır; kenardan düşen ya da engele çarpan kontrol noktasına döner.',
  'Yönlendirici konuşarak ya da haritaya dokunarak (kısa işaret) yol gösterir. En hızlı takım kazanır!',
];
const base = realtimeServer();
export const { realtime, PLACE_MS, normalize, auto, resolve, ranking } = base;
export const PW = 4.4, R = 0.3, SPEED = 3.6, CP_EVERY = 22, MAX_TIME = 150, FALL_T = 0.9, DS = 0.5, BEAM_W = 1.1;
export const PING_SHOW = 1.1; // işaretin ekranda kaldığı süre (sn)

export function init(ids, env) {
  const teams = pairUp(env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) });
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  const all = teams.flat();
  return {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [],
    seed: Math.floor(Math.random() * 1e9),
    teams: teams.map((m, i) => {
      // insan varsa koşucu insan olur (botla eşleşen insan koşar, bot ipucu verir)
      const humans = m.filter((id) => !bots.has(id));
      const runner = humans.length === 2 ? m[Math.floor(Math.random() * 2)] : humans[0] || m[0];
      return { id: i, members: m, runner, guide: m.find((id) => id !== runner), botRunner: bots.has(runner), botGuide: bots.has(m.find((id) => id !== runner)) };
    }),
  };
}
export const view = (d) => ({ ...base.view(d), teams: d.g.teams, seed: d.g.seed });

// ---------- Parkur (tohumdan her cihazda aynı üretilir) ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const frac = (v) => v - Math.floor(v);
const cache = new Map();

export function course(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const Rn = rng(seed);
  // 1) Orta çizgi: kuzeye (-y) doğru ilerleyen, ±AMAX rad sapmalı kıvrımlı yol
  const target = 112 + Math.floor(Rn() * 12);
  const AMAX = 1.0;
  const px = [0], py = [0];
  let x = 0, y = 0, a = 0, s = 0, fails = 0;
  let plan = [{ len: 6, turn: 0 }];
  while (s < target) {
    if (!plan.length) {
      const r = Rn(), sg = Rn() < 0.5 ? -1 : 1;
      if (r < 0.3) plan.push({ len: 5 + Rn() * 6, turn: 0 });                       // düz
      else if (r < 0.7) plan.push({ len: 5 + Rn() * 4, turn: sg * (0.6 + Rn() * 0.8) }); // kavis
      else if (r < 0.86) plan.push({ len: 1.5, turn: sg * (0.9 + Rn() * 0.6) });       // keskin zikzak
      else { const t = sg * (0.7 + Rn() * 0.6); plan.push({ len: 4 + Rn() * 2, turn: t }, { len: 4 + Rn() * 2, turn: -t }); } // S virajı
    }
    const seg = plan.shift();
    let turn = seg.turn;
    if (a + turn > AMAX) turn = AMAX - a;
    if (a + turn < -AMAX) turn = -AMAX - a;
    const n = Math.max(1, Math.round(seg.len / DS));
    const sx = x, sy = y, sa = a, sn = px.length;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      a += turn / n; x += Math.sin(a) * DS; y -= Math.cos(a) * DS;
      // yol kendine yaklaşmasın (7 birimden eski örneklere en az PW+1.4 mesafe)
      for (let j = 0; j < sn - 14; j++) if (Math.hypot(px[j] - x, py[j] - y) < PW + 1.4) { ok = false; break; }
      if (ok) { px.push(x); py.push(y); }
    }
    if (!ok && fails < 25) { fails++; px.length = sn; py.length = sn; x = sx; y = sy; a = sa; plan.length = 0; plan.push({ len: 3, turn: -sa * 0.6 }); continue; }
    fails = 0;
    s = (px.length - 1) * DS;
  }
  // bitiş düzlüğü
  for (let i = 0; i < 8; i++) { x += Math.sin(a) * DS; y -= Math.cos(a) * DS; px.push(x); py.push(y); }
  const n = px.length, LEN = (n - 1) * DS;
  const tx = new Array(n), ty = new Array(n), w = new Array(n).fill(PW);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = px[i1] - px[i0], dy = py[i1] - py[i0], d = Math.hypot(dx, dy) || 1;
    tx[i] = dx / d; ty[i] = dy / d;
  }
  const c = { seed, LEN, n, px, py, tx, ty, w, cps: [0], walls: [], movers: [], spinners: [], pends: [], stomps: [], blinks: [], belts: [], boulders: [], beams: [], stubs: [] };
  for (let cs = CP_EVERY; cs < LEN - 10; cs += CP_EVERY) c.cps.push(cs);
  const heading = (ss) => { const i = clamp(Math.round(ss / DS), 0, n - 1); return Math.atan2(ty[i], tx[i]); };
  const curv = (s0, s1) => { let d = heading(s1) - heading(s0); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

  // 2) Engeller: yol boyunca birbiriyle çakışmayan yuvalar
  let sp = 8;
  while (sp < LEN - 10) {
    const r = Rn();
    const kind = r < 0.2 ? 'wall' : r < 0.31 ? 'mover' : r < 0.41 ? 'spinner' : r < 0.51 ? 'pend' : r < 0.61 ? 'stomp' : r < 0.7 ? 'blink' : r < 0.79 ? 'belt' : r < 0.87 ? 'boulder' : 'beam';
    const foot = { wall: 1, mover: 1, spinner: 1, pend: 1, stomp: 1, blink: 2.4 + Rn(), belt: 4 + Rn() * 2, boulder: 6 + Rn() * 3, beam: 4 + Rn() * 2 }[kind];
    const cp = c.cps.find((v) => v > sp - 2.5 && v < sp + foot + 2.5);
    if (cp) { sp = cp + 2.5; continue; }
    if (sp + foot > LEN - 8) break;
    const rigid = kind === 'wall' || kind === 'mover' || kind === 'spinner' || kind === 'pend' || kind === 'stomp';
    if (rigid && curv(sp - 1.2, sp + 1.2) > 0.3) { sp += 1; continue; }
    const s0 = Math.round(sp * 10) / 10;
    if (kind === 'wall') {
      const gaps = [];
      const ng = Rn() < 0.35 ? 2 : 1;
      for (let k = 0; k < ng; k++) { const gw = 1.4 + Rn() * 0.5; const gx = -PW / 2 + 0.2 + Rn() * (PW - gw - 0.4); gaps.push([gx, gx + gw]); }
      gaps.sort((p, q) => p[0] - q[0]);
      const segs = [];
      let u = -PW / 2;
      for (const [ga, gb] of gaps) { if (ga > u) segs.push([u, ga]); u = Math.max(u, gb); }
      if (u < PW / 2) segs.push([u, PW / 2]);
      c.walls.push({ s: s0, segs, gaps });
    } else if (kind === 'mover') c.movers.push({ s: s0, amp: 1.4 + Rn() * 0.4, w: 1.4, sp: 0.8 + Rn() * 0.7, ph: Rn() * 6.28 });
    else if (kind === 'spinner') c.spinners.push({ s: s0, u: (Rn() < 0.5 ? -1 : 1) * (0.55 + Rn() * 0.35), len: 1.0 + Rn() * 0.35, sp: (Rn() < 0.5 ? -1 : 1) * (1 + Rn() * 0.9), ph: Rn() * 6.28 });
    else if (kind === 'pend') c.pends.push({ s: s0, arm: 2.2, amax: 1.1, sp: 1.6 + Rn() * 0.6, ph: Rn() * 6.28 });
    else if (kind === 'stomp') { const full = Rn() < 0.6; c.stomps.push({ s: s0, u: full ? 0 : (Rn() < 0.5 ? -1 : 1) * PW / 4, wu: full ? PW + 0.2 : PW / 2 + 0.1, sp: 0.36 + Rn() * 0.14, ph: Rn() }); }
    else if (kind === 'blink') c.blinks.push({ s0, s1: Math.round((s0 + foot) * 10) / 10, sp: 0.22 + Rn() * 0.06, ph: Rn(), duty: 0.6 });
    else if (kind === 'belt') c.belts.push({ s0, s1: Math.round((s0 + foot) * 10) / 10, v: (Rn() < 0.5 ? -1 : 1) * (1.4 + Rn() * 0.5) });
    else if (kind === 'boulder') c.boulders.push({ s0, s1: Math.round((s0 + foot) * 10) / 10, u: (Rn() < 0.5 ? -1 : 1) * 1.0, r: 0.5, v: 2.6 + Rn() * 0.8, ph: Rn() * 20 });
    else if (kind === 'beam') c.beams.push({ s0, s1: Math.round((s0 + foot) * 10) / 10 });
    sp += foot + 2.5 + Rn() * 2.5;
  }
  // kirişler: yol genişliği daralır (1 birimlik geçişle)
  for (const b of c.beams) for (let i = 0; i < n; i++) {
    const si = i * DS, d = si < b.s0 ? b.s0 - si : si > b.s1 ? si - b.s1 : 0;
    if (d < 1) w[i] = Math.min(w[i], BEAM_W + (PW - BEAM_W) * d);
  }
  // 3) Sahte kollar: yolun kenarından çıkan, hiçbir yere gitmeyen kısa çıkmazlar
  const nst = 4 + Math.floor(Rn() * 3);
  for (let k = 0; k < nst; k++) {
    const ss = 6 + Rn() * (LEN - 16), side = Rn() < 0.5 ? -1 : 1;
    if (c.beams.some((b) => ss > b.s0 - 2 && ss < b.s1 + 2) || curv(ss - 1, ss + 1) > 0.25) continue;
    const fr = frame(c, ss), wd = 1.5, len = 3 + Rn() * 2;
    const ang = Math.atan2(fr.ny * side, fr.nx * side) + (Rn() - 0.5) * 0.8;
    const ex = fr.x + fr.nx * side * widthAt(c, ss) / 2, ey = fr.y + fr.ny * side * widthAt(c, ss) / 2;
    const mx = ex + Math.cos(ang) * len / 2, my = ey + Math.sin(ang) * len / 2, fx = ex + Math.cos(ang) * len, fy = ey + Math.sin(ang) * len;
    let ok = true;
    for (let j = 0; j < n && ok; j++) { if (Math.abs(j * DS - ss) < 6) continue; if (Math.hypot(px[j] - mx, py[j] - my) < PW / 2 + 1.5 || Math.hypot(px[j] - fx, py[j] - fy) < PW / 2 + 1.5) ok = false; }
    if (ok) c.stubs.push({ x: ex, y: ey, a: ang, len, wd, s: ss, side });
  }
  cache.set(seed, c);
  return c;
}

// ---------- Geometri ----------
export function frame(c, s) {
  const f = clamp(s / DS, 0, c.n - 1), i = Math.floor(f), j = Math.min(c.n - 1, i + 1), k = f - i;
  const x = c.px[i] + (c.px[j] - c.px[i]) * k, y = c.py[i] + (c.py[j] - c.py[i]) * k;
  let tx = c.tx[i] + (c.tx[j] - c.tx[i]) * k, ty = c.ty[i] + (c.ty[j] - c.ty[i]) * k;
  const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
  return { x, y, tx, ty, nx: -ty, ny: tx };
}
export function world(c, s, u) { const f = frame(c, s); return { x: f.x + f.nx * u, y: f.y + f.ny * u }; }
export function widthAt(c, s) { const f = clamp(s / DS, 0, c.n - 1), i = Math.floor(f), j = Math.min(c.n - 1, i + 1); return c.w[i] + (c.w[j] - c.w[i]) * (f - i); }
export const checkpointS = (c, s) => { let best = 0; for (const v of c.cps) if (v <= s + 1e-6) best = v; return best; };

// ---------- Engel hareketleri (hepsi tohum + zamana bağlı) ----------
export const moverU = (m, t) => Math.sin(t * m.sp + m.ph) * m.amp;
export const spinA = (s, t) => s.ph + t * s.sp;
export const pendTheta = (p, t) => p.amax * Math.sin(t * p.sp + p.ph);
export const pendU = (p, t) => p.arm * Math.sin(pendTheta(p, t));
export const pendLow = (p, t) => p.arm * (1 - Math.cos(pendTheta(p, t))) < 0.6; // bıçak yere yakın mı
// ezici: 0 = yerde, 1 = yukarıda
export function stompH(st, t) {
  const p = frac(t * st.sp + st.ph);
  if (p < 0.5) return 1;
  if (p < 0.62) { const k = (p - 0.5) / 0.12; return 1 - k * k; }
  if (p < 0.8) return 0;
  return (p - 0.8) / 0.2;
}
export const blinkOn = (b, t) => frac(t * b.sp + b.ph) < b.duty;
export const blinkLeft = (b, t) => { const p = frac(t * b.sp + b.ph); return p < b.duty ? (b.duty - p) / b.sp : -(1 - p) / b.sp; }; // + = kalan açık süre, − = açılmasına kalan
export const boulderS = (b, t) => b.s1 - frac((t * b.v + b.ph) / (b.s1 - b.s0)) * (b.s1 - b.s0);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}
// (s,u) noktasında t anında hangi tehlike var? false ya da tür adı
export function hazardHit(c, s, u, t, r = R) {
  for (const m of c.movers) if (Math.abs(s - m.s) < 0.4 + r && Math.abs(u - moverU(m, t)) < m.w / 2 + r) return 'mover';
  for (const sp of c.spinners) if (Math.abs(s - sp.s) < 2 + r) { const a = spinA(sp, t); if (segDist(s, u, sp.s - Math.cos(a) * sp.len, sp.u - Math.sin(a) * sp.len, sp.s + Math.cos(a) * sp.len, sp.u + Math.sin(a) * sp.len) < r + 0.14) return 'spinner'; }
  for (const p of c.pends) if (Math.abs(s - p.s) < 0.25 + r && pendLow(p, t) && Math.abs(u - pendU(p, t)) < 0.35 + r) return 'pend';
  for (const st of c.stomps) if (Math.abs(s - st.s) < 0.5 + r && Math.abs(u - st.u) < st.wu / 2 + r * 0.5 && stompH(st, t) < 0.3) return 'stomp';
  for (const b of c.boulders) if (s > b.s0 - 1 && s < b.s1 + 1 && Math.hypot(s - boulderS(b, t), u - b.u) < b.r + r - 0.05) return 'boulder';
  return false;
}
// Ayağının altında zemin var mı? (yol genişliği, sönen platformlar, sahte kollar)
export function onGround(c, s, u, t) {
  if (Math.abs(u) <= widthAt(c, s) / 2 + 0.08) {
    for (const b of c.blinks) if (s >= b.s0 && s <= b.s1 && !blinkOn(b, t)) return false;
    return true;
  }
  const p = world(c, s, u);
  return c.stubs.some((st) => { const dx = p.x - st.x, dy = p.y - st.y, cs = Math.cos(st.a), sn = Math.sin(st.a); const al = dx * cs + dy * sn, ac = -dx * sn + dy * cs; return al >= -0.3 && al <= st.len && Math.abs(ac) <= st.wd / 2; });
}
// duvarlarla çarpışma (s,u uzayında): daireyi dikdörtgenlerin dışına it
function pushWalls(c, p) {
  for (const w of c.walls) {
    if (Math.abs(p.s - w.s) > 0.3 + R) continue;
    for (const [a, b] of w.segs) {
      const cu = clamp(p.u, a, b), cs = clamp(p.s, w.s - 0.3, w.s + 0.3);
      const du = p.u - cu, ds = p.s - cs, d = Math.hypot(du, ds);
      if (d < R) { if (d < 1e-6) p.s = w.s + (p.s > w.s ? 0.3 + R : -0.3 - R); else { p.u = cu + (du / d) * R; p.s = cs + (ds / d) * R; } }
    }
  }
}

export function createSim(players, g) {
  const c = course(g.seed);
  const teams = g.teams.map((t) => ({ ...t, s: 0, u: 0, stun: 0, fall: 0, done: null, hits: 0, cp: 0, ping: null, skill: 0.78 + Math.random() * 0.17, think: 0, tu: 0 }));
  return { t: 0, phase: 'wait', cd: 3, seed: g.seed, c, teams, events: [] };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = 3; } };

// Bot koşucu: en yakın engele göre şerit seçer, tehlikeyi ~1 sn ileriye tahmin edip bekler
export function botRun(sim, tm, dt) {
  const c = sim.c, el = sim.t - (sim.t0 || 0), sp = SPEED * tm.skill;
  tm.think -= dt;
  const w = widthAt(c, tm.s);
  const wall = c.walls.find((o) => o.s > tm.s - 0.2 && o.s < tm.s + 4.5);
  if (tm.think <= 0) {
    tm.think = 0.15;
    // şerit kısıtları: hangi engel daha yakınsa onun şeridi geçerli (bitişi geçilince sıradaki)
    const cons = [];
    if (wall) cons.push({ at: wall.s, end: wall.s, u: wall.gaps.reduce((best, gp) => { const mid = (gp[0] + gp[1]) / 2; return best === null || Math.abs(mid - tm.u) < Math.abs(best - tm.u) ? mid : best; }, null) });
    const spn = c.spinners.find((o) => o.s > tm.s - 0.5 && o.s < tm.s + 4.5);
    if (spn) { const ws = widthAt(c, spn.s), left = spn.u - spn.len + ws / 2, right = ws / 2 - (spn.u + spn.len); cons.push({ at: spn.s, end: spn.s, u: left > right ? -ws / 2 + left / 2 : ws / 2 - right / 2 }); }
    const st = c.stomps.find((o) => o.s > tm.s - 0.5 && o.s < tm.s + 4.5);
    if (st) cons.push({ at: st.s, end: st.s, u: st.wu < PW ? -st.u : tm.u });
    const bo = c.boulders.find((o) => tm.s > o.s0 - 3 && tm.s < o.s1 + 0.5);
    if (bo) cons.push({ at: bo.s0 - 3, end: bo.s1, u: -bo.u });
    const bm = c.beams.find((o) => tm.s > o.s0 - 2.5 && tm.s < o.s1 + 0.5);
    if (bm) cons.push({ at: bm.s0 - 2.5, end: bm.s1, u: 0 });
    cons.sort((p, q) => p.at - q.at);
    const want = cons.length ? cons[0].u : 0;
    // kirişten çıkarken erken yana kaçıp düşme: önümüzdeki 1 birimin en dar genişliğiyle sınırla
    const wmin = Math.min(w, widthAt(c, tm.s + 0.5), widthAt(c, tm.s + 1));
    tm.want = want;
    tm.tu = clamp(want, -wmin / 2 + 0.45, wmin / 2 - 0.45);
    // tehlike tahmini ufku: şeridi belirleyen engelin biraz ötesi (sonraki engel için şerit sonra seçilir)
    tm.hor = cons.length ? cons[0].end + 1.2 : Infinity;
  }
  // önümdeki yolu ileriye tahmin et; çarpacaksam bekle/geri çekil
  let danger = false;
  const lat = sp * 0.85;
  for (let k = 1; k <= 14 && !danger; k++) {
    const dtk = k * 0.075, ss = tm.s + dtk * sp * 0.95, uu = tm.u + clamp(tm.tu - tm.u, -lat * dtk, lat * dtk);
    if (ss > (tm.hor ?? Infinity)) break;
    danger = !!hazardHit(c, ss, uu, el + dtk, R + 0.12);
  }
  // bulunduğum yere 0,6 sn içinde tehlike geliyorsa (yanal kayarken bile) geri çekil
  let here = false;
  for (let k = 1; k <= 8 && !here; k++) here = !!hazardHit(c, tm.s, tm.u + clamp(tm.tu - tm.u, -sp * k * 0.075, sp * k * 0.075), el + k * 0.075, R + 0.2);
  // sönen platform: ancak tüm geçiş boyunca açık kalacaksa gir; içindeysen asla durma
  const inside = c.blinks.find((b) => tm.s >= b.s0 - 0.05 && tm.s <= b.s1);
  const next = c.blinks.find((b) => tm.s < b.s0 && tm.s > b.s0 - 0.5);
  let wait = false;
  if (next && !inside) { const need = (next.s1 - tm.s) / sp + 0.35; wait = blinkLeft(next, el) < need; }
  // istenen şerit genişlik yüzünden ulaşılamıyorsa beklemek yerine yavaşça ilerle (yol açılır)
  const creep = Math.abs((tm.want ?? 0) - tm.tu) > 0.05 ? 0.35 : 0;
  let fwd = inside ? 1 : wait ? 0 : danger ? (here ? -0.8 : creep) : 1;
  const du = tm.tu - tm.u;
  if (wall && wall.s > tm.s && wall.s - tm.s < 1.4 && Math.abs(du) > 0.35) fwd = Math.min(fwd, 0);
  const fr = frame(c, tm.s), lu = here ? 0 : clamp(du * 3, -1, 1); // geri çekilirken yana kaymaz
  return { x: fwd * fr.tx + lu * fr.nx, y: fwd * fr.ty + lu * fr.ny };
}

function respawn(c, tm) { tm.s = checkpointS(c, tm.s); tm.u = 0; tm.tu = 0; tm.think = 0; }

export function stepSim(sim, dt, inputs) {
  sim.events = [];
  sim.t += dt;
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd); sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep' });
    if (sim.cd <= 0) { sim.phase = 'run'; sim.t0 = sim.t; sim.events.push({ e: 'go' }); }
    return sim.events;
  }
  if (sim.phase !== 'run') return sim.events;
  const c = sim.c, el = sim.t - sim.t0;
  for (const tm of sim.teams) {
    const gi = inputs[tm.guide];
    if (gi && gi.ping && (!tm.ping || gi.ping[2] !== tm.ping[2])) { tm.ping = [gi.ping[0], gi.ping[1], gi.ping[2], el]; sim.events.push({ e: 'ping', team: tm.id }); }
    if (tm.done !== null) continue;
    if (tm.fall > 0) {
      tm.fall -= dt;
      if (tm.fall <= 0) { tm.fall = 0; tm.hits++; respawn(c, tm); tm.stun = 0.6; sim.events.push({ e: 'respawn', team: tm.id }); }
      continue;
    }
    if (tm.stun > 0) { tm.stun -= dt; continue; }
    const inp = tm.botRunner ? botRun(sim, tm, dt) : inputs[tm.runner] || {};
    let ix = inp.x || 0, iy = inp.y || 0;
    const L2 = Math.hypot(ix, iy);
    if (L2 > 1) { ix /= L2; iy /= L2; }
    const sp = SPEED * (tm.botRunner ? tm.skill : 1);
    const fr = frame(c, tm.s);
    const vs = ix * fr.tx + iy * fr.ty, vu = ix * fr.nx + iy * fr.ny;
    const p = { s: clamp(tm.s + vs * sp * dt, 0, c.LEN), u: tm.u + vu * sp * dt };
    for (const b of c.belts) if (p.s >= b.s0 && p.s <= b.s1) p.u += b.v * dt;
    pushWalls(c, p);
    tm.s = p.s; tm.u = p.u;
    if (!onGround(c, tm.s, tm.u, el)) {
      const w = world(c, tm.s, tm.u);
      tm.fall = FALL_T;
      sim.events.push({ e: 'fall', team: tm.id, x: w.x, y: w.y });
      continue;
    }
    const hz = hazardHit(c, tm.s, tm.u, el);
    if (hz) {
      const w = world(c, tm.s, tm.u);
      tm.hits++; tm.stun = 1.2;
      sim.events.push({ e: 'hit', team: tm.id, kind: hz, x: w.x, y: w.y });
      respawn(c, tm);
    }
    while (tm.cp + 1 < c.cps.length && tm.s >= c.cps[tm.cp + 1]) { tm.cp++; sim.events.push({ e: 'cp', team: tm.id, n: tm.cp }); }
    if (tm.s >= c.LEN - 0.6) { tm.done = el; sim.events.push({ e: 'finish', team: tm.id }); }
  }
  if (sim.teams.every((tm) => tm.done !== null) || el > MAX_TIME) { sim.phase = 'done'; sim.events.push({ e: 'done' }); }
  return sim.events;
}

export function rankingOf(sim) {
  const key = (tm) => (tm.done !== null ? tm.done : 1e6 - tm.s);
  return sim.teams.slice().sort((a, b) => key(a) - key(b)).map((tm) => tm.members);
}

const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(sim) {
  return { t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), el: r2(sim.t0 ? sim.t - sim.t0 : 0), seed: sim.seed, tm: sim.teams.map((tm) => [tm.id, r2(tm.s), r2(tm.u), tm.done === null ? -1 : r2(tm.done), r2(tm.stun), r2(tm.fall), tm.hits, tm.ping, tm.cp]), ev: sim.events };
}
export function readSnapshot(s) {
  const c = course(s.seed);
  return {
    t: s.t, phase: s.ph, cd: s.cd, el: s.el, seed: s.seed,
    teams: s.tm.map(([id, ps, u, done, stun, fall, hits, ping, cp]) => ({ id, s: ps, u, ...world(c, ps, u), done: done < 0 ? null : done, stun, fall, hits, ping, cp })),
    events: s.ev || [],
  };
}
