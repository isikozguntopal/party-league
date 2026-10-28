// 🧠 Bil Bakalım — Kahoot tarzı bilgi yarışması
// 1) Kategori oylaması (herkes görür kim neye oy verdi). Herkese 2 joker verilir: ✂️ Yarı Yarıya, ✌️ Çift Cevap.
// 2) Kazanan kategoriden 4 soru. 3) O an sonuncu olan oyuncu kalan 4 sorunun konusunu seçer.
// Her soru 15 sn; doğru cevap 500–1000 puan. Jokerler oyun boyunca birer kez kullanılır.
import { GameError, shuffle } from './util.js';
import DIZI from './sorular/dizi.js';
import BILIM from './sorular/bilim.js';
import TARIH from './sorular/tarih.js';
import INSAN from './sorular/insan.js';
import KELIME from './sorular/kelime.js';
import GENEL from './sorular/genel.js';
import SPOR from './sorular/spor.js';
import COGRAFYA from './sorular/cografya.js';

export const KIND = 'bilgi';
export const TITLE = 'Bil Bakalım';
export const EMOJI = '🧠';
export const RULES = [
  'Önce kategoriye oy ver. Herkesin 2 jokeri var: ✂️ Yarı Yarıya, ✌️ Çift Cevap.',
  '4 soru sonra sonuncu olan kalan 4 sorunun konusunu seçer.',
  'Jokerlerini doğru anda kullan! En çok puanı toplayan kazanır.',
];
export const CATS = [
  { id: 'dizi', emoji: '🎬', title: 'Yeşilçam & Diziler', qs: DIZI },
  { id: 'bilim', emoji: '🔬', title: 'Bilim ve Keşif', qs: BILIM },
  { id: 'tarih', emoji: '🏛️', title: 'Tarih Yolculuğu', qs: TARIH },
  { id: 'insan', emoji: '🧬', title: 'İnsan ve Evrim', qs: INSAN },
  { id: 'kelime', emoji: '🔤', title: 'Deyimler & Kelimeler', qs: KELIME },
  { id: 'genel', emoji: '🌍', title: 'Genel Kültür', qs: GENEL },
  { id: 'spor', emoji: '⚽', title: 'Spor & Oyun', qs: SPOR },
  { id: 'cografya', emoji: '🗺️', title: 'Coğrafya & Gezi', qs: COGRAFYA },
];
// Jokerler: herkeste baştan var, oyun boyunca birer kez kullanılır
export const JOKERS = {
  yari: { emoji: '✂️', title: 'Yarı Yarıya', desc: 'İki yanlış şıkkı siler' },
  cift: { emoji: '✌️', title: 'Çift Cevap', desc: 'İki şık işaretle, biri doğruysa doğru sayılır (puan %60)' },
};
export const CIFT_MULT = 0.6;
// Az kişi bilince puan artar: tek bilen ×1,75'e kadar, herkes bilirse ×1
export const multFor = (nCorrect, nAlive) => (nCorrect > 0 && nAlive > 1 ? Math.round((1 + (1 - nCorrect / nAlive) * 1) * 100) / 100 : 1);
export const PLACE_MS = 15000;
export const QUESTIONS = 8;
export const REVEAL_MS = 4800;
const VOTE_MS = 13000, PICK_MS = 12000;
export const HALF = 4;                // ilk konudan soru sayısı
export const PICK_ROUND = 2 + HALF;   // 6. tur: sonuncu konu seçer
export const LAST_ROUND = PICK_ROUND + QUESTIONS - HALF;

const phaseOf = (d) => (d.round === 1 ? 'vote' : d.round === PICK_ROUND ? 'pick' : 'q');
// tur → soru sırası (1: oylama, 2-5: soru 0-3, 6: konu seçimi, 7-10: soru 4-7)
export const qIndex = (round) => (round < PICK_ROUND ? round - 2 : round - 3);
export const placeMs = (d) => ({ vote: VOTE_MS, pick: PICK_MS, q: PLACE_MS }[phaseOf(d)]);

// Konu seçiminde yalnızca sonuncu oyuncu beklenir (bot ise kısa bir düşünme payı)
export function isDue(d, now) {
  if (phaseOf(d) !== 'pick') return null;
  const id = d.g.chooser, p = (d.players || []).find((x) => x.id === id);
  if (d.actions[id]) return true;
  if (!p || p.left || p.bot) return now >= d.roundStart + 2500;
  if (now - (p.seen || 0) > 12000) return true;
  return now > d.deadline + 1000;
}
const otherCats = (g) => CATS.filter((c) => c.id !== g.cat);

export function init(ids, env) {
  return {
    alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [],
    bots: env ? env.players.filter((p) => p.bot).map((p) => p.id) : [],
    cat: null, qs: [], scores: Object.fromEntries(ids.map((id) => [id, 0])),
    // kalan joker hakları ve hangi soruda açıldıkları
    jk: Object.fromEntries(ids.map((id) => [id, { yari: true, cift: true }])), yari: {}, cift: {},
  };
}

export function normalize(d, pid, body, now) {
  const ph = phaseOf(d);
  if (ph === 'vote') {
    if (!CATS.some((c) => c.id === body.cat)) throw new GameError('Geçersiz kategori');
    return { cat: body.cat };
  }
  if (ph === 'pick') {
    if (pid !== d.g.chooser) throw new GameError('Konuyu sonuncu oyuncu seçiyor');
    if (!otherCats(d.g).some((c) => c.id === body.cat)) throw new GameError('Geçersiz kategori');
    return { cat: body.cat };
  }
  const a = Number(body.a);
  if (!Number.isInteger(a) || a < 0 || a > 3) throw new GameError('Geçersiz cevap');
  // Çift Cevap bu soruda açıldıysa ikinci şık da gelir (aynı şık ya da eksikse tek cevap sayılır)
  const a2 = Number(body.a2);
  const cift = d.g.cift[pid] === qIndex(d.round) && Number.isInteger(a2) && a2 >= 0 && a2 <= 3 && a2 !== a;
  return { a, ...(cift ? { a2, cift: true } : {}), t: Math.max(0, now - d.roundStart) };
}

export function auto(d, pid, bot) {
  const ph = phaseOf(d);
  if (ph === 'vote') return bot ? { cat: CATS[Math.floor(Math.random() * CATS.length)].id } : {};
  if (ph === 'pick') { const o = otherCats(d.g); return pid === d.g.chooser ? { cat: o[Math.floor(Math.random() * o.length)].id } : {}; }
  if (!bot) return { a: -1, t: PLACE_MS };
  const q = d.g.qs[qIndex(d.round)];
  const right = Math.random() < 0.62;
  const wrong = [0, 1, 2, 3].filter((k) => k !== q.c);
  const a = right ? q.c : wrong[Math.floor(Math.random() * 3)];
  // botlar da ara sıra Çift Cevap kullanır
  if (d.g.jk[pid] && d.g.jk[pid].cift && Math.random() < 0.2) {
    const other = [0, 1, 2, 3].filter((k) => k !== a);
    return { a, a2: other[Math.floor(Math.random() * 3)], cift: true, t: 2500 + Math.random() * 9000 };
  }
  return { a, t: 2500 + Math.random() * 9000 };
}

export const points = (t) => Math.round(1000 - 500 * Math.min(1, t / PLACE_MS));

function pickQuestions(catId, n) {
  const cat = CATS.find((c) => c.id === catId) || CATS[CATS.length - 1];
  let pool = shuffle(cat.qs.map((q) => q));
  if (pool.length < n) pool = pool.concat(shuffle(CATS.flatMap((c) => c.qs)).slice(0, n - pool.length));
  return pool.slice(0, n).map(([q, ...opts]) => {
    const order = shuffle([0, 1, 2, 3]);
    return { q, o: order.map((k) => opts[k]), c: order.indexOf(0) };
  });
}

export function resolve(d, actions) {
  const g = d.g, ph = phaseOf(d);
  if (ph === 'vote') {
    const votes = {}, tally = {};
    for (const [id, a] of Object.entries(actions)) if (a && a.cat) { votes[id] = a.cat; tally[a.cat] = (tally[a.cat] || 0) + 1; }
    const max = Math.max(0, ...Object.values(tally));
    const top = max ? Object.keys(tally).filter((k) => tally[k] === max) : CATS.map((c) => c.id);
    g.cat = top[Math.floor(Math.random() * top.length)];
    g.qs = pickQuestions(g.cat, HALF);
    return { entry: { phase: 'vote', votes, tally, winner: g.cat }, dur: 4200 };
  }
  if (ph === 'pick') {
    const a = actions[g.chooser] && actions[g.chooser].cat ? actions[g.chooser] : auto(d, g.chooser, true);
    g.cat2 = a.cat;
    g.qs = g.qs.concat(pickQuestions(g.cat2, QUESTIONS - HALF));
    return { entry: { phase: 'pick', chooser: g.chooser, cat: g.cat2, first: g.cat }, dur: 3800 };
  }
  const qi = qIndex(d.round), q = g.qs[qi];
  const answers = {};
  const alive = Object.keys(g.alive).filter((id) => g.alive[id]);
  const isRight = (a) => !!a && (a.a === q.c || (a.cift && a.a2 === q.c));
  const nCorrect = alive.filter((id) => isRight(actions[id])).length;
  const mult = multFor(nCorrect, alive.length);
  for (const id of Object.keys(g.alive)) {
    const a = actions[id] || { a: -1, t: PLACE_MS };
    const ok = isRight(a);
    let pts = ok ? Math.round(points(a.t) * mult) : 0, bonus = null;
    if (a.cift) { bonus = 'cift'; if (g.jk[id]) g.jk[id].cift = false; if (ok) pts = Math.round(pts * CIFT_MULT); }
    else if (g.yari[id] === qi) bonus = 'yari';
    g.scores[id] += pts;
    answers[id] = { a: a.a, ...(a.cift ? { a2: a.a2 } : {}), pts, bonus };
  }
  // ilk konunun soruları bitti: o an sonuncu olan (berabereyse rastgele biri) yeni konuyu seçecek
  if (qi === HALF - 1) {
    const ids = Object.keys(g.alive).filter((id) => g.alive[id]);
    const low = Math.min(...ids.map((id) => g.scores[id]));
    const last = ids.filter((id) => g.scores[id] === low);
    g.chooser = last[Math.floor(Math.random() * last.length)];
  }
  return { entry: { phase: 'q', qi, c: q.c, answers, scores: { ...g.scores }, mult, nCorrect, nAlive: alive.length, chooser: qi === HALF - 1 ? g.chooser : undefined }, dur: REVEAL_MS };
}

// Jokerler: soru sırasında açılır. Yarı Yarıya iki yanlış şıkkı gizler; Çift Cevap ikinci şıkkı açar.
export function gact(d, pid, body) {
  const g = d.g;
  if (!body.yari && !body.cift) return false;
  const jk = g.jk[pid], which = body.yari ? 'yari' : 'cift';
  if (phaseOf(d) !== 'q' || !jk || !jk[which] || d.actions[pid]) throw new GameError('Joker kullanılamaz');
  const qi = qIndex(d.round), q = g.qs[qi];
  jk[which] = false;
  if (which === 'yari') {
    g.yari[pid] = qi;
    g.yariHide = g.yariHide || {};
    g.yariHide[pid] = shuffle([0, 1, 2, 3].filter((k) => k !== q.c)).slice(0, 2);
  } else g.cift[pid] = qi;
  return true;
}

export function ranking(d, participants) {
  if (d.round < LAST_ROUND || d.g.qs.length < QUESTIONS) return null;
  const s = d.g.scores;
  const ids = participants.slice().sort((a, b) => s[b] - s[a]);
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Şu anki sorunun doğru cevabı gizli kalır, sonraki sorular gönderilmez.
// Oylamada kimin neye oy verdiği herkese açıktır.
export function view(d, pid) {
  const g = d.g, ph = d.status === 'playing' ? phaseOf(d) : 'done';
  const cur = qIndex(d.round);
  const done = d.status !== 'playing';
  return {
    alive: g.alive, scores: g.scores, total: QUESTIONS, phase: ph, cat: g.cat, cat2: g.cat2 || null, chooser: g.chooser || null,
    qi: ph === 'q' ? cur : null,
    votes: ph === 'vote' ? Object.fromEntries(Object.entries(d.actions).filter(([, a]) => a && a.cat).map(([id, a]) => [id, a.cat])) : null,
    jokers: g.jk[pid] ? { ...g.jk[pid] } : { yari: false, cift: false },
    ciftNow: g.cift[pid] === cur,
    hide: g.yariHide && g.yari[pid] === cur ? g.yariHide[pid] : null,
    qs: ph === 'vote' ? [] : ph === 'pick' ? g.qs.slice(0, HALF) : g.qs.slice(0, cur + 1).map((q, i) => (i < cur || done ? q : { q: q.q, o: q.o })),
  };
}
