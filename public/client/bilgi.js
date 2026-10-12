// 🧠 Bil Bakalım istemcisi: kategori oylaması (oy verenlerin yüzleri), sorular + jokerler, avatar şeridi
import * as Q from '../games/bilgi.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
const SHAPES = ['▲', '◆', '●', '■'];

export function createBilgi(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'qz';
  ctx.stage.appendChild(ui);
  let key = '', chosen = -1, chosen2 = -1, anim = null, lastTick = 0, dyn = '';

  const face = (id, cls = '') => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face ${cls}${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" title="${esc(p.name)}" alt="">`; };
  const players = () => ctx.state().players.filter((p) => p.inGame && !p.left);
  // Alt avatar şeridi: herkes (cevap verenler ✓), ben büyük
  const strip = (done = () => false, extra = () => '') => `<div class="qz-strip">${players().map((p) => `<div class="qz-av${p.id === playerId ? ' me' : ''}${done(p.id) ? ' done' : ''}">${face(p.id)}<span>${esc(p.id === playerId ? 'Sen' : p.name)}</span>${extra(p.id)}</div>`).join('')}</div>`;

  // ---------- Fazlar ----------
  function buildVote() {
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Kategori oylaması</span><b>Hangi kategoride yarışalım?</b></div>
      <div class="qz-cats">${Q.CATS.map((c) => `<button class="qz-cat" data-cat="${c.id}"><span class="e">${c.emoji}</span><b>${esc(c.title)}</b><span class="voters" data-voters="${c.id}"></span></button>`).join('')}</div>`;
    ui.querySelector('.qz-cats').onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b || ctx.phase() !== 'plan') return;
      chosen = b.dataset.cat; sfx('pop');
      ctx.submit();
    };
  }
  // Sonuncu oyuncu kalan 4 sorunun konusunu seçer
  function buildPick(s) {
    const G = s.g, mine = G.chooser === playerId && ctx.me() && ctx.me().alive;
    chosen = s.myAction ? s.myAction.cat : null;
    const opts = Q.CATS.filter((c) => c.id !== G.cat);
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Konu değişiyor · son ${Q.QUESTIONS - Q.HALF} soru</span>
        <b>${mine ? '😅 Sonuncu sensin! Kalan soruların konusunu sen seç' : `${face(G.chooser)} ${esc(pName(G.chooser))} sonuncu — konuyu o seçiyor…`}</b></div>
      <div class="qz-cats${mine ? '' : ' ro'}">${opts.map((c) => `<button class="qz-cat${chosen === c.id ? ' mine' : ''}" data-cat="${c.id}"><span class="e">${c.emoji}</span><b>${esc(c.title)}</b></button>`).join('')}</div>`;
    if (mine) ui.querySelector('.qz-cats').onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b || ctx.phase() !== 'plan' || chosen) return;
      chosen = b.dataset.cat; b.classList.add('mine'); sfx('pop');
      ctx.submit();
    };
  }
  function buildQuestion(s) {
    const qi = s.g.qi, q = s.g.qs[qi];
    if (!q) return;
    chosen = s.myAction ? s.myAction.a : -1;
    chosen2 = s.myAction && s.myAction.a2 !== undefined ? s.myAction.a2 : -1;
    const cat = Q.CATS.find((c) => c.id === (qi < Q.HALF ? s.g.cat : s.g.cat2));
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Soru ${qi + 1}/${s.g.total}${cat ? ` · ${cat.emoji} ${esc(cat.title)}` : ''}</span><b>${esc(q.q)}</b></div>
      <div class="qz-jokers" id="qzJokers"></div>
      <div class="qz-grid">${q.o.map((o, i) => `<button class="qz-a" data-a="${i}" style="background:${COLORS[i]}"><span>${SHAPES[i]}</span>${esc(o)}</button>`).join('')}</div>
      <div id="qzStrip"></div>`;
    ui.querySelector('.qz-grid').onclick = (e) => {
      const b = e.target.closest('[data-a]');
      const st = ctx.state();
      if (!b || chosen2 >= 0 || !ctx.editing() || ctx.phase() !== 'plan' || b.classList.contains('gone')) return;
      const i = Number(b.dataset.a);
      if (st.g.ciftNow) {
        // Çift Cevap: iki farklı şık işaretlenir, ikincisinde gönderilir
        if (chosen < 0) { chosen = i; sfx('pop'); return; }
        if (i === chosen) return;
        chosen2 = i; sfx('pop'); ctx.submit(); return;
      }
      if (chosen >= 0) return;
      chosen = i; sfx('pop'); ctx.submit();
    };
    ui.querySelector('#qzJokers').onclick = (e) => {
      const b = e.target.closest('[data-joker]');
      if (!b || chosen >= 0 || !ctx.editing() || ctx.phase() !== 'plan') return;
      const st = ctx.state(), which = b.dataset.joker;
      ctx.call({ action: 'gact', seq: st.seq, [which]: true }).then(() => { sfx('item'); if (which === 'cift') ctx.toast('✌️ İki şık işaretle: biri doğruysa doğru sayılır'); }).catch((er) => ctx.toast(er.message));
    };
    renderJokers(s);
  }
  // Joker düğmeleri: kalanlar basılabilir; bu soruda açılmış olan işaretli
  function renderJokers(s) {
    const el = $('#qzJokers');
    if (!el) return;
    const jk = s.g.jokers || {}, locked = chosen >= 0 || chosen2 >= 0;
    const btn = (id, active) => {
      const j = Q.JOKERS[id], left = !!jk[id];
      if (!left && !active) return `<span class="qz-joker spent" title="${esc(j.title)} kullanıldı">${j.emoji}<small>${esc(j.title)}</small></span>`;
      return `<button class="qz-joker${active ? ' on' : ''}" data-joker="${id}"${active || locked ? ' disabled' : ''}>${j.emoji}<small>${esc(j.title)}</small></button>`;
    };
    el.innerHTML = btn('yari', !!s.g.hide) + btn('cift', !!s.g.ciftNow);
  }

  // ---------- Açılışlar ----------
  function revealVote(e) {
    const c = Q.CATS.find((x) => x.id === e.winner);
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Oylama sonucu</span><b>🎯 ${c.emoji} ${esc(c.title)}</b></div>
      <div class="qz-cats reveal">${Q.CATS.map((k) => `<div class="qz-cat${k.id === e.winner ? ' win' : ''}"><span class="e">${k.emoji}</span><b>${esc(k.title)}</b><span class="voters">${Object.entries(e.votes).filter(([, v]) => v === k.id).map(([id]) => face(id)).join('')}</span></div>`).join('')}</div>
      <div class="qz-mult">🎁 Herkesin 2 jokeri var: ${Q.JOKERS.yari.emoji} ${Q.JOKERS.yari.title} · ${Q.JOKERS.cift.emoji} ${Q.JOKERS.cift.title}</div>`;
    sfx('finish');
  }
  function revealPick(e) {
    const c = Q.CATS.find((x) => x.id === e.cat);
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Yeni konu</span><b>🎯 ${c.emoji} ${esc(c.title)}</b></div>
      <div class="qz-pickby">${face(e.chooser)} <span><b>${esc(e.chooser === playerId ? 'Sen' : pName(e.chooser))}</b> ${e.chooser === playerId ? 'seçtin' : 'seçti'} · son ${Q.QUESTIONS - Q.HALF} soru bu konudan</span></div>`;
    sfx('finish');
  }
  function revealQuestion(e) {
    const s = ctx.state(), q = s.g.qs[e.qi];
    const who = [[], [], [], []];
    for (const [id, a] of Object.entries(e.answers)) { if (a.a >= 0) who[a.a].push(id); if (a.a2 !== undefined && a.a2 >= 0) who[a.a2].push(id); }
    const mine = e.answers[playerId];
    const bonusTxt = (a) => (a.bonus ? ` ${Q.JOKERS[a.bonus].emoji}` : '');
    ui.innerHTML = `<div class="qz-q"><span class="qz-n">Soru ${e.qi + 1}</span><b>${esc(q.q)}</b></div>
      <div class="qz-grid reveal">${q.o.map((o, i) => `<div class="qz-a${i === e.c ? ' right' : ' wrong'}" style="background:${COLORS[i]}"><span>${SHAPES[i]}</span>${esc(o)}<div class="voters">${who[i].map((id) => face(id)).join('')}</div></div>`).join('')}</div>
      ${mine ? `<div class="qz-me ${mine.pts ? 'ok' : 'no'}">${mine.pts ? `✅ +${mine.pts}` : mine.a < 0 ? '⌛ Süre doldu' : '❌ Yanlış'}${bonusTxt(mine)}</div>` : ''}
      ${e.mult > 1 ? `<div class="qz-mult">${e.nCorrect === 1 ? '🏅 Tek bilen' : `🏅 ${e.nCorrect}/${e.nAlive} bildi`} · puan ×${e.mult}</div>` : e.nCorrect === 0 ? '<div class="qz-mult">😶 Kimse bilemedi</div>' : ''}
      <div class="qz-board">${Object.entries(e.scores).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, sc], i) => `<div><span>${i + 1}.</span>${face(id)}${esc(pName(id))}${bonusTxt(e.answers[id] || {})}<b>${sc}</b></div>`).join('')}</div>
      ${e.chooser ? `<div class="qz-pickby">${face(e.chooser)} <span>Sonuncu <b>${esc(e.chooser === playerId ? 'sensin' : pName(e.chooser))}</b> — kalan ${Q.QUESTIONS - Q.HALF} sorunun konusunu ${e.chooser === playerId ? 'sen' : 'o'} seçecek!</span></div>` : ''}`;
    sfx(mine && mine.pts ? 'finish' : 'hit');
  }

  function build(s) {
    const ph = s.g.phase;
    const k = `${s.seq}:${s.round}:${ph}`;
    if (k === key) return;
    key = k; dyn = '';
    if (ph === 'vote') { chosen = s.myAction ? s.myAction.cat : null; buildVote(); }
    else if (ph === 'pick') buildPick(s);
    else if (ph === 'q') buildQuestion(s);
  }
  // Her yoklamada değişen kısımlar (oy verenlerin yüzleri, avatar şeridi)
  function refresh(s) {
    if (anim) return;
    const ph = s.g.phase;
    let html = '';
    if (ph === 'vote') {
      const votes = s.g.votes || {};
      html = JSON.stringify(votes) + chosen;
      if (html === dyn) return;
      dyn = html;
      for (const c of Q.CATS) {
        const el = ui.querySelector(`[data-voters="${c.id}"]`);
        if (el) el.innerHTML = Object.entries(votes).filter(([, v]) => v === c.id).map(([id]) => face(id)).join('');
        const card = ui.querySelector(`[data-cat="${c.id}"]`);
        if (card) card.classList.toggle('mine', votes[playerId] === c.id || chosen === c.id);
      }
    } else if (ph === 'q') {
      html = JSON.stringify(s.ready) + (s.g.hide || '') + JSON.stringify(s.g.jokers) + s.g.ciftNow + chosen + chosen2;
      if (html === dyn) return;
      dyn = html;
      const el = $('#qzStrip');
      if (el) el.innerHTML = strip((id) => s.ready.includes(id));
      if (s.g.hide) for (const i of s.g.hide) { const b = ui.querySelector(`.qz-a[data-a="${i}"]`); if (b) b.classList.add('gone'); }
      renderJokers(s);
    }
  }

  const client = {
    kind: 'bilgi',
    supports3D: false,
    onState(s) {
      if (s.status !== 'playing' || anim || !s.g) return;
      build(s);
      refresh(s);
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      if (e.phase === 'vote') revealVote(e); else if (e.phase === 'pick') revealPick(e); else revealQuestion(e);
    },
    revealTotal: (e) => e.dur || Q.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || Q.REVEAL_MS)) { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      const t = now / 4000;
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, `hsl(${(t * 60) % 360}, 55%, 22%)`); gr.addColorStop(1, `hsl(${(t * 60 + 120) % 360}, 55%, 16%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.arc((Math.sin(t * 2 + i) * 0.5 + 0.5) * W, (Math.cos(t * 1.5 + i * 2) * 0.5 + 0.5) * H, (60 + i * 20) * DPR, 0, Math.PI * 2); g.fill(); }
      if (!s.g) return '';
      if (s.g.phase === 'q' && !anim) {
        ui.querySelectorAll('.qz-a').forEach((b) => {
          const mine = +b.dataset.a === chosen || +b.dataset.a === chosen2, locked = s.g.ciftNow ? chosen2 >= 0 : chosen >= 0;
          b.classList.toggle('chosen', mine); b.classList.toggle('dim', locked && !mine);
        });
        if (ph === 'plan' && s.status === 'playing') {
          const left = clamp((s.deadline - ctx.serverNow()) / Q.PLACE_MS, 0, 1);
          const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000);
          if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); }
          const cx = W - 34 * DPR, cy = 34 * DPR, r = 22 * DPR;
          g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = left < 0.3 ? '#ef4444' : '#facc15'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); g.stroke();
          g.fillStyle = '#fff'; g.font = `900 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sec, cx, cy);
        }
      }
      if (anim) return anim.e.phase === 'vote' ? '🗳️ Oylama bitti!' : anim.e.phase === 'pick' ? '🎯 Konu değişti!' : '💡 Doğru cevap!';
      if (s.g.phase === 'vote') return '🗳️ Kategoriye oy ver';
      if (s.g.phase === 'pick') return s.g.chooser === playerId ? '🎯 Konuyu sen seç!' : '⏳ Sonuncu konuyu seçiyor…';
      if (s.g.phase === 'q' && s.g.ciftNow && chosen2 < 0) return chosen < 0 ? '✌️ İki şık işaretle' : '✌️ Bir şık daha işaretle';
      return '';
    },
    hint: () => null,
    hideReady: () => true,
    panel() { return ''; },
    action() {
      const s = ctx.state(), ph = s.g && s.g.phase;
      if (ph === 'vote' || ph === 'pick') return chosen ? { cat: chosen } : null;
      return chosen >= 0 ? { a: chosen, ...(chosen2 >= 0 ? { a2: chosen2 } : {}) } : null;
    },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? `Puan <b>${s.g.scores[playerId] || 0}</b>${s.g.jokers ? ` · ${s.g.jokers.yari ? Q.JOKERS.yari.emoji : ''}${s.g.jokers.cift ? Q.JOKERS.cift.emoji : ''}` : ''}` : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
