// 🧩 Ne Kadar Tanıyorsun? — takımlar (oda sahibinin dağıttığı ya da rastgele; ikili/üçlü). Önce herkes kendisi hakkında 5 soruyu (4 şıkkın biri) gizlice cevaplar.
// Sonra takımlar SIRAYLA oynar: takım arkadaşları birbirinin cevaplarını tahmin eder. Herkes gönderene dek cevaplar görünmez.
// Takım gönderince cevaplar tüm odaya açılır ve açık KALIR (inceleme turu): oda sahibi "Sonraki"ye basana dek yeni tur ve skor gelmez.
// Doğru her tahmin hem tahmin edene hem tanınan arkadaşa puan verir; puanlar oyun bitince açıklanır.
// Turlar: 1 = profil; sonra her takım için iki tur: çift = o takım tahmin eder, tek = herkes sonuçları inceler.
import { GameError, pairUp, shuffle } from './util.js';
import { TANIR } from './tanir-sorular.js';

export const KIND = 'tanir';
export const TITLE = 'Ne Kadar Tanıyorsun?';
export const EMOJI = '🧩';
export const RULES = [
  'Takımlar (ikili ya da üçlü). Önce herkes kendisi hakkında 5 soruyu cevaplar.',
  'Sonra takımlar sırayla oynar: arkadaşının cevaplarını tahmin et!',
  'Cevaplar açılınca oda sahibi "Sonraki"ye basana dek hep birlikte incelenir; skor oyun sonunda açıklanır.',
];
export const Q_COUNT = 5, OPTS = 4, POINTS = 100;
export const PROFILE_MS = 90000, TEAM_MS = 75000, REVEAL_PROFILE_MS = 2200, REVEAL_TEAM_MS = 1200, REVIEW_MS = 4 * 60 * 1000;
export const PLACE_MS = PROFILE_MS;

// 'profile' | 'team' (takım tahmin ediyor) | 'review' (cevaplar açık, oda sahibi sonrakine geçirir)
export const phaseOf = (d) => (d.round === 1 ? 'profile' : d.round % 2 === 0 ? 'team' : 'review');
export const placeMs = (d) => ({ profile: PROFILE_MS, team: TEAM_MS, review: REVIEW_MS })[phaseOf(d)];

export function init(ids, env) {
  const teams = pairUp(env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) }, { trio: true });
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  const qs = shuffle(TANIR.map((_, i) => i)).slice(0, Q_COUNT);
  const order = shuffle(teams.map((_, i) => i));        // takımların oynama sırası
  const all = teams.flat();
  return {
    alive: Object.fromEntries(all.map((id) => [id, true])), outs: [],
    teams: order.map((ti, k) => ({ id: k, members: teams[ti], bot: teams[ti].every((id) => bots.has(id)) })),
    bots: [...bots], qs, answers: {}, scores: Object.fromEntries(all.map((id) => [id, 0])), review: null, next: false,
  };
}
const bank = (g) => g.qs.map((i) => ({ q: TANIR[i][0], o: TANIR[i].slice(1) }));
const teamIdxOf = (d) => (d.round - 2) >> 1;
const teamOfRound = (d) => (d.round >= 2 ? d.g.teams[teamIdxOf(d)] : null);
export const lastRound = (g) => 1 + 2 * g.teams.length;

export function normalize(d, pid, body) {
  const ph = phaseOf(d);
  if (ph === 'review') throw new GameError('Sonuçlar inceleniyor, oda sahibi devam ettirecek 🙂');
  if (ph === 'profile') {
    const a = body.a;
    if (!Array.isArray(a) || a.length !== Q_COUNT || !a.every((v) => Number.isInteger(v) && v >= 0 && v < OPTS)) throw new GameError('Tüm soruları cevapla');
    return { a };
  }
  const team = teamOfRound(d);
  if (!team.members.includes(pid)) throw new GameError('Şu an sıra başka takımda, izliyorsun 🙂');
  const mates = team.members.filter((id) => id !== pid);
  const out = {};
  for (const m of mates) {
    const a = body.g && body.g[m];
    if (!Array.isArray(a) || a.length !== Q_COUNT || !a.every((v) => Number.isInteger(v) && v >= 0 && v < OPTS)) throw new GameError('Tüm tahminleri yap');
    out[m] = a;
  }
  return { g: out };
}
const rnd = () => Array.from({ length: Q_COUNT }, () => Math.floor(Math.random() * OPTS));
export function auto(d, pid, bot) {
  const ph = phaseOf(d);
  if (ph === 'review') return {};
  if (ph === 'profile') return bot ? { a: rnd() } : { a: null };
  const team = teamOfRound(d);
  if (!team || !team.members.includes(pid)) return {};
  const mates = team.members.filter((id) => id !== pid);
  return bot ? { g: Object.fromEntries(mates.map((m) => [m, rnd()])) } : { g: null };
}

// Takım sırasında yalnızca o takımın (beklenebilir) insanları beklenir; inceleme turunu oda sahibi bitirir
export function isDue(d, now, wait) {
  const ph = phaseOf(d);
  if (ph === 'profile') return null;
  if (ph === 'review') return !!d.g.next || now > d.deadline + 1000;
  if (now > d.deadline + 1000) return true;              // süre doldu: gönderenler sayılır, göndermeyenin tahmini boş kalır
  const team = teamOfRound(d);
  const need = team.members.filter((id) => !(d.g.bots || []).includes(id) && (!wait || wait(id)));
  if (!need.length) return now >= d.roundStart;
  return need.every((id) => d.actions[id]);
}

// İnceleme turunda oda sahibi "Sonraki"ye basar
export function gact(d, pid, body) {
  if (phaseOf(d) !== 'review' || body.t !== 'next' || body.round !== d.round) return false;
  if (d.hostId !== pid) throw new GameError('Sadece oda sahibi devam ettirebilir', 403);
  if (d.g.next) return false;
  d.g.next = true;
  return true;
}

export function resolve(d, actions) {
  const g = d.g;
  const ph = phaseOf(d);
  if (ph === 'profile') {
    for (const id of Object.keys(g.alive)) g.answers[id] = (actions[id] && actions[id].a) || null;
    return { entry: { phase: 'profile' }, dur: REVEAL_PROFILE_MS };
  }
  if (ph === 'review') { g.next = false; g.review = null; return { entry: { phase: 'next' }, dur: 0 }; }
  const team = teamOfRound(d), qs = bank(g);
  const gains = Object.fromEntries(team.members.map((id) => [id, 0]));
  const correct = Object.fromEntries(team.members.map((id) => [id, 0]));   // kim, tanıdığı arkadaşından kaç doğru yaptı
  const rows = qs.map((q) => ({ q: q.q, o: q.o, truth: {}, guesses: {} }));
  for (const target of team.members) {
    const ans = g.answers[target];
    rows.forEach((r, qi) => { r.truth[target] = ans ? ans[qi] : null; });
    for (const guesser of team.members) {
      if (guesser === target) continue;
      const gs = actions[guesser] && actions[guesser].g && actions[guesser].g[target];
      rows.forEach((r, qi) => {
        const v = gs ? gs[qi] : null;
        (r.guesses[guesser] = r.guesses[guesser] || {})[target] = v;
        if (v !== null && ans && v === ans[qi]) { gains[guesser] += POINTS; gains[target] += POINTS; correct[guesser]++; }
      });
    }
  }
  for (const [id, v] of Object.entries(gains)) g.scores[id] += v;
  // Açık kalacak sonuç (inceleme turu): puan toplamları ve diğer takımların puanları gösterilmez
  g.review = { team: team.members, teamIdx: team.id, rows, gains, correct, asked: Q_COUNT * (team.members.length - 1) };
  return { entry: { phase: 'team', team: team.members, teamIdx: team.id }, dur: REVEAL_TEAM_MS };
}

export function ranking(d, participants) {
  if (d.round < lastRound(d.g)) return null;
  const s = d.g.scores;
  const ids = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Cevaplar ve tahminler açılana dek kimseye gönderilmez (yalnızca kendi cevabım/tahminim `myAction` ile gelir). Skorlar oyun bitene dek gönderilmez.
export function view(d, pid) {
  const g = d.g;
  const ph = phaseOf(d);
  const base = {
    alive: g.alive, qs: bank(g), total: lastRound(g), teamCount: g.teams.length,
    teams: g.teams.map((t) => ({ id: t.id, members: t.members, bot: t.bot })),
  };
  if (ph === 'profile') return { ...base, phase: 'profile' };
  const team = teamOfRound(d);
  const mine = team.members.includes(pid);
  if (ph === 'team') return { ...base, phase: 'team', teamIdx: team.id, team: team.members, mine, mates: mine ? team.members.filter((id) => id !== pid) : [] };
  return { ...base, phase: 'review', teamIdx: team.id, team: team.members, mine, isLast: d.round >= lastRound(g), review: g.review, hostId: d.hostId };
}
