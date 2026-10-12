// 🏎️ Pist Canavarı — gerçek zamanlı araba yarışı
// Oyunu oda sahibinin telefonu yönetir (simülasyon burada), diğerleri kumanda gönderir.
// Her yarışta pist farklıdır: oyun durumundaki tohumdan (seed) üretilir. Pist bir köprüyle kendi
// üzerinden geçer; pistin dışı uçurumdur — düşen araba 2,5 sn sonra son güvenli yerinde yeniden doğar.
import { realtimeServer } from './util.js';

export const KIND = 'yaris';
export const TITLE = 'Pist Canavarı';
export const EMOJI = '🏎️';
export const RULES = [
  'Sol başparmak direksiyon, sağda GAZ ve FREN.',
  'Pistin dışı uçurum! Düşersen 2,5 sn sonra geri gelirsin.',
  'Köprüden geç, 3 tur at, çizgiyi ilk geçen kazanır!',
];
export const LAPS = 3;
export const CAR_R = 0.42;                     // çarpışma yarıçapı
const AFTER_FIRST = 20;                        // ilk bitirenden sonra tanınan süre (sn)
const MAX_RACE = 240;                          // en uzun yarış (sn)
export const COUNTDOWN = 3;
export const HALF_W = 2.4;                     // asfalt yarı genişliği
export const CURB = 0.4;                       // bordür genişliği
export const EDGE = 0.3;                       // bordürden sonra düşmeden önce tolerans (araba merkezi için)
export const FALL_LIMIT = HALF_W + CURB + EDGE; // |d| bunu aşarsa araba uçurumdan düşer
export const BRIDGE_H = 2.2;                   // köprü yüksekliği
export const BRIDGE_RAMP = 7;                  // rampa uzunluğu (s boyunca)
export const BRIDGE_TOP = 5;                   // köprü düz kısmının yarı uzunluğu
export const FALL_T = 1.2;                     // düşüş animasyonu (sn)
export const RESPAWN_T = 2.5;                  // düşüşten yeniden doğuşa kadar (sn)
export const INV_T = 1.0;                      // yeniden doğduktan sonra çarpışmasız süre (sn)
export const DS = 0.3;                         // orta çizgi örnekleme aralığı

const base = realtimeServer();
export const { realtime, PLACE_MS, normalize, auto, resolve, ranking } = base;
// Pist tohumu oyun durumunda saklanır ve istemcilere de iletilir (herkes aynı pisti üretir)
export const init = (ids, env) => ({ ...base.init(ids, env), seed: (Math.random() * 0x7fffffff) >>> 0 });
export const view = (d, pid, now) => ({ ...base.view(d, pid, now), seed: d.g.seed });

// ---------- Rastgelelik ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TAU = Math.PI * 2;
const angN = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------- Pist üretimi ----------
// Taban şekil: sekiz (Gerono lemniskatı) + normal yönünde rastgele harmonik dalgalar.
// Aday pist şu koşulları sağlayana kadar yeniden üretilir: tek kesişme (köprü), yeterince dik
// kesişme açısı, keskin olmayan virajlar, kendine çok yaklaşmayan şeritler, makul tur uzunluğu.
function candidate(R) {
  const a = 11 + R() * 3.5, b = 7 + R() * 2.5;
  const H = [];
  for (let k = 2; k <= 5; k++) H.push([(R() - 0.5) * 2 * (0.17 * a) / k, R() * TAU, k]);
  const rot = R() * TAU, mir = R() < 0.5 ? -1 : 1;
  const N = 720, raw = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const x = a * Math.sin(t), y = b * Math.sin(2 * t) / 2;
    const dx = a * Math.cos(t), dy = b * Math.cos(2 * t);
    const L = Math.hypot(dx, dy) || 1;
    let off = 0;
    for (const [amp, ph, k] of H) off += amp * Math.sin(k * t + ph);
    const px = x - (dy / L) * off, py = y + (dx / L) * off;
    const c = Math.cos(rot), s = Math.sin(rot);
    raw.push([px * c - py * s, mir * (px * s + py * c)]);
  }
  // tur uzunluğunu hedefe ölçekle
  let P = 0;
  for (let i = 0; i < N; i++) { const p = raw[i], q = raw[(i + 1) % N]; P += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const sc = (96 + R() * 24) / P;
  return raw.map(([x, y]) => [x * sc, y * sc]);
}
// Kapalı eğriyi eşit aralıklı (DS) örnekle
function resample(raw) {
  const n0 = raw.length, cum = [0];
  for (let i = 1; i <= n0; i++) { const p = raw[i - 1], q = raw[i % n0]; cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const L = cum[n0], n = Math.max(40, Math.round(L / DS)), ds = L / n, pts = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (j < n0 - 1 && cum[j + 1] < s) j++;
    const p = raw[j], q = raw[(j + 1) % n0], seg = cum[j + 1] - cum[j] || 1, k = (s - cum[j]) / seg;
    pts.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
  }
  return { pts, n, ds, L };
}
function curvature(pts, ds) {
  const n = pts.length, k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
    k[i] = Math.abs(angN(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]))) / ds;
  }
  return k;
}
function segCross(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const qp = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: a[0] + r[0] * t, y: a[1] + r[1] * t };
}
export const GEN_STATS = {};
const rej = (r) => { GEN_STATS[r] = (GEN_STATS[r] || 0) + 1; return null; };
function validate(tr) {
  const { pts, n, ds, L } = tr;
  if (L < 88 || L > 130) return rej('len');
  const kap = curvature(pts, ds);
  for (let i = 0; i < n; i++) if (kap[i] > 0.21) return rej('kap');
  // kesişmeler
  const cross = [];
  const gap = Math.round(8 / ds);
  for (let i = 0; i < n; i++) for (let j = i + gap; j < n; j++) {
    if (n - j + i < gap) continue;
    const h = segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]);
    if (h) cross.push({ i, j, sA: (i + h.t) * ds, sB: (j + h.u) * ds, x: h.x, y: h.y });
  }
  if (cross.length !== 1) return rej('cross' + cross.length);
  const X = cross[0];
  const aA = Math.atan2(pts[(X.i + 1) % n][1] - pts[X.i][1], pts[(X.i + 1) % n][0] - pts[X.i][0]);
  const aB = Math.atan2(pts[(X.j + 1) % n][1] - pts[X.j][1], pts[(X.j + 1) % n][0] - pts[X.j][0]);
  let ang = Math.abs(angN(aA - aB)); if (ang > Math.PI / 2) ang = Math.PI - ang;
  if (ang < Math.PI * 0.31) return rej('ang');                 // ~56°'den dar kesişme olmasın
  if (Math.min(Math.abs(X.sA - X.sB), L - Math.abs(X.sA - X.sB)) < 38) return rej('near');
  // kendine yaklaşma (kesişme bölgesi hariç)
  const minD = (HALF_W + CURB) * 2 + 1.4, minD2 = minD * minD, far = Math.round(16 / ds), zone = 11;
  const nearX = (s) => Math.min(Math.abs(s - X.sA), L - Math.abs(s - X.sA), Math.abs(s - X.sB), L - Math.abs(s - X.sB)) < zone;
  for (let i = 0; i < n; i++) {
    const xi = nearX(i * ds);
    for (let j = i + far; j < n; j++) {
      if (n - j + i < far) continue;
      const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
      if (dx * dx + dy * dy < minD2 && !(xi && nearX(j * ds))) return rej('self');
    }
  }
  return { kap, X };
}

const CACHE = new Map();
let CUR = null; // son oluşturulan pist (modül düzeyi onTrack için)
export function buildTrack(seed) {
  seed = seed >>> 0;
  if (CACHE.has(seed)) return CACHE.get(seed);
  const R = rng(seed);
  let tr = null, v = null;
  for (let tries = 0; tries < 400 && !v; tries++) { tr = resample(candidate(R)); v = validate(tr); }
  if (!v) throw new Error('pist üretilemedi');
  let { pts, n, ds, L } = tr;
  let { kap, X } = v;
  // köprü: hangi şerit üstten geçer?
  const upper = R() < 0.5 ? X.sA : X.sB, lower = upper === X.sA ? X.sB : X.sA;
  // başlangıç: kesişmeden uzak, önü en düz bölge
  const win = Math.round(8 / ds);
  let best = -1, bestK = Infinity;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    const dA = Math.min(Math.abs(s - X.sA), L - Math.abs(s - X.sA)), dB = Math.min(Math.abs(s - X.sB), L - Math.abs(s - X.sB));
    if (dA < 16 || dB < 16) continue;
    let m = 0;
    for (let k = -4; k < win; k++) m += kap[(i + k + n) % n];
    if (m < bestK) { bestK = m; best = i; }
  }
  // yeniden indeksle (başlangıç = 0), döndür (başlangıç yönü yukarı) ve taşı
  const sh = best;
  pts = pts.map((_, i) => pts[(i + sh) % n]);
  kap = Float32Array.from(kap.map((_, i) => kap[(i + sh) % n]));
  const shiftS = (s) => ((s - sh * ds) % L + L) % L;
  X = { ...X, sA: shiftS(X.sA), sB: shiftS(X.sB) };
  const upS = shiftS(upper), lowS = shiftS(lower);
  const a0 = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
  const rot = -Math.PI / 2 - a0, c = Math.cos(rot), s = Math.sin(rot);
  pts = pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const ox = 9 - pts[0][0], oy = 19.2 - pts[0][1];
  pts = pts.map(([x, y]) => [x + ox, y + oy]);
  X = { ...X, x: X.x * c - X.y * s + ox, y: X.x * s + X.y * c + oy };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bounds = { x0: Math.floor(x0 - 4), y0: Math.floor(y0 - 4), x1: Math.ceil(x1 + 4), y1: Math.ceil(y1 + 4) };
  // köprü yükseklik profili
  const span = BRIDGE_RAMP + BRIDGE_TOP;
  const wrapL = (d) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
  const elev = (sv) => { const u = Math.abs(wrapL(sv - upS)); return u >= span ? 0 : u <= BRIDGE_TOP ? BRIDGE_H : BRIDGE_H * smooth((span - u) / BRIDGE_RAMP); };
  const bridge = { s: upS, lowS, s0: upS - span, s1: upS + span, top0: upS - BRIDGE_TOP, top1: upS + BRIDGE_TOP, x: X.x, y: X.y, h: BRIDGE_H, span };
  const track = { seed, pts, n, ds, length: L, bounds, bridge, cross: X, kap };
  track.wrap = wrapL;
  track.elev = elev;
  // s mesafesindeki nokta, yön ve yükseklik
  track.pointAt = (sv) => {
    sv = ((sv % L) + L) % L;
    const f = sv / ds, i = Math.floor(f) % n, k = f - Math.floor(f);
    const p = pts[i], q = pts[(i + 1) % n];
    return { x: p[0] + (q[0] - p[0]) * k, y: p[1] + (q[1] - p[1]) * k, a: Math.atan2(q[1] - p[1], q[0] - p[0]), z: elev(sv) };
  };
  // (x,y)'ye en yakın orta çizgi noktası: s ipucu etrafında yerel arama (kesişmede şerit karışmaz)
  track.locate = (x, y, sHint, win = 14) => {
    const i0 = Math.round((((sHint % L) + L) % L) / ds);
    let bestD = Infinity, bs = 0, bd = 0;
    for (let k = -win; k <= win; k++) {
      const i = (i0 + k + n * 4) % n, p = pts[i], q = pts[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L2));
      const px = p[0] + dx * t - x, py = p[1] + dy * t - y, d2 = px * px + py * py;
      if (d2 < bestD) { bestD = d2; bs = (i + t) * ds; bd = (-(x - p[0]) * dy + (y - p[1]) * dx) / Math.sqrt(L2); }
    }
    return { s: bs, d: bd, dist: Math.sqrt(bestD) };
  };
  track.nearest = (x, y) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const dx = pts[i][0] - x, dy = pts[i][1] - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bi = i; } }
    return track.locate(x, y, bi * ds, 3);
  };
  // s'deki noktadan yanal d kadar kaymış konum
  track.offset = (sv, d) => { const p = track.pointAt(sv); const nx = -Math.sin(p.a), ny = Math.cos(p.a); return { x: p.x + nx * d, y: p.y + ny * d, a: p.a, z: p.z }; };
  // başlangıç ızgarası: çizginin arkasında ikili sıralar
  track.grid = [];
  for (let i = 0; i < 10; i++) { const o = track.offset(-1.8 - Math.floor(i / 2) * 1.35, (i % 2 ? 1 : -1) * 1.0); track.grid.push([o.x, o.y, o.a, -1.8 - Math.floor(i / 2) * 1.35, (i % 2 ? 1 : -1) * 1.0]); }
  racingLine(track);
  CACHE.set(seed, track);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  return track;
}

// Botlar için yarış çizgisi (yanal kayma) ve hedef hız profili
const PHY = { accel: 7.5, brake: 14, reverse: 3, max: 9.2, curbMax: 7.5, drag: 0.35, curbDrag: 1.2, steer: 2.5, grip: 7, curbGrip: 4 };
function racingLine(track) {
  const { pts, n, ds, kap } = track;
  const lim = HALF_W - 0.95;
  // eğriliğin bant geçiren filtresi: apekste içe, giriş/çıkışta dışa
  const sk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], q = pts[i], r = pts[(i + 1) % n];
    sk[i] = angN(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0])) / ds; // işaretli
  }
  const sm = (arr, w) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = -w; k <= w; k++) s += arr[(i + k + n) % n]; o[i] = s / (2 * w + 1); } return o; };
  const k1 = sm(sk, Math.round(2.5 / ds)), k2 = sm(sk, Math.round(9 / ds));
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = (k1[i] - 0.65 * k2[i]) * 11; // + sol normal yönüne
    line[i] = Math.max(-lim, Math.min(lim, v));
  }
  const lineS = sm(line, Math.round(2 / ds));
  // köprüde ortaya yakın kal
  for (let i = 0; i < n; i++) { const u = Math.abs(track.wrap(i * ds - track.bridge.s)); if (u < track.bridge.span + 3) lineS[i] *= Math.min(1, Math.max(0.35, (u - track.bridge.span) / 3 + 0.35)); }
  // çizginin eğriliği → hız sınırı → geriye doğru fren geçişi
  const lp = [];
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const a = Math.atan2(q[1] - p[1], q[0] - p[0]); lp.push([p[0] - Math.sin(a) * lineS[i], p[1] + Math.cos(a) * lineS[i]]); }
  const lk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = lp[(i - 1 + n) % n], q = lp[i], r = lp[(i + 1) % n];
    const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-6;
    lk[i] = Math.abs(angN(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]))) / d1;
  }
  const vmax = new Float32Array(n);
  const m = 0.9;
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = -2; j <= 2; j++) k = Math.max(k, lk[(i + j + n) % n]);
    vmax[i] = Math.min(PHY.max, (m * PHY.steer) / (k + (m * PHY.steer * 0.3) / PHY.max));
  }
  const ab = 9.5;
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) {
    const nx = vmax[(i + 1) % n];
    vmax[i] = Math.min(vmax[i], Math.sqrt(nx * nx + 2 * ab * ds));
  }
  track.line = lineS; track.vmax = vmax;
}

// Modül düzeyi yardımcılar (son oluşturulan pist üzerinden; testler/simülasyonlar için)
export const onTrack = (x, y, track = CUR) => !!track && Math.abs(track.nearest(x, y).d) <= HALF_W;
export const surface = (d) => (Math.abs(d) <= HALF_W ? 'asphalt' : Math.abs(d) <= HALF_W + CURB ? 'curb' : 'void');

// ---------- Simülasyon ----------
export function createSim(players, g) {
  const seed = g && g.seed != null ? g.seed >>> 0 : (Math.random() * 0x7fffffff) >>> 0;
  const track = buildTrack(seed);
  CUR = track;
  const R = rng(seed ^ 0x5bd1e995);
  const cars = {};
  players.forEach((p, i) => {
    const [x, y, h, s, d] = track.grid[i % track.grid.length];
    cars[p.id] = {
      id: p.id, bot: !!p.bot, x, y, h, vx: 0, vy: 0, sp: 0, steer: 0, slip: 0,
      s, d, z: 0, prog: track.wrap(s), done: null, lap: 1, hit: 0,
      fall: null, inv: 0, safeS: s, safeD: d,
      skill: p.bot ? 0.9 + R() * 0.07 : 1, lane: (R() - 0.5) * 1.1, react: 0.9 + R() * 0.5,
    };
  });
  return { t: 0, phase: 'wait', cd: COUNTDOWN, cars, firstDone: null, events: [], seed, track };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = COUNTDOWN; } };

function stepCar(car, inp, dt, sim) {
  const track = sim.track;
  if (car.fall !== null) {
    // uçurumdan düşüyor: ileri süzülür, aşağı iner, sonra son güvenli yerinde doğar
    car.fall += dt;
    car.vx *= Math.exp(-1.2 * dt); car.vy *= Math.exp(-1.2 * dt);
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.z -= 9 * car.fall * dt;
    car.sp = Math.hypot(car.vx, car.vy);
    car.slip = 0;
    if (car.fall >= RESPAWN_T) {
      const o = track.offset(car.safeS, Math.max(-HALF_W * 0.6, Math.min(HALF_W * 0.6, car.safeD)));
      car.x = o.x; car.y = o.y; car.h = o.a; car.z = o.z;
      car.vx = car.vy = car.sp = car.steer = 0;
      car.prog += track.wrap(car.safeS - car.s);
      car.s = car.safeS; car.d = car.safeD;
      car.fall = null; car.inv = INV_T;
      sim.events.push({ e: 'respawn', id: car.id, x: car.x, y: car.y });
    }
    return;
  }
  if (car.inv > 0) car.inv = Math.max(0, car.inv - dt);
  const fx = Math.cos(car.h), fy = Math.sin(car.h);
  const rx = -fy, ry = fx;
  let vf = car.vx * fx + car.vy * fy, vs = car.vx * rx + car.vy * ry;
  const curb = Math.abs(car.d) > HALF_W;
  const racing = sim.phase === 'race' && car.done === null;
  const gas = racing && inp.gas, brake = racing && inp.brake;
  if (gas) vf += PHY.accel * dt * (vf < 0 ? 2 : 1);
  if (brake) vf = vf > 0.3 ? vf - PHY.brake * dt : Math.max(-PHY.reverse, vf - PHY.accel * 0.6 * dt);
  if (!gas && !brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt); // motor freni
  vf -= vf * (PHY.drag + (curb ? PHY.curbDrag : 0)) * dt;
  const max = (curb ? PHY.curbMax : PHY.max) * car.skill;
  if (vf > max) vf -= (vf - max) * Math.min(1, 4 * dt);
  if (car.done !== null) vf -= vf * 1.5 * dt;
  // direksiyon: duruyorken dönmez, hızlanınca biraz azalır; geri giderken ters
  car.steer += ((inp.steer || 0) - car.steer) * Math.min(1, 14 * dt);
  const k = Math.min(1, Math.abs(vf) / 2.2) * (1 - 0.3 * Math.min(1, Math.abs(vf) / PHY.max));
  car.h += car.steer * PHY.steer * k * Math.sign(vf) * dt;
  vs *= Math.exp(-(curb ? PHY.curbGrip : PHY.grip) * dt);
  const nfx = Math.cos(car.h), nfy = Math.sin(car.h);
  car.vx = nfx * vf - nfy * vs;
  car.vy = nfy * vf + nfx * vs;
  car.slip = Math.abs(vs);
  car.x += car.vx * dt; car.y += car.vy * dt;
  car.sp = Math.hypot(car.vx, car.vy) * Math.sign(vf || 1);
  // ilerleme / tur / yükseklik
  const loc = track.locate(car.x, car.y, car.s);
  car.prog += track.wrap(loc.s - car.s);
  car.s = loc.s; car.d = loc.d; car.z = track.elev(loc.s);
  car.lap = Math.max(1, Math.min(LAPS, Math.floor(car.prog / track.length) + 1));
  if (Math.abs(loc.d) > FALL_LIMIT) {
    car.fall = 0; car.inv = 0;
    sim.events.push({ e: 'fall', id: car.id, x: car.x, y: car.y });
    return;
  }
  if (Math.abs(loc.d) <= HALF_W) { car.safeS = loc.s; car.safeD = loc.d; }
  if (car.done === null && car.prog >= LAPS * track.length) {
    car.done = sim.t;
    if (sim.firstDone === null) sim.firstDone = sim.t;
    sim.events.push({ e: 'finish', id: car.id, place: Object.values(sim.cars).filter((c) => c.done !== null).length });
  }
}

function collide(sim) {
  const list = Object.values(sim.cars).filter((c) => c.fall === null && c.inv <= 0);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.z - b.z) > 0.7) continue; // köprü üstü / altı çarpışmaz
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= CAR_R * 2 || d < 1e-6) continue;
    const nx = dx / d, ny = dy / d, pen = (CAR_R * 2 - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const imp = -rv * 0.9;
      a.vx -= nx * imp / 2; a.vy -= ny * imp / 2; b.vx += nx * imp / 2; b.vy += ny * imp / 2;
      if (-rv > 1.2) sim.events.push({ e: 'bump', id: a.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
}

// Sabit adımlı simülasyon (oda sahibinin cihazında çalışır)
export function stepSim(sim, dt, inputs) {
  sim.events = [];
  sim.t += dt;
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd);
    sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep', n: Math.ceil(sim.cd) });
    if (sim.cd <= 0) { sim.phase = 'race'; sim.raceT0 = sim.t; sim.events.push({ e: 'go' }); }
  }
  for (const car of Object.values(sim.cars)) {
    const inp = car.bot ? botInput(sim, car) : inputs[car.id] || {};
    stepCar(car, inp, dt, sim);
  }
  collide(sim);
  if (sim.phase === 'race') {
    const all = Object.values(sim.cars);
    const allDone = all.every((c) => c.done !== null);
    if (allDone || (sim.firstDone !== null && sim.t - sim.firstDone > AFTER_FIRST) || sim.t - sim.raceT0 > MAX_RACE) {
      sim.phase = 'done';
      sim.events.push({ e: 'done' });
    }
  }
  return sim.events;
}

// Sıralama: bitirenler bitiş zamanına göre, diğerleri ilerlemeye göre
export function standings(sim) {
  const key = (c) => (c.done !== null ? c.done - 1e6 : -c.prog);
  return Object.values(sim.cars).sort((a, b) => key(a) - key(b)).map((c) => c.id);
}
export const rankingOf = (sim) => standings(sim).map((id) => [id]);

// ---------- Bot sürücü ----------
// Yarış çizgisini izler, viraj öncesi hız profiline göre frenler; önündeki arabayı hafifçe sıyırır.
export function botInput(sim, car) {
  const track = sim.track, { n, ds } = track;
  if (car.fall !== null) return {};
  const sp = Math.max(0, car.sp);
  const ahead = 1.5 + sp * 0.26 * car.react;
  const si = Math.round(((car.s + ahead) % track.length + track.length) % track.length / ds) % n;
  const lateral = track.line[si] + car.lane * 0.45;
  const tgt = track.offset(car.s + ahead, lateral);
  let diff = angN(Math.atan2(tgt.y - car.y, tgt.x - car.x) - car.h);
  // hedef hız: önümüzdeki 1,2 birimin en düşük sınırı
  let vt = Infinity;
  for (let k = 0; k <= 4; k++) vt = Math.min(vt, track.vmax[(Math.round(car.s / ds) + k + n) % n]);
  vt *= car.skill;
  // yoldan sapmışsa yavaşla (kenara yakın)
  if (Math.abs(car.d) > HALF_W - 0.5) vt = Math.min(vt, 5.5);
  // önümüzde yavaş araba: fren ve hafif yan kayma
  for (const o of Object.values(sim.cars)) {
    if (o === car || o.fall !== null || Math.abs(o.z - car.z) > 0.7) continue;
    const dx = o.x - car.x, dy = o.y - car.y, d = Math.hypot(dx, dy);
    if (d > 2.4) continue;
    const fwd = dx * Math.cos(car.h) + dy * Math.sin(car.h);
    if (fwd < 0.3) continue;
    const side = -dx * Math.sin(car.h) + dy * Math.cos(car.h);
    if (Math.abs(side) < 0.8) { vt = Math.min(vt, Math.max(0, o.sp) + 0.3); diff += (side > 0 ? -0.35 : 0.35) * (1 - d / 2.4); }
  }
  return {
    steer: Math.max(-1, Math.min(1, diff * 2.6)),
    gas: sp < vt - 0.1 && Math.abs(diff) < 1.3,
    brake: sp > vt + 0.45 || (Math.abs(diff) > 1.4 && sp > 2),
  };
}

// ---------- Ağ: anlık görüntü (oda sahibi → oyuncular) ----------
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(sim) {
  return {
    t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), sd: sim.seed,
    c: Object.values(sim.cars).map((c) => [c.id, r2(c.x), r2(c.y), r2(c.h), r2(c.sp), r2(c.prog), c.done === null ? -1 : r2(c.done), r2(c.steer), r2(c.slip || 0), r2(c.z), c.fall === null ? -1 : r2(c.fall), r2(c.inv), r2(c.d), r2(c.s)]),
    ev: sim.events,
  };
}
export function readSnapshot(s) {
  const cars = {};
  const L = buildTrack(s.sd).length;
  for (const [id, x, y, h, sp, prog, done, steer, slip, z, fall, inv, d, sv] of s.c) cars[id] = { id, x, y, h, sp, prog, done: done < 0 ? null : done, steer, slip, z, fall: fall < 0 ? null : fall, inv, d, s: sv, lap: Math.max(1, Math.min(LAPS, Math.floor(prog / L) + 1)) };
  return { t: s.t, phase: s.ph, cd: s.cd, seed: s.sd, cars, events: s.ev || [] };
}
