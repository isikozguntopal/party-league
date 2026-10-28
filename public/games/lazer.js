// 🪨 Sapan Arenası (iç ad: lazer)
// Herkes gizlice platformda yürüyüp yerini seçer ve sapanını doğrultur → herkes görünür →
// rastgele sırayla taş fırlatılır. Taş yoldaki ilk oyuncuya çarpar ve onu atış yönünde İTER.
// İtilen oyuncu birine çarparsa itmeyi ona aktarır (bilardo gibi, zincirleme).
// Platformun dışına itilen uçuruma düşer. Her tur platform küçülür. Son kalan kazanır.
//
// Vuruş mantığı yer düzleminde düz bir hat üzerinden çözülür (adil ve öngörülebilir). Taş, oyuncunun
// ileri/geri ayarladığı menzil kadar gider: menzilde kimse yoksa orada yere düşer. Uçuş görseli de
// dümdüz (arcHeight = 0); uçuş süresi mesafeyle uzar, açılış süresi buna göre hesaplanır.
import { GameError, shuffle, rankingFromOuts } from './util.js';

export const KIND = 'lazer';
export const TITLE = 'Sapan Arenası';
export const EMOJI = '🪨';
export const RULES = [
  'Platformda gizlice yürü, yerini seç ve sapanını doğrult.',
  'Herkes hazır olunca sırayla taş fırlatılır; taş çarptığını iter (zincirleme çarpışma!).',
  'Platformdan düşen elenir. Her tur alan küçülür!',
];
export const PLACE_MS = 30000;
const MAX_ROUNDS = 30;

export const ARENA_R = 1;                       // sekizgenin köşe yarıçapı (tam boy)
export const APOTHEM = Math.cos(Math.PI / 8);   // merkezden kenara uzaklık (tam boy)
export const BODY_R = 0.065;                    // oyuncu gövde/vuruş yarıçapı
export const PUSH = 0.5;                        // taşın itme mesafesi
export const MIN_SCALE = 0.2;                   // platform en fazla bu orana kadar küçülür

// Tur başına platform ölçeği: ilk 4 turda hızlı (%100 → %44), sonra her tur -%5
export const arenaScale = (round) => {
  const r = Math.max(0, round - 1);
  const s = r <= 4 ? 1 - 0.14 * r : 0.44 - 0.05 * (r - 4);
  return Math.max(MIN_SCALE, s);
};

// ---------- Taşın uçuşu (görsel geometri, sunucu + istemci ortak) ----------
export const STONE_H = 0.2;                     // fırlatma / çarpma yüksekliği (gövde hizası)
export const arcHeight = () => 0;               // taş dümdüz gider (lazer gibi); kavis yok
// Menzil: oyuncu taşın ne kadar uzağa gideceğini ileri/geri ayarlar. Menzil içinde kimse yoksa taş
// menzilin sonunda yere düşer; platform kenarına kadar gitmez.
export const MIN_RANGE = 0.15;
export const MAX_RANGE = 2.2;                   // platformun bir ucundan öbür ucuna (tam boy ~1,85)
export const DEFAULT_RANGE = 0.9;
export const cleanRange = (r) => (Number.isFinite(Number(r)) && r !== null && r !== '' ? Math.max(MIN_RANGE, Math.min(MAX_RANGE, Number(r))) : MAX_RANGE);
export const shotDist = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
// Uçuş süresi mesafeyle uzar (kısa atış 220 ms, arena boyu ~900 ms)
export const flightMs = (s) => Math.round(Math.min(900, 220 + shotDist(s) * 380));
// Uçuş yolundaki nokta: k∈[0,1] yatayda doğrusal, düşeyde parabol. Iskalayan taş yerde biter (zEnd=0).
export function arcPoint(x1, y1, x2, y2, k, zEnd = STONE_H) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  return {
    x: x1 + (x2 - x1) * k,
    y: y1 + (y2 - y1) * k,
    z: STONE_H + (zEnd - STONE_H) * k + arcHeight(d) * 4 * k * (1 - k),
  };
}

// Açılış animasyonu zamanlaması (sunucu bir sonraki turun başlangıcını buna göre hesaplar)
export const INTRO_MS = 2200;
export const TRACER_MS = 240;                   // eski sabit; uyumluluk için kaldı (artık flightMs kullanılır)
export const PUSH_MS = 520;                     // tam PUSH mesafesini kayma süresi
export const FALL_MS = 800;
export const OUTRO_MS = 1600;
const moveMs = (m) => Math.max(160, PUSH_MS * Math.hypot(m.tx - m.fx, m.ty - m.fy) / PUSH);
// Bir atışın zaman planı: taş uçar, çarpınca zincirdeki her kayma bir öncekinin çarptığı anda başlar
export function shotPlan(s) {
  const fly = flightMs(s);
  if (!s.moves || !s.moves.length) return { dur: fly + 700, fly, moves: [] };
  let t = fly;
  const moves = s.moves.map((m) => { const t0 = t; t += moveMs(m); return { ...m, t0, t1: t }; });
  return { dur: t + (moves.some((m) => m.fell) ? FALL_MS + 450 : 600), fly, moves };
}
export const shotDur = (s) => shotPlan(s).dur;
export const revealMs = (shots) => INTRO_MS + shots.reduce((t, s) => t + shotDur(s), 0) + OUTRO_MS;

// ---------- Geometri ----------
const NORMALS = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);

export function octagonVertices(r = ARENA_R) {
  return Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + k * Math.PI / 4;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

// Noktayı, kenarlara en az `margin` uzaklıkta kalacak şekilde (ölçekli) sekizgenin içine çeker.
export function clampInside(x, y, margin = BODY_R + 0.01, scale = 1) {
  const lim = APOTHEM * scale - margin;
  for (let i = 0; i < 3; i++) {
    for (const [nx, ny] of NORMALS) {
      const d = x * nx + y * ny - lim;
      if (d > 0) { x -= d * nx; y -= d * ny; }
    }
  }
  return { x, y };
}

// Oyuncunun merkezi platformun üstünde mi?
export function onPlatform(x, y, scale = 1) {
  return NORMALS.every(([nx, ny]) => x * nx + y * ny <= APOTHEM * scale);
}

// (x,y)'den a yönünde giden ışının platform kenarına ulaştığı nokta.
export function wallHit(x, y, a, scale = 1) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let t = Infinity;
  for (const [nx, ny] of NORMALS) {
    const dn = dx * nx + dy * ny;
    if (dn > 1e-9) t = Math.min(t, (APOTHEM * scale - (x * nx + y * ny)) / dn);
  }
  if (!isFinite(t) || t < 0) t = 0;
  return { x: x + dx * t, y: y + dy * t, t };
}

// Yürüme adımı: (x,y)'den (dx,dy) kadar gider, platformun içinde (kenar payıyla) kalır.
export function walk(x, y, dx, dy, scale = 1) {
  return clampInside(x + dx, y + dy, BODY_R + 0.01, scale);
}

// Atış: menzil içindeki hattaki ilk oyuncuyu bulur; yoksa taş menzilin sonunda (ya da kenarda) yere iner.
export function castShot(x, y, a, targets, scale = 1, range = Infinity) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const edge = wallHit(x, y, a, scale);
  const wall = range < edge.t ? { x: x + dx * range, y: y + dy * range, t: range } : edge;
  let best = null;
  for (const tg of targets) {
    const vx = tg.x - x, vy = tg.y - y;
    const proj = vx * dx + vy * dy;
    if (proj <= 0) continue;
    const perp2 = vx * vx + vy * vy - proj * proj;
    if (perp2 > BODY_R * BODY_R) continue;
    const th = Math.max(0, proj - Math.sqrt(BODY_R * BODY_R - perp2));
    if (th < wall.t + BODY_R && (!best || th < best.t)) best = { id: tg.id, t: th };
  }
  if (!best) return { hit: null, x: wall.x, y: wall.y };
  return { hit: best.id, x: x + dx * best.t, y: y + dy * best.t };
}

export function randomInside(rand = Math.random, scale = 1) {
  const ang = rand() * Math.PI * 2;
  const edge = rand() < 0.4;
  const r = (edge ? 0.55 + rand() * 0.3 : Math.sqrt(rand()) * 0.75) * APOTHEM * scale;
  return clampInside(Math.cos(ang) * r, Math.sin(ang) * r, BODY_R + 0.01, scale);
}

// Birbirine değen oyuncuları eşit miktarda iterek ayırır, sonra platformun içine çeker.
function separate(placements, ids, scale) {
  const minD = BODY_R * 2 + 0.004;
  for (const id of ids) placements[id] = { ...placements[id] };
  for (let it = 0; it < 10; it++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = placements[ids[i]], b = placements[ids[j]];
        const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
        if (dd >= minD) continue;
        let ux, uy;
        if (dd < 1e-6) { const ang = Math.random() * Math.PI * 2; ux = Math.cos(ang); uy = Math.sin(ang); }
        else { ux = dx / dd; uy = dy / dd; }
        const k = (minD - dd) / 2;
        a.x -= ux * k; a.y -= uy * k; b.x += ux * k; b.y += uy * k;
        moved = true;
      }
    }
    for (const id of ids) Object.assign(placements[id], clampInside(placements[id].x, placements[id].y, BODY_R + 0.01, scale));
    if (!moved) break;
  }
}

// İtme zinciri: itilen oyuncu yolundaki ilk oyuncuya değince durur ve kalan itmeyi
// çarpışma yönünde ona aktarır (bilardo gibi). Her kayma kaydedilir; platformdan çıkan düşer.
function pushChain(pos, id, dir, dist, scale, active) {
  const moves = [];
  const minD = BODY_R * 2;
  for (let k = 0; k < 10 && id && dist > 0.01; k++) {
    const p = pos[id];
    let best = null;
    for (const o of active) {
      if (o === id) continue;
      const q = pos[o];
      const vx = q.x - p.x, vy = q.y - p.y;
      const proj = vx * dir.x + vy * dir.y;
      if (proj <= 0) continue;
      const perp2 = vx * vx + vy * vy - proj * proj;
      if (perp2 >= minD * minD) continue;
      const t = Math.max(0, proj - Math.sqrt(minD * minD - perp2));
      if (t <= dist && (!best || t < best.t)) best = { o, t };
    }
    const travel = best ? best.t : dist;
    const fx = p.x, fy = p.y;
    p.x += dir.x * travel; p.y += dir.y * travel;
    const fell = !onPlatform(p.x, p.y, scale);
    moves.push({ id, fx, fy, tx: p.x, ty: p.y, fell });
    if (fell || !best) break;
    const q = pos[best.o];
    let nx = q.x - p.x, ny = q.y - p.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    dist = (dist - travel) * Math.max(0.35, dir.x * nx + dir.y * ny) * 0.9;
    dir = { x: nx, y: ny };
    id = best.o;
  }
  return moves;
}

// ---------- Modül arayüzü (game-core bunları çağırır) ----------

export function init(ids) {
  return { alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [] };
}

export function normalize(d, pid, body) {
  const nx = Number(body.x), ny = Number(body.y), na = Number(body.a);
  if (![nx, ny, na].every(Number.isFinite)) throw new GameError('Geçersiz konum');
  const c = clampInside(nx, ny, BODY_R + 0.01, arenaScale(d.round));
  return { x: c.x, y: c.y, a: na, r: cleanRange(body.r) };
}

export function auto(d, pid, bot) {
  const scale = arenaScale(d.round);
  const pos = randomInside(Math.random, scale);
  const last = d.history.length ? d.history[d.history.length - 1].placements : null;
  const alive = Object.keys(d.g.alive).filter((id) => d.g.alive[id] && id !== pid);
  const known = last ? alive.filter((o) => last[o]).map((o) => last[o]) : [];
  let a, r;
  if (scale < 0.6 && Math.random() < 0.75) {
    // Alan küçükken herkes merkeze yakın: merkezden geçen bir atış büyük ihtimalle birine denk gelir
    a = Math.atan2(-pos.y, -pos.x) + (Math.random() - 0.5) * 0.7;
    r = Math.hypot(pos.x, pos.y) + scale * (0.3 + Math.random() * 0.5);
  } else if (bot && known.length && Math.random() < 0.65) {
    const t = known[Math.floor(Math.random() * known.length)];
    a = Math.atan2(t.y - pos.y, t.x - pos.x) + (Math.random() - 0.5) * 0.3;
    r = Math.hypot(t.x - pos.x, t.y - pos.y) + 0.1 + Math.random() * 0.4;
  } else {
    const t = randomInside(Math.random, scale);
    const far = Math.hypot(t.x - pos.x, t.y - pos.y) > 0.25 * scale;
    a = far ? Math.atan2(t.y - pos.y, t.x - pos.x) : Math.atan2(-pos.y, -pos.x);
    r = (far ? Math.hypot(t.x - pos.x, t.y - pos.y) : Math.hypot(pos.x, pos.y)) + 0.25;
  }
  return { x: pos.x, y: pos.y, a, r: cleanRange(r) };
}

export function resolve(d, actions) {
  const scale = arenaScale(d.round);
  const g = d.g;
  const placements = { ...actions };
  const order = shuffle(Object.keys(placements).filter((id) => g.alive[id]));
  separate(placements, order, scale); // üst üste yerleşenleri ayır
  const pos = Object.fromEntries(order.map((id) => [id, { x: placements[id].x, y: placements[id].y }]));
  const fallen = new Set();
  const shots = [];
  for (const id of order) {
    if (fallen.has(id)) continue; // sırası gelmeden düştü
    const a = placements[id].a;
    const me = pos[id];
    const targets = order.filter((o) => o !== id && !fallen.has(o)).map((o) => ({ id: o, ...pos[o] }));
    const r = castShot(me.x, me.y, a, targets, scale, cleanRange(placements[id].r));
    const shot = { by: id, x1: me.x, y1: me.y, x2: r.x, y2: r.y, hit: r.hit, moves: [] };
    if (r.hit) {
      const active = order.filter((o) => !fallen.has(o));
      shot.moves = pushChain(pos, r.hit, { x: Math.cos(a), y: Math.sin(a) }, PUSH, scale, active);
      const out = shot.moves.filter((m) => m.fell).map((m) => m.id);
      for (const o of out) { fallen.add(o); g.alive[o] = false; }
      if (out.length) g.outs.push(out); // aynı atışta düşenler berabere sayılır
    }
    shots.push(shot);
  }
  return { entry: { scale, placements, order, shots }, dur: revealMs(shots) };
}

export function ranking(d, participants) {
  const alive = participants.filter((id) => d.g.alive[id]);
  if (alive.length <= 1 || d.round >= MAX_ROUNDS) return rankingFromOuts(d.g, participants);
  return null;
}

export const view = (d) => ({ alive: d.g.alive, scale: arenaScale(d.round) });
