// 🖍️ Ne Çizdim? — gartic.io mantığı
// Sırayla herkes çizer; çizen 3 kelimeden birini seçer, diğerleri canlı izleyip alttan tahmin yazar.
// Önce bilen çok puan alır (10, 9, 8 … en az 3). Çizen ilk doğru tahminde 10, sonraki her doğru
// tahminde +1 alır; herkes bilirse +5 bonus. Süre ilerledikçe kelimenin harfleri ipucu olarak açılır.
// Çizim canlı olarak ayrı bir kayıtta tutulur (game-core: "live"); oda verisi şişmez.
import { GameError, shuffle } from './util.js';
import { WORDS } from './kelimeler.js';
import { DOODLES } from './doodles.js';

export const KIND = 'neciz';
export const TITLE = 'Ne Çizdim?';
export const EMOJI = '🖍️';
export const RULES = [
  'Sırayla herkes çizer, diğerleri alttan tahminini yazar.',
  'Önce bilen çok puan alır: 10, 9, 8…',
  'Çizen her doğru tahminde puan kazanır, herkes bilirse bonus!',
];
export const LIVE = true;
export const CHOOSE_MS = 12000, DRAW_MS = 75000, BOT_PICK_MS = 2000, REVEAL_MS = 5500, BOT_DRAW_MS = 26000;
export const PLACE_MS = CHOOSE_MS + DRAW_MS;
export const ALL_BONUS = 5;
const AWAY = 12000, MEM_MAX = 520;

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// "Yakın!" uyarısı: bir-iki harf hatası
export function closeTo(guess, word) {
  const a = norm(guess), b = norm(word);
  if (!a || a === b || b.length < 4) return false;
  return lev(a, b) <= (b.length >= 8 ? 2 : 1);
}
export const guessPoints = (k) => Math.max(3, 10 - k);
export const drawerPoints = (n, all) => (n ? 10 + (n - 1) : 0) + (all ? ALL_BONUS : 0);
const clean = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '');

export function init(ids, env) {
  const order = shuffle(ids);
  const N = order.length;
  const g = {
    alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [],
    order, T: N, // herkes bir kez çizer
    bots: env ? env.players.filter((p) => p.bot).map((p) => p.id) : [],
    scores: Object.fromEntries(ids.map((id) => [id, 0])), offered: [], feed: [], fn: 0, turn: null,
  };
  g.turn = makeTurn(g, 0, (env && env.mem) || {});
  return g;
}

function makeTurn(g, i, mem) {
  const drawer = g.order[i % g.order.length];
  const isBot = g.bots.includes(drawer);
  mem.used = mem.used || [];
  const used = new Set([...mem.used, ...g.offered]);
  let pool = (isBot ? DOODLES : WORDS).filter((w) => !used.has(w));
  if (pool.length < 6) { // hepsi çıktıysa hafızayı tazele
    mem.used = mem.used.filter((w) => !(isBot ? DOODLES : WORDS).includes(w));
    pool = (isBot ? DOODLES : WORDS).filter((w) => !g.offered.includes(w));
    if (pool.length < 3) pool = (isBot ? DOODLES : WORDS).slice();
  }
  const options = shuffle(pool).slice(0, 3);
  g.offered.push(...options);
  // ipucu sırası: harflerin rastgele açılma sırası
  const hints = options.map((w) => shuffle([...w].map((ch, k) => (ch === ' ' ? -1 : k)).filter((k) => k >= 0)));
  // botların tahmin zamanları (çizim başladıktan sonra, ms)
  const bot = {};
  for (const b of g.bots) {
    if (b === drawer) continue;
    const hit = Math.random() < 0.85 ? 9000 + Math.random() * 48000 : null;
    const wrong = [];
    const nW = Math.floor(Math.random() * 3);
    for (let k = 0; k < nW; k++) wrong.push([Math.round(3000 + Math.random() * ((hit || 60000) - 3500)), WORDS[Math.floor(Math.random() * WORDS.length)]]);
    bot[b] = { hit: hit && Math.round(hit), wrong: wrong.sort((a, c) => a[0] - c[0]) };
  }
  return { i, drawer, options, pick: null, pickAt: null, botPick: Math.floor(Math.random() * options.length), seed: Math.floor(Math.random() * 1e9), hints, bot, hits: {}, lastG: {} };
}

const isBotDrawer = (g) => g.bots.includes(g.turn.drawer);
// Seçilen kelime ve çizimin başladığı an (seçilmediyse süre dolunca ilk kelime)
export function pickInfo(d, now) {
  const t = d.g.turn;
  if (t.pick !== null) return { idx: t.pick, at: t.pickAt };
  if (isBotDrawer(d.g)) return now >= d.roundStart + BOT_PICK_MS ? { idx: t.botPick, at: d.roundStart + BOT_PICK_MS } : null;
  return now >= d.roundStart + CHOOSE_MS ? { idx: 0, at: d.roundStart + CHOOSE_MS } : null;
}
export const placeMs = (d) => (isBotDrawer(d.g) ? BOT_PICK_MS : CHOOSE_MS) + DRAW_MS;

const playerOf = (d, id) => (d.players || []).find((p) => p.id === id);
// Tahmin etmesi beklenenler: çizen hariç, oyundan çıkmamış ve telefonu açık olanlar
function guessers(d, now) {
  return Object.keys(d.g.alive).filter((id) => {
    if (id === d.g.turn.drawer || !d.g.alive[id]) return false;
    const p = playerOf(d, id);
    if (!p) return true;
    return !p.left && (p.bot || now - (p.seen || 0) <= AWAY);
  });
}
// Doğru bilenler (zamana göre sıralı): insanlar kayıtlı, botlar zamanı gelince
export function hitsAt(d, now) {
  const t = d.g.turn, pi = pickInfo(d, now);
  if (!pi) return [];
  const out = Object.entries(t.hits).map(([p, ms]) => ({ p, t: ms }));
  for (const [b, s] of Object.entries(t.bot)) if (s.hit !== null && d.g.alive[b] && pi.at + s.hit <= now && s.hit < DRAW_MS) out.push({ p: b, t: s.hit });
  return out.sort((a, b) => a.t - b.t);
}

export function canDraw(d, pid, now) {
  const pi = pickInfo(d, now);
  return d.g.turn.drawer === pid && !!pi && now < pi.at + DRAW_MS + 2000;
}

export function isDue(d, now) {
  if (now < d.roundStart) return false;
  const dr = playerOf(d, d.g.turn.drawer);
  if (!d.g.alive[d.g.turn.drawer] || (dr && dr.left)) return true;
  const pi = pickInfo(d, now);
  if (!pi) return false;
  if (now >= pi.at + DRAW_MS) return true;
  const need = guessers(d, now);
  const hit = new Set(hitsAt(d, now).map((h) => h.p));
  return need.length > 0 && need.every((id) => hit.has(id));
}

export const normalize = () => { throw new GameError('Tahminini alttaki kutuya yaz'); };
export const auto = () => ({});

export function gact(d, pid, body, now) {
  const g = d.g, t = g.turn;
  if (now < d.roundStart) throw new GameError('Birazdan başlıyor');
  if (body.pick !== undefined) {
    const i = Number(body.pick);
    if (pid !== t.drawer) throw new GameError('Sıra sende değil');
    if (t.pick !== null || pickInfo(d, now)) return false;
    if (!Number.isInteger(i) || i < 0 || i >= t.options.length) throw new GameError('Geçersiz kelime');
    t.pick = i; t.pickAt = now;
    d.deadline = now + DRAW_MS;
    return true;
  }
  if (body.guess !== undefined) {
    const pi = pickInfo(d, now);
    if (!pi || now >= pi.at + DRAW_MS) throw new GameError('Şu an tahmin edilemez');
    if (pid === t.drawer) throw new GameError('Çizen tahmin edemez 🙂');
    if (!g.alive[pid]) throw new GameError('Bu oyunda değilsin');
    if (pid in t.hits) throw new GameError('Zaten bildin!');
    if (t.lastG[pid] && now - t.lastG[pid] < 500) throw new GameError('Biraz yavaş 🙂');
    const txt = clean(body.guess);
    if (!txt) return false;
    t.lastG[pid] = now;
    const word = t.options[pi.idx];
    const ok = norm(txt) === norm(word);
    if (ok) t.hits[pid] = now - pi.at;
    g.fn += 1;
    g.feed.push(ok ? { n: g.fn, p: pid, ok: true, t: now } : { n: g.fn, p: pid, txt, close: closeTo(txt, word), t: now });
    if (g.feed.length > 40) g.feed.shift();
    return true;
  }
  return false;
}

export function resolve(d, actions, now = Date.now()) {
  const g = d.g, t = g.turn;
  const pi = pickInfo(d, now) || { idx: 0, at: now };
  const word = t.options[pi.idx];
  const hits = hitsAt(d, now).filter((h) => h.t < DRAW_MS);
  const need = guessers(d, now);
  const hitSet = new Set(hits.map((h) => h.p));
  const all = need.length > 0 && need.every((id) => hitSet.has(id));
  const gains = {};
  hits.forEach((h, k) => { gains[h.p] = guessPoints(k); });
  gains[t.drawer] = drawerPoints(hits.length, all);
  for (const [id, p] of Object.entries(gains)) if (id in g.scores) g.scores[id] += p;
  const mem = ((d.mem = d.mem || {}).neciz = d.mem.neciz || {});
  mem.used = (mem.used || []).concat(word).slice(-MEM_MAX);
  const entry = {
    word, drawer: t.drawer, gains, all, order: hits.map((h, k) => ({ p: h.p, t: h.t, pts: guessPoints(k) })),
    doodle: isBotDrawer(g) ? { doodle: word, seed: t.seed, at: pi.at } : null, scores: { ...g.scores }, turnI: t.i,
  };
  if (d.round < g.T) { g.turn = makeTurn(g, d.round, mem); g.feed = []; }
  return { entry, dur: REVEAL_MS };
}

export function ranking(d, participants) {
  if (d.round < d.g.T) return null;
  const s = d.g.scores;
  const ids = participants.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && s[last[0]] === s[id]) last.push(id); else groups.push([id]); }
  return groups;
}

// Kelimenin maskesi: harfler "_", boşluklar korunur; süre ilerledikçe birkaç harf açılır
export function maskOf(word, order, el) {
  const letters = order.length;
  const n = Math.min(Math.floor(letters / 3), el > DRAW_MS * 0.75 ? 2 : el > DRAW_MS * 0.5 ? 1 : 0);
  const open = new Set(order.slice(0, n));
  return [...word].map((ch, k) => (ch === ' ' ? ' ' : open.has(k) ? ch : '_')).join('');
}

export function view(d, pid, now) {
  const g = d.g, t = g.turn;
  const pi = d.status === 'playing' ? pickInfo(d, now) : null;
  const isDrawer = pid === t.drawer;
  const word = pi ? t.options[pi.idx] : null;
  const hits = d.status === 'playing' ? hitsAt(d, now) : [];
  const iHit = hits.some((h) => h.p === pid);
  // tahmin akışı: insan tahminleri + zamanı gelen bot tahminleri
  let feed = g.feed.filter((f) => !f.close || f.p === pid || isDrawer).map((f) => ({ ...f, txt: f.close && f.p !== pid && !isDrawer ? undefined : f.txt }));
  if (pi) for (const [b, s] of Object.entries(t.bot)) {
    for (const [ms, txt] of s.wrong) if (pi.at + ms <= now) feed.push({ n: `b${b}${ms}`, p: b, txt, t: pi.at + ms });
    if (s.hit !== null && pi.at + s.hit <= now && s.hit < DRAW_MS) feed.push({ n: `b${b}h`, p: b, ok: true, t: pi.at + s.hit });
  }
  feed = feed.sort((a, b) => a.t - b.t).slice(-24);
  const bot = isBotDrawer(g);
  return {
    alive: g.alive, order: g.order, T: g.T, turnI: t.i, drawer: t.drawer, botDrawer: bot,
    phase: pi ? 'draw' : 'choose',
    options: isDrawer && !pi ? t.options : null,
    chooseEnd: d.roundStart + (bot ? BOT_PICK_MS : CHOOSE_MS),
    drawStart: pi ? pi.at : null, drawEnd: pi ? pi.at + DRAW_MS : null,
    word: isDrawer || iHit ? word : null,
    mask: word && !isDrawer && !iHit ? maskOf(word, t.hints[pi.idx], now - pi.at) : null,
    doodle: bot && pi ? { doodle: word, seed: t.seed, at: pi.at } : null,
    hits: hits.map((h) => h.p), scores: g.scores, feed, myHit: iHit,
  };
}
