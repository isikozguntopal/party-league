// Oyun Partisi — oda, turnuva ve oyun akışı (sunucu + tarayıcı ortak).
// Netlify Function'da çok oyunculu, tarayıcıda çevrimdışı bot modu için aynı kod çalışır.
//
// İki tür oyun var:
//  • Tur tabanlı (Lazer, Kulaktan Kulağa, Bil Bakalım): herkes gizlice hamlesini seçer → herkes hazır
//    (ya da süre dolar) → sunucu çözer → istemciler oynatır.
//  • Gerçek zamanlı (Bomba, Yarış): oyunu oda sahibinin cihazı yönetir, telefonlar WebRTC ile doğrudan
//    bağlanır. Sunucu yalnızca bağlantı kurulumunu (sig), ara sıralamayı ve sonucu tutar.
// Her oyun sonunda sıralamaya göre puan verilir; turnuva bitince podyum.
import { GameError, uid } from './games/util.js';
import { cleanLook, randomLook } from './games/avatar.js';
import * as lazer from './games/lazer.js';
import * as bomba from './games/bomba.js';
import * as cizim from './games/cizim.js';
import * as bilgi from './games/bilgi.js';
import * as yaris from './games/yaris.js';
import * as keski from './games/keski.js';
import * as bombaci from './games/bombaci.js';
import * as kor from './games/korkosu.js';
import * as halat from './games/halat.js';
import * as neciz from './games/neciz.js';
import * as kayik from './games/kayik.js';

export { GameError, uid };
export const GAMES = { lazer, bomba, cizim, neciz, bilgi, keski, bombaci, kor, halat, kayik, yaris };
export const TOUR = ['lazer', 'bomba', 'cizim', 'neciz', 'bilgi', 'keski', 'bombaci', 'kor', 'halat', 'kayik', 'yaris'];
export const TEAM_GAMES = ['bombaci', 'kor', 'halat', 'kayik'];
export const MODES = ['tour', ...TOUR];
export const POINTS = [3, 2, 1];                 // 1., 2., 3. olana verilen puan
export const GAME_INTRO_MS = 3000;               // her oyunun başındaki tanıtım kartı
export const TEAM_GATE_MS = 40000;               // takım oyunlarında "takımlar" ekranında en fazla bekleme (herkes Tamam derse erken biter)
export const INTER_MS = 9000;                    // oyunlar arası skor ekranı
export const AWAY_MS = 12000;                    // bu kadar süredir sinyal yoksa oyuncu beklenmez
const SEEN_EVERY = 4000;                         // "buradayım" bilgisinin en sık yazılma aralığı
const RT_MAX_MS = 6 * 60 * 1000;                 // gerçek zamanlı oyunun en uzun süresi
const RT_HOST_LOST_MS = 15000;                   // oyunu yöneten cihaz bu kadar sessizse oyun kapanır
export const MAX_PLAYERS = 10;
const ART_MAX = 140000;                          // bir çizimin en büyük boyutu (JSON karakter)

export const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#eab308', '#64748b'];
const BOT_NAMES = ['Robo', 'Tetik', 'Kaktüs', 'Şimşek', 'Mermi', 'Pırpır', 'Laz0r', 'Bulut', 'Pofuduk', 'Zıpzıp'];

// Hazır mesajlar (oyuncular birbirine gönderir)
export const QUICK = [
  '😂', '😎', '🤡', '💀', '🫵', '😈', '🥱', '🔥',
  '👋 Uçuruma hoş geldin', '🫵 Sıra sende', '😂 Nişan almayı bilmiyorsun', '🥱 Bu kadar mı?',
  '👀 Seni görüyorum', '🙄 Şans eseri vurdun', '😭 Ağla bakalım', '⏳ Hadi hazır ol artık',
  '😎 GG ez', '🤭 Bir dahakine', '😇 Çok pardon', '🎱 Bilardo ustası',
];

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const KEY = (code) => `room-${code}`;
const ART_KEY = (code, seq, round, pid) => `room-${code}-art-${seq}-${round}-${pid}`;
const LIVE_KEY = (code, seq, round) => `room-${code}-live-${seq}-${round}`;
// Gerçek zamanlı oyun için sunucu üzerinden yedek aktarım (WebRTC kurulamazsa)
const RT_KEY = (code, seq) => `room-${code}-rt-${seq}`;
const RTIN_KEY = (code, seq, pid) => `room-${code}-rtin-${seq}-${pid}`;
const cleanCode = (c) => (typeof c === 'string' && /^[A-Z]{4}$/.test(c.trim().toUpperCase())) ? c.trim().toUpperCase() : null;
const cleanId = (s) => (typeof s === 'string' && /^[a-z0-9-]{4,40}$/.test(s)) ? s : null;
const cleanName = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) : '') || 'Oyuncu';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bellekte çalışan, Netlify Blobs ile aynı arayüze sahip depo (yerel sunucu ve çevrimdışı mod için).
export class MemoryStore {
  constructor() { this.map = new Map(); this.n = 0; }
  async getWithMetadata(key) {
    const e = this.map.get(key);
    return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: {} } : null;
  }
  async setJSON(key, value, opts = {}) {
    const e = this.map.get(key);
    if (opts.onlyIfNew && e) return { modified: false };
    if (opts.onlyIfMatch && (!e || e.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `"${++this.n}"`;
    this.map.set(key, { v: JSON.stringify(value), etag });
    return { modified: true, etag };
  }
}

async function load(store, code) {
  const r = await store.getWithMetadata(KEY(code), { type: 'json', consistency: 'strong' });
  if (!r || !r.data) throw new GameError('Oda bulunamadı', 404);
  return r.data;
}

// İyimser kilit: oku → değiştir → etag eşleşirse yaz, değilse tekrar dene.
async function mutate(store, code, fn) {
  for (let i = 0; i < 8; i++) {
    const r = await store.getWithMetadata(KEY(code), { type: 'json', consistency: 'strong' });
    if (!r || !r.data) throw new GameError('Oda bulunamadı', 404);
    const d = r.data;
    if (fn(d) === false) return d;
    d.rev = (d.rev || 0) + 1;
    const res = await store.setJSON(KEY(code), d, { onlyIfMatch: r.etag });
    if (!res || res.modified !== false) return d;
    await sleep(25 + Math.random() * 90);
  }
  throw new GameError('Sunucu meşgul, tekrar dene', 409);
}

const nextColor = (d) => COLORS.find((c) => !d.players.some((p) => p.color === c && !p.left)) || COLORS[d.players.length % COLORS.length];
const isAway = (p, now) => !p.bot && now - (p.seen || 0) > AWAY_MS;
const playerOf = (d, id) => d.players.find((p) => p.id === id);
// Beklenmesi gereken oyuncu mu? (bot, çıkmış ve uzaktaki oyuncular beklenmez)
const waitable = (d, now) => (id) => { const p = playerOf(d, id); return !!p && !p.bot && !p.left && !isAway(p, now); };
const activePlayers = (d) => d.players.filter((p) => !p.left);
const participants = (d) => Object.keys(d.g.alive);
const placeMs = (d) => { const m = GAMES[d.kind]; return m.placeMs ? m.placeMs(d) : m.PLACE_MS; };
function requireHost(d, pid) { if (d.hostId !== pid) throw new GameError('Bunu sadece oda sahibi yapabilir', 403); }

// Botlar ve uzaktaki (telefonu kilitli / uygulamadan çıkmış) oyuncular beklenmez, otomatik oynatılır.
function humansReady(d, now) {
  return participants(d).every((id) => {
    if (!d.g.alive[id] || d.actions[id]) return true;
    const p = playerOf(d, id);
    return !p || p.bot || p.left || isAway(p, now);
  });
}

function startMatch(x, now) {
  x.players = activePlayers(x).filter((p) => !p.temp);
  const list = x.mode === 'tour' ? TOUR.filter((k) => (x.tourGames || TOUR).includes(k)) : [x.mode];
  x.tour = { list: list.length ? list : TOUR, idx: 0, scores: Object.fromEntries(x.players.map((p) => [p.id, 0])), results: [] };
  startGame(x, now);
}

// Takım oyunlarında sayı tutmazsa eklenen geçici bot (oyun bitince silinir, puan almaz)
function addTempBot(x) {
  const n = x.players.filter((p) => p.temp).length + 1;
  const p = { id: 'tmp-' + uid(6), name: `Yedek ${n}`, color: nextColor(x), bot: true, temp: true, look: randomLook() };
  x.players.push(p);
  return p;
}

function startGame(x, now) {
  x.players = x.players.filter((p) => !p.temp);
  for (const p of activePlayers(x)) if (!p.temp && !(p.id in x.tour.scores)) x.tour.scores[p.id] = 0;
  x.kind = x.tour.list[x.tour.idx];
  const mod = GAMES[x.kind];
  x.seq = (x.seq || 0) + 1;
  x.round = 1;
  x.actions = {};
  x.history = [];
  x.sig = [];
  // Takım oyunları oyuncuları kendisi böler; gerekirse geçici bot ister
  const env = { players: activePlayers(x).map((p) => ({ id: p.id, bot: !!p.bot })), addBot: () => { const b = addTempBot(x); const e = { id: b.id, bot: true }; env.players.push(e); return e; } };
  // oyunlar arası (aynı odada) kalıcı küçük hafıza: ör. çıkmış kelimeler tekrar gelmesin
  x.mem = x.mem || {};
  env.mem = x.mem[x.kind] = x.mem[x.kind] || {};
  x.g = mod.init(activePlayers(x).map((p) => p.id), env);
  if (mod.realtime) Object.assign(x.g, { simHost: x.hostId, rtStart: now, provAt: now, prov: null });
  x.status = 'playing';
  x.roundStart = now + GAME_INTRO_MS;
  x.deadline = x.roundStart + placeMs(x);
  // Takım oyunları: önce kimin hangi takımda olduğu gösterilir; herkes "Tamam" deyince (ya da süre dolunca) başlar
  x.gate = TEAM_GAMES.includes(x.kind) ? { ready: [], until: now + TEAM_GATE_MS } : null;
  if (x.gate) { x.roundStart = now + TEAM_GATE_MS + GAME_INTRO_MS; x.deadline = x.roundStart + placeMs(x); }
}

// "Tamam" demesi beklenen oyuncular: bot, çıkmış ve uzaktaki (telefonu kilitli) oyuncular beklenmez
function gatePending(x, now) {
  return Object.keys(x.g.alive).filter((id) => {
    const p = playerOf(x, id);
    return p && !p.bot && !p.left && !isAway(p, now) && !x.gate.ready.includes(id);
  });
}
function openGate(x, now) {
  x.gate = null;
  x.roundStart = now + 1500;
  x.deadline = x.roundStart + placeMs(x);
  if (GAMES[x.kind].realtime) { x.g.rtStart = now; x.g.provAt = now; }
}

function resolveRound(x, now) {
  const mod = GAMES[x.kind];
  const actions = {}, auto = [];
  for (const id of participants(x)) {
    if (!x.g.alive[id]) continue;
    const p = playerOf(x, id);
    if (x.actions[id]) actions[id] = x.actions[id];
    else { actions[id] = mod.auto(x, id, !!(p && p.bot)); if (p && !p.bot) auto.push(id); }
  }
  const { entry, dur } = mod.resolve(x, actions, now);
  Object.assign(entry, { kind: x.kind, seq: x.seq, round: x.round, resolvedAt: now, dur, auto });
  x.history.push(entry);
  if (x.history.length > 4) x.history.shift();
  const rank = mod.ranking(x, participants(x));
  if (rank) endGame(x, rank, now + dur);
  else {
    x.round += 1;
    x.actions = {};
    x.roundStart = now + dur;
    x.deadline = x.roundStart + placeMs(x);
  }
}

// Sıralamayı doğrula: her katılımcı tam bir kez; eksikler en sona
function cleanRanking(x, rank) {
  const parts = participants(x), seen = new Set(), out = [];
  for (const grp of Array.isArray(rank) ? rank : []) {
    const g = (Array.isArray(grp) ? grp : [grp]).filter((id) => parts.includes(id) && !seen.has(id));
    g.forEach((id) => seen.add(id));
    if (g.length) out.push(g);
  }
  const rest = parts.filter((id) => !seen.has(id));
  if (rest.length) out.push(rest);
  return out;
}

// Oyun bitti: sıralamaya göre puan dağıt; turnuva sürüyorsa skor ekranı, bittiyse podyum
function endGame(x, rank, at) {
  // geçici botlar sıralamadan ve oyuncu listesinden çıkar
  const temp = new Set(x.players.filter((p) => p.temp).map((p) => p.id));
  rank = rank.map((grp) => grp.filter((id) => !temp.has(id))).filter((grp) => grp.length);
  x.players = x.players.filter((p) => !p.temp);
  const gained = {};
  let pos = 0;
  for (const grp of rank) {
    for (const id of grp) gained[id] = POINTS[pos] || 0;
    pos += grp.length;
  }
  for (const [id, pts] of Object.entries(gained)) x.tour.scores[id] = (x.tour.scores[id] || 0) + pts;
  x.tour.results.push({ kind: x.kind, ranking: rank, gained });
  x.actions = {};
  x.sig = [];
  if (x.tour.idx < x.tour.list.length - 1) {
    x.status = 'inter';
    x.interAt = at;
    x.interUntil = at + INTER_MS;
  } else {
    x.status = 'over';
    x.endsAt = at;
  }
}

// Gerçek zamanlı oyunu yöneten cihaz kaybolduysa ya da süre aştıysa son bilinen sıralamayla bitir
function rtLost(x, now) {
  const host = playerOf(x, x.g.simHost);
  return !host || host.left || isAway(host, now) || now - x.g.rtStart > RT_MAX_MS;
}

function tickDue(x, now) {
  if (x.status === 'inter') return now >= x.interUntil;
  if (x.status !== 'playing') return false;
  if (x.gate) return now >= x.gate.until || gatePending(x, now).length === 0;
  const mod = GAMES[x.kind];
  if (mod.realtime) return now > x.roundStart + 3000 && rtLost(x, now);
  if (now < x.roundStart) return false;
  const custom = mod.isDue ? mod.isDue(x, now, waitable(x, now)) : null;
  if (custom !== null && custom !== undefined) return custom;
  return humansReady(x, now) || now > x.deadline + 1000;
}
function tick(x, now) {
  if (x.status === 'playing' && x.gate) { openGate(x, now); return; }
  if (x.status === 'inter') { x.tour.idx += 1; startGame(x, now); return; }
  if (GAMES[x.kind].realtime) { endGame(x, cleanRanking(x, x.g.prov), now); return; }
  resolveRound(x, now);
}

function transferHost(d) {
  if (d.players.some((p) => p.id === d.hostId && !p.left)) return;
  const h = d.players.find((p) => !p.bot && !p.left);
  d.hostId = h ? h.id : null;
}

function view(d, pid, now) {
  const me = d.players.find((p) => p.id === pid && !p.left);
  const inGame = !!d.g && d.status !== 'lobby';
  const mod = inGame ? GAMES[d.kind] : null;
  return {
    code: d.code,
    rev: d.rev || 0,
    hostId: d.hostId,
    status: d.status,
    mode: d.mode,
    tourGames: d.tourGames || TOUR,
    seq: d.seq || 0,
    kind: inGame ? d.kind : null,
    players: d.players.filter((p) => !p.left || d.status !== 'lobby').map((p) => ({
      id: p.id, name: p.name, color: p.color, bot: p.bot, temp: !!p.temp, look: p.look, left: !!p.left, away: isAway(p, now),
      alive: !!(inGame && d.g.alive[p.id]), inGame: !!(inGame && p.id in d.g.alive),
    })),
    round: d.round,
    gate: d.status === 'playing' && d.gate ? { until: d.gate.until, ready: d.gate.ready, waiting: gatePending(d, now) } : null,
    roundStart: d.roundStart,
    deadline: d.deadline,
    ready: d.status === 'playing' ? participants(d).filter((id) => d.g.alive[id] && (playerOf(d, id)?.bot || d.actions[id])) : [],
    myAction: d.status === 'playing' ? (d.actions[pid] || null) : null, // başkalarının hamlesi gizli
    g: inGame ? mod.view(d, pid, now) : null,
    last: inGame && d.history.length ? d.history[d.history.length - 1] : null,
    tour: d.tour || null,
    interAt: d.interAt || 0,
    interUntil: d.interUntil || 0,
    endsAt: d.endsAt || 0,
    chat: (d.chat || []).filter((c) => now - c.t < 10000),
    sig: (d.sig || []).filter((m) => m.to === pid),
    isMember: !!me,
  };
}

// Çizimi doğrula: [{c,w,p:[x,y,...]}], koordinatlar 0..1000
function cleanArt(strokes) {
  if (!Array.isArray(strokes) || strokes.length > 600) throw new GameError('Çizim geçersiz');
  let n = 0;
  const out = strokes.map((s) => {
    const c = Number(s.c), w = Number(s.w), p = Array.isArray(s.p) ? s.p : [];
    if (!(c >= 0 && c < 12 && w >= 0 && w < 4) || p.length % 2) throw new GameError('Çizim geçersiz');
    n += p.length;
    const out = { c: c | 0, w: w | 0, p: p.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)))) };
    if (s.f) out.f = 1; // kapalı şekil: içi dolu çizilir (kova/dolu kare/dolu daire)
    // çizginin çizildiği zaman aralığı (albümde hızlandırılmış tekrar için)
    if (Array.isArray(s.t) && s.t.length === 2) {
      const t0 = Math.max(0, Math.min(300000, Math.round(Number(s.t[0]) || 0)));
      out.t = [t0, Math.max(t0, Math.min(300000, Math.round(Number(s.t[1]) || 0)))];
    }
    return out;
  });
  if (n > 24000) throw new GameError('Çizim çok büyük');
  return out;
}

export async function handle(store, body, now = Date.now()) {
  body = body || {};
  const pid = cleanId(body.playerId);
  if (!pid) throw new GameError('Oyuncu kimliği geçersiz');
  const action = body.action;
  let extra = null;

  if (action === 'create') {
    for (let i = 0; i < 10; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
      const doc = {
        code, rev: 1, createdAt: now, hostId: pid, status: 'lobby', mode: 'tour', tourGames: TOUR, seq: 0,
        players: [{ id: pid, name: cleanName(body.name), color: COLORS[0], bot: false, seen: now, look: cleanLook(body.look) }],
        round: 0, roundStart: 0, deadline: 0, actions: {}, history: [], g: null, tour: null,
      };
      const res = await store.setJSON(KEY(code), doc, { onlyIfNew: true });
      if (!res || res.modified !== false) return { state: view(doc, pid, now), now };
    }
    throw new GameError('Oda oluşturulamadı, tekrar dene', 500);
  }

  const code = cleanCode(body.code);
  if (!code) throw new GameError('Oda kodu 4 harf olmalı');
  let d;

  switch (action) {
    case 'state': {
      // Her yoklama aynı zamanda "buradayım" sinyali; yazma maliyeti için en fazla 4 sn'de bir kaydedilir.
      const stale = (x) => { const m = x.players.find((p) => p.id === pid && !p.bot && !p.left); return m && now - (m.seen || 0) > SEEN_EVERY ? m : null; };
      d = await load(store, code);
      if (stale(d) || tickDue(d, now)) {
        d = await mutate(store, code, (x) => {
          const m = stale(x);
          if (m) m.seen = now;
          const due = tickDue(x, now);
          if (due) tick(x, now);
          if (!m && !due) return false;
        });
      }
      // Canlı çizim (Ne Çizdim?): istemcinin elindeki kısımdan sonrası
      if (body.live && d.status === 'playing' && GAMES[d.kind].LIVE) {
        const r = await store.getWithMetadata(LIVE_KEY(code, d.seq, d.round), { type: 'json', consistency: 'strong' });
        const art = (r && r.data) || { gen: 0, s: [] };
        const since = body.live.gen === art.gen ? Math.max(0, Math.min(Number(body.live.since) | 0, art.s.length)) : 0;
        extra = { live: { seq: d.seq, round: d.round, gen: art.gen, from: since, s: art.s.slice(since) } };
      }
      // Yedek aktarım: izleyen son anlık görüntüyü, oda sahibi ise aktarılan oyuncuların kumandalarını ister
      if (body.rt && d.status === 'playing' && GAMES[d.kind].realtime) {
        const out = {};
        if (body.rt.snap) { const r = await store.getWithMetadata(RT_KEY(code, d.seq), { type: 'json', consistency: 'strong' }); out.snap = r && r.data && r.data.n !== body.rt.have ? r.data : null; }
        if (Array.isArray(body.rt.inputs) && d.g.simHost === pid) {
          out.inputs = {};
          for (const id of body.rt.inputs.slice(0, 12)) { const cid = cleanId(id); if (!cid) continue; const r = await store.getWithMetadata(RTIN_KEY(code, d.seq, cid), { type: 'json', consistency: 'strong' }); if (r && r.data) out.inputs[cid] = r.data; }
        }
        extra = { ...(extra || {}), rt: out };
      }
      break;
    }

    case 'rtSnap': {
      // Oda sahibi anlık görüntüyü sunucuya bırakır (yalnızca doğrudan bağlanamayan oyuncular için)
      const d0 = await load(store, code);
      if (d0.status !== 'playing' || body.seq !== d0.seq || !GAMES[d0.kind].realtime || d0.g.simHost !== pid) throw new GameError('Oyun aktif değil');
      if (!body.snap || JSON.stringify(body.snap).length > 60000) throw new GameError('Görüntü çok büyük');
      await store.setJSON(RT_KEY(code, d0.seq), { n: Number(body.n) || 0, t: now, snap: body.snap });
      return { ok: true, now };
    }

    case 'rtInput': {
      // Doğrudan bağlanamayan oyuncu kumandasını sunucuya bırakır
      const d0 = await load(store, code);
      if (d0.status !== 'playing' || body.seq !== d0.seq || !GAMES[d0.kind].realtime) throw new GameError('Oyun aktif değil');
      if (!body.i || JSON.stringify(body.i).length > 2000) throw new GameError('Geçersiz kumanda');
      await store.setJSON(RTIN_KEY(code, d0.seq, pid), { t: now, i: body.i });
      return { ok: true, now };
    }

    case 'live': {
      // Çizen oyuncu çizimini parça parça gönderir: "from" sırasından itibaren çizgiler değişir
      const d0 = await load(store, code);
      const mod = GAMES[d0.kind];
      if (d0.status !== 'playing' || !mod || !mod.LIVE || body.seq !== d0.seq || body.round !== d0.round) throw new GameError('Bu tur bitti');
      if (!mod.canDraw(d0, pid, now)) throw new GameError('Şu an çizen sen değilsin');
      const key = LIVE_KEY(code, d0.seq, d0.round);
      const r = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      const cur = (r && r.data) || { gen: 0, s: [] };
      const from = Math.max(0, Math.min(Number(body.from) | 0, cur.s.length));
      const s = cur.s.slice(0, from).concat(cleanArt(Array.isArray(body.strokes) ? body.strokes : []));
      if (s.length > 800 || JSON.stringify(s).length > ART_MAX) throw new GameError('Çizim çok büyük');
      // önceki çizgiler değiştiyse (geri al / temizle) nesil artar → izleyenler baştan alır
      const gen = from < cur.s.length - 1 ? cur.gen + 1 : cur.gen;
      await store.setJSON(key, { gen, s });
      return { n: s.length, gen, now };
    }

    case 'art': {
      // Kulaktan Kulağa: kayıtlı bir çizimi getir
      const key = String(body.key || '');
      if (!key.startsWith(`room-${code}-art-`)) throw new GameError('Çizim bulunamadı', 404);
      const r = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      return { art: r ? r.data : null, now };
    }

    case 'join':
      // Oyun sürerken katılan izler, bir sonraki oyunda oynar
      d = await mutate(store, code, (x) => {
        const name = cleanName(body.name);
        const look = cleanLook(body.look);
        const ex = x.players.find((p) => p.id === pid);
        if (ex && !ex.left) { ex.name = name; ex.look = look; ex.seen = now; return; }
        if (activePlayers(x).length >= MAX_PLAYERS) throw new GameError('Oda dolu');
        if (ex) Object.assign(ex, { left: false, name, look, seen: now });
        else x.players.push({ id: pid, name, color: nextColor(x), bot: false, seen: now, look });
        transferHost(x);
      });
      break;

    case 'look':
      d = await mutate(store, code, (x) => {
        const me = x.players.find((p) => p.id === pid && !p.left);
        if (!me) throw new GameError('Bu odada değilsin');
        me.look = cleanLook(body.look);
        if (body.name) me.name = cleanName(body.name);
      });
      break;

    case 'mode':
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'lobby') throw new GameError('Oyun başladı');
        if (!MODES.includes(body.mode)) throw new GameError('Geçersiz oyun');
        if (x.mode === body.mode) return false;
        x.mode = body.mode;
      });
      break;

    case 'tourGames':
      // Turnuvada hangi oyunlar oynansın (en az bir oyun)
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'lobby') throw new GameError('Oyun başladı');
        const list = TOUR.filter((k) => Array.isArray(body.games) && body.games.includes(k));
        if (!list.length) throw new GameError('En az bir oyun seç');
        x.tourGames = list;
      });
      break;

    case 'addBot':
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'lobby') throw new GameError('Oyun başladı');
        if (activePlayers(x).length >= MAX_PLAYERS) throw new GameError('Oda dolu');
        const name = BOT_NAMES.find((n) => !x.players.some((p) => p.name === n)) || `Bot${x.players.length}`;
        x.players.push({ id: 'bot-' + uid(6), name, color: nextColor(x), bot: true, look: randomLook() });
      });
      break;

    case 'removeBot':
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'lobby') throw new GameError('Oyun başladı');
        const before = x.players.length;
        x.players = x.players.filter((p) => !(p.bot && p.id === body.botId));
        if (x.players.length === before) return false;
      });
      break;

    case 'start':
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'lobby') return false;
        if (activePlayers(x).length < 2) throw new GameError('En az 2 oyuncu gerekli (bot ekleyebilirsin)');
        startMatch(x, now);
      });
      break;

    case 'say':
      d = await mutate(store, code, (x) => {
        const me = x.players.find((p) => p.id === pid && !p.left);
        if (!me) throw new GameError('Bu odada değilsin');
        const k = Number(body.k);
        if (!Number.isInteger(k) || k < 0 || k >= QUICK.length) throw new GameError('Geçersiz mesaj');
        x.chat = (x.chat || []).filter((c) => now - c.t < 15000);
        const mine = x.chat.filter((c) => c.p === pid).pop();
        if (mine && now - mine.t < 1200) throw new GameError('Biraz yavaş 🙂');
        x.chatN = (x.chatN || 0) + 1;
        x.chat.push({ n: x.chatN, p: pid, k, t: now });
        if (x.chat.length > 30) x.chat.shift();
        me.seen = now;
      });
      break;

    case 'act': {
      // Oyuncunun bu turki gizli hamlesi. Çizimler ayrı bir kayda yazılır, odada yalnızca anahtarı tutulur.
      if (Array.isArray(body.strokes)) {
        const d0 = await load(store, code);
        if (d0.status !== 'playing' || body.seq !== d0.seq || body.round !== d0.round || !GAMES[d0.kind].ART) throw new GameError('Bu tur bitti');
        const strokes = cleanArt(body.strokes);
        if (JSON.stringify(strokes).length > ART_MAX) throw new GameError('Çizim çok büyük');
        const key = ART_KEY(code, d0.seq, d0.round, pid);
        await store.setJSON(key, strokes);
        body = { ...body, strokes: undefined, artKey: key, artDur: strokes.reduce((m, s) => Math.max(m, s.t ? s.t[1] : 0), 0) };
      }
      d = await mutate(store, code, (x) => {
        if (x.status !== 'playing') throw new GameError('Oyun aktif değil');
        const me = x.players.find((p) => p.id === pid);
        if (!me || !x.g.alive[pid]) throw new GameError('Bu oyunda elendin, izliyorsun');
        if (body.round !== x.round || body.seq !== x.seq) throw new GameError('Bu tur bitti');
        if (now > x.deadline + 2500) throw new GameError('Süre doldu');
        x.actions[pid] = GAMES[x.kind].normalize(x, pid, body, now);
        me.seen = now;
        if (now >= x.roundStart && !GAMES[x.kind].isDue && humansReady(x, now)) resolveRound(x, now); // botlar/uzaktakiler beklenmez
        else if (now >= x.roundStart && GAMES[x.kind].isDue && (GAMES[x.kind].isDue(x, now, waitable(x, now)) ?? humansReady(x, now))) resolveRound(x, now);
      });
      break;
    }

    case 'teamReady':
      // Takımlar ekranında "Tamam": herkes basınca oyun başlar
      d = await mutate(store, code, (x) => {
        if (x.status !== 'playing' || !x.gate || body.seq !== x.seq) return false;
        const me = x.players.find((p) => p.id === pid && !p.left);
        if (!me || !x.g.alive[pid]) throw new GameError('Bu oyunda yoksun');
        me.seen = now;
        if (!x.gate.ready.includes(pid)) x.gate.ready.push(pid);
        if (gatePending(x, now).length === 0) openGate(x, now);
      });
      break;

    case 'gact':
      // Oyuna özel küçük işlemler (ör. albümde 👍, sonraki)
      d = await mutate(store, code, (x) => {
        if (x.status !== 'playing' || body.seq !== x.seq || !GAMES[x.kind].gact) throw new GameError('Oyun aktif değil');
        const changed = GAMES[x.kind].gact(x, pid, body, now);
        if (changed === false) return false;
        if (GAMES[x.kind].isDue && GAMES[x.kind].isDue(x, now, waitable(x, now)) === true && now >= x.roundStart) resolveRound(x, now);
      });
      break;

    case 'sig':
      // WebRTC bağlantı kurulumu: bir oyuncudan diğerine (offer/answer) mesaj
      d = await mutate(store, code, (x) => {
        if (x.status !== 'playing' || body.seq !== x.seq) throw new GameError('Oyun aktif değil');
        const to = cleanId(body.to);
        if (!to || !playerOf(x, to) || !playerOf(x, pid)) throw new GameError('Geçersiz alıcı');
        const data = body.data;
        if (!data || JSON.stringify(data).length > 12000) throw new GameError('Mesaj çok büyük');
        x.sig = (x.sig || []).filter((m) => now - m.t < 40000);
        x.sigN = (x.sigN || 0) + 1;
        x.sig.push({ i: x.sigN, from: pid, to, data, t: now });
        if (x.sig.length > 60) x.sig.shift();
        playerOf(x, pid).seen = now;
      });
      break;

    case 'rtProgress':
    case 'rtResult':
      // Gerçek zamanlı oyunu yöneten cihaz ara sıralamayı / sonucu bildirir
      d = await mutate(store, code, (x) => {
        if (x.status !== 'playing' || body.seq !== x.seq || !GAMES[x.kind].realtime) return false;
        if (x.g.simHost !== pid) throw new GameError('Oyunu yalnızca oda sahibi yönetir');
        const rank = cleanRanking(x, body.ranking);
        playerOf(x, pid).seen = now;
        if (action === 'rtResult') endGame(x, rank, now + 1500);
        else { x.g.prov = rank; x.g.provAt = now; }
      });
      break;

    case 'leave':
      d = await mutate(store, code, (x) => {
        const me = x.players.find((p) => p.id === pid);
        if (!me || me.left) return false;
        if (x.status === 'lobby') {
          x.players = x.players.filter((p) => p.id !== pid);
        } else {
          me.left = true; // listede kalsın ki skor tablosunda adı görünsün; sonraki oyunlara alınmaz
          if (x.status === 'playing' && x.g.alive[pid] && !GAMES[x.kind].realtime) {
            x.g.alive[pid] = false;
            x.g.outs.unshift([pid]); // oyundan çıkan en son sıraya
            delete x.actions[pid];
            const rank = GAMES[x.kind].ranking(x, participants(x));
            if (rank) endGame(x, rank, now);
            else if (now >= x.roundStart && humansReady(x, now)) resolveRound(x, now);
          }
        }
        transferHost(x);
      });
      break;

    case 'next':
      // Oda sahibi skor ekranını beklemeden sonraki oyuna geçebilir
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status !== 'inter') return false;
        x.tour.idx += 1;
        startGame(x, now);
      });
      break;

    case 'rematch':
      // Bitince odadaki herkes aynı oyuncularla ve aynı modla hemen yeniden başlatabilir
      d = await mutate(store, code, (x) => {
        if (x.status !== 'over') return false; // başka biri zaten başlattı
        if (!x.players.some((p) => p.id === pid && !p.left)) throw new GameError('Bu odada değilsin');
        if (activePlayers(x).length < 2) throw new GameError('Tekrar oynamak için en az 2 oyuncu gerekli');
        transferHost(x);
        startMatch(x, now);
      });
      break;

    case 'lobby':
      // Oda sahibi istediği an herkesi lobiye döndürebilir (oyun ortasında da)
      d = await mutate(store, code, (x) => {
        requireHost(x, pid);
        if (x.status === 'lobby') return false;
        x.players = activePlayers(x).filter((p) => !p.temp);
        Object.assign(x, { status: 'lobby', history: [], actions: {}, g: null, tour: null, round: 0, sig: [] });
      });
      break;

    default:
      throw new GameError('Bilinmeyen işlem');
  }
  return { state: view(d, pid, now), now, ...(extra || {}) };
}
