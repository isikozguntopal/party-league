// Dokunmatik kumanda: solda direksiyon (yatay) ya da joystick, sağda butonlar. Çoklu dokunma + klavye.
// Kullanım: const c = createControls(stage, { left: 'wheel' | 'stick', buttons: [{ id, label, cls }] }); c.state
// below: true → kumanda haritanın üstüne binmez; harita ile alt panel arasında ayrı bir şerit olur
export function createControls(stage, { left = 'stick', buttons = [], below = false } = {}) {
  const state = { x: 0, y: 0, btn: Object.fromEntries(buttons.map((b) => [b.id, false])), pressed: {} };
  const root = document.createElement('div');
  root.className = below ? 'ctl below' : 'ctl';
  root.innerHTML = `
    <div class="ctl-left ${left}">
      ${left === 'wheel'
        ? '<div class="wheel"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="9"/><circle cx="50" cy="50" r="9" fill="currentColor"/><path d="M50 41 L50 10 M42 54 L14 66 M58 54 L86 66" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><rect x="45" y="5" width="10" height="9" rx="2" fill="#ff3355"/></svg></div>'
        : '<div class="stick-base"><div class="stick-knob"></div></div>'}
    </div>
    <div class="ctl-right">${buttons.map((b) => `<button class="ctl-btn ${b.cls || ''}" data-b="${b.id}">${b.label}</button>`).join('')}</div>`;
  if (below && stage.parentNode) stage.parentNode.insertBefore(root, stage.nextSibling);
  else stage.appendChild(root);
  const zone = root.querySelector('.ctl-left');
  const wheel = root.querySelector('.wheel');
  const base = root.querySelector('.stick-base'), knob = root.querySelector('.stick-knob');
  let leftId = null, ox = 0, oy = 0;

  const RANGE = left === 'wheel' ? 70 : 44;
  function setLeft(dx, dy) {
    if (left === 'wheel') {
      state.x = Math.max(-1, Math.min(1, dx / RANGE));
      wheel.style.transform = `rotate(${state.x * 110}deg)`;
    } else {
      const L = Math.hypot(dx, dy), k = L > RANGE ? RANGE / L : 1;
      state.x = (dx * k) / RANGE; state.y = (dy * k) / RANGE;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
  }
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    leftId = e.pointerId; zone.setPointerCapture(e.pointerId);
    if (left === 'wheel') { ox = e.clientX; } else {
      const r = base.getBoundingClientRect();
      ox = r.left + r.width / 2; oy = r.top + r.height / 2;
    }
    setLeft(e.clientX - ox, e.clientY - oy);
    zone.classList.add('on');
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === leftId) setLeft(e.clientX - ox, e.clientY - oy); });
  const endLeft = (e) => { if (e.pointerId !== leftId) return; leftId = null; setLeft(0, 0); zone.classList.remove('on'); };
  zone.addEventListener('pointerup', endLeft);
  zone.addEventListener('pointercancel', endLeft);

  for (const el of root.querySelectorAll('[data-b]')) {
    const id = el.dataset.b;
    const on = (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); state.btn[id] = true; state.pressed[id] = true; el.classList.add('on'); };
    const off = () => { state.btn[id] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Klavye (bilgisayarda deneme için): oklar/WASD, boşluk, shift
  const keys = new Set();
  const map = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'a', ShiftLeft: 'b', ShiftRight: 'b' };
  const kd = (e) => { const k = map[e.code]; if (!k || e.target.tagName === 'INPUT') return; e.preventDefault(); if (!keys.has(k) && k === 'a') state.pressed[buttons[0]?.id] = true; keys.add(k); };
  const ku = (e) => { const k = map[e.code]; if (k) keys.delete(k); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  return {
    state,
    // Okunan son durum (dokunma + klavye birleşik). once: bir kez basılan butonları tüketir
    read() {
      let x = state.x, y = state.y;
      if (keys.size) {
        if (keys.has('l')) x = -1; if (keys.has('r')) x = 1;
        if (left === 'stick') { if (keys.has('u')) y = -1; if (keys.has('d')) y = 1; }
      }
      const btn = { ...state.btn };
      if (left === 'wheel') { if (keys.has('u') || keys.has('a')) btn[buttons[0]?.id] = true; if (keys.has('d') || keys.has('b')) btn[buttons[1]?.id] = true; }
      else if (keys.has('a')) btn[buttons[0]?.id] = true;
      const pressed = state.pressed; state.pressed = {};
      return { x, y, btn, pressed };
    },
    show(v) { root.classList.toggle('hidden', !v); },
    destroy() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); root.remove(); },
  };
}
