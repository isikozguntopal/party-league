// ⏱️ Kayıp Saniye — kronometre 3. saniyede kaybolur, hedef süreyi içinden saymaya çalış!
// Her turda ekranda bir kronometre çalışır ve hedef süre üstte yazar. 3. saniyeden sonra kronometre gizlenir;
// herkes hedef süre dolduğunu düşündüğü anda DURDUR'a basar. Hedefe en yakın durduran turu kazanır.
// 4 tur oynanır; toplam hata (sapma) en az olan birinci olur. Tur tabanlı: her oyuncu kendi durma süresini gönderir.
import { GameError } from './util.js';

export const KIND = 'saniye';
export const TITLE = 'Kayıp Saniye';
export const EMOJI = '⏱️';
export const RULES = [
  'Kronometre çalışır ama 3. saniyeden sonra kaybolur. Hedef süre ekranın üstünde yazar.',
  'Süreyi içinden say ve hedefe geldiğini düşündüğünde DURDUR\'a bas.',
  'Hedefe en yakın durduran turu kazanır. 4 tur sonunda toplam sapması en az olan birinci olur.',
];
export const ROUNDS = 4;
export const SHOW_MS = 3000;
export const REVEAL_MS = 6500;
export const PENALTY_MS = 6000;       // durdurmayan turda sayılan sapma
export const MAX_STOP_MS = 40000;
const TARGETS = [4, 5, 6, 7, 8, 9, 10, 12];
export const READY_MAX = 40000, COUNT_MS = 3500;   // herkes "Hazırım" demeden başlamaz (en fazla 40 sn beklenir), sonra 3-2-1
export const placeMs = (d) => READY_MAX + COUNT_MS + (d.g.targets[d.round - 1] || 8) * 1000 + SHOW_MS + 9000;
export const PLACE_MS = 24000 + READY_MAX;
// Turun başladığı an (kronometrenin 0'ı): herkes hazır olunca ayarlanır, olmazsa bekleme süresi dolunca
export const startOf = (d) => (d.g.startAt && d.g.startAt[d.round]) || d.roundStart + READY_MAX + COUNT_MS;
const humansAlive = (d) => Object.keys(d.g.alive).filter((id) => d.g.alive[id] && (d.players || []).some((p) => p.id === id && !p.bot && !p.left));

function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export function init(ids, env) {
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  return {
    alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [],
    targets: shuffle(TARGETS).slice(0, ROUNDS), bots: [...bots],
    total: Object.fromEntries(ids.map((id) => [id, 0])), rows: [], rdy: {}, startAt: {},
  };
}

export function normalize(d, pid, body, now) {
  if (now !== undefined && now < startOf(d) - 400) throw new GameError('Henüz başlamadı, herkesin hazır olması bekleniyor');
  const t = Number(body.t);
  if (!Number.isFinite(t) || t < 0 || t > MAX_STOP_MS) throw new GameError('Geçersiz süre');
  return { t: Math.round(t) };
}
// Bot: hedefe yakın ama insan gibi sapar (σ ≈ 0,35 sn). İnsan göndermediyse durdurmamış sayılır.
export function auto(d, pid, bot) {
  if (!bot) return { t: null };
  const target = d.g.targets[d.round - 1] * 1000;
  const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;       // ≈ N(0, 0.39)
  return { t: Math.max(1500, Math.round(target + g * 700 + (Math.random() - 0.5) * 200)) };
}

// Her turun başında herkes "Hazırım" der; hepsi hazır olunca 3-2-1 sayar ve kronometre başlar
export function gact(d, pid, body, now) {
  const g = d.g;
  if (body.t !== 'ready' || body.round !== d.round || !g.alive[pid] || g.startAt[d.round]) return false;
  const list = (g.rdy[d.round] = g.rdy[d.round] || []);
  if (list.includes(pid)) return false;
  list.push(pid);
  if (humansAlive(d).every((id) => list.includes(id))) { g.startAt[d.round] = now + COUNT_MS; d.deadline = g.startAt[d.round] + (g.targets[d.round - 1] || 8) * 1000 + SHOW_MS + 9000; }
  return true;
}

export function resolve(d, actions) {
  const g = d.g, target = g.targets[d.round - 1] * 1000;
  const rows = Object.keys(g.alive).filter((id) => g.alive[id]).map((id) => {
    const t = actions[id] ? actions[id].t : null;
    const err = t === null || t === undefined ? null : Math.abs(t - target);
    g.total[id] += err === null ? PENALTY_MS : err;
    return { id, t: t ?? null, err };
  });
  rows.sort((a, b) => (a.err === null) - (b.err === null) || a.err - b.err);
  g.rows.push(rows);
  return { entry: { round: d.round, target, rows }, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < ROUNDS) return null;
  const tot = d.g.total, ids = participants.slice().sort((a, b) => (tot[a] ?? 1e9) - (tot[b] ?? 1e9));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && tot[last[0]] === tot[id]) last.push(id); else groups.push([id]); }
  return groups;
}

export function view(d) {
  return { alive: d.g.alive, round: d.round, rounds: ROUNDS, target: d.g.targets[d.round - 1] * 1000, showMs: SHOW_MS, total: d.g.total, startAt: startOf(d), started: !!(d.g.startAt && d.g.startAt[d.round]), ready: (d.g.rdy && d.g.rdy[d.round]) || [], need: humansAlive(d), countMs: COUNT_MS };
}
