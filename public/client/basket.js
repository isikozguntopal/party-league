// 🏀 Pota Atışı istemcisi: parmağınla geri çek, bırak. 45 sn, pota hareket eder, arka arkaya sayılar puanı katlar.
// Her oyuncu kendi ekranında oynar (fizik games/basket.js); süre bitince sonuç sunucuya gider, sıralama oradan gelir.
import * as B from '../games/basket.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

export function createBasket(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'bk';
  ctx.stage.appendChild(ui);
  let key = '', anim = null, startAt = null, ended = false, lastSend = 0, lastTick = 0;
  let spawn = B.randomSpawn(), ball = B.newBall(spawn), sc = B.newScore(), aim = null, popups = [], netSwing = 0, flash = 0, lastNow = 0, spin = 0, trail = [], combo = { t: 0, text: '' };
  const face = (id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="">`; };

  function reset(s) {
    key = `${s.seq}:${s.round}`; startAt = null; ended = false; lastSend = 0; spawn = B.randomSpawn(); ball = B.newBall(spawn); sc = B.newScore(); aim = null; popups = []; trail = []; netSwing = 0; combo = { t: 0, text: '' };
  }

  // ---- dünya → ekran ----
  function view(W, H) {
    const S = Math.min(W / B.W, H / B.H), ox = (W - B.W * S) / 2, oy = (H - B.H * S) / 2;
    return { S, X: (x) => ox + x * S, Y: (y) => H - oy - y * S };
  }

  // ---- çizim ----
  // taraftarlar: sabit tohumdan üretilir (her karede aynı), hafifçe zıplar
  const FANS = (() => { let a = 7; const r = () => (a = (a * 16807) % 2147483647) / 2147483647; const out = []; for (let row = 0; row < 5; row++) for (let i = 0; i < 12; i++) out.push({ row, i, dx: r() - 0.5, skin: ['#f5c9a4', '#e0a070', '#b9784a', '#7a4a2a', '#fbd9bd'][Math.floor(r() * 5)], shirt: ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316', '#ec4899', '#a78bfa', '#ffffff'][Math.floor(r() * 8)], ph: r() * 6, arms: r() < 0.4, flag: r() < 0.08 }); return out; })();
  function drawCourt(W, H, V, t) {
    const { S, X, Y } = V;
    const fy = Y(0), tribH = fy * 0.95;
    const gr = g.createLinearGradient(0, 0, 0, fy); gr.addColorStop(0, '#0f172a'); gr.addColorStop(1, '#312e81');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // spot ışıkları
    g.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * W; g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x + 70 * (W / 390), tribH); g.lineTo(x - 70 * (W / 390), tribH); g.fill(); }
    // tribün: koyu siluet kalabalık (yüz çizmeden), takım renkli formalar; oyun alanını boğmasın diye üst yarıda ve loş
    const now = performance.now() / 1000, cheer = 1 + Math.min(1, flash) * 1.4;
    for (let row = 0; row < 4; row++) {
      const k = (row + 1) / 4, ry = tribH * (0.2 + row * 0.11), sz = S * (0.26 + k * 0.1);
      g.fillStyle = `rgba(12,14,36,${0.5 - row * 0.06})`; g.fillRect(0, ry - sz * 0.6, W, sz * 1.9);
      for (const f of FANS) {
        if (f.row !== row) continue;
        const x = (f.i + 0.5 + f.dx * 0.6) / 12 * W, bob = Math.abs(Math.sin(now * (2.6 + row * 0.3) * cheer + f.ph)) * sz * 0.2 * cheer;
        const y = ry - bob;
        g.fillStyle = f.shirt; g.globalAlpha = 0.55 + k * 0.2; g.beginPath(); g.ellipse(x, y + sz * 0.62, sz * 0.62, sz * 0.5, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#1b1530'; g.globalAlpha = 0.95; g.beginPath(); g.arc(x, y, sz * 0.36, 0, 7); g.fill();
        g.globalAlpha = 1;
        if (f.arms && (flash > 0 || (Math.floor(now * 1.3 + f.ph) % 3 === 0))) { g.strokeStyle = '#1b1530'; g.lineWidth = sz * 0.16; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + sz * 0.35, y + sz * 0.4); g.lineTo(x + sz * 0.6, y - sz * 0.5 + Math.sin(now * 6 + f.ph) * sz * 0.1); g.stroke(); g.lineCap = 'butt'; }
        if (f.flag) { g.strokeStyle = '#e5e7eb'; g.lineWidth = Math.max(1, sz * 0.05); g.beginPath(); g.moveTo(x + sz * 0.5, y + sz * 0.3); g.lineTo(x + sz * 0.5, y - sz * 1.0); g.stroke(); g.fillStyle = f.shirt; g.beginPath(); g.moveTo(x + sz * 0.5, y - sz * 1.0); g.lineTo(x + sz * 1.05, y - sz * 0.82 + Math.sin(now * 6 + f.ph) * sz * 0.08); g.lineTo(x + sz * 0.5, y - sz * 0.62); g.fill(); }
        // kamera flaşları
        if (f.flag === false && f.arms && Math.sin(now * 3 + f.ph * 9) > 0.985) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x + sz * 0.1, y - sz * 0.1, sz * 0.18, 0, 7); g.fill(); }
      }
    }
    g.fillStyle = 'rgba(8,10,30,.28)'; g.fillRect(0, 0, W, tribH);   // alanı öne çıkaran loşluk
    // reklam panosu
    g.fillStyle = '#b91c1c'; g.fillRect(0, fy - S * 0.55, W, S * 0.55);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `900 ${S * 0.3}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) g.fillText('PARTİ LİGİ', W * (0.18 + i * 0.32), fy - S * 0.27);
    // parke
    const fl = g.createLinearGradient(0, fy, 0, H); fl.addColorStop(0, '#d97706'); fl.addColorStop(1, '#92400e');
    g.fillStyle = fl; g.fillRect(0, fy, W, H - fy + 2);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = Math.max(2, S * 0.05); g.beginPath(); g.moveTo(0, fy); g.lineTo(W, fy); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, fy + (H - fy) * i / 6); g.lineTo(W, fy + (H - fy) * i / 6); g.stroke(); }
    // saha çizgileri: orta daire yarısı ve serbest atış alanı (sağda pota tarafı)
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(2, S * 0.04);
    g.beginPath(); g.arc(X(B.W * 0.5), fy, S * 1.4, Math.PI, 2 * Math.PI); g.stroke();
    g.strokeRect(X(B.W - 2.6), fy + (H - fy) * 0.18, S * 2.6 + 4, (H - fy) * 0.64);
  }
  function drawHoop(W, H, V, t, dt) {
    const { S, X, Y } = V, h = B.hoopAt(Math.max(0, t));
    const bx = h.x + B.RIM_HALF + B.BOARD_GAP, top = h.y + 2.0, bot = h.y - 0.35;
    // tavandan sarkan halat
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1.5, S * 0.03);
    g.beginPath(); g.moveTo(X(bx + 0.1), 0); g.lineTo(X(bx + 0.1), Y(top)); g.stroke();
    // arka tahta
    g.fillStyle = '#f8fafc'; g.strokeStyle = '#1f2937'; g.lineWidth = Math.max(2, S * 0.05);
    g.beginPath(); g.roundRect(X(bx), Y(top), S * 0.16, (top - bot) * S, S * 0.05); g.fill(); g.stroke();
    g.strokeStyle = '#ef4444'; g.lineWidth = Math.max(2, S * 0.045); g.strokeRect(X(bx) - S * 0.02, Y(h.y + 0.95), S * 0.1, S * 0.9);
    // file (sayıda sallanır)
    netSwing = Math.max(0, netSwing - dt * 2.2);
    const sw = Math.sin(performance.now() / 55) * netSwing * S * 0.16;
    const nl = X(h.x - B.RIM_HALF), nr = X(h.x + B.RIM_HALF), ny = Y(h.y), nh = S * 1.05;
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(1.5, S * 0.03);
    for (let i = 0; i <= 5; i++) { const k = i / 5; g.beginPath(); g.moveTo(nl + (nr - nl) * k, ny); g.lineTo(nl + (nr - nl) * (0.18 + 0.64 * k) + sw, ny + nh); g.stroke(); }
    for (let j = 1; j <= 3; j++) { const k = j / 3.4; g.beginPath(); g.moveTo(nl + (nr - nl) * 0.18 * k + sw * k, ny + nh * k); g.lineTo(nr - (nr - nl) * 0.18 * k + sw * k, ny + nh * k); g.stroke(); }
    // halka (iki topuz + çizgi)
    g.strokeStyle = '#f97316'; g.lineWidth = Math.max(4, S * 0.11); g.lineCap = 'round';
    g.beginPath(); g.moveTo(nl, ny); g.lineTo(nr, ny); g.stroke();
    g.fillStyle = '#ea580c'; for (const rx of [nl, nr]) { g.beginPath(); g.arc(rx, ny, S * B.RIM_R * 1.25, 0, 7); g.fill(); }
    g.lineCap = 'butt';
  }
  function drawBall(V, x, y, rot) {
    const { S, X, Y } = V, r = B.BALL_R * S * 1.35, cx = X(x), cy = Y(y);
    g.save(); g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cx, Y(0) + 2, r * (1.0 - Math.min(0.6, y / 12)), r * 0.28, 0, 0, 7); g.fill();
    const glow = g.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.9); glow.addColorStop(0, 'rgba(253,186,116,.55)'); glow.addColorStop(1, 'rgba(253,186,116,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, r * 1.9, 0, 7); g.fill(); g.restore();
    g.save(); g.translate(cx, cy); g.rotate(rot);
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); gr.addColorStop(0, '#fed7aa'); gr.addColorStop(0.45, '#fb923c'); gr.addColorStop(1, '#c2410c');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = '#111827'; g.lineWidth = Math.max(2, r * 0.11);
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.moveTo(-r * 0.7, -r * 0.7); g.quadraticCurveTo(0, 0, -r * 0.7, r * 0.7); g.moveTo(r * 0.7, -r * 0.7); g.quadraticCurveTo(0, 0, r * 0.7, r * 0.7); g.stroke();
    g.restore();
  }
  function drawHud(W, H, DPR, t, phaseLabel, left) {
    const pad = 12 * DPR;
    g.save();
    g.textBaseline = 'top';
    // skor
    g.fillStyle = 'rgba(8,12,28,.62)'; g.beginPath(); g.roundRect(pad, 44 * DPR, 118 * DPR, 54 * DPR, 14 * DPR); g.fill();
    g.fillStyle = '#fde68a'; g.font = `900 ${12 * DPR}px system-ui`; g.textAlign = 'left'; g.fillText('SKOR', pad + 12 * DPR, 49 * DPR);
    g.fillStyle = '#fff'; g.font = `1000 ${34 * DPR}px system-ui`; g.fillText(String(sc.score), pad + 12 * DPR, 58 * DPR);
    // süre
    const sec = Math.max(0, Math.ceil(left)), low = left <= 5;
    g.fillStyle = low ? 'rgba(127,29,29,.78)' : 'rgba(8,12,28,.62)'; g.beginPath(); g.roundRect(W / 2 - 40 * DPR, 44 * DPR, 80 * DPR, 44 * DPR, 14 * DPR); g.fill();
    g.fillStyle = low ? '#fecaca' : '#fff'; g.font = `1000 ${28 * DPR}px system-ui`; g.textAlign = 'center'; g.fillText(`${sec}`, W / 2, 52 * DPR);
    // kombo
    const mult = B.multiplier(sc.streak);
    if (sc.streak >= 2) {
      const pulse = 1 + Math.sin(performance.now() / 120) * 0.04 * mult;
      g.save(); g.translate(W - pad - 70 * DPR, 70 * DPR); g.scale(pulse, pulse);
      g.fillStyle = mult >= 4 ? '#ef4444' : mult === 3 ? '#f97316' : '#f59e0b'; g.beginPath(); g.roundRect(-70 * DPR, -26 * DPR, 140 * DPR, 52 * DPR, 16 * DPR); g.fill();
      g.fillStyle = '#fff'; g.font = `1000 ${22 * DPR}px system-ui`; g.textBaseline = 'middle'; g.fillText(`KOMBO ×${mult} ${mult >= 4 ? '🔥' : ''}`, 0, -2 * DPR);
      g.font = `800 ${11 * DPR}px system-ui`; g.fillText(`${sc.streak} seri sayı`, 0, 15 * DPR);
      g.restore();
    } else if (sc.made) {
      g.fillStyle = 'rgba(8,12,28,.5)'; g.beginPath(); g.roundRect(W - pad - 140 * DPR, 44 * DPR, 140 * DPR, 30 * DPR, 12 * DPR); g.fill();
      g.fillStyle = '#cbd5e1'; g.font = `800 ${12 * DPR}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${sc.made} sayı · ${sc.shots} atış`, W - pad - 70 * DPR, 59 * DPR);
    }
    g.restore();
  }
  function drawPopups(V, DPR, dt) {
    const { S, X, Y } = V;
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]; p.t += dt; if (p.t > 1.1) { popups.splice(i, 1); continue; }
      const k = p.t / 1.1;
      g.save(); g.globalAlpha = 1 - k * k; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `1000 ${Math.round((p.big ? 38 : 28) * DPR * (1 + (1 - k) * 0.25))}px system-ui`; g.lineWidth = 6 * DPR; g.strokeStyle = 'rgba(0,0,0,.55)';
      const x = X(p.x), y = Y(p.y) - k * S * 1.4; g.strokeText(p.text, x, y); g.fillStyle = p.color; g.fillText(p.text, x, y); g.restore();
    }
  }

  // ---- oyun ----
  function onEvents(evs, t) {
    const h = B.hoopAt(Math.max(0, t));
    for (const e of evs) {
      if (e === 'rim') sfx('b-rim'); else if (e === 'board') sfx('b-board'); else if (e === 'floor') sfx('b-floor');
      else if (e === 'score') {
        const swish = evs.includes('swish');
        const pts = B.awardMake(sc, swish); netSwing = 1; sfx('b-swish'); if (sc.streak >= 2 || swish) setTimeout(() => sfx('b-cheer'), 120); flash = 1;
        popups.push({ x: h.x, y: h.y + 0.6, text: `+${pts}`, color: '#fde047', t: 0, big: sc.streak >= 3 });
        if (swish) popups.push({ x: h.x - 0.4, y: h.y + 1.5, text: 'TEMİZ!', color: '#67e8f9', t: -0.15, big: false });
        if (sc.streak >= 2) popups.push({ x: h.x, y: h.y + 2.5, text: `×${B.multiplier(sc.streak)} KOMBO`, color: '#fb923c', t: -0.1, big: true });
      } else if (e === 'miss') { if (sc.streak >= 2) popups.push({ x: spawn.x + 1, y: spawn.y + 1.5, text: 'Kombo bitti', color: '#fca5a5', t: 0, big: false }); B.awardMiss(sc); }
    }
  }

  const client = {
    kind: 'basket',
    supports3D: false,
    onState(s) { if (s.status === 'playing' && key !== `${s.seq}:${s.round}`) reset(s); },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      const medal = ['🥇', '🥈', '🥉'];
      let place = 0;
      ui.innerHTML = `<div class="bk-res"><span class="bk-n">Sonuçlar</span><b class="big">🏀 Pota Atışı bitti!</b>
        ${e.rows.map((r, i) => { if (i && e.rows[i - 1].score !== r.score) place = i; return `<div class="bk-r${r.id === playerId ? ' me' : ''}"><span class="bk-rk">${medal[place] || place + 1}</span>${face(r.id)}<b>${esc(r.id === playerId ? 'Sen' : pName(r.id))}</b><span class="bk-m">${r.made}/${r.shots} · seri ${r.best}</span><em>${r.score}</em></div>`; }).join('')}</div>`;
      sfx('b-buzzer'); setTimeout(() => sfx('fanfare'), 700);
    },
    revealTotal: (e) => e.dur || B.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state(), { W, H, DPR } = ctx.size();
      const V = view(W, H);
      if (anim && now - anim.t0 > (anim.e.dur || B.REVEAL_MS)) { anim = null; ui.innerHTML = ''; }
      const frameDt = Math.min(0.05, dt || 0.016);
      let t = -1, left = B.PLAY_MS / 1000, label = '';
      if (s && s.g && s.status === 'playing' && !anim) {
        if (key !== `${s.seq}:${s.round}`) reset(s);
        // oyuncu hazır olunca (öğretici kapanınca) 3 sn geri sayım, sonra 30 sn
        if (startAt === null && ctx.serverNow() >= s.roundStart && !ctx.blocking()) startAt = performance.now() + B.COUNT_MS;
        if (startAt !== null) t = (performance.now() - startAt) / 1000;
        left = Math.max(0, B.PLAY_MS / 1000 - Math.max(0, t));
        if (startAt !== null && t >= B.PLAY_MS / 1000 && !ended) { ended = true; aim = null; }
        const me = ctx.me();
        const playing = !!(me && me.alive && me.inGame) && startAt !== null && t >= 0 && !ended;
        if (playing) {
          if (ball.live) {
            const was = ball.live;
            spin += frameDt * 6;
            onEvents(B.stepBall(ball, frameDt, t), t);
            trail.push({ x: ball.x, y: ball.y }); if (trail.length > 14) trail.shift();
            if (was && !ball.live) { trail = []; spawn = B.randomSpawn(); }
          }
          const sec = Math.ceil(left);
          if (sec !== lastTick && sec <= 5 && sec > 0) { lastTick = sec; sfx('tick'); }
        }
        // süre bitti: sonucu gönder (başarısız olursa sunucu hazır saymadığı için 2.5 sn'de bir yeniden dener)
        if (ended && me && me.alive && me.inGame && !s.ready.includes(playerId) && performance.now() - lastSend > 2500) { lastSend = performance.now(); ctx.submit(); }
        label = startAt === null ? '⌛ Hazırlanıyor…' : t < 0 ? '' : ended ? `⏱️ Süre bitti! ${sc.score} puan` : '';
      }
      // çizim
      drawCourt(W, H, V, t);
      drawHoop(W, H, V, t, frameDt);
      const playingNow = startAt !== null && t >= 0 && !ended && !anim;
      // topun yolu ve nişan
      if (playingNow && aim && !ball.live) {
        const vel = B.launchVel(aim.dx, aim.dy);
        if (vel) {
          const pts = B.trajectory(vel.vx, vel.vy, 26, 0.045, spawn);
          g.fillStyle = 'rgba(255,255,255,.85)';
          pts.forEach((p, i) => { g.globalAlpha = 1 - i / 30; g.beginPath(); g.arc(V.X(p.x), V.Y(p.y), Math.max(2, V.S * 0.07), 0, 7); g.fill(); });
          g.globalAlpha = 1;
        }
        // güç göstergesi
        const k = clamp(Math.hypot(aim.dx, aim.dy) / B.MAX_DRAG, 0, 1);
        g.strokeStyle = k > 0.92 ? '#ef4444' : '#fde047'; g.lineWidth = Math.max(3, V.S * 0.07); g.beginPath(); g.arc(V.X(spawn.x), V.Y(spawn.y), V.S * (0.55 + k * 0.5), -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
      }
      // top
      if (ball.live) {
        g.fillStyle = 'rgba(249,115,22,.25)';
        trail.forEach((p, i) => { g.beginPath(); g.arc(V.X(p.x), V.Y(p.y), V.S * B.BALL_R * (i / trail.length) * 0.8, 0, 7); g.fill(); });
        drawBall(V, ball.x, ball.y, spin);
      } else if (t >= 0 || startAt === null) drawBall(V, spawn.x, spawn.y, 0);
      // sayı parlaması
      if (flash > 0) { g.fillStyle = `rgba(253,224,71,${flash * 0.22})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - frameDt * 3); }
      drawPopups(V, DPR, frameDt);
      if (s && s.g && !anim) drawHud(W, H, DPR, t, label, left);
      // geri sayım / ipucu
      if (startAt !== null && t < 0 && !anim) {
        const c = Math.ceil(-t);
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `1000 ${130 * DPR}px system-ui`; g.lineWidth = 9 * DPR; g.strokeStyle = 'rgba(0,0,0,.5)';
        g.fillStyle = ['#4ade80', '#fde047', '#fb7185'][clamp(c, 1, 3) - 1]; g.strokeText(String(c), W / 2, H * 0.4); g.fillText(String(c), W / 2, H * 0.4);
        g.font = `900 ${20 * DPR}px system-ui`; g.fillStyle = '#fff'; g.fillText('Topu geri çek, bırak!', W / 2, H * 0.4 + 90 * DPR); g.restore();
      }
      if (playingNow && sc.shots === 0 && t >= 0 && t < 6 && !aim) {
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${18 * DPR}px system-ui`; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('👆 Parmağını sürükle: geri çek, bırak', W / 2, H * 0.82); g.restore();
      }
      lastNow = now;
      return anim ? '🏁 Sonuçlar!' : label;
    },
    hint: () => null,
    hideReady: () => true,
    ownPanel(chip) {
      const s = ctx.state(), list = s.players.filter((p) => p.inGame && !p.left);
      return `<div class="status">${ended ? `Süren bitti ✓ <small>${sc.score} puan · diğerleri bekleniyor</small>` : '<small>Topu geri çek, bırak. Seri sayılar puanı katlar!</small>'}</div>
        <div class="chips">${list.map((p) => chip(p.id, s.ready.includes(p.id) ? 'ready' : '', s.ready.includes(p.id) ? ' ✓' : ' …')).join('')}</div>`;
    },
    panel() { return ''; },
    action() { return { score: sc.score, made: sc.made, shots: sc.shots, best: sc.best }; },
    pointer(type, ev) {
      if (type === 'down' && startAt !== null && !ended && !ball.live) {
        const t = (performance.now() - startAt) / 1000;
        if (t < 0) return;
        aim = { x0: ev.clientX, y0: ev.clientY, dx: 0, dy: 0 };
      } else if (type === 'move' && aim) {
        const { W, H } = ctx.size(), rect = ctx.cv.getBoundingClientRect(), V = view(W, H), k = ctx.cv.width / Math.max(1, rect.width);
        aim.dx = ((ev.clientX - aim.x0) * k) / V.S; aim.dy = -((ev.clientY - aim.y0) * k) / V.S;
      } else if ((type === 'up' || type === 'cancel') && aim) {
        const a = aim; aim = null;
        if (type === 'up') {
          const { W, H } = ctx.size(), rect = ctx.cv.getBoundingClientRect(), V = view(W, H), k = ctx.cv.width / Math.max(1, rect.width);
          const dx = ((ev.clientX - a.x0) * k) / V.S, dy = -((ev.clientY - a.y0) * k) / V.S;
          const vel = B.launchVel(dx, dy);
          if (vel && !ball.live && !ended) { B.fire(ball, vel, spawn); sc.shots += 1; spin = 0; trail = []; sfx('b-shot'); }
        }
      }
    },
    hud() { return `🏀 <b>${sc.score}</b>${sc.streak >= 2 ? ` · ×${B.multiplier(sc.streak)}` : ''}`; },
    dispose() { ui.remove(); },
  };
  return client;
}
