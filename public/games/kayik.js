// 🛶 Kayık Kafilesi — ikili takım, gerçek zamanlı nehir yarışı ("Fart Together" esintili)
// Her takım bir kayığı paylaşır: biri SOL küreğe, biri SAĞ küreğe oturur. Kürek çekilen taraf ileri itilir:
// yalnız sol çekerse kayık sağa, yalnız sağ çekerse sola döner; ikisi birlikte = düz ve hızlı.
// Kürek darbeleri ritimlidir; iki taraf aynı anda başlarsa (senkron) ek hız gelir. 💨 gaz patlaması:
// takım arkadaşları 0,3 sn içinde birlikte basarsa güçlü ve dümdüz bir itiş, tek başına basılırsa kayık fırıl döner.
// Parkur tohumdan (seed) üretilen bir nehirdir: virajlar, dar boğazlar, kayalar, sağa sola kayan kütükler,
// girdaplar ve akıntılı bölgeler (rapids). Kıyılar katıdır. Sonunda şelale önünde bitiş kapısı vardır.
//
// Koordinatlar: nehir orta çizgisi DS aralıklı örneklerdir; (s, d) = (akış boyunca mesafe, yanal sapma; + = sol normal).
// Dünya ekseni: x sağa, y aşağı (ekran gibi); h yönü atan2 açısıdır (h artınca saat yönünde = sağa döner).
import { realtimeServer, pairUp } from './util.js';

export const KIND = 'kayik';
export const TITLE = 'Kayık Kafilesi';
export const EMOJI = '🛶';
export const RULES = [
  'İkili takım, tek kayık: biri SOL, biri SAĞ kürekte. Kürek çeken taraf ileri gider — yalnız sol çekerse sağa, yalnız sağ çekerse sola dönersiniz.',
  'İT\'e birlikte basın: aynı ritimde çekmek ekstra hız verir. Çubuğu aşağı çek = geri kürek, yana = hafif dümen.',
  '💨 Gaz patlaması: ikiniz 0,3 sn içinde basarsanız roket gibi düz gider, tek başına basarsan kayık fırıl döner! Şelaleye ilk varan kazanır.',
];
const base = realtimeServer();
export const { realtime, PLACE_MS, normalize, auto, resolve, ranking } = base;

// ---------- Sabitler ----------
export const DS = 0.5;
export const HW = 3.0, HW_START = 3.5, HW_NARROW = 1.75, HW_POOL = 4.3, HW_MAX = 4.4;
export const BOAT_L = 1.7, BOAT_W = 0.86;
export const HULL_R = 0.42, HULL_OFF = 0.45;    // iki çarpışma dairesi: pruva/kıç
export const SEAT = 0.32;                        // koltukların yanal uzaklığı (görsel)
export const MAX_TIME = 180, AFTER_FIRST = 50, COUNTDOWN = 3;
export const STROKE_T = 0.85;                    // kürek darbe periyodu (sn)
export const BURST_CD = 5, SYNC_WIN = 0.3;
export const CP_EVERY = 30, STUCK_T = 7, INV_T = 1.6;
export const CURRENT = 0.65, RAPID_EXTRA = 1.5;
const PADDLE = 2.2;          // tek kürek ileri itişi (ivme)
const BACK = 0.6;            // geri kürek oranı
const ARM = 1.45;            // kürek → dönme (tork / itiş)
const SWEEP = 1.3;           // çubukla dümen torku
const ANG_DRAG = 2.6, LAT_DRAG = 3.5;
const MASS_I = 0.32;         // eylemsizlik momenti (kütle = 1)

// ---------- Rastgelelik / yardımcılar ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
export const angN = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------- Oda / takımlar ----------
export function init(ids, env) {
  env = env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x' + Math.random().toString(36).slice(2, 7), bot: true }) };
  const teams = pairUp(env);
  const bots = new Set(env.players.filter((p) => p.bot).map((p) => p.id));
  const all = teams.flat();
  return {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [],
    seed: (Math.random() * 0x7fffffff) >>> 0,
    // members[0] = SOL kürek, members[1] = SAĞ kürek
    teams: teams.map((m, i) => ({ id: i, members: m, bots: m.map((id) => bots.has(id)) })),
  };
}
export const view = (d) => ({ ...base.view(d), teams: d.g.teams, seed: d.g.seed });

// ---------- Nehir üretimi ----------
const CACHE = new Map();
export function course(seed) {
  seed = seed >>> 0;
  if (CACHE.has(seed)) return CACHE.get(seed);
  const Rn = rng(seed);
  let c = null;
  for (let tries = 0; tries < 30 && !c; tries++) c = tryCourse(seed, Rn);
  if (!c) throw new Error('nehir üretilemedi');
  CACHE.set(seed, c);
  if (CACHE.size > 10) CACHE.delete(CACHE.keys().next().value);
  return c;
}

function centerline(Rn) {
  const target = 205 + Math.floor(Rn() * 30);
  const AMAX = 1.2, MIN_SEP = 2 * HW_MAX + 2.5;
  const px = [0], py = [0];
  let x = 0, y = 0, a = 0, s = 0, fails = 0;
  const plan = [{ len: 14, turn: 0 }];
  while (s < target) {
    if (!plan.length) {
      const r = Rn(), sg = Rn() < 0.5 ? -1 : 1;
      if (r < 0.25) plan.push({ len: 6 + Rn() * 7, turn: 0 });                              // düz
      else if (r < 0.6) plan.push({ len: 8 + Rn() * 6, turn: sg * (0.6 + Rn() * 0.6) });   // kavis
      else if (r < 0.8) plan.push({ len: 5 + Rn() * 1.5, turn: sg * (0.85 + Rn() * 0.3) }); // keskin viraj
      else { const t = sg * (0.6 + Rn() * 0.5); plan.push({ len: 6 + Rn() * 3, turn: t }, { len: 6 + Rn() * 3, turn: -t }); } // S
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
      for (let j = 0; j < px.length - 40; j++) if (Math.hypot(px[j] - x, py[j] - y) < MIN_SEP) { ok = false; break; }
      if (ok) { px.push(x); py.push(y); }
    }
    if (!ok && fails < 25) { fails++; px.length = sn; py.length = sn; x = sx; y = sy; a = sa; plan.length = 0; plan.push({ len: 4, turn: -sa * 0.7 }); continue; }
    fails = 0;
    s = (px.length - 1) * DS;
  }
  // bitiş düzlüğü (bitiş kapısı + şelale)
  for (let i = 0; i < 28; i++) { a *= 0.9; x += Math.sin(a) * DS; y -= Math.cos(a) * DS; px.push(x); py.push(y); }
  return { px, py };
}

function tryCourse(seed, Rn) {
  const { px, py } = centerline(Rn);
  const n = px.length, LEN = (n - 1) * DS;
  const tx = new Float32Array(n), ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = px[i1] - px[i0], dy = py[i1] - py[i0], d = Math.hypot(dx, dy) || 1;
    tx[i] = dx / d; ty[i] = dy / d;
  }
  // eğrilik (±2 birim pencerede en büyük) → kıvrımda yatak katlanmasın
  const kap = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
    const a0 = Math.atan2(ty[i0], tx[i0]), a1 = Math.atan2(ty[i1], tx[i1]);
    kap[i] = Math.abs(angN(a1 - a0)) / Math.max(DS, (i1 - i0) * DS);
  }
  const kmax = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = -4; k <= 4; k++) m = Math.max(m, kap[clamp(i + k, 0, n - 1)]); kmax[i] = m; }
  const heading = (s) => { const i = clamp(Math.round(s / DS), 0, n - 1); return Math.atan2(ty[i], tx[i]); };
  const curv = (s0, s1) => Math.abs(angN(heading(s1) - heading(s0)));

  const FIN = LEN - 7;
  const cps = [];
  for (let cs = 0; cs < FIN - 12; cs += CP_EVERY) cps.push(cs);
  const c = { seed, LEN, FIN, n, px, py, tx, ty, kap, w: new Float32Array(n), cps, rocks: [], logs: [], whirls: [], rapids: [], narrows: [] };
  const ph1 = Rn() * TAU, ph2 = Rn() * TAU;
  const baseW = (s) => (s < 16 ? HW_START : HW + 0.35 * Math.sin(s * 0.11 + ph1) + 0.25 * Math.sin(s * 0.23 + ph2));

  // engeller: yol boyunca birbiriyle çakışmayan yuvalar
  let sp = 20;
  while (sp < FIN - 12) {
    const r = Rn();
    const kind = r < 0.34 ? 'rocks' : r < 0.52 ? 'log' : r < 0.67 ? 'whirl' : r < 0.82 ? 'rapids' : 'narrow';
    const foot = { rocks: 2, log: 1.5, whirl: 6, rapids: 11 + Rn() * 4, narrow: 6 + Rn() * 3 }[kind];
    const cp = cps.find((v) => v > sp - 4 && v < sp + foot + 4);
    if (cp !== undefined) { sp = cp + 4; continue; }
    if (sp + foot > FIN - 10) break;
    if ((kind === 'narrow' || kind === 'whirl' || kind === 'log') && curv(sp - 3, sp + foot + 3) > 0.4) { sp += 1.5; continue; }
    const s0 = Math.round(sp * 10) / 10;
    if (kind === 'narrow') c.narrows.push({ s0, s1: Math.round((s0 + foot) * 10) / 10 });
    else if (kind === 'whirl') c.whirls.push({ s: s0 + foot / 2, d: (Rn() < 0.5 ? -1 : 1) * (1.0 + Rn() * 0.7), r: 1.5 + Rn() * 0.4, spin: Rn() < 0.5 ? -1 : 1 });
    else if (kind === 'rapids') {
      const rp = { s0, s1: Math.round((s0 + foot) * 10) / 10 };
      c.rapids.push(rp);
      if (Rn() < 0.6) c.rocks.push({ s: s0 + foot * (0.35 + Rn() * 0.3), d: (Rn() - 0.5) * 2.4, r: 0.4 + Rn() * 0.15 });
    } else if (kind === 'log') c.logs.push({ s: s0 + 0.75, half: 1.05, r: 0.26, w: 0.6 + Rn() * 0.45, ph: Rn() * TAU, amp: 0 });
    else {
      // kaya kümesi: 1-3 kaya, en az bir geçit açık
      const nr = 1 + Math.floor(Rn() * 3);
      const gapC = (Rn() - 0.5) * 2.6; // açık kalacak geçidin merkezi
      for (let k = 0; k < nr; k++) {
        const rr = 0.45 + Rn() * 0.35;
        let d = (Rn() - 0.5) * 2 * 2.4;
        if (Math.abs(d - gapC) < 1.3 + rr) d = gapC + Math.sign(d - gapC || 1) * (1.3 + rr);
        c.rocks.push({ s: s0 + k * 0.6 + Rn() * 0.4, d: clamp(d, -2.6, 2.6), r: rr });
      }
    }
    sp += foot + 4 + Rn() * 4;
  }
  // genişlik profili
  for (let i = 0; i < n; i++) {
    const s = i * DS;
    let hw = baseW(s);
    for (const nw of c.narrows) { const dd = s < nw.s0 ? nw.s0 - s : s > nw.s1 ? s - nw.s1 : 0; if (dd < 3) hw = Math.min(hw, HW_NARROW + (hw - HW_NARROW) * smooth(dd / 3)); }
    for (const wh of c.whirls) { const dd = Math.abs(s - wh.s); if (dd < 6) hw = Math.max(hw, hw + (HW_POOL - hw) * smooth((6 - dd) / 3)); }
    // kıvrımda iç kıyı katlanmasın
    if (kmax[i] > 1e-3) hw = Math.min(hw, 0.82 / kmax[i]);
    c.w[i] = clamp(hw, HW_NARROW, HW_MAX);
  }
  // kaya ve girdaplar kıyıya gömülmesin; kütük genliği
  // kayık sıkışmasın: kaya-kıyı ve kaya-kaya arasında ya geçilebilir (≥1,4) ya da kapalı (≈0) aralık kalsın
  const GAP = 1.4;
  for (let it = 0; it < 3; it++) for (const rk of c.rocks) {
    const hw = widthAt(c, rk.s), gap = hw - Math.abs(rk.d) - rk.r;
    if (gap < GAP) rk.d = Math.sign(rk.d || 1) * (hw - rk.r + 0.15);
    for (const o of c.rocks) {
      if (o === rk) continue;
      const ds = Math.abs(o.s - rk.s), dd = o.d - rk.d, g = Math.hypot(ds, dd) - o.r - rk.r;
      if (g > 0 && g < GAP && ds < o.r + rk.r) rk.d = o.d - Math.sign(dd || 1) * Math.sqrt(Math.max(0, (o.r + rk.r - 0.1) ** 2 - ds * ds));
    }
  }
  for (const wh of c.whirls) { const hw = widthAt(c, wh.s); wh.d = clamp(wh.d, -hw + wh.r * 0.6, hw - wh.r * 0.6); }
  for (const lg of c.logs) lg.amp = Math.max(0.6, widthAt(c, lg.s) - lg.half - 0.45);
  // botlar için en iyi yol (statik engellerden kaçan yumuşak çizgi); yol yoksa parkur reddedilir
  if (!botLine(c)) return null;
  return c;
}

// Dinamik programlama: her örnekte yanal ızgara; kaya/girdap/kıyı yasak, eğim sınırlı
function botLine(c) {
  const STEP = 0.2, M = Math.round(HW_MAX / STEP), NJ = 2 * M + 1, n = c.n;
  const cost = new Float32Array(n * NJ), from = new Int16Array(n * NJ);
  const blocked = (i, d) => {
    const s = i * DS, hw = c.w[i];
    if (Math.abs(d) > hw - 0.75) return Infinity;
    let pen = 0.02 * d * d;
    for (const rk of c.rocks) { if (Math.abs(rk.s - s) > 3) continue; const dist = Math.hypot(rk.s - s, rk.d - d) - rk.r; if (dist < 0.68) return Infinity; pen += 1.2 / (0.3 + dist); }
    for (const wh of c.whirls) { if (Math.abs(wh.s - s) > 4) continue; const dist = Math.hypot(wh.s - s, wh.d - d) - wh.r; if (dist < 0.45) return Infinity; pen += 1 / (0.4 + dist); }
    pen += 0.6 / (0.2 + hw - Math.abs(d) - 0.75);
    return pen;
  };
  for (let j = 0; j < NJ; j++) { const v = blocked(0, (j - M) * STEP); cost[j] = v; from[j] = j; }
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < NJ; j++) {
      const v = blocked(i, (j - M) * STEP);
      let best = Infinity, bj = j;
      if (v !== Infinity) for (let k = -2; k <= 2; k++) {
        const jj = j + k; if (jj < 0 || jj >= NJ) continue;
        const cc = cost[(i - 1) * NJ + jj] + Math.abs(k) * 0.08 + (Math.abs(k) === 2 ? 0.15 : 0);
        if (cc < best) { best = cc; bj = jj; }
      }
      cost[i * NJ + j] = v + best; from[i * NJ + j] = bj;
    }
  }
  let bj = -1, bc = Infinity;
  for (let j = 0; j < NJ; j++) if (cost[(n - 1) * NJ + j] < bc) { bc = cost[(n - 1) * NJ + j]; bj = j; }
  if (!isFinite(bc)) return false;
  const raw = new Float32Array(n);
  for (let i = n - 1; i >= 0; i--) { raw[i] = (bj - M) * STEP; bj = from[i * NJ + bj]; }
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, k = 0; for (let q = -3; q <= 3; q++) { const ii = i + q; if (ii < 0 || ii >= n) continue; s += raw[ii]; k++; } line[i] = s / k; }
  c.line = line;
  return true;
}

// ---------- Geometri ----------
export function frame(c, s) {
  const f = clamp(s / DS, 0, c.n - 1), i = Math.floor(f), j = Math.min(c.n - 1, i + 1), k = f - i;
  const x = c.px[i] + (c.px[j] - c.px[i]) * k, y = c.py[i] + (c.py[j] - c.py[i]) * k;
  let tx = c.tx[i] + (c.tx[j] - c.tx[i]) * k, ty = c.ty[i] + (c.ty[j] - c.ty[i]) * k;
  const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
  return { x, y, tx, ty, nx: ty, ny: -tx }; // n = sol normal (y aşağı eksende)
}
export function world(c, s, d) { const f = frame(c, s); return { x: f.x + f.nx * d, y: f.y + f.ny * d }; }
export function widthAt(c, s) { const f = clamp(s / DS, 0, c.n - 1), i = Math.floor(f), j = Math.min(c.n - 1, i + 1); return c.w[i] + (c.w[j] - c.w[i]) * (f - i); }
export function lineAt(c, s) { const f = clamp(s / DS, 0, c.n - 1), i = Math.floor(f), j = Math.min(c.n - 1, i + 1); return c.line[i] + (c.line[j] - c.line[i]) * (f - i); }
// (x,y)'ye en yakın orta çizgi noktası: s ipucu etrafında yerel arama
export function locate(c, x, y, sHint, win = 12) {
  const i0 = Math.round(sHint / DS);
  let bestD = Infinity, bs = 0, bd = 0;
  for (let k = -win; k <= win; k++) {
    const i = i0 + k;
    if (i < 0 || i >= c.n - 1) continue;
    const ax = c.px[i], ay = c.py[i], dx = c.px[i + 1] - ax, dy = c.py[i + 1] - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
    const qx = ax + dx * t - x, qy = ay + dy * t - y, d2 = qx * qx + qy * qy;
    if (d2 < bestD) { bestD = d2; bs = (i + t) * DS; bd = ((x - ax) * dy - (y - ay) * dx) / Math.sqrt(L2); }
  }
  return { s: bs, d: bd };
}
export const checkpointS = (c, s) => { let best = 0; for (const v of c.cps) if (v <= s + 1e-6) best = v; return best; };
export const inRapids = (c, s) => c.rapids.some((r) => s >= r.s0 && s <= r.s1);
// kütük: s konumunda, yanal olarak sallanır (zamana bağlı → her cihazda aynı)
export const logD = (lg, t) => Math.sin(t * lg.w + lg.ph) * lg.amp;
export const logV = (lg, t) => Math.cos(t * lg.w + lg.ph) * lg.amp * lg.w;

// Su akışı (dünya hızı) ve girdap torku
export function water(c, s, d, x, y) {
  const f = frame(c, s), hw = widthAt(c, s);
  let cur = CURRENT;
  for (const r of c.rapids) if (s > r.s0 - 2 && s < r.s1 + 2) cur += RAPID_EXTRA * smooth(Math.min(s - r.s0 + 2, r.s1 + 2 - s) / 2);
  // dar boğazda akış hızlanır
  cur *= clamp(HW / hw, 0.8, 1.45);
  const prof = 1 - 0.45 * Math.min(1, (d / hw) ** 2);
  let vx = f.tx * cur * prof, vy = f.ty * cur * prof, spin = 0;
  for (const wh of c.whirls) {
    if (Math.abs(wh.s - s) > wh.r + 2) continue;
    const w = world(c, wh.s, wh.d), dx = x - w.x, dy = y - w.y, rho = Math.hypot(dx, dy);
    if (rho >= wh.r || rho < 1e-4) continue;
    const k = 1 - rho / wh.r;
    const tv = wh.spin * 2.6 * Math.sqrt(k), pull = 0.9 * k;
    vx += (-dy / rho) * tv - (dx / rho) * pull; vy += (dx / rho) * tv - (dy / rho) * pull;
    spin += wh.spin * 3.2 * k;
  }
  return { vx, vy, spin };
}

// ---------- Simülasyon ----------
export function createSim(players, g) {
  const seed = g && g.seed != null ? g.seed >>> 0 : (Math.random() * 0x7fffffff) >>> 0;
  const c = course(seed);
  const R = rng(seed ^ 0x2545f491);
  const pb = new Map((players || []).map((p) => [p.id, !!p.bot]));
  const tdefs = g && g.teams ? g.teams : (() => { const ids = players.map((p) => p.id); const out = []; for (let i = 0; i < ids.length; i += 2) out.push({ id: out.length, members: [ids[i], ids[i + 1] || ids[i]], bots: [pb.get(ids[i]), pb.get(ids[i + 1] || ids[i])] }); return out; })();
  const boats = tdefs.map((t, i) => {
    const row = Math.floor(i / 3), col = i % 3, nInRow = Math.min(3, tdefs.length - row * 3);
    const s = 10 - row * 2.2, d = nInRow === 1 ? 0 : nInRow === 2 ? (col ? -1 : 1) * 1.1 : (1 - col) * 1.9;
    const p = world(c, s, d), f = frame(c, s);
    const bots = t.members.map((id, k) => (pb.has(id) ? pb.get(id) : !!(t.bots && t.bots[k])));
    return {
      id: t.id, members: t.members.slice(), bots,
      x: p.x, y: p.y, h: Math.atan2(f.ty, f.tx), vx: 0, vy: 0, w: 0, s, d,
      seats: [0, 1].map(() => ({ mode: 0, ph: 0, idle: 1, cd: 0, sweep: 0, wantSync: 0 })),
      pend: null, bfx: 0, bsync: 0, sync: 0, done: null, inv: 0, cp: 0, bestS: s, progT: 0, hint: 0, hits: 0,
      skill: 0.95 + R() * 0.05, plan: null, planT: -1, joinAt: null,
    };
  });
  return { t: 0, phase: 'wait', cd: COUNTDOWN, el: 0, seed, c, boats, firstDone: null, events: [] };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = COUNTDOWN; } };

// Oyuncu kumandası → koltuk komutu. inp: { push, y, x, bomb }
function seatCmd(inp) {
  inp = inp || {};
  const y = inp.y || 0;
  const mode = inp.push || y < -0.5 ? 1 : y > 0.5 ? -1 : 0;
  const x = inp.x || 0;
  return { mode, sweep: Math.abs(x) > 0.2 ? clamp(x, -1, 1) : 0, burst: !!inp.bomb };
}

function hullPts(b) {
  const fx = Math.cos(b.h), fy = Math.sin(b.h);
  return [[b.x + fx * HULL_OFF, b.y + fy * HULL_OFF, HULL_OFF], [b.x - fx * HULL_OFF, b.y - fy * HULL_OFF, -HULL_OFF]];
}
// nokta (px,py)'de normal n yönünde çarpışma itkisi; (ovx,ovy) = engelin hızı
function impulse(b, px, py, nx, ny, e, ovx = 0, ovy = 0) {
  const rx = px - b.x, ry = py - b.y;
  const vpx = b.vx - b.w * ry - ovx, vpy = b.vy + b.w * rx - ovy;
  const vn = vpx * nx + vpy * ny;
  if (vn >= 0) return 0;
  const rn = rx * ny - ry * nx;
  const j = -(1 + e) * vn / (1 + (rn * rn) / MASS_I);
  b.vx += nx * j; b.vy += ny * j; b.w += (rn * j) / MASS_I;
  // sürtünme: teğetsel hız biraz azalır
  const tx = -ny, ty = nx, vt = vpx * tx + vpy * ty;
  b.vx -= tx * vt * 0.12; b.vy -= ty * vt * 0.12;
  return -vn;
}

function stepBoat(sim, b, inputs, dt) {
  const c = sim.c;
  const racing = sim.phase === 'race' && b.done === null;
  const el = sim.el;
  // koltuk komutları
  const cmds = [0, 1].map((k) => (b.bots[k] ? botSeat(sim, b, k) : seatCmd(inputs[b.members[k]])));
  let F = 0, tq = 0;
  for (let k = 0; k < 2; k++) {
    const st = b.seats[k], cm = racing ? cmds[k] : { mode: 0, sweep: 0, burst: false };
    if (cm.mode === 1 && st.mode !== 1 && st.idle > 0.3) {
      // yeni darbe dizisi: baştan başlar; bot ise arkadaşının ritmine uyar
      const o = b.seats[1 - k];
      st.ph = b.bots[k] && o.mode === 1 ? o.ph : 0;
    }
    st.mode = cm.mode; st.sweep = cm.sweep;
    if (st.mode === 0) st.idle += dt; else st.idle = 0;
    if (st.mode !== 0) st.ph = (st.ph + dt / STROKE_T) % 1;
    if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);
    if (cm.burst && racing && st.cd <= 0) {
      st.cd = BURST_CD;
      if (b.pend && b.pend.seat !== k && el - b.pend.t <= SYNC_WIN) {
        // senkron gaz patlaması: güçlü ve düz
        const fx = Math.cos(b.h), fy = Math.sin(b.h);
        b.vx += fx * 4.2; b.vy += fy * 4.2; b.w *= 0.25;
        b.pend = null; b.bfx = 0.9; b.bsync = 1;
        sim.events.push({ e: 'burst', team: b.id, sync: 1, x: b.x, y: b.y });
      } else if (!b.pend) b.pend = { seat: k, t: el };
    }
  }
  // bot arkadaş insanın gazına katılır
  if (b.pend && b.joinAt !== null && el >= b.joinAt) {
    const k = 1 - b.pend.seat;
    b.joinAt = null;
    if (b.bots[k] && b.seats[k].cd <= 0) {
      b.seats[k].cd = BURST_CD;
      const fx = Math.cos(b.h), fy = Math.sin(b.h);
      b.vx += fx * 4.2; b.vy += fy * 4.2; b.w *= 0.25;
      b.pend = null; b.bfx = 0.9; b.bsync = 1;
      sim.events.push({ e: 'burst', team: b.id, sync: 1, x: b.x, y: b.y });
    }
  }
  if (b.pend && el - b.pend.t > SYNC_WIN) {
    // tek başına gaz: az ileri, çok dönme
    const fx = Math.cos(b.h), fy = Math.sin(b.h), sg = b.pend.seat === 0 ? 1 : -1;
    b.vx += fx * 1.4; b.vy += fy * 1.4; b.w += sg * 5.2;
    sim.events.push({ e: 'burst', team: b.id, sync: 0, seat: b.pend.seat, x: b.x, y: b.y });
    b.pend = null; b.bfx = 0.7; b.bsync = 0;
  }
  if (b.bfx > 0) b.bfx = Math.max(0, b.bfx - dt);
  const both = b.seats[0].mode === 1 && b.seats[1].mode === 1;
  b.sync = both ? Math.cos(TAU * (b.seats[0].ph - b.seats[1].ph)) : 0;
  const bonus = 1 + 0.28 * Math.max(0, b.sync);
  for (let k = 0; k < 2; k++) {
    const st = b.seats[k];
    let T = 0;
    if (st.mode === 1) T = PADDLE * (1 + 0.55 * Math.sin(TAU * st.ph)) * (both ? bonus : 1);
    else if (st.mode === -1) T = -PADDLE * BACK;
    T *= b.bots[k] ? b.skill : 1;
    F += T;
    tq += (k === 0 ? 1 : -1) * ARM * T;
    tq += st.sweep * SWEEP;
  }
  if (!racing && sim.phase !== 'race') { b.vx = b.vy = b.w = 0; return; } // geri sayım: kayıklar bekler
  // su
  const wt = water(c, b.s, b.d, b.x, b.y);
  const fx = Math.cos(b.h), fy = Math.sin(b.h), lx = fy, ly = -fx;
  const rvx = b.vx - wt.vx, rvy = b.vy - wt.vy;
  const vf = rvx * fx + rvy * fy, vl = rvx * lx + rvy * ly;
  const done = b.done !== null;
  const af = -(0.4 + 0.25 * Math.abs(vf) + (done ? 2 : 0)) * vf + F;
  const al = -LAT_DRAG * vl;
  b.vx += (fx * af + lx * al) * dt; b.vy += (fy * af + ly * al) * dt;
  b.w += (tq + wt.spin - ANG_DRAG * b.w) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.h = angN(b.h + b.w * dt);
  // konum (s, d)
  const loc = locate(c, b.x, b.y, b.s);
  b.s = loc.s; b.d = loc.d;
  collideStatic(sim, b);
}

// kıyılar, kayalar, kütükler, nehrin başı/sonu
function collideStatic(sim, b) {
  const c = sim.c;
  let hit = 0;
  for (const [hx, hy] of hullPts(b)) {
    const L = locate(c, hx, hy, b.s);
    const hw = widthAt(c, L.s), lim = hw - HULL_R;
    if (Math.abs(L.d) > lim) {
      const f = frame(c, L.s), sg = Math.sign(L.d), pen = Math.abs(L.d) - lim;
      const nx = -f.nx * sg, ny = -f.ny * sg; // içeri doğru
      b.x += nx * pen; b.y += ny * pen;
      hit = Math.max(hit, impulse(b, hx, hy, nx, ny, 0.3));
    }
    if (L.s < 0.6) { const f = frame(c, 0); const pen = 0.6 - L.s; b.x += f.tx * pen; b.y += f.ty * pen; impulse(b, hx, hy, f.tx, f.ty, 0.2); }
    if (L.s > c.LEN - 1.2) { const f = frame(c, c.LEN); const pen = L.s - (c.LEN - 1.2); b.x -= f.tx * pen; b.y -= f.ty * pen; impulse(b, hx, hy, -f.tx, -f.ty, 0.1); }
  }
  for (const rk of c.rocks) {
    if (Math.abs(rk.s - b.s) > 3) continue;
    const p = world(c, rk.s, rk.d);
    for (const [hx, hy] of hullPts(b)) {
      const dx = hx - p.x, dy = hy - p.y, dd = Math.hypot(dx, dy), m = rk.r + HULL_R;
      if (dd >= m || dd < 1e-6) continue;
      const nx = dx / dd, ny = dy / dd;
      b.x += nx * (m - dd); b.y += ny * (m - dd);
      hit = Math.max(hit, impulse(b, hx, hy, nx, ny, 0.35));
    }
  }
  for (const lg of c.logs) {
    if (Math.abs(lg.s - b.s) > 3) continue;
    const f = frame(c, lg.s), ld = logD(lg, sim.el), lv = logV(lg, sim.el);
    const cx = f.x + f.nx * ld, cy = f.y + f.ny * ld;
    for (const [hx, hy] of hullPts(b)) {
      // kütük: yanal eksen boyunca kapsül
      const rx = hx - cx, ry = hy - cy;
      const along = clamp(rx * f.nx + ry * f.ny, -lg.half, lg.half);
      const qx = cx + f.nx * along, qy = cy + f.ny * along;
      const dx = hx - qx, dy = hy - qy, dd = Math.hypot(dx, dy), m = lg.r + HULL_R;
      if (dd >= m || dd < 1e-6) continue;
      const nx = dx / dd, ny = dy / dd;
      b.x += nx * (m - dd); b.y += ny * (m - dd);
      hit = Math.max(hit, impulse(b, hx, hy, nx, ny, 0.4, f.nx * lv, f.ny * lv));
    }
  }
  if (hit > 0.9 && b.done === null) { b.hits++; sim.events.push({ e: 'bump', team: b.id, x: b.x, y: b.y, k: Math.min(3, Math.round(hit)) }); }
}

function collideBoats(sim) {
  const list = sim.boats.filter((b) => b.done === null && b.inv <= 0);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2) continue;
    for (const [ax, ay] of hullPts(a)) for (const [bx, by] of hullPts(b)) {
      const dx = bx - ax, dy = by - ay, dd = Math.hypot(dx, dy), m = HULL_R * 2;
      if (dd >= m || dd < 1e-6) continue;
      const nx = dx / dd, ny = dy / dd, pen = (m - dd) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const jj = -vn * 0.65;
        a.vx -= nx * jj; a.vy -= ny * jj; b.vx += nx * jj; b.vy += ny * jj;
        // çarpışma noktası dönmeye de etki eder
        const ra = (ax - a.x) * ny - (ay - a.y) * nx, rb = (bx - b.x) * ny - (by - b.y) * nx;
        a.w -= ra * jj * 0.8; b.w += rb * jj * 0.8;
        if (-vn > 1) sim.events.push({ e: 'bump', team: a.id, x: (ax + bx) / 2, y: (ay + by) / 2, k: 1 });
      }
    }
  }
}

function respawn(sim, b) {
  const c = sim.c, s = Math.max(4, checkpointS(c, b.bestS) + 1), d = lineAt(c, s);
  const p = world(c, s, d), f = frame(c, s);
  b.x = p.x; b.y = p.y; b.h = Math.atan2(f.ty, f.tx); b.vx = b.vy = b.w = 0; b.s = s; b.d = d;
  b.inv = INV_T; b.progT = sim.el; b.bestS = s; b.pend = null; b.revT = 0; b.slowT = 0;
  sim.events.push({ e: 'respawn', team: b.id, x: p.x, y: p.y });
}

export function stepSim(sim, dt, inputs) {
  sim.events = [];
  sim.t += dt;
  inputs = inputs || {};
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd); sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep', n: Math.ceil(sim.cd) });
    if (sim.cd <= 0) { sim.phase = 'race'; sim.t0 = sim.t; sim.events.push({ e: 'go' }); }
  }
  if (sim.phase === 'race') sim.el = sim.t - sim.t0;
  if (sim.phase === 'done') return sim.events;
  for (const b of sim.boats) {
    if (b.inv > 0) b.inv = Math.max(0, b.inv - dt);
    stepBoat(sim, b, inputs, dt);
  }
  if (sim.phase !== 'race') return sim.events;
  collideBoats(sim);
  const c = sim.c;
  for (const b of sim.boats) {
    const loc = locate(c, b.x, b.y, b.s); // çarpışma itmelerinden sonra güncel (s, d)
    b.s = loc.s; b.d = loc.d;
    if (b.done !== null) continue;
    if (b.s > b.bestS + 0.8) { b.bestS = b.s; b.progT = sim.el; }
    while (b.cp + 1 < c.cps.length && b.s >= c.cps[b.cp + 1]) { b.cp++; sim.events.push({ e: 'cp', team: b.id, n: b.cp }); }
    if (b.s >= c.FIN) {
      b.done = sim.el;
      if (sim.firstDone === null) sim.firstDone = sim.el;
      sim.events.push({ e: 'finish', team: b.id, place: sim.boats.filter((o) => o.done !== null).length, x: b.x, y: b.y });
    } else if (sim.el - b.progT > STUCK_T) respawn(sim, b);
  }
  if (sim.boats.every((b) => b.done !== null) || sim.el > MAX_TIME || (sim.firstDone !== null && sim.el - sim.firstDone > AFTER_FIRST)) {
    sim.phase = 'done'; sim.events.push({ e: 'done' });
  }
  return sim.events;
}

export function standings(boats) {
  const key = (b) => (b.done !== null ? b.done - 1e6 : -b.s);
  return boats.slice().sort((a, b) => key(a) - key(b));
}
export const rankingOf = (sim) => standings(sim.boats).map((b) => b.members.filter((id, i, a) => a.indexOf(id) === i));

// ---------- Bot kürekçi ----------
// Takım planı: bot çizgisini (statik engellerden kaçan) izler; yön hatasına göre hangi kürek çekecek.
// Kütük yaklaşırken çarpışma tahmini varsa geri kürek çekip bekler. Düzlükte gazı birlikte basar.
function teamPlan(sim, b) {
  if (b.planT === sim.t) return b.plan;
  const c = sim.c, el = sim.el;
  const sp = Math.hypot(b.vx, b.vy);
  const LA = 2.0 + 0.45 * sp;
  const st = Math.min(c.LEN - 1, b.s + LA);
  // kütük: varış anında hangi yan boş? (kütüğün uzağındaki yana yönel, hiçbiri boş değilse bekle)
  let hold = false, logTarget = null;
  const lg = c.logs.find((o) => o.s - b.s > -0.8 && o.s - b.s < 7);
  if (lg) {
    const ahead = lg.s - b.s, vgo = Math.max(1.8, sp), hw = widthAt(c, lg.s);
    const tA = Math.max(0, (ahead - 1.1) / vgo), tB = Math.max(tA + 0.3, (ahead + 1.1) / vgo);
    let best = null, bestC = -Infinity;
    for (const d of [-(hw - 0.95), -(hw - 0.95) / 2, 0, (hw - 0.95) / 2, hw - 0.95]) {
      let cl = Infinity;
      for (let q = 0; q <= 8; q++) { const tt = tA + (tB - tA) * (q / 8); cl = Math.min(cl, Math.abs(logD(lg, el + tt) - d) - lg.half); }
      cl -= Math.abs(d - b.d) * 0.12; // yakın olanı tercih et
      if (cl > bestC) { bestC = cl; best = d; }
    }
    logTarget = { s: lg.s, d: best };
    if (bestC < 0.62 && ahead > 1.3) hold = true;
  }
  const td = logTarget && st < logTarget.s + 2 ? logTarget.d : lineAt(c, st);
  const tp = world(c, st, td);
  const e = angN(Math.atan2(tp.y - b.y, tp.x - b.x) - b.h);
  const wd = clamp(2.4 * e, -1.7, 1.7), u = wd - b.w;
  let L = 1, Rm = 1, sweep = clamp(u * 1.2, -1, 1);
  if (u > 0.55) { Rm = u > 1.5 ? -1 : 0; } else if (u < -0.55) { L = u < -1.5 ? -1 : 0; }
  if (hold) {
    // yerinde dur: akıntıya karşı hafif geri kürek, yönü dümenle koru
    const f = frame(c, b.s), vdown = b.vx * f.tx + b.vy * f.ty;
    L = Rm = vdown > 0.1 ? -1 : 0;
  }
  // takıldıysa (kürek çekiyor ama ilerlemiyor) bir an geri çekil
  if (!hold && sp < 0.35) b.slowT = (b.slowT || 0) + (sim.t - (b.planT < 0 ? sim.t : b.planT)); else b.slowT = 0;
  if (b.slowT > 1.2) { b.revT = 0.9 + Math.random() * 0.4; b.slowT = 0; }
  if (b.revT > 0) { b.revT -= sim.t - (b.planT < 0 ? sim.t : b.planT); L = Rm = -1; }
  // gaz: önümüz düz ve boşsa
  let burst = false;
  if (!hold && Math.abs(e) < 0.12 && Math.abs(b.w) < 0.3 && b.s > 14) {
    let clear = true;
    for (let q = 2; q <= 12 && clear; q += 2) { const s2 = b.s + q; if (Math.abs(lineAt(c, s2) - lineAt(c, b.s)) > 0.7 || widthAt(c, s2) < 2.2) clear = false; }
    if (clear) clear = !c.logs.some((lg) => lg.s > b.s && lg.s < b.s + 12) && !c.rocks.some((rk) => rk.s > b.s && rk.s < b.s + 10) && !c.whirls.some((w) => w.s > b.s - 2 && w.s < b.s + 10);
    burst = clear;
  }
  b.plan = { L, R: Rm, sweep, burst, hold };
  b.planT = sim.t;
  return b.plan;
}
export function botSeat(sim, b, k) {
  if (sim.phase !== 'race' || b.done !== null) return { mode: 0, sweep: 0, burst: false };
  const pl = teamPlan(sim, b), other = 1 - k;
  const mode = k === 0 ? pl.L : pl.R;
  // insan arkadaşa ipucu: onun koltuğu ne yapmalı
  if (!b.bots[other]) b.hint = (other === 0 ? pl.L : pl.R) === 1 ? 1 : (other === 0 ? pl.L : pl.R) === -1 ? 2 : 3;
  // arkadaş insan ve gaz bekliyorsa katıl
  if (b.pend && b.pend.seat === other && !b.bots[other] && b.joinAt === null) b.joinAt = sim.el + 0.06 + Math.random() * 0.14;
  // gazı yalnızca ikisi de botsa bot başlatır (aynı adımda ikisi de basar → senkron)
  const burst = pl.burst && b.bots[other] && b.seats[0].cd <= 0 && b.seats[1].cd <= 0;
  // ritim: ikisi de çekiyorsa arkadaşının fazına yaklaş
  const st = b.seats[k], o = b.seats[other];
  if (mode === 1 && st.mode === 1 && o.mode === 1) { const dph = angN(TAU * (o.ph - st.ph)) / TAU; st.ph = (st.ph + dph * 0.08 + 1) % 1; }
  return { mode, sweep: pl.sweep * 0.5, burst };
}

// ---------- Ağ: anlık görüntü ----------
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
export function snapshot(sim) {
  return {
    t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), el: r2(sim.el), sd: sim.seed,
    b: sim.boats.map((b) => [b.id, r2(b.x), r2(b.y), r2(b.h), r2(b.s), b.done === null ? -1 : r2(b.done), r1(b.inv), b.cp,
      b.seats[0].mode, r2(b.seats[0].ph), r1(b.seats[0].cd), b.seats[1].mode, r2(b.seats[1].ph), r1(b.seats[1].cd),
      r1(Math.hypot(b.vx, b.vy)), r1(b.sync), b.hint, r1(b.bfx), b.bsync, r1(b.w), b.hits, b.pend ? b.pend.seat : -1]),
    ev: sim.events,
  };
}
export function readSnapshot(s) {
  return {
    t: s.t, phase: s.ph, cd: s.cd, el: s.el, seed: s.sd,
    boats: s.b.map(([id, x, y, h, sv, done, inv, cp, m0, p0, c0, m1, p1, c1, sp, sync, hint, bfx, bsync, w, hits, pend]) => ({
      id, x, y, h, s: sv, done: done < 0 ? null : done, inv, cp, sp, sync, hint, bfx, bsync, w, hits, pend,
      seats: [{ mode: m0, ph: p0, cd: c0 }, { mode: m1, ph: p1, cd: c1 }],
    })),
    events: s.ev || [],
  };
}
