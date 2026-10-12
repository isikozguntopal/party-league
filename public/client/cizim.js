// 🎨 Kulaktan Kulağa istemcisi: yaz / çiz / tahmin et / albüm (sohbet akışı + oy) / sonuç tablosu
import { PROMPTS, drawDoodle, withTiming, artDuration, replayMs } from '../games/doodles.js';
import { $, esc, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';
import { createPainter, drawStrokes } from './paint.js';

// Çizim motoru paint.js'e taşındı; eski içe aktarma yolları çalışmaya devam etsin
export { drawStrokes, traceRings, simplifyRing, ringsToPoly, floodMask } from './paint.js';

export function createCizim(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'cz';
  ctx.stage.appendChild(ui);
  let mode = '', key = '', autoSent = '', artCache = new Map(), area = null;
  let lastAlbum = -1, albumT0 = 0;
  // çizim motoru (araçlar, geri al / yinele, kova, şekiller) — araç çubuğu düğmeleri ui üzerinde dinlenir
  const painter = createPainter(ctx);
  painter.bind(ui);
  // albüm akışı
  let feedChain = -1, feedN = -1, cards = new Map(), gcards = [];

  const st = () => ctx.state();
  async function getArt(art) {
    if (!art) return [];
    if (art.doodle) return drawDoodle(art.doodle, art.seed);
    if (artCache.has(art.key)) return artCache.get(art.key);
    artCache.set(art.key, null);
    try { const r = await ctx.raw({ action: 'art', key: art.key }); artCache.set(art.key, withTiming(r.art || [])); } catch { artCache.delete(art.key); }
    return artCache.get(art.key);
  }
  const artNow = (art) => (!art ? [] : art.doodle ? drawDoodle(art.doodle, art.seed) : artCache.get(art.key) || (getArt(art), null));
  const face = (id) => { const p = pById(id) || { look: null, color: '#888' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };
  const nameOf = (id) => (id === playerId ? 'Sen' : pName(id));

  // ---------- Arayüz (fazına göre bir kez kurulur; her karede yeniden çizilmez) ----------
  function build(s) {
    const G = s.g;
    const newMode = G.phase === 'album' ? 'album' : G.phase === 'final' ? 'final' : G.type;
    const newKey = newMode === 'album' || newMode === 'final' ? `${s.seq}:${newMode}` : `${s.seq}:${s.round}:${newMode}`;
    if (newKey === key) return;
    key = newKey; mode = newMode; autoSent = '';
    const total = G.S;
    if (mode === 'write') {
      ui.onclick = null;
      ui.innerHTML = `<div class="cz-card"><div class="cz-step">Adım 1/${total}</div><h3>✍️ Bir cümle yaz</h3>
        <p>Komik, garip, ne istersen! Bir sonraki kişi bunu çizecek.</p>
        <div class="cz-row"><textarea id="czText" maxlength="80" rows="2" placeholder="Ör: Uçan bir kedi pizza yiyor"></textarea><button class="btn small" id="czDice">🎲</button></div></div>`;
      $('#czDice').onclick = () => { $('#czText').value = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; };
    } else if (mode === 'draw') {
      ui.onclick = null;
      ui.innerHTML = `<div class="cz-top"><span class="cz-step">Adım ${G.step + 1}/${total} · Çiz:</span><b>${esc(G.task ? G.task.text : '?')}</b></div>
        ${painter.toolbarHTML()}`;
      painter.reset();
    } else if (mode === 'guess') {
      ui.onclick = null;
      ui.innerHTML = `<div class="cz-top"><span class="cz-step">Adım ${G.step + 1}/${total}</span><b>🤔 Bu çizim ne?</b></div>
        <div class="cz-bottom"><textarea id="czText" maxlength="80" rows="2" placeholder="Bence bu…"></textarea></div>`;
      if (G.task && G.task.art) getArt(G.task.art);
    } else if (mode === 'album') {
      feedChain = -1; feedN = -1; cards = new Map(); lastAlbum = -1;
      ui.innerHTML = `<div class="cz-top album"><b id="czAlbumHead"></b><span id="czAlbumStep" class="cz-step"></span></div>
        <div class="cz-feed" id="czFeed"></div>
        <div class="cz-album-bar"><span class="cz-info" id="czAlbumInfo">Her çizime <b>➕ / ➖</b> ile oy vermek zorunlu · ressamlar sonda açıklanır</span>
          ${s.hostId === playerId ? '<button class="btn small primary" id="czNext" title="Sonraki">▶</button>' : ''}</div>`;
      ui.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.vote !== undefined) {
          const n = +b.dataset.vote, v = +b.dataset.v;
          ctx.call({ action: 'gact', seq: st().seq, vote: n, v }).then(() => sfx(v > 0 ? 'pop' : 'bump')).catch((er) => ctx.toast(er.message));
        } else if (b.id === 'czNext') ctx.call({ action: 'gact', seq: st().seq, next: true }).catch(() => {});
      };
      syncAlbum(s);
    } else if (mode === 'final') {
      gcards = [];
      sfx('fanfare');
      const medal = ['🥇', '🥈', '🥉'];
      ui.innerHTML = `<div class="cz-final" id="czFinal">
        <h3>🏁 Sonuçlar</h3>
        <div class="cz-board">${(G.board || []).map((r, i) => `<div class="cz-brow${r.id === playerId ? ' me' : ''}"><span class="cz-rank">${medal[i] || i + 1}</span>${face(r.id)}<span class="cz-bname">${esc(nameOf(r.id))}<small>🎨 çizim oyları ${r.votes >= 0 ? '+' : ''}${r.votes} · 🎯 tahmin yakınlığı +${r.sim}</small></span><b>${r.total}</b></div>`).join('')}</div>
        <h4>🎭 Ressamlar açıklanıyor</h4>
        <div class="cz-gallery">${(G.gallery || []).map((it, i) => `<div class="cz-gcard" data-i="${i}"><canvas></canvas><div class="cz-gby">${face(it.by)}<span><b>${esc(nameOf(it.by))}</b> çizdi<small>“${esc(it.prompt)}”</small></span><em>${it.score > 0 ? '+' : ''}${it.score}</em></div></div>`).join('')}</div>
      </div>
      <div class="cz-album-bar"><span class="cz-info">Puan = çizim oyları + tahmin yakınlığı</span>${s.hostId === playerId ? '<button class="btn small primary" id="czNext" title="Bitir">▶</button>' : ''}</div>`;
      ui.onclick = (e) => { const b = e.target.closest('button'); if (b && b.id === 'czNext') ctx.call({ action: 'gact', seq: st().seq, next: true }).catch(() => {}); };
      const { DPR } = ctx.size();
      ui.querySelectorAll('.cz-gcard').forEach((el, i) => {
        const cv = el.querySelector('canvas'), side = 120;
        cv.width = cv.height = Math.round(side * DPR); cv.style.width = cv.style.height = `${side}px`;
        gcards.push({ art: G.gallery[i].art, cv, done: false });
      });
    } else { ui.onclick = null; ui.innerHTML = ''; }
    const ta = $('#czText');
    if (ta) { const prev = s.myAction && s.myAction.text; if (prev) ta.value = prev; }
  }
  const albumCur = () => { const G = st().g; return G && G.shown ? G.shown[G.ai] : null; };

  // ---------- Albüm akışı: zincir sohbet gibi açılır ----------
  function paperCanvas() {
    const { DPR } = ctx.size();
    const side = Math.max(120, Math.min(ui.clientWidth - 56, 340));
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(side * DPR); cv.style.width = cv.style.height = `${side}px`;
    return cv;
  }
  function renderCard(card, vt) {
    const c = card.cv.getContext('2d');
    c.fillStyle = '#fffdf7'; c.fillRect(0, 0, card.cv.width, card.cv.height);
    drawStrokes(c, card.art, 0, 0, card.cv.width, vt);
  }
  function voteBoxHTML(it) {
    if (it.by === playerId) return `<div class="cz-vote-box mine"><span>✏️ Senin çizimin — kendine oy veremezsin</span></div>`;
    return `<div class="cz-vote-box"><span class="cz-vote-lbl">Bu çizime puan ver</span>
      <span class="cz-vote"><button class="vote-btn minus" data-vote="${it.n}" data-v="-1">➖</button><b class="cz-score">0</b><button class="vote-btn plus" data-vote="${it.n}" data-v="1">➕</button></span></div>`;
  }
  function appendItem(it, G) {
    const feed = $('#czFeed');
    const el = document.createElement('div');
    if (it.type === 'draw') {
      el.className = 'cz-art'; el.dataset.n = it.n;
      el.innerHTML = `<div class="cz-art-head"><span class="face anon">🎨</span><span><b>Gizli ressam</b> çizdi</span><em class="cz-speed2 hidden"></em></div><div class="cz-paper"></div>${voteBoxHTML(it)}`;
      const cv = paperCanvas();
      el.querySelector('.cz-paper').appendChild(cv);
      cards.set(it.n, { n: it.n, cv, art: null, artRef: it.art, dur: it.dur, done: false, speed: el.querySelector('.cz-speed2') });
      getArt(it.art);
    } else {
      const orig = it.k === 0;
      el.className = `cz-msg${orig ? ' orig' : ''}${it.by === playerId ? ' me' : ''}`;
      let sim = '';
      if (!orig) sim = it.self ? '<span class="cz-sim">cümlenin sahibi · puan yok</span>' : `<span class="cz-sim${it.pts ? ' hit' : ''}">🎯 %${Math.round((it.sim || 0) * 100)} yakın${it.pts ? ` · +${it.pts} puan` : ''}</span>`;
      el.innerHTML = `${face(it.by)}<div class="cz-bub"><small>${esc(nameOf(it.by))} · ${orig ? '✍️ yazdı' : '🤔 tahmin etti'}</small><p>“${esc(it.text || '')}”</p>${sim}</div>`;
    }
    feed.appendChild(el);
    requestAnimationFrame(() => feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }));
  }
  function syncAlbum(s) {
    const G = s.g;
    if (!G.shown || !$('#czFeed')) return;
    for (let n = feedN + 1; n <= Math.min(G.ai, G.shown.length - 1); n++) {
      const it = G.shown[n];
      if (it.c !== feedChain) { $('#czFeed').innerHTML = ''; feedChain = it.c; cards = new Map(); }
      appendItem(it, G);
      feedN = n;
    }
    const c = G.shown[G.ai];
    if (c) {
      $('#czAlbumHead').textContent = `📒 ${nameOf(G.owners[c.c])} · albüm`;
      $('#czAlbumStep').textContent = `Albüm ${c.c + 1}/${G.chains} · adım ${c.k + 1}/${G.S}`;
    }
    // oy durumları
    for (const it of G.shown) {
      if (it.type !== 'draw') continue;
      const el = $('#czFeed').querySelector(`.cz-art[data-n="${it.n}"]`); if (!el) continue;
      const sc = el.querySelector('.cz-score'); if (sc) sc.textContent = it.score > 0 ? `+${it.score}` : String(it.score || 0);
      const pl = el.querySelector('.plus'), mi = el.querySelector('.minus');
      if (pl) pl.classList.toggle('on', it.myVote > 0);
      if (mi) mi.classList.toggle('on', it.myVote < 0);
      // Oy zorunlu: şu anki çizim için oy vermesi gereken oyuncunun kutusu vurgulanır
      const box = el.querySelector('.cz-vote-box:not(.mine)');
      if (box) {
        const need = !!G.mustVote && it.n === G.ai;
        box.classList.toggle('need', need);
        const lbl = box.querySelector('.cz-vote-lbl');
        if (lbl) lbl.textContent = need ? 'Oy ver, yoksa geçilmez!' : 'Bu çizime puan ver';
      }
    }
    const info = $('#czAlbumInfo');
    if (info) {
      const cur = G.shown[G.ai], w = G.waiting || 0;
      info.innerHTML = cur && cur.type === 'draw' && w > 0
        ? (G.mustVote ? '👆 <b>Oy ver</b> — herkes oy verince devam' : `⏳ <b>${w}</b> kişinin oyu bekleniyor`)
        : 'Her çizime <b>➕ / ➖</b> ile oy vermek zorunlu · ressamlar sonda açıklanır';
    }
  }

  function drawArea() {
    const { W, H, DPR } = ctx.size();
    const topEl = ui.querySelector('.cz-top'), botEl = ui.querySelector('.cz-tools, .cz-bottom');
    const top = ((topEl ? topEl.offsetHeight + 8 : 0) + 8) * DPR, bottom = (botEl ? botEl.offsetHeight + 6 : 0) * DPR;
    const size = Math.max(60, Math.min(W - 16 * DPR, H - top - bottom - 6 * DPR));
    return { x: (W - size) / 2, y: top + Math.max(0, (H - top - bottom - size) / 2), size };
  }
  function paper(a) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(a.x + 4, a.y + 6, a.size, a.size);
    g.fillStyle = '#fffdf7'; g.fillRect(a.x, a.y, a.size, a.size);
    g.restore();
  }

  const client = {
    kind: 'cizim',
    supports3D: false,
    onState(s) {
      if (s.status === 'playing' && s.g) { build(s); if (mode === 'album') syncAlbum(s); }
      else if (s.status !== 'playing') { ui.innerHTML = ''; ui.onclick = null; key = ''; mode = ''; }
    },
    onEntry() {},
    revealTotal: () => 0,
    animating: () => false,
    frame(now, dt, ph) {
      const s = st();
      const { W, H, DPR } = ctx.size();
      g.fillStyle = '#1b2240'; g.fillRect(0, 0, W, H);
      // kâğıt deseni arka planı
      g.fillStyle = 'rgba(255,255,255,.03)';
      for (let i = 0; i < W; i += 28 * DPR) g.fillRect(i, 0, 1, H);
      if (!s.g) return '';
      ui.classList.toggle('locked', !ctx.editing() && mode !== 'album' && mode !== 'final');
      if (mode === 'draw' || mode === 'guess') area = drawArea();
      if (mode === 'draw') {
        paper(area);
        drawStrokes(g, painter.cur ? [...painter.strokes, painter.cur] : painter.strokes, area.x, area.y, area.size);
        if (!ctx.editing()) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(area.x, area.y, area.size, area.size); }
      } else if (mode === 'guess') {
        paper(area);
        const art = s.g.task && artNow(s.g.task.art);
        if (art) drawStrokes(g, art, area.x, area.y, area.size);
        else { g.fillStyle = '#888'; g.font = `${16 * DPR}px system-ui`; g.textAlign = 'center'; g.fillText('Çizim yükleniyor…', W / 2, area.y + area.size / 2); }
      } else if (mode === 'album') {
        const c = albumCur();
        if (c && c.n !== lastAlbum) { lastAlbum = c.n; albumT0 = now; sfx(c.k === 0 ? 'reveal' : 'pop'); }
        for (const card of cards.values()) {
          if (!card.art) { card.art = artNow(card.artRef); if (!card.art) continue; }
          if (c && card.n === c.n) {
            // çizimin yapılışı hızlandırılmış oynatılır: önce boş kâğıt, sonra çizgiler sırayla
            const dur = card.dur || artDuration(card.art);
            const rm = replayMs(dur);
            const vt = Math.max(0, (now - albumT0 - 400) / rm) * dur;
            const replaying = vt < dur;
            card.speed.classList.toggle('hidden', !replaying);
            if (replaying) { card.speed.textContent = `⏩ ${Math.max(2, Math.round(dur / rm))}x`; renderCard(card, vt); card.done = false; }
            else if (!card.done) { renderCard(card, Infinity); card.done = true; }
          } else if (!card.done) { renderCard(card, Infinity); card.done = true; card.speed.classList.add('hidden'); }
        }
      } else if (mode === 'final') {
        for (const gc of gcards) {
          if (gc.done) continue;
          const art = artNow(gc.art); if (!art) continue;
          const c = gc.cv.getContext('2d');
          c.fillStyle = '#fffdf7'; c.fillRect(0, 0, gc.cv.width, gc.cv.height);
          drawStrokes(c, art, 0, 0, gc.cv.width);
          gc.done = true;
        }
      }
      // süre bitmek üzereyken otomatik gönder
      if (ph === 'plan' && ctx.editing() && mode !== 'album' && mode !== 'final' && s.status === 'playing' && autoSent !== key && s.deadline - ctx.serverNow() < 1800) {
        autoSent = key;
        ctx.submit(true);
      }
      if (mode === 'album') return '📒 Albümler açılıyor!';
      if (mode === 'final') return '🏁 Puan tablosu';
      if (ph === 'plan') return ctx.editing() ? (mode === 'write' ? '✍️ Yaz' : mode === 'draw' ? '🎨 Çiz' : '🤔 Tahmin et') : '⏳ Diğerleri bekleniyor…';
      return '';
    },
    hint(editing) { return mode === 'album' || mode === 'final' ? null : editing ? (mode === 'draw' ? 'Parmağınla çiz • ✏️ ile araçlar (kova, şekil, silgi)' : 'Yaz ve Hazırım\'a bas') : null; },
    panel() { return ''; },
    hideReady: () => mode === 'album' || mode === 'final',
    action(auto) {
      if (mode === 'draw') return { strokes: painter.strokes };
      const ta = $('#czText');
      const text = ta ? ta.value.trim() : '';
      if (!text) { if (auto) return { text: mode === 'write' ? PROMPTS[Math.floor(Math.random() * PROMPTS.length)] : '🤷' }; ctx.toast('Bir şey yaz'); return null; }
      return { text };
    },
    pointer(type, ev) { painter.pointer(type, ev, area, mode === 'draw' && ctx.editing()); },
    hud() {
      const s = st(); if (!s.g) return '';
      if (s.g.phase === 'final') return '🏁 <b>Sonuç</b>';
      if (s.g.phase === 'album') { const c = albumCur(); return `Albüm <b>${c ? c.c + 1 : 1}/${s.g.chains}</b>`; }
      return `Adım <b>${s.g.step + 1}/${s.g.S}</b>`;
    },
    dispose() { painter.dispose(); ui.remove(); },
  };
  return client;
}
