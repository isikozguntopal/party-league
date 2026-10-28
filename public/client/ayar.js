// 🎯 Ayar istemcisi: anlatıcı ipucu yazar, diğerleri kadranı çevirir; açılışta hedef ve tahminler görünür.
import * as A from '../games/ayar.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

const COLORS = ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#3b82f6'];
const BAND_COL = ['#dc2626', '#f59e0b', '#fde68a', '#93c5fd'];     // 4,3,2,1 puan bantları (merkezden dışa)

// Yarım daire kadran (SVG). target: gizli değer (varsa bantlar çizilir), needles: [{v, color, label}]
function dialSVG(axis, { target = null, needles = [], cover = false } = {}) {
  const cx = 160, cy = 160, R = 140;
  const ang = (v) => Math.PI - (v / 100) * Math.PI;
  const pt = (v, r) => [cx + Math.cos(ang(v)) * r, cy - Math.sin(ang(v)) * r];
  const wedge = (a, b, col, r = R) => { const [x1, y1] = pt(clamp(a, 0, 100), r), [x2, y2] = pt(clamp(b, 0, 100), r); return `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${col}"/>`; };
  let svg = `<svg viewBox="0 0 320 190" class="ay-dial"><path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy} Z" fill="#f4e4bc" stroke="#1f2937" stroke-width="5"/>`;
  if (target !== null) for (let i = A.BANDS.length - 1; i >= 0; i--) { const w = A.BANDS[i][0]; svg += wedge(target - w, target + w, BAND_COL[i]); }
  for (let v = 0; v <= 100; v += 5) { const [x1, y1] = pt(v, R - (v % 25 === 0 ? 14 : 8)), [x2, y2] = pt(v, R - 2); svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1f2937" stroke-width="${v % 25 === 0 ? 3 : 1.5}"/>`; }
  if (cover) svg += `<path d="M${cx - R + 4},${cy} A${R - 4},${R - 4} 0 0 1 ${cx + R - 4},${cy} Z" fill="#7c2d12" opacity=".92"/><text x="${cx}" y="${cy - 55}" text-anchor="middle" font-size="46" font-weight="900" fill="#fde68a">?</text>`;
  for (const n of needles) { const [x, y] = pt(n.v, R - 10); svg += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${n.color}" stroke-width="${n.big ? 6 : 4}" stroke-linecap="round"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n.big ? 9 : 7}" fill="${n.color}" stroke="#fff" stroke-width="2"/>`; if (n.label) { const [lx, ly] = pt(n.v, R + 14); svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(n.label)}</text>`; } }
  svg += `<circle cx="${cx}" cy="${cy}" r="12" fill="#e9b949" stroke="#1f2937" stroke-width="4"/></svg>`;
  return `<div class="ay-dialbox">${svg}<div class="ay-ends"><b>${esc(axis[0])}</b><b>${esc(axis[1])}</b></div></div>`;
}

export function createAyar(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'ay';
  ctx.stage.appendChild(ui);
  let left = '', right = '', key = '', anim = null, guess = 50, submitted = false, clueText = '', lastTick = 0;
  const nm = (id) => (id === playerId ? 'Sen' : pName(id));
  const face = (id) => { const p = pById(id) || { look: null, color: '#888' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };

  function build(s) {
    const G = s.g, giver = G.giver === playerId;
    submitted = !!s.myAction;
    if (G.phase === 'clue') {
      clueText = (s.myAction && s.myAction.clue) || ''; left = (s.myAction && s.myAction.left) || G.axis[0]; right = (s.myAction && s.myAction.right) || G.axis[1];
      ui.innerHTML = `<div class="ay-card"><span class="ay-n">Anlatıcı ${G.turn}/${G.turns}</span><b>${giver ? 'Gizli noktayı yalnız sen görüyorsun' : `${esc(nm(G.giver))} ipucu yazıyor…`}</b>
        <small>${giver ? 'Tek bir ipucu yaz: hedefe ne kadar yakın anlatabilirsen herkes o kadar puan alır.' : 'Anlatıcı bekleniyor. İki uç arasında bir yer var, ipucuna göre kadranı çevireceksin.'}</small></div>
        ${dialSVG(G.axis, { target: giver ? G.target : null, cover: !giver })}
        ${giver ? `<div class="ay-ends-edit"><label>◀ Sol uç<input id="ayLeft" maxlength="22" value="${esc(left)}" autocomplete="off"></label><label>Sağ uç ▶<input id="ayRight" maxlength="22" value="${esc(right)}" autocomplete="off"></label></div><small class="ay-note">İstersen iki uçtaki yazıları kendin değiştirebilirsin.</small>
          <div class="ay-send"><input id="ayClue" maxlength="60" placeholder="İpucun (kısa)" value="${esc(clueText)}" autocomplete="off"><button class="btn ok" id="aySend">${submitted ? 'Gönderildi ✓' : 'İpucunu gönder'}</button></div>` : ''}`;
      if (giver) $('#aySend').onclick = () => { const v = $('#ayClue').value.trim(); if (v.length < 2) { ctx.toast('İpucun çok kısa'); return; } clueText = v; left = $('#ayLeft').value.trim() || G.axis[0]; right = $('#ayRight').value.trim() || G.axis[1]; submitted = true; sfx('pop'); ctx.submit(); $('#aySend').textContent = 'Gönderildi ✓'; };
      if (giver) { const live = () => { const ends = ui.querySelector('.ay-ends'); if (ends) ends.innerHTML = `<b>${esc($('#ayLeft').value || G.axis[0])}</b><b>${esc($('#ayRight').value || G.axis[1])}</b>`; }; $('#ayLeft').oninput = live; $('#ayRight').oninput = live; }
    } else {
      guess = s.myAction && s.myAction.v !== undefined ? s.myAction.v : 50;
      const draw = () => dialSVG(G.axis, { needles: [{ v: guess, color: COLORS[0], big: true }] });
      ui.innerHTML = `<div class="ay-card"><span class="ay-n">Anlatıcı ${G.turn}/${G.turns} · ${esc(nm(G.giver))}</span><b class="ay-clue">“${esc(G.clue || '')}”</b>
        <small>${giver ? 'Arkadaşların kadranı çeviriyor…' : 'Kadranı hedefin olduğunu düşündüğün yere çevir ve kilitle.'}</small></div>
        <div id="ayDial">${draw()}</div>
        ${giver ? '' : `<div class="ay-send"><input type="range" id="ayRange" min="0" max="100" step="0.5" value="${guess}"${submitted ? ' disabled' : ''}><button class="btn ok" id="aySend"${submitted ? ' disabled' : ''}>${submitted ? 'Kilitlendi ✓' : 'Kilitle'}</button></div>`}`;
      if (!giver) {
        $('#ayRange').oninput = (e) => { guess = Number(e.target.value); $('#ayDial').innerHTML = draw(); };
        $('#aySend').onclick = () => { submitted = true; sfx('pop'); ctx.submit(); $('#aySend').disabled = true; $('#aySend').textContent = 'Kilitlendi ✓'; $('#ayRange').disabled = true; };
      }
    }
  }
  function revealHTML(e) {
    const needles = e.rows.filter((r) => r.v !== null).map((r, i) => ({ v: r.v, color: COLORS[(i + 1) % COLORS.length], label: r.id === playerId ? 'Sen' : nm(r.id) }));
    return `<div class="ay-card"><span class="ay-n">${esc(nm(e.giver))} anlattı</span><b class="ay-clue">“${esc(e.clue)}”</b></div>
      ${dialSVG(e.axis, { target: e.target, needles })}
      <div class="ay-rows">${e.rows.slice().sort((a, b) => b.pts - a.pts).map((r) => `<div class="ay-row${r.id === playerId ? ' me' : ''}">${face(r.id)}<b>${esc(nm(r.id))}</b><em>${r.v === null ? 'tahmin yok' : 'sapma ' + r.err.toFixed(0)}</em><i>+${r.pts}</i></div>`).join('')}
        <div class="ay-row giver">${face(e.giver)}<b>${esc(nm(e.giver))} (anlatıcı)</b><em>ortalama</em><i>+${e.giverPts}</i></div></div>`;
  }
  const client = {
    kind: 'ayar', supports3D: false,
    onState(s) { if (s.status !== 'playing' || !s.g || anim) return; const k = `${s.seq}:${s.round}`; if (k !== key) { key = k; build(s); } },
    onEntry(e, skip) { if (e.phase !== 'guess') return; anim = { e, t0: performance.now() - skip }; ui.innerHTML = revealHTML(e); sfx('finish'); },
    revealTotal: (e) => (e.phase === 'guess' ? e.dur || A.REVEAL_MS : 0),
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state(), { W, H } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || A.REVEAL_MS)) { anim = null; key = ''; if (s.status === 'playing') client.onState(s); }
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2b1d0e'); gr.addColorStop(1, '#14100a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (s.status === 'playing' && ph === 'plan' && !anim) { const sec = Math.ceil(Math.max(0, s.deadline - ctx.serverNow()) / 1000); if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); } }
      return anim ? '🎯 Hedef açıldı' : s.g && s.g.phase === 'clue' ? '✍️ İpucu yazılıyor' : '🎯 Kadranı çevir';
    },
    hint: () => null, hideReady: () => true, panel: () => '',
    ownPanel(chip) { const s = ctx.state(), list = s.players.filter((p) => p.inGame && !p.left); return `<div class="chips">${list.map((p) => chip(p.id, s.ready.includes(p.id) ? 'ready' : '', s.ready.includes(p.id) ? ' ✓' : ' …')).join('')}</div>`; },
    action() { const s = ctx.state(); return s.g.phase === 'clue' ? { clue: clueText, left, right } : { v: guess }; },
    pointer() {},
    hud() { const s = ctx.state(); return s.g ? `Anlatıcı <b>${s.g.turn}/${s.g.turns}</b> · <b>${s.g.score[playerId] || 0}</b> puan` : ''; },
    dispose() { ui.remove(); },
  };
  return client;
}
