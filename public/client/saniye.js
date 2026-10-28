// ⏱️ Kayıp Saniye istemcisi: kronometre 3. saniyede kaybolur, hedef süre üstte yazar, DURDUR ile durdur.
// Süre sunucu saatine göre tur başlangıcından ölçülür (herkes aynı anda başlar).
import * as S from '../games/saniye.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

const fmt = (ms) => (ms / 1000).toFixed(2);

export function createSaniye(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'sn';
  ui.innerHTML = `<div class="sn-top" id="snTop"></div><div class="sn-mid" id="snMid"></div><div class="sn-res hidden" id="snRes"></div>
    <button class="sn-stop hidden" id="snStop">⏹ DURDUR</button><button class="sn-stop sn-ready hidden" id="snReady">✅ HAZIRIM</button>`;
  ctx.stage.appendChild(ui);
  let key = '', anim = null, stopped = false, myT = null, lastBeep = -1;
  const st = () => ctx.state();
  const face = (id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));

  function stop() {
    const s = st();
    if (stopped || !s || s.status !== 'playing' || ctx.phase() !== 'plan' || anim) return;
    const el = ctx.serverNow() - s.g.startAt;
    if (el < 0) return;
    stopped = true; myT = Math.max(0, el); sfx('pop'); if (navigator.vibrate) navigator.vibrate(30);
    ctx.submit();
  }
  $('#snStop').addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); });
  let readySent = false;
  $('#snReady').addEventListener('pointerdown', (e) => {
    e.preventDefault(); const s = st();
    if (readySent || !s || !s.g) return;
    readySent = true; sfx('pop'); ctx.call({ action: 'gact', seq: s.seq, round: s.round, t: 'ready' }).catch((err) => { readySent = false; ctx.toast(err.message); });
  });

  function resHTML(e) {
    const win = e.rows.find((r) => r.err !== null);
    return `<b>Hedef: ${fmt(e.target)} sn</b>
      <div class="sn-rows">${e.rows.map((r, i) => `<div class="sn-row${i === 0 && r.err !== null ? ' win' : ''}${r.id === playerId ? ' me' : ''}"><span class="n">${i + 1}</span>${face(r.id)}<b>${esc(nm(r.id))}</b>
        <em>${r.t === null ? 'durdurmadı' : fmt(r.t) + ' sn'}</em><i>${r.err === null ? '—' : (r.t < e.target ? '−' : '+') + fmt(r.err)}</i></div>`).join('')}</div>
      ${win ? `<small>🏆 ${esc(nm(win.id))} hedefe en yakın!</small>` : ''}`;
  }

  const client = {
    kind: 'saniye',
    supports3D: false,
    hideTimer: true,
    onState(s) {
      if (s.status !== 'playing' || !s.g) return;
      const k = `${s.seq}:${s.round}`;
      if (k !== key && !anim) { key = k; stopped = !!s.myAction; myT = s.myAction ? s.myAction.t : null; lastBeep = -1; readySent = false; }
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      const res = $('#snRes'); res.innerHTML = resHTML(e); res.classList.remove('hidden');
      const mine = e.rows.find((r) => r.id === playerId);
      sfx(mine && mine.err !== null && e.rows[0].id === playerId ? 'fanfare' : 'finish');
    },
    revealTotal: () => S.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = st();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > S.REVEAL_MS) { anim = null; $('#snRes').classList.add('hidden'); key = ''; if (s.status === 'playing') client.onState(s); }
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1e1b4b'); gr.addColorStop(1, '#0f172a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const top = $('#snTop'), mid = $('#snMid'), btn = $('#snStop');
      if (!s || !s.g || s.status !== 'playing') { top.innerHTML = ''; mid.innerHTML = ''; btn.classList.add('hidden'); return ''; }
      const G = s.g;
      top.innerHTML = `<small>Tur ${G.round}/${G.rounds}</small><span>HEDEF</span><b>${fmt(G.target)} sn</b>`;
      if (anim) { mid.innerHTML = ''; btn.classList.add('hidden'); return '🏁 Sonuç'; }
      const el = ctx.serverNow() - G.startAt;
      const cx = W / 2, cy = H * 0.34, r = Math.min(W * 0.4, H * 0.22);
      // analog saat kadranı: 10 saniyede bir tur; 3. saniyeden sonra kadran kapanır (akrep/yelkovan görünmez)
      const face = (hand) => {
        g.save();
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx + 3 * DPR, cy + 5 * DPR, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.lineWidth = 7 * DPR; g.strokeStyle = '#1e293b'; g.stroke();
        for (let q = 0; q < 50; q++) { const a = -Math.PI / 2 + q / 50 * Math.PI * 2, big = q % 5 === 0; g.strokeStyle = '#334155'; g.lineWidth = (big ? 3 : 1.2) * DPR; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * (big ? 0.82 : 0.88), cy + Math.sin(a) * r * (big ? 0.82 : 0.88)); g.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94); g.stroke(); }
        g.fillStyle = '#0f172a'; g.font = `900 ${Math.round(r * 0.2)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let n = 1; n <= 10; n++) { const a = -Math.PI / 2 + n / 10 * Math.PI * 2; g.fillText(String(n), cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66); }
        if (hand !== null) {
          const a = -Math.PI / 2 + (hand / 10000) * Math.PI * 2;
          g.strokeStyle = '#dc2626'; g.lineWidth = 4 * DPR; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.cos(a) * r * 0.16, cy - Math.sin(a) * r * 0.16); g.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.stroke();
        } else {                                    // kapalı: kadran karartılır
          g.fillStyle = 'rgba(15,23,42,.93)'; g.beginPath(); g.arc(cx, cy, r * 0.97, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#a78bfa'; g.font = `1000 ${Math.round(r * 0.7)}px system-ui`; g.fillText('?', cx, cy + r * 0.04);
        }
        g.fillStyle = '#0f172a'; g.beginPath(); g.arc(cx, cy, r * 0.06, 0, Math.PI * 2); g.fill();
        g.restore();
      };
      const rb = $('#snReady');
      if (!G.started && el < 0 && ctx.serverNow() < G.startAt - G.countMs) {              // herkesin hazır olması bekleniyor
        const mine = readySent || G.ready.includes(playerId), cnt = `${G.ready.length}/${G.need.length}`;
        face(null); btn.classList.add('hidden'); rb.classList.toggle('hidden', mine);
        mid.innerHTML = `<div class="sn-cap">${mine ? '✅ Hazırsın' : 'Hazır olunca HAZIRIM\'a bas'} · <b>${cnt}</b> hazır<br><small>Herkes hazır olunca 3-2-1 başlar</small></div>`;
        return '⏱️ Herkes bekleniyor';
      }
      rb.classList.add('hidden');
      if (el < 0) {
        const c = Math.ceil(-el / 1000);
        face(0); mid.innerHTML = `<div class="sn-cap big">${c}</div>`; btn.classList.add('hidden');
        if (c !== lastBeep) { lastBeep = c; sfx('tick'); }
        return '⏱️ Hazır ol!';
      }
      if (stopped) { face(null); mid.innerHTML = '<div class="sn-cap">✓ Durdurdun. Diğerleri bekleniyor…</div>'; btn.classList.add('hidden'); }
      else if (el < G.showMs) { face(el); mid.innerHTML = '<div class="sn-cap">Kronometre birazdan kapanacak!</div>'; btn.classList.remove('hidden'); }
      else { face(null); mid.innerHTML = '<div class="sn-cap">İçinden say… hedefe gelince DURDUR!</div>'; btn.classList.remove('hidden'); }
      return stopped ? '' : el < G.showMs ? '👀 Süreye bak!' : '🙈 Kronometre kapalı';
    },
    hint: () => null,
    hideReady: () => true,
    ownPanel(chip) {
      const s = st(), list = s.players.filter((p) => p.inGame && !p.left);
      return `<div class="status"><small>${stopped ? 'Durdurdun ✓ diğerleri bekleniyor' : 'Kronometre 3. saniyede kaybolur. Hedefi içinden say!'}</small></div>
        <div class="chips">${list.map((p) => chip(p.id, s.ready.includes(p.id) ? 'ready' : '', s.ready.includes(p.id) ? ' ✓' : ' …')).join('')}</div>`;
    },
    panel() { return ''; },
    action() { return { t: myT === null ? 0 : Math.round(myT) }; },
    pointer() {},
    hud() { const s = st(); return s && s.g ? `Tur <b>${s.g.round}/${s.g.rounds}</b> · hedef <b>${fmt(s.g.target)}</b>` : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
