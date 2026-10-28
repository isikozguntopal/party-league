// 🎨 Kulaktan Kulağa — Gartic Phone mantığı
// 1) Herkes bir cümle yazar. 2) Cümleler döner: bir sonraki kişi ÇİZER. 3) Sonraki kişi çizimi görüp
// ne olduğunu YAZAR. Yazma/çizme sırayla devam eder; kimse önceki adımlar dışında bir şey görmez.
// Sonunda albümler adım adım açılır (sohbet akışı gibi), çizimlere ➕/➖ puan verilir; tahminler
// zincirin ilk cümlesine ne kadar yakınsa o kadar puan kazandırır. En sonda puan tablosu + ressamlar açıklanır.
import { GameError, shuffle } from './util.js';
import { DOODLES, PROMPTS, conceptFor, botGuess, drawDoodle, artDuration, replayMs } from './doodles.js';

export const KIND = 'cizim';
export const TITLE = 'Kulaktan Kulağa';
export const EMOJI = '🎨';
export const RULES = [
  'Bir cümle yaz. Sonra sana gelen cümleyi çiz (kalem, kova, şekiller…).',
  'Sana gelen çizimin ne olduğunu tahmin edip yaz. Böyle sürer!',
  'Albümde her çizimin altında ➕ / ➖ ile puan ver (ressam gizli). Tahminin ilk cümleye yakınsa 🎯 bonus puan.',
  'Sonuç: çizim oyları + tahmin yakınlığı. Kim neyi çizdi en sonda açıklanır.',
];
export const PLACE_MS = 45000;
const TIMES = { write: 45000, draw: 80000, guess: 40000 };
const ALBUM_TEXT_MS = 4200, ALBUM_VOTE_MS = 3800;
// Çizime oy zorunlu: herkes oy verene kadar albüm ilerlemez. Telefonu başında ama oy vermeyen biri
// herkesi sonsuza kadar tutmasın diye süre bitiminden sonra en fazla bu kadar daha beklenir.
const VOTE_GRACE_MS = 25000;
export const FINAL_MS = 9000;     // son puan tablosu + ressamların açıklanması
export const ART = true;          // çizimler ayrı depolanır (bkz. game-core)

const clean = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '');
const stepType = (k) => (k === 0 ? 'write' : k % 2 ? 'draw' : 'guess');

// ---------- Tahmin yakınlığı (Türkçe normalize + kelime örtüşmesi + Levenshtein) ----------
const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const STOP = new Set(['bir', 've', 'ile', 'cok', 'bu', 'su', 'o', 'da', 'de', 'ki', 'mi', 'mu', 'ama', 'icin', 'gibi', 'bence', 'galiba', 'kesin', 'sanirim', 'herhalde', 'belki', 'tane', 'adet']);
export const normalizeText = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] || c).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
const tokens = (s) => normalizeText(s).split(' ').filter((t) => t && !STOP.has(t));
// iki kelime "aynı" sayılır: eşit, kök ortak (kedi/kediler) ya da uzun kelimede 1 harf hatası
const tokEq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= 1);
// 0..1 benzerlik: kelime örtüşmesi (Dice) ile karakter benzerliğinin büyüğü
export function similarity(orig, guess) {
  const A = normalizeText(orig), B = normalizeText(guess);
  if (!A || !B) return 0;
  const charSim = 1 - levenshtein(A, B) / Math.max(A.length, B.length);
  const ta = tokens(A), tb = tokens(B);
  let dice = 0;
  if (ta.length && tb.length) {
    const used = new Set();
    let m = 0;
    for (const x of ta) { const j = tb.findIndex((y, i) => !used.has(i) && tokEq(x, y)); if (j >= 0) { used.add(j); m++; } }
    dice = (2 * m) / (ta.length + tb.length);
  }
  return Math.round(Math.max(dice, charSim) * 100) / 100;
}
export const simPts = (sim) => (sim >= 0.8 ? 3 : sim >= 0.6 ? 2 : sim >= 0.4 ? 1 : 0);

export function init(ids, env) {
  const order = shuffle(ids);
  const N = order.length;
  const S = Math.max(4, Math.min(N, 8));
  const bots = env ? env.players.filter((p) => p.bot).map((p) => p.id) : [];
  return {
    alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [], bots,
    order, S, chains: order.map(() => []), phase: 'game', album: [], ai: -1, votes: {}, skip: 0, done: false,
  };
}
// k. adımda i. oyuncunun üzerinde çalıştığı zincir
const chainOf = (g, i, k) => ((i - k) % g.order.length + g.order.length) % g.order.length;
const stepOf = (d) => d.round - 1;
export const isDraw = (d) => d.g.phase === 'game' && stepType(stepOf(d)) === 'draw';

export const placeMs = (d) => {
  if (d.g.phase === 'album') { const it = d.g.album[d.g.ai]; return it && it.type === 'draw' ? replayMs(it.dur) + ALBUM_VOTE_MS : ALBUM_TEXT_MS; }
  if (d.g.phase === 'final') return FINAL_MS;
  return TIMES[stepType(stepOf(d))];
};
// Albüm/sonuçta herkesin hazır olmasını bekleme: süre ya da oda sahibinin "sonraki" demesi
// Şu an gösterilen çizime henüz oy vermemiş oyuncular (ressam hariç). canWait(id): bu oyuncu beklenir mi
// (bot, çıkmış ya da uzaktaki oyuncular beklenmez). Gösterilen şey çizim değilse boş döner.
export function pendingVoters(d, canWait = () => true) {
  const g = d.g, it = g.phase === 'album' ? g.album[g.ai] : null;
  if (!it || it.type !== 'draw') return [];
  const by = g.chains[it.c][it.k].by, votes = g.votes[g.ai] || {};
  return Object.keys(g.alive).filter((id) => id !== by && !(id in votes) && !g.bots.includes(id) && canWait(id));
}
export const isDue = (d, now, canWait) => {
  if (d.g.phase === 'final') return now >= d.deadline || d.g.skip === d.round;
  if (d.g.phase !== 'album') return null;
  if (!(now >= d.deadline || d.g.skip === d.round)) return false;
  return pendingVoters(d, canWait).length === 0 || now >= d.deadline + VOTE_GRACE_MS;
};

export function normalize(d, pid, body) {
  if (d.g.phase !== 'game') throw new GameError('Albüm gösteriliyor');
  const type = stepType(stepOf(d));
  if (type === 'draw') {
    if (body.artKey) return { art: { key: body.artKey, dur: Math.max(0, Math.min(300000, Number(body.artDur) || 0)) } };
    return { art: null };
  }
  const text = clean(body.text);
  if (!text) throw new GameError('Bir şey yaz');
  return { text };
}

export function auto(d, pid) {
  const g = d.g, k = stepOf(d), type = stepType(k);
  if (g.phase !== 'game') return {};
  const i = g.order.indexOf(pid);
  const prev = k > 0 ? g.chains[chainOf(g, i, k)][k - 1] : null;
  if (type === 'write') return { text: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] };
  if (type === 'draw') {
    if (!g.bots.includes(pid)) return { art: null }; // insan hiçbir şey göndermediyse boş kalır
    const doodle = conceptFor(prev && prev.text), seed = Math.floor(Math.random() * 1e9);
    return { art: { doodle, seed, dur: artDuration(drawDoodle(doodle, seed)) } };
  }
  return { text: botGuess(prev && prev.art && prev.art.doodle) };
}

export function resolve(d, actions) {
  const g = d.g;
  if (g.phase === 'final') { g.done = true; return { entry: { final: true }, dur: 0 }; }
  if (g.phase === 'album') {
    // botlar biten çizime oy verir (kendi çizimleri hariç)
    const it = g.album[g.ai];
    if (it && it.type === 'draw') {
      const by = g.chains[it.c][it.k].by;
      const v = (g.votes[g.ai] = g.votes[g.ai] || {});
      for (const b of g.bots) if (b !== by && !(b in v)) v[b] = Math.random() < 0.65 ? 1 : -1;
    }
    g.ai += 1;
    if (g.ai >= g.album.length) { g.phase = 'final'; g.ai = g.album.length; }
    return { entry: { album: true, ai: g.ai }, dur: 250 };
  }
  const k = stepOf(d);
  g.order.forEach((pid, i) => {
    const a = actions[pid] || auto(d, pid);
    const c = chainOf(g, i, k);
    const e = { by: pid, type: stepType(k) === 'draw' ? 'draw' : 'text', ...(a.text ? { text: a.text } : {}), ...(a.art !== undefined ? { art: a.art } : {}) };
    if (stepType(k) === 'guess') {
      // tahmin zincirin ilk cümlesine ne kadar yakın? (cümlenin sahibi kendi zincirini tahmin ediyorsa puan yok)
      const orig = g.chains[c][0];
      e.sim = similarity(orig && orig.text, e.text);
      e.self = !!orig && orig.by === pid;
      e.pts = e.self ? 0 : simPts(e.sim);
    }
    g.chains[c][k] = e;
  });
  if (k === g.S - 1) {
    g.phase = 'album';
    g.album = [];
    g.chains.forEach((ch, c) => ch.forEach((e, kk) => g.album.push({ c, k: kk, type: e.type, dur: e.art ? e.art.dur || 0 : 0 })));
    g.ai = 0;
  }
  return { entry: { step: k }, dur: 900 };
}

const voteSum = (g, n) => Object.values(g.votes[n] || {}).reduce((a, b) => a + b, 0);
// Oyuncu başına puan dökümü: çizim oyları + tahmin yakınlığı
export function totals(d, participants = Object.keys(d.g.alive)) {
  const g = d.g;
  const t = Object.fromEntries(participants.map((id) => [id, { votes: 0, sim: 0, total: 0 }]));
  g.album.forEach((it, n) => { const by = g.chains[it.c][it.k].by; if (it.type === 'draw' && by in t) t[by].votes += voteSum(g, n); });
  g.chains.forEach((ch) => ch.forEach((e) => { if (e.type === 'text' && e.pts && e.by in t) t[e.by].sim += e.pts; }));
  for (const id of participants) t[id].total = t[id].votes + t[id].sim;
  return t;
}
// Son tablo gösterildikten sonra toplam puana göre sıralama
export function ranking(d, participants) {
  const g = d.g;
  if (g.phase !== 'final' || !g.done) return null;
  const t = totals(d, participants);
  const ids = participants.slice().sort((a, b) => t[b].total - t[a].total || t[b].votes - t[a].votes);
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && t[last[0]].total === t[id].total) last.push(id); else groups.push([id]); }
  return groups;
}

// Albümde ➕/➖ oy ve oda sahibinin "sonraki"
export function gact(d, pid, body) {
  const g = d.g;
  if (body.next) {
    if (d.hostId !== pid) throw new GameError('Sadece oda sahibi ilerletebilir');
    if (g.phase !== 'album' && g.phase !== 'final') return false;
    g.skip = d.round;
    return true;
  }
  if (body.vote !== undefined) {
    const n = Number(body.vote), v = Number(body.v);
    if (g.phase !== 'album' || !Number.isInteger(n) || n < 0 || n > g.ai || n >= g.album.length || (v !== 1 && v !== -1)) throw new GameError('Oy verilemez');
    const it = g.album[n];
    if (it.type !== 'draw') throw new GameError('Yalnızca çizimlere oy verilir');
    if (g.chains[it.c][it.k].by === pid) throw new GameError('Kendi çizimine oy veremezsin 😄');
    const votes = (g.votes[n] = g.votes[n] || {});
    if (votes[pid] === v) return false;
    votes[pid] = v;
    return true;
  }
  return false;
}

// Herkes yalnızca kendi görevini görür; albümde ise açılmış kısımlar gösterilir
export function view(d, pid) {
  const g = d.g;
  const base = { alive: g.alive, phase: g.phase, S: g.S, step: stepOf(d), type: g.phase === 'game' ? stepType(stepOf(d)) : null, order: g.order, chains: g.order.length };
  if (g.phase === 'game') {
    const i = g.order.indexOf(pid), k = stepOf(d);
    const prev = i >= 0 && k > 0 ? g.chains[chainOf(g, i, k)][k - 1] : null;
    return { ...base, task: prev ? { type: prev.type, text: prev.text, art: prev.art } : null };
  }
  const owners = g.chains.map((ch) => ch[0] && ch[0].by);
  if (g.phase === 'final') {
    const t = totals(d);
    const board = Object.keys(t).map((id) => ({ id, ...t[id] })).sort((a, b) => b.total - a.total || b.votes - a.votes);
    const gallery = [];
    g.album.forEach((it, n) => { const e = g.chains[it.c][it.k]; if (e.type === 'draw') gallery.push({ n, c: it.c, k: it.k, by: e.by, art: e.art, prompt: (g.chains[it.c][it.k - 1] || {}).text || '', score: voteSum(g, n) }); });
    return { ...base, ai: g.ai, total: g.album.length, board, gallery, owners };
  }
  // albüm: 'by' çizimlerde de gönderilir (istemci gizler; "kendi çizimin" uyarısı için gerekli)
  const shown = g.album.slice(0, Math.min(g.album.length, g.ai + 1)).map((it, n) => {
    const e = g.chains[it.c][it.k];
    const votes = g.votes[n] || {};
    const out = { n, c: it.c, k: it.k, type: e.type, by: e.by, text: e.text, art: e.art, dur: it.dur, score: voteSum(g, n), plus: Object.values(votes).filter((v) => v > 0).length, minus: Object.values(votes).filter((v) => v < 0).length, myVote: votes[pid] || 0 };
    if (e.type === 'text' && it.k > 0) { out.sim = e.sim || 0; out.pts = e.pts || 0; if (e.self) out.self = true; }
    return out;
  });
  // Oy zorunluluğu: bekleyen sayısı (herkese) ve bu oyuncunun hâlâ oy vermesi gerekip gerekmediği
  const waitIds = pendingVoters(d, (id) => { const p = d.players.find((q) => q.id === id); return !!p && !p.left; });
  return { ...base, ai: g.ai, total: g.album.length, shown, owners, waiting: waitIds.length, waitIds, mustVote: waitIds.includes(pid) };
}

export const DOODLE_NAMES = DOODLES;
