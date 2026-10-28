// 🗿 Keski Düellosu istemcisi: 3D taş küp. Gösterim sırasında hedef şekil, sonra kendi küpünü yont.
import * as KS from '../games/keski.js';
import { $, esc, clamp, sfx } from './util.js';
import { portraitURL } from './avatar2d.js';
import { loadThree } from './avatar3d.js';

const DEF_YAW = 0.65, DEF_PITCH = 0.5;

export function createKeski(ctx) {
  const { pById, playerId } = ctx;
  const g = ctx.g2d;
  const ui = document.createElement('div');
  ui.className = 'kk';
  ui.innerHTML = `<div class="kk-top" id="kkTop"></div>
    <div class="kk-bot hidden" id="kkBot">
      <span class="kk-count" id="kkCount"></span>
      <button class="btn ghost" data-k="undo">↶ Geri</button>
      <button class="btn ghost" data-k="reset">⟲ Sıfırla</button>
      <button class="btn ok" data-k="send">Gönder ✓</button>
    </div>
    <div class="kk-bot hidden" id="kkOk"><span class="kk-count" id="kkOkN"></span><button class="btn ok" data-k="ok">Ezberledim ✓</button></div>
    <div class="kk-res hidden" id="kkRes"></div>`;
  ctx.stage.appendChild(ui);
  const mine = [];                     // kırdığım parçalar (sırayla, geri alınabilir)
  const targets = {};                  // tur → hedef (gösterim bitince sunucu göndermez, burada saklanır)
  let okSent = false, okRound = 0, key = '', anim = null, submitted = false, autoSent = false, lastSec = -1;
  let T = null, R = null, loading = false;
  const orbit = { yaw: DEF_YAW, pitch: DEF_PITCH, user: false };
  let drag = null, debris = [];

  ui.querySelector('#kkBot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b || !canCarve()) return;
    if (b.dataset.k === 'undo' && mine.length) { mine.pop(); sfx('tick'); }
    if (b.dataset.k === 'reset') { mine.length = 0; sfx('tick'); }
    if (b.dataset.k === 'send' && mine.length) send();
  });
  ui.querySelector('#kkOk').addEventListener('click', (e) => {
    if (!e.target.closest('[data-k="ok"]') || okSent) return;
    okSent = true; sfx('pop');
    const s = st(); ctx.call({ action: 'gact', seq: s.seq, round: s.round, t: 'ok' }).catch((err) => { okSent = false; ctx.toast(err.message); });
  });
  function send() { submitted = true; sfx('pop'); ctx.submit(); }

  const st = () => ctx.state();
  const showEnd = (s) => s.g.showEnd || s.roundStart + s.g.showMs;
  const me = () => ctx.me();
  const canCarve = () => { const s = st(); return s && s.status === 'playing' && ctx.phase() === 'plan' && !submitted && ctx.serverNow() >= showEnd(s) - 500; };

  // ---------- 3D ----------
  async function ensure3D() {
    if (R || loading) return;
    loading = true;
    try { T = await loadThree(); R = build3D(); } catch (e) { console.error(e); ctx.toast('3D yüklenemedi'); }
    loading = false;
  }
  function stoneTex(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#b8b2a7'; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 500; i++) { const v = 140 + Math.random() * 80; x.fillStyle = `rgba(${v},${v - 6},${v - 14},.5)`; x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    x.strokeStyle = 'rgba(60,55,50,.35)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(Math.random() * 64, Math.random() * 64); x.lineTo(Math.random() * 64, Math.random() * 64); x.stroke(); }
    x.strokeStyle = 'rgba(40,35,30,.6)'; x.lineWidth = 3; x.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1c2233');
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b3328', 1.5));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.8); sun.position.set(4, 8, 6); scene.add(sun);
    const tex = stoneTex(THREE);
    const mats = {
      stone: [0, 1, 2].map((k) => new THREE.MeshLambertMaterial({ map: tex, color: ['#ffffff', '#ece6dc', '#f4efe8'][k] })),
      miss: new THREE.MeshLambertMaterial({ map: tex, color: '#facc15', emissive: '#4a3a00' }),
      wrong: new THREE.MeshLambertMaterial({ color: '#ef4444', transparent: true, opacity: 0.45 }),
      ghost: new THREE.MeshLambertMaterial({ color: '#60a5fa', transparent: true, opacity: 0.12, depthWrite: false }),
    };
    const geo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    const cube = new THREE.Group();
    scene.add(cube);
    const meshes = [];
    for (let i = 0; i < 27; i++) {
      if (i === KS.CENTER) { meshes.push(null); continue; }
      const [x, y, z] = KS.cubeXYZ(i);
      const m = new THREE.Mesh(geo, mats.stone[(x + y * 2 + z) % 3]);
      m.position.set(x - 1, y - 1, z - 1);
      m.userData.i = i;
      cube.add(m); meshes.push(m);
    }
    // kaide + "ÖN" işareti (yön karışmasın)
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.4, 32), new THREE.MeshLambertMaterial({ color: '#4b5563' }));
    ped.position.y = -2.05; cube.add(ped);
    const fc = document.createElement('canvas'); fc.width = 128; fc.height = 64;
    const fx = fc.getContext('2d'); fx.fillStyle = '#f97316'; fx.fillRect(0, 0, 128, 64); fx.fillStyle = '#fff'; fx.font = '900 40px system-ui'; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.fillText('ÖN', 64, 34);
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: ft }));
    front.position.set(0, -2.05, 2.62); cube.add(front);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '#f97316' }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -1.83; cube.add(ring);
    const debGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    return { renderer, scene, cam, cube, meshes, mats, debGeo, ring, ray: new THREE.Raycaster(), w: 0, h: 0 };
  }

  function crumble(i) {
    if (!R) return;
    const m = R.meshes[i];
    for (let k = 0; k < 10; k++) {
      const d = new T.Mesh(R.debGeo, R.mats.stone[k % 3]);
      d.position.copy(m.position).add(new T.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      d.userData.v = new T.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      d.userData.life = 0;
      R.cube.add(d); debris.push(d);
    }
  }

  // Görünen küp: hangi parçalar yok, hangileri renkli
  function shape(mode, s) {
    if (!R) return;
    const round = anim ? anim.e.round : s.round;
    const tg = (anim ? anim.e.target : targets[round]) || [];
    const res = anim && anim.e.results[playerId];
    for (let i = 0; i < 27; i++) {
      const m = R.meshes[i];
      if (!m) continue;
      let vis = true, mat = R.mats.stone[(m.position.x + 1 + (m.position.y + 1) * 2 + m.position.z + 1) % 3];
      if (mode === 'full') vis = true;
      else if (mode === 'target') vis = !tg.includes(i);
      else if (mode === 'mine') vis = !mine.includes(i);
      else if (mode === 'reveal') {
        const my = res && res.removed ? res.removed : null;
        if (tg.includes(i)) { vis = !!(my && !my.includes(i)); if (vis) mat = R.mats.miss; }
        else if (my && my.includes(i)) { mat = R.mats.wrong; }
      }
      m.visible = vis; m.material = mat;
    }
  }

  function render3D(now, dt, mode, spin) {
    if (!R) return;
    const sz = ctx.size3();
    if (sz.w !== R.w || sz.h !== R.h) { R.renderer.setSize(sz.w, sz.h, false); R.cam.aspect = sz.w / Math.max(1, sz.h); R.cam.updateProjectionMatrix(); R.w = sz.w; R.h = sz.h; }
    if (spin && !orbit.user) orbit.yaw += dt * spin;
    const dist = 8.6 / Math.min(1, R.cam.aspect * 1.15);
    R.cam.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * dist, Math.sin(orbit.pitch) * dist - 0.3, Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * dist);
    R.cam.lookAt(0, -0.35, 0);
    R.ring.material.color.set(mode === 'target' ? '#38bdf8' : '#f97316');
    debris = debris.filter((d) => {
      d.userData.life += dt;
      d.userData.v.y -= 9 * dt;
      d.position.addScaledVector(d.userData.v, dt);
      d.rotation.x += dt * 5; d.rotation.y += dt * 4;
      if (d.userData.life > 1.1) { R.cube.remove(d); return false; }
      return true;
    });
    R.renderer.render(R.scene, R.cam);
  }

  function pick(ev) {
    if (!R) return -1;
    const r = ctx.cv3.getBoundingClientRect();
    const p = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    R.ray.setFromCamera(p, R.cam);
    const hit = R.ray.intersectObjects(R.meshes.filter((m) => m && m.visible), false)[0];
    return hit ? hit.object.userData.i : -1;
  }

  // ---------- Durum ----------
  function onRound(s) {
    const k = `${s.seq}:${s.round}`;
    if (k === key) return;
    key = k;
    mine.length = 0; submitted = !!s.myAction; autoSent = false; lastSec = -1;
    if (s.myAction && s.myAction.removed) mine.push(...s.myAction.removed);
    orbit.yaw = DEF_YAW; orbit.pitch = DEF_PITCH; orbit.user = false;
    $('#kkRes').classList.add('hidden');
  }

  // Doğru kırılan parça sayısı: hedefle kesişim / hedef sayısı; fazladan kırılanlar ayrıca gösterilir
  const score = (e, r) => {
    const tg = e.target || [], my = r && r.removed ? r.removed : [];
    const right = my.filter((i) => tg.includes(i)).length, extra = my.filter((i) => !tg.includes(i)).length;
    return { right, total: tg.length, extra };
  };
  function revealHTML(e) {
    const ids = Object.keys(e.results);
    const mineR = e.results[playerId], ms = mineR ? score(e, mineR) : null;
    const head = !mineR ? 'Doğru şekil'
      : mineR.ok ? `✅ MÜKEMMEL! ${ms.total}/${ms.total}`
      : `❌ ${ms.right}/${ms.total} doğru${ms.extra ? ` · ${ms.extra} fazla` : ''}${mineR.removed ? '' : ' (göndermedin)'} — elendin`;
    // en çok doğru yapan(lar) öne: kim kazandı anlaşılsın
    const sorted = ids.slice().sort((a, b) => (e.results[b].ok - e.results[a].ok) || (score(e, e.results[b]).right - score(e, e.results[a]).right) || (score(e, e.results[a]).extra - score(e, e.results[b]).extra));
    return `<b>${head}</b>
      <div class="kk-faces">${sorted.map((id) => { const p = pById(id) || { look: null, color: '#888', name: '?' }; const r = e.results[id], sc = score(e, r); return `<span class="${r.ok ? 'ok' : 'no'}${id === playerId ? ' me' : ''}"><img src="${portraitURL(p.look, p.color)}" alt=""><b class="kk-sc">${r.ok ? '✓ ' : ''}${sc.right}/${sc.total}</b><small>${esc(id === playerId ? 'Sen' : p.name)}${sc.extra ? ` · +${sc.extra}` : ''}</small></span>`; }).join('')}</div>
      ${(() => { const nmOf = (id) => (id === playerId ? 'Sen' : (pById(id) || { name: '?' }).name); const good = ids.filter((id) => e.results[id].ok).map(nmOf), bad = ids.filter((id) => !e.results[id].ok).map(nmOf); return `<div class="kk-bad ok">✅ Doğru bilenler: ${good.length ? good.map(esc).join(', ') : 'kimse'}</div><div class="kk-bad no">${bad.length ? '❌ Bilemeyenler: ' + bad.map(esc).join(', ') : '🎉 Herkes doğru yaptı!'}</div>`; })()}
      ${mineR && !mineR.ok ? '<small class="kk-leg"><i class="y"></i> kırman gereken · <i class="r"></i> fazladan kırdığın</small>' : ''}`;
  }

  const client = {
    kind: 'keski',
    supports3D: false,
    always3D: true,
    ready3D: () => !!R,
    onState(s) {
      if (!s.g) return;
      if (s.g.target) targets[s.round] = s.g.target;
      if (s.status === 'playing') onRound(s);
    },
    onEntry(e, skip) {
      anim = { e: { ...e, round: e.round }, t0: performance.now() - skip };
      orbit.user = false;
      const res = $('#kkRes'); res.innerHTML = revealHTML(e); res.classList.remove('hidden');
      sfx(e.results[playerId] && !e.results[playerId].ok ? 'fall' : 'finish');
    },
    revealTotal: () => KS.REVEAL_MS,
    animating: () => !!anim,
    frame(now, dt, ph) {
      ensure3D();
      const s = st();
      const { W, H, DPR } = ctx.size();
      if (anim && now - anim.t0 > KS.REVEAL_MS) { anim = null; $('#kkRes').classList.add('hidden'); orbit.yaw = DEF_YAW; orbit.pitch = DEF_PITCH; }
      if (!R) { g.fillStyle = '#1c2233'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = `700 ${16 * DPR}px system-ui`; g.textAlign = 'center'; g.fillText('Taş küp yükleniyor…', W / 2, H / 2); }
      const sn = ctx.serverNow();
      let mode = 'full', spin = 0, banner = '';
      const alive = me() && me().alive;
      if (anim) { mode = 'reveal'; spin = 0.5; banner = '🔍 Doğru şekil'; }
      else if (s.status === 'playing' && s.g) {
        if (sn < s.roundStart) { mode = 'full'; spin = 0.4; banner = `🗿 Tur ${s.round}: ${s.g.count} parça kırılacak`; }
        else if (sn < showEnd(s)) {
          mode = targets[s.round] ? 'target' : 'full'; spin = (Math.PI * 2) / (s.g.showMs / 1000) * 0.9;
          const sec = Math.ceil((showEnd(s) - sn) / 1000);
          if (sec !== lastSec) lastSec = sec;
          if (okRound !== s.round) { okRound = s.round; okSent = false; }
          const okBox = $('#kkOk'), mineOk = okSent || (s.g.ok || []).includes(playerId);
          const showOk = s.round === 1 && alive && !mineOk;
          okBox.classList.toggle('hidden', !(s.round === 1 && alive));
          okBox.querySelector('button').classList.toggle('hidden', !showOk);
          $('#kkOkN').textContent = `${(s.g.ok || []).length}/${(s.g.need || []).length} hazır`;
          banner = s.round === 1 ? (mineOk ? '✅ Diğerleri bekleniyor…' : '👀 EZBERLE! Hazır olunca "Ezberledim"e bas') : `⏱️ HIZLI EZBERLE! ${sec} sn var`;
        } else if (!alive) { mode = targets[s.round] ? 'target' : 'full'; spin = 0.3; banner = '👀 İzliyorsun'; }
        else {
          if (!orbit.reset) { orbit.reset = true; orbit.yaw = DEF_YAW; orbit.pitch = DEF_PITCH; orbit.user = false; }
          mode = 'mine';
          banner = submitted ? '✅ Gönderildi — diğerleri bekleniyor' : `⛏️ ${s.g.count} parçayı kır!`;
          // süre bitmek üzereyken kırdıklarını otomatik gönder
          if (!submitted && !autoSent && mine.length && s.deadline - sn < 1500) { autoSent = true; send(); }
        }
        if (sn < showEnd(s)) orbit.reset = false;
      }
      if (mode !== 'target' || !s || s.round !== 1) $('#kkOk').classList.add('hidden');
      shape(mode, s);
      render3D(now, dt, mode, spin);
      const carving = mode === 'mine' && alive && !submitted && ph === 'plan';
      $('#kkBot').classList.toggle('hidden', !carving);
      if (carving) {
        const n = s.g.count;
        $('#kkCount').textContent = `${mine.length}/${n}`;
        $('#kkCount').classList.toggle('full', mine.length === n);
        ui.querySelector('[data-k="send"]').classList.toggle('glow', mine.length === n);
      }
      $('#kkTop').innerHTML = mode === 'target' && !anim ? '<span class="kk-eye">HEDEF ŞEKİL</span>' : mode === 'mine' ? '<span class="kk-you">SENİN KÜPÜN</span>' : '';
      return banner;
    },
    hint: () => null,
    hideReady: () => true,
    panel() { return ''; },
    action() { return mine.length ? { removed: mine.slice() } : null; },
    pointer(type, ev) {
      if (!R) return;
      if (type === 'down') { drag = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: 0 }; return; }
      if (!drag) return;
      if (type === 'move') {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 8) { orbit.user = true; orbit.yaw -= dx * 0.012; orbit.pitch = clamp(orbit.pitch + dy * 0.01, -0.35, 1.35); }
        drag.x = ev.clientX; drag.y = ev.clientY;
        return;
      }
      if (type === 'up' && drag.moved <= 8 && canCarve() && me() && me().alive) {
        const i = pick(ev);
        const n = st().g.count;
        if (i >= 0 && !mine.includes(i)) {
          if (mine.length >= n) { ctx.toast(`En fazla ${n} parça kırabilirsin`); sfx('hit'); }
          else { mine.push(i); crumble(i); sfx('crash'); if (navigator.vibrate) navigator.vibrate(30); }
        }
      }
      drag = null;
    },
    hud() { const s = st(); return s && s.g ? `Tur <b>${s.round}</b> · ${s.g.count} parça` : ''; },
    dispose() { ui.remove(); if (R) { R.renderer.dispose(); R = null; } },
  };
  return client;
}
