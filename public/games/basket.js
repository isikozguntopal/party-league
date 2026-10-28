// 🏀 Pota Atışı — herkes aynı anda, kendi ekranında 45 saniye basket atar; en çok sayı yapan kazanır.
// Topu parmakla geri çekip bırakırsın (sapan gibi): çekiş yönünün tersine ve çekiş uzunluğu kadar güçle fırlar.
// Süre ilerledikçe pota oynar (önce yukarı-aşağı, sonra yana da). Arka arkaya sayı yaptıkça puanlar KATLANIR (×1 … ×5); kaçırınca kombo biter.
// Fizik saf JS'tir (DOM yok): istemci oynatır, sunucu yalnızca sonucu (sayı/isabet/atış) sınır kontrolüyle alır, sıralamayı yapar.
// Tur tabanlı oda çerçevesi: herkes oyunu bitirince `act` ile sonucunu gönderir (hepsi gönderince ya da süre dolunca sonuç açılır).
import { GameError } from './util.js';

export const KIND = 'basket';
export const TITLE = 'Pota Atışı';
export const EMOJI = '🏀';
export const RULES = [
  'Topu parmakla geri çek, bırak: pota yönüne fırlar. 45 saniyede en çok sayıyı yapan kazanır.',
  'Pota süre ilerledikçe hareket eder. Arka arkaya sayı yaptıkça puanlar katlanır (×2, ×3 … ×5); kaçırırsan kombo biter.',
  'Pota kenarına değmeden giren "temiz" atış +1 puan.',
];

// ---------- Zamanlama ----------
// Herkes oyuna kendi hazır olduğunda (öğreticiyi kapatınca) başlar: 3 sn geri sayım + 45 sn oyun. READ_MS öğretici için tanınan pay.
export const COUNT_MS = 3000, PLAY_MS = 45000, READ_MS = 13000, SLACK_MS = 5000, REVEAL_MS = 8000;
export const PLACE_MS = COUNT_MS + PLAY_MS + READ_MS + SLACK_MS;
export const placeMs = () => PLACE_MS;

// ---------- Dünya (birim ≈ metre; y yukarı) ----------
export const W = 9, H = 16;
export const G = 24, BALL_R = 0.34, BALL_X0 = 1.7, BALL_Y0 = 2.2;
export const RIM_HALF = 0.78, RIM_R = 0.09, BOARD_GAP = 0.28;      // pota yarı genişliği, kenar topuzu, arka tahta mesafesi
export const MAX_DRAG = 3.0, MIN_DRAG = 0.55, POWER = 10.2;          // çekiş (birim) → hız çarpanı
export const BASE_PTS = 2, SWISH_BONUS = 1, MAX_MULT = 5;
export const MAX_SHOTS = 120, MAX_SCORE = 1000;

// Potanın t anındaki (saniye, oyun başından) merkezi: ilk 8 sn en sağda sabit, sonra yukarı-aşağı, son 12 sn sola doğru da
export function hoopAt(t) {
  t = t * (30000 / PLAY_MS);       // hareket planı 30 sn'lik düzene göre; 45 sn'ye gerilir
  const x0 = 7.6, y0 = 9.0;       // pota ekranın en sağında başlar
  if (t < 8) return { x: x0, y: y0 };
  const k = Math.min(1, (t - 8) / 4);                       // 4 sn'de yumuşakça harekete geçer
  let y = y0 + Math.sin((t - 8) * 1.5) * 1.5 * k, x = x0;
  if (t >= 18) { const k2 = Math.min(1, (t - 18) / 3); y = y0 + Math.sin((t - 8) * 1.9) * 2.0; x = x0 - (0.5 - 0.5 * Math.cos((t - 18) * 1.25)) * 1.7 * k2; }   // sağ kenardan sola gidip gelir
  return { x, y };
}

// ---------- Atış ----------
// Çekiş vektörü (parmak - top, birim): top çekişin TERSİNE gider
export function launchVel(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < MIN_DRAG) return null;
  const k = Math.min(len, MAX_DRAG) / len;
  return { vx: -dx * k * POWER, vy: -dy * k * POWER };
}
// Önizleme: çarpışmasız yol (noktalı kavis)
export function trajectory(vx, vy, n = 28, dt = 0.045, sp = { x: BALL_X0, y: BALL_Y0 }) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = i * dt; pts.push({ x: sp.x + vx * t, y: sp.y + vy * t - 0.5 * G * t * t }); }
  return pts;
}

// Top ekranın solunda başlar; her atışta soldaki farklı bir noktadan çıkar
export function randomSpawn(rnd = Math.random) { return { x: 0.85 + rnd() * 1.5, y: 1.7 + rnd() * 3.2 }; }
export function newBall(sp = { x: BALL_X0, y: BALL_Y0 }) { return { x: sp.x, y: sp.y, vx: 0, vy: 0, live: false, touched: false, scored: false, bounces: 0, age: 0, prevY: sp.y }; }
export function fire(b, vel, sp = { x: BALL_X0, y: BALL_Y0 }) { Object.assign(b, { x: sp.x, y: sp.y, vx: vel.vx, vy: vel.vy, live: true, touched: false, scored: false, bounces: 0, age: 0, prevY: sp.y }); }

// Topu dt kadar ilerlet (t: oyun saati, pota konumu için). Dönen olaylar: 'rim' | 'board' | 'floor' | 'score' | 'swish' | 'miss'
// score = pota halkasından yukarıdan aşağı geçti. miss = top uçtu / durdu (sayı olmadan bitti).
export function stepBall(b, dt, t) {
  const ev = [];
  if (!b.live) return ev;
  const h = hoopAt(t), hp = hoopAt(Math.max(0, t - dt));
  const SUB = 4, d = dt / SUB;
  for (let i = 0; i < SUB && b.live; i++) {
    b.prevY = b.y;
    b.vy -= G * d; b.x += b.vx * d; b.y += b.vy * d; b.age += d;
    // halka kenarları (iki topuz) ve arka tahta
    for (const rx of [h.x - RIM_HALF, h.x + RIM_HALF]) collideCircle(b, rx, h.y, RIM_R, 0.62, ev, 'rim');
    const bx = h.x + RIM_HALF + BOARD_GAP;                       // arka tahta: dikey çizgi (sağda)
    if (b.y > h.y - 0.35 && b.y < h.y + 2.0 && b.x + BALL_R > bx && b.vx > 0) { b.x = bx - BALL_R; b.vx = -b.vx * 0.5; b.touched = true; ev.push('board'); }
    // sayı: halka düzlemini yukarıdan aşağı, iç açıklıktan geçti
    if (!b.scored && b.vy < 0 && b.prevY >= Math.min(h.y, hp.y) - 0.02 && b.y < h.y + 0.02 && b.prevY > b.y && Math.abs(b.x - h.x) < RIM_HALF - 0.05) {
      b.scored = true;
      ev.push('score'); if (!b.touched) ev.push('swish');
    }
    // zemin
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = -b.vy * 0.45; b.vx *= 0.8; b.bounces++; ev.push('floor'); if (b.bounces >= 2) { b.live = false; if (!b.scored) ev.push('miss'); } }
    if (b.x < -1 || b.x > W + 1.5 || b.age > 5) { b.live = false; if (!b.scored) ev.push('miss'); }
    // sayıdan sonra top halkanın altına inince biter (yeni top gelir)
    if (b.scored && b.y < h.y - 2.2) b.live = false;
  }
  return ev;
}
// Daire (sabit nokta) ile top çarpışması
function collideCircle(b, cx, cy, r, rest, ev, name) {
  const dx = b.x - cx, dy = b.y - cy, dist = Math.hypot(dx, dy), min = BALL_R + r;
  if (dist >= min || dist === 0) return;
  const nx = dx / dist, ny = dy / dist;
  b.x = cx + nx * min; b.y = cy + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
  b.touched = true; ev.push(name);
}

// ---------- Puanlama ----------
export const newScore = () => ({ score: 0, made: 0, shots: 0, streak: 0, best: 0, swishes: 0 });
export const multiplier = (streak) => Math.min(MAX_MULT, Math.max(1, streak));
// Sayı: kombo artar, puan = (2 + temiz?1) × çarpan
export function awardMake(sc, swish) {
  sc.streak += 1; sc.made += 1; sc.best = Math.max(sc.best, sc.streak);
  if (swish) sc.swishes++;
  const pts = (BASE_PTS + (swish ? SWISH_BONUS : 0)) * multiplier(sc.streak);
  sc.score += pts;
  return pts;
}
export function awardMiss(sc) { sc.streak = 0; }
// n sayıyla alınabilecek en yüksek puan (hepsi ardışık ve temiz)
export function maxScoreFor(n) { let t = 0; for (let k = 1; k <= n; k++) t += (BASE_PTS + SWISH_BONUS) * multiplier(k); return t; }

// ---------- Oda modülü arayüzü (tur tabanlı çerçeve) ----------
export function init(ids, env) {
  return { alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [], bots: env ? env.players.filter((p) => p.bot).map((p) => p.id) : [], results: null };
}
const int = (v, lo, hi) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new GameError('Geçersiz sonuç'); return n; };
export function normalize(d, pid, body, now) {
  const shots = int(body.shots, 0, MAX_SHOTS), made = int(body.made, 0, shots), score = int(body.score, 0, MAX_SCORE), best = int(body.best, 0, made);
  // makul sınırlar: k. ardışık sayı en çok (2+1)×min(k,5) puan getirir; en fazla ~0.5 sn'de bir sayı
  if (score > maxScoreFor(made) || score < made * BASE_PTS) throw new GameError('Geçersiz sonuç');
  const elapsed = now - d.roundStart - COUNT_MS;                 // sonuç en erken oyun bitince gelir; yine de sayı hızı sınırlı
  if (made > Math.floor(Math.max(0, elapsed) / 450) + 2) throw new GameError('Geçersiz sonuç');
  return { score, made, shots, best };
}
// Bot: beceriye göre 12–55 puan. İnsan sonuç göndermediyse 0.
export function auto(d, pid, bot) {
  if (!bot) return { score: 0, made: 0, shots: 0, best: 0 };
  const made = 6 + Math.floor(Math.random() * 9), best = 1 + Math.floor(Math.random() * Math.min(5, made));
  const score = Math.min(made * 3 * 1.6, made * 2 + best * 4 + Math.floor(Math.random() * made * 3)) | 0;
  return { score, made, shots: made + 3 + Math.floor(Math.random() * 8), best };
}
export function resolve(d, actions) {
  const rows = Object.keys(d.g.alive).filter((id) => d.g.alive[id]).map((id) => { const a = actions[id] || { score: 0, made: 0, shots: 0, best: 0 }; return { id, score: a.score || 0, made: a.made || 0, shots: a.shots || 0, best: a.best || 0 }; });
  rows.sort((a, b) => b.score - a.score || b.made - a.made);
  d.g.results = rows;
  return { entry: { phase: 'result', rows }, dur: REVEAL_MS };
}
export function ranking(d, participants) {
  if (!d.g.results) return null;
  const by = Object.fromEntries(d.g.results.map((r) => [r.id, r]));
  const ids = participants.slice().sort((a, b) => (by[b] ? by[b].score : 0) - (by[a] ? by[a].score : 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && (by[last[0]] ? by[last[0]].score : 0) === (by[id] ? by[id].score : 0)) last.push(id); else groups.push([id]); }
  return groups;
}
export function view(d) {
  return { phase: 'play', alive: d.g.alive, playMs: PLAY_MS, countMs: COUNT_MS, total: Object.keys(d.g.alive).length };
}
