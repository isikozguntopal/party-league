// 🐑 Sürü — herkes aynı soruyu gizlice cevaplar; kalabalıkla aynı şıkkı seçen puan alır, tek kalan kara koyun olur.
// Her tur şıklı bir soru gelir. Seçtiğin şıkkı senden başka kaç kişi seçtiyse o kadar puan alırsın. En kalabalık şıkta
// (sürüde) isen ayrıca +3. Tek başına seçen kara koyun olur ve 0 alır. 6 tur sonunda en çok puanı olan kazanır.
import { GameError, shuffle } from './util.js';
import { SURU } from './suru-sorular.js';

export const KIND = 'suru';
export const TITLE = 'Sürü';
export const EMOJI = '🐑';
export const RULES = [
  'Her tur şıklı bir soru gelir; herkes gizlice bir şık seçer.',
  'Kalabalıkla aynı şeyi seçen puan alır: seçtiğin şıkkı senden başka kaç kişi seçtiyse o kadar puan. Sürüdeysen +3.',
  'Bir şıkkı tek başına seçen kara koyun olur ve 0 alır.',
];
export const ROUNDS = 6, OPTS = 4, HERD_BONUS = 3;
export const ANSWER_MS = 20000, REVEAL_MS = 7000;
export const PLACE_MS = ANSWER_MS;
export const placeMs = () => ANSWER_MS;

export function init(ids, env) {
  const all = ids.slice();
  const players = env ? env.players.slice() : ids.map((id) => ({ id, bot: false }));
  while (all.length < 3 && env && env.addBot) { const b = env.addBot(); all.push(b.id); players.push(b); }   // en az 3 kişi: sürü olsun
  const qs = shuffle(SURU.map((_, i) => i)).slice(0, ROUNDS).map((qi) => ({ qi, order: shuffle([0, 1, 2, 3]) }));   // order[i] = ekrandaki i. şıkkın özgün sırası
  return { alive: Object.fromEntries(all.map((id) => [id, true])), outs: [], qs, score: Object.fromEntries(all.map((id) => [id, 0])), bots: players.filter((p) => p.bot).map((p) => p.id) };
}
const qOf = (d) => d.g.qs[d.round - 1];
const optsOf = (d) => { const q = qOf(d), row = SURU[q.qi]; return q.order.map((o) => row[1 + o]); };

export function normalize(d, pid, body) {
  const o = Number(body.o);
  if (!Number.isInteger(o) || o < 0 || o >= OPTS) throw new GameError('Geçersiz şık');
  return { o };
}
// Bot: popülerlik sırasına (özgün ilk şık en popüler) göre ağırlıklı seçer
export function auto(d, pid, bot) {
  if (!bot) return { o: null };
  const q = qOf(d), w = [5, 3, 2, 1], pickW = () => { let x = Math.random() * 11; for (let i = 0; i < 4; i++) { x -= w[i]; if (x < 0) return i; } return 0; };
  const orig = pickW();
  return { o: q.order.indexOf(orig) };
}

export function resolve(d, actions) {
  const g = d.g, ids = Object.keys(g.alive).filter((id) => g.alive[id]);
  const picks = {}; for (const id of ids) picks[id] = actions[id] && actions[id].o !== null && actions[id].o !== undefined ? actions[id].o : null;
  const groups = Array.from({ length: OPTS }, () => []);
  for (const id of ids) if (picks[id] !== null) groups[picks[id]].push(id);
  const biggest = Math.max(...groups.map((x) => x.length));
  const gains = {};
  for (const id of ids) {
    const o = picks[id];
    if (o === null) { gains[id] = 0; continue; }
    const n = groups[o].length - 1;
    gains[id] = n === 0 ? 0 : n + (groups[o].length === biggest ? HERD_BONUS : 0);
  }
  for (const id of ids) g.score[id] += gains[id];
  const black = ids.filter((id) => picks[id] !== null && groups[picks[id]].length === 1);
  return { entry: { round: d.round, q: SURU[qOf(d).qi][0], opts: optsOf(d), groups, picks, gains, black, herd: groups.map((x, i) => (x.length === biggest && biggest > 1 ? i : -1)).filter((i) => i >= 0), score: { ...g.score } }, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < ROUNDS) return null;
  const s = d.g.score, ids = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

export function view(d) {
  return { alive: d.g.alive, round: d.round, rounds: ROUNDS, q: SURU[qOf(d).qi][0], opts: optsOf(d), score: d.g.score };
}
