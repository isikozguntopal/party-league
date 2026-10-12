// 3D blok karakter (Roblox tarzı). Yerel eksenler: +x ileri (yüz), +y yukarı, +z sağ.
// Yükseklik ~1.25 birim; oyunlar group.scale ile boyutlandırır.
// animateAvatar: yürüme/nefes + küçük "emote"lar (el sallama, kafa kaşıma, şaşırma, sevinme, zıplama, dans).
import { lookColors } from '../games/avatar.js';

const matCache = new Map();
function mat(THREE, color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function box(THREE, w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(THREE, color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const darker = (hex, k = 0.75) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
};

// Sapan: Y biçimli çatal + lastik; sağ el tutar, +x ileri bakar
function buildSling(THREE) {
  const g = new THREE.Group();
  box(THREE, 0.16, 0.05, 0.05, '#8b5a2b', 0.06, 0, 0, g);                      // sap
  const f1 = box(THREE, 0.16, 0.04, 0.04, '#8b5a2b', 0.2, 0, -0.07, g); f1.rotation.y = 0.5;
  const f2 = box(THREE, 0.16, 0.04, 0.04, '#8b5a2b', 0.2, 0, 0.07, g); f2.rotation.y = -0.5;
  box(THREE, 0.012, 0.012, 0.26, '#d9b36a', 0.2, 0, 0, g);                      // lastik
  box(THREE, 0.05, 0.05, 0.05, '#6b7280', 0.17, 0, 0, g);                       // taş
  return g;
}

export function buildAvatar(THREE, look, color, { gun = true } = {}) {
  const L = lookColors(look);
  const kadin = L.gender === 'kadin';
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = L.outfit === 'takim' ? '#1f2937' : L.outfit === 'ceket' ? '#2b2b2b' : L.shirt;

  // Bacaklar (kalçadan döner)
  const legs = [];
  for (const z of [-0.11, 0.11]) {
    const hip = new THREE.Group();
    hip.position.set(0, 0.42, z);
    box(THREE, 0.2, 0.42, 0.18, L.outfit === 'elbise' ? L.skin : L.pants, 0, -0.21, 0, hip);
    box(THREE, 0.24, 0.07, 0.19, L.shoes, 0.02, -0.39, 0, hip); // ayakkabı
    body.add(hip);
    legs.push(hip);
  }
  if (L.outfit === 'elbise') { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.3, 10), mat(THREE, L.shirt)); sk.position.set(0, 0.32, 0); body.add(sk); }
  // Gövde
  const tw = kadin ? 0.22 : 0.24, td = kadin ? 0.42 : 0.46;
  box(THREE, tw, 0.42, td, shirt, 0, 0.63, 0, body);
  if (L.outfit === 'takim') { box(THREE, 0.02, 0.36, 0.12, '#f8fafc', tw / 2 + 0.005, 0.64, 0, body); box(THREE, 0.02, 0.3, 0.05, L.shirt, tw / 2 + 0.02, 0.62, 0, body); }
  if (L.outfit === 'forma') box(THREE, tw + 0.01, 0.08, td + 0.01, L.shirt2, 0, 0.66, 0, body);
  if (L.outfit === 'kapusonlu') { box(THREE, 0.14, 0.2, 0.36, darker(L.shirt), -0.14, 0.86, 0, body); box(THREE, 0.02, 0.12, 0.2, L.shirt2, tw / 2 + 0.005, 0.55, 0, body); }
  if (L.outfit === 'elbise') box(THREE, tw + 0.01, 0.05, td + 0.01, L.shirt2, 0, 0.5, 0, body);
  if (L.outfit === 'ceket') { box(THREE, 0.02, 0.38, 0.03, '#9ca3af', tw / 2 + 0.005, 0.63, 0, body); box(THREE, 0.02, 0.1, 0.16, L.shirt, tw / 2 + 0.006, 0.78, 0, body); }
  if (L.outfit === 'yelek') box(THREE, 0.02, 0.4, 0.26, L.shirt2, tw / 2 + 0.005, 0.63, 0, body);
  // Kimlik rengi: bel kemeri
  box(THREE, tw + 0.01, 0.05, td + 0.01, color, 0, 0.44, 0, body);
  // Aksesuar (gövde)
  if (L.acc === 'fular') box(THREE, 0.28, 0.08, 0.3, L.accColor, 0.02, 0.86, 0, body);
  if (L.acc === 'papyon') { box(THREE, 0.03, 0.06, 0.08, L.accColor, tw / 2 + 0.01, 0.82, -0.06, body); box(THREE, 0.03, 0.06, 0.08, L.accColor, tw / 2 + 0.01, 0.82, 0.06, body); }
  if (L.acc === 'kolye') box(THREE, 0.03, 0.05, 0.05, L.accColor, tw / 2 + 0.01, 0.76, 0, body);
  if (L.acc === 'madalya') { box(THREE, 0.03, 0.06, 0.06, '#facc15', tw / 2 + 0.01, 0.66, 0, body); box(THREE, 0.02, 0.2, 0.03, '#ef4444', tw / 2 + 0.005, 0.76, 0, body); }
  if (L.acc === 'pelerin') { const c = box(THREE, 0.03, 0.62, 0.4, L.accColor, -tw / 2 - 0.02, 0.56, 0, body); c.rotation.z = 0.12; }
  if (L.acc === 'kanat') for (const z of [-0.3, 0.3]) { const w = box(THREE, 0.04, 0.3, 0.36, L.accColor, -tw / 2 - 0.03, 0.78, z, body); w.rotation.x = z < 0 ? 0.5 : -0.5; }

  // Kollar (omuzdan döner). Sağ kol sapanı ileri tutar.
  const arms = [];
  for (const z of [-0.31, 0.31]) {
    const sh = new THREE.Group();
    sh.position.set(0, 0.82, z * (kadin ? 0.95 : 1));
    box(THREE, 0.16, 0.24, 0.14, L.outfit === 'elbise' || L.outfit === 'yelek' ? L.skin : shirt, 0, -0.1, 0, sh);
    box(THREE, 0.15, 0.16, 0.13, L.skin, 0, -0.3, 0, sh);
    body.add(sh);
    arms.push(sh);
  }
  let gunMesh = null;
  if (gun) {
    arms[1].rotation.z = Math.PI / 2 - 0.08; // sağ kol ileri (kolun -y ekseni dünyada +x olur)
    gunMesh = buildSling(THREE);
    gunMesh.position.set(0, -0.38, 0);
    gunMesh.rotation.z = -Math.PI / 2;   // çatal kol boyunca ileri
    arms[1].add(gunMesh);
  }

  // Kafa
  const head = new THREE.Group();
  head.position.set(0, 1.03, 0);
  body.add(head);
  box(THREE, 0.36, 0.36, 0.36, L.skin, 0, 0, 0, head);
  for (const z of [-0.08, 0.08]) {
    box(THREE, 0.02, 0.08, 0.07, '#ffffff', 0.181, 0.03, z, head);
    box(THREE, 0.02, 0.05, 0.04, L.eyes, 0.19, 0.025, z, head);
    if (kadin) box(THREE, 0.02, 0.015, 0.09, '#1f1410', 0.185, 0.075, z, head); // kirpik
    else box(THREE, 0.02, 0.02, 0.08, darker(L.hair, 0.8), 0.185, 0.09, z, head); // kaş
  }
  box(THREE, 0.02, 0.025, 0.12, kadin ? '#c0395b' : '#5a2e1e', 0.182, -0.09, 0, head); // ağız
  if (L.acc === 'kupe') for (const z of [-0.19, 0.19]) box(THREE, 0.04, 0.05, 0.02, L.accColor, 0.02, -0.06, z, head);
  // Sakal
  const H = L.hair;
  if (L.beard === 'biyik' || L.beard === 'sakal') box(THREE, 0.02, 0.03, 0.16, H, 0.185, -0.05, 0, head);
  if (L.beard === 'keci') box(THREE, 0.03, 0.08, 0.08, H, 0.17, -0.19, 0, head);
  if (L.beard === 'sakal') { box(THREE, 0.03, 0.1, 0.34, H, 0.17, -0.16, 0, head); for (const z of [-0.18, 0.18]) box(THREE, 0.36, 0.14, 0.02, H, -0.02, -0.12, z, head); }
  if (L.beard === 'kirli') box(THREE, 0.025, 0.1, 0.3, darker(L.skin, 0.8), 0.175, -0.13, 0, head);
  // Saç
  switch (L.style) {
    case 'kel': break;
    case 'mohikan': box(THREE, 0.32, 0.16, 0.08, H, -0.02, 0.24, 0, head); break;
    case 'uzun': case 'dalgali':
      box(THREE, 0.38, 0.09, 0.38, H, -0.01, 0.2, 0, head);
      box(THREE, 0.1, 0.5, 0.4, H, -0.17, -0.06, 0, head);
      for (const z of [-0.19, 0.19]) box(THREE, 0.22, 0.34, 0.03, H, -0.06, 0.02, z, head);
      if (L.style === 'dalgali') for (const z of [-0.2, 0.2]) box(THREE, 0.12, 0.1, 0.05, H, 0.02, -0.18, z, head);
      break;
    case 'kakul':
      box(THREE, 0.38, 0.12, 0.38, H, -0.01, 0.19, 0, head);
      box(THREE, 0.1, 0.3, 0.4, H, -0.17, 0.02, 0, head);
      for (const z of [-0.19, 0.19]) box(THREE, 0.24, 0.26, 0.03, H, -0.05, 0.06, z, head);
      break;
    case 'topuz':
      box(THREE, 0.38, 0.09, 0.38, H, -0.01, 0.2, 0, head);
      box(THREE, 0.08, 0.2, 0.38, H, -0.16, 0.08, 0, head);
      box(THREE, 0.14, 0.14, 0.14, H, -0.1, 0.3, 0, head);
      break;
    case 'orgu':
      box(THREE, 0.38, 0.09, 0.38, H, -0.01, 0.2, 0, head);
      box(THREE, 0.08, 0.2, 0.38, H, -0.16, 0.08, 0, head);
      for (const z of [-0.2, 0.2]) { box(THREE, 0.08, 0.36, 0.07, H, -0.05, -0.1, z, head); box(THREE, 0.09, 0.03, 0.08, L.accColor, -0.05, -0.2, z, head); }
      break;
    case 'kivircik':
      for (let i = 0; i < 9; i++) box(THREE, 0.13, 0.13, 0.13, H, -0.12 + (i % 3) * 0.12, 0.21 + (i % 2) * 0.03, -0.12 + Math.floor(i / 3) * 0.12, head);
      break;
    case 'atkuyrugu':
      box(THREE, 0.38, 0.09, 0.38, H, -0.01, 0.2, 0, head);
      box(THREE, 0.08, 0.2, 0.38, H, -0.16, 0.08, 0, head);
      box(THREE, 0.1, 0.26, 0.1, H, -0.24, -0.02, 0, head);
      break;
    default:
      box(THREE, 0.38, 0.09, 0.38, H, -0.01, 0.2, 0, head);
      box(THREE, 0.08, 0.22, 0.38, H, -0.16, 0.06, 0, head);
  }
  // Gözlük
  switch (L.glasses) {
    case 'gozluk': case 'gunes': case 'yuzucu': {
      const gc = L.glasses === 'gunes' ? '#0b0b0b' : L.glasses === 'yuzucu' ? '#7dd3fc' : '#9ad1ff';
      for (const z of [-0.08, 0.08]) box(THREE, 0.02, 0.09, 0.11, gc, 0.195, 0.03, z, head);
      box(THREE, 0.02, 0.02, 0.06, L.glasses === 'yuzucu' ? L.accColor : '#111111', 0.195, 0.05, 0, head);
      break;
    }
    case 'monokl': box(THREE, 0.02, 0.1, 0.1, '#d4af37', 0.195, 0.03, 0.08, head); break;
    case 'maske': box(THREE, 0.02, 0.12, 0.34, L.accColor, 0.19, 0.03, 0, head); for (const z of [-0.08, 0.08]) box(THREE, 0.02, 0.06, 0.06, '#ffffff', 0.2, 0.03, z, head); break;
    case 'kalp': for (const z of [-0.08, 0.08]) box(THREE, 0.02, 0.1, 0.1, '#ec4899', 0.195, 0.03, z, head); break;
  }
  // Şapka
  const HC = L.hatColor;
  switch (L.hat) {
    case 'kep': box(THREE, 0.4, 0.12, 0.4, HC, -0.01, 0.24, 0, head); box(THREE, 0.2, 0.03, 0.34, darker(HC), 0.27, 0.19, 0, head); break;
    case 'bere': box(THREE, 0.4, 0.16, 0.4, HC, 0, 0.25, 0, head); box(THREE, 0.1, 0.1, 0.1, '#ffffff', 0, 0.37, 0, head); break;
    case 'kask': box(THREE, 0.42, 0.24, 0.42, '#e5e7eb', -0.01, 0.15, 0, head); box(THREE, 0.43, 0.05, 0.43, HC, -0.01, 0.12, 0, head); break;
    case 'tac':
      box(THREE, 0.34, 0.07, 0.34, '#facc15', 0, 0.22, 0, head);
      for (const [x, z] of [[0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15], [0.11, 0.11], [-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11]]) box(THREE, 0.05, 0.1, 0.05, '#facc15', x, 0.3, z, head);
      box(THREE, 0.04, 0.04, 0.04, HC, 0.17, 0.26, 0, head);
      break;
    case 'parti': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), mat(THREE, HC));
      cone.position.set(0, 0.34, 0); head.add(cone);
      box(THREE, 0.06, 0.06, 0.06, '#facc15', 0, 0.51, 0, head);
      break;
    }
    case 'fes': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 12), mat(THREE, HC)); c.position.set(0, 0.28, 0); head.add(c); box(THREE, 0.02, 0.14, 0.02, '#111111', 0.1, 0.3, 0.08, head); break; }
    case 'kovboy': box(THREE, 0.6, 0.03, 0.56, darker(HC, 0.8), 0, 0.2, 0, head); box(THREE, 0.3, 0.18, 0.3, HC, 0, 0.3, 0, head); break;
    case 'silindir': box(THREE, 0.46, 0.03, 0.46, darker(HC, 0.8), 0, 0.2, 0, head); box(THREE, 0.32, 0.32, 0.32, HC, 0, 0.37, 0, head); box(THREE, 0.33, 0.05, 0.33, L.accColor, 0, 0.25, 0, head); break;
    case 'korsan': box(THREE, 0.5, 0.06, 0.44, HC, 0, 0.21, 0, head); box(THREE, 0.3, 0.14, 0.3, HC, 0, 0.3, 0, head); box(THREE, 0.02, 0.06, 0.06, '#ffffff', 0.16, 0.3, 0, head); break;
    case 'bandana': box(THREE, 0.39, 0.08, 0.39, HC, 0, 0.14, 0, head); box(THREE, 0.1, 0.05, 0.12, HC, -0.22, 0.1, 0.05, head); break;
    case 'kulaklik': { const b = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 16, Math.PI), mat(THREE, HC)); b.rotation.y = Math.PI / 2; b.position.set(0, 0.03, 0); head.add(b); for (const z of [-0.2, 0.2]) box(THREE, 0.12, 0.14, 0.05, HC, 0, -0.02, z, head); break; }
    case 'cicek': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(THREE, 0.06, 0.05, 0.06, ['#f472b6', '#facc15', '#fb923c', '#60a5fa'][i % 4], Math.cos(a) * 0.19, 0.21, Math.sin(a) * 0.19, head); } break;
  }
  const av = { root, body, head, arms, legs, gun: gunMesh, emote: null, nextIdle: 3 + Math.random() * 8, seed: Math.random() };
  return av;
}

// ---------- Canlandırma ----------
export const EMOTES = ['wave', 'scratch', 'surprise', 'cheer', 'jump', 'dance', 'think', 'bow'];
const EMOTE_DUR = { wave: 1.8, scratch: 1.8, surprise: 1.4, cheer: 1.6, jump: 1.2, dance: 2.4, think: 1.8, bow: 1.4 };
export function startEmote(av, kind, t) { av.emote = { kind, t0: t }; }

// Hafif canlılık: nefes alma / yürüme salınımı + emote. idle: boş dururken ara sıra kendiliğinden emote yapar.
export function animateAvatar(av, t, { walk = 0, idle = true } = {}) {
  const sw = Math.sin(t * 9) * 0.6 * walk;
  const gunArm = !!av.gun;
  av.legs[0].rotation.z = sw; av.legs[1].rotation.z = -sw;
  av.arms[0].rotation.z = -sw * 0.8; av.arms[0].rotation.x = 0;
  if (!gunArm) { av.arms[1].rotation.z = sw * 0.8; av.arms[1].rotation.x = 0; }
  av.body.position.y = Math.sin(t * 2.2) * 0.008 + Math.abs(sw) * 0.02;
  av.body.rotation.z = 0; av.body.rotation.x = 0;
  av.head.rotation.set(0, 0, 0);
  if (idle && !av.emote && walk < 0.05) {
    if (av.lastT !== undefined && t > av.lastT) av.nextIdle -= t - av.lastT;
    if (av.nextIdle <= 0) { av.emote = { kind: EMOTES[Math.floor(Math.random() * EMOTES.length)], t0: t }; av.nextIdle = 6 + Math.random() * 10; }
  }
  av.lastT = t;
  if (!av.emote) return;
  const e = av.emote, k = (t - e.t0) / EMOTE_DUR[e.kind];
  if (k < 0 || k >= 1 || walk > 0.3) { av.emote = null; return; }
  const env = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI / 2); // yumuşak giriş/çıkış
  const L = av.arms[0], R = av.arms[1];
  switch (e.kind) {
    case 'wave': L.rotation.x = -Math.PI * 0.95 * env; L.rotation.z = Math.sin(t * 14) * 0.5 * env; av.head.rotation.x = -0.1 * env; break;
    case 'scratch': L.rotation.x = -Math.PI * 1.1 * env; L.rotation.z = 0.5 * env + Math.sin(t * 16) * 0.12 * env; av.head.rotation.z = 0.18 * env; break;
    case 'surprise': L.rotation.x = -0.9 * env; L.rotation.z = 0.5 * env; if (!gunArm) { R.rotation.x = -0.9 * env; R.rotation.z = -0.5 * env; } av.head.rotation.x = -0.35 * env; av.body.position.y += 0.03 * env; break;
    case 'cheer': { const b = Math.abs(Math.sin(t * 10)); L.rotation.x = -Math.PI * env; L.rotation.z = 0.3 * env; if (!gunArm) { R.rotation.x = -Math.PI * env; R.rotation.z = -0.3 * env; } av.body.position.y += b * 0.06 * env; break; }
    case 'jump': { const h = Math.sin(k * Math.PI); av.body.position.y += h * h * 0.35; L.rotation.x = -2.6 * env; if (!gunArm) R.rotation.x = -2.6 * env; av.legs[0].rotation.z = 0.5 * h; av.legs[1].rotation.z = -0.5 * h; break; }
    case 'dance': { const s = Math.sin(t * 8); av.body.rotation.z = s * 0.12 * env; av.body.position.y += Math.abs(s) * 0.04 * env; L.rotation.x = (-1.2 - s * 0.8) * env; if (!gunArm) R.rotation.x = (-1.2 + s * 0.8) * env; av.head.rotation.z = -s * 0.15 * env; break; }
    case 'think': L.rotation.x = -1.4 * env; L.rotation.z = 0.9 * env; av.head.rotation.z = -0.15 * env; av.head.rotation.y = 0.2 * env; break;
    case 'bow': av.body.rotation.z = -0.55 * env; L.rotation.x = 0.3 * env; av.head.rotation.x = 0.2 * env; break;
  }
}

// İsim etiketi (kameraya bakan sprite)
export function makeLabel(THREE, text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, -apple-system, sans-serif';
  const w = Math.min(250, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(8,12,26,.75)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 24); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc((256 - w) / 2 + 20, 32, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.4, 0.1, 1);
  s.renderOrder = 10;
  return s;
}

let threePromise = null;
export const loadThree = () => (threePromise = threePromise || import('../vendor/three.min.js'));
