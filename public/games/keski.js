// 🗿 Keski Düellosu — Machine Party'deki Chisel Gauntlet mantığı
// Her tur 3×3×3 bir taş küpün eksik parçalı hali birkaç saniye gösterilir, sonra kaybolur.
// Herkes kendi küpünü ezberden aynı şekilde yontup gönderir. Yanlış ya da geç kalan elenir.
// Her tur bir parça daha fazla eksik olur. Son kalan kazanır.
import { GameError, rankingFromOuts } from './util.js';

export const KIND = 'keski';
export const TITLE = 'Keski Düellosu';
export const EMOJI = '🗿';
export const RULES = [
  'Taş küpün eksik parçalı hali birkaç saniye gösterilir. Ezberle!',
  'Sonra kendi küpünü parmağınla yont: dokunduğun parça kırılır.',
  'Aynısını yapamayan elenir. Her tur daha zor! Son kalan kazanır.',
];
export const N = 3;
export const CENTER = 13;                         // ortadaki görünmez küp hiç kullanılmaz
export const BOTTOM = 10;                         // alt yüzün ortası yalnızca alttan görünür: hedefe girmez
export const SHOW_MS = (round) => 9000 + Math.min(4, round) * 700;   // ezber süresi (eskiden 4,5-5,4 sn: çok kısaydı)
export const CARVE_MS = 22000;
export const PLACE_MS = 30000;
export const REVEAL_MS = 4200;
const MAX_ROUNDS = 9;

export const cubeIdx = (x, y, z) => x + y * N + z * N * N;
export const cubeXYZ = (i) => [i % N, Math.floor(i / N) % N, Math.floor(i / (N * N))];
export const removeCount = (round) => Math.min(12, 2 + round);
export const placeMs = (d) => SHOW_MS(d.round) + CARVE_MS;

function target(round) {
  const pool = Array.from({ length: N * N * N }, (_, i) => i).filter((i) => i !== CENTER && i !== BOTTOM);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, removeCount(round)).sort((a, b) => a - b);
}
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

export function init(ids) {
  return { alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [], targets: { 1: target(1) } };
}

export function normalize(d, pid, body, now) {
  if (now < d.roundStart + SHOW_MS(d.round) - 500) throw new GameError('Önce ezberle!');
  const r = Array.isArray(body.removed) ? [...new Set(body.removed.map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < 27).sort((a, b) => a - b) : null;
  if (!r) throw new GameError('Geçersiz küp');
  return { removed: r, t: Math.max(0, now - d.roundStart) };
}

// Bot: tur ilerledikçe hata yapma olasılığı artar
export function auto(d, pid, bot) {
  if (!bot) return { removed: null, t: PLACE_MS };
  const tg = d.g.targets[d.round];
  const ok = Math.random() < 0.95 - d.round * 0.07;
  if (ok) return { removed: tg.slice(), t: 6000 + Math.random() * 8000 };
  const wrong = tg.slice(1);
  return { removed: wrong, t: 9000 };
}

export function resolve(d, actions) {
  const g = d.g, tg = g.targets[d.round];
  const results = {}, out = [];
  for (const id of Object.keys(g.alive)) {
    if (!g.alive[id]) continue;
    const a = actions[id] || { removed: null };
    const ok = same(a.removed, tg);
    results[id] = { ok, removed: a.removed, t: a.t };
    if (!ok) { g.alive[id] = false; out.push(id); }
  }
  if (out.length) g.outs.push(out);
  g.targets[d.round + 1] = target(d.round + 1);
  return { entry: { target: tg, results }, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  const alive = participants.filter((id) => d.g.alive[id]);
  if (alive.length <= 1 || d.round >= MAX_ROUNDS) return rankingFromOuts(d.g, participants);
  return null;
}

// Hedef küp yalnızca gösterim süresince gönderilir (sonra ezberden!)
export function view(d, pid, now) {
  const showing = d.status === 'playing' && now < d.roundStart + SHOW_MS(d.round);
  return {
    alive: d.g.alive,
    // sorgu gecikmesi ezber süresini yemesin: biraz önce gönderilir, istemci tam zamanında gösterir
    target: showing && now >= d.roundStart - 1500 ? d.g.targets[d.round] : null,
    count: removeCount(d.round),
    showMs: SHOW_MS(d.round),
  };
}
