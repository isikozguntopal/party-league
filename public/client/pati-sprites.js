// 🐾 Pati Koşusu 2D karakterleri: koyu dış çizgili, yandan görünen çizgi film hayvanları. Canvas'ta çizilir, 3D sahnede düz levha (billboard) olarak durur.
// createSpriteAnimal(THREE, { species, color, hat }) → { root, update(pose, t, dt), dispose }
// pose: { sp, grounded, vy, slide, slam, stun, trap, zap, fallT, flip (0..1, <0 yok), squash, boost, shield, win, inv }
const SPECIES = {
  tilki: { body: '#f97316', light: '#fff7ed', dark: '#1f2937', inner: '#1f2937', cheek: '#fb923c' },
  tavsan: { body: '#e5e7eb', light: '#ffffff', dark: '#9ca3af', inner: '#f9a8d4', cheek: '#fbcfe8' },
  kedi: { body: '#94a3b8', light: '#f8fafc', dark: '#475569', inner: '#f9a8d4', cheek: '#fbcfe8' },
  panda: { body: '#f8fafc', light: '#ffffff', dark: '#111827', inner: '#111827', cheek: '#fbcfe8' },
  kurbaga: { body: '#4ade80', light: '#dcfce7', dark: '#166534', inner: '#fb7185', cheek: '#fda4af' },
  penguen: { body: '#1f2937', light: '#f8fafc', dark: '#0f172a', inner: '#fb923c', cheek: '#fda4af' },
};
const SIZE = 320, PPU = 78, FX0 = 160, FY0 = 250; // canvas boyutu, birim başına piksel, ayakların konumu (taşmasın diye geniş)
const OUT = '#1f2937';

const shade = (hex, k) => { // rengi koyulaştır (k<0) / aydınlat (k>0)
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

export function drawAnimal(g, species, bodyHex, hat, pose, t, st) {
  const S = SPECIES[species] || SPECIES.tilki;
  const body = bodyHex || S.body, light = S.light, dark = S.dark, inner = S.inner;
  g.clearRect(0, 0, SIZE, SIZE);
  // birim uzayı: x ileri, y yukarı, ayaklar y=0
  const X = (x) => FX0 + x * PPU, Y = (y) => FY0 - y * PPU;
  const ell = (cx, cy, rx, ry, fill, stroke = true, rot = 0) => { g.beginPath(); g.ellipse(X(cx), Y(cy), rx * PPU, ry * PPU, rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = 4.5; g.strokeStyle = OUT; g.stroke(); } };
  const cap = (x, y, ang, len, w, fill, tipFill) => { // sarkan uzuv: pivot (x,y), ang=0 aşağı, + ileri(sağ)
    g.save(); g.translate(X(x), Y(y)); g.rotate(-ang);
    g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w * PPU + 9; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len * PPU); g.stroke();
    g.strokeStyle = fill; g.lineWidth = w * PPU; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len * PPU); g.stroke();
    if (tipFill) { g.beginPath(); g.ellipse(w * 0.22 * PPU, (len + 0.02) * PPU, w * 0.95 * PPU, w * 0.6 * PPU, 0, 0, Math.PI * 2); g.fillStyle = tipFill; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke(); }
    g.restore();
  };
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 4.5; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke(); };

  // ---- poz: açılar ----
  const run = pose.grounded && !pose.slide && pose.fallT == null ? Math.min(1, pose.sp / 9) : 0;
  const ph = st.phase;
  let legA = Math.sin(ph) * 1.0 * run, legB = Math.sin(ph + Math.PI) * 1.0 * run, armA = Math.sin(ph + Math.PI) * 1.1 * run, armB = Math.sin(ph) * 1.1 * run;
  let lean = -0.1 * run - (pose.boost ? 0.16 : 0), bob = Math.abs(Math.sin(ph)) * 0.08 * run, off = 0, headT = 0.05 * run, tailA = Math.sin(ph * 0.5) * 0.25 * run;
  let sx = 1, sy = 1, mouthOpen = 0, eyeY = 1;
  if (!pose.grounded && pose.fallT == null) { const up = pose.vy > 0; legA = up ? -0.9 : 0.5; legB = up ? 0.7 : 0.1; armA = armB = up ? 2.7 : 1.7; lean = up ? 0.12 : -0.1; tailA = up ? -0.3 : 0.4; mouthOpen = up ? 0.6 : 0.2; }
  if (pose.slam) { legA = legB = 0.3; armA = armB = -0.6; lean = 1.0; mouthOpen = 0.8; }
  if (pose.slide) { lean = -1.15; legA = legB = -1.3; armA = armB = -2.3; off = 0.16; bob = 0; headT = 0.4; }
  if (pose.flip >= 0 && pose.flip <= 1) { lean += pose.flip * Math.PI * 2; off += Math.sin(pose.flip * Math.PI) * 0.1; legA = legB = -0.9; armA = armB = 2.4; }
  if (pose.stun > 0) { lean = Math.sin(t * 22) * 0.22; legA = legB = armA = armB = 0; tailA = Math.sin(t * 9) * 0.4; headT = Math.sin(t * 15) * 0.18; eyeY = 0.3; mouthOpen = 0.5; }
  if (pose.trap > 0) { sy = 0.84; sx = 1.1; lean = Math.sin(t * 35) * 0.08; legA = legB = 0.4; armA = armB = 1.2; eyeY = 0.45; }
  if (pose.win) { off += Math.abs(Math.sin(t * 7)) * 0.45; armA = armB = 2.9; lean = Math.sin(t * 4) * 0.2; mouthOpen = 0.9; }
  if (pose.squash > 0) { sy *= 1 - pose.squash * 1.7; sx *= 1 + pose.squash * 1.3; }
  if (pose.fallT != null) { const k = Math.min(1, pose.fallT / 0.9); lean = -k * 3; const s2 = 1 - k * 0.6; sx *= s2; sy *= s2; armA = armB = 2.6; legA = legB = 1.2; }
  if (pose.blink) eyeY = Math.min(eyeY, 0.12);

  const shake = pose.zap ? (Math.random() - 0.5) * 0.05 : 0;
  g.save();
  // gövde pivotu: ayakların ortası → döndür/ezil
  // takla ve düşüşte gövde merkezinden (kalça), diğer durumlarda ayaklardan döner
  const pivY = (pose.flip >= 0 && pose.flip <= 1) || pose.fallT != null ? 0.66 : 0;
  g.translate(X(0 + shake), Y(pivY + off));
  g.rotate(lean); g.scale(sx, sy); g.translate(-X(0), -Y(pivY));
  const hy = 0.66 + bob; // kalça yüksekliği

  // nitro alevi (gövdenin arkasında)
  if (pose.boost) {
    const f = 0.8 + Math.abs(Math.sin(t * 40)) * 0.5;
    poly([[-0.5, hy + 0.12], [-0.5 - 0.75 * f, hy], [-0.5, hy - 0.12]], '#fb923c'); poly([[-0.5, hy + 0.06], [-0.5 - 0.45 * f, hy], [-0.5, hy - 0.06]], '#fde047');
  }
  // ---- kuyruk ----
  g.save(); g.translate(X(-0.36), Y(hy - 0.08)); g.rotate(-tailA);
  const tx = (cx, cy, rx, ry, fill, rot) => { g.beginPath(); g.ellipse(cx * PPU, -cy * PPU, rx * PPU, ry * PPU, rot || 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 4.5; g.strokeStyle = OUT; g.stroke(); };
  if (species === 'tilki') { tx(-0.34, 0.12, 0.38, 0.2, body, -0.4); tx(-0.62, 0.22, 0.17, 0.14, light, -0.4); }
  else if (species === 'tavsan') tx(-0.08, 0, 0.14, 0.14, light);
  else if (species === 'kedi') { for (let k = 0; k < 6; k++) tx(-0.12 - k * 0.1, 0.05 + k * 0.07 + k * k * 0.01, 0.085 - k * 0.004, 0.085 - k * 0.004, k > 4 ? dark : body); }
  else if (species === 'panda') tx(-0.07, 0, 0.12, 0.12, dark);
  else if (species === 'penguen') { g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.2 * PPU, 0.02 * PPU); g.lineTo(-0.03 * PPU, 0.12 * PPU); g.closePath(); g.fillStyle = dark; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke(); }
  g.restore();

  const footC = species === 'tilki' || species === 'panda' ? dark : species === 'penguen' ? inner : species === 'kurbaga' ? body : light;
  const limbC = species === 'panda' ? dark : body;
  const armC = species === 'panda' || species === 'penguen' ? dark : body;
  // arka kol, arka bacak
  cap(0.0, hy + 0.22, armB, 0.3, species === 'penguen' ? 0.12 : 0.15, shade(armC, -0.15), shade(species === 'tilki' ? dark : light, -0.12));
  cap(-0.12, hy - 0.28, legB, 0.34, 0.19, shade(limbC, -0.15), shade(footC, -0.1));
  // ---- gövde ----
  ell(0, hy, 0.42, 0.47, body);
  if (species !== 'panda') ell(0.16, hy - 0.03, 0.27, 0.36, light, false);
  else ell(0.12, hy - 0.03, 0.28, 0.38, '#ffffff', false);
  if (species === 'penguen') { ell(0.15, hy - 0.03, 0.28, 0.39, light, false); }
  // ön bacak
  cap(0.14, hy - 0.28, legA, 0.34, 0.19, limbC, footC);

  // ---- baş ----
  const hx = 0.17, hyy = hy + 0.65;
  g.save(); g.translate(X(hx), Y(hyy)); g.rotate(-headT);
  const hX = (x) => x * PPU, hY = (y) => -y * PPU;
  const hell = (cx, cy, rx, ry, fill, stroke = true, rot = 0) => { g.beginPath(); g.ellipse(hX(cx), hY(cy), rx * PPU, ry * PPU, rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = 4.5; g.strokeStyle = OUT; g.stroke(); } };
  const hpoly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(hX(x), hY(y)) : g.moveTo(hX(x), hY(y)))); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 4.5; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke(); };
  // arka kulaklar
  if (species === 'tilki') { hpoly([[-0.34, 0.2], [-0.28, 0.72], [-0.02, 0.36]], shade(body, -0.12)); }
  if (species === 'kedi') { hpoly([[-0.32, 0.18], [-0.28, 0.66], [-0.04, 0.34]], shade(body, -0.12)); }
  if (species === 'tavsan') { hell(-0.28, 0.62, 0.1, 0.4, shade(body, -0.12), true, 0.35); }
  if (species === 'panda') hell(-0.26, 0.3, 0.14, 0.14, dark);
  hell(0, 0, 0.4, 0.36, body);
  if (species === 'panda') hell(0, 0, 0.395, 0.355, '#ffffff', false), hell(0, 0, 0.4, 0.36, 'rgba(0,0,0,0)');
  // yüz: kafatası üstünde ortada hafif renk
  // ön kulaklar
  if (species === 'tilki') { hpoly([[-0.02, 0.28], [0.1, 0.78], [0.3, 0.3]], body); hpoly([[0.06, 0.4], [0.1, 0.66], [0.2, 0.42]], inner); }
  if (species === 'kedi') { hpoly([[0.0, 0.26], [0.1, 0.7], [0.3, 0.28]], body); hpoly([[0.07, 0.36], [0.1, 0.6], [0.2, 0.37]], inner); for (let k = -1; k <= 1; k++) { g.fillStyle = dark; g.fillRect(hX(-0.04 + k * 0.1), hY(0.36), 4, 11); } }
  if (species === 'tavsan') { hell(-0.06, 0.66, 0.1, 0.42, body, true, 0.18); hell(-0.05, 0.66, 0.05, 0.32, inner, false, 0.18); }
  if (species === 'panda') { hell(0.0, 0.34, 0.14, 0.14, dark); hell(0.3, 0.02, 0.1, 0.09, dark, false, 0.5); }
  // gözler: arkadaki küçük, öndeki büyük (3/4 görünüm)
  const eye = (cx, cy, r, front) => {
    const ry = r * 1.1 * eyeY;
    hell(cx, cy, r * 0.85, ry, '#ffffff'); g.fillStyle = '#111827'; g.beginPath(); g.ellipse(hX(cx + r * 0.3), hY(cy - 0.01), r * 0.5 * PPU, Math.max(1.5, ry * 0.62 * PPU), 0, 0, Math.PI * 2); g.fill();
    if (front && eyeY > 0.5) { g.fillStyle = '#fff'; g.beginPath(); g.arc(hX(cx + r * 0.42), hY(cy + r * 0.3), r * 0.2 * PPU, 0, 7); g.fill(); }
  };
  if (species === 'kurbaga') { hell(0.06, 0.34, 0.15, 0.14, body); hell(0.2, 0.36, 0.17, 0.16, body); eye(0.02, 0.38, 0.1, false); eye(0.21, 0.4, 0.13, true); }
  else { eye(0.12, 0.1, 0.1, false); eye(0.29, 0.08, 0.14, true); }
  // burun-ağız bölgesi (ön)
  if (species === 'tilki') { hpoly([[0.3, 0.0], [0.72, -0.12], [0.3, -0.26]], light); hell(0.74, -0.12, 0.06, 0.05, dark); hell(0.24, -0.14, 0.09, 0.08, light, false); }
  else if (species === 'tavsan') { hell(0.4, -0.1, 0.18, 0.14, light); hell(0.55, -0.04, 0.05, 0.04, inner); g.fillStyle = '#fff'; g.fillRect(hX(0.44), hY(-0.17), 9, 12); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(hX(0.44), hY(-0.17), 9, 12); }
  else if (species === 'kedi') { hell(0.38, -0.1, 0.16, 0.12, light); hell(0.52, -0.04, 0.045, 0.035, inner); g.strokeStyle = dark; g.lineWidth = 1.8; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(hX(0.46), hY(-0.08 + k * 0.04 - 0.02)); g.lineTo(hX(0.78), hY(-0.12 + k * 0.1)); g.stroke(); } }
  else if (species === 'panda') { hell(0.4, -0.1, 0.16, 0.13, light); hell(0.53, -0.04, 0.06, 0.045, dark); }
  else if (species === 'kurbaga') { /* geniş ağız aşağıda */ }
  else if (species === 'penguen') { hell(0.14, -0.02, 0.3, 0.3, light, false); hpoly([[0.38, 0.0], [0.7, -0.08], [0.38, -0.2]], inner); }
  // ağız (gülümseme / açık)
  g.strokeStyle = OUT; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath();
  if (species === 'kurbaga') { g.moveTo(hX(0.12), hY(-0.12)); g.quadraticCurveTo(hX(0.38), hY(-0.28 - mouthOpen * 0.1), hX(0.64), hY(-0.12)); }
  else if (mouthOpen > 0.3) { g.ellipse(hX(0.4), hY(-0.22), 0.07 * PPU, 0.05 * mouthOpen * PPU + 2, 0, 0, Math.PI * 2); g.fillStyle = '#7f1d1d'; g.fill(); }
  else { g.moveTo(hX(0.28), hY(-0.2)); g.quadraticCurveTo(hX(0.4), hY(-0.28), hX(0.5), hY(-0.17)); }
  g.stroke();
  // yanak
  hell(0.22, -0.08, 0.06, 0.04, S.cheek, false);
  // ---- aksesuarlar ----
  if (hat === 'kasket') { g.save(); hell(0.0, 0.2, 0.43, 0.3, '#ef4444'); g.restore(); hpoly([[0.1, 0.22], [0.62, 0.2], [0.55, 0.12], [0.1, 0.13]], '#b91c1c'); hell(0.0, 0.5, 0.05, 0.04, '#fde047', false); }
  else if (hat === 'gozluk') { g.lineWidth = 4; hell(0.29, 0.08, 0.17, 0.15, 'rgba(14,165,233,.85)'); hell(0.1, 0.1, 0.13, 0.12, 'rgba(14,165,233,.75)'); g.strokeStyle = '#111827'; g.beginPath(); g.moveTo(hX(0.13), hY(0.1)); g.lineTo(hX(0.16), hY(0.1)); g.moveTo(hX(-0.03), hY(0.1)); g.lineTo(hX(-0.3), hY(0.14)); g.stroke(); }
  else if (hat === 'fiyonk') { hpoly([[0.1, -0.32], [-0.08, -0.22], [-0.08, -0.42]], '#ec4899'); hpoly([[0.1, -0.32], [0.28, -0.22], [0.28, -0.42]], '#ec4899'); hell(0.1, -0.32, 0.06, 0.06, '#be185d'); }
  else if (hat === 'tac') { hpoly([[-0.22, 0.36], [-0.22, 0.62], [-0.11, 0.5], [0.0, 0.7], [0.11, 0.5], [0.22, 0.62], [0.22, 0.36]], '#fbbf24'); hell(0, 0.5, 0.045, 0.045, '#ef4444', false); hell(-0.14, 0.44, 0.03, 0.03, '#3b82f6', false); hell(0.14, 0.44, 0.03, 0.03, '#22c55e', false); }
  g.restore();

  // ön kol
  cap(0.1, hy + 0.2, armA, 0.3, species === 'penguen' ? 0.12 : 0.15, armC, species === 'tilki' ? dark : light);
  g.restore();

  // ---- efektler (gövde dönüşünden bağımsız) ----
  if (pose.shield) {
    const a = pose.shield < 1.2 ? (Math.sin(t * 30) > 0 ? 0.45 : 0.15) : 0.3 + Math.sin(t * 6) * 0.03;
    g.beginPath(); g.ellipse(X(0), Y(0.7), 0.95 * PPU, 0.98 * PPU, 0, 0, Math.PI * 2); g.fillStyle = `rgba(125,211,252,${a})`; g.fill(); g.lineWidth = 3; g.strokeStyle = `rgba(255,255,255,${a + 0.3})`; g.stroke();
    g.beginPath(); g.ellipse(X(-0.3), Y(1.1), 0.18 * PPU, 0.1 * PPU, -0.6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
  }
  if (pose.stun > 0) { for (let k = 0; k < 3; k++) { const a = t * 5 + (k / 3) * Math.PI * 2; const x = 0.2 + Math.cos(a) * 0.38, y = 2.0 + Math.sin(a) * 0.1; g.save(); g.translate(X(x), Y(y)); g.rotate(t * 6); g.fillStyle = '#fde047'; g.strokeStyle = OUT; g.lineWidth = 2.5; g.beginPath(); for (let p = 0; p < 10; p++) { const rr = p % 2 ? 4 : 10; g.lineTo(Math.cos((p / 10) * Math.PI * 2) * rr, Math.sin((p / 10) * Math.PI * 2) * rr); } g.closePath(); g.fill(); g.stroke(); g.restore(); } }
  if (pose.zap) { g.strokeStyle = Math.sin(t * 40) > 0 ? '#fde047' : '#ffffff'; g.lineWidth = 4; g.lineCap = 'round'; for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + t * 9, r0 = 0.5, r1 = 0.85; g.beginPath(); g.moveTo(X(0.1 + Math.cos(a) * r0), Y(0.8 + Math.sin(a) * r0)); g.lineTo(X(0.1 + Math.cos(a + 0.2) * (r0 + r1) / 2), Y(0.8 + Math.sin(a + 0.2) * (r0 + r1) / 2 + 0.04)); g.lineTo(X(0.1 + Math.cos(a) * r1), Y(0.8 + Math.sin(a) * r1)); g.stroke(); } }
}

// Üç boyutlu sahnede düz levha olarak durur. Ayaklar root'un y=0 noktasındadır.
export function createSpriteAnimal(THREE, { species = 'tilki', color = null, hat = 'yok' } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.03 });
  const geo = new THREE.PlaneGeometry(SIZE / PPU, SIZE / PPU);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = (FY0 - SIZE / 2) / PPU; // ayaklar root.y=0'a gelsin
  const root = new THREE.Group(); root.add(mesh);
  const st = { phase: Math.random() * 6 }; let blink = 2 + Math.random() * 3;
  let colHex = color;
  function update(pose, t, dt) {
    st.phase += dt * (3 + pose.sp * 1.45) * (pose.grounded ? 1 : 0.2);
    blink -= dt; const blinkNow = blink < 0.1 && blink > 0; if (blink < 0) blink = 2.5 + Math.random() * 3;
    root.visible = !(pose.inv > 0 && pose.fallT == null && Math.sin(t * 40) < -0.3);
    drawAnimal(g, species, colHex, hat, { ...pose, blink: blinkNow }, t, st);
    tex.needsUpdate = true;
  }
  function dispose() { tex.dispose(); mat.dispose(); geo.dispose(); }
  return { root, update, dispose, mesh };
}
export const ANIMAL_LOOKS = SPECIES;
