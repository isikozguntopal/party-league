// 🎯 Ayar — iki zıt kavram arasında gizli bir nokta var; yalnızca anlatıcı görür.
// Anlatıcı tek bir ipucu yazar; diğerleri kadranı çevirip tahmin eder. Hedefe ne kadar yakınsan o kadar puan.
// Herkes bir kez anlatıcı olur (en çok 5 tur). Tur = ipucu (yalnız anlatıcı) + tahmin (diğerleri) .
import { GameError, shuffle } from './util.js';
import { AYAR } from './ayar-eksenler.js';

export const KIND = 'ayar';
export const TITLE = 'Ayar';
export const EMOJI = '🎯';
export const RULES = [
  'İki zıt kavram arasında gizli bir nokta var; yalnızca anlatıcı görür.',
  'Anlatıcı tek bir ipucu yazar, diğerleri kadranı çevirir.',
  'Hedefe ne kadar yakınsan o kadar puan. Anlatıcı da arkadaşlarının ortalamasını alır.',
];
export const MAX_GIVERS = 5, CLUE_MS = 45000, GUESS_MS = 35000, REVEAL_MS = 8000;
export const PLACE_MS = CLUE_MS;
export const BANDS = [[4, 4], [10, 3], [18, 2], [28, 1]];     // [en çok sapma (0-100), puan]
export const phaseOf = (d) => (d.round % 2 === 1 ? 'clue' : 'guess');
export const giverIdx = (d) => (d.round - 1) >> 1;
export const placeMs = (d) => (phaseOf(d) === 'clue' ? CLUE_MS : GUESS_MS);
export const pointsFor = (err) => { for (const [lim, p] of BANDS) if (err <= lim) return p; return 0; };

export function init(ids, env) {
  const all = ids.slice();
  while (all.length < 3 && env && env.addBot) all.push(env.addBot().id);
  const order = shuffle(all).slice(0, Math.min(MAX_GIVERS, all.length));
  const axes = shuffle(AYAR.map((_, i) => i)).slice(0, order.length);
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  return {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [],
    order, axes, targets: order.map(() => 6 + Math.floor(Math.random() * 89)),     // 6..94 arası gizli nokta
    clues: [], score: Object.fromEntries(all.map((id) => [id, 0])), bots: [...bots],
  };
}
export const lastRound = (g) => g.order.length * 2;
const giverOf = (d) => d.g.order[giverIdx(d)];
const axisOf = (d) => (d.g.custom && d.g.custom[giverIdx(d)]) || AYAR[d.g.axes[giverIdx(d)]];

export function normalize(d, pid, body) {
  if (phaseOf(d) === 'clue') {
    if (pid !== giverOf(d)) throw new GameError('Şu an anlatıcı değilsin 🙂');
    const t = String(body.clue || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (t.length < 2) throw new GameError('İpucun çok kısa');
    const clean = (v, def) => { const x = String(v === undefined ? def : v).replace(/\s+/g, ' ').trim().slice(0, 22); return x || def; };
    const [la, ra] = AYAR[d.g.axes[giverIdx(d)]];
    return { clue: t, left: clean(body.left, la), right: clean(body.right, ra) };
  }
  if (pid === giverOf(d)) throw new GameError('Anlatıcı tahmin yapmaz');
  const v = Number(body.v);
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new GameError('Geçersiz tahmin');
  return { v: Math.round(v * 10) / 10 };
}
export function auto(d, pid, bot) {
  if (phaseOf(d) === 'clue') {
    if (pid !== giverOf(d)) return {};
    const [a, b] = axisOf(d), t = d.g.targets[giverIdx(d)];
    return { clue: bot ? (t < 33 ? `biraz ${a.toLowerCase()}` : t > 66 ? `çok ${b.toLowerCase()}` : 'tam ortalarda bir şey') : '…' };
  }
  if (pid === giverOf(d)) return {};
  const t = d.g.targets[giverIdx(d)];
  return bot ? { v: Math.max(0, Math.min(100, Math.round((t + (Math.random() + Math.random() - 1) * 40) * 10) / 10)) } : { v: null };
}

// Yalnızca gereken oyuncular beklenir: ipucunda anlatıcı, tahminde diğerleri
export function isDue(d, now, wait) {
  if (now > d.deadline + 1000) return true;
  const g = d.g, giver = giverOf(d), isBot = (id) => g.bots.includes(id);
  if (phaseOf(d) === 'clue') return isBot(giver) || !wait || !wait(giver) ? now >= d.roundStart : !!d.actions[giver];
  const need = Object.keys(g.alive).filter((id) => id !== giver && !isBot(id) && (!wait || wait(id)));
  if (!need.length) return now >= d.roundStart;
  return need.every((id) => d.actions[id]);
}

export function resolve(d, actions) {
  const g = d.g, k = giverIdx(d), giver = giverOf(d);
  if (phaseOf(d) === 'clue') {
    const a = actions[giver];
    g.clues[k] = a && a.clue ? a.clue : '(ipucu yok)';
    if (a && a.left && a.right) { g.custom = g.custom || {}; g.custom[k] = [a.left, a.right]; }
    return { entry: { phase: 'clue', giver }, dur: 800 };
  }
  const target = g.targets[k], ids = Object.keys(g.alive).filter((id) => g.alive[id] && id !== giver);
  const rows = ids.map((id) => { const v = actions[id] && actions[id].v !== null && actions[id].v !== undefined ? actions[id].v : null; const err = v === null ? null : Math.abs(v - target); return { id, v, err, pts: err === null ? 0 : pointsFor(err) }; });
  for (const r of rows) g.score[r.id] += r.pts;
  const avg = rows.length ? rows.reduce((a, r) => a + r.pts, 0) / rows.length : 0;
  const gp = Math.round(avg);
  g.score[giver] += gp;
  return { entry: { phase: 'guess', giver, axis: axisOf(d), clue: g.clues[k], target, rows, giverPts: gp, score: { ...g.score } }, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < lastRound(d.g)) return null;
  const s = d.g.score, ids = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Hedef yalnızca anlatıcıya (ve açıklama anında) gider
export function view(d, pid) {
  const g = d.g, giver = giverOf(d);
  return {
    alive: g.alive, phase: phaseOf(d), giver, turn: giverIdx(d) + 1, turns: g.order.length, axis: axisOf(d),
    target: pid === giver ? g.targets[giverIdx(d)] : null, clue: phaseOf(d) === 'guess' ? g.clues[giverIdx(d)] : null, score: g.score,
  };
}
