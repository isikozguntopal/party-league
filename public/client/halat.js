// 🪢 Halat Çekme istemcisi: iki takım, ortada çamur havuzu, dev ÇEK butonu
import * as HL from '../games/halat.js';
import { lerp, clamp, sfx, esc } from './util.js';
import { drawPortrait, portraitURL } from './avatar2d.js';
import { createRealtime } from './rt.js';

const TEAM = [{ name: 'Mavi Takım', c: '#3b82f6', d: '#1e3a8a' }, { name: 'Kırmızı Takım', c: '#ef4444', d: '#7f1d1d' }];

export function createHalat(ctx) {
  const { pById, playerId } = ctx;
  const g = ctx.g2d;
  let taps = 0, lastTapT = 0, shakeT = 0, winT = 0, conf = [];
  const btn = document.createElement('button');
  btn.className = 'pull-btn hidden';
  btn.innerHTML = 'ÇEK!<small>hızlı hızlı bas</small>';
  ctx.stage.appendChild(btn);
  const tap = (e) => {
    e && e.preventDefault();
    taps++; lastTapT = performance.now();
    btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
    if (taps % 2) sfx('step');
  };
  btn.addEventListener('pointerdown', tap);
  const kd = (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && !btn.classList.contains('hidden')) tap(e); };
  addEventListener('keydown', kd);

  const teams = () => { const s = ctx.state(); return (s && s.g && s.g.teams) || [[], []]; };
  const myTeam = () => teams().findIndex((m) => m.includes(playerId));

  function render(st, now, dt) {
    const { W, H, DPR } = ctx.size();
    const sk = shakeT > now ? (Math.random() - 0.5) * 6 * DPR : 0;
    // gökyüzü + çimen
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(0.45, '#bae6fd'); sky.addColorStop(0.46, '#4ade80'); sky.addColorStop(1, '#15803d');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 4; i++) { const x = ((now / 60 + i * 300 * DPR) % (W + 200 * DPR)) - 100 * DPR, y = H * (0.08 + i * 0.07); g.beginPath(); g.ellipse(x, y, 50 * DPR, 14 * DPR, 0, 0, Math.PI * 2); g.ellipse(x + 30 * DPR, y - 8 * DPR, 30 * DPR, 12 * DPR, 0, 0, Math.PI * 2); g.fill(); }
    if (!st) return 'Bekleniyor…';
    g.save(); g.translate(sk, 0);
    const p = clamp(st.p, -1.2, 1.2);
    const cx = W / 2, gy = H * 0.5, span = Math.min(W * 0.36, 260 * DPR);
    const shift = p * span * 0.55;
    // çamur havuzu
    g.fillStyle = '#7c4a1e'; g.beginPath(); g.ellipse(cx, gy + 22 * DPR, span * 0.42, 22 * DPR, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9a5b25'; g.beginPath(); g.ellipse(cx, gy + 19 * DPR, span * 0.36, 15 * DPR, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) { const bx = cx + Math.sin(now / 700 + i * 2) * span * 0.25, r = (2 + ((now / 300 + i) % 3)) * DPR; g.fillStyle = 'rgba(60,30,10,.5)'; g.beginPath(); g.arc(bx, gy + 19 * DPR, r, 0, Math.PI * 2); g.fill(); }
    // kazanma çizgileri
    for (const s of [-1, 1]) { g.fillStyle = s < 0 ? TEAM[0].c : TEAM[1].c; g.fillRect(cx + s * span * 0.55 - 2 * DPR, gy - 4 * DPR, 4 * DPR, 50 * DPR); }
    // halat
    const ropeY = gy - 2 * DPR;
    g.strokeStyle = '#a16207'; g.lineWidth = 7 * DPR; g.lineCap = 'round';
    g.beginPath(); g.moveTo(16 * DPR + shift, ropeY); g.quadraticCurveTo(cx + shift, ropeY + 6 * DPR + Math.sin(now / 90) * 2 * DPR, W - 16 * DPR + shift, ropeY); g.stroke();
    g.strokeStyle = '#ca8a04'; g.lineWidth = 2 * DPR; g.setLineDash([5 * DPR, 6 * DPR]);
    g.beginPath(); g.moveTo(16 * DPR + shift, ropeY - 1 * DPR); g.quadraticCurveTo(cx + shift, ropeY + 5 * DPR, W - 16 * DPR + shift, ropeY - 1 * DPR); g.stroke(); g.setLineDash([]);
    // bayrak
    const fx = cx + shift;
    g.fillStyle = '#111'; g.fillRect(fx - 1.5 * DPR, ropeY - 34 * DPR, 3 * DPR, 36 * DPR);
    g.fillStyle = Math.abs(p) < 0.15 ? '#facc15' : p < 0 ? TEAM[0].c : TEAM[1].c;
    g.beginPath(); g.moveTo(fx + 1.5 * DPR, ropeY - 34 * DPR); g.lineTo(fx + 22 * DPR + Math.sin(now / 120) * 3 * DPR, ropeY - 27 * DPR); g.lineTo(fx + 1.5 * DPR, ropeY - 20 * DPR); g.fill();
    // takımlar
    const ts = teams();
    ts.forEach((m, ti) => {
      const side = ti === 0 ? -1 : 1;
      m.forEach((id, i) => {
        const pl = pById(id) || { look: null, color: '#888', name: '?' };
        const rate = (st.rates && st.rates[id]) || 0;
        const x = cx + side * (span * 0.75 + i * 46 * DPR) + shift;
        const lean = clamp(rate / 12, 0, 1);
        const bob = Math.sin(now / (60 + 40 * (1 - lean)) + i) * 2 * DPR * (0.3 + lean);
        drawPuller(pl, x, gy, side, lean, bob, DPR, id === playerId, ti);
      });
    });
    // konfeti
    conf = conf.filter((c) => (c.t += dt) < 3);
    for (const c of conf) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 300 * DPR * dt; g.fillStyle = c.c; g.fillRect(c.x, c.y, 6 * DPR, 9 * DPR); }
    g.restore();
    // takım başlıkları
    g.font = `900 ${13 * DPR}px system-ui`; g.textBaseline = 'top';
    TEAM.forEach((tm, i) => {
      g.textAlign = i ? 'right' : 'left'; g.fillStyle = tm.d;
      g.fillText(`${tm.name}${myTeam() === i ? ' (sen)' : ''}`, i ? W - 10 * DPR : 10 * DPR, gy + 52 * DPR);
    });
    // geri sayım
    if (st.phase === 'count' || st.phase === 'wait') {
      const n = st.phase === 'wait' ? '…' : String(Math.max(1, Math.ceil(st.cd)));
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${Math.round(90 * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff';
      g.strokeText(n, W / 2, H * 0.25); g.fillText(n, W / 2, H * 0.25);
      return st.phase === 'wait' ? '📡 Herkes bağlanıyor…' : `🪢 Sen ${myTeam() >= 0 ? TEAM[myTeam()].name : 'izleyicisin'}!`;
    }
    if (st.phase === 'pull') {
      g.font = `900 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = '#fff';
      g.fillText(`⏱️ ${Math.max(0, 30 - st.el).toFixed(0)}`, W / 2, 10 * DPR);
    }
    if (st.winner !== null && st.winner !== undefined) {
      const won = myTeam() === st.winner;
      return myTeam() < 0 ? `🏆 ${TEAM[st.winner].name} kazandı!` : won ? '🏆 Kazandınız!' : '💦 Çamura düştünüz!';
    }
    if (myTeam() >= 0 && now - lastTapT > 1500 && st.phase === 'pull') return '👆 ÇEK butonuna bas!';
    return '';
  }

  // Yandan görünüm: portre kafa + geriye yaslanan gövde
  function drawPuller(pl, x, gy, side, lean, bob, DPR, me, ti) {
    const s = 34 * DPR, a = -side * (0.15 + lean * 0.45);
    g.save(); g.translate(x, gy + 26 * DPR); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 2 * DPR, 16 * DPR, 4 * DPR, 0, 0, Math.PI * 2); g.fill();
    // bacaklar
    g.strokeStyle = '#1f2937'; g.lineWidth = 6 * DPR; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-5 * DPR, -2 * DPR); g.lineTo(-3 * DPR, -22 * DPR); g.moveTo(5 * DPR, -2 * DPR); g.lineTo(3 * DPR, -22 * DPR); g.stroke();
    // gövde
    g.fillStyle = TEAM[ti].c; g.fillRect(-9 * DPR, -44 * DPR + bob, 18 * DPR, 24 * DPR);
    // kollar halata
    g.strokeStyle = '#f1c27d'; g.lineWidth = 5 * DPR;
    g.beginPath(); g.moveTo(0, -38 * DPR + bob); g.lineTo(-side * 16 * DPR, -28 * DPR); g.stroke();
    // kafa
    drawPortrait(g, pl.look, pl.color, -s / 2, -44 * DPR - s + bob, s, { bg: false });
    g.restore();
    if (me) {
      g.font = `900 ${10 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#fff';
      g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText('SEN', x, gy - 52 * DPR); g.fillText('SEN', x, gy - 52 * DPR);
    }
  }

  const spec = {
    kind: 'halat', mod: HL, views: ['top'],
    controls: { left: 'stick', buttons: [] },
    showControls: () => false,
    onState(s, playing) { btn.classList.toggle('hidden', !(playing && myTeam() >= 0)); },
    input: () => ({ taps }),
    setBot: (sim, id) => { if (sim.ps[id]) sim.ps[id].bot = true; },
    interp(a, b, k) { return { ...b, p: lerp(a.p, b.p, k), el: lerp(a.el, b.el, k) }; },
    onEvents(evs) {
      for (const e of evs) {
        if (e.e === 'beep') sfx('tick');
        if (e.e === 'go') sfx('finish');
        if (e.e === 'win') {
          const { W, H, DPR } = ctx.size();
          winT = performance.now(); shakeT = winT + 500;
          sfx(myTeam() === e.team ? 'fanfare' : 'fall');
          for (let i = 0; i < 70; i++) conf.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H * 0.3, vx: (Math.random() - 0.5) * 500 * DPR, vy: -Math.random() * 500 * DPR, t: 0, c: ['#facc15', '#f472b6', '#60a5fa', '#34d399'][i % 4] });
        }
      }
    },
    render,
    panel(st) {
      const ts = teams();
      const chip = (id) => { const p = pById(id) || { name: '?', color: '#888' }; return `<span class="chip${id === playerId ? ' cur' : ''}"><img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">${esc(p.name)}${p.temp ? ' 🤖' : ''}</span>`; };
      return `<div class="race-board"><span class="chip" style="background:${TEAM[0].c}">🔵</span>${ts[0].map(chip).join('')}</div><div class="race-board"><span class="chip" style="background:${TEAM[1].c}">🔴</span>${ts[1].map(chip).join('')}</div>`;
    },
    hud(st) { const m = myTeam(); return m < 0 ? '👀 İzliyorsun' : `${m ? '🔴' : '🔵'} ${TEAM[m].name} · ${taps} çekiş`; },
    dispose() { btn.remove(); removeEventListener('keydown', kd); },
  };
  return createRealtime(ctx, spec);
}
