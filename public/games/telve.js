// ☕ Telve — Falcı bir kartı gizler ve ona tek satırlık bir yorum yazar. Herkes yoruma en çok uyan kartı gizlice atar; kartlar karışık açılır.
// Herkes Falcı'nın kartını bulmaya çalışır. Hepsi bilirse ya da hiçbiri bilmezse Falcı kısmet alamaz.
// Puan: Falcı'yı bilenler +3 (Falcı da +3, ama herkes ya da hiç kimse bilmediyse Falcı 0 ve diğerleri +2).
// Başkasının kartına oy verdirenler her oy için +1. Her tur 3 aşama: yorum (Falcı) → kart seç → oy ver.
import { GameError, shuffle } from './util.js';
import { CARD_COUNT } from './telve-kartlar.js';

export const KIND = 'telve';
export const TITLE = 'Telve';
export const EMOJI = '☕';
export const RULES = [
  'Falcı bir kartı gizler ve ona tek satırlık bir yorum yazar.',
  'Herkes yoruma en çok uyan kartı gizlice atar; kartlar karışık açılır.',
  'Falcı\'nın kartını bul. Herkes bilirse Falcı kısmet alamaz.',
];
export const HAND = 5, MAX_STORIES = 5, TELL_MS = 50000, PICK_MS = 35000, VOTE_MS = 35000, REVEAL_MS = 9000;
export const PLACE_MS = TELL_MS;
export const phaseOf = (d) => ['tell', 'pick', 'vote'][(d.round - 1) % 3];
export const storyIdx = (d) => Math.floor((d.round - 1) / 3);
export const placeMs = (d) => ({ tell: TELL_MS, pick: PICK_MS, vote: VOTE_MS })[phaseOf(d)];
export const lastRound = (g) => g.order.length * 3;

export function init(ids, env) {
  const all = ids.slice();
  while (all.length < 3 && env && env.addBot) all.push(env.addBot().id);
  const deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i));
  const hands = {};
  for (const id of all) hands[id] = deck.splice(0, HAND);
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  return {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [], deck, hands, bots: [...bots],
    order: shuffle(all).slice(0, Math.min(MAX_STORIES, all.length)), story: null, score: Object.fromEntries(all.map((id) => [id, 0])),
  };
}
const tellerOf = (d) => d.g.order[storyIdx(d)];
const ids = (g) => Object.keys(g.alive).filter((id) => g.alive[id]);

export function normalize(d, pid, body) {
  const g = d.g, ph = phaseOf(d), teller = tellerOf(d);
  if (ph === 'tell') {
    if (pid !== teller) throw new GameError('Şu an Falcı sen değilsin 🙂');
    const c = Number(body.card), clue = String(body.clue || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (!g.hands[pid].includes(c)) throw new GameError('Bu kart elinde yok');
    if (clue.length < 2) throw new GameError('Yorumun çok kısa');
    return { card: c, clue };
  }
  if (ph === 'pick') {
    if (pid === teller) throw new GameError('Falcı kart atmaz, bekle 🙂');
    const c = Number(body.card);
    if (!g.hands[pid].includes(c)) throw new GameError('Bu kart elinde yok');
    return { card: c };
  }
  if (pid === teller) throw new GameError('Falcı oy vermez');
  const t = Number(body.card);
  if (!g.story.table.some((x) => x.card === t)) throw new GameError('Masada böyle bir kart yok');
  if (g.story.table.find((x) => x.card === t).owner === pid) throw new GameError('Kendi kartına oy veremezsin');
  return { card: t };
}
export function auto(d, pid, bot) {
  const g = d.g, ph = phaseOf(d), teller = tellerOf(d);
  if (ph === 'tell') { if (pid !== teller) return {}; const c = g.hands[pid][0]; return bot ? { card: c, clue: 'bir şeyler görüyorum…' } : { card: c, clue: '…' }; }
  if (ph === 'pick') { if (pid === teller) return {}; return bot ? { card: g.hands[pid][Math.floor(Math.random() * g.hands[pid].length)] } : { card: null }; }
  if (pid === teller) return {};
  if (!bot) return { card: null };
  const opts = g.story.table.filter((x) => x.owner !== pid), right = opts.find((x) => x.owner === teller);
  return { card: right && Math.random() < 0.4 ? right.card : opts[Math.floor(Math.random() * opts.length)].card };
}

export function isDue(d, now, wait) {
  if (now > d.deadline + 1000) return true;
  const g = d.g, teller = tellerOf(d), isBot = (id) => g.bots.includes(id);
  const need = ids(g).filter((id) => (phaseOf(d) === 'tell' ? id === teller : id !== teller) && !isBot(id) && (!wait || wait(id)));
  if (!need.length) return now >= d.roundStart;
  return need.every((id) => d.actions[id]);
}

export function resolve(d, actions) {
  const g = d.g, ph = phaseOf(d), teller = tellerOf(d);
  if (ph === 'tell') {
    const a = actions[teller] && actions[teller].card !== undefined ? actions[teller] : { card: g.hands[teller][0], clue: '…' };
    g.story = { teller, card: a.card, clue: a.clue, picks: {}, table: [], votes: {} };
    return { entry: { phase: 'tell', teller }, dur: 600 };
  }
  if (ph === 'pick') {
    const st = g.story;
    for (const id of ids(g)) {
      if (id === teller) continue;
      const a = actions[id];
      st.picks[id] = a && a.card !== null && a.card !== undefined && g.hands[id].includes(a.card) ? a.card : g.hands[id][0];
    }
    st.table = shuffle([{ card: st.card, owner: teller }, ...Object.entries(st.picks).map(([owner, card]) => ({ card, owner }))]);
    return { entry: { phase: 'pick', teller }, dur: 600 };
  }
  // oy: puanla, elleri yenile
  const st = g.story, voters = ids(g).filter((id) => id !== teller);
  for (const id of voters) {
    const a = actions[id];
    const own = st.table.find((x) => x.owner === id).card;
    const opts = st.table.filter((x) => x.card !== own);
    st.votes[id] = a && a.card !== null && a.card !== undefined && opts.some((x) => x.card === a.card) ? a.card : null;
  }
  const found = voters.filter((id) => st.votes[id] === st.card);
  const gains = Object.fromEntries(ids(g).map((id) => [id, 0]));
  const none = found.length === 0, all = found.length === voters.length;
  if (none || all) { for (const id of voters) gains[id] += 2; }
  else { gains[teller] += 3; for (const id of found) gains[id] += 3; }
  for (const [voter, card] of Object.entries(st.votes)) { const t = st.table.find((x) => x.card === card); if (t && t.owner !== teller && t.owner !== voter) gains[t.owner] += 1; }
  for (const id of Object.keys(gains)) g.score[id] += gains[id];
  // kullanılan kartlar elden çıkar, yenileri çekilir
  const used = { [teller]: st.card, ...st.picks };
  for (const [id, c] of Object.entries(used)) { g.hands[id] = g.hands[id].filter((x) => x !== c); if (g.deck.length) g.hands[id].push(g.deck.pop()); }
  const entry = { phase: 'vote', teller, card: st.card, clue: st.clue, table: st.table, votes: st.votes, gains, found, none, all, score: { ...g.score } };
  g.story = null;
  return { entry, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < lastRound(d.g)) return null;
  const s = d.g.score, order = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of order) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Eller yalnızca sahibine; masadaki kartların sahipleri oylama bitene dek gizli
export function view(d, pid) {
  const g = d.g, ph = phaseOf(d), teller = tellerOf(d), st = g.story;
  return {
    alive: g.alive, phase: ph, teller, turn: storyIdx(d) + 1, turns: g.order.length, score: g.score,
    hand: g.hands[pid] || [], clue: st ? st.clue : null,
    myCard: ph !== 'tell' && st && pid === teller ? st.card : null,
    table: ph === 'vote' && st ? st.table.map((x) => ({ card: x.card, mine: x.owner === pid })) : null,
  };
}
