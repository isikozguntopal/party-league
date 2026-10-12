// Oyun tanıtım kartı, oyunlar arası skor ekranı ve final podyumu (konfeti + ışıklar)
import { $, esc, clamp, sfx } from './util.js';
import { portraitCanvas, portraitURL } from './avatar2d.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export function createUI(ctx) {
  const ov = $('#overlay');
  const conf = $('#confetti');
  let mode = 'none', modeKey = '';
  let confetti = [], confOn = false;

  const games = () => ctx.GAMES;
  const nameOf = (id) => ctx.pName(id);
  const player = (id) => ctx.pById(id) || { id, name: '?', color: '#888' };

  // Toplam puana göre sıralı gruplar (beraberlik aynı grupta)
  function standings(tour) {
    const ids = Object.keys(tour.scores);
    const wins = (id) => tour.results.filter((r) => r.ranking[0] && r.ranking[0].includes(id)).length;
    ids.sort((a, b) => tour.scores[b] - tour.scores[a] || wins(b) - wins(a));
    const groups = [];
    for (const id of ids) {
      const last = groups[groups.length - 1];
      if (last && tour.scores[last[0]] === tour.scores[id] && wins(last[0]) === wins(id)) last.push(id); else groups.push([id]);
    }
    return groups;
  }

  function show(html, cls) {
    ov.className = 'overlay ' + cls;
    ov.innerHTML = html;
    ov.classList.remove('hidden');
  }
  function hide() {
    if (mode === 'none') return;
    mode = 'none'; modeKey = '';
    ov.classList.add('hidden'); ov.innerHTML = '';
    confOn = false;
  }

  // ---------- Tanıtım ----------
  function renderIntro(s) {
    const mod = games()[s.kind];
    const n = s.tour.list.length;
    show(`
      <div class="intro-card">
        ${n > 1 ? `<div class="intro-step">Oyun ${s.tour.idx + 1} / ${n}</div>` : ''}
        <div class="intro-emoji">${mod.EMOJI}</div>
        <h2>${esc(mod.TITLE)}</h2>
        <ul>${mod.RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="intro-bar"><i id="introFill"></i></div>
      </div>`, 'intro');
    sfx('reveal');
  }

  // ---------- Takımlar (takım oyunlarının başında: kim hangi takımda, herkes Tamam deyince başlar) ----------
  // Renk ve adlar oyun içindekilerle aynı (Halat: Mavi/Kırmızı; Kör Koşu ve Kayık: takım renk şeridi)
  const TEAM_PAL = { kor: ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308'], kayik: ['#f97316', '#22c55e', '#a855f7', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#3b82f6', '#14b8a6', '#f43f5e', '#84cc16', '#8b5cf6'] };
  function teamList(s) {
    const G = s.g, kind = s.kind;
    if (!G || !G.teams) return [];
    if (kind === 'halat') return G.teams.map((m, i) => ({ name: i ? 'Kırmızı Takım' : 'Mavi Takım', color: i ? '#ef4444' : '#3b82f6', members: m, tags: {} }));
    return G.teams.map((t, i) => {
      const tags = {};
      if (kind === 'kayik') { tags[t.members[0]] = '⬅️ sol kürek'; if (t.members[1] && t.members[1] !== t.members[0]) tags[t.members[1]] = 'sağ kürek ➡️'; }
      if (kind === 'bombaci') {
        const solo = t.members.length === 1;
        for (const id of t.members) tags[id] = solo ? '🧨 tek başına' : t.expert === id ? '🗣️ anlatıcı' : '💣 bombayı çözer';
      }
      const pal = TEAM_PAL[kind];
      return { name: `Takım ${i + 1}`, color: pal ? pal[i % pal.length] : '#94a3b8', members: t.members, tags };
    });
  }
  // Oyun sırasında üst çubukta kendi takımın (kayıtlı takım oyunlarında)
  let teamChipSig = '';
  function updateTeamChip(s) {
    const el = $('#hudTeam');
    if (!el) return;
    let sig = '', html = '', color = '';
    if (s && s.status === 'playing' && !s.gate && s.g && s.g.teams) {
      const t = teamList(s).find((x) => x.members.includes(ctx.playerId));
      if (t) {
        const mates = [...new Set(t.members)].filter((id) => id !== ctx.playerId).map(nameOf);
        html = `${esc(t.name.replace(' Takım', ''))}${mates.length ? ` · ${esc(mates.join(', '))}` : ''}`;
        color = t.color; sig = html + color;
      }
    }
    if (sig === teamChipSig) return;
    teamChipSig = sig;
    el.classList.toggle('hidden', !sig);
    el.innerHTML = html; el.style.setProperty('--tc', color || 'transparent');
  }
  let teamsSig = '';
  function renderTeams(s) {
    const mod = games()[s.kind], gate = s.gate, me = ctx.playerId;
    const meP = s.players.find((p) => p.id === me);
    const playing = !!(meP && meP.inGame);
    const ready = new Set(gate.ready);
    const iReady = ready.has(me);
    const waiting = gate.waiting.length;
    show(`
      <div class="intro-card team-card">
        <div class="intro-emoji">${mod.EMOJI}</div>
        <h2>${esc(mod.TITLE)}</h2>
        <div class="tm-sub">Takımlar belli oldu</div>
        <div class="tm-list">${teamList(s).map((t) => {
          const mine = t.members.includes(me);
          return `<div class="tm-team${mine ? ' mine' : ''}" style="--tc:${t.color}">
            <div class="tm-name">${esc(t.name)}${mine ? ' · <em>senin takımın</em>' : ''}</div>
            <div class="tm-members">${[...new Set(t.members)].map((id) => {
              const pl = player(id), bot = !!(s.players.find((p) => p.id === id) || {}).bot;
              return `<span class="tm-m${id === me ? ' me' : ''}"><img src="${portraitURL(pl.look, pl.color)}" alt=""><b>${esc(id === me ? 'Sen' : nameOf(id))}</b>${t.tags[id] ? `<small>${esc(t.tags[id])}</small>` : ''}<i class="tm-ok">${bot || ready.has(id) ? '✓' : '…'}</i></span>`;
            }).join('')}</div>
          </div>`;
        }).join('')}</div>
        ${playing ? `<button class="btn ok big tm-btn" data-uact="teamReady"${iReady ? ' disabled' : ''}>${iReady ? '✓ Hazırsın' : '✅ Tamam, başlayalım'}</button>` : '<div class="tm-sub">👀 İzliyorsun</div>'}
        <div class="tm-wait" id="tmWait">${waiting ? `${waiting} kişi bekleniyor…` : 'Başlıyor…'}</div>
      </div>`, 'intro teams');
    teamsSig = JSON.stringify([gate.ready, gate.waiting]);
    sfx('reveal');
  }

  // ---------- Skor ekranı ----------
  function scoreBars(s, prevScores) {
    const T = s.tour;
    const groups = standings(T);
    const max = Math.max(1, ...Object.values(T.scores));
    const lastRes = T.results[T.results.length - 1];
    let rank = 0;
    return groups.map((grp) => {
      const r = rank; rank += grp.length;
      return grp.map((id) => {
        const p = player(id), now = T.scores[id], before = prevScores ? prevScores[id] || 0 : now;
        const add = lastRes && prevScores ? lastRes.gained[id] || 0 : 0;
        return `<div class="bar-row" data-id="${esc(id)}">
          <span class="rank">${r + 1}.</span><span class="pslot" data-portrait="${esc(id)}"></span>
          <span class="bname">${esc(p.name)}${id === ctx.playerId ? ' (sen)' : ''}</span>
          <span class="bar"><i style="width:${(before / max) * 100}%;background:${p.color}" data-to="${(now / max) * 100}"></i></span>
          <b class="pts" data-from="${before}" data-to="${now}">${before}</b>${add ? `<span class="plus">+${add}</span>` : ''}
        </div>`;
      }).join('');
    }).join('');
  }
  function mountPortraits() {
    for (const el of ov.querySelectorAll('[data-portrait]')) {
      const p = player(el.dataset.portrait);
      el.appendChild(portraitCanvas(p.look, p.color, Number(el.dataset.size) || 34));
    }
  }
  function animateBars() {
    requestAnimationFrame(() => setTimeout(() => {
      for (const i of ov.querySelectorAll('.bar i')) i.style.width = i.dataset.to + '%';
      for (const b of ov.querySelectorAll('.pts')) {
        const from = +b.dataset.from, to = +b.dataset.to;
        if (from === to) continue;
        let v = from;
        const step = () => { v += 1; b.textContent = v; sfx('score'); if (v < to) setTimeout(step, 180); };
        setTimeout(step, 300);
      }
    }, 120));
  }
  function renderInter(s) {
    const T = s.tour;
    const res = T.results[T.results.length - 1];
    const mod = games()[res.kind];
    const next = games()[T.list[T.idx + 1]];
    const prev = {};
    for (const id of Object.keys(T.scores)) prev[id] = T.scores[id] - (res.gained[id] || 0);
    let pos = 0;
    const podium = res.ranking.map((grp) => { const r = pos; pos += grp.length; return grp.map((id) => `<li><span>${MEDAL[r] || `${r + 1}.`}</span>${esc(nameOf(id))}<b>+${res.gained[id] || 0}</b></li>`).join(''); }).join('');
    show(`
      <div class="score-card">
        <div class="score-head">${mod.EMOJI} ${esc(mod.TITLE)} bitti!</div>
        <ol class="game-rank">${podium}</ol>
        <div class="score-title">Toplam puan</div>
        <div class="bars">${scoreBars(s, prev)}</div>
        <div class="next-up">Sıradaki: <b>${next.EMOJI} ${esc(next.TITLE)}</b> <span id="interCount"></span></div>
        <div class="row">
          ${s.hostId === ctx.playerId ? '<button class="btn ghost" data-uact="lobby">Lobiye dön</button><button class="btn primary" data-uact="next">Hemen başla ▶</button>' : '<span class="muted">Oda sahibi hemen başlatabilir</span>'}
        </div>
      </div>`, 'inter');
    mountPortraits();
    animateBars();
    sfx('finish');
  }

  // ---------- Final podyumu ----------
  function renderOver(s) {
    const T = s.tour;
    const groups = standings(T);
    const flat = [];
    groups.forEach((grp, gi) => { const r = groups.slice(0, gi).reduce((n, x) => n + x.length, 0); for (const id of grp) flat.push({ id, r }); });
    const top = groups[0] || [];
    const single = T.list.length === 1;
    const title = top.length > 1
      ? `🤝 Berabere: ${top.map(nameOf).map(esc).join(' & ')}`
      : `🏆 ${esc(nameOf(top[0]))}${top[0] === ctx.playerId ? ' (SEN!)' : ''} kazandı!`;
    const place = (r) => flat.filter((f) => f.r === r);
    const spot = (r, cls) => {
      const list = place(r);
      if (!list.length) return `<div class="pod ${cls} empty"></div>`;
      return `<div class="pod ${cls}">
        <div class="pod-people">${list.map((f) => `<div class="pod-p"><span class="pslot" data-portrait="${esc(f.id)}" data-size="${r === 0 ? 76 : 60}"></span><div class="pod-name">${esc(nameOf(f.id))}</div><div class="pod-pts">${T.scores[f.id]} puan</div></div>`).join('')}</div>
        <div class="pod-block"><span>${r + 1}</span></div>
      </div>`;
    };
    // 2./3. sıralar beraberlikte kayabilir: ilk üç farklı sırayı bul
    const ranks = [...new Set(flat.map((f) => f.r))].slice(0, 3);
    const rest = flat.filter((f) => !ranks.includes(f.r));
    show(`
      <div class="lights"><i></i><i></i><i></i><i></i></div>
      <div class="final">
        <div class="final-sub">${single ? `${games()[T.list[0]].EMOJI} ${esc(games()[T.list[0]].TITLE)}` : '🏟️ Turnuva bitti'}</div>
        <h1 class="final-title">${title}</h1>
        <div class="podium">${spot(ranks[1] ?? 99, 'p2')}${spot(ranks[0] ?? 98, 'p1')}${spot(ranks[2] ?? 97, 'p3')}</div>
        ${rest.length ? `<ol class="rest" start="4">${rest.map((f) => `<li>${f.r + 1}. ${esc(nameOf(f.id))} <b>${T.scores[f.id]}</b></li>`).join('')}</ol>` : ''}
        <button class="btn primary" data-uact="rematch">🔁 Tekrar oyna</button>
        <div class="row">${s.hostId === ctx.playerId ? '<button class="btn ghost" data-uact="lobby">Lobiye dön</button>' : ''}<button class="btn ghost" data-uact="home">Ana menü</button></div>
      </div>`, 'over');
    mountPortraits();
    startConfetti();
    sfx('fanfare');
  }

  // ---------- Konfeti ----------
  function startConfetti() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    conf.width = innerWidth * dpr; conf.height = innerHeight * dpr;
    confetti = [];
    const colors = ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#fff'];
    const add = (n, burst) => {
      for (let i = 0; i < n; i++) {
        confetti.push({
          x: burst ? conf.width / 2 + (Math.random() - 0.5) * 80 : Math.random() * conf.width,
          y: burst ? conf.height * 0.35 : -20 - Math.random() * conf.height * 0.5,
          vx: burst ? (Math.random() - 0.5) * 22 * dpr : (Math.random() - 0.5) * 2 * dpr,
          vy: burst ? (-Math.random() * 18 - 6) * dpr : (2 + Math.random() * 3) * dpr,
          r: (4 + Math.random() * 6) * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
          c: colors[Math.floor(Math.random() * colors.length)], life: 0,
        });
      }
    };
    add(160, true);
    confOn = true;
    let waves = 0;
    const wave = () => { if (!confOn || waves++ > 8) return; add(50, false); setTimeout(wave, 900); };
    setTimeout(wave, 700);
  }
  function stepConfetti(dt) {
    const c = conf.getContext('2d');
    c.clearRect(0, 0, conf.width, conf.height);
    if (!confetti.length) return;
    confetti = confetti.filter((p) => p.y < conf.height + 40 && (p.life += dt) < 9);
    for (const p of confetti) {
      p.vy += 0.35 * dt * 60; p.vx *= 0.99; p.vy = Math.min(p.vy, 7);
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.a += p.va * dt * 60;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2 * (0.4 + Math.abs(Math.sin(p.a * 2))));
      c.restore();
    }
  }

  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-uact]');
    if (b) ctx.onUI(b.dataset.uact);
  });

  return {
    // her karede çağrılır
    update(now, dt, s, animating) {
      stepConfetti(dt);
      updateTeamChip(s);
      if (!s || s.status === 'lobby') return hide();
      const sn = ctx.serverNow();
      let want = 'none', key = '';
      if (s.status === 'playing' && s.gate) { want = 'teams'; key = 't' + s.seq; }
      else if (s.status === 'playing' && sn < s.roundStart && s.round === 1) { want = 'intro'; key = 'i' + s.seq; }
      else if (s.status === 'inter' && !animating && sn >= s.interAt - 200) { want = 'inter'; key = 'r' + s.seq; }
      else if (s.status === 'over' && !animating && sn >= s.endsAt - 200) { want = 'over'; key = 'o' + s.seq; }
      if (want === 'none') return hide();
      if (key !== modeKey) {
        mode = want; modeKey = key;
        if (want === 'intro') renderIntro(s);
        if (want === 'teams') renderTeams(s);
        if (want === 'inter') renderInter(s);
        if (want === 'over') renderOver(s);
      }
      if (want === 'teams') {
        // Biri Tamam deyince listeyi yenile
        const sig = JSON.stringify([s.gate.ready, s.gate.waiting]);
        if (sig !== teamsSig) renderTeams(s);
        const w = $('#tmWait');
        if (w && s.gate.waiting.length) w.textContent = `${s.gate.waiting.length} kişi bekleniyor… ${Math.max(0, Math.ceil((s.gate.until - sn) / 1000))} sn`;
      }
      if (want === 'intro') {
        const f = $('#introFill');
        if (f) f.style.width = clamp(1 - (s.roundStart - sn) / 3000, 0, 1) * 100 + '%';
      }
      if (want === 'inter') {
        const el = $('#interCount');
        if (el) el.textContent = `${Math.max(0, Math.ceil((s.interUntil - sn) / 1000))} sn`;
      }
    },
    mode: () => mode,
  };
}
