// 🖍️ Ne Çizdim? istemcisi: sırayla biri çizer (canlı), diğerleri alttan tahmin yazar
import * as NZ from '../games/neciz.js';
import { drawDoodle, artDuration } from '../games/doodles.js';
import { createPainter, drawStrokes } from './paint.js';
import { $, esc, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

export function createNeciz(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'nz';
  ui.innerHTML = '<div class="nz-top" id="nzTop"></div><div class="nz-mid hidden" id="nzMid"></div><div class="nz-bot" id="nzBot"></div>';
  ctx.stage.appendChild(ui);
  const st = () => ctx.state();
  let midKey = '', botKey = '', topHTML = '', feedKey = '', anim = null, area = null, lastSec = -1;
  // çizen: kendi çizgileri (painter); izleyen: sunucudan gelen canlı çizim
  let dirty = Infinity, pushing = false, turnKey = '';
  let live = { gen: -1, s: [] };
  let seenFeed = new Set(), doodleCache = null;
  // Boya motoru: her değişiklikte (yeni çizgi, devam eden çizgi, geri al / yinele / temizle / kova) değişen ilk sırayı işaretle
  const mark = (i) => { dirty = Math.min(dirty, i); };
  const painter = createPainter(ctx, { onChange: mark });
  const myArt = () => (painter.cur ? painter.strokes.concat([painter.cur]) : painter.strokes);

  const face = (id, cls = 'face') => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="${cls}${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };
  const me = () => playerId;
  const isDrawer = (s) => s.g && s.g.drawer === playerId;

  // Yeni tur: çizim temizlenir
  function onTurn(s) {
    const k = `${s.seq}:${s.round}`;
    if (k === turnKey) return;
    turnKey = k;
    painter.reset(); dirty = Infinity; live = { gen: -1, s: [] }; seenFeed = new Set(); doodleCache = null;
    midKey = botKey = feedKey = '';
  }

  // ---------- Çizeni sunucuya canlı aktar ----------
  async function pushLoop() {
    if (pushing) return;
    const s = st();
    if (!s || s.status !== 'playing' || !isDrawer(s) || s.g.phase !== 'draw' || dirty === Infinity) return;
    pushing = true;
    const from = dirty;
    dirty = Infinity;
    // sunucu tek seferde en çok 600 çizgi kabul eder (painter sınırı 600 + devam eden çizgi)
    const list = myArt().slice(0, 600);
    const pack = (x) => { const o = { c: x.c, w: x.w, p: x.p }; if (x.f) o.f = 1; return o; };
    try { await ctx.raw({ action: 'live', seq: s.seq, round: s.round, from, strokes: list.slice(from).map(pack) }); }
    catch (e) { if (!/bitti|çizen/.test(e.message)) dirty = Math.min(dirty, from); }
    pushing = false;
  }
  const pushTimer = setInterval(pushLoop, 350);

  // ---------- Arayüz parçaları ----------
  function buildMid(s) {
    const G = s.g, mid = $('#nzMid');
    let k = '', html = '';
    if (anim) {
      const e = anim.e;
      k = `rev:${e.turnI}`;
      const rows = Object.entries(e.gains).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
      html = `<div class="nz-card rev"><small>Kelime</small><b class="nz-word">${esc(e.word.toLocaleUpperCase('tr'))}</b>
        ${e.all ? '<div class="nz-all">🎉 Herkes bildi! Çizene +' + NZ.ALL_BONUS + ' bonus</div>' : !e.order.length ? '<div class="nz-all no">😶 Kimse bilemedi</div>' : ''}
        <div class="nz-gains">${rows.map(([id, p]) => `<span>${face(id)}<em>${esc(id === playerId ? 'Sen' : pName(id))}${id === e.drawer ? ' ✏️' : ''}</em><b>+${p}</b></span>`).join('') || '<small>Bu turda puan yok</small>'}</div></div>`;
    } else if (G.phase === 'choose') {
      if (isDrawer(s) && G.options) {
        k = `ch:${G.turnI}`;
        html = `<div class="nz-card"><small>Sıra sende! Ne çizeceksin?</small><div class="nz-opts">${G.options.map((w, i) => `<button class="btn" data-pick="${i}">${esc(w)}</button>`).join('')}</div><small class="nz-cd" id="nzCd"></small></div>`;
      } else {
        k = `wait:${G.turnI}`;
        html = `<div class="nz-card">${face(G.drawer, 'face big')}<b>${esc(pName(G.drawer))}</b><small>kelime seçiyor…</small></div>`;
      }
    }
    if (k === midKey) return;
    midKey = k;
    mid.classList.toggle('hidden', !html);
    mid.innerHTML = html;
    mid.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      ctx.call({ action: 'gact', seq: s.seq, pick: Number(b.dataset.pick) }).then(() => sfx('pop')).catch((e) => ctx.toast(e.message));
    }));
  }

  function buildBot(s) {
    const G = s.g, bot = $('#nzBot');
    const role = anim ? 'none' : G.phase !== 'draw' ? 'none' : isDrawer(s) ? 'draw' : !(playerId in G.alive) ? 'watch' : G.myHit ? 'hit' : 'guess';
    const k = `${G.turnI}:${role}`;
    if (k !== botKey) {
      botKey = k; feedKey = '';
      painter.unbind();
      if (role === 'draw') {
        // Kulaktan Kulağa ile aynı araç çubuğu: kalem düğmesi + palet + geri al / yinele; solda kova / şekil / kalınlık paneli
        bot.innerHTML = `${painter.toolbarHTML('nz-tools')}<div class="nz-feed" id="nzFeed"></div>`;
        painter.bind(bot);
      } else if (role === 'guess') {
        bot.innerHTML = `<div class="nz-feed" id="nzFeed"></div>
          <form class="nz-in" id="nzForm" autocomplete="off"><input id="nzInput" maxlength="40" placeholder="Tahminini yaz…" enterkeyhint="send" autocapitalize="off" spellcheck="false"><button class="btn ok small">➤</button></form>`;
        $('#nzForm').onsubmit = (e) => {
          e.preventDefault();
          const inp = $('#nzInput'), v = inp.value.trim();
          if (!v) return;
          inp.value = '';
          ctx.call({ action: 'gact', seq: st().seq, guess: v }).catch((er) => ctx.toast(er.message));
        };
      } else if (role === 'hit') {
        bot.innerHTML = `<div class="nz-feed" id="nzFeed"></div><div class="nz-hit">✅ Bildin! <b>${esc(G.word || '')}</b> · diğerlerini bekle</div>`;
      } else if (role === 'watch') {
        bot.innerHTML = '<div class="nz-feed" id="nzFeed"></div><div class="nz-hit">👀 İzliyorsun</div>';
      } else bot.innerHTML = '';
    }
    // tahmin akışı
    const fk = JSON.stringify(G.feed.map((f) => f.n));
    if (fk !== feedKey && $('#nzFeed')) {
      feedKey = fk;
      $('#nzFeed').innerHTML = G.feed.slice(-6).map((f) => f.ok
        ? `<div class="ok">${face(f.p)}<b>${esc(f.p === playerId ? 'Sen' : pName(f.p))}</b> bildi! 🎉</div>`
        : `<div class="${f.close ? 'close' : ''}">${face(f.p)}<b>${esc(f.p === playerId ? 'Sen' : pName(f.p))}:</b> ${esc(f.txt || '…')}${f.close ? ' <em>🤏 çok yakın!</em>' : ''}</div>`).join('');
      for (const f of G.feed) {
        if (seenFeed.has(f.n)) continue;
        seenFeed.add(f.n);
        if (f.ok) sfx(f.p === playerId ? 'fanfare' : 'score');
        else if (f.close && f.p === playerId) { sfx('item'); ctx.toast('🤏 Çok yakın!'); }
      }
    }
  }

  function updateTop(s, now) {
    const G = s.g, sn = ctx.serverNow();
    let left = 0, word = '';
    if (anim) word = `<span class="nz-turn">Tur ${anim.e.turnI + 1}/${G.T}</span>`;
    else if (G.phase === 'choose') { left = Math.max(0, G.chooseEnd - sn); word = `<span class="nz-turn">Tur ${G.turnI + 1}/${G.T}</span><b>✏️ ${esc(pName(G.drawer))} seçiyor</b>`; }
    else {
      left = Math.max(0, G.drawEnd - sn);
      const shown = G.word ? esc(G.word.toLocaleUpperCase('tr')) : esc((G.mask || '').toLocaleUpperCase('tr')).split('').map((c) => (c === ' ' ? '&nbsp;&nbsp;' : c)).join(' ');
      const n = (G.word || G.mask || '').replace(/ /g, '').length;
      word = `<span class="nz-turn">${face(G.drawer)}</span><b class="${G.word ? '' : 'mask'}">${shown}</b><small>${n}</small>`;
    }
    const sec = Math.ceil(left / 1000);
    const html = `${word}<span class="nz-time${sec <= 10 && left ? ' low' : ''}">${left ? sec : ''}</span>`;
    if (html !== topHTML) { $('#nzTop').innerHTML = html; topHTML = html; }
    if (sec !== lastSec) { lastSec = sec; if (left && sec <= 5 && sec > 0) sfx('tick'); }
    const cd = $('#nzCd'); if (cd) cd.textContent = `${sec} sn içinde seçmezsen ilki seçilir`;
  }

  function drawArea() {
    const { W, H, DPR } = ctx.size();
    const top = ($('#nzTop').offsetHeight + 10) * DPR, bottom = ($('#nzBot').offsetHeight + 6) * DPR;
    const size = Math.max(60, Math.min(W - 12 * DPR, H - top - bottom));
    return { x: (W - size) / 2, y: top + Math.max(0, (H - top - bottom - size) / 2), size };
  }

  // Şu an kâğıtta görünen çizim
  function currentArt(s, now) {
    const G = s.g;
    const doodle = anim ? anim.e.doodle : G.doodle;
    if (doodle) {
      if (!doodleCache || doodleCache.key !== doodle.doodle + doodle.seed) { const sk = drawDoodle(doodle.doodle, doodle.seed); doodleCache = { key: doodle.doodle + doodle.seed, s: sk, dur: artDuration(sk) }; }
      const vt = anim ? Infinity : (ctx.serverNow() - doodle.at) * doodleCache.dur / NZ.BOT_DRAW_MS;
      return { s: doodleCache.s, vt };
    }
    if (isDrawer(s) || (anim && anim.e.drawer === playerId)) return { s: myArt(), vt: Infinity };
    return { s: live.s, vt: Infinity };
  }

  const client = {
    kind: 'neciz',
    supports3D: false,
    hideTimer: true,
    onState(s) {
      if (s.status !== 'playing' || !s.g) return;
      onTurn(s);
      buildMid(s);
      buildBot(s);
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      midKey = botKey = '';
      const s = st();
      if (s && s.g) { buildMid(s); buildBot(s); }
      sfx(e.gains[playerId] ? 'finish' : 'reveal');
    },
    revealTotal: (e) => e.dur || NZ.REVEAL_MS,
    animating: () => !!anim,
    // Canlı çizim yoklaması (game-core state → live)
    pollExtra() {
      const s = st();
      if (!s || s.status !== 'playing' || !s.g || s.g.phase !== 'draw' || isDrawer(s) || s.g.botDrawer) return null;
      return { live: { gen: live.gen, since: Math.max(0, live.s.length - 1) } };
    },
    onLive(l) {
      const s = st();
      if (!s || l.seq !== s.seq || l.round !== s.round) return;
      if (l.gen !== live.gen) live = { gen: l.gen, s: l.s };
      else live.s = live.s.slice(0, l.from).concat(l.s);
    },
    wantsFastPoll() { const s = st(); return !!(s && s.status === 'playing' && s.g && s.g.phase === 'draw' && !isDrawer(s)); },
    frame(now, dt, ph) {
      const s = st();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || NZ.REVEAL_MS)) { anim = null; midKey = botKey = ''; if (s.g) { buildMid(s); buildBot(s); } }
      g.fillStyle = '#1b2240'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.03)';
      for (let i = 0; i < W; i += 28 * DPR) g.fillRect(i, 0, 1, H);
      if (!s.g) return '';
      updateTop(s, now);
      area = drawArea();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(area.x + 4, area.y + 6, area.size, area.size);
      g.fillStyle = '#fffdf7'; g.fillRect(area.x, area.y, area.size, area.size);
      if (s.g.phase === 'draw' || anim) { const a = currentArt(s, now); drawStrokes(g, a.s, area.x, area.y, area.size, a.vt); }
      if (!anim && s.g.phase === 'draw' && !isDrawer(s) && !s.g.botDrawer && !live.s.length) {
        g.fillStyle = '#9ca3af'; g.font = `${14 * DPR}px system-ui`; g.textAlign = 'center'; g.fillText(`${pName(s.g.drawer)} çiziyor…`, W / 2, area.y + area.size / 2);
      }
      if (anim) return '';
      if (s.g.phase === 'draw' && isDrawer(s) && ctx.serverNow() - s.g.drawStart < 3000) return '✏️ Çiz! Kelimeyi yazmak yok 😉';
      return '';
    },
    hint: () => null,
    hideReady: () => true,
    panel: () => '',
    // Alt panel: puan tablosu (✏️ çizen, ✓ bilenler)
    ownPanel(chipHTML) {
      const s = st();
      if (!s.g) return '';
      const sc = anim ? anim.e.scores : s.g.scores;
      const ids = s.g.order.slice().sort((a, b) => (sc[b] || 0) - (sc[a] || 0));
      return `<div class="chips">${ids.map((id) => chipHTML(id, s.g.hits.includes(id) ? 'ready' : '', ` <b>${sc[id] || 0}</b>${id === s.g.drawer ? ' ✏️' : s.g.hits.includes(id) ? ' ✓' : ''}`)).join('')}</div>`;
    },
    action: () => null,
    pointer(type, ev) {
      const s = st();
      if (!s || !area || !isDrawer(s) || s.g.phase !== 'draw' || anim || ctx.serverNow() > s.g.drawEnd) return;
      painter.pointer(type, ev, area, true);
    },
    hud() { const s = st(); return s.g ? `Puan <b>${s.g.scores[playerId] || 0}</b>` : ''; },
    dispose() { clearInterval(pushTimer); painter.dispose(); ui.remove(); },
  };
  return client;
}
