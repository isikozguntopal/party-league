// 🎧 Şarkıyı Tahmin Et istemcisi: iTunes 30 sn önizlemesi (Web Audio ile milisaniye hassas kesilir), listeden seçerek tahmin, takım ortak tahmin hakkı.
// Ses: önce şarkı numarasından (tid) güncel önizleme adresi alınır, ses indirilip çözülür; "Dinle" bastığında tam o aşamanın süresi kadar çalar
// (AudioBufferSource.start(0, 0, süre) → süre dolunca kendiliğinden durur). Web Audio olmazsa <audio> + currentTime ile kesilir.
import * as M from '../games/melodi.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e' };
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîûé]/g, (c) => TR[c]).replace(/[^a-z0-9]+/g, ' ').trim();
const INDEX = M.POOL.map((s, i) => ({ i, t: norm(s.t), a: norm(s.a), k: norm(s.t + ' ' + s.a) }));
const TEAM_COLORS = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#3b82f6'];
const STAGE_LABEL = ['0,5 sn', '1,5 sn', '5 sn', '10 sn', '20 sn'];

// Otomatik tamamlama: yazılan kelimelerin hepsi şarkı adında ya da sanatçıda geçmeli; adı yazılanla başlayanlar öne
export function suggest(q, max = 6) {
  const nq = norm(q);
  if (nq.length < 2) return [];
  const tk = nq.split(' ');
  return INDEX.filter((x) => tk.every((w) => x.k.includes(w))).sort((p, q2) => (q2.t.startsWith(nq) - p.t.startsWith(nq)) || (q2.a.startsWith(nq) - p.a.startsWith(nq)) || p.t.localeCompare(q2.t)).slice(0, max).map((x) => x.i);
}

export function createMelodi(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'md';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, sel = -1, lastTick = 0, loadKey = '', busy = false;
  // ses
  let ac = null, gain = null, buf = null, el = null, state = 'idle', art = null, playing = null, loadSeq = 0;

  const face = (id, cls = '') => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face ${cls}${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="" title="${esc(p.name)}">`; };
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));
  const myTeam = (s) => s.g.teams.find((t) => t.id === s.g.mine) || null;

  // ---------- Ses ----------
  function ensureAC() {
    if (ac) return ac;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { ac = new AC(); gain = ac.createGain(); gain.gain.value = 1; gain.connect(ac.destination); } } catch (e) { ac = null; }
    return ac;
  }
  function stopPlay() {
    if (!playing) return;
    try { if (playing.src) { playing.src.onended = null; playing.src.stop(); } if (playing.el) playing.el.pause(); } catch (e) { /* durmuş */ }
    playing = null;
    const b = ui.querySelector('#mdPlay'); if (b) b.classList.remove('on');
  }
  async function fetchJSON(url, ms = 8000) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); return await r.json(); } finally { clearTimeout(t); }
  }
  async function loadSong(g0) {
    const my = ++loadSeq;
    stopPlay(); buf = null; el = null; art = null; state = 'loading'; paintPlay();
    let url = g0.url || null;
    try {
      const j = await fetchJSON(`https://itunes.apple.com/lookup?id=${g0.tid}&country=tr`);
      const it = j && j.results && j.results[0];
      if (it && it.previewUrl) url = it.previewUrl;
      if (it && it.artworkUrl100) art = it.artworkUrl100.replace('100x100', '300x300');
    } catch (e) { /* yedek adres */ }
    if (my !== loadSeq) return;
    if (!url) { state = 'error'; paintPlay(); return; }
    // 1) Web Audio: indir + çöz (milisaniye hassas kesme)
    try {
      const c = ensureAC();
      if (!c) throw new Error('webaudio yok');
      const ab = await (await fetch(url)).arrayBuffer();
      const decoded = await new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      if (my !== loadSeq) return;
      buf = decoded; state = 'ready'; paintPlay(); return;
    } catch (e) { /* <audio> yedeği */ }
    try {
      const a = new Audio(); a.preload = 'auto'; a.src = url; a.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { a.oncanplaythrough = res; a.onerror = rej; setTimeout(res, 4000); a.load(); });
      if (my !== loadSeq) return;
      el = a; state = 'ready';
    } catch (e) { state = 'error'; }
    paintPlay();
  }
  // ms: bu kadar milisaniye çal (baştan)
  function play(ms) {
    if (state !== 'ready') return;
    stopPlay();
    sfx('tick');
    if (buf && ac) {
      ac.resume && ac.resume();
      const src = ac.createBufferSource(); src.buffer = buf; src.connect(gain);
      const t0 = ac.currentTime + 0.005;
      src.start(t0, 0, ms / 1000);
      src.onended = () => { if (playing && playing.src === src) { playing = null; const b = ui.querySelector('#mdPlay'); if (b) b.classList.remove('on'); } };
      playing = { src, t0, ms };
    } else if (el) {
      el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {});
      playing = { el, ms, started: performance.now() };
    }
    const b = ui.querySelector('#mdPlay'); if (b) b.classList.add('on');
  }
  const elapsedMs = () => (!playing ? 0 : playing.src ? Math.max(0, (ac.currentTime - playing.t0) * 1000) : (playing.el.currentTime || 0) * 1000);
  function paintPlay() {
    const b = ui.querySelector('#mdPlay'), s = ctx.state();
    if (!b || !s || !s.g) return;
    const st = myTeam(s), ms = M.STAGES[Math.min(st ? s.g.teams.find((t) => t.id === st.id).stage : 0, M.STAGES.length - 1)];
    b.disabled = state !== 'ready';
    b.innerHTML = state === 'loading' ? '⏳ Şarkı yükleniyor…' : state === 'error' ? '⚠️ Ses yüklenemedi — dokun, tekrar dene' : `<span>▶</span> Dinle <small>(${ms >= 1000 ? (ms / 1000).toString().replace('.', ',') : '0,5'} sn)</small>`;
    b.dataset.err = state === 'error' ? '1' : '';
  }

  // ---------- Arayüz ----------
  function build(s) {
    const G = s.g;
    sel = -1; busy = false;
    ui.innerHTML = `<div class="md-card"><span class="md-n" id="mdN"></span><b id="mdT"></b>
        <div class="md-stages" id="mdStages">${M.STAGES.map((m, i) => `<div class="md-st" data-i="${i}"><i></i><span>${STAGE_LABEL[i]}</span></div>`).join('')}</div>
        <div class="md-bar"><i id="mdBar"></i></div>
        <button class="btn big md-play" id="mdPlay" disabled>⏳</button></div>
      <div class="md-card" id="mdGuess">
        <div class="md-inwrap"><input id="mdIn" type="text" inputmode="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Şarkı ya da sanatçı yaz…"><button class="md-x hidden" id="mdClr" aria-label="temizle">✕</button></div>
        <div class="md-sug" id="mdSug"></div>
        <div class="md-pick hidden" id="mdPick"></div>
        <div class="md-row"><button class="btn ok" id="mdGo" disabled>Tahmin et</button><button class="btn ghost" id="mdSkip">⏭ Atla</button></div>
        <small class="md-hint" id="mdHint"></small>
      </div>
      <div class="md-card" id="mdHist"></div>
      <div class="md-teams" id="mdTeams"></div>`;
    const inp = $('#mdIn');
    const draw = () => {
      const list = suggest(inp.value);
      $('#mdSug').innerHTML = sel >= 0 ? '' : list.map((i) => `<button class="md-s" data-i="${i}"><b>${esc(M.POOL[i].t)}</b><small>${esc(M.POOL[i].a)}</small></button>`).join('') || (norm(inp.value).length >= 2 ? '<div class="md-none">Listede böyle bir şarkı yok</div>' : '');
    };
    inp.addEventListener('input', () => { if (sel >= 0) clearSel(); draw(); });
    $('#mdSug').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      sel = Number(b.dataset.i); inp.value = ''; inp.blur(); sfx('pop'); showPick(); draw();
    });
    const clearSel = () => { sel = -1; showPick(); };
    $('#mdClr').onclick = () => { clearSel(); inp.value = ''; draw(); inp.focus(); };
    $('#mdPlay').onclick = () => {
      const s2 = ctx.state();
      if (state === 'error') { loadKey = ''; loadSong(s2.g); return; }
      const t = s2.g.teams.find((x) => x.id === s2.g.mine);
      play(M.STAGES[Math.min(t ? t.stage : 0, M.STAGES.length - 1)]);
    };
    $('#mdGo').onclick = () => guess('guess');
    $('#mdSkip').onclick = () => guess('skip');
    paintPlay();
  }
  function showPick() {
    const p = $('#mdPick'), go = $('#mdGo'), clr = $('#mdClr');
    if (!p) return;
    p.classList.toggle('hidden', sel < 0); clr.classList.toggle('hidden', sel < 0);
    p.innerHTML = sel >= 0 ? `✅ <b>${esc(M.POOL[sel].t)}</b> <small>${esc(M.POOL[sel].a)}</small>` : '';
    go.disabled = sel < 0 || busy;
  }
  async function guess(kind) {
    const s = ctx.state();
    if (busy || !s || !s.g || !myTeam(s)) return;
    busy = true; $('#mdGo').disabled = true; $('#mdSkip').disabled = true;
    try {
      await ctx.call({ action: 'gact', seq: s.seq, round: s.round, t: kind, i: kind === 'guess' ? sel : undefined });
      if (kind === 'guess') { sel = -1; const i = $('#mdIn'); if (i) i.value = ''; showPick(); $('#mdSug').innerHTML = ''; }
      sfx('pop');
    } catch (e) { ctx.toast(e.message); }
    busy = false; showPick();
  }

  // Durum değiştikçe değişen kısımlar (giriş kutusu korunur)
  function update(s) {
    const G = s.g, my = G.teams.find((t) => t.id === G.mine);
    $('#mdN').textContent = `Şarkı ${G.n}/${G.total}${my ? ` · Takım ${my.id + 1}` : ' · izliyorsun'}`;
    const solved = my && my.solved >= 0, failed = my && my.done && !solved;
    $('#mdT').textContent = !my ? '👀 İzliyorsun' : solved ? `🎉 Takımınız ${my.solved + 1}. aşamada bildi! +${G.pts[my.solved]}` : failed ? '😔 Takımınız bilemedi' : '🎧 Hangi şarkı?';
    ui.querySelectorAll('.md-st').forEach((e, i) => {
      const cur = my ? my.stage : 0;
      e.classList.toggle('past', i < cur || (my && my.done && i <= cur)); e.classList.toggle('cur', !my?.done && i === cur); e.classList.toggle('win', !!my && my.solved === i);
    });
    // yanlış tahminler / atlamalar
    const hist = G.wrong.map((w) => `<div class="md-h ${w.i < 0 ? 'skip' : 'no'}">${w.i < 0 ? '⏭' : '✗'} <span>${w.i < 0 ? 'atlandı' : `<b>${esc(M.POOL[w.i].t)}</b> <small>${esc(M.POOL[w.i].a)}</small>`}</span> <em>${esc(nm(w.by))}</em></div>`).join('');
    $('#mdHist').innerHTML = hist ? hist : '<small class="md-hint">Takımın tahminleri burada görünür. Tahmin hakkı takımla ortak!</small>';
    $('#mdHist').classList.toggle('hidden', !my);
    const can = !!my && !my.done;
    $('#mdGuess').classList.toggle('hidden', !my);
    const go = $('#mdGo'), sk = $('#mdSkip'), inp = $('#mdIn');
    if (go) go.disabled = !can || sel < 0 || busy; if (sk) sk.disabled = !can || busy; if (inp) inp.disabled = !can;
    $('#mdHint').textContent = !my ? '' : can ? `Ses ${STAGE_LABEL[my.stage]} çalıyor. Bilirsen şimdi seç: ${G.pts[my.stage]} puan.` : solved ? 'Diğer takımlar bitirince sonuç açılır. İstersen şarkıyı dinleyebilirsin.' : 'Diğer takımlar bitirince sonuç açılır.';
    $('#mdTeams').innerHTML = G.teams.map((t) => `<div class="md-tm${t.id === G.mine ? ' mine' : ''}${t.solved >= 0 ? ' ok' : t.done ? ' fail' : ''}" style="--tc:${TEAM_COLORS[t.id % TEAM_COLORS.length]}"><span class="faces">${t.members.map((id) => face(id)).join('')}</span><i>${t.solved >= 0 ? '✅' : t.done ? '❌' : `${t.stage + 1}/5`}</i></div>`).join('');
    paintPlay();
  }

  function rebuild(s) {
    const k = `${s.seq}:${s.round}`;
    if (k !== key) {
      key = k; build(s);
      if (loadKey !== k) { loadKey = k; loadSong(s.g); }
    }
    update(s);
  }

  // ---------- Sonuç ----------
  function revealHTML(e) {
    const medal = ['🥇', '🥈', '🥉'];
    const rows = e.rows.slice().sort((a, b) => b.pts - a.pts);
    const rank = Object.entries(e.scores).sort((a, b) => b[1] - a[1]);
    return `<div class="md-card center"><span class="md-n">Şarkı ${e.n}/${e.total} · cevap</span>
        ${art ? `<img class="md-art" src="${esc(art)}" alt="">` : '<div class="md-art ph">🎵</div>'}
        <b class="big">${esc(e.song.t)}</b><small>${esc(e.song.a)}</small></div>
      <div class="md-card">${rows.map((r) => `<div class="md-rr${r.members.includes(playerId) ? ' mine' : ''}"><span class="faces">${r.members.map((id) => face(id)).join('')}</span><b>${r.solved >= 0 ? `${r.solved + 1}. aşamada bildi` : 'bilemedi'}</b><em>${r.pts ? `+${r.pts}` : '—'}</em></div>`).join('')}</div>
      <div class="md-card"><span class="md-n">Puan durumu</span>${rank.slice(0, 8).map(([id, v], i) => `<div class="md-rr${id === playerId ? ' mine' : ''}"><span class="rk">${medal[i] || i + 1}</span>${face(id)}<b>${esc(nm(id))}</b><em>${v}</em></div>`).join('')}</div>`;
  }

  const client = {
    kind: 'melodi',
    supports3D: false,
    onState(s) { if (s.status !== 'playing' || anim || !s.g) return; rebuild(s); },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      stopPlay();
      ui.innerHTML = revealHTML(e);
      sfx(e.rows.some((r) => r.members.includes(playerId) && r.solved >= 0) ? 'fanfare' : 'pop');
      // cevabı duyur: önizlemeyi baştan çal (kullanıcı etkileşimi zaten oldu)
      if (state === 'ready') play(20000);
    },
    revealTotal: (e) => e.dur || M.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state(), { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || M.REVEAL_MS)) { anim = null; key = ''; stopPlay(); if (s.status === 'playing') client.onState(s); }
      // arka plan: kayan renkler + çalarken ekolayzır
      const t = now / 5000, play2 = !!playing;
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, `hsl(${(t * 30 + 280) % 360}, 55%, 18%)`); gr.addColorStop(1, `hsl(${(t * 30 + 330) % 360}, 55%, 12%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const bars = 22;
      for (let i = 0; i < bars; i++) {
        const k = play2 ? 0.25 + 0.75 * Math.abs(Math.sin(now / (130 + i * 9) + i)) : 0.06;
        const bw = W / bars; g.fillStyle = `hsla(${(i * 14 + t * 80) % 360},80%,60%,${play2 ? 0.3 : 0.1})`; g.fillRect(i * bw + 2, H - H * 0.5 * k, bw - 4, H * 0.5 * k);
      }
      if (!s.g || anim) return anim ? '🎧 Cevap açılıyor!' : '';
      // aşama süresi içinde çalarken: ilerleme çubuğu ve hassas durdurma (<audio> yedeği için)
      if (playing) {
        const e = elapsedMs();
        if (playing.el && e >= playing.ms) stopPlay();
        const bar = $('#mdBar'); if (bar) bar.style.width = `${clamp(e / (playing ? playing.ms : 1), 0, 1) * 100}%`;
      } else { const bar = $('#mdBar'); if (bar) bar.style.width = '0%'; }
      if (s.status === 'playing' && ph === 'plan') {
        const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000);
        if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); }
        const left = clamp((s.deadline - ctx.serverNow()) / M.ROUND_MS, 0, 1);
        const cx = W - 34 * DPR, cy = 34 * DPR, r = 22 * DPR;
        g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = left < 0.25 ? '#ef4444' : '#e879f9'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.font = `900 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sec, cx, cy);
      }
      const my = s.g.teams.find((x) => x.id === s.g.mine);
      return !my ? '👀 İzliyorsun' : my.done ? (my.solved >= 0 ? '🎉 Bildiniz!' : '⏳ Diğer takımlar bekleniyor') : '🎧 Dinle ve tahmin et';
    },
    hint: () => null,
    hideReady: () => true,
    hideTimer: true,
    panel() { return ''; },
    action() { return null; },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? `Puan <b>${s.g.scores[playerId] || 0}</b>` : ''; },
    dispose() { loadSeq++; stopPlay(); if (ac) { try { ac.close(); } catch (e) { /* kapalı */ } ac = null; } ui.remove(); },
  };
  return client;
}
