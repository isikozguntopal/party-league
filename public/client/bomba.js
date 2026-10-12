// 💣 Bomba Ustası istemcisi: 2D üstten + 3D takip + FPS (labirentin içinden)
import * as B from '../games/bomba.js';
import { lerp, clamp, sfx, esc } from './util.js';
import { drawTopAvatar, portraitURL } from './avatar2d.js';
import { createRealtime } from './rt.js';
import { loadThree, buildAvatar, animateAvatar, makeLabel } from './avatar3d.js';

const { COLS, ROWS } = B;
const ANG = { U: -Math.PI / 2, D: Math.PI / 2, L: Math.PI, R: 0 };
const ITEM_EMOJI = { fire: '🔥', bomb: '💣', speed: '👟' };

export function createBomba(ctx) {
  const { pById, pName, playerId } = ctx;
  const g = ctx.g2d;
  let parts = [], shakeT = 0, warn = false;
  let R3 = null, T = null, loading = false;
  const fps = { yaw: -Math.PI / 2, target: -Math.PI / 2, turnT: 0, init: false };
  const walkPh = {};

  // ---------- 2D ----------
  function layout() {
    const { W, H } = ctx.size();
    const cs = Math.floor(Math.min(W / COLS, H / ROWS));
    return { cs, ox: Math.round((W - cs * COLS) / 2), oy: Math.round((H - cs * ROWS) / 2) };
  }
  function render2D(st, now, dt, info) {
    const { W, H, DPR } = ctx.size();
    const { cs, ox, oy } = layout();
    g.fillStyle = '#0c1226'; g.fillRect(0, 0, W, H);
    if (!st) return 'Bekleniyor…';
    const sk = shakeT > now ? (Math.random() - 0.5) * 7 * DPR : 0;
    g.save(); g.translate(sk, sk);
    const X = (c) => ox + c * cs, Yp = (r) => oy + r * cs;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      g.fillStyle = (r + c) % 2 ? '#3f5170' : '#3a4b69'; g.fillRect(X(c), Yp(r), cs, cs);
    }
    // eşyalar
    g.font = `${Math.round(cs * 0.55)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [i, it] of Object.entries(st.items)) {
      const [r, c] = B.rc(+i), bob = Math.sin(now / 250 + r + c) * cs * 0.05;
      g.fillStyle = it === 'fire' ? 'rgba(255,120,40,.35)' : it === 'bomb' ? 'rgba(120,160,255,.35)' : 'rgba(80,220,140,.35)';
      g.beginPath(); g.arc(X(c) + cs / 2, Yp(r) + cs / 2 + bob, cs * 0.38, 0, Math.PI * 2); g.fill();
      g.fillText(ITEM_EMOJI[it], X(c) + cs / 2, Yp(r) + cs / 2 + bob + cs * 0.03);
    }
    // duvarlar / kutular
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = st.grid[B.idx(r, c)];
      if (ch === '#') {
        const x = X(c), y = Yp(r);
        const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0);
        g.fillStyle = border ? '#1b2640' : '#5b2330'; g.fillRect(x, y + cs * 0.12, cs, cs * 0.88);
        g.fillStyle = border ? '#2f4068' : '#8f3446'; g.fillRect(x, y, cs, cs * 0.82);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + cs * 0.08, y + cs * 0.08, cs * 0.84, cs * 0.12);
      } else if (ch === 'x') {
        const x = X(c) + cs * 0.06, y = Yp(r) + cs * 0.06, s = cs * 0.88;
        g.fillStyle = '#6b4220'; g.fillRect(x, y + s * 0.1, s, s * 0.9);
        g.fillStyle = '#b07636'; g.fillRect(x, y, s, s * 0.86);
        g.strokeStyle = '#7a4c22'; g.lineWidth = Math.max(1, cs * 0.06);
        g.strokeRect(x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.7);
        g.beginPath(); g.moveTo(x + s * 0.1, y + s * 0.1); g.lineTo(x + s * 0.9, y + s * 0.76); g.stroke();
      }
    }
    // bombalar
    for (const b of st.bombs) {
      const x = X(b.c) + cs / 2, y = Yp(b.r) + cs / 2;
      const urgent = b.t < 0.8, pulse = 1 + Math.sin(now / (urgent ? 50 : 140)) * (urgent ? 0.1 : 0.05);
      const R0 = cs * 0.34 * pulse;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + R0 * 0.2, y + R0 * 0.75, R0, R0 * 0.4, 0, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(x - R0 * 0.35, y - R0 * 0.35, R0 * 0.1, x, y, R0);
      gr.addColorStop(0, urgent ? '#7a2a2a' : '#4b5563'); gr.addColorStop(1, '#0b0b0f');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c9a36a'; g.lineWidth = Math.max(1, cs * 0.05);
      g.beginPath(); g.moveTo(x + R0 * 0.4, y - R0 * 0.8); g.quadraticCurveTo(x + R0 * 0.9, y - R0 * 1.3, x + R0 * 0.6, y - R0 * 1.5); g.stroke();
      g.fillStyle = Math.random() < 0.5 ? '#ffd166' : '#ff7b39'; g.beginPath(); g.arc(x + R0 * 0.6, y - R0 * 1.5, cs * 0.07 * (0.6 + Math.random()), 0, Math.PI * 2); g.fill();
    }
    // alevler
    for (const f of st.flames) {
      const k = clamp(f.t / B.FLAME, 0, 1), s = Math.sin(Math.PI * Math.min(1, (1 - k) * 2.2 + 0.2));
      for (const i of f.cells) {
        const [r, c] = B.rc(i), x = X(c) + cs / 2, y = Yp(r) + cs / 2;
        g.globalAlpha = Math.min(1, k * 2.5);
        g.fillStyle = '#ff6a1a'; g.beginPath(); g.roundRect(x - cs * 0.5 * s, y - cs * 0.5 * s, cs * s, cs * s, cs * 0.25); g.fill();
        g.fillStyle = '#ffd34d'; g.beginPath(); g.roundRect(x - cs * 0.32 * s, y - cs * 0.32 * s, cs * 0.64 * s, cs * 0.64 * s, cs * 0.2); g.fill();
        g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(x, y, cs * 0.14 * s, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // oyuncular
    for (const p of Object.values(st.ps)) {
      if (!p.alive) continue;
      const pl = pById(p.id);
      if (!pl) continue;
      const prev = walkPh[p.id] || { x: p.x, y: p.y, ph: 0 };
      const moving = Math.hypot(p.x - prev.x, p.y - prev.y) > 0.002;
      prev.ph += moving ? dt * 14 : 0; prev.x = p.x; prev.y = p.y; walkPh[p.id] = prev;
      const x = ox + p.x * cs, y = oy + p.y * cs - Math.abs(Math.sin(prev.ph)) * cs * 0.08;
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(ox + p.x * cs, oy + p.y * cs + cs * 0.24, cs * 0.28, cs * 0.12, 0, 0, Math.PI * 2); g.fill();
      drawTopAvatar(g, pl.look, pl.color, x, y, cs * 0.3, ANG[p.dir] ?? Math.PI / 2, { gun: false });
      g.font = `700 ${Math.round(9 * DPR)}px system-ui`; g.textBaseline = 'bottom';
      g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = '#fff';
      const txt = p.id === playerId ? 'SEN' : pl.name;
      g.strokeText(txt, x, y - cs * 0.36); g.fillText(txt, x, y - cs * 0.36);
    }
    drawParts(dt, (x, y) => [ox + x * cs, oy + y * cs], cs);
    g.restore();
    return overlay(st, W, H, DPR);
  }
  function drawParts(dt, toS, cs) {
    parts = parts.filter((p) => (p.life += dt) < p.max);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
      const [px, py] = toS(p.x, p.y);
      g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c;
      g.fillRect(px - p.s * cs / 2, py - p.s * cs / 2, p.s * cs, p.s * cs);
    }
    g.globalAlpha = 1;
  }
  function overlay(st, W, H, DPR) {
    if (st.phase === 'count' || st.phase === 'wait') {
      const n = st.phase === 'wait' ? '…' : String(Math.max(1, Math.ceil(st.cd)));
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${Math.round(90 * DPR)}px system-ui`; g.lineWidth = 8 * DPR; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff';
      g.strokeText(n, W / 2, H * 0.42); g.fillText(n, W / 2, H * 0.42); g.restore();
      return st.phase === 'wait' ? '📡 Herkes bağlanıyor…' : '💣 Hazır ol!';
    }
    const me = st.ps[playerId];
    if (me && !me.alive) return '💀 Patladın! İzliyorsun';
    const left = B.SUDDEN - st.el;
    if (left <= 0) return '⚠️ Duvarlar kapanıyor!';
    if (left < 10) return `⚠️ ${Math.ceil(left)} sn sonra duvarlar kapanıyor`;
    return '';
  }

  // ---------- 3D ----------
  async function ensure3D() {
    if (R3 || loading) return;
    loading = true;
    try { T = await loadThree(); R3 = build3D(); } catch (e) { console.error(e); ctx.toast('3D görünüm yüklenemedi'); ctx.setView('top'); }
    loading = false;
  }
  function emojiTex(THREE, ch) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 72);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function build3D() {
    const THREE = T;
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.cv3, antialias: true, preserveDrawingBuffer: !!ctx.debug });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c1226');
    scene.fog = new THREE.Fog('#0c1226', 9, 22);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    scene.add(new THREE.HemisphereLight('#dbe4ff', '#20263a', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 1.3); sun.position.set(3, 10, 6); scene.add(sun);
    // zemin (dama)
    const fc = document.createElement('canvas'); fc.width = COLS * 32; fc.height = ROWS * 32;
    const fg = fc.getContext('2d');
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { fg.fillStyle = (r + c) % 2 ? '#3f5170' : '#3a4b69'; fg.fillRect(c * 32, r * 32, 32, 32); }
    const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace; ftex.magFilter = THREE.NearestFilter;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), new THREE.MeshLambertMaterial({ map: ftex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(COLS / 2, 0, ROWS / 2); scene.add(floor);
    // kutu dokusu
    const wc = document.createElement('canvas'); wc.width = wc.height = 64;
    const wg = wc.getContext('2d'); wg.fillStyle = '#b07636'; wg.fillRect(0, 0, 64, 64); wg.strokeStyle = '#7a4c22'; wg.lineWidth = 6; wg.strokeRect(5, 5, 54, 54); wg.beginPath(); wg.moveTo(6, 6); wg.lineTo(58, 58); wg.stroke();
    const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace;
    // tuğla dokusu (FPS'te derinlik hissi için)
    const brick = (base, line) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = line; x.lineWidth = 3;
      for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(0, r * 16); x.lineTo(64, r * 16); x.stroke(); for (let k = 0; k < 3; k++) { const bx = (k * 32 + (r % 2) * 16) % 64; x.beginPath(); x.moveTo(bx, r * 16); x.lineTo(bx, r * 16 + 16); x.stroke(); } }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const max = COLS * ROWS;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: brick('#40598c', '#2b3c63') }), max);
    const inner = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: brick('#9a3a4e', '#6d2534') }), max);
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.86, 0.86, 0.86), new THREE.MeshLambertMaterial({ map: wtex }), max);
    scene.add(walls, inner, crates);
    const bombGeo = new THREE.SphereGeometry(0.3, 16, 12);
    const flameGeo = new THREE.BoxGeometry(0.9, 0.7, 0.9);
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = (make) => { const arr = []; return { get(i) { while (arr.length <= i) { const o = make(); scene.add(o); arr.push(o); } arr[i].visible = true; return arr[i]; }, hide(i) { for (let k = i; k < arr.length; k++) arr[k].visible = false; } }; };
    const bombPool = pool(() => { const m = new THREE.Mesh(bombGeo, new THREE.MeshLambertMaterial({ color: '#111', emissive: '#300' })); return m; });
    const flamePool = pool(() => { const grp = new THREE.Group(); grp.add(new THREE.Mesh(flameGeo, flameMat), new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), coreMat)); return grp; });
    const itemTex = Object.fromEntries(Object.entries(ITEM_EMOJI).map(([k, e]) => [k, emojiTex(THREE, e)]));
    const itemPool = pool(() => new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true })));
    return { renderer, scene, cam, walls, inner, crates, bombPool, flamePool, itemPool, itemTex, grid: '', avatars: new Map(), w: 0, h: 0, camPos: null };
  }
  function syncGrid(grid) {
    if (grid === R3.grid) return;
    R3.grid = grid;
    const m = new T.Matrix4();
    let w = 0, n = 0, c = 0;
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      const ch = grid[B.idx(r, col)];
      if (ch === '#') {
        const border = r === 0 || col === 0 || r === ROWS - 1 || col === COLS - 1 || (r % 2 === 0 && col % 2 === 0);
        m.makeTranslation(col + 0.5, 0.5, r + 0.5);
        if (border) R3.walls.setMatrixAt(w++, m); else R3.inner.setMatrixAt(n++, m);
      } else if (ch === 'x') { m.makeTranslation(col + 0.5, 0.43, r + 0.5); R3.crates.setMatrixAt(c++, m); }
    }
    R3.walls.count = w; R3.inner.count = n; R3.crates.count = c;
    for (const im of [R3.walls, R3.inner, R3.crates]) im.instanceMatrix.needsUpdate = true;
  }
  function avatar3(id) {
    let a = R3.avatars.get(id);
    if (a) return a;
    const p = pById(id);
    const av = buildAvatar(T, p && p.look, p ? p.color : '#888', { gun: false });
    const grp = new T.Group(); av.root.scale.setScalar(0.55); grp.add(av.root);
    const label = makeLabel(T, id === playerId ? 'SEN' : p ? p.name : '?', p ? p.color : '#fff');
    label.position.y = 0.95; label.scale.set(0.8, 0.2, 1); grp.add(label);
    R3.scene.add(grp);
    a = { grp, av, label, last: null };
    R3.avatars.set(id, a);
    return a;
  }
  function render3D(st, now, dt, view) {
    const sz = ctx.size3();
    if (sz.w !== R3.w || sz.h !== R3.h) { R3.renderer.setSize(sz.w, sz.h, false); R3.cam.aspect = sz.w / sz.h; R3.cam.updateProjectionMatrix(); R3.w = sz.w; R3.h = sz.h; }
    const { W, H, DPR } = ctx.size();
    g.clearRect(0, 0, W, H);
    if (!st) { R3.renderer.render(R3.scene, R3.cam); return 'Bekleniyor…'; }
    syncGrid(st.grid);
    st.bombs.forEach((b, i) => { const m = R3.bombPool.get(i); const pulse = 1 + Math.sin(now / (b.t < 0.8 ? 50 : 140)) * 0.08; m.position.set(b.c + 0.5, 0.3, b.r + 0.5); m.scale.setScalar(pulse); m.material.emissive.setRGB(b.t < 0.8 ? 0.5 : 0.15, 0, 0); });
    R3.bombPool.hide(st.bombs.length);
    let fi = 0;
    for (const f of st.flames) for (const i of f.cells) { const [r, c] = B.rc(i); const m = R3.flamePool.get(fi++); const s = 0.7 + Math.random() * 0.4; m.position.set(c + 0.5, 0.35, r + 0.5); m.scale.set(s, 0.8 + Math.random() * 0.5, s); }
    R3.flamePool.hide(fi);
    let ii = 0;
    for (const [i, it] of Object.entries(st.items)) { const [r, c] = B.rc(+i); const s = R3.itemPool.get(ii++); s.material.map = R3.itemTex[it]; s.position.set(c + 0.5, 0.45 + Math.sin(now / 300 + i) * 0.06, r + 0.5); s.scale.setScalar(0.6); }
    R3.itemPool.hide(ii);
    for (const p of Object.values(st.ps)) {
      const a = avatar3(p.id);
      a.grp.visible = p.alive && !(view === 'fps' && p.id === playerId);
      const moving = a.last && Math.hypot(p.x - a.last.x, p.y - a.last.y) > 0.002;
      a.last = { x: p.x, y: p.y };
      a.grp.position.set(p.x, 0, p.y);
      const target = -(ANG[p.dir] ?? Math.PI / 2);
      let d = target - a.grp.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.grp.rotation.y += d * Math.min(1, dt * 14);
      animateAvatar(a.av, now / 1000, { walk: moving ? 1 : 0 });
    }
    const me = st.ps[playerId] || Object.values(st.ps).find((p) => p.alive);
    const cam = R3.cam;
    if (me) {
      if (view === 'fps' && me.alive && me.id === playerId) {
        if (!fps.init) { fps.yaw = fps.target = ANG[me.dir] ?? -Math.PI / 2; fps.init = true; }
        let d = fps.target - fps.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        fps.yaw += d * Math.min(1, dt * 10);
        cam.position.set(me.x - Math.cos(fps.yaw) * 0.15, 0.62, me.y - Math.sin(fps.yaw) * 0.15);
        cam.lookAt(me.x + Math.cos(fps.yaw) * 3, 0.45, me.y + Math.sin(fps.yaw) * 3);
      } else {
        // alan dışına taşmayan, eğik takip kamerası
        const px = clamp(me.x, 3.2, COLS - 3.2), pz = clamp(me.y, 3.5, ROWS - 2.5) + 4.6, py = 8;
        const k = !R3.camPos ? 1 : 1 - Math.pow(0.003, dt);
        R3.camPos = R3.camPos || { x: px, y: py, z: pz };
        R3.camPos.x = lerp(R3.camPos.x, px, k); R3.camPos.z = lerp(R3.camPos.z, pz, k); R3.camPos.y = py;
        cam.position.set(R3.camPos.x, R3.camPos.y, R3.camPos.z);
        cam.lookAt(R3.camPos.x, 0, R3.camPos.z - 5.4);
      }
      if (shakeT > now) cam.position.x += (Math.random() - 0.5) * 0.08;
    }
    R3.renderer.render(R3.scene, cam);
    return overlay(st, W, H, DPR);
  }

  const spec = {
    kind: 'bomba', mod: B, views: ['top', 'chase', 'fps'],
    controls: { left: 'stick', below: true, buttons: [{ id: 'bomb', label: '💣', cls: 'bomb' }] },
    input(c, view) {
      const bomb = !!(c.pressed.bomb || c.btn.bomb);
      if (view !== 'fps') return { x: c.x, y: c.y, bomb };
      // FPS: yukarı/aşağı = ileri/geri, sağ/sol = 90° dön
      const now = performance.now();
      if (Math.abs(c.x) > 0.6 && Math.abs(c.x) > Math.abs(c.y) && now > fps.turnT) { fps.target += Math.sign(c.x) * Math.PI / 2; fps.turnT = now + 380; }
      const f = Math.abs(c.y) > 0.3 ? -c.y : 0;
      const yaw = Math.round(fps.target / (Math.PI / 2)) * (Math.PI / 2);
      return { x: Math.round(Math.cos(yaw)) * f, y: Math.round(Math.sin(yaw)) * f, bomb };
    },
    setBot: (sim, id) => { if (sim.ps[id]) sim.ps[id].bot = true; },
    interp(a, b, k) {
      const ps = {};
      for (const [id, pb] of Object.entries(b.ps)) { const pa = a.ps[id] || pb; ps[id] = { ...pb, x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) }; }
      return { ...b, ps };
    },
    onEvents(evs) {
      for (const e of evs) {
        if (e.e === 'beep') sfx('tick');
        if (e.e === 'go') sfx('finish');
        if (e.e === 'drop') sfx('drop');
        if (e.e === 'boom') { sfx('boom'); shakeT = performance.now() + 350; }
        if (e.e === 'item') sfx('item');
        if (e.e === 'die') { sfx('fall'); if (e.ids.includes(playerId)) shakeT = performance.now() + 600; }
        if (e.e === 'wall' && !warn) { warn = true; sfx('shrink'); }
      }
    },
    render(st, now, dt, view) {
      if (view !== 'top') { if (!R3) { ensure3D(); return render2D(st, now, dt); } return render3D(st, now, dt, view); }
      return render2D(st, now, dt);
    },
    ready3D: () => !!R3,
    panel(st) {
      if (!st) return '<div class="status"><small>Oyun birazdan başlıyor…</small></div>';
      const ids = Object.keys(st.ps);
      return `<div class="race-board">${ids.map((id) => { const p = pById(id) || { name: '?', color: '#888' }; const q = st.ps[id]; return `<span class="chip${q.alive ? '' : ' dead'}${id === playerId ? ' cur' : ''}"><img class="pimg" src="${portraitURL(p.look, p.color)}" alt="">${esc(p.name)}${q.alive ? '' : ' 💀'}</span>`; }).join('')}</div>`;
    },
    hud(st) {
      const me = st && st.ps[playerId];
      return me ? `💣<b>${me.max}</b> 🔥<b>${me.range}</b> 👟<b>${me.speed.toFixed(1)}</b>` : '👀 İzliyorsun';
    },
    dispose() { if (R3) { R3.renderer.dispose(); R3 = null; } },
  };
  return createRealtime(ctx, spec);
}
