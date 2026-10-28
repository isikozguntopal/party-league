// 🎤 Ortak Şarkı istemcisi: dize yaz → ortak şarkıyı dinle (cihazın ses motoru + Web Audio vurucu) → 1–5 oyla → sonuç.
import * as S from '../games/sarki.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';
import { createBand, melodyFor } from './music.js';

export function createSarki(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'sk';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, text = '', votes = {}, submitted = false, autoSent = false, lastTick = 0;
  let playing = null;   // { stop }

  const face = (id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };

  // ---------- Şarkıyı çal ----------
  function stopSong() { if (playing) { playing.stop(); playing = null; } ui.querySelectorAll('.sk-line.now').forEach((e) => e.classList.remove('now')); ui.querySelectorAll('[data-play]').forEach((b) => { b.textContent = '▶ Şarkıyı dinle'; }); }
  // Yapay zekâ şarkısı (ElevenLabs Music, sunucuda): şarkı belli olunca arka planda hazırlanır; hazırsa o çalınır, değilse yerel müzik
  const ai = new Map();
  const aiKey = (song) => `${song.title}|${song.sections.map((sec) => sec.lines.map((l) => l.text).join('/')).join('#')}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function aiPrefetch(song) {
    const k = aiKey(song);
    if (ai.has(k)) return;
    ai.set(k, { status: 'pending' });
    try {
      let r = await ctx.raw({ action: 'muzik', op: 'start', song });
      if (!r || !r.k) { ai.set(k, { status: 'off' }); return; }
      for (let i = 0; i < 80; i++) {
        r = await ctx.raw({ action: 'muzik', op: 'get', k: r.k });
        if (r.status === 'ready') {
          const bin = atob(r.audio), arr = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
          ai.set(k, { status: 'ready', url: URL.createObjectURL(new Blob([arr], { type: 'audio/mpeg' })) });
          ui.querySelectorAll('[data-play]').forEach((b) => { if (!playing) b.textContent = '▶ Şarkıyı dinle 🎶'; });
          return;
        }
        if (r.status === 'error' || r.status === 'none' || r.status === 'off') break;
        await sleep(3000);
      }
    } catch { /* yerel müziğe dön */ }
    ai.set(k, { status: 'off' });
  }
  function playAI(song, url) {
    const au = new Audio(url), n = song.sections.reduce((a, sec) => a + sec.lines.length, 0);
    let last = -1;
    const mark = () => {
      if (!au.duration) return;
      const idx = Math.min(n - 1, Math.floor((au.currentTime / au.duration) * n));
      if (idx === last) return; last = idx;
      ui.querySelectorAll('.sk-line.now').forEach((e) => e.classList.remove('now'));
      const el = ui.querySelector(`[data-li="${idx}"]`); if (el) { el.classList.add('now'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    };
    au.ontimeupdate = mark; au.onended = () => stopSong();
    au.play().catch(() => { stopSong(); ctx.toast('Ses çalınamadı'); });
    playing = { stop() { au.pause(); au.src = ''; } };
    ui.querySelectorAll('[data-play]').forEach((b) => { b.textContent = '⏹ Durdur'; });
  }
  // Şarkı: arkada çalan müzik (davul, bas, akor, arpej: client/music.js) + sözler hızlı ve ritme oturtularak okunur; her kelimede ezgi notası çalar.
  function playSong(song) {
    if (playing) { stopSong(); return; }
    const a = ai.get(aiKey(song));
    if (a && a.status === 'ready') { playAI(song, a.url); return; }
    const syn = window.speechSynthesis;
    const AC = window.AudioContext || window.webkitAudioContext;
    let band = null;
    try { band = AC ? createBand(song, AC) : null; } catch (e) { band = null; }
    if (band) band.start();
    const flat = song.sections.flatMap((sec) => sec.lines.map((ln) => ({ ln, kind: sec.kind })));
    const rate = clamp(0.85 + song.tempo / 220, 1.15, 1.5);   // hızlı: 108 bpm ≈ 1.34×, 137 bpm ≈ 1.47×
    const tr = syn ? syn.getVoices().find((v) => /^tr/i.test(v.lang)) : null;
    let i = 0, stopped = false, curKind = '', timers = [];
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const done = () => { stopSong(); };
    const next = () => {
      if (stopped) return;
      ui.querySelectorAll('.sk-line.now').forEach((e) => e.classList.remove('now'));
      if (i >= flat.length) { later(done, 1400); return; }
      const { ln, kind } = flat[i], idx = i++;
      if (band && kind !== curKind) { curKind = kind; band.setKind(kind); }
      const el = ui.querySelector(`[data-li="${idx}"]`);
      if (el) { el.classList.add('now'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      const words = ln.text.split(/\s+/).filter(Boolean);
      const mel = melodyFor(ln.text, words.length, kind);
      const est = (ln.text.length * 0.062 + 0.3) / rate;         // saniye (tahmini)
      let sung = false;
      const sing = () => {
        if (!band || sung || stopped) return; sung = true;
        const t0 = band.ac.currentTime + 0.02, tot = words.reduce((a, w) => a + w.length + 2, 0);
        let off = 0;
        words.forEach((w, k) => { const d = ((w.length + 2) / tot) * est; band.lead(mel[k], t0 + off, d * 0.92, kind === 'chorus' ? 0.2 : 0.15); off += d; });
      };
      // satır bitince bir sonraki vuruşa oturt: ritimden kopmasın
      const after = () => { if (stopped) return; later(next, (band ? band.msToBeat() : 120) + 40); };
      if (!syn) { sing(); later(after, est * 1000); return; }
      const u = new SpeechSynthesisUtterance(ln.text);
      u.lang = 'tr-TR'; u.rate = rate; u.volume = 1;
      u.pitch = clamp(0.95 + mel[0] * 0.06 + (kind === 'chorus' ? 0.12 : 0), 0.6, 1.8);
      if (tr) u.voice = tr;
      u.onstart = sing; u.onend = after; u.onerror = () => later(next, 300);
      syn.speak(u);
      later(sing, 700);                                           // onstart gelmeyen tarayıcılar için
    };
    if (!syn) ctx.toast('Bu cihazda sesli okuma yok; sadece müzik ve ezgi çalar');
    playing = { stop() { stopped = true; timers.forEach(clearTimeout); if (syn) syn.cancel(); if (band) band.stop(); } };
    ui.querySelectorAll('[data-play]').forEach((b) => { b.textContent = '⏹ Durdur'; });
    later(next, band ? band.msToBar() + 120 : 200);              // ilk satır bir ölçü sonra girer
  }

  // ---------- Fazlar ----------
  function buildWrite(s) {
    text = s.myAction ? s.myAction.text : ''; submitted = !!s.myAction;
    ui.innerHTML = `<div class="sk-card"><span class="sk-n">1/2 · Dizeni yaz</span><b>Ortak şarkıya bir dize ekle 🎶</b>
      <small>Herkesin dizesi tek bir şarkıda birleşir. Komik, duygusal, saçma — sen bilirsin!</small>
      <textarea class="sk-in" maxlength="${S.TEXT_MAX}" rows="3" placeholder="Örn: Çay demle, hayat güzel"${submitted ? ' disabled' : ''}>${esc(text)}</textarea>
      <div class="sk-row"><span class="sk-cnt" id="skCnt">${text.length}/${S.TEXT_MAX}</span><button class="btn ok" id="skSend"${submitted ? ' disabled' : ''}>${submitted ? 'Gönderildi ✓' : 'Gönder'}</button></div>
      <div class="sk-wait" id="skWait"></div></div>`;
    const ta = ui.querySelector('.sk-in');
    ta.addEventListener('input', () => { text = ta.value; ui.querySelector('#skCnt').textContent = `${text.length}/${S.TEXT_MAX}`; });
    ui.querySelector('#skSend').onclick = () => {
      if (submitted || ctx.phase() !== 'plan') return;
      if (text.trim().length < 2) { ctx.toast('Biraz daha uzun yaz 🙂'); return; }
      submitted = true; sfx('pop'); ctx.submit();
      ta.disabled = true; const b = ui.querySelector('#skSend'); b.disabled = true; b.textContent = 'Gönderildi ✓';
    };
  }
  function songHTML(song, rate) {
    let li = 0;
    return `<div class="sk-song"><div class="sk-title">🎼 ${esc(song.title)} <small>${song.tempo} bpm · ${song.mode === 'minor' ? 'hüzünlü' : 'neşeli'}</small></div><button class="btn" data-play>▶ Şarkıyı dinle</button>
      ${song.sections.map((sec) => `<div class="sk-sec k-${sec.kind || 'verse'}"><span>${esc(sec.name)}</span>${sec.lines.map((ln) => {
        const i = li++;
        return `<div class="sk-line${ln.cid ? '' : ' fill'}" data-li="${i}"><div class="sk-t">${esc(ln.text)}</div>${ln.cid && rate ? rate(ln) : ''}</div>`;
      }).join('')}</div>`).join('')}</div>`;
  }
  function buildVote(s) {
    const G = s.g; votes = s.myAction ? { ...s.myAction.votes } : {}; submitted = !!s.myAction;
    const rate = (ln) => {
      const c = G.contribs.find((x) => x.cid === ln.cid);
      if (!c) return '';
      if (c.mine) return '<div class="sk-mine">⭐ Senin dizen (oy veremezsin)</div>';
      return `<div class="sk-stars" data-cid="${c.cid}">${[1, 2, 3, 4, 5].map((n) => `<button data-v="${n}" aria-label="${n} puan">★</button>`).join('')}</div>`;
    };
    ui.innerHTML = `<div class="sk-card"><span class="sk-n">2/2 · Oyla</span><b>Dinle, sonra dizelere 1–5 puan ver</b>
      <small>Kim yazdı belli değil. Kendi dizene oy veremezsin. Boş bıraktığın dize oy almaz.</small></div>
      ${songHTML(G.song, rate)}
      <div class="sk-send"><button class="btn ok" id="skVote">${submitted ? 'Oylar gönderildi ✓' : 'Oyları gönder'}</button></div>`;
    ui.querySelector('[data-play]').onclick = () => playSong(G.song);
    aiPrefetch(G.song);
    ui.querySelector('.sk-song').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b || submitted || ctx.phase() !== 'plan') return;
      votes[b.parentNode.dataset.cid] = Number(b.dataset.v); sfx('tick'); paintStars();
    });
    ui.querySelector('#skVote').onclick = () => { if (!submitted && ctx.phase() === 'plan') sendVotes(); };
    paintStars();
  }
  function paintStars() {
    ui.querySelectorAll('.sk-stars').forEach((el) => {
      const v = votes[el.dataset.cid] || 0;
      el.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= v));
    });
  }
  function sendVotes() { submitted = true; sfx('pop'); const b = ui.querySelector('#skVote'); if (b) { b.disabled = true; b.textContent = 'Oylar gönderildi ✓'; } ctx.submit(); }

  function revealWrite(e) {
    stopSong();
    ui.innerHTML = `<div class="sk-card center"><span class="sk-n">Şarkı hazır!</span><b class="big">🎼 ${esc(e.title)}</b>
      <small>${e.count} dize birleşti${e.missing && e.missing.length ? ` · ${e.missing.map((id) => esc(pName(id))).join(', ')} dize yazmadı` : ''}</small></div>`;
    sfx('finish');
  }
  function revealVote(e) {
    stopSong();
    const medal = ['🥇', '🥈', '🥉'];
    ui.innerHTML = `<div class="sk-card center"><span class="sk-n">Sonuçlar</span><b class="big">🎼 ${esc(e.title)}</b>
      ${e.anyFinal ? '' : '<small>Yeterli oy toplanamadı, sonuçlar kesinleşmedi.</small>'}</div>
      <div class="sk-res">${e.results.map((r) => `<div class="sk-r${r.rank === 1 && r.final ? ' win' : ''}${r.pid === playerId ? ' me' : ''}">
        <span class="sk-rk">${r.final ? (medal[r.rank - 1] || r.rank) : '–'}</span>${face(r.pid)}
        <div class="sk-rt"><b>${esc(r.pid === playerId ? 'Sen' : pName(r.pid))}</b><div>${esc(r.text)}</div></div>
        <div class="sk-rs">${r.n ? `<b>${r.avg.toFixed(2)}</b><small>${r.n} oy · ${r.fives}×5</small>` : '<small>oy yok</small>'}${r.n && !r.final ? '<small>⚠️ az oy</small>' : ''}</div></div>`).join('')}</div>
      <div class="sk-send"><button class="btn" data-play>▶ Şarkıyı dinle</button></div>`;
    ui.querySelector('[data-play]').onclick = () => playSong(e.song);
    aiPrefetch(e.song);
    sfx('finish');
  }
  // sonuç ekranında dinlenebilsin diye şarkı satırları ayrı gerekmez; sade dinleme için dizeler sırayla okunur
  function rebuild(s) {
    const k = `${s.seq}:${s.round}`;
    if (k === key) return;
    key = k; autoSent = false; stopSong();
    if (s.g.phase === 'write') buildWrite(s); else buildVote(s);
  }

  const client = {
    kind: 'sarki',
    supports3D: false,
    onState(s) {
      if (s.status !== 'playing' || anim || !s.g) return;
      rebuild(s);
      if (s.g.phase === 'write') {
        const w = ui.querySelector('#skWait');
        if (w) w.textContent = submitted ? '⏳ Diğerleri yazıyor…' : '';
      }
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      if (e.phase === 'write') revealWrite(e); else revealVote(e);
    },
    revealTotal: (e) => e.dur || S.REVEAL_VOTE_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || S.REVEAL_VOTE_MS) && anim.e.phase === 'write') { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      else if (anim && now - anim.t0 > (anim.e.dur || S.REVEAL_VOTE_MS)) anim = null;
      const t = now / 5000;
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, `hsl(${(t * 40 + 270) % 360}, 55%, 20%)`); gr.addColorStop(1, `hsl(${(t * 40 + 330) % 360}, 55%, 14%)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.arc((Math.sin(t * 2 + i) * 0.5 + 0.5) * W, (Math.cos(t * 1.4 + i * 2) * 0.5 + 0.5) * H, (50 + i * 22) * DPR, 0, Math.PI * 2); g.fill(); }
      if (!s.g || anim) return anim ? (anim.e.phase === 'write' ? '🎼 Şarkı hazırlanıyor…' : '🏆 Sonuçlar!') : '';
      if (s.status === 'playing' && ph === 'plan') {
        const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000);
        if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); }
        // süre bitmek üzereyken yazılan/oylanan otomatik gönderilir
        if (!submitted && !autoSent && s.deadline - ctx.serverNow() < 1500) {
          if (s.g.phase === 'write' && text.trim().length >= 2) { autoSent = true; submitted = true; ctx.submit(); }
          else if (s.g.phase === 'vote' && Object.keys(votes).length) { autoSent = true; sendVotes(); }
        }
        const left = clamp((s.deadline - ctx.serverNow()) / (s.g.phase === 'write' ? S.WRITE_MS : S.VOTE_MS), 0, 1);
        const cx = W - 34 * DPR, cy = 34 * DPR, r = 22 * DPR;
        g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = left < 0.3 ? '#ef4444' : '#facc15'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.font = `900 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sec, cx, cy);
      }
      return s.g.phase === 'write' ? '✍️ Dizeni yaz' : '🗳️ Oyla';
    },
    hint: () => null,
    hideReady: () => true,
    panel() { return ''; },
    action() {
      const s = ctx.state();
      if (s.g.phase === 'write') return text.trim().length >= 2 ? { text: text.trim() } : null;
      return { votes: { ...votes } };
    },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? (s.g.phase === 'write' ? 'Dize yaz' : 'Oyla') : ''; },
    dispose() { stopSong(); ui.remove(); },
  };
  return client;
}
