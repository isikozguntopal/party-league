// 🐑 Sürü istemcisi: soruyu cevapla (tek dokunuş), sonra koyun sürüleri açılır.
import * as S from '../games/suru.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

export function createSuru(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'su';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, pick = -1, lastTick = 0;
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));
  const sheep = (id, black) => `<span class="su-sheep${black ? ' black' : ''}${id === playerId ? ' me' : ''}"><i>🐑</i><small>${esc(nm(id))}</small></span>`;

  function build(s) {
    const G = s.g;
    pick = s.myAction ? s.myAction.o : -1;
    ui.innerHTML = `<div class="su-card"><span class="su-n">Tur ${G.round}/${G.rounds}</span><b>${esc(G.q)}</b><small>Kalabalıkla aynı şıkkı seç! Tek başına kalırsan kara koyun olursun.</small></div>
      <div class="su-opts">${G.opts.map((o, i) => `<button class="su-o${pick === i ? ' on' : ''}" data-o="${i}"><span>${'ABCD'[i]}</span>${esc(o)}</button>`).join('')}</div>
      <div class="su-wait" id="suWait">${pick >= 0 ? 'Seçimin gizli, diğerleri bekleniyor…' : ''}</div>`;
    ui.querySelector('.su-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]'); if (!b || ctx.phase() !== 'plan' || anim) return;
      pick = Number(b.dataset.o); sfx('pop'); ctx.submit();
      ui.querySelectorAll('.su-o').forEach((x) => x.classList.toggle('on', x === b));
      $('#suWait').textContent = 'Seçimin gizli, diğerleri bekleniyor…';
    });
  }
  function revealHTML(e) {
    const rows = e.opts.map((o, i) => ({ o, i, ids: e.groups[i] })).sort((a, b) => b.ids.length - a.ids.length);
    return `<div class="su-card"><span class="su-n">Tur ${e.round}</span><b>${esc(e.q)}</b></div>
      ${rows.map((r) => `<div class="su-grp${e.herd.includes(r.i) ? ' herd' : ''}${r.ids.length === 1 ? ' lone' : ''}${!r.ids.length ? ' empty' : ''}"><div class="su-gh"><b>${esc(r.o)}</b> <em>${r.ids.length}</em>${e.herd.includes(r.i) ? '<span class="tag">🔔 Sürü burada +3</span>' : ''}${r.ids.length === 1 ? '<span class="tag dark">Kara koyun</span>' : ''}</div>
        <div class="su-sh">${r.ids.map((id) => sheep(id, r.ids.length === 1)).join('') || '<small>kimse seçmedi</small>'}</div></div>`).join('')}
      <div class="su-score">${Object.entries(e.gains).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<span class="${id === playerId ? 'me' : ''}">${esc(nm(id))} <b>${v >= 0 ? '+' : ''}${v}</b> <small>${e.score[id]}</small></span>`).join('')}</div>`;
  }
  const client = {
    kind: 'suru', supports3D: false,
    onState(s) { if (s.status !== 'playing' || !s.g || anim) return; const k = `${s.seq}:${s.round}`; if (k !== key) { key = k; build(s); } },
    onEntry(e, skip) { anim = { e, t0: performance.now() - skip }; ui.innerHTML = revealHTML(e); const mine = e.gains[playerId]; sfx(mine > 0 ? 'finish' : e.black.includes(playerId) ? 'fall' : 'pop'); },
    revealTotal: (e) => e.dur || S.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state(), { W, H } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || S.REVEAL_MS)) { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#16342b'); gr.addColorStop(1, '#0d1f1a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (s.status === 'playing' && ph === 'plan' && !anim) { const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000); if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); } }
      return anim ? '🐑 Sürüler açılıyor' : '🐑 Kalabalıkla aynı şıkkı seç';
    },
    hint: () => null, hideReady: () => true, panel: () => '',
    ownPanel(chip) { const s = ctx.state(), list = s.players.filter((p) => p.inGame && !p.left); return `<div class="chips">${list.map((p) => chip(p.id, s.ready.includes(p.id) ? 'ready' : '', s.ready.includes(p.id) ? ' ✓' : ' …')).join('')}</div>`; },
    action() { return { o: pick >= 0 ? pick : 0 }; },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? `Tur <b>${s.g.round}/${s.g.rounds}</b> · <b>${s.g.score[playerId] || 0}</b> puan` : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
