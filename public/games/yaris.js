// 🏎️ Pist Canavarı — gerçek zamanlı araba yarışı
// Oyunu oda sahibinin telefonu yönetir (simülasyon burada), diğerleri kumanda gönderir.
// Her yarışta pist farklıdır: oyun durumundaki tohumdan (seed) üretilir. Pist bir köprüyle kendi
// üzerinden geçer; pistin dışı uçurumdur — düşen araba 2,5 sn sonra son güvenli yerinde yeniden doğar.
import { realtimeServer } from './util.js';

export const KIND = 'yaris';
export const TITLE = 'Pist Canavarı';
export const EMOJI = '🏎️';
export const RULES = [
  'Solda SOL / SAĞ düğmeleriyle yönlendir, sağda pedallar: GAZ ve FREN.',
  'Pistin dışı uçurum! Düşersen 2,5 sn sonra geri gelirsin.',
  '❓ kutulardan eşya al, KULLAN ile at: 🥒 Nitro hızlandırır, 🥟 Lazer düz gider, 🧯 Hortum frenini, 🪠 Tıkaç gazını keser, 👻 Hayalet görünmez yapar, 🍌 Muz Kabuğu tuzak bırakır.',
  'Köprüden geç, 3 tur at, çizgiyi ilk geçen kazanır!',
];

// ---------- Eşyalar (yol üstündeki ❓ kutulardan) ----------
// id → { emoji, ad, açıklama }. Sıralama: 1 nitro, 2 füze, 3 fren hortumu, 4 gaz tıkacı.
export const ITEMS = {
  1: { emoji: '🥒', name: 'Turşu Nitro', desc: 'Hız patlaması' },
  2: { emoji: '🥟', name: 'Börek Lazeri', desc: 'Önüne lazer gibi düz gider' },
  3: { emoji: '🧯', name: 'Fren Hortumu', desc: 'Öndekinin freni çalışmaz' },
  4: { emoji: '🪠', name: 'Gaz Tıkacı', desc: 'Öndekinin gazı kesilir' },
  5: { emoji: '👻', name: 'Hayalet Çorbası', desc: 'Görünmez olursun, hedef alınamazsın' },
  6: { emoji: '🍌', name: 'Muz Kabuğu', desc: 'Arkana tuzak bırakır' },
};
export const ITEM_COUNT = 6;
export const FX = { nogas: 2.5, nobrake: 5, boost: 2.5, spin: 1.1, ghost: 4 }; // etki süreleri (sn)
export const TRAP_R = 0.6, TRAP_LIFE = 25, TRAP_MAX = 14; // muz kabuğu: çarpma yarıçapı, ömür (sn), en fazla sayı
export const BOX_R = 0.95;       // kutuyu almak için yarıçap
export const BOX_RESPAWN = 6;    // kutu yeniden belirir (sn)
export const LAPS = 3;
export const CAR_R = 0.5;                      // çarpışma yarıçapı (arabalar büyük)
const AFTER_FIRST = 25;                        // ilk bitirenden sonra tanınan süre (sn)
const MAX_RACE = 520;                          // en uzun yarış (sn)
export const COUNTDOWN = 3;
export const HALF_W = 4.2;                     // asfalt yarı genişliği (geniş yol)
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
  // Sekiz (papyon) şekli: iki uzun çapraz düzlük (ortada köprü) + iki dikey düzlük. Köşeler keskin ama yuvarlatılmış (yarıçap ~5-6.5),
  // düzlüklerde hafif şikane (S kıvrımı). Yollar çoğunlukla düz ve uzundur; virajlar azdır ama sert.
  const H = 32 + R() * 6, W = H * (0.95 + R() * 0.25);
  const j = () => 1 + (R() - 0.5) * 0.2;
  const V = [[-W * j(), -H * j()], [W * j(), H * j()], [W * j(), -H * j()], [-W * j(), H * j()]];
  const nodes = [];
  for (let i = 0; i < 4; i++) {
    const a = V[i], b = V[(i + 1) % 4];
    nodes.push({ p: a, r: 7 + R() * 2 });
    const diag = i % 2 === 0;
    if (diag && R() < 0.7) { // şikane: köşelerden ve köprüden uzak iki kıvrım
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, off = (2 + R() * 2) * (R() < 0.5 ? -1 : 1);
      const f1 = 0.34 + R() * 0.04, f2 = f1 + 0.24;
      nodes.push({ p: [a[0] + dx * f1 + nx * off, a[1] + dy * f1 + ny * off], r: 12 + R() * 4 });
      nodes.push({ p: [a[0] + dx * f2 - nx * off, a[1] + dy * f2 - ny * off], r: 12 + R() * 4 });
    }
  }
  const raw = fillet(nodes);
  const rot = R() * TAU, mir = R() < 0.5 ? -1 : 1, c = Math.cos(rot), s = Math.sin(rot);
  return raw.map(([x, y]) => [x * c - y * s, mir * (x * s + y * c)]);
}
// Çokgenin köşelerini yay ile yuvarlar (her köşenin kendi yarıçapı; komşu kenara sığmazsa küçülür)
function fillet(nodes) {
  const n = nodes.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = nodes[i].p, pr = nodes[(i - 1 + n) % n].p, nx = nodes[(i + 1) % n].p;
    let ux = pr[0] - p[0], uy = pr[1] - p[1], vx = nx[0] - p[0], vy = nx[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const phi = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));         // iç açı
    if (phi > Math.PI - 0.02) { out.push(p); continue; }                          // neredeyse düz
    let r = nodes[i].r, t = r / Math.tan(phi / 2);
    const tmax = 0.46 * Math.min(lu, lv); if (t > tmax) { t = tmax; r = t * Math.tan(phi / 2); }
    const t1 = [p[0] + ux * t, p[1] + uy * t], t2 = [p[0] + vx * t, p[1] + vy * t];
    let bx = ux + vx, by = uy + vy; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const cd = r / Math.sin(phi / 2), cx = p[0] + bx * cd, cy = p[1] + by * cd;
    let a1 = Math.atan2(t1[1] - cy, t1[0] - cx), a2 = Math.atan2(t2[1] - cy, t2[0] - cx), da = a2 - a1;
    while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    const steps = Math.max(4, Math.ceil(Math.abs(da) * r / DS));
    for (let k = 0; k <= steps; k++) { const a = a1 + (da * k) / steps; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  }
  return out;
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
  if (L < 250 || L > 440) return rej('len');
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
  if (Math.min(Math.abs(X.sA - X.sB), L - Math.abs(X.sA - X.sB)) < 90) return rej('near');
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
  track.boxes = makeBoxes(track);
  CACHE.set(seed, track);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  return track;
}

// Eşya kutuları: tek tek, pist boyunca dağınık ve farklı şeritlerde (sıra sıra değil). Başlangıç ızgarası ve köprü bölgesinde yok. Tohumdan, herkeste aynı yer.
function makeBoxes(track) {
  const { length: L, bridge: br } = track;
  const R = rng((track.seed ^ 0x77aa55) >>> 0);
  const slots = Math.max(9, Math.round(L / 12));
  const lanes = [-0.72, -0.36, 0, 0.36, 0.72];
  const near = (s, c, w) => Math.abs(track.wrap(s - c)) < w;
  const out = [];
  let last = -1;
  for (let k = 0; k < slots; k++) {
    const s = (k + 0.5 + (R() - 0.5) * 0.7) * L / slots;
    if (near(s, br.s, br.span + 3) || near(s, br.lowS, br.span + 3) || s < 16 || s > L - 8) continue;
    let li; do { li = Math.floor(R() * lanes.length); } while (li === last); last = li; // ardışık kutular farklı şeritte
    const d = lanes[li] * HALF_W, o = track.offset(s, d);
    out.push({ s, d, x: o.x, y: o.y, z: o.z });
  }
  return out;
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
      item: 0, itemT: 0, fx: { nogas: 0, nobrake: 0, boost: 0, spin: 0, ghost: 0 },
    };
  });
  return { t: 0, phase: 'wait', cd: COUNTDOWN, cars, firstDone: null, events: [], seed, track, boxes: track.boxes.map(() => 0), proj: [], traps: [], R: rng(seed ^ 0xa5a5a5a5) };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = COUNTDOWN; } };

function stepCar(car, inp, dt, sim) {
  const track = sim.track;
  // eşya etkilerinin süreleri düşerken de akar
  const ef = car.fx;
  for (const k of ['nogas', 'nobrake', 'boost', 'spin', 'ghost']) if (ef[k] > 0) ef[k] = Math.max(0, ef[k] - dt);
  if (car.item) car.itemT += dt;
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
  // eşya etkileri: süreler azalır; füze yiyen (spin) kontrolü kaybeder; nitro hızlandırır; tıkaç gazı, hortum frenini keser
  const spin = ef.spin > 0, boost = ef.boost > 0;
  const gas = racing && !spin && ((inp.gas && ef.nogas <= 0) || boost);
  const brake = racing && !spin && inp.brake && ef.nobrake <= 0;
  if (spin) vf -= vf * 2.2 * dt;
  if (gas) vf += PHY.accel * (boost ? 2.2 : 1) * dt * (vf < 0 ? 2 : 1);
  if (brake) vf = vf > 0.3 ? vf - PHY.brake * dt : Math.max(-PHY.reverse, vf - PHY.accel * 0.6 * dt);
  if (!gas && !brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt); // motor freni
  vf -= vf * (PHY.drag + (curb ? PHY.curbDrag : 0)) * dt;
  const max = (curb ? PHY.curbMax : PHY.max) * car.skill * (boost ? 1.45 : 1);
  if (vf > max) vf -= (vf - max) * Math.min(1, 4 * dt);
  if (car.done !== null) vf -= vf * 1.5 * dt;
  // direksiyon: duruyorken dönmez, hızlanınca biraz azalır; geri giderken ters
  car.steer += ((spin ? 0 : inp.steer || 0) - car.steer) * Math.min(1, 14 * dt);
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

// ---------- Eşyalar ----------
// Ağırlıklar [nitro, füze, hortum, tıkaç, hayalet, muz]. Lider füze bulmaz (önünde kimse yok) ama diğer her şeyi bulur
// (hortum/tıkaç/muz arkadakilere gider); geride kalan daha çok nitro ve füze bulur.
function rollItem(sim, car) {
  const order = standings(sim), r = order.indexOf(car.id), n = order.length;
  const back = n > 1 ? Math.max(0, r) / (n - 1) : 0;
  const w = r <= 0 ? [1, 0, 1, 1, 1.2, 1.4] : [0.8 + back * 0.9, 1.5, 1, 1, 0.8, 1];
  let x = sim.R() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i + 1; }
  return 1;
}
// Hortum/tıkaç hedefi: önümüzdeki en yakın araç; yoksa arkamızdaki en yakın araç. Görünmez (hayalet) araçlar hedef alınamaz.
export function targetOf(sim, car) {
  let ahead = null, ad = Infinity, behind = null, bd = Infinity;
  for (const o of Object.values(sim.cars)) {
    if (o === car || o.fall !== null || o.done !== null || o.fx.ghost > 0) continue;
    const d = o.prog - car.prog;
    if (d > 0 && d < ad) { ad = d; ahead = o; }
    else if (d <= 0 && -d < bd) { bd = -d; behind = o; }
  }
  return ahead || behind;
}
function collectBoxes(sim, dt) {
  const boxes = sim.track.boxes;
  for (let i = 0; i < boxes.length; i++) {
    if (sim.boxes[i] > 0) { sim.boxes[i] = Math.max(0, sim.boxes[i] - dt); continue; }
    const b = boxes[i];
    for (const c of Object.values(sim.cars)) {
      if (c.item || c.fall !== null || c.done !== null) continue;
      if (Math.hypot(c.x - b.x, c.y - b.y) > BOX_R || Math.abs(c.z - b.z) > 0.7) continue;
      c.item = rollItem(sim, c); c.itemT = 0; sim.boxes[i] = BOX_RESPAWN;
      sim.events.push({ e: 'pickup', id: c.id, item: c.item, x: b.x, y: b.y });
      break;
    }
  }
}
function useItem(sim, car) {
  const it = car.item;
  if (!it || car.fall !== null || car.done !== null || car.fx.spin > 0) return;
  if (it === 1) car.fx.boost = FX.boost;
  else if (it === 2) {
    sim.proj.push({ by: car.id, x: car.x + Math.cos(car.h) * 0.8, y: car.y + Math.sin(car.h) * 0.8, h: car.h, v: 18 + Math.max(0, car.sp) * 0.5, life: 3.2, z: car.z });
    sim.events.push({ e: 'fire', id: car.id, x: car.x, y: car.y, h: car.h });
  } else if (it === 5) car.fx.ghost = FX.ghost;
  else if (it === 6) {
    sim.traps.push({ by: car.id, x: car.x - Math.cos(car.h) * 0.9, y: car.y - Math.sin(car.h) * 0.9, z: car.z, life: TRAP_LIFE, age: 0 });
    while (sim.traps.length > TRAP_MAX) sim.traps.shift();
    sim.events.push({ e: 'trap', id: car.id, x: car.x, y: car.y });
  } else {
    const tg = targetOf(sim, car);
    if (!tg) { sim.events.push({ e: 'noTarget', id: car.id }); return; } // kimse yok: eşya harcanmaz
    if (it === 3) tg.fx.nobrake = FX.nobrake; else tg.fx.nogas = FX.nogas;
    sim.events.push({ e: 'hit', id: tg.id, by: car.id, item: it, x: tg.x, y: tg.y });
  }
  car.item = 0; car.itemT = 0;
  sim.events.push({ e: 'use', id: car.id, item: it });
}
// Füzeler: yönüne düz gider, ilk arabaya çarpınca onu döndürür ve yavaşlatır
function stepProj(sim, dt) {
  const keep = [];
  for (const p of sim.proj) {
    p.life -= dt;
    if (p.life <= 0) continue;
    const mx = Math.cos(p.h) * p.v * dt, my = Math.sin(p.h) * p.v * dt;
    let hit = null;
    for (let sub = 1; sub <= 2 && !hit; sub++) {
      const qx = p.x + mx * sub / 2, qy = p.y + my * sub / 2;
      for (const c of Object.values(sim.cars)) {
        if (c.id === p.by || c.fall !== null || c.inv > 0 || c.done !== null || c.fx.ghost > 0 || Math.abs(c.z - p.z) > 0.9) continue;
        if (Math.hypot(c.x - qx, c.y - qy) < CAR_R + 0.25) { hit = c; break; }
      }
    }
    p.x += mx; p.y += my;
    if (hit) {
      hit.fx.spin = FX.spin; hit.vx *= 0.35; hit.vy *= 0.35; hit.sp *= 0.35;
      sim.events.push({ e: 'hit', id: hit.id, by: p.by, item: 2, x: hit.x, y: hit.y });
      continue;
    }
    keep.push(p);
  }
  sim.proj = keep;
}

// 🍌 Muz kabukları: üstünden geçen araç (hayalet hariç) döner; sahibi ilk 2 sn kendi tuzağına basmaz
function stepTraps(sim, dt) {
  const keep = [];
  for (const t of sim.traps) {
    t.life -= dt; t.age += dt;
    if (t.life <= 0) continue;
    let hit = null;
    for (const c of Object.values(sim.cars)) {
      if (c.fall !== null || c.done !== null || c.inv > 0 || c.fx.ghost > 0 || Math.abs(c.z - t.z) > 0.7) continue;
      if (c.id === t.by && t.age < 2) continue;
      if (Math.hypot(c.x - t.x, c.y - t.y) < CAR_R + TRAP_R * 0.7) { hit = c; break; }
    }
    if (hit) {
      hit.fx.spin = FX.spin * 0.85; hit.vx *= 0.5; hit.vy *= 0.5; hit.sp *= 0.5;
      sim.events.push({ e: 'hit', id: hit.id, by: t.by, item: 6, x: hit.x, y: hit.y });
      continue;
    }
    keep.push(t);
  }
  sim.traps = keep;
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
    if (inp.bomb && sim.phase === 'race') useItem(sim, car); // bomb = "eşyayı kullan" (tek basış)
    stepCar(car, inp, dt, sim);
  }
  collide(sim);
  if (sim.phase === 'race') { collectBoxes(sim, dt); stepProj(sim, dt); stepTraps(sim, dt); }
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
  // eşya: biraz düşündükten sonra kullanır (nitro düzlükte, füze hizalıyken, hortum/tıkaç hedef yakınken, hayalet yakında rakip varken, muz arkada rakip varken)
  let bomb = false;
  if (car.item && car.itemT > 1 + car.react * 0.8 && car.fx.spin <= 0) {
    const near = (lim) => Object.values(sim.cars).some((o) => o !== car && o.fall === null && o.done === null && Math.hypot(o.x - car.x, o.y - car.y) < lim);
    const behindClose = Object.values(sim.cars).some((o) => o !== car && o.fall === null && o.done === null && car.prog - o.prog > 0 && car.prog - o.prog < 12);
    if (car.item === 1) bomb = Math.abs(diff) < 0.3;
    else if (car.item === 2) {
      for (const o of Object.values(sim.cars)) {
        if (o === car || o.fall !== null || o.done !== null || o.fx.ghost > 0) continue;
        const dx = o.x - car.x, dy = o.y - car.y, fwd = dx * Math.cos(car.h) + dy * Math.sin(car.h), side = -dx * Math.sin(car.h) + dy * Math.cos(car.h);
        if (fwd > 2 && fwd < 30 && Math.abs(side) < 1.0) { bomb = true; break; }
      }
    } else if (car.item === 5) bomb = near(14);
    else if (car.item === 6) bomb = behindClose;
    else { const tg = targetOf(sim, car); bomb = !!tg && Math.abs(tg.prog - car.prog) < 35; }
  }
  return {
    steer: Math.max(-1, Math.min(1, diff * 2.6)),
    gas: sp < vt - 0.1 && Math.abs(diff) < 1.3,
    brake: sp > vt + 0.45 || (Math.abs(diff) > 1.4 && sp > 2),
    bomb,
  };
}

// ---------- Ağ: anlık görüntü (oda sahibi → oyuncular) ----------
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(sim) {
  return {
    t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), sd: sim.seed,
    c: Object.values(sim.cars).map((c) => [c.id, r2(c.x), r2(c.y), r2(c.h), r2(c.sp), r2(c.prog), c.done === null ? -1 : r2(c.done), r2(c.steer), r2(c.slip || 0), r2(c.z), c.fall === null ? -1 : r2(c.fall), r2(c.inv), r2(c.d), r2(c.s), c.item, r2(c.fx.nogas), r2(c.fx.nobrake), r2(c.fx.boost), r2(c.fx.spin), r2(c.fx.ghost)]),
    tp: sim.traps.map((t) => [r2(t.x), r2(t.y)]),
    bx: sim.boxes.map((t) => (t > 0 ? 0 : 1)).join(''),
    pj: sim.proj.map((p) => [r2(p.x), r2(p.y), r2(p.h)]),
    ev: sim.events,
  };
}
export function readSnapshot(s) {
  const cars = {};
  const L = buildTrack(s.sd).length;
  for (const [id, x, y, h, sp, prog, done, steer, slip, z, fall, inv, d, sv, item, nogas, nobrake, boost, spin, ghost] of s.c) cars[id] = { id, x, y, h, sp, prog, done: done < 0 ? null : done, steer, slip, z, fall: fall < 0 ? null : fall, inv, d, s: sv, lap: Math.max(1, Math.min(LAPS, Math.floor(prog / L) + 1)), item: item || 0, fx: { nogas: nogas || 0, nobrake: nobrake || 0, boost: boost || 0, spin: spin || 0, ghost: ghost || 0 } };
  return { t: s.t, phase: s.ph, cd: s.cd, seed: s.sd, cars, boxes: (s.bx || '').split('').map((c) => c === '1'), proj: s.pj || [], traps: s.tp || [], events: s.ev || [] };
}
