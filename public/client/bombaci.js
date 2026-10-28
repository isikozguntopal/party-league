// 🧨 Bombayı Çöz istemcisi: çözen bombayı görür, anlatıcı kılavuzu okur. Konuşarak çözülür.
import * as BB from '../games/bombaci.js';
import { $, esc, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';

const HOLD_MS = 550;

export function createBombaci(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'bb';
  ctx.stage.appendChild(ui);
  let key = '', tab = 'bomb', anim = null, lastStrikes = 0, shakeT = 0, lastSec = -1;
  let press = null;

  const face = (id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; return `<img class="face${id === playerId ? ' me' : ''}" src="${portraitURL(p.look, p.color)}" alt="" title="${esc(p.name)}">`; };
  const names = (ids) => ids.map((id) => (id === playerId ? 'sen' : pName(id))).join(' ve ');
  const myTeam = () => { const s = ctx.state(); return s.g.teams.find((t) => t.id === s.g.myTeam); };
  const timerNow = () => BB.timerText(ctx.state().g.endsAt - ctx.serverNow());

  // Dokunuşlar sırayla gönderilir (bas-tut-bırak arka arkaya gelirse hiçbiri kaybolmasın)
  let queue = Promise.resolve();
  function gact(body) {
    const seq = ctx.state().seq;
    queue = queue.then(() => ctx.call({ action: 'gact', seq, ...body })).catch((e) => ctx.toast(e.message));
    return queue;
  }

  // ---------- Kılavuz ----------
  function manualHTML() {
    const wires = Object.entries(BB.WIRE_RULES).map(([n, rules]) => `<div class="mn-sub"><b>${n} kablo varsa:</b><ol>${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>`).join('');
    return `<div class="manual">
      <h3>📕 Bomba İmha Kılavuzu</h3>
      <section><h4>✂️ Kablolar</h4><p>Kablolar yukarıdan aşağıya sayılır. Tek bir kablo kesilmeli.</p>${wires}</section>
      <section><h4>🔴 Düğme</h4><ol>${BB.BUTTON_RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
        <div class="mn-sub"><b>Basılı tutarken:</b><ul>${BB.STRIP_RULES.slice(1).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div></section>
      <section><h4>🔐 Şifre Kilidi</h4><ol>${BB.LOCK_RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></section>
    </div>`;
  }

  // ---------- Bomba ----------
  function bombHTML(b) {
    return `<div class="bomb-box">
      <div class="bomb-head">
        <div class="bomb-timer" id="bbTimer">4:00</div>
        <div class="bomb-strikes" id="bbStrikes"></div>
      </div>
      <div class="bomb-info">
        <span class="serial">SERİ NO <b>${esc(b.serial)}</b></span>
        <span class="bats">${b.batteries ? '🔋'.repeat(b.batteries) : 'pil yok'}</span>
        ${b.indicators.map((i) => `<span class="ind${i.lit ? ' lit' : ''}"><i></i>${i.name}</span>`).join('')}
      </div>
      <div class="mod mod-wires" id="bbWires"><span class="led"></span>
        ${b.wires.map((c, i) => `<button class="wire" data-w="${i}" style="--c:${BB.WIRE_COLORS[c]}"><span class="pin"></span><span class="cable"></span><span class="pin"></span></button>`).join('')}
      </div>
      <div class="mod mod-btn" id="bbBtnMod"><span class="led"></span>
        <button class="big-btn" id="bbBtn" style="--c:${BB.BTN_COLORS[b.button.color]}"><span>${esc(b.button.label)}</span></button>
        <div class="strip" id="bbStrip"></div>
      </div>
      <div class="mod mod-lock" id="bbKeys"><span class="led"></span>
        <div class="lock-row">${[0, 1, 2].map((i) => `<div class="wheel"><button data-lk="${i}" data-d="1" aria-label="artır">▲</button><b id="bbD${i}">0</b><button data-lk="${i}" data-d="-1" aria-label="azalt">▼</button></div>`).join('')}
          <button class="lock-open" id="bbOpen">AÇ</button></div>
      </div>
      <div class="bb-x hidden" id="bbX">❌</div>
      <div class="bomb-over hidden" id="bbOver"></div>
    </div>`;
  }
  function bindBomb() {
    ui.querySelectorAll('[data-w]').forEach((el) => el.addEventListener('click', () => { if (!el.classList.contains('cut')) { sfx('shot'); gact({ m: 'wire', i: Number(el.dataset.w) }); } }));
    ui.querySelectorAll('[data-lk]').forEach((el) => el.addEventListener('click', () => { sfx('tick'); gact({ m: 'lock', i: Number(el.dataset.lk), d: Number(el.dataset.d) }); }));
    $('#bbOpen').addEventListener('click', () => { sfx('pop'); gact({ m: 'open' }); });
    const btn = $('#bbBtn');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); btn.setPointerCapture(e.pointerId);
      if (press) return;
      btn.classList.add('down');
      press = { t: performance.now(), held: false };
      press.timer = setTimeout(() => { if (press) { press.held = true; sfx('drop'); gact({ m: 'btn', a: 'hold' }); } }, HOLD_MS);
    });
    const up = () => {
      if (!press) return;
      btn.classList.remove('down');
      clearTimeout(press.timer);
      const p = press; press = null;
      if (p.held) gact({ m: 'btn', a: 'release', timer: timerNow() });
      else gact({ m: 'btn', a: 'press' });
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  function updateBomb(b) {
    ui.querySelectorAll('[data-w]').forEach((el) => el.classList.toggle('cut', b.cut.includes(Number(el.dataset.w))));
    $('#bbWires').classList.toggle('solved', b.wireDone);
    $('#bbBtnMod').classList.toggle('solved', b.btnDone);
    $('#bbKeys').classList.toggle('solved', b.keyDone);
    for (let i = 0; i < 3; i++) { const el = $('#bbD' + i); if (el) el.textContent = b.digits[i]; }
    const strip = $('#bbStrip');
    strip.style.background = b.hold && press ? BB.WIRE_COLORS[b.hold.strip] || '#fff' : '';
    strip.classList.toggle('on', !!(b.hold && press));
    $('#bbStrikes').innerHTML = Array.from({ length: BB.MAX_STRIKES }, (_, i) => `<i class="${i < b.strikes ? 'x' : ''}">✗</i>`).join('');
    if (b.strikes > lastStrikes) {
      sfx('boom'); shakeT = performance.now() + 450; if (navigator.vibrate) navigator.vibrate(200);
      const x = $('#bbX'); if (x) { x.classList.remove('hidden', 'go'); void x.offsetWidth; x.classList.add('go'); clearTimeout(x._t); x._t = setTimeout(() => x.classList.add('hidden'), 900); } // hata: büyük çarpı
    }
    lastStrikes = b.strikes;
    const over = $('#bbOver');
    if (b.exploded || b.done !== null) {
      over.classList.remove('hidden');
      over.className = `bomb-over ${b.exploded ? 'boom' : 'ok'}`;
      over.innerHTML = b.exploded ? '💥 BOOM!<small>Bomba patladı</small>' : `✅ ÇÖZÜLDÜ!<small>${BB.timerText(b.done)} sürede</small>`;
    }
  }

  function teamsHTML() {
    const s = ctx.state();
    return `<div class="bb-teams">${s.g.teams.map((t) => {
      const st = t.status.filter(Boolean);
      const done = t.bot ? t.botDone : st.length && st.every((x) => x.done !== null || x.exploded) ? st.every((x) => x.done !== null && !x.exploded) : null;
      const solved = t.bot ? '' : st.map((x) => `${'🟩'.repeat(x.solved)}${'⬛'.repeat(3 - x.solved)}${x.strikes ? ` ✗${x.strikes}` : ''}`).join(' · ');
      return `<div class="bb-team${t.id === s.g.myTeam ? ' mine' : ''}">${t.members.map(face).join('')}<span>${solved || (t.bot ? '🤖' : '')}</span><b>${done === true ? '✅' : done === false ? '💥' : '⏳'}</b></div>`;
    }).join('')}</div>`;
  }

  function build(s) {
    const r = s.g.role;
    const t = myTeam();
    let head = '';
    if (r === 'cozen') head = `<div class="bb-role">🧨 Bombayı <b>sen</b> görüyorsun. ${t.experts && t.experts.length ? `<b>${esc(names(t.experts))}</b> kılavuzu okuyor` : ''}${t.defusers.length > 1 ? ` · aynı bombayı <b>${esc(names(t.defusers.filter((x) => x !== playerId)))}</b> da çözüyor` : ''}. Gördüğünü anlat!</div>`;
    if (r === 'anlatici') head = `<div class="bb-role">📕 <b>Kılavuz sende.</b> Bombayı <b>${esc(names(t.defusers))}</b> görüyor. Ne gördüğünü sor, kurala göre ne yapacağını söyle!</div>`;
    if (r === 'solo') head = `<div class="bb-role">🧨 Takımın tek kişi: bombayı da kılavuzu da sen göreceksin. Sekmeler arasında geç!</div>
      <div class="bb-tabs"><button data-tab="bomb" class="${tab === 'bomb' ? 'on' : ''}">🧨 Bomba</button><button data-tab="man" class="${tab === 'man' ? 'on' : ''}">📕 Kılavuz</button></div>`;
    const cur = s.g.teams.find((x) => x.id === s.g.turn);
    if (r === 'izle') head = '<div class="bb-role">👀 İzliyorsun</div>';
    if (r === 'bekle') head = `<div class="bb-role">⏳ Şimdi <b>${esc(names(cur.members))}</b> takımının sırası. Beklerken onları izle, sıra sana gelecek!</div>`;
    ui.innerHTML = head + (r === 'anlatici' ? '<div id="bbLive"></div>' + manualHTML() : '')
      + (r === 'cozen' || r === 'solo' ? `<div class="bb-pane${r === 'solo' && tab !== 'bomb' ? ' hidden' : ''}" data-pane="bomb">${bombHTML(s.g.bomb)}</div>` : '')
      + (r === 'solo' ? `<div class="bb-pane${tab !== 'man' ? ' hidden' : ''}" data-pane="man">${manualHTML()}</div>` : '')
      + '<div id="bbTeams"></div>';
    if (s.g.bomb) { bindBomb(); lastStrikes = s.g.bomb.strikes; updateBomb(s.g.bomb); }
    const tabs = ui.querySelector('.bb-tabs');
    if (tabs) tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      ui.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
    });
  }

  // Tur başında herkese: bu turda kim bombayı görüyor, kim anlatıyor
  function introHTML(s) {
    const t = s.g.teams.find((x) => x.id === s.g.turn);
    const who = (ids) => ids.map((id) => `<span class="bb-pill">${face(id)}<b>${esc(id === playerId ? 'Sen' : pName(id))}</b></span>`).join('');
    const exp = t.experts || [];
    return `<div class="bb-intro"><h3>🧨 Sıra bu takımda</h3>
      <div class="bb-intro-row"><small>🧨 BOMBAYI GÖREN${t.defusers.length > 1 ? 'LER' : ''}</small>${who(t.defusers)}</div>
      ${exp.length ? `<div class="bb-intro-row"><small>📕 KILAVUZU OKUYAN${exp.length > 1 ? 'LAR' : ''} (tarif eden)</small>${who(exp)}</div>` : '<div class="bb-intro-row"><small>Tek kişisin: bombayı da kılavuzu da sen göreceksin</small></div>'}
      <p>Diğer takımlar sıralarını bekliyor.</p></div>`;
  }
  let dynKey = '', introKey = '';
  const client = {
    kind: 'bombaci',
    supports3D: false,
    onState(s) {
      if (!s.g || anim) return;
      if (s.status !== 'playing') return;
      const k = `${s.seq}:${s.round}:${s.g.role}`;
      if (k !== key) { key = k; dynKey = ''; build(s); }
      if (s.g.bomb) updateBomb(s.g.bomb);
      const tk = JSON.stringify(s.g.teams);
      if (tk !== dynKey) {
        dynKey = tk;
        const el = $('#bbTeams'); if (el) el.innerHTML = teamsHTML();
        const live = $('#bbLive');
        if (live) { const t = myTeam(); live.innerHTML = `<div class="bb-live">${t.status.map((x, i) => x ? `${face(t.defusers[i])} ${'🟩'.repeat(x.solved)}${'⬛'.repeat(3 - x.solved)} ${x.strikes ? '✗'.repeat(x.strikes) : ''} ${x.exploded ? '💥' : x.done !== null ? '✅' : ''}` : '').join('<br>')}</div>`; }
      }
    },
    onEntry(e, skip) {
      anim = { e, t0: performance.now() - skip };
      const r = e.results;
      const ids = Object.keys(r).sort((a, b) => (r[a] ?? 1e12) - (r[b] ?? 1e12));
      ui.innerHTML = `<div class="bb-res"><h3>🧨 Sonuçlar</h3>${ids.map((id, i) => `<div class="${id === playerId ? 'me' : ''}"><span>${r[id] !== null ? i + 1 + '.' : '💥'}</span>${face(id)}<b>${esc(id === playerId ? 'Sen' : pName(id))}</b><em>${r[id] !== null ? BB.timerText(r[id]) : 'patladı'}</em></div>`).join('')}</div>`;
      sfx(r[playerId] !== null && r[playerId] !== undefined ? 'fanfare' : 'boom');
    },
    revealTotal: (e) => e.dur || 3000,
    animating: () => !!anim,
    frame(now, dt, ph) {
      const s = ctx.state();
      const { W, H } = ctx.size();
      if (anim && now - anim.t0 > (anim.e.dur || 3000)) { anim = null; key = ''; }
      g.fillStyle = '#14161c'; g.fillRect(0, 0, W, H);
      ui.style.transform = shakeT > now ? `translate(${(Math.random() - 0.5) * 10}px, ${(Math.random() - 0.5) * 6}px)` : '';
      if (anim || !s.g || s.status !== 'playing') return '';
      const tm = $('#bbTimer');
      if (tm) {
        const left = s.g.endsAt - ctx.serverNow();
        const b = s.g.bomb;
        if (!b || (!b.exploded && b.done === null)) {
          tm.textContent = BB.timerText(left);
          tm.classList.toggle('low', left < 30000);
          const sec = Math.ceil(left / 1000);
          if (sec !== lastSec) { lastSec = sec; if (left < 30000 || sec % 2 === 0) sfx('tick'); }
        }
      }
      const r = s.g.role;
      let intro = ui.querySelector('#bbIntro');
      const showIntro = ctx.serverNow() < s.g.startsAt;
      if (showIntro) {
        const ik = `${s.seq}:${s.round}`;
        if (!intro) { intro = document.createElement('div'); intro.id = 'bbIntro'; ui.appendChild(intro); introKey = ''; }
        if (introKey !== ik) { introKey = ik; intro.innerHTML = introHTML(s); }
      } else if (intro) intro.remove();
      if (showIntro) return r === 'anlatici' ? '📕 Kılavuzu oku, takımına anlat!' : '🧨 Hazırlan…';
      return '';
    },
    hint: () => null,
    hideReady: () => true,
    panel() { return ''; },
    action: () => null,
    pointer() {},
    hud() { const s = ctx.state(); const r = s.g && s.g.role; return r === 'bekle' ? '⏳ Beklemede' : r === 'anlatici' ? '📕 Anlatıcı' : r === 'cozen' ? '🧨 Çözen' : r === 'solo' ? '🧨 Tek kişi' : '👀 İzleyici'; },
    dispose() { if (press) clearTimeout(press.timer); ui.remove(); },
  };
  return client;
}
