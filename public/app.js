// Parti Ligi (Party League) — uygulama kabuğu: ekranlar, ağ, oyun istemcileri, panel, mesajlar
import * as G from './game-core.js';
import { $, esc, clamp, ls, toast, audio, sfx } from './client/util.js';
import { randomLook, cleanLook } from './games/avatar.js';
import { portraitCanvas, registerFace, portraitURL, startFaceAnimations } from './client/avatar2d.js';
import { createLazer } from './client/lazer.js';
import { createBomba } from './client/bomba.js';
import { createYaris } from './client/yaris.js';
import { createCizim } from './client/cizim.js';
import { createNeciz } from './client/neciz.js';
import { createBilgi } from './client/bilgi.js';
import { createKeski } from './client/keski.js';
import { createBombaci } from './client/bombaci.js';
import { createKor } from './client/kor.js';
import { createHalat } from './client/halat.js';
import { createKayik } from './client/kayik.js';
import { createUI } from './client/ui.js';
import { createCustomizer } from './client/custom.js';

const CLIENTS = { lazer: createLazer, bomba: createBomba, cizim: createCizim, neciz: createNeciz, bilgi: createBilgi, keski: createKeski, bombaci: createBombaci, kor: createKor, halat: createHalat, kayik: createKayik, yaris: createYaris };
const MODE_INFO = {
  tour: { emoji: '🏆', title: 'Turnuva', sub: 'Seçili oyunlar sırayla • puanlar toplanır • podyum' },
  lazer: { emoji: G.GAMES.lazer.EMOJI, title: G.GAMES.lazer.TITLE, sub: 'Yürü, sapanla taş fırlat, uçuruma it' },
  bomba: { emoji: G.GAMES.bomba.EMOJI, title: G.GAMES.bomba.TITLE, sub: 'Gerçek zamanlı Bomberman' },
  cizim: { emoji: G.GAMES.cizim.EMOJI, title: G.GAMES.cizim.TITLE, sub: 'Yaz, çiz, tahmin et; albümde gül' },
  neciz: { emoji: G.GAMES.neciz.EMOJI, title: G.GAMES.neciz.TITLE, sub: 'Sırayla çiz, ilk bilen kazanır' },
  bilgi: { emoji: G.GAMES.bilgi.EMOJI, title: G.GAMES.bilgi.TITLE, sub: 'Kategori oyla, çark çevir, bil' },
  keski: { emoji: G.GAMES.keski.EMOJI, title: G.GAMES.keski.TITLE, sub: 'Ezberle ve taşı aynen yont' },
  bombaci: { emoji: G.GAMES.bombaci.EMOJI, title: G.GAMES.bombaci.TITLE, sub: 'Takım: biri görür, biri anlatır' },
  kor: { emoji: G.GAMES.kor.EMOJI, title: G.GAMES.kor.TITLE, sub: 'Takım: kör koşucuyu yönlendir' },
  halat: { emoji: G.GAMES.halat.EMOJI, title: G.GAMES.halat.TITLE, sub: 'Takım: hızlı bas, çamura düşür' },
  kayik: { emoji: G.GAMES.kayik.EMOJI, title: G.GAMES.kayik.TITLE, sub: 'Takım: ikili kayık, birlikte kürek çek' },
  yaris: { emoji: G.GAMES.yaris.EMOJI, title: G.GAMES.yaris.TITLE, sub: 'Gerçek zamanlı yarış' },
};
const VIEW_LABEL = { top: '🗺️ 2D', chase: '🎥 3D', fps: '👁️ FPS' };
const GAME_COLORS = { lazer: '#ff3d6a', bomba: '#fb923c', cizim: '#f472b6', neciz: '#a78bfa', bilgi: '#38bdf8', keski: '#a8a29e', bombaci: '#ef4444', kor: '#4ade80', halat: '#facc15', kayik: '#2dd4bf', yaris: '#22d3ee' };
const TEAM_TAG = { bombaci: 'takım', kor: 'takım', halat: 'takım', kayik: 'takım' };
const RT_TAG = { bomba: 'gerçek zamanlı', yaris: 'gerçek zamanlı', kor: 'gerçek zamanlı', halat: 'gerçek zamanlı', kayik: 'gerçek zamanlı' };
startFaceAnimations();

let playerId = ls.get('lk.id');
if (!playerId) { playerId = G.uid(12); ls.set('lk.id', playerId); }
let myLook = (() => { try { return cleanLook(JSON.parse(ls.get('lk.look'))); } catch { return null; } })();
if (!ls.get('lk.look')) { myLook = randomLook(); ls.set('lk.look', JSON.stringify(myLook)); }

// ---------- Sunucu bağlantısı ----------
// Çevrimiçi: Netlify Function (/api). Çevrimdışı: aynı oyun mantığı tarayıcıda çalışır.
const remote = {
  online: true,
  async call(body) {
    let r;
    try {
      r = await fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    } catch { throw new Error('Sunucuya ulaşılamadı'); }
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('Sunucuya ulaşılamadı');
    if (!r.ok || j.error) throw new Error(j.error || 'Hata');
    return j;
  },
};
const localStore = new G.MemoryStore();
const local = {
  online: false,
  async call(body) {
    try { return await G.handle(localStore, body, Date.now()); }
    catch (e) { throw new Error(e.publicMessage || e.message); }
  },
};

const app = { api: remote, code: null, s: null, offset: 0, pollTimer: null, busy: false };
const serverNow = () => Date.now() + app.offset;
let client = null, clientSeq = -1;
let animKey = null, roundKey = null, editing = true;
let view = ls.get('lk.view') === 'fps' ? 'fps' : 'top';

// ---------- Ekranlar ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  if (id === 'game') requestAnimationFrame(resize);
  if (id !== 'custom') customizer.close();
}

const nameInput = $('#name');
nameInput.value = ls.get('lk.name') || '';
nameInput.addEventListener('change', () => ls.set('lk.name', nameInput.value.trim()));
const myName = () => nameInput.value.trim() || 'Oyuncu';

const params = new URLSearchParams(location.search);
if (params.get('oda')) $('#joinCode').value = params.get('oda').toUpperCase().slice(0, 4);

let botN = Number(ls.get('lk.bots')) || 3;
$('#botN').textContent = botN;
for (const b of document.querySelectorAll('[data-step]')) {
  b.addEventListener('click', () => {
    botN = clamp(botN + Number(b.dataset.step), 1, G.MAX_PLAYERS - 1);
    $('#botN').textContent = botN;
    ls.set('lk.bots', botN);
  });
}

function drawHomePortrait() { registerFace($('#homePortrait'), myLook, (app.s && app.s.players.find((p) => p.id === playerId)?.color) || '#3b82f6'); }
drawHomePortrait();

// Ana ekran: oyun kartları (dokununca kurallar açılır)
$('#gameCount').textContent = G.TOUR.length;
$('#homeGames').innerHTML = G.TOUR.map((k) => { const m = G.GAMES[k]; return `<button class="gcard" data-g="${k}" style="--c:${GAME_COLORS[k] || '#38bdf8'}"><span class="ge">${m.EMOJI}</span><b>${esc(m.TITLE)}</b><small>${esc(MODE_INFO[k].sub)}</small><span class="tags">${TEAM_TAG[k] ? '<span class="tag">👥 ' + TEAM_TAG[k] + '</span>' : ''}${RT_TAG[k] ? '<span class="tag">⚡ ' + RT_TAG[k] + '</span>' : ''}</span><ul class="rules-txt">${m.RULES.map((r) => '<li>' + esc(r) + '</li>').join('')}</ul></button>`; }).join('');
$('#homeGames').addEventListener('click', (e) => { const b = e.target.closest('.gcard'); if (!b) return; const open = b.classList.contains('open'); document.querySelectorAll('.gcard.open').forEach((x) => x.classList.remove('open')); if (!open) { b.classList.add('open'); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });

// ---------- Karakter ekranı ----------
let lookTimer = null;
const customizer = createCustomizer({
  getLook: () => myLook,
  color: () => meP()?.color || '#3b82f6',
  onChange(l) {
    myLook = l;
    ls.set('lk.look', JSON.stringify(l));
    drawHomePortrait();
    clearTimeout(lookTimer);
    if (app.code) lookTimer = setTimeout(() => act({ action: 'look', look: myLook }), 500);
  },
});
let customBack = 'home';
for (const b of document.querySelectorAll('[data-custom]')) b.addEventListener('click', () => {
  customBack = app.code ? 'lobby' : 'home';
  show('custom');
  customizer.open();
});
$('#btnCustomDone').addEventListener('click', () => { show(customBack); if (customBack === 'lobby') renderLobby(true); });

// ---------- Oda işlemleri ----------
async function enterRoom(api, body) {
  ls.set('lk.name', myName());
  app.api = api;
  const r = await api.call({ ...body, playerId, name: myName(), look: myLook });
  app.code = r.state.code;
  app.s = null; animKey = null; roundKey = null; lastChatN = null; lobbyKey = '';
  if (api.online) ls.set('lk.room', app.code);
  apply(r);
  startPolling();
  return r;
}

$('#btnCreate').addEventListener('click', async () => {
  try { await enterRoom(remote, { action: 'create' }); }
  catch (e) { toast(e.message === 'Sunucuya ulaşılamadı' ? 'Sunucuya ulaşılamadı — botlarla çevrimdışı oynayabilirsin' : e.message); }
});
$('#btnJoin').addEventListener('click', async () => {
  const code = $('#joinCode').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return toast('Oda kodu 4 harf olmalı');
  try { await enterRoom(remote, { action: 'join', code }); }
  catch (e) { toast(e.message); }
});
$('#btnSolo').addEventListener('click', async () => {
  try {
    const r = await enterRoom(local, { action: 'create' });
    for (let i = 0; i < botN; i++) await local.call({ action: 'addBot', code: r.state.code, playerId });
    apply(await local.call({ action: 'state', code: r.state.code, playerId }));
  } catch (e) { toast(e.message); }
});

async function act(body) {
  if (app.busy && body.action !== 'say' && body.action !== 'look') return null;
  app.busy = true;
  try {
    const r = await app.api.call({ code: app.code, playerId, ...body });
    apply(r);
    return r;
  } catch (e) { toast(e.message); return null; }
  finally { app.busy = false; }
}

$('#btnAddBot').addEventListener('click', () => act({ action: 'addBot' }));
$('#btnStart').addEventListener('click', () => act({ action: 'start' }));
$('#btnLeave').addEventListener('click', leaveRoom);
$('#btnExit').addEventListener('click', () => {
  const s = app.s;
  if (s && s.hostId === playerId && s.status !== 'lobby') {
    // Oda sahibi: herkesi lobiye döndür (oyun yarıda kalır) ya da sadece kendisi çıksın
    if (confirm('Herkesi odaya (lobiye) döndürmek ister misin? Oyun yarıda kalır.')) { act({ action: 'lobby' }); return; }
    if (!confirm('Odadan tamamen çıkmak ister misin?')) return;
    leaveRoom();
    return;
  }
  if (s && s.status === 'playing' && meP()?.alive && !confirm('Oyundan çıkarsan bu oyunda elenirsin. Çıkılsın mı?')) return;
  leaveRoom();
});
$('#lobbyPlayers').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bot]');
  if (b) act({ action: 'removeBot', botId: b.dataset.bot });
});
$('#modes').addEventListener('click', (e) => {
  if (!app.s || app.s.hostId !== playerId) return;
  const t = e.target.closest('[data-tg]');
  if (t) {
    // turnuvaya oyun ekle/çıkar
    e.stopPropagation();
    const cur = new Set(app.s.tourGames);
    cur.has(t.dataset.tg) ? cur.delete(t.dataset.tg) : cur.add(t.dataset.tg);
    act({ action: 'tourGames', games: [...cur] });
    return;
  }
  const b = e.target.closest('[data-mode]');
  if (b) act({ action: 'mode', mode: b.dataset.mode });
});
$('#btnShare').addEventListener('click', async () => {
  const url = `${location.origin}/?oda=${app.code}`;
  const text = `Parti Ligi odama gel! Kod: ${app.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Parti Ligi', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Davet linki kopyalandı'); }
  } catch {}
});

async function leaveRoom() {
  stopPolling();
  $('#quick').classList.add('hidden');
  $('#feed').innerHTML = '';
  const { api, code } = app;
  app.code = null; app.s = null;
  if (client) { client.dispose(); client = null; clientSeq = -1; }
  ls.del('lk.room');
  show('home');
  if (code) try { await api.call({ action: 'leave', code, playerId }); } catch {}
}

function startPolling() {
  stopPolling();
  const loop = async () => {
    if (!app.code) return;
    try {
      const extra = client && client.pollExtra ? client.pollExtra() : null;
      const r = await app.api.call({ action: 'state', code: app.code, playerId, ...(extra || {}) });
      apply(r);
      if (r.live && client && client.onLive) client.onLive(r.live);
      if (r.rt && client && client.onRt) client.onRt(r.rt);
    }
    catch (e) { if (/bulunamadı/i.test(e.message)) { toast(e.message); return leaveRoom(); } }
    if (!app.code) return;
    // Gerçek zamanlı oyunda bağlantı kurulurken sinyaller hızlı aksın
    const fast = client && client.wantsFastPoll && client.wantsFastPoll();
    app.pollTimer = setTimeout(loop, !app.api.online ? 250 : document.hidden ? 4000 : typeof fast === 'number' ? fast : fast ? 400 : 1000);
  };
  app.pollTimer = setTimeout(loop, app.api.online ? 800 : 200);
}
function stopPolling() { clearTimeout(app.pollTimer); app.pollTimer = null; }

// ---------- Hazır mesajlar ----------
let lastChatN = null;
const isEmojiOnly = (q) => !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(q);
$('#quickGrid').innerHTML = G.QUICK.map((q, i) => `<button data-k="${i}" class="${isEmojiOnly(q) ? 'emoji' : 'wide'}">${esc(q)}</button>`).join('');
for (const b of document.querySelectorAll('[data-chat]')) b.addEventListener('click', () => $('#quick').classList.remove('hidden'));
$('#quick').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-k]');
  $('#quick').classList.add('hidden');
  if (b && app.code) act({ action: 'say', k: Number(b.dataset.k) });
});
function handleChat(s) {
  const list = s.chat || [];
  const maxN = list.reduce((m, c) => Math.max(m, c.n), 0);
  if (lastChatN === null) { lastChatN = maxN; return; }
  for (const c of list.slice().sort((a, b) => a.n - b.n)) if (c.n > lastChatN) showBubble(c);
  lastChatN = Math.max(lastChatN, maxN);
}
function showBubble(c) {
  const p = pById(c.p) || { name: '?', color: '#888' };
  const q = G.QUICK[c.k] || '';
  const el = document.createElement('div');
  el.className = 'bubble' + (isEmojiOnly(q) ? ' big' : '');
  el.innerHTML = `<span class="dot" style="background:${p.color}"></span><span class="who">${esc(c.p === playerId ? 'Sen' : p.name)}</span><span class="msg">${esc(q)}</span>`;
  const feed = $('#feed');
  feed.appendChild(el);
  while (feed.children.length > 4) feed.firstElementChild.remove();
  sfx('pop');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3800);
}

// ---------- Durumu uygula ----------
const meP = () => app.s && app.s.players.find((p) => p.id === playerId);
const pById = (id) => app.s && app.s.players.find((p) => p.id === id);
const pName = (id) => pById(id)?.name || '?';

// Üst barda kendi avatarım (her oyunda görünür)
let hudMeKey = '';
function drawHudMe() {
  const me = meP();
  if (!me) return;
  const key = JSON.stringify([me.look, me.color]);
  if (key === hudMeKey) return;
  hudMeKey = key;
  registerFace($('#hudMe'), me.look, me.color);
}

function ensureClient(s) {
  if (!s.kind) return;
  if (client && clientSeq === s.seq && client.kind === s.kind) return;
  if (client) client.dispose();
  client = CLIENTS[s.kind](clientCtx);
  clientSeq = s.seq;
  animKey = null; roundKey = null;
  updateViewButton();
}

function apply(r) {
  const s = r.state;
  if (!app.code || s.code !== app.code) return;
  if (app.s && s.rev < app.s.rev) return; // geç gelen eski yanıt
  app.s = s;
  app.offset = r.now - Date.now();
  handleChat(s);
  if (!s.isMember) { toast('Bu odada değilsin'); return leaveRoom(); }
  if (s.status === 'lobby') {
    if (client) { client.dispose(); client = null; clientSeq = -1; }
    if (!$('#custom').classList.contains('hidden')) return;
    show('lobby');
    renderLobby();
    return;
  }
  if ($('#custom').classList.contains('hidden')) show('game');
  drawHudMe();
  ensureClient(s);
  // Yeni çözülen tur → animasyon
  if (s.last && s.last.seq === s.seq) {
    const key = `${s.seq}:${s.last.round}`;
    if (key !== animKey) {
      const elapsed = serverNow() - s.last.resolvedAt;
      animKey = key;
      // Çoktan bitmiş bir turu (ör. sayfa sonradan açıldıysa) tekrar oynatma
      if (elapsed < client.revealTotal(s.last) - 400) client.onEntry(s.last, clamp(elapsed, 0, 1200));
    }
  } else animKey = `${s.seq}:0`;
  // Yeni tur → hamle seçimi sıfırlanır
  const rk = `${s.seq}:${s.round}`;
  if (s.status === 'playing' && rk !== roundKey) { roundKey = rk; editing = !s.myAction; }
  client.onState(s);
}

// ---------- Lobi ----------
let lobbyKey = '';
function renderLobby(force) {
  const s = app.s;
  const key = JSON.stringify([s.players, s.hostId, s.mode, s.tourGames]);
  if (!force && key === lobbyKey) return;
  lobbyKey = key;
  $('#lobbyCode').textContent = s.code;
  const host = s.hostId === playerId;
  // Turnuva kartında oyun seçimi (oda sahibi dokunarak açıp kapatır)
  const tg = G.TOUR.map((k) => `<span class="tg${s.tourGames.includes(k) ? ' on' : ''}" data-tg="${k}" title="${esc(G.GAMES[k].TITLE)}">${G.GAMES[k].EMOJI}</span>`).join('');
  const card = (m, i) => `<div role="button" tabindex="0" class="mode${s.mode === m ? ' on' : ''}${host ? '' : ' ro'}" data-mode="${m}"><span class="m-emoji">${i.emoji}</span><span class="m-txt"><b>${esc(i.title)}</b><small>${esc(i.sub)}</small></span></div>`;
  $('#modes').innerHTML = `<div role="button" tabindex="0" class="mode tour${s.mode === 'tour' ? ' on' : ''}${host ? '' : ' ro'}" data-mode="tour"><div class="m-row"><span class="m-emoji">🏆</span><span class="m-txt"><b>Turnuva</b><small>${s.tourGames.length} oyun sırayla · puanlar toplanır · podyum${host ? ' · oyunlara dokunarak seç' : ''}</small></span></div><div class="tg-list">${tg}</div></div>
    <div class="mode-grid">${G.TOUR.map((m) => card(m, MODE_INFO[m])).join('')}</div>`;
  $('#lobbyCount').textContent = `${s.players.length}/${G.MAX_PLAYERS} oyuncu`;
  $('#modesHint').textContent = host ? 'tek oyun ya da turnuva' : 'oda sahibi seçiyor';
  const ul = $('#lobbyPlayers');
  ul.innerHTML = '';
  for (const p of s.players) {
    const li = document.createElement('li');
    li.appendChild(portraitCanvas(p.look, p.color, 40));
    li.insertAdjacentHTML('beforeend', `
      <span class="nm">${esc(p.name)}${p.id === playerId ? ' <span class="tag">(sen)</span>' : ''}</span>
      ${p.id === s.hostId ? '<span class="tag">👑</span>' : ''}
      ${p.bot ? '<span class="tag">🤖</span>' : ''}
      ${p.away ? '<span class="tag">💤</span>' : ''}
      ${p.bot && host ? `<button class="x" data-bot="${p.id}" aria-label="botu çıkar">✕</button>` : ''}`);
    ul.appendChild(li);
  }
  $('#lobbyHost').classList.toggle('hidden', !host);
  $('#lobbyWait').classList.toggle('hidden', host);
  $('#btnStart').disabled = s.players.length < 2;
  $('#btnStart').textContent = s.mode === 'tour' ? '🏆 Turnuvayı başlat' : `${MODE_INFO[s.mode].emoji} Başlat`;
  $('#btnAddBot').disabled = s.players.length >= G.MAX_PLAYERS;
  $('#btnShare').classList.toggle('hidden', !app.api.online);
}

// ---------- Faz ----------
function phase() {
  const s = app.s;
  if (!s || !client) return 'none';
  if (client.animating()) return 'reveal';
  if (s.status === 'inter') return 'inter';
  if (s.status === 'over') return 'over';
  const me = meP();
  if (!me || !me.alive) return 'spectate';
  return 'plan';
}

// ---------- Alt panel ----------
let panelHTML = '';
const chipHTML = (id, cls = '', extra = '', num = '') => {
  const p = pById(id) || { id, name: '?', color: '#888' };
  return `<span class="chip ${cls}${id === playerId ? ' me' : ''}">${num ? `<span class="n">${num}</span>` : ''}<img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">${esc(p.name)}${id === playerId ? ' (sen)' : ''}${extra}</span>`;
};
function renderPanel(now) {
  const s = app.s;
  if (!s || s.status === 'lobby' || !client) return;
  const ph = phase();
  let html = '';
  if (client.ownPanel && (ph === 'plan' || ph === 'spectate' || ph === 'reveal')) {
    html = client.ownPanel(chipHTML);
  } else if (client.realtime && (ph === 'plan' || ph === 'spectate')) {
    // Gerçek zamanlı oyun: "Hazırım" yok; canlı sıralama
    html = client.panel();
  } else if (ph === 'plan' || ph === 'spectate') {
    const inGame = s.players.filter((p) => p.inGame && !p.left);
    const alive = inGame.filter((p) => p.alive);
    const readyN = alive.filter((p) => s.ready.includes(p.id)).length;
    if (ph === 'plan') {
      const hint = client.hint(editing);
      html += editing ? `<div class="status">${hint ? `<small>${esc(hint)}</small>` : ''}</div>` : `<div class="status">Hazırsın ✓<small>Diğerleri bekleniyor (${readyN}/${alive.length})</small></div>`;
      html += client.panel(editing);
    } else {
      const me = meP();
      html += me && !me.inGame
        ? `<div class="status">👀 İzliyorsun<small>Bir sonraki oyunda sen de oynayacaksın</small></div>`
        : `<div class="status">💀 Elendin<small>Kalanlar oynuyor (${readyN}/${alive.length} hazır)</small></div>`;
    }
    html += `<div class="chips">${inGame.map((p) => chipHTML(p.id, !p.alive ? 'dead' : s.ready.includes(p.id) ? 'ready' : '', !p.alive ? '' : s.ready.includes(p.id) ? ' ✓' : p.away ? ' 💤' : ' …')).join('')}</div>`;
    const noReady = client.hideReady && client.hideReady();
    if (ph === 'plan' && !noReady) html += editing ? '<button class="btn ok" data-act="ready">Hazırım</button>' : '<button class="btn ghost" data-act="edit">Hamlemi değiştir</button>';
  } else if (ph === 'reveal') {
    html += client.revealPanel ? client.revealPanel(now, chipHTML) : `<div class="status">Tur ${s.last ? s.last.round : s.round} oynanıyor…</div>`;
  }
  if (html !== panelHTML) { $('#panel').innerHTML = html; panelHTML = html; }
}
$('#panel').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cact]');
  if (c && client && client.onPanel) { client.onPanel(c.dataset.cact, c); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'ready') submitReady(false);
  else if (a === 'edit') editing = true;
});
// Hamleyi gönder (auto: süre bitmek üzere, istemci boşsa bir şey uydurur)
let submitting = false;
async function submitReady(auto) {
  if (!client || submitting) return;
  const payload = client.action(auto);
  if (!payload) return;
  const { seq, round } = app.s;
  submitting = true;
  try {
    const r = await act({ action: 'act', seq, round, ...payload });
    // Son hazır olan bizsek tur anında çözülür ve yeni tura geçilir; o zaman yeni turda düzenleme açık kalmalı
    if (r && app.s.round === round && app.s.seq === seq) editing = false;
  } finally { submitting = false; }
}

// ---------- Görünüm (2D / 3D takip / FPS) ----------
const viewsOf = (c) => (c ? c.views || (c.supports3D ? ['top', 'fps'] : ['top']) : ['top']);
const effView = () => { const vs = viewsOf(client); return vs.includes(view) ? view : view === 'chase' && vs.includes('fps') ? 'fps' : vs[0]; };
function updateViewButton() {
  const b = $('#btnView');
  const vs = viewsOf(client);
  b.classList.toggle('hidden', vs.length < 2);
  const v = effView();
  b.textContent = VIEW_LABEL[vs[(vs.indexOf(v) + 1) % vs.length]];
  const use3D = (vs.length > 1 && v !== 'top') || !!(client && client.always3D);
  $('#cv3').classList.toggle('hidden', !use3D);
  // Lazer FPS'te 2D tuval gizlenir; gerçek zamanlı oyunlarda 3D'nin üstünde şeffaf bilgi katmanı olur
  const ready = client && client.ready3D && client.ready3D();
  $('#cv').classList.toggle('hidden', use3D && ready && !client.realtime);
  $('#cv').classList.toggle('over3d', use3D && ready && !!client.realtime);
}
function setView(v) { view = v; ls.set('lk.view', v); updateViewButton(); }
$('#btnView').addEventListener('click', () => { const vs = viewsOf(client); setView(vs[(vs.indexOf(effView()) + 1) % vs.length]); });

// ---------- Çizim ----------
const cv = $('#cv'), g2d = cv.getContext('2d'), cv3 = $('#cv3'), mini = $('#mini');
let W = 0, H = 0, DPR = 1;
function resize() {
  const st = $('#stage');
  const w = st.clientWidth, h = st.clientHeight;
  if (w <= 0 || h <= 0) return;
  DPR = Math.min(window.devicePixelRatio || 1, (client && client.maxDPR) || 2);
  const nw = Math.round(w * DPR), nh = Math.round(h * DPR);
  if (nw !== W || nh !== H) { W = cv.width = nw; H = cv.height = nh; }
}
new ResizeObserver(resize).observe($('#stage'));

let bannerTxt = '';
function setBanner(txt) {
  if (txt === bannerTxt) return;
  bannerTxt = txt;
  const b = $('#banner');
  b.classList.toggle('hidden', !txt);
  if (txt) { b.textContent = txt; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
}

const clientCtx = {
  playerId, pById, pName,
  me: () => meP(),
  state: () => app.s,
  editing: () => editing,
  phase: () => phase(),
  serverNow,
  view: () => effView(),
  setView,
  debug: new URLSearchParams(location.search).has('cizim'),
  toast,
  cv, g2d, cv3, mini,
  stage: $('#stage'),
  online: () => app.api.online,
  // Sunucuya doğrudan istek (meşgul kilidini beklemez); dönen durum uygulanır
  call: async (body) => { const r = await app.api.call({ code: app.code, playerId, ...body }); if (r.state) apply(r); return r; },
  raw: (body) => app.api.call({ code: app.code, playerId, ...body }),
  submit: (auto) => submitReady(auto),
  size: () => ({ W, H, DPR }),
  size3: () => ({ w: $('#stage').clientWidth, h: $('#stage').clientHeight }),
};
const ui = createUI({
  GAMES: G.GAMES, playerId, pById, pName, serverNow,
  onUI(a) {
    if (a === 'home') leaveRoom();
    else if (a === 'teamReady') act({ action: 'teamReady', seq: app.s.seq });
    else act({ action: a });
  },
});

let hudHTML = '', lastNow = performance.now(), lastRaf = performance.now();
// Bazı gömülü tarayıcılar görünür sayfada da rAF'ı durdurabiliyor: o zaman zamanlayıcıyla çiz
// ?cizim → test modu: sayfa gizliyken de çiz ve tuvalleri yerel test sunucusuna kaydedebil
const DEBUG_DRAW = params.has('cizim');
setInterval(() => {
  if ((!document.hidden || DEBUG_DRAW) && performance.now() - lastRaf > 500) tick(performance.now());
}, 40);
if (DEBUG_DRAW) {
  window.__lkSnap = async (name) => {
    const target = !$('#cv3').classList.contains('hidden') ? cv3 : cv;
    await fetch('/__snap', { method: 'POST', body: JSON.stringify({ name, data: target.toDataURL('image/jpeg', 0.85) }) });
  };
}
function frame(now) {
  requestAnimationFrame(frame);
  lastRaf = performance.now();
  tick(now);
}
let lastSizeCheck = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  // ResizeObserver kare çizilmeden tetiklenmeyebilir; boyutu burada da yokla
  if (!W || now - lastSizeCheck > 500) { lastSizeCheck = now; resize(); }
  const s = app.s;
  ui.update(now, dt, $('#game').classList.contains('hidden') ? null : s, client ? client.animating() : false);
  if (!s || s.status === 'lobby' || !client || !W || $('#game').classList.contains('hidden')) return;
  const ph = phase();
  const v = effView();
  const banner = client.frame(now, dt, ph, v);
  updateViewButton();
  $('#mini').classList.toggle('hidden', !(client.kind === 'lazer' && v === 'fps' && ph === 'plan' && editing));
  setBanner(ui.mode() === 'none' ? banner : '');
  renderPanel(now);
  // HUD
  const mod = G.GAMES[s.kind];
  const step = s.tour && s.tour.list.length > 1 ? ` ${s.tour.idx + 1}/${s.tour.list.length}` : '';
  const round = ph === 'reveal' && s.last ? s.last.round : s.round;
  const hud = `<b>${app.api.online ? s.code : '🤖'}</b> ${mod.EMOJI}${step}${client.realtime || ['cizim', 'neciz', 'bilgi', 'keski', 'bombaci'].includes(s.kind) ? '' : ` · Tur <b>${round}</b>`} · ${client.hud()}`;
  if (hud !== hudHTML) $('#hudInfo').innerHTML = hudHTML = hud;
  const showTimer = !client.realtime && !client.hideTimer && (ph === 'plan' || ph === 'spectate') && s.status === 'playing' && serverNow() >= s.roundStart;
  const left = showTimer ? Math.max(0, s.deadline - serverNow()) : 0;
  const tm = $('#hudTimer');
  tm.textContent = showTimer ? Math.ceil(left / 1000) + 's' : '';
  tm.classList.toggle('low', left < 6000);
  $('#timerFill').style.width = showTimer ? `${clamp(left / Math.max(1, s.deadline - s.roundStart), 0, 1) * 100}%` : '0%';
}
requestAnimationFrame(frame);

// ---------- Dokunmatik ----------
function bindPointer(el, target) {
  el.addEventListener('pointerdown', (ev) => {
    audio();
    if (!client) return;
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    client.pointer('down', ev, target);
  });
  el.addEventListener('pointermove', (ev) => { if (client && ev.buttons) client.pointer('move', ev, target); });
  el.addEventListener('pointerup', (ev) => client && client.pointer('up', ev, target));
  el.addEventListener('pointercancel', (ev) => client && client.pointer('cancel', ev, target));
}
bindPointer(cv, '2d');
bindPointer(cv3, 'fps');
bindPointer(mini, 'mini');
document.addEventListener('pointerdown', () => audio(), { once: true });

// ---------- Başlangıç ----------
(async () => {
  const saved = ls.get('lk.room');
  if (saved) {
    try {
      app.api = remote; app.code = saved;
      const r = await remote.call({ action: 'state', code: saved, playerId });
      if (r.state.isMember) { apply(r); startPolling(); return; }
    } catch {}
    app.code = null; ls.del('lk.room');
  }
  show('home');
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
