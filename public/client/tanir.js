// 🧩 Ne Kadar Tanıyorsun? istemcisi: önce kendin hakkında cevapla, sonra sıra takımına gelince arkadaşını tahmin et.
// Cevaplar/tahminler herkes gönderene dek gizli; sonra tüm oda görür (kim ne bildi).
import * as T from '../games/tanir.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

export function createTanir(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'tn';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, mine = [], guess = {}, submitted = false, autoSent = false, lastTick = 0;

  const face = (id, cls = '') => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face ${cls}${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="" title="${esc(p.name)}">`; };
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));
  const opts = (o, sel, attr, extra = '') => `<div class="tn-opts">${o.map((t, i) => `<button class="tn-o${sel === i ? ' on' : ''}" ${attr}="${i}"${extra}>${esc(t)}</button>`).join('')}</div>`;

  // ---------- Profil: kendi hakkında ----------
  function buildProfile(s) {
    const G = s.g;
    mine = s.myAction && s.myAction.a ? s.myAction.a.slice() : Array(T.Q_COUNT).fill(-1);
    submitted = !!s.myAction;
    ui.innerHTML = `<div class="tn-card"><span class="tn-n">1 · Kendin hakkında</span><b>Seni takım arkadaşın ne kadar tanıyor?</b>
      <small>Kendin için doğru olanı seç. Cevapların herkes gönderene dek gizli kalır, sonra takımın tahmin eder.</small></div>
      ${G.qs.map((q, qi) => `<div class="tn-q" data-qi="${qi}"><div class="tn-qt"><i>${qi + 1}</i>${esc(q.q)}</div>${opts(q.o, mine[qi], 'data-o')}</div>`).join('')}
      <div class="tn-send"><button class="btn ok" id="tnSend"${submitted ? ' disabled' : ''}>${submitted ? 'Gönderildi ✓' : 'Hazırım, gönder'}</button><div class="tn-wait" id="tnWait"></div></div>`;
    ui.querySelectorAll('.tn-q').forEach((el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]'); if (!b || submitted || ctx.phase() !== 'plan') return;
      mine[Number(el.dataset.qi)] = Number(b.dataset.o); sfx('tick');
      el.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#tnSend').onclick = () => {
      if (submitted || ctx.phase() !== 'plan') return;
      if (mine.some((v) => v < 0)) { ctx.toast('Tüm soruları cevapla'); return; }
      submitted = true; sfx('pop'); ctx.submit(); $('#tnSend').disabled = true; $('#tnSend').textContent = 'Gönderildi ✓';
    };
  }

  // ---------- Takım turu ----------
  function buildTeam(s) {
    const G = s.g;
    const tm = G.team;
    const names = tm.map(nm).join(' & ');
    if (!G.mine) {
      ui.innerHTML = `<div class="tn-card center"><span class="tn-n">Takım ${G.teamIdx + 1}/${G.teams.length}</span><b class="big">${tm.map((id) => face(id)).join('')}</b>
        <b>${esc(names)} oynuyor</b><small>Cevaplar herkes gönderince hepinize açılacak. İzlerken tahmin yürütebilirsin 😉</small>
        <div class="tn-wait" id="tnWait"></div></div>
        ${G.qs.map((q, qi) => `<div class="tn-q ro"><div class="tn-qt"><i>${qi + 1}</i>${esc(q.q)}</div><div class="tn-opts ro">${q.o.map((t) => `<span class="tn-o">${esc(t)}</span>`).join('')}</div></div>`).join('')}`;
      submitted = true;
      return;
    }
    guess = {};
    for (const m of G.mates) guess[m] = s.myAction && s.myAction.g && s.myAction.g[m] ? s.myAction.g[m].slice() : Array(T.Q_COUNT).fill(-1);
    submitted = !!s.myAction;
    ui.innerHTML = `<div class="tn-card"><span class="tn-n">Takım ${G.teamIdx + 1}/${G.teams.length} · sıra sizde</span><b>${G.mates.map((m) => esc(nm(m))).join(' & ')} ne seçti?</b>
      <small>Tahmin et! Doğru bildiğin her soruda sen ve arkadaşın ${T.POINTS} puan alırsınız. Arkadaşın gönderene dek cevaplar görünmez.</small></div>
      ${G.mates.map((m) => `<div class="tn-who">${face(m)}<b>${esc(nm(m))}</b></div>${G.qs.map((q, qi) => `<div class="tn-q" data-m="${m}" data-qi="${qi}"><div class="tn-qt"><i>${qi + 1}</i>${esc(q.q)}</div>${opts(q.o, guess[m][qi], 'data-o')}</div>`).join('')}`).join('')}
      <div class="tn-send"><button class="btn ok" id="tnSend"${submitted ? ' disabled' : ''}>${submitted ? 'Gönderildi ✓' : 'Hazırım, gönder'}</button><div class="tn-wait" id="tnWait"></div></div>`;
    ui.querySelectorAll('.tn-q[data-m]').forEach((el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]'); if (!b || submitted || ctx.phase() !== 'plan') return;
      guess[el.dataset.m][Number(el.dataset.qi)] = Number(b.dataset.o); sfx('tick');
      el.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#tnSend').onclick = () => {
      if (submitted || ctx.phase() !== 'plan') return;
      if (Object.values(guess).some((a) => a.some((v) => v < 0))) { ctx.toast('Tüm tahminleri yap'); return; }
      submitted = true; sfx('pop'); ctx.submit(); $('#tnSend').disabled = true; $('#tnSend').textContent = 'Gönderildi ✓';
    };
  }

  function rebuild(s) {
    const k = `${s.seq}:${s.round}`;
    if (k === key) return;
    key = k; autoSent = false;
    if (s.g.phase === 'profile') buildProfile(s); else if (s.g.phase === 'review') buildReview(s); else buildTeam(s);
  }

  // ---------- İnceleme: cevaplar ve tahminler açık; oda sahibi "Sonraki"ye basana dek ekranda kalır (skor yok) ----------
  function buildReview(s) {
    const G = s.g, e = G.review;
    submitted = true;
    if (!e) { ui.innerHTML = '<div class="tn-card center"><b>⏳ Yükleniyor…</b></div>'; return; }
    const tm = e.team, host = G.hostId === playerId;
    // Sade satır: soru → kim ne seçti → tahmin edenler yalnızca ✓ ya da ✗ (yanlışsa neyi seçtiği küçük yazıyla)
    const rowHTML = (r, qi) => `<div class="tn-r"><div class="tn-qt"><i>${qi + 1}</i>${esc(r.q)}</div>
      ${tm.map((target) => {
        const t = r.truth[target];
        const guessers = tm.filter((x) => x !== target);
        return `<div class="tn-rr"><span class="tn-tg">${face(target)}<span><small>${esc(nm(target))}</small><b>${t === null ? '—' : esc(r.o[t])}</b></span></span>
          <span class="tn-gs">${guessers.map((gu) => { const v = r.guesses[gu] && r.guesses[gu][target]; const okk = v !== null && v !== undefined && t !== null && v === t; return `<span class="tn-g ${okk ? 'ok' : 'no'}">${face(gu)}<i>${okk ? '✓' : '✗'}</i>${okk ? '' : `<em>${v === null || v === undefined ? 'boş' : esc(r.o[v])}</em>`}</span>`; }).join('')}</span></div>`;
      }).join('')}</div>`;
    const sum = tm.map((id) => `<span class="tn-sum">${face(id)}<b>${esc(nm(id))}</b><em>${e.correct[id]}/${Q_PER(tm)} doğru bildi</em></span>`).join('');
    const nextLabel = G.isLast ? '🏆 Skorları göster' : `Sonraki takım ▶ (${e.teamIdx + 2}/${G.teamCount})`;
    ui.innerHTML = `<div class="tn-card center"><span class="tn-n">Takım ${e.teamIdx + 1}/${G.teamCount} · sonuçlar</span><b class="big">${tm.map((id) => face(id)).join('')}</b>
      <div class="tn-sums">${sum}</div><small>Her soruda: kim ne seçti, tahmin eden doğru (✓) mu bildi yanlış (✗) mı. Skorlar oyun sonunda açıklanır.</small></div>
      ${e.rows.map(rowHTML).join('')}
      <div class="tn-send">${host
        ? `<button class="btn ok" id="tnNext">${nextLabel}</button><div class="tn-wait">Herkes incelemeyi bitirince bas 🙂</div>`
        : `<div class="tn-wait">⏳ Oda sahibi devam ettirince ${G.isLast ? 'skorlar açıklanacak' : 'sıradaki takım başlayacak'}…</div>`}</div>`;
    const nb = $('#tnNext');
    if (nb) nb.onclick = () => {
      nb.disabled = true; sfx('pop');
      ctx.call({ action: 'gact', seq: s.seq, round: s.round, t: 'next' }).catch((err) => { nb.disabled = false; ctx.toast(err.message); });
    };
    sfx((e.gains[playerId] || 0) > 0 ? 'fanfare' : 'pop');
  }
  const Q_PER = (tm) => T.Q_COUNT * (tm.length - 1);

  const client = {
    kind: 'tanir',
    supports3D: false,
    onState(s) {
      if (s.status !== 'playing' || anim || !s.g) return;
      rebuild(s);
      const w = $('#tnWait');
      if (w) w.textContent = submitted && s.g.phase === 'team' && !s.g.mine ? '' : submitted ? '⏳ Takım arkadaşın bekleniyor…' : '';
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      if (e.phase === 'profile') { ui.innerHTML = '<div class="tn-card center"><span class="tn-n">Hazır!</span><b class="big">🧩 Takımlar sırayla oynayacak</b></div>'; sfx('finish'); }
      else ui.innerHTML = `<div class="tn-card center"><span class="tn-n">Takım ${e.teamIdx + 1}</span><b class="big">${e.team.map((id) => face(id)).join('')}</b><b>🎉 Cevaplar açılıyor…</b></div>`;
    },
    revealTotal: (e) => e.dur || 0,
    get hideTimer() { const s = ctx.state(); return !!(s && s.g && s.g.phase === 'review'); },
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || 0)) { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      const t = now / 5000;
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, `hsl(${(t * 30 + 200) % 360}, 55%, 20%)`); gr.addColorStop(1, `hsl(${(t * 30 + 260) % 360}, 55%, 14%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.arc((Math.sin(t * 2 + i) * 0.5 + 0.5) * W, (Math.cos(t * 1.4 + i * 2) * 0.5 + 0.5) * H, (50 + i * 22) * DPR, 0, Math.PI * 2); g.fill(); }
      if (!s.g || anim) return anim ? (anim.e.phase === 'team' ? '🎉 Cevaplar açılıyor!' : '') : '';
      if (s.status === 'playing' && ph === 'plan' && s.g.phase !== 'review') {
        const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000);
        if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); }
        // süre bitmek üzereyken tamamlananlar otomatik gönderilir
        if (!submitted && !autoSent && s.deadline - ctx.serverNow() < 1500) {
          if (s.g.phase === 'profile' && mine.every((v) => v >= 0)) { autoSent = true; submitted = true; ctx.submit(); }
          else if (s.g.phase === 'team' && s.g.mine && Object.values(guess).every((a) => a.every((v) => v >= 0))) { autoSent = true; submitted = true; ctx.submit(); }
        }
        const total = s.g.phase === 'profile' ? T.PROFILE_MS : T.TEAM_MS;
        const left = clamp((s.deadline - ctx.serverNow()) / total, 0, 1);
        const cx = W - 34 * DPR, cy = 34 * DPR, r = 22 * DPR;
        g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = left < 0.3 ? '#ef4444' : '#facc15'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.font = `900 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sec, cx, cy);
      }
      return s.g.phase === 'profile' ? '✍️ Kendin hakkında cevapla' : s.g.phase === 'review' ? '🔍 Sonuçları incele' : s.g.mine ? '🎯 Arkadaşını tahmin et' : '👀 Diğer takım oynuyor';
    },
    hint: () => null,
    hideReady: () => true,
    panel() { return ''; },
    action() {
      const s = ctx.state();
      if (s.g.phase === 'profile') return mine.every((v) => v >= 0) ? { a: mine.slice() } : null;
      if (s.g.phase !== 'team' || !s.g.mine) return null;
      return Object.values(guess).every((a) => a.every((v) => v >= 0)) ? { g: Object.fromEntries(Object.entries(guess).map(([k, v]) => [k, v.slice()])) } : null;
    },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? (s.g.phase === 'review' ? 'Sonuçlar' : s.g.phase === 'profile' ? 'Kendin hakkında' : 'Tahmin') : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
