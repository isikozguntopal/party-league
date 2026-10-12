// Karakter özelleştirme ekranı: 3D dönen önizleme (döndürme aç/kapa, emote butonları) + sekmeli seçenekler
import { LOOK_OPTIONS, LOOK_GROUPS, cleanLook, randomLook } from '../games/avatar.js';
import { $, esc, sfx } from './util.js';
import { loadThree, buildAvatar, animateAvatar, startEmote, EMOTES } from './avatar3d.js';
import { drawPortrait } from './avatar2d.js';

const EMOTE_BTN = { wave: '👋', scratch: '🤔', surprise: '😲', cheer: '🙌', jump: '🦘', dance: '🕺' };

export function createCustomizer({ getLook, onChange, color = () => '#3b82f6' }) {
  let look = cleanLook(getLook());
  let T = null, R = null, running = false, rotY = -1.2, dragX = null, spin = true, tab = 'yuz'; // -π/2 civarı: yüz kameraya
  const opts = $('#customOpts');
  const tabs = $('#customTabs');

  function renderTabs() {
    tabs.innerHTML = LOOK_GROUPS.map(([id, lab]) => `<button class="ctab${tab === id ? ' on' : ''}" data-tab="${id}">${esc(lab)}</button>`).join('');
  }
  function renderOptions() {
    opts.innerHTML = Object.entries(LOOK_OPTIONS).filter(([, o]) => o.group === tab).map(([k, o]) => {
      const items = o.colors
        ? o.colors.map((c, i) => `<button class="sw${look[k] === i ? ' on' : ''}" style="background:${c}" data-k="${k}" data-v="${i}" aria-label="${esc(o.label)} ${i + 1}"></button>`).join('')
        : o.options.map(([id, lab]) => `<button class="opt${look[k] === id ? ' on' : ''}" data-k="${k}" data-v="${id}">${esc(lab)}</button>`).join('');
      return `<div class="opt-row"><span>${esc(o.label)}</span><div class="opt-items">${items}</div></div>`;
    }).join('');
  }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; renderTabs(); renderOptions(); });
  opts.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    look[k] = LOOK_OPTIONS[k].colors ? Number(b.dataset.v) : b.dataset.v;
    sfx('tick');
    changed();
  });
  $('#btnRandomLook').addEventListener('click', () => { look = randomLook(); sfx('pop'); changed(); if (R && R.av) startEmote(R.av, 'surprise', performance.now() / 1000); });
  $('#btnSpin').addEventListener('click', () => { spin = !spin; $('#btnSpin').classList.toggle('on', spin); $('#btnSpin').textContent = spin ? '🔄 Döndür: Açık' : '⏸️ Döndür: Kapalı'; });
  $('#customEmotes').innerHTML = Object.entries(EMOTE_BTN).map(([k, e]) => `<button class="emo" data-emo="${k}" title="${k}">${e}</button>`).join('');
  $('#customEmotes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emo]');
    if (!b || !R || !R.av) return;
    startEmote(R.av, b.dataset.emo, performance.now() / 1000);
    sfx('pop');
  });

  function changed() {
    look = cleanLook(look);
    renderOptions();
    rebuild();
    onChange(look);
  }

  async function init3D() {
    try {
      T = await loadThree();
    } catch { return draw2D(); }
    const cv = $('#customCv');
    const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 0.75, 4.2);
    cam.lookAt(0, 0.62, 0);
    scene.add(new T.HemisphereLight('#dfe6ff', '#2a2440', 2));
    const key = new T.DirectionalLight('#ffffff', 1.8); key.position.set(2, 3, 3); scene.add(key);
    const disc = new T.Mesh(new T.CylinderGeometry(0.75, 0.8, 0.08, 40), new T.MeshLambertMaterial({ color: '#26324d' }));
    disc.position.y = -0.04; scene.add(disc);
    R = { renderer, scene, cam, holder: new T.Group(), av: null };
    scene.add(R.holder);
    cv.addEventListener('pointerdown', (e) => { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dragX !== null) { rotY += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
    cv.addEventListener('pointerup', () => { dragX = null; });
    rebuild();
  }
  function rebuild() {
    if (!R) return draw2D();
    const prev = R.av;
    if (prev) R.holder.remove(prev.root);
    R.av = buildAvatar(T, look, color(), { gun: false });
    if (prev && prev.emote) R.av.emote = prev.emote;
    R.holder.add(R.av.root);
  }
  function draw2D() {
    const cv = $('#customCv');
    const c = cv.getContext('2d');
    if (!c) return;
    cv.width = cv.height = 320;
    c.clearRect(0, 0, 320, 320);
    drawPortrait(c, look, color(), 40, 40, 240);
  }
  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!R) return;
    const cv = R.renderer.domElement;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * R.renderer.getPixelRatio())) { R.renderer.setSize(w, h, false); R.cam.aspect = w / h; R.cam.updateProjectionMatrix(); }
    if (dragX === null && spin) rotY += 0.006;
    R.holder.rotation.y = rotY;
    animateAvatar(R.av, t / 1000);
    R.renderer.render(R.scene, R.cam);
  }

  return {
    open() {
      look = cleanLook(getLook());
      renderTabs();
      renderOptions();
      running = true;
      if (!R && !T) init3D(); else rebuild();
      requestAnimationFrame(loop);
      if (R && R.av) startEmote(R.av, 'wave', performance.now() / 1000);
    },
    close() { running = false; },
  };
}
