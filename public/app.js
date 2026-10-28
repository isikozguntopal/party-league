// Parti Ligi (Party League) — uygulama kabuğu: ekranlar, ağ, oyun istemcileri, panel, mesajlar
import * as G from './game-core.js';
import { $, esc, clamp, ls, toast, audio, sfx } from './client/util.js';
import { randomLook, cleanLook } from './games/avatar.js';
import { portraitCanvas, registerFace, portraitURL, startFaceAnimations } from './client/avatar2d.js';
import { createLazer } from './client/lazer.js';
import { createBomba } from './client/bomba.js';
import { createYaris } from './client/yaris.js';
import { createPatiRT } from './client/pati-rt.js';
import * as PATI from './games/pati.js';
const PATI_ANIMALS = PATI.ANIMAL_IDS;
import * as LAND from './client/landscape.js';
import { createCizim } from './client/cizim.js';
import { createNeciz } from './client/neciz.js';
import { createBilgi } from './client/bilgi.js';
import { createSarki } from './client/sarki.js';
import { createTanir } from './client/tanir.js';
import { createBasket } from './client/basket.js';
import { createSaniye } from './client/saniye.js';
import { createSuru } from './client/suru.js';
import { createAyar } from './client/ayar.js';
import { createTelve } from './client/telve.js';
import { createMelodi } from './client/melodi.js';
import { showTutorial, TUTS } from './client/tutorial.js';
import { createKeski } from './client/keski.js';
import { createBombaci } from './client/bombaci.js';
import { createKor } from './client/kor.js';
import { createHalat } from './client/halat.js';
import { createKayik } from './client/kayik.js';
import { createUI } from './client/ui.js';
import { createCustomizer } from './client/custom.js';

const CLIENTS = { lazer: createLazer, bomba: createBomba, cizim: createCizim, neciz: createNeciz, bilgi: createBilgi, keski: createKeski, bombaci: createBombaci, kor: createKor, halat: createHalat, kayik: createKayik, yaris: createYaris, pati: createPatiRT, sarki: createSarki, tanir: createTanir, basket: createBasket, melodi: createMelodi, saniye: createSaniye, suru: createSuru, ayar: createAyar, telve: createTelve };
const MODE_INFO = {
  tour: { emoji: '🏆', title: 'Turnuva', sub: 'Seçili oyunlar sırayla • puanlar toplanır • podyum' },
  lazer: { emoji: G.GAMES.lazer.EMOJI, title: G.GAMES.lazer.TITLE, sub: 'Yürü, sapanla taş fırlat, uçuruma it' },
  bomba: { emoji: G.GAMES.bomba.EMOJI, title: G.GAMES.bomba.TITLE, sub: 'Gerçek zamanlı Bomberman' },
  cizim: { emoji: G.GAMES.cizim.EMOJI, title: G.GAMES.cizim.TITLE, sub: 'Yaz, çiz, tahmin et; albümde gül' },
  neciz: { emoji: G.GAMES.neciz.EMOJI, title: G.GAMES.neciz.TITLE, sub: 'Sırayla çiz, ilk bilen kazanır' },
  bilgi: { emoji: G.GAMES.bilgi.EMOJI, title: G.GAMES.bilgi.TITLE, sub: '8 kategori oyla, joker kullan, bil' },
  keski: { emoji: G.GAMES.keski.EMOJI, title: G.GAMES.keski.TITLE, sub: 'Ezberle ve taşı aynen yont' },
  bombaci: { emoji: G.GAMES.bombaci.EMOJI, title: G.GAMES.bombaci.TITLE, sub: 'Takım: biri görür, biri anlatır' },
  kor: { emoji: G.GAMES.kor.EMOJI, title: G.GAMES.kor.TITLE, sub: 'Takım: kör koşucuyu yönlendir' },
  halat: { emoji: G.GAMES.halat.EMOJI, title: G.GAMES.halat.TITLE, sub: 'Takım: hızlı bas, çamura düşür' },
  kayik: { emoji: G.GAMES.kayik.EMOJI, title: G.GAMES.kayik.TITLE, sub: 'Takım: ikili kayık, birlikte kürek çek' },
  yaris: { emoji: G.GAMES.yaris.EMOJI, title: G.GAMES.yaris.TITLE, sub: 'Gerçek zamanlı yarış' },
  pati: { emoji: G.GAMES.pati.EMOJI, title: G.GAMES.pati.TITLE, sub: 'Hayvanlarla yan koşu yarışı' },
  sarki: { emoji: G.GAMES.sarki.EMOJI, title: G.GAMES.sarki.TITLE, sub: 'Dize yaz, ortak şarkı olsun, oyla' },
  tanir: { emoji: G.GAMES.tanir.EMOJI, title: G.GAMES.tanir.TITLE, sub: 'Takım: arkadaşın seni ne kadar tanıyor?' },
  melodi: { emoji: G.GAMES.melodi.EMOJI, title: G.GAMES.melodi.TITLE, sub: 'Takım: şarkıyı birkaç saniyeden bil' },
  saniye: { emoji: G.GAMES.saniye.EMOJI, title: G.GAMES.saniye.TITLE, sub: 'Kronometre kaybolur: hedef süreyi içinden say' },
  suru: { emoji: G.GAMES.suru.EMOJI, title: G.GAMES.suru.TITLE, sub: 'Kalabalıkla aynı şıkkı seç, kara koyun olma' },
  ayar: { emoji: G.GAMES.ayar.EMOJI, title: G.GAMES.ayar.TITLE, sub: 'İpucuyla gizli noktayı bul' },
  telve: { emoji: G.GAMES.telve.EMOJI, title: G.GAMES.telve.TITLE, sub: 'Falcının kartını bul, yorumla' },
  basket: { emoji: G.GAMES.basket.EMOJI, title: G.GAMES.basket.TITLE, sub: '45 sn basket: sürükle, at, seri sayı katlar' },
};
const VIEW_LABEL = { top: '🗺️ 2D', chase: '🎥 3D', fps: '👁️ FPS' };
const GAME_COLORS = { lazer: '#ff3d6a', bomba: '#fb923c', cizim: '#f472b6', neciz: '#a78bfa', bilgi: '#38bdf8', keski: '#a8a29e', bombaci: '#ef4444', kor: '#4ade80', halat: '#facc15', kayik: '#2dd4bf', yaris: '#22d3ee', pati: '#fb923c', sarki: '#e879f9', tanir: '#34d399', basket: '#fb923c', melodi: '#a78bfa', saniye: '#818cf8', suru: '#86efac', ayar: '#fbbf24', telve: '#a78bfa' };
const TEAM_TAG = { bombaci: 'takım', kor: 'takım', halat: 'takım', kayik: 'takım', tanir: 'takım', melodi: 'takım' };
const RT_TAG = { bomba: 'gerçek zamanlı', yaris: 'gerçek zamanlı', pati: 'gerçek zamanlı', kor: 'gerçek zamanlı', halat: 'gerçek zamanlı', kayik: 'gerçek zamanlı' };
startFaceAnimations();

let playerId = ls.get('lk.id');
if (!playerId) { playerId = G.uid(12); ls.set('lk.id', playerId); }
let myLook = (() => { try { return cleanLook(JSON.parse(ls.get('lk.look'))); } catch { return null; } })();
if (!ls.get('lk.look')) { myLook = randomLook(); ls.set('lk.look', JSON.stringify(myLook)); }

// ---------- Sunucu bağlantısı ----------
// Çevrimiçi: Netlify Function (/api). Çevrimdışı: aynı oyun mantığı tarayıcıda çalışır.
// iOS uygulamasında (Capacitor) sayfa capacitor://localhost'tan açılır; API ve davet bağlantısı için gerçek adres gerekir.
const WEB_ORIGIN = 'https://parti-ligi.lazer-kafes.workers.dev';
const NATIVE = location.protocol === 'capacitor:';
const API_URL = NATIVE ? WEB_ORIGIN + '/api' : '/api';
const remote = {
  online: true,
  async call(body) {
    let r;
    try {
      r = await fetch(API_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
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

let autoSentKey = null;
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
$('#btnJoinToggle').addEventListener('click', () => { $('#joinRow').classList.toggle('hidden'); if (!$('#joinRow').classList.contains('hidden')) $('#joinCode').focus(); });
if (/[?&](bot|cizim)\b/.test(location.search)) document.querySelectorAll('.dev-only').forEach((el) => el.classList.remove('hidden'));
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

// ---------- Yönetici paneli (oda sahibi + onun yönetici yaptıkları) ----------
let admOpen = false, admSeen = new Set(), admSig = '';
const pendingOf = (s) => s.players.filter((p) => p.pending && !p.left);
function renderAdmin() {
  const s = app.s;
  const show = !!(s && s.iAdmin && s.status !== 'lobby');
  $('#btnAdmin').classList.toggle('hidden', !show);
  if (!show) { $('#admAlert').classList.add('hidden'); if (admOpen) closeAdmin(); return; }
  const pend = pendingOf(s);
  // yeni giriş isteği → uyarı
  for (const p of pend) if (!admSeen.has(p.id)) { admSeen.add(p.id); toast(`🔔 ${p.name} turnuvaya katılmak istiyor`); sfx('ping'); }
  $('#admBadge').textContent = pend.length; $('#admBadge').classList.toggle('hidden', !pend.length);
  const al = $('#admAlert');
  if (pend.length && !admOpen) { al.innerHTML = `<span>🔔 ${esc(pend.map((p) => p.name).join(', '))} katılmak istiyor</span><button data-adm="open">İncele</button>`; al.classList.remove('hidden'); } else al.classList.add('hidden');
  if (!admOpen) return;
  const host = s.hostId === playerId;
  const list = s.players.filter((p) => !p.left && !p.temp && !p.pending);
  const row = (p, pending) => `<div class="adm-row${pending ? ' pend' : ''}"><span class="nm">${esc(p.name)}${p.id === playerId ? ' (sen)' : ''}${p.id === s.hostId ? ' 👑' : p.admin ? ' ⭐' : ''}${p.bot ? ' 🤖' : ''}${p.away ? ' 💤' : ''}</span>${pending
    ? `<button class="go" data-adm="admit" data-id="${esc(p.id)}">Kabul</button><button class="no" data-adm="deny" data-id="${esc(p.id)}">Reddet</button>`
    : `${host && !p.bot && p.id !== s.hostId ? `<button data-adm="admin" data-id="${esc(p.id)}" data-on="${p.admin ? 0 : 1}">${p.admin ? '⭐ Al' : '⭐ Yap'}</button>` : ''}${p.id !== s.hostId && p.id !== playerId ? `<button class="no" data-adm="kick" data-id="${esc(p.id)}" data-nm="${esc(p.name)}">Çıkar</button>` : ''}`}</div>`;
  const playingNow = s.status === 'playing';
  const html = `${pend.length ? `<div class="adm-sec">Katılmak isteyenler</div>${pend.map((p) => row(p, true)).join('')}` : ''}
    <div class="adm-sec">Oyuncular (${list.length})</div>${list.map((p) => row(p, false)).join('')}
    <div class="adm-sec">Oyun</div><div class="adm-acts">${playingNow
      ? `<button class="btn primary" data-adm="finish">⚡ Turu bitir<small>Şu anki duruma göre puanları dağıt ve sonraki oyuna geç</small></button><button class="btn ghost" data-adm="skip">⏭ Oyunu atla<small>Puan dağıtmadan sonraki oyuna geç</small></button>`
      : '<div class="muted" style="font-size:13px">Oyun ekranındayken tur bitirilebilir.</div>'}</div>`;
  if (html !== admSig) { $('#admBody').innerHTML = html; admSig = html; }
}
function openAdmin() { admOpen = true; admSig = ''; $('#admin').classList.remove('hidden'); renderAdmin(); }
function closeAdmin() { admOpen = false; $('#admin').classList.add('hidden'); renderAdmin(); }
$('#btnAdmin').addEventListener('click', openAdmin);
$('#admClose').addEventListener('click', closeAdmin);
$('#admin').addEventListener('click', (e) => { if (e.target === $('#admin')) closeAdmin(); });
$('#admAlert').addEventListener('click', openAdmin);
$('#admBody').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-adm]');
  if (!b) return;
  const a = b.dataset.adm, id = b.dataset.id;
  if (a === 'admit' || a === 'deny') await act({ action: a, target: id });
  else if (a === 'kick') { if (confirm(`${b.dataset.nm} odadan çıkarılsın mı? (geri giremez)`)) await act({ action: 'kick', target: id }); }
  else if (a === 'admin') await act({ action: 'admin', target: id, on: b.dataset.on === '1' });
  else if (a === 'finish') { if (confirm('Tur şimdi bitirilsin mi? Puanlar şu anki duruma göre dağıtılır.')) { await act({ action: 'finish' }); closeAdmin(); } }
  else if (a === 'skip') { if (confirm('Bu oyun atlansın mı? (puan dağıtılmaz)')) { await act({ action: 'skip' }); closeAdmin(); } }
});
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
  const url = `${NATIVE ? WEB_ORIGIN : location.origin}/?oda=${app.code}`;
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
  releaseLand();
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
function openQuick() { $('#quick').classList.remove('hidden'); }
for (const b of document.querySelectorAll('[data-chat]')) b.addEventListener('click', openQuick);
$('#quickForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#quickText'), text = inp.value.trim();
  if (!text || !app.code) return;
  inp.value = '';
  $('#quick').classList.add('hidden');
  inp.blur();
  act({ action: 'say', text });
});
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
const bubbles = {};   // oyuncu → { q, until }: avatarın üstünde konuşma balonu
function showBubble(c) {
  const p = pById(c.p) || { name: '?', color: '#888' };
  const q = c.x !== undefined ? String(c.x) : G.QUICK[c.k] || '';
  const el = document.createElement('div');
  el.className = 'bubble' + (c.x === undefined && isEmojiOnly(q) ? ' big' : '');
  el.innerHTML = `<span class="dot" style="background:${p.color}"></span><span class="who">${esc(c.p === playerId ? 'Sen' : p.name)}</span><span class="msg">${esc(q)}</span>`;
  bubbles[c.p] = { q, until: performance.now() + (c.x !== undefined ? 5200 : 3800) };
  const feed = $('#feed');
  feed.appendChild(el);
  while (feed.children.length > 4) feed.firstElementChild.remove();
  sfx('pop');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, c.x !== undefined ? 5200 : 3800);
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

// Oyunun kendisi yatay mod isterse (Pati Koşusu): telefonu çevir uyarısı → Tamam → yatay → öğretici
const LAND_GAMES = ['pati'];
let landByGame = false;
function releaseLand() { if (landByGame) { landByGame = false; LAND.reset(); updateLandButton(); } }
function ensureClient(s) {
  if (!s.kind) return;
  if (client && clientSeq === s.seq && client.kind === s.kind) return;
  if (client) client.dispose();
  if (!LAND_GAMES.includes(s.kind)) releaseLand();
  client = CLIENTS[s.kind](clientCtx);
  $('#game').classList.toggle('rt', !!client.realtime); // yatayda gerçek zamanlı oyunlarda panel gizlenir, sahne tam ekran olur
  clientSeq = s.seq;
  animKey = null; roundKey = null;
  updateViewButton();
  // Oyun başı öğretici (kör koşu kendi rol ekranını gösterir)
  const tutorial = () => { if (s.kind !== 'kor') showTutorial($('#game'), `${s.code}:${s.seq}`, TUTS[s.kind] || { title: `${G.GAMES[s.kind].EMOJI} ${G.GAMES[s.kind].TITLE}`, rows: G.GAMES[s.kind].RULES.map((t) => ({ ic: '👉', text: esc(t) })) }, client.tutorialExtra ? { extra: client.tutorialExtra, ok: 'Başla', auto: 45 } : {}); };
  if (LAND_GAMES.includes(s.kind) && !LAND.isOn() && innerWidth <= innerHeight) {
    showTutorial($('#game'), `${s.code}:${s.seq}:land`, {
      title: '📱 Telefonu yan çevir',
      rows: [
        { ic: '📱', anim: 'swipe', text: '<b>Telefonunu yan (yatay) tut</b><br>Bu oyun yatay oynanır; pist daha geniş görünür.' },
        { ic: '👍', anim: 'tap', text: '<b>Tamam\'a basınca</b> ekran kendiliğinden yatay olur. Dikey oynamak istersen sağ üstteki ↻ düğmesine basarsın.' },
      ],
    }, { ok: 'Tamam', auto: 30, onClose: () => { if (LAND.enable()) landByGame = true; updateLandButton(); tutorial(); } });
  } else tutorial();
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
    $('#btnAdmin').classList.add('hidden'); $('#admAlert').classList.add('hidden');
    releaseLand();
    if (client) { client.dispose(); client = null; clientSeq = -1; }
    if (!$('#custom').classList.contains('hidden')) return;
    show('lobby');
    renderLobby();
    return;
  }
  if ($('#custom').classList.contains('hidden')) show('game');
  drawHudMe();
  ensureClient(s);
  renderAdmin();
  // Oyun bitip skor/podyum açılınca yatay moddan çık (gerçek zamanlı oyunda yatayken panel gizli olduğu için skor görünmüyordu)
  if (s.status !== 'playing') { releaseLand(); $('#game').classList.remove('rt'); }
  else if (client && client.realtime) $('#game').classList.add('rt');
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
  const key = JSON.stringify([s.players, s.hostId, s.mode, s.tourGames, s.teamSize, s.teams]) + teamPick;
  if (!force && key === lobbyKey) return;
  lobbyKey = key;
  $('#lobbyCode').textContent = s.code;
  const host = s.hostId === playerId;
  // Turnuva kartında oyun seçimi (oda sahibi dokunarak açıp kapatır)
  const teamTour = s.teamSize > 1 && s.teams;
  const tg = G.TOUR.map((k) => { const ban = teamTour && !G.teamOk(k, s.teams); return `<span class="tg${s.tourGames.includes(k) ? ' on' : ''}${ban ? ' ban' : ''}" data-tg="${k}" title="${esc(G.GAMES[k].TITLE)}${ban ? ' — takımlı turnuvada oynanmaz' : ''}">${G.GAMES[k].EMOJI}</span>`; }).join('');
  const card = (m, i) => `<div role="button" tabindex="0" class="mode${s.mode === m ? ' on' : ''}${host ? '' : ' ro'}" data-mode="${m}"><span class="m-emoji">${i.emoji}</span><span class="m-txt"><b>${esc(i.title)}</b><small>${esc(i.sub)}</small></span></div>`;
  const single = s.mode !== 'tour';
  if (single) app.lastSingle = s.mode;
  const seg = `<div class="seg"><button class="${single ? '' : 'on'}${host ? '' : ' ro'}" data-mode="tour">🏆 Turnuva</button><button class="${single ? 'on' : ''}${host ? '' : ' ro'}" data-mode="${single ? s.mode : (app.lastSingle || 'lazer')}">🎮 Tek oyun</button></div>`;
  $('#modes').innerHTML = seg + (single
    ? `<div class="mode-grid">${G.TOUR.map((m) => card(m, MODE_INFO[m])).join('')}</div>`
    : `<div class="mode tour on ro"><div class="m-row"><span class="m-emoji">🏆</span><span class="m-txt"><b>Turnuva</b><small>${s.tourGames.length} oyun sırayla · puanlar toplanır · podyum${host ? ' · oyunlara dokunarak aç/kapat' : ''}</small></span></div><div class="tg-list">${tg}</div></div>`);
  $('#lobbyCount').textContent = `${s.players.length}/${G.MAX_PLAYERS} oyuncu`;
  renderTeamPanel(s, host);
  $('#modesHint').textContent = host ? (single ? 'bir oyun seç' : 'oyunları aç/kapat') : 'oda sahibi seçiyor';
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

// ---------- Takım düzeni (oda sahibi dağıtır) ----------
const TEAM_COLORS = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#3b82f6'];
const SIZE_LABEL = { 1: 'Bireysel', 2: '👥 İkili', 3: '👥👤 Üçlü' };
let teamPick = null;     // oda sahibinin seçtiği oyuncu (sonra bir takıma ya da başka oyuncuya dokunur)
function renderTeamPanel(s, host) {
  const el = $('#teamPanel');
  const relevant = s.mode === 'tour' || G.TEAM_GAMES.includes(s.mode);
  el.classList.toggle('hidden', !relevant);
  if (!relevant) return;
  const tour = s.mode === 'tour';
  const sizes = [1, 2, 3].map((n) => `<button class="tsz${s.teamSize === n ? ' on' : ''}" data-tsize="${n}"${host ? '' : ' disabled'}>${n === 1 ? (tour ? 'Bireysel' : 'Rastgele') : SIZE_LABEL[n]}</button>`).join('');
  let body = '';
  if (s.teamSize > 1 && s.teams) {
    if (teamPick && !s.players.some((p) => p.id === teamPick)) teamPick = null;
    const chip = (id) => { const p = s.players.find((x) => x.id === id) || { name: '?', look: null, color: '#888' }; return `<button class="tchip${teamPick === id ? ' pick' : ''}${id === playerId ? ' me' : ''}" data-tm="${esc(id)}"${host ? '' : ' disabled'}><img src="${portraitURL(p.look, p.color)}" alt=""><b>${esc(p.name)}</b>${p.bot ? '<i>🤖</i>' : ''}</button>`; };
    body += `<div class="tboxes">${s.teams.map((t, i) => `<div class="tbox${teamPick ? ' target' : ''}" data-tbox="${i}" style="--tc:${TEAM_COLORS[i % TEAM_COLORS.length]}"><div class="tname">Takım ${i + 1} <small>${t.length}/${s.teamSize}</small></div><div class="tmem">${t.map(chip).join('')}</div></div>`).join('')}
      ${host && teamPick ? `<div class="tbox new target" data-tbox="new"><div class="tname">＋ Yeni takım</div></div>` : ''}</div>`;
    body += host ? `<div class="thint">${teamPick ? 'Şimdi bir takıma dokun (taşı) ya da başka bir oyuncuya dokun (yer değiştir).' : 'Bir oyuncuya dokun, sonra takımına ya da başka oyuncuya dokun.'} <button class="btn small ghost" data-tshuffle>🎲 Karıştır</button></div>` : '<div class="thint">Takımları oda sahibi dağıtıyor.</div>';
    if (tour) {
      const out = G.TOUR.filter((k) => s.tourGames.includes(k) && !G.teamOk(k, s.teams));
      if (out.length) body += `<div class="thint warn">Bu düzende oynanmayacak: ${out.map((k) => G.GAMES[k].EMOJI + ' ' + esc(G.GAMES[k].TITLE)).join(', ')} <small>(takım arkadaşları birbirine zarar verir ya da takım sayısı uymaz)</small></div>`;
    }
  } else body += `<div class="thint">${tour ? 'Herkes kendi adına yarışır. Takımlı turnuva için İkili ya da Üçlü seç.' : 'Takımlar oyun başında rastgele kurulur. İstersen İkili/Üçlü seçip kendin dağıt.'}</div>`;
  const html = `<div class="sec-head"><h2>👥 Takımlar</h2><span class="muted">${tour ? 'turnuvada takımlar nasıl olsun?' : 'bu oyun takımlı: rastgele mi, sen mi dağıtırsın?'}</span></div><div class="tsizes">${sizes}</div>${body}`;
  if (html !== el.dataset.sig) { el.innerHTML = html; el.dataset.sig = html; }
}
$('#teamPanel').addEventListener('click', (e) => {
  const s = app.s;
  if (!s || s.hostId !== playerId) return;
  const sz = e.target.closest('[data-tsize]');
  if (sz) { teamPick = null; act({ action: 'teamSize', size: Number(sz.dataset.tsize) }); return; }
  if (e.target.closest('[data-tshuffle]')) { teamPick = null; act({ action: 'shuffleTeams' }); return; }
  const teams = (s.teams || []).map((t) => t.slice());
  const m = e.target.closest('[data-tm]');
  if (m) {
    const id = m.dataset.tm;
    if (!teamPick || teamPick === id) { teamPick = teamPick === id ? null : id; renderLobby(true); return; }
    // iki oyuncu: yer değiştir
    const a = teams.findIndex((t) => t.includes(teamPick)), b = teams.findIndex((t) => t.includes(id));
    if (a >= 0 && b >= 0) { teams[a][teams[a].indexOf(teamPick)] = id; teams[b][teams[b].indexOf(id)] = teamPick; }
    teamPick = null; act({ action: 'teams', teams });
    return;
  }
  const box = e.target.closest('[data-tbox]');
  if (box && teamPick) {
    const from = teams.findIndex((t) => t.includes(teamPick));
    const to = box.dataset.tbox === 'new' ? -1 : Number(box.dataset.tbox);
    if (to >= 0 && from !== to && teams[to].length >= s.teamSize) { toast('Bu takım dolu: onun yerine bir oyuncuya dokun (yer değiştirir)'); return; }
    if (from >= 0) teams[from] = teams[from].filter((x) => x !== teamPick);
    if (to === -1) teams.push([teamPick]); else if (from !== to) teams[to].push(teamPick);
    teamPick = null; act({ action: 'teams', teams: teams.filter((t) => t.length) });
  }
});

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
      html += me && me.pending
        ? `<div class="status">⏳ Yönetici onayı bekleniyor<small>Onaylanınca bir sonraki oyunda sen de oynarsın</small></div>`
        : me && !me.inGame
        ? `<div class="status">👀 İzliyorsun<small>Bir sonraki oyunda sen de oynayacaksın</small></div>`
        : `<div class="status">💀 Elendin<small>Kalanlar oynuyor (${readyN}/${alive.length} hazır)</small></div>`;
    }
    // (alttaki oyuncu şeridi kaldırıldı: oyun alanı daha büyük)
    const noReady = client.hideReady && client.hideReady();
    if (ph === 'plan' && !noReady) html += editing ? '<button class="btn ok" data-act="ready">Hazırım</button>' : '<div class="row"><button class="btn ghost" data-act="edit">Hamlemi değiştir</button><button class="btn chat-act" data-act="chat">💬 Laf at</button></div>';
    else if (ph === 'spectate') html += '<button class="btn chat-act" data-act="chat">💬 Laf at</button>';
  } else if (ph === 'reveal') {
    html += client.revealPanel ? client.revealPanel(now, chipHTML) : `<div class="status">Tur ${s.last ? s.last.round : s.round} oynanıyor…</div>`;
  }
  // Parmak panelin üstündeyken yeniden çizme: düğme değişirse dokunuş (click) kaybolur
  if (html !== panelHTML && !panelTouching) { $('#panel').innerHTML = html; panelHTML = html; }
}
let panelTouching = false, panelTouchT = 0;
function panelAct(e) {
  const c = e.target.closest('[data-cact]');
  if (c && client && client.onPanel) { client.onPanel(c.dataset.cact, c); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'ready') submitReady(false);
  else if (a === 'edit') editing = true;
  else if (a === 'chat') openQuick();
}
// Ana düğmeler dokunur dokunmaz çalışır (click, panel yenilenirse ya da ekran kenarında kaybolabiliyordu); click yedek olarak kalır
$('#panel').addEventListener('pointerdown', (e) => {
  panelTouching = true;
  clearTimeout(panelTouchT); panelTouchT = setTimeout(() => { panelTouching = false; }, 1200); // pointerup hiç gelmezse panel donmasın
  if (e.target.closest('[data-act="ready"], [data-act="edit"], [data-act="chat"]')) { e.preventDefault(); panelAct(e); }
});
const panelUp = () => { panelTouching = false; };
$('#panel').addEventListener('pointerup', panelUp);
$('#panel').addEventListener('pointercancel', panelUp);
document.addEventListener('pointerup', panelUp);
$('#panel').addEventListener('click', panelAct);
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
// "Yatay" düğmesi: gerçek zamanlı oyunlarda (Kör Koşu hariç: rehberin harita dokunuşu döndürmeyle bozulur) ekranı yan çevirir
function updateLandButton() {
  const b = $('#btnLand'); if (!b) return;
  b.classList.toggle('hidden', !client);
  b.textContent = LAND.isOn() ? '↻ Dikey' : '↻ Yatay';
}
$('#btnLand').addEventListener('click', () => { LAND.toggle(); updateLandButton(); });
window.addEventListener('lk-land', updateLandButton);
function updateViewButton() {
  updateLandButton();
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
  bubble: (id) => { const b = bubbles[id]; return b && b.until > performance.now() ? b : null; },
  debug: new URLSearchParams(location.search).has('cizim'),
  // Ekranda öğretici/uyarı açıkken oyun başlamaz (gerçek zamanlı oyunlar herkes hazır olana dek bekler)
  blocking: () => !!document.querySelector('#game .tut'),
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
  const hud = `<b>${app.api.online ? s.code : '🤖'}</b> ${mod.EMOJI}${step}${client.realtime || ['cizim', 'neciz', 'bilgi', 'keski', 'bombaci', 'sarki', 'tanir', 'basket', 'melodi', 'saniye', 'suru', 'ayar', 'telve'].includes(s.kind) ? '' : ` · Tur <b>${round}</b>`} · ${client.hud()}`;
  if (hud !== hudHTML) $('#hudInfo').innerHTML = hudHTML = hud;
  const showTimer = !client.realtime && !client.hideTimer && (ph === 'plan' || ph === 'spectate') && s.status === 'playing' && serverNow() >= s.roundStart;
  const left = showTimer ? Math.max(0, s.deadline - serverNow()) : 0;
  const tm = $('#hudTimer');
  tm.textContent = showTimer ? Math.ceil(left / 1000) + 's' : '';
  tm.classList.toggle('low', left < 6000);
  // Hazırım'a basılmadan süre biterse sunucu rastgele hamle uydurmasın: son hâlini süre dolmadan önce kendimiz gönderelim
  if (showTimer && editing && client.autoSubmitMs && ph === 'plan' && left > 0 && left < client.autoSubmitMs) {
    const k = `${s.seq}:${s.round}`;
    if (autoSentKey !== k) { autoSentKey = k; submitReady(true); }
  }
  $('#timerFill').style.width = showTimer ? `${clamp(left / Math.max(1, s.deadline - s.roundStart), 0, 1) * 100}%` : '0%';
}
requestAnimationFrame(frame);

// ---------- Dokunmatik ----------
function bindPointer(el, target) {
  LAND.fixRect(el);
  el.addEventListener('pointerdown', (ev) => {
    audio();
    if (!client) return;
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    client.pointer('down', LAND.localPt(ev), target);
  });
  el.addEventListener('pointermove', (ev) => { if (client && ev.buttons) client.pointer('move', LAND.localPt(ev), target); });
  el.addEventListener('pointerup', (ev) => client && client.pointer('up', LAND.localPt(ev), target));
  el.addEventListener('pointercancel', (ev) => client && client.pointer('cancel', LAND.localPt(ev), target));
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
