// 🎧 Şarkıyı Tahmin Et — takımlı müzik tahmin yarışı (Heardle tarzı).
// Her turda herkes aynı şarkının önizlemesini dinler; ses önce yalnızca 0.5 sn çalar, sonra 1.5 → 5 → 10 → 20 sn uzar.
// Takım arkadaşları AYNI tahmin hakkını paylaşır: biri yanlış tahmin ya da "atla" derse takım bir sonraki aşamaya geçer (toplam 5 aşama).
// Şarkıyı ne kadar erken bilirse takım o kadar çok puan alır. Tahmin yalnızca şarkı listesinden seçilerek yapılır (otomatik tamamlama).
// Ses dosyaları tarayıcıda iTunes önizlemesinden çalınır (client/melodi.js); sunucu yalnızca takım durumunu ve cevabı tutar.
// Tur tabanlı çerçeve + `gact` (tahmin/atla). Bir tur = bir şarkı; tüm takımlar bitirince ya da süre dolunca sonuç açılır.
import { GameError, pairUp, shuffle } from './util.js';
import { SONGS } from './melodi-sarkilar.js';

export const KIND = 'melodi';
export const TITLE = 'Şarkıyı Tahmin Et';
export const EMOJI = '🎧';
export const RULES = [
  'Takımınla aynı şarkıyı dinleyin: ses önce 0,5 sn, sonra 1,5 → 5 → 10 → 20 sn uzar.',
  'Listeden şarkıyı seçip tahmin et ya da "Atla" de: yanlış tahmin/atla takımı sonraki aşamaya geçirir (5 aşama).',
  'Ne kadar erken bilirsen takım o kadar çok puan alır. 5 şarkı sonunda en çok puanlı takım kazanır.',
];
export const STAGES = [500, 1500, 5000, 10000, 20000];     // dinleme süreleri (ms)
export const STAGE_POINTS = [150, 120, 90, 60, 30];         // şarkıyı bildiği aşamaya göre takım puanı
export const SONG_COUNT = 5, ROUND_MS = 80000, REVEAL_MS = 7500;
export const PLACE_MS = ROUND_MS;
export const placeMs = () => ROUND_MS;
export const POOL = SONGS.map(([id, t, a, u]) => ({ id, t, a, u }));
export const POOL_SIZE = POOL.length;

const newRound = (g, k) => ({
  song: g.songs[k],
  teams: Object.fromEntries(g.teams.map((t) => [t.id, { stage: 0, wrong: [], solved: -1, done: false }])),
});

export function init(ids, env) {
  const teams = pairUp(env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) }, { trio: true });
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  const all = teams.flat();
  const g = {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [],
    teams: teams.map((members, i) => ({ id: i, members, bot: members.every((id) => bots.has(id)) })),
    bots: [...bots], songs: shuffle(POOL.map((_, i) => i)).slice(0, SONG_COUNT),
    scores: Object.fromEntries(all.map((id) => [id, 0])), cur: null,
  };
  g.cur = newRound(g, 0);
  return g;
}
const teamOf = (g, pid) => g.teams.find((t) => t.members.includes(pid)) || null;
const allDone = (g) => g.teams.every((t) => t.bot || g.cur.teams[t.id].done);

// Hamle (act) yok; tahmin ve atla `gact` ile gelir
export function normalize() { throw new GameError('Bu oyunda tahmin listeden yapılır'); }
export const auto = () => ({});
export function isDue(d, now) { return allDone(d.g) || now > d.deadline + 1000; }

// gact: { t: 'guess', i: şarkı sırası } ya da { t: 'skip' }, round: tur
export function gact(d, pid, body, now) {
  const g = d.g;
  if (body.round !== d.round || now < d.roundStart) return false;
  const team = teamOf(g, pid), p = d.players.find((x) => x.id === pid);
  if (!team || !g.alive[pid] || (p && p.bot)) throw new GameError('Bu turda oynamıyorsun');
  const st = g.cur.teams[team.id];
  if (st.done) return false;
  const skip = body.t === 'skip';
  if (!skip) {
    const i = Number(body.i);
    if (body.t !== 'guess' || !Number.isInteger(i) || i < 0 || i >= POOL.length) throw new GameError('Listeden bir şarkı seç');
    if (st.wrong.some((w) => w.i === i)) return false;                          // aynı yanlışı tekrar sayma
    if (i === g.cur.song) { st.solved = st.stage; st.done = true; st.at = now; st.by = pid; return true; }
    st.wrong.push({ by: pid, i });
  } else st.wrong.push({ by: pid, i: -1 });
  st.stage += 1;
  if (st.stage >= STAGES.length) { st.done = true; st.at = now; }
  return true;
}

export function resolve(d) {
  const g = d.g, cur = g.cur, song = POOL[cur.song];
  const rows = g.teams.map((t) => {
    const st = cur.teams[t.id];
    // yalnızca botlardan oluşan takım: rastgele bir aşamada bilir (ya da bilemez)
    if (t.bot && !st.done) { if (Math.random() < 0.6) { st.solved = 1 + Math.floor(Math.random() * 4); } st.done = true; }
    const pts = st.solved >= 0 ? STAGE_POINTS[st.solved] : 0;
    for (const id of t.members) g.scores[id] += pts;
    return { team: t.id, members: t.members, solved: st.solved, stage: st.stage, pts, tries: st.wrong.length + (st.solved >= 0 ? 1 : 0) };
  });
  const entry = { phase: 'reveal', n: d.round, total: SONG_COUNT, song: { id: song.id, t: song.t, a: song.a }, rows, scores: { ...g.scores } };
  if (d.round < SONG_COUNT) g.cur = newRound(g, d.round);
  return { entry, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < SONG_COUNT) return null;
  const s = d.g.scores;
  const ids = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Cevap gönderilmez; yalnızca ses için iTunes numarası (tid) ve takımların aşaması (kim bildi, kaçıncı aşamada)
export function view(d, pid) {
  const g = d.g, cur = g.cur, mine = teamOf(g, pid);
  const song = POOL[cur.song];
  return {
    phase: 'play', n: d.round, total: SONG_COUNT, tid: song.id, url: song.u || null, stages: STAGES, pts: STAGE_POINTS,
    alive: g.alive, scores: g.scores,
    teams: g.teams.map((t) => { const st = cur.teams[t.id]; return { id: t.id, members: t.members, bot: t.bot, stage: st.stage, solved: st.solved, done: t.bot ? true : st.done }; }),
    mine: mine ? mine.id : -1,
    wrong: mine ? cur.teams[mine.id].wrong : [],
  };
}
