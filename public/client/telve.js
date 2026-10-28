// ☕ Telve istemcisi: Falcı kart + yorum, herkes kart atar, kartlar karışık açılır, Falcı'nın kartı bulunur.
import * as T from '../games/telve.js';
import { cardSrc } from '../games/telve-kartlar.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

// Kart: gerçek resim (public/telve/NNN.jpg)
const cardHTML = (id, extra = '') => `<div class="tv-card ${extra}" data-c="${id}"><img src="${cardSrc(id)}" alt="" draggable="false" loading="lazy"></div>`;

export function createTelve(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'tv';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, sel = null, clueText = '', submitted = false, lastTick = 0;
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));
  const face = (id) => { const p = pById(id) || { look: null, color: '#888' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };
  const handHTML = (hand, disabled) => `<div class="tv-hand">${hand.map((c) => cardHTML(c, `${sel === c ? 'sel' : ''}${disabled ? ' dis' : ''}`)).join('')}</div>`;
  const wire = (onPick) => ui.querySelectorAll('.tv-card:not(.dis)').forEach((el) => el.addEventListener('click', () => { if (submitted || ctx.phase() !== 'plan' || anim) return; sel = Number(el.dataset.c); sfx('tick'); ui.querySelectorAll('.tv-card').forEach((x) => x.classList.toggle('sel', Number(x.dataset.c) === sel)); if (onPick) onPick(); }));

  function build(s) {
    const G = s.g, teller = G.teller === playerId;
    submitted = !!s.myAction; sel = s.myAction && s.myAction.card !== undefined ? s.myAction.card : null; clueText = (s.myAction && s.myAction.clue) || '';
    const head = (t, sub) => `<div class="tv-top"><span class="tv-n">Fal ${G.turn}/${G.turns} · Falcı: ${esc(nm(G.teller))}</span><b>${t}</b><small>${sub}</small></div>`;
    if (G.phase === 'tell') {
      if (!teller) { ui.innerHTML = head('☕ Falcı fincanına bakıyor…', 'Falcı bir kart seçip tek satırlık bir yorum yazacak.') + `<div class="tv-wait">${face(G.teller)}</div>`; return; }
      ui.innerHTML = head('Bir kart seç, yorumunu yaz', 'Çok açık da olmasın, çok kapalı da: kimi bilen olsun, kimi şaşırsın!') + handHTML(G.hand, submitted)
        + `<div class="tv-send"><input id="tvClue" maxlength="70" placeholder="Tek satırlık yorumun" value="${esc(clueText)}"${submitted ? ' disabled' : ''} autocomplete="off"><button class="btn ok" id="tvSend"${submitted ? ' disabled' : ''}>${submitted ? 'Gönderildi ✓' : 'Falı yorumla'}</button></div>`;
      wire();
      $('#tvSend').onclick = () => { const v = $('#tvClue').value.trim(); if (sel === null) { ctx.toast('Önce bir kart seç'); return; } if (v.length < 2) { ctx.toast('Yorumun çok kısa'); return; } clueText = v; submitted = true; sfx('pop'); ctx.submit(); $('#tvSend').disabled = true; $('#tvSend').textContent = 'Gönderildi ✓'; ui.querySelectorAll('.tv-card').forEach((x) => x.classList.add('dis')); };
      return;
    }
    if (G.phase === 'pick') {
      if (teller) { ui.innerHTML = head(`“${esc(G.clue)}”`, 'Kartın masada gizli. Diğerleri yoruma uyan kart atıyor…') + `<div class="tv-hand one">${cardHTML(G.myCard, 'mine')}</div>`; submitted = true; return; }
      ui.innerHTML = head(`“${esc(G.clue)}”`, 'Bu yoruma en çok uyan kartı seç (Falcı\'nın kartıyla karışacak).') + handHTML(G.hand, submitted)
        + `<div class="tv-send"><button class="btn ok" id="tvSend"${submitted ? ' disabled' : ''}>${submitted ? 'Kart atıldı ✓' : 'Bu kartı at'}</button></div>`;
      wire();
      $('#tvSend').onclick = () => { if (sel === null) { ctx.toast('Önce bir kart seç'); return; } submitted = true; sfx('pop'); ctx.submit(); $('#tvSend').disabled = true; $('#tvSend').textContent = 'Kart atıldı ✓'; ui.querySelectorAll('.tv-card').forEach((x) => x.classList.add('dis')); };
      return;
    }
    // oy
    const tableHTML = `<div class="tv-table">${G.table.map((x) => cardHTML(x.card, `${x.mine ? 'mine dis' : ''}${sel === x.card ? ' sel' : ''}${teller ? ' dis' : ''}`)).join('')}</div>`;
    ui.innerHTML = head(`“${esc(G.clue)}”`, teller ? 'Herkes senin kartını bulmaya çalışıyor…' : 'Hangisi Falcı\'nın kartı? Kendi kartına oy veremezsin.') + tableHTML
      + (teller ? '' : `<div class="tv-send"><button class="btn ok" id="tvSend"${submitted ? ' disabled' : ''}>${submitted ? 'Oy verildi ✓' : 'Bu kart!'}</button></div>`);
    if (!teller) { wire(); $('#tvSend').onclick = () => { if (sel === null) { ctx.toast('Önce bir kart seç'); return; } submitted = true; sfx('pop'); ctx.submit(); $('#tvSend').disabled = true; $('#tvSend').textContent = 'Oy verildi ✓'; ui.querySelectorAll('.tv-card').forEach((x) => x.classList.add('dis')); }; }
  }
  function revealHTML(e) {
    const ownerOf = {}; for (const x of e.table) ownerOf[x.card] = x.owner;
    const voters = (card) => Object.entries(e.votes).filter(([, c]) => c === card).map(([id]) => id);
    return `<div class="tv-top"><span class="tv-n">Kartlar açıldı</span><b>“${esc(e.clue)}”</b><small>${e.none ? '😶 Kimse bulamadı: Falcı kısmet alamadı' : e.all ? '😮 Herkes buldu: Falcı kısmet alamadı' : '🔮 Falcı\'nın kartı bulundu!'}</small></div>
      <div class="tv-table rev">${e.table.map((x) => `<div class="tv-rc${x.card === e.card ? ' win' : ''}">${cardHTML(x.card)}<div class="tv-ow">${face(x.owner)}<b>${esc(nm(x.owner))}${x.card === e.card ? ' ⭐' : ''}</b></div><div class="tv-vs">${voters(x.card).map((v) => face(v)).join('') || '<small>oy yok</small>'}</div></div>`).join('')}</div>
      <div class="tv-score">${Object.entries(e.gains).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<span class="${id === playerId ? 'me' : ''}">${esc(nm(id))} <b>+${v}</b> <small>${e.score[id]}</small></span>`).join('')}</div>`;
  }
  const client = {
    kind: 'telve', supports3D: false,
    onState(s) { if (s.status !== 'playing' || !s.g || anim) return; const k = `${s.seq}:${s.round}`; if (k !== key) { key = k; build(s); } },
    onEntry(e, skip) { if (e.phase !== 'vote') return; anim = { e, t0: performance.now() - skip }; ui.innerHTML = revealHTML(e); sfx(e.gains[playerId] > 0 ? 'finish' : 'pop'); },
    revealTotal: (e) => (e.phase === 'vote' ? e.dur || T.REVEAL_MS : 0),
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state(), { W, H } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || T.REVEAL_MS)) { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d1240'); gr.addColorStop(1, '#0d0a1f'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(167,139,250,.06)'; g.beginPath(); g.arc((Math.sin(now / 4000 + i * 2) * 0.5 + 0.5) * W, (Math.cos(now / 5000 + i) * 0.5 + 0.5) * H, (40 + i * 18) * ctx.size().DPR, 0, 7); g.fill(); }
      if (s.status === 'playing' && ph === 'plan' && !anim) { const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000); if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); } }
      const G = s.g; return anim ? '🔮 Kartlar açıldı' : !G ? '' : G.phase === 'tell' ? '☕ Falcı yorumluyor' : G.phase === 'pick' ? '🃏 Karta karar ver' : '🗳️ Falcı\'nın kartı hangisi?';
    },
    hint: () => null, hideReady: () => true, panel: () => '',
    ownPanel(chip) { const s = ctx.state(), list = s.players.filter((p) => p.inGame && !p.left); return `<div class="chips">${list.map((p) => chip(p.id, s.ready.includes(p.id) ? 'ready' : '', s.ready.includes(p.id) ? ' ✓' : ' …')).join('')}</div>`; },
    action() { const s = ctx.state(); return s.g.phase === 'tell' ? { card: sel, clue: clueText } : { card: sel }; },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? `Fal <b>${s.g.turn}/${s.g.turns}</b> · <b>${s.g.score[playerId] || 0}</b> puan` : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
