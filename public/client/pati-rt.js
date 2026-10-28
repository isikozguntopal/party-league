// 🐾 Pati Koşusu — turnuva/oda istemcisi. Gerçek zamanlı oyun çerçevesine (client/rt.js) bağlanır: oda sahibinin telefonu simülasyonu çalıştırır,
// herkes anlık görüntü alır. Çizim client/pati-view2d.js'te. Kontroller: ZIPLA (havada tekrar = çift), KAY (havada = çak), ÖZEL GÜÇ.
import * as P from '../games/pati.js';
import { createRealtime } from './rt.js';
import { createPatiView2D } from './pati-view2d.js';
import { lerp, clamp, esc } from './util.js';
import { localPt } from './landscape.js';

const KEYS = { KeyE: 'item', Enter: 'item', KeyF: 'item' };

export function createPatiRT(ctx) {
  const { pById, playerId } = ctx;
  const g = ctx.g2d;
  let view = null, last = {}, keyItem = false, itemBits = 0, itemAim = null;
  const feedLines = [];                       // üstte süre yanında: kim kime hangi güçle ne yaptı
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok say */ } };
  let chosen = P.ANIMALS[lsGet('lk.pati.animal')] ? lsGet('lk.pati.animal') : P.ANIMAL_IDS[Math.floor(Math.random() * P.ANIMAL_IDS.length)];
  const prev = { jump: false, slide: false, item: false };
  const nameOf = (id) => { const p = pById(id); return p ? p.name : '?'; };
  const ctlBtn = (id) => (ctx.stage.parentNode || ctx.stage).querySelector(`.ctl [data-b="${id}"]`);

  const onKey = (e) => { if (e.repeat || e.target.tagName === 'INPUT') return; if (KEYS[e.code]) { keyItem = true; e.preventDefault(); } };
  window.addEventListener('keydown', onKey);

  function build(st) {
    const players = ctx.state().players;
    const racers = st.racers.map((r) => {
      const p = players.find((x) => x.id === r.id);
      // aynı hayvandan birden fazla varsa oyuncunun oda rengiyle ayırt edilir (doğal renk yerine)
      const dup = st.racers.filter((o) => o.animal === r.animal).length > 1;
      return { id: r.id, animal: r.animal, color: null, hat: 'yok', name: r.id === playerId ? 'SEN' : nameOf(r.id), bot: r.bot };
    });
    view = createPatiView2D({ mapId: st.map, track: st.track, racers, meId: playerId, debug: !!ctx.debug, onFeed: (t) => { feedLines.push({ t, at: performance.now() }); if (feedLines.length > 4) feedLines.shift(); }, onBanner: () => {}, onToast: (t) => ctx.toast(t) });
    window.__patiRT = ctx.debug ? view : undefined;
  }

  // yuvarlak testere simgesi (el testeresi emojisi yerine)
  const SAW_SVG = '<svg viewBox="-32 -32 64 64" width="44" height="44" aria-hidden="true"><g><circle r="22" fill="#e5e7eb" stroke="#1f2937" stroke-width="3"/>' + Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2, b = (k + 0.5) / 12 * Math.PI * 2, c = (k + 1) / 12 * Math.PI * 2; const f = (an, r) => `${(Math.cos(an) * r).toFixed(1)},${(Math.sin(an) * r).toFixed(1)}`; return `<polygon points="${f(a, 21)} ${f(b, 30)} ${f(c, 21)}" fill="#cbd5e1" stroke="#1f2937" stroke-width="2.4"/>`; }).join('') + '<circle r="22" fill="#e5e7eb" stroke="#1f2937" stroke-width="3"/><circle r="12" fill="#94a3b8" stroke="#1f2937" stroke-width="2.5"/><circle r="4" fill="#1f2937"/></g></svg>';
  const itemIcon = (key) => (key === 1 ? SAW_SVG : P.ITEMS[key].emoji);

  // EŞYA düğmesi elimdeki eşyayı gösterir; düğmeyi kaydırarak yön seçilir (testere: ileri / geri / yukarı)
  function wireItem() {
    const el = ctlBtn('item'); if (!el || el._aim) return; el._aim = true;
    const dirOf = (q) => {
      const dx = q.clientX - itemAim.x, dy = q.clientY - itemAim.y;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return 'f';
      return Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'u' : 'd') : (dx < 0 ? 'b' : 'f');
    };
    el.addEventListener('pointerdown', (e) => { const q = localPt(e); itemAim = { x: q.clientX, y: q.clientY, dir: 'f' }; if (view) view.setAim('f'); });
    el.addEventListener('pointermove', (e) => { if (!itemAim) return; itemAim.dir = dirOf(localPt(e)); if (view) view.setAim(itemAim.dir); });
    const up = (e) => {
      if (!itemAim) return; const dir = dirOf(localPt(e)); itemAim = null; if (view) view.setAim(null);
      itemBits = 4 | (dir === 'b' ? 8 : dir === 'u' ? 16 : dir === 'd' ? 32 : 0);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { itemAim = null; if (view) view.setAim(null); });
  }
  function syncItem(me) {
    wireItem();
    const key = me ? me.item : 0;
    if (last.item === key) return; last.item = key;
    const el = ctlBtn('item'); if (!el) return;
    const I = P.ITEMS[key];
    el.innerHTML = I ? `<span class="u-e">${itemIcon(key)}</span><span class="u-n">${I.name}</span>${[4, 5].includes(key) ? '' : '<small class="u-h">tut · yön seç · bırak</small>'}` : '<span class="u-e">❓</span><span class="u-n">güç yok</span>';
    el.classList.toggle('empty', !I);
  }

  // hayvan seçimi: öğretici kartının içinde (oyun başlamadan); seçim oyun sahibine `an` kumanda alanıyla gider
  function mountPick(card) {
    const box = document.createElement('div');
    box.className = 'pk-pick';
    const paint = () => { box.innerHTML = `<h4>🐾 Hayvanını seç</h4><div class="pk-grid">${P.ANIMAL_IDS.map((a) => { const A = P.ANIMALS[a]; return `<button type="button" class="pk-an${a === chosen ? ' on' : ''}" data-an="${a}"><span class="e">${A.emoji}</span><b>${esc(A.name)}</b><small>${esc(A.pass)}</small></button>`; }).join('')}</div><div class="pk-pass">${P.ANIMALS[chosen].emoji} <b>${esc(P.ANIMALS[chosen].name)}</b>: ${esc(P.ANIMALS[chosen].pass)}</div>`; };
    paint();
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-an]'); if (!b) return; chosen = b.dataset.an; lsSet('lk.pati.animal', chosen); paint(); });
    card.insertBefore(box, card.querySelector('.tt-row') || card.querySelector('.tt-ok'));   // seçim en üstte: kısa ekranda bile görünür
  }

  function overlay(st, me, W, H, DPR, now) {
    const place = P.placeOf(st, me.id), n = st.racers.length;
    g.save();
    // sıra rozeti
    g.font = `1000 ${Math.round(30 * DPR)}px system-ui`; g.textBaseline = 'top'; g.textAlign = 'left';
    const pt = `${place}`, pw = g.measureText(pt).width;
    g.fillStyle = 'rgba(8,12,28,.7)'; g.beginPath(); g.roundRect(10 * DPR, 44 * DPR, pw + 56 * DPR, 40 * DPR, 14 * DPR); g.fill();
    g.strokeStyle = place === 1 ? '#fbbf24' : '#fff'; g.lineWidth = 2.5 * DPR; g.stroke();
    g.fillStyle = place === 1 ? '#fbbf24' : '#fff'; g.fillText(pt, 20 * DPR, 48 * DPR);
    g.font = `800 ${Math.round(15 * DPR)}px system-ui`; g.fillStyle = '#cbd5e1'; g.fillText(`/${n}`, 24 * DPR + pw, 61 * DPR);
    // süre
    const el = st.phase === 'race' || st.phase === 'done' ? Math.max(0, (me.done !== null ? me.done : st.t) - st.raceT0) : 0;
    g.font = `900 ${Math.round(18 * DPR)}px system-ui`; g.textAlign = 'center'; g.fillStyle = 'rgba(8,12,28,.7)'; g.beginPath(); g.roundRect(W / 2 - 46 * DPR, 44 * DPR, 92 * DPR, 32 * DPR, 12 * DPR); g.fill();
    g.fillStyle = '#fff'; g.fillText(`${Math.floor(el / 60)}:${(el % 60).toFixed(1).padStart(4, '0')}`, W / 2, 50 * DPR);
    // kim kime ne yaptı: sürenin yanında anlık satırlar
    { const nowT = performance.now(); g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `800 ${Math.round(14 * DPR)}px system-ui, "Apple Color Emoji"`;
      let row = 0; for (let i = feedLines.length - 1; i >= 0; i--) { const f = feedLines[i], age = nowT - f.at; if (age > 6000) continue; const a = clamp(1 - Math.max(0, age - 4500) / 1500, 0, 1); g.globalAlpha = a; const tx = W / 2 + 56 * DPR, ty = (42 + row * 20) * DPR; g.lineWidth = 4 * DPR; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(f.t, tx, ty); g.fillStyle = '#fff'; g.fillText(f.t, tx, ty); row++; } g.globalAlpha = 1; }
    // ilk bitirenden sonra bitirmeyenler DNF olur
    if (st.phase === 'race' && st.firstDone != null && me.done === null) {
      const left = Math.max(0, P.AFTER_FIRST - (st.t - st.firstDone));
      g.textAlign = 'center'; g.textBaseline = 'top'; g.font = `900 ${Math.round(15 * DPR)}px system-ui`; g.lineWidth = 4 * DPR; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = left < 5 ? '#fca5a5' : '#fde68a';
      const msg = `⏱️ Bitir! ${Math.ceil(left)} sn sonra DNF`; g.strokeText(msg, W / 2, 80 * DPR); g.fillText(msg, W / 2, 80 * DPR);
    }
    // ilerleme çubuğu
    const bx = 18 * DPR, bw = W - 36 * DPR, by = 100 * DPR;
    g.fillStyle = 'rgba(8,12,28,.65)'; g.fillRect(bx, by, bw, 7 * DPR); g.fillStyle = '#fff'; g.font = `${Math.round(18 * DPR)}px system-ui`; g.textBaseline = 'middle'; g.fillText('🏁', bx + bw, by + 3 * DPR);
    for (const r of st.racers) { g.font = `${Math.round((r.id === me.id ? 24 : 17) * DPR)}px system-ui`; g.fillText(P.ANIMALS[r.animal].emoji, bx + clamp(r.x / st.track.len, 0, 1) * bw, by + 3 * DPR); }
    // geri sayım
    if (st.phase === 'count') {
      const c = Math.max(1, Math.ceil(st.cd)), k = 1 - (st.cd - Math.floor(st.cd));
      g.textBaseline = 'middle'; g.font = `1000 ${Math.round((110 + (1 - k) * 30) * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.45)';
      g.fillStyle = ['#4ade80', '#fde047', '#fb7185'][c - 1] || '#fff'; g.strokeText(String(c), W / 2, H * 0.36); g.fillText(String(c), W / 2, H * 0.36);
    }
    g.restore();
  }

  const spec = {
    kind: 'pati', mod: P, views: ['top'],
    // Düğmeler: solda ÖZEL GÜÇ; sağda altlı üstlü ZIPLA (üst) ve KAY (alt). Klavye: Boşluk/↑ zıpla, ↓/Shift kay, E güç.
    controls: { left: 'none', below: true, cls: 'pk',
      leftButtons: [{ id: 'item', label: '<span class="u-e">❓</span><span class="u-n">güç yok</span>', cls: 'pk-b pk-item empty' }],
      buttons: [
        { id: 'jump', label: '<span class="pk-ic">⬆️</span><small>ZIPLA</small>', cls: 'pk-b pk-jump' },
        { id: 'slide', label: '<span class="pk-ic">⬇️</span><small>KAY</small>', cls: 'pk-b pk-slide' },
      ] },
    // Tek basış `bomb` alanında bit olarak taşınır (framework her adımdan sonra sıfırlar): 1 zıpla, 2 kay, 4 eşya
    input: (c) => {
      const cur = { jump: !!c.btn.jump, slide: !!c.btn.slide };
      const edge = (k) => (!!c.pressed[k] || (cur[k] && !prev[k]));
      // eşya: düğmeden parmak kalkınca ateşlenir (kaydırma yönüyle); klavyede E = ileri
      const bits = (edge('jump') ? 1 : 0) | (edge('slide') ? 2 : 0) | itemBits | (keyItem ? 4 : 0);
      prev.jump = cur.jump; prev.slide = cur.slide; keyItem = false; itemBits = 0;
      return { x: 0, y: 0, bomb: bits, an: chosen };
    },
    setBot: (sim, id) => P.setBot(sim, id),
    onState() {},
    interp(a, b, k) {
      const racers = b.racers.map((rb) => {
        const ra = a.byId[rb.id] || rb;
        if (Math.abs(rb.x - ra.x) > 3 || Math.abs(rb.y - ra.y) > 3) return rb; // yeniden doğuş / savrulma: sıçra
        return { ...rb, x: lerp(ra.x, rb.x, k), y: lerp(ra.y, rb.y, k), sp: lerp(ra.sp, rb.sp, k), vy: lerp(ra.vy, rb.vy, k) };
      });
      return { ...b, t: lerp(a.t, b.t, k), racers, byId: Object.fromEntries(racers.map((r) => [r.id, r])) };
    },
    onEvents(evs, st) { if (view && st) view.events(evs, st); },
    render(st, now, dt, vm, info) {
      const { W, H, DPR } = ctx.size();
      if (!st) { g.clearRect(0, 0, W, H); return 'Bekleniyor…'; }
      if (!view) build(st);
      const me = view.frame(st, now, dt, W, H, g, DPR);
      overlay(st, me, W, H, DPR, now);
      syncItem(st.byId[playerId]);
      if (info.connMsg) return info.connMsg;
      if (st.phase === 'wait') return '📡 Herkes bağlanıyor…';
      if (st.phase === 'count') return '🚦 Hazır ol!';
      const mine = st.byId[playerId];
      if (mine && mine.done !== null) return `🏁 Bitirdin! ${P.placeOf(st, playerId)}. sıra`;
      return '';
    },
    panel(st) {
      if (!st) return '<div class="status"><small>Yarış birazdan başlıyor…</small></div>';
      const order = P.standings(st);
      return `<div class="race-board">${order.map((id, i) => `<span class="chip${id === playerId ? ' cur' : ''}"><span class="n">${i + 1}</span>${P.ANIMALS[st.byId[id].animal].emoji} ${esc(id === playerId ? 'Sen' : nameOf(id))}</span>`).join('')}</div>`;
    },
    hud(st) {
      if (!st) return '';
      const me = st.byId[playerId];
      return me ? `Sıra <b>${P.placeOf(st, playerId)}/${st.racers.length}</b> · ${Math.max(0, Math.round(st.track.len - me.x))} m` : '👀 İzliyorsun';
    },
    dispose() { window.removeEventListener('keydown', onKey); if (view) { view.dispose(); view = null; } },
  };
  const rt = createRealtime(ctx, spec);
  rt.tutorialExtra = mountPick;
  return rt;
}
