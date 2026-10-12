// 2D karakter çizimi: üstten (oyun içi) ve önden portre (lobi, podyum, özelleştirme kartı)
// Portreler "canlı": ifade kareleri (göz kırpma, şaşırma, el sallama, kafa kaşıma, sevinme, zıplama)
// ve bunları sayfadaki tüm portre resimlerinde/tuvallerinde rastgele oynatan bir zamanlayıcı.
import { lookColors } from '../games/avatar.js';

const cache = new WeakMap();
const colorsOf = (look) => {
  if (!look) return lookColors(null);
  let c = cache.get(look);
  if (!c) { c = lookColors(look); cache.set(look, c); }
  return c;
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const isDark = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 110; };

// Sapan (üstten): sap +x yönünde, iki çatal ucu ve lastik
function drawSlingTop(ctx, r) {
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r * 0.3, r * 0.2); ctx.lineTo(r * 1.0, r * 0.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * 1.0, r * 0.2); ctx.lineTo(r * 1.55, -r * 0.18); ctx.moveTo(r * 1.0, r * 0.2); ctx.lineTo(r * 1.55, r * 0.58); ctx.stroke();
  ctx.strokeStyle = '#d9b36a'; ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath(); ctx.moveTo(r * 1.55, -r * 0.18); ctx.lineTo(r * 1.15, r * 0.2); ctx.lineTo(r * 1.55, r * 0.58); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.arc(r * 1.15, r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
}

// Üstten görünüş. (sx,sy) ekran merkezi, r gövde yarıçapı (px), a bakış açısı (radyan).
// Oyuncunun kimlik rengi (color) çevresinde ince bir halka olarak görünür. gun: sapan tutar.
export function drawTopAvatar(ctx, look, color, sx, sy, r, a, { alpha = 1, spin = 0, gun = true, ring = true } = {}) {
  const L = colorsOf(look);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(sx, sy);
  ctx.rotate(a + spin);
  if (L.acc === 'pelerin') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.9); ctx.lineTo(-r * 1.4, -r * 1.1); ctx.lineTo(-r * 1.5, r * 1.1); ctx.lineTo(-r * 0.3, r * 0.9); ctx.fill(); }
  if (L.acc === 'kanat') { ctx.fillStyle = L.accColor; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-r * 0.6, s * r * 1.1, r * 0.9, r * 0.45, s * 0.5, 0, Math.PI * 2); ctx.fill(); } }
  if (gun) drawSlingTop(ctx, r);
  // omuzlar / kıyafet
  const top = L.outfit === 'takim' ? '#1f2937' : L.outfit === 'ceket' ? '#2b2b2b' : L.shirt;
  ctx.fillStyle = top;
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.roundRect(-r * 0.75, -r * 0.95, r * 1.25, r * 1.9, r * 0.38); ctx.fill(); ctx.stroke();
  if (L.outfit === 'takim' || L.outfit === 'yelek') { ctx.fillStyle = L.outfit === 'takim' ? L.shirt : L.shirt2; ctx.fillRect(r * 0.1, -r * 0.18, r * 0.4, r * 0.36); }
  if (L.outfit === 'forma') { ctx.fillStyle = L.shirt2; ctx.fillRect(-r * 0.75, -r * 0.12, r * 1.25, r * 0.24); }
  if (L.outfit === 'kapusonlu') { ctx.fillStyle = shade(L.shirt, 0.75); ctx.beginPath(); ctx.arc(-r * 0.35, 0, r * 0.55, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); }
  if (L.outfit === 'elbise') { ctx.fillStyle = L.shirt2; ctx.fillRect(-r * 0.75, -r * 0.3, r * 0.3, r * 0.6); }
  if (L.acc === 'fular') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.4, 0, Math.PI * 2); ctx.fill(); }
  if (ring) { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.beginPath(); ctx.roundRect(-r * 0.75, -r * 0.95, r * 1.25, r * 1.9, r * 0.38); ctx.stroke(); }
  // kafa
  ctx.fillStyle = L.skin; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // saç (yüz +x tarafında, saç arkada)
  ctx.fillStyle = L.hair;
  const hr = r * 0.52;
  switch (L.style) {
    case 'kel': break;
    case 'mohikan': ctx.fillRect(-hr, -hr * 0.22, hr * 1.5, hr * 0.44); break;
    case 'uzun': case 'dalgali':
      ctx.beginPath(); ctx.arc(0, 0, hr * 1.02, Math.PI * 0.4, Math.PI * 1.6); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-hr * 1.05, 0, hr * 0.55, hr * 0.85, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'kivircik':
      for (let i = 0; i < 7; i++) { const t = Math.PI * 0.55 + (i / 6) * Math.PI * 0.9; ctx.beginPath(); ctx.arc(Math.cos(t) * hr * 0.75, Math.sin(t) * hr * 0.75, hr * 0.38, 0, Math.PI * 2); ctx.fill(); } break;
    case 'atkuyrugu': case 'orgu':
      ctx.beginPath(); ctx.arc(0, 0, hr, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-hr * 1.35, 0, hr * 0.5, hr * 0.28, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'topuz':
      ctx.beginPath(); ctx.arc(0, 0, hr, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
      ctx.beginPath(); ctx.arc(-hr * 0.35, 0, hr * 0.42, 0, Math.PI * 2); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, hr, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
  }
  // şapka (üstten)
  const HC = L.hatColor;
  switch (L.hat) {
    case 'kep': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(-hr * 0.1, 0, hr * 0.95, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = shade(HC, 0.7); ctx.beginPath(); ctx.ellipse(hr * 0.85, 0, hr * 0.5, hr * 0.7, 0, -Math.PI / 2, Math.PI / 2); ctx.fill(); break;
    case 'bere': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 0.98, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-hr * 0.1, 0, hr * 0.3, 0, Math.PI * 2); ctx.fill(); break;
    case 'kask': ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.arc(0, 0, hr * 1.05, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = HC; ctx.fillRect(-hr * 1.05, -hr * 0.18, hr * 2.1, hr * 0.36); break;
    case 'tac': ctx.fillStyle = '#facc15'; for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(t) * hr * 0.7, Math.sin(t) * hr * 0.7, hr * 0.28, 0, Math.PI * 2); ctx.fill(); } break;
    case 'parti': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, hr * 0.22, 0, Math.PI * 2); ctx.fill(); break;
    case 'fes': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, hr * 0.12, 0, Math.PI * 2); ctx.fill(); break;
    case 'kovboy': ctx.fillStyle = shade(HC, 0.8); ctx.beginPath(); ctx.ellipse(0, 0, hr * 1.45, hr * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 0.7, 0, Math.PI * 2); ctx.fill(); break;
    case 'silindir': ctx.fillStyle = shade(HC, 0.8); ctx.beginPath(); ctx.arc(0, 0, hr * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 0.85, 0, Math.PI * 2); ctx.fill(); break;
    case 'korsan': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 1.0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hr * 0.3, 0, hr * 0.22, 0, Math.PI * 2); ctx.fill(); break;
    case 'bandana': ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(0, 0, hr * 1.0, Math.PI * 0.35, Math.PI * 1.65); ctx.fill(); break;
    case 'kulaklik': ctx.strokeStyle = HC; ctx.lineWidth = hr * 0.22; ctx.beginPath(); ctx.arc(0, 0, hr * 1.05, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.fillStyle = HC; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(0, s * hr * 1.0, hr * 0.3, 0, Math.PI * 2); ctx.fill(); } break;
    case 'cicek': for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; ctx.fillStyle = ['#f472b6', '#facc15', '#fb923c'][i % 3]; ctx.beginPath(); ctx.arc(Math.cos(t) * hr * 0.85, Math.sin(t) * hr * 0.85, hr * 0.22, 0, Math.PI * 2); ctx.fill(); } break;
  }
  // gözlük ucu (yüz tarafında)
  if (L.glasses !== 'yok') { ctx.fillStyle = L.glasses === 'gunes' || L.glasses === 'maske' ? '#111' : L.glasses === 'kalp' ? '#ec4899' : 'rgba(180,220,255,.9)'; ctx.fillRect(hr * 0.55, -hr * 0.55, hr * 0.28, hr * 1.1); }
  ctx.restore();
}

// ---------- Önden portre ----------
// Ifadeler: normal, blink, wink, happy, surprise, sad, laugh, wave, scratch, cheer, jump, think, dance
export const EXPRS = ['blink', 'wink', 'happy', 'surprise', 'laugh', 'wave', 'scratch', 'cheer', 'jump', 'think', 'dance', 'sad'];
const EXPR_DUR = { blink: 180, wink: 500, happy: 1400, surprise: 1300, laugh: 1300, wave: 1800, scratch: 1700, cheer: 1600, jump: 1200, think: 1800, dance: 1900, sad: 1400 };
const EXPR_W = { blink: 46, wink: 5, happy: 8, surprise: 5, laugh: 5, wave: 7, scratch: 5, cheer: 6, jump: 5, think: 4, dance: 3, sad: 1 };
export const FRAME_MS = 170;

function drawHand(ctx, L, x, y, rot = 0, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = L.skin; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-7, -7, 14, 14, 5); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(-7 + i * 3.6, -13, 3, 8, 1.5); ctx.fill(); }
  ctx.restore();
}

// Önden portre: kare alana (x,y,size) çizer. expr/frame ile ifade karesi.
export function drawPortrait(ctx, look, color, x, y, size, { bg = true, expr = 'normal', frame = 0 } = {}) {
  const L = colorsOf(look);
  const s = size / 100;
  const f = frame % 4, osc = f % 2 ? 1 : -1; // kareler arası salınım
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (bg) {
    ctx.fillStyle = color; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.roundRect(0, 0, 100, 100, 22); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.roundRect(0, 0, 100, 100, 22); ctx.clip();
  }
  const jump = expr === 'jump' ? (f === 1 || f === 2 ? -9 : -2) : expr === 'dance' ? -2 : 0;
  const tilt = expr === 'dance' ? osc * 0.08 : expr === 'surprise' ? -0.04 : 0;
  ctx.translate(50, 60 + jump); ctx.rotate(tilt); ctx.translate(-50, -60);
  const kadin = L.gender === 'kadin';
  // pelerin / kanat (arkada)
  if (L.acc === 'pelerin') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(22, 72); ctx.lineTo(8, 112); ctx.lineTo(92, 112); ctx.lineTo(78, 72); ctx.fill(); }
  if (L.acc === 'kanat') { ctx.fillStyle = L.accColor; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(50 + sx * 38, 78, 16, 9 + (expr === 'jump' ? 4 : 0), sx * 0.6, 0, Math.PI * 2); ctx.fill(); } }
  // gövde
  const top = L.outfit === 'takim' ? '#1f2937' : L.outfit === 'ceket' ? '#2b2b2b' : L.shirt;
  ctx.fillStyle = top;
  if (kadin && L.outfit !== 'takim') { ctx.beginPath(); ctx.moveTo(24, 110); ctx.lineTo(28, 70); ctx.lineTo(72, 70); ctx.lineTo(76, 110); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); ctx.roundRect(18, 70, 64, 40, 14); ctx.fill(); }
  if (L.outfit === 'takim') { ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(42, 70); ctx.lineTo(50, 92); ctx.lineTo(58, 70); ctx.fill(); ctx.fillStyle = L.shirt; ctx.fillRect(47, 74, 6, 18); }
  if (L.outfit === 'forma') { ctx.fillStyle = L.shirt2; ctx.fillRect(18, 84, 64, 7); ctx.fillStyle = isDark(L.shirt) ? '#fff' : '#111'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('10', 50, 82); }
  if (L.outfit === 'kapusonlu') { ctx.fillStyle = shade(L.shirt, 0.75); ctx.beginPath(); ctx.roundRect(24, 64, 52, 12, 6); ctx.fill(); ctx.strokeStyle = L.shirt2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(44, 74); ctx.lineTo(43, 92); ctx.moveTo(56, 74); ctx.lineTo(57, 92); ctx.stroke(); }
  if (L.outfit === 'elbise') { ctx.fillStyle = L.shirt2; ctx.fillRect(22, 84, 56, 6); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(32 + i * 12, 100, 3, 0, Math.PI * 2); ctx.fill(); } }
  if (L.outfit === 'ceket') { ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.moveTo(40, 70); ctx.lineTo(50, 86); ctx.lineTo(60, 70); ctx.fill(); ctx.fillStyle = '#9ca3af'; ctx.fillRect(49, 76, 2, 30); }
  if (L.outfit === 'yelek') { ctx.fillStyle = L.shirt2; ctx.beginPath(); ctx.roundRect(34, 70, 32, 40, 6); ctx.fill(); ctx.fillStyle = L.shirt; ctx.fillRect(49, 72, 2, 36); }
  if (L.acc === 'fular') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.roundRect(30, 66, 40, 11, 5); ctx.fill(); ctx.beginPath(); ctx.roundRect(56, 72, 10, 22, 4); ctx.fill(); }
  if (L.acc === 'papyon') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(50, 73); ctx.lineTo(38, 67); ctx.lineTo(38, 79); ctx.closePath(); ctx.moveTo(50, 73); ctx.lineTo(62, 67); ctx.lineTo(62, 79); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(50, 73, 3, 0, Math.PI * 2); ctx.fill(); }
  if (L.acc === 'kolye') { ctx.strokeStyle = L.accColor; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(50, 66, 12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.arc(50, 80, 3.5, 0, Math.PI * 2); ctx.fill(); }
  if (L.acc === 'madalya') { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 70); ctx.lineTo(50, 86); ctx.lineTo(60, 70); ctx.stroke(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(50, 90, 6, 0, Math.PI * 2); ctx.fill(); }
  // eller (ifadeye göre)
  if (expr === 'wave') drawHand(ctx, L, 90, 44 + osc * 4, 0.35 + osc * 0.25, 1.05);
  if (expr === 'cheer' || expr === 'jump') { drawHand(ctx, L, 12, 30 + osc * 3, -0.3); drawHand(ctx, L, 88, 30 - osc * 3, 0.3); }
  if (expr === 'dance') { drawHand(ctx, L, osc > 0 ? 12 : 16, osc > 0 ? 34 : 70, -0.4); drawHand(ctx, L, osc > 0 ? 84 : 88, osc > 0 ? 70 : 34, 0.4); }
  if (expr === 'surprise') { drawHand(ctx, L, 22, 60, -0.9, 0.95); drawHand(ctx, L, 78, 60, 0.9, 0.95); }
  // saç arka (uzun / at kuyruğu / örgü / dalgalı)
  ctx.fillStyle = L.hair;
  if (L.style === 'uzun') { ctx.beginPath(); ctx.roundRect(22, 22, 56, 58, 18); ctx.fill(); }
  if (L.style === 'dalgali') { ctx.beginPath(); ctx.roundRect(20, 22, 60, 60, 18); ctx.fill(); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(24 + (i % 2) * 52, 50 + i * 9, 7, 0, Math.PI * 2); ctx.fill(); } }
  if (L.style === 'atkuyrugu') { ctx.beginPath(); ctx.ellipse(78, 46 + (expr === 'jump' ? 4 : 0), 8, 16, 0.3, 0, Math.PI * 2); ctx.fill(); }
  if (L.style === 'orgu') { for (const sx of [24, 76]) { ctx.beginPath(); ctx.roundRect(sx - 5, 40, 10, 40, 5); ctx.fill(); ctx.fillStyle = L.accColor; ctx.fillRect(sx - 5, 74, 10, 3); ctx.fillStyle = L.hair; } }
  if (L.style === 'kakul') { ctx.beginPath(); ctx.roundRect(23, 22, 54, 44, 16); ctx.fill(); }
  // kafa (Roblox tarzı yuvarlatılmış kare)
  ctx.fillStyle = L.skin; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(27, 24, 46, 46, kadin ? 17 : 13); ctx.fill(); ctx.stroke();
  if (L.acc === 'kupe') { ctx.fillStyle = L.accColor; for (const ex of [27, 73]) { ctx.beginPath(); ctx.arc(ex, 56, 3, 0, Math.PI * 2); ctx.fill(); } }
  // yanak
  if (kadin || expr === 'happy' || expr === 'laugh') { ctx.fillStyle = 'rgba(244,114,182,.35)'; for (const ex of [36, 64]) { ctx.beginPath(); ctx.arc(ex, 56, 4, 0, Math.PI * 2); ctx.fill(); } }
  // saç üst
  ctx.fillStyle = L.hair;
  switch (L.style) {
    case 'kel': break;
    case 'mohikan': ctx.beginPath(); ctx.roundRect(44, 8, 12, 24, 5); ctx.fill(); break;
    case 'kivircik': for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(30 + i * 8, 24 + (i % 2) * 3, 8, 0, Math.PI * 2); ctx.fill(); } break;
    case 'topuz': ctx.beginPath(); ctx.roundRect(25, 18, 50, 16, [14, 14, 4, 4]); ctx.fill(); ctx.beginPath(); ctx.arc(50, 14, 10, 0, Math.PI * 2); ctx.fill(); break;
    case 'kakul': ctx.beginPath(); ctx.roundRect(25, 18, 50, 20, [14, 14, 3, 3]); ctx.fill(); break;
    default: ctx.beginPath(); ctx.roundRect(25, 18, 50, 16, [14, 14, 4, 4]); ctx.fill(); ctx.fillRect(25, 26, 7, 16);
  }
  // kaşlar
  const browUp = expr === 'surprise' || expr === 'think' ? -4 : expr === 'sad' ? 1 : 0;
  ctx.strokeStyle = shade(L.hair, 0.8); ctx.lineWidth = kadin ? 1.8 : 2.6; ctx.lineCap = 'round';
  for (const [ex, dir] of [[41, -1], [59, 1]]) {
    ctx.beginPath();
    if (expr === 'sad') { ctx.moveTo(ex - 5, 37 + browUp + (dir < 0 ? 0 : 2)); ctx.lineTo(ex + 5, 37 + browUp + (dir < 0 ? 2 : 0)); }
    else if (expr === 'think' && dir > 0) { ctx.moveTo(ex - 5, 35); ctx.lineTo(ex + 5, 32); }
    else { ctx.moveTo(ex - 5, 38 + browUp); ctx.lineTo(ex + 5, 38 + browUp); }
    ctx.stroke();
  }
  // gözler
  const closed = expr === 'blink' || expr === 'laugh' || (expr === 'happy' && f > 1);
  for (const [ex, i] of [[41, 0], [59, 1]]) {
    const shut = closed || (expr === 'wink' && i === 1);
    if (shut) { ctx.strokeStyle = '#2b1d12'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(ex, 47, 5, Math.PI * 1.15, Math.PI * 1.85, expr === 'laugh' || expr === 'happy'); ctx.stroke(); continue; }
    const big = expr === 'surprise' ? 1.35 : 1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, 46, 5 * big, 6 * big, 0, 0, Math.PI * 2); ctx.fill();
    const look = expr === 'think' ? [2, -2] : expr === 'dance' ? [osc * 1.5, 0] : [0, 0];
    ctx.fillStyle = L.eyes; ctx.beginPath(); ctx.arc(ex + look[0], 47 + look[1], 3.2 * big, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + look[0], 47 + look[1], 1.4 * big, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.2 + look[0], 45.5 + look[1], 1, 0, Math.PI * 2); ctx.fill();
    if (kadin) { ctx.strokeStyle = '#1f1410'; ctx.lineWidth = 1.2; for (let k = 0; k < 3; k++) { const a = Math.PI * 1.15 + k * 0.32; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 5.2, 46 + Math.sin(a) * 6.2); ctx.lineTo(ex + Math.cos(a) * 7.5, 46 + Math.sin(a) * 8.6); ctx.stroke(); } }
  }
  // ağız
  ctx.strokeStyle = kadin ? '#c0395b' : 'rgba(60,30,20,.8)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  if (expr === 'surprise') { ctx.fillStyle = '#5a2e1e'; ctx.beginPath(); ctx.ellipse(50, 58, 4, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (expr === 'laugh' || expr === 'cheer' || expr === 'jump') { ctx.fillStyle = '#5a2e1e'; ctx.beginPath(); ctx.arc(50, 56, 7, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(44, 56, 12, 2.5); }
  else if (expr === 'sad') { ctx.beginPath(); ctx.arc(50, 63, 6, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  else if (expr === 'think') { ctx.beginPath(); ctx.moveTo(45, 59); ctx.lineTo(55, 58); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(50, 56, expr === 'happy' ? 8 : 7, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  // sakal
  ctx.fillStyle = L.hair;
  if (L.beard === 'biyik' || L.beard === 'sakal') { ctx.beginPath(); ctx.roundRect(41, 51, 18, 4, 2); ctx.fill(); }
  if (L.beard === 'keci') { ctx.beginPath(); ctx.roundRect(45, 61, 10, 8, 3); ctx.fill(); }
  if (L.beard === 'sakal') { ctx.beginPath(); ctx.moveTo(29, 52); ctx.lineTo(33, 70); ctx.lineTo(67, 70); ctx.lineTo(71, 52); ctx.lineTo(66, 60); ctx.lineTo(60, 62); ctx.lineTo(40, 62); ctx.lineTo(34, 60); ctx.closePath(); ctx.fill(); }
  if (L.beard === 'kirli') { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.roundRect(31, 54, 38, 15, 8); ctx.fill(); ctx.globalAlpha = 1; }
  // eller (yüz önünde olanlar)
  if (expr === 'scratch') drawHand(ctx, L, 68 + osc * 2, 20, 0.9, 1);
  if (expr === 'think') drawHand(ctx, L, 60, 66, -0.6, 0.9);
  // gözlük
  if (L.glasses === 'gozluk' || L.glasses === 'gunes' || L.glasses === 'yuzucu') {
    ctx.strokeStyle = L.glasses === 'yuzucu' ? L.accColor : '#111'; ctx.lineWidth = 2;
    ctx.fillStyle = L.glasses === 'gunes' ? 'rgba(10,10,10,.92)' : L.glasses === 'yuzucu' ? 'rgba(120,200,255,.5)' : 'rgba(200,230,255,.35)';
    for (const ex of [41, 59]) { ctx.beginPath(); if (L.glasses === 'yuzucu') ctx.ellipse(ex, 46, 9, 7, 0, 0, Math.PI * 2); else ctx.roundRect(ex - 8, 40, 16, 12, 4); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(49, 45); ctx.lineTo(51, 45); ctx.stroke();
  }
  if (L.glasses === 'monokl') { ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(59, 46, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(66, 51); ctx.lineTo(70, 66); ctx.stroke(); }
  if (L.glasses === 'maske') { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(72, 40); ctx.lineTo(70, 54); ctx.lineTo(54, 52); ctx.lineTo(50, 56); ctx.lineTo(46, 52); ctx.lineTo(30, 54); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; for (const ex of [41, 59]) { ctx.beginPath(); ctx.ellipse(ex, 46, 4, 4.5, 0, 0, Math.PI * 2); ctx.fill(); } }
  if (L.glasses === 'kalp') { ctx.fillStyle = 'rgba(236,72,153,.75)'; for (const ex of [41, 59]) { ctx.beginPath(); ctx.moveTo(ex, 53); ctx.bezierCurveTo(ex - 10, 45, ex - 4, 37, ex, 42); ctx.bezierCurveTo(ex + 4, 37, ex + 10, 45, ex, 53); ctx.fill(); } }
  // şapka
  const HC = L.hatColor;
  switch (L.hat) {
    case 'kep': ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(25, 14, 50, 16, [16, 16, 2, 2]); ctx.fill(); ctx.fillStyle = shade(HC, 0.7); ctx.fillRect(25, 27, 58, 5); break;
    case 'bere': ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(24, 12, 52, 20, [18, 18, 3, 3]); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(50, 11, 6, 0, Math.PI * 2); ctx.fill(); break;
    case 'kask': ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.roundRect(22, 14, 56, 26, [20, 20, 4, 4]); ctx.fill(); ctx.fillStyle = HC; ctx.fillRect(22, 30, 56, 5); break;
    case 'tac': ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(28, 26); ctx.lineTo(30, 8); ctx.lineTo(40, 18); ctx.lineTo(50, 4); ctx.lineTo(60, 18); ctx.lineTo(70, 8); ctx.lineTo(72, 26); ctx.closePath(); ctx.fill(); ctx.fillStyle = HC; ctx.beginPath(); ctx.arc(50, 18, 3, 0, Math.PI * 2); ctx.fill(); break;
    case 'parti': ctx.fillStyle = HC; ctx.beginPath(); ctx.moveTo(36, 26); ctx.lineTo(50, -2); ctx.lineTo(64, 26); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(50, -2, 4, 0, Math.PI * 2); ctx.fill(); break;
    case 'fes': ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(31, 6, 38, 24, [6, 6, 2, 2]); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(50, 6); ctx.lineTo(62, 22); ctx.stroke(); break;
    case 'kovboy': ctx.fillStyle = shade(HC, 0.8); ctx.beginPath(); ctx.ellipse(50, 28, 36, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(32, 8, 36, 22, [12, 12, 2, 2]); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(32, 23, 36, 4); break;
    case 'silindir': ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(31, 0, 38, 30, [4, 4, 2, 2]); ctx.fill(); ctx.fillStyle = shade(HC, 0.75); ctx.beginPath(); ctx.roundRect(22, 26, 56, 6, 3); ctx.fill(); ctx.fillStyle = L.accColor; ctx.fillRect(31, 20, 38, 5); break;
    case 'korsan': ctx.fillStyle = HC; ctx.beginPath(); ctx.moveTo(18, 30); ctx.quadraticCurveTo(50, -6, 82, 30); ctx.lineTo(74, 30); ctx.quadraticCurveTo(50, 14, 26, 30); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(50, 18, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(43, 24, 14, 2); break;
    case 'bandana': ctx.fillStyle = HC; ctx.beginPath(); ctx.roundRect(25, 22, 50, 10, 4); ctx.fill(); ctx.beginPath(); ctx.moveTo(74, 24); ctx.lineTo(86, 20); ctx.lineTo(84, 32); ctx.closePath(); ctx.fill(); break;
    case 'kulaklik': ctx.strokeStyle = HC; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(50, 36, 27, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = HC; for (const ex of [24, 76]) { ctx.beginPath(); ctx.roundRect(ex - 5, 38, 10, 16, 4); ctx.fill(); } break;
    case 'cicek': for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#f472b6', '#facc15', '#fb923c', '#60a5fa'][i % 4]; ctx.beginPath(); ctx.arc(28 + i * 8.8, 20 + (i % 2) * 3, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(28 + i * 8.8, 20 + (i % 2) * 3, 1.5, 0, Math.PI * 2); ctx.fill(); } break;
  }
  // ifade balonları
  if (expr === 'think') { ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', 82, 24); }
  if (expr === 'surprise') { ctx.fillStyle = '#facc15'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', 84, 22); }
  if (expr === 'happy' || expr === 'cheer') { ctx.fillStyle = '#facc15'; ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✦', 16 + osc * 2, 22); ctx.fillText('✦', 88, 14); }
  if (expr === 'dance') { ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♪', osc > 0 ? 14 : 86, 14); }
  ctx.restore();
}

// Portrenin resim adresi (HTML içine <img> olarak koymak için; görünüme göre önbellekli)
const urlCache = new Map();
const urlParams = new Map(); // normal kare adresi → [look, color, px]  (canlı ifade zamanlayıcısı için)
export function portraitURL(look, color, px = 40, expr = 'normal', frame = 0) {
  const key = JSON.stringify([look, color, px, expr, frame]);
  let u = urlCache.get(key);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = px * 2;
    drawPortrait(c.getContext('2d'), look, color, 0, 0, px * 2, { expr, frame });
    u = c.toDataURL('image/png');
    urlCache.set(key, u);
    if (expr === 'normal' && !urlParams.has(u)) urlParams.set(u, [look, color, px]);
  }
  return u;
}

// Portreyi küçük bir <canvas> olarak üretir (liste/podyum için); canlı ifadelerle
const liveCanvases = new Set();
export function registerFace(c, look, color, { bg = true } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = c.clientWidth || c.width / dpr || 64;
  c.__face = { look, color, bg, dpr, px: px, expr: null, t0: 0 };
  liveCanvases.add(c);
  drawFaceCanvas(c);
  return c;
}
function drawFaceCanvas(c) {
  const f = c.__face;
  const size = Math.round(f.px * f.dpr);
  if (c.width !== size) c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const fr = f.expr ? Math.floor((performance.now() - f.t0) / FRAME_MS) : 0;
  drawPortrait(g, f.look, f.color, 0, 0, size, { bg: f.bg, expr: f.expr || 'normal', frame: fr });
}
export function portraitCanvas(look, color, px = 64) {
  const c = document.createElement('canvas');
  c.style.width = c.style.height = px + 'px';
  c.className = 'portrait';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = c.height = Math.round(px * dpr);
  c.__face = { look, color, bg: true, dpr, px, expr: null, t0: 0 };
  liveCanvases.add(c);
  drawFaceCanvas(c);
  return c;
}
// Belirli bir yüzde hemen bir ifade başlat (ör. puan alınca sevinme)
export function emoteFace(c, expr) { if (c && c.__face) { c.__face.expr = expr; c.__face.t0 = performance.now(); drawFaceCanvas(c); } }

// Sayfadaki tüm portreler (img.face/img.pimg ve kayıtlı tuvaller) ara sıra göz kırpar, el sallar, şaşırır…
const imgState = new WeakMap();
function pickExpr(rand = Math.random) {
  let sum = 0; for (const w of Object.values(EXPR_W)) sum += w;
  let r = rand() * sum;
  for (const [k, w] of Object.entries(EXPR_W)) { r -= w; if (r <= 0) return k; }
  return 'blink';
}
let ticking = false;
export function startFaceAnimations() {
  if (ticking) return;
  ticking = true;
  setInterval(() => {
    if (document.hidden) return;
    const now = performance.now();
    // <img> portreleri
    for (const img of document.querySelectorAll('img.face, img.pimg, img.portrait-img')) {
      let st = imgState.get(img);
      if (st && st.src !== img.src && !st.mine) st = null; // dışarıdan değişti
      if (st && st.expr) {
        if (now > st.t0 + EXPR_DUR[st.expr]) { st.expr = null; st.mine = false; img.src = st.base; st.src = img.src; }
        else { const fr = Math.floor((now - st.t0) / FRAME_MS); const u = portraitURL(st.p[0], st.p[1], st.p[2], st.expr, fr); if (img.src !== u) { st.mine = true; img.src = u; st.src = u; } }
        continue;
      }
      const p = urlParams.get(img.src);
      if (!p) continue;
      if (Math.random() < 0.035) {
        st = { base: img.src, p, expr: pickExpr(), t0: now, mine: true };
        img.src = portraitURL(p[0], p[1], p[2], st.expr, 0);
        st.src = img.src;
        imgState.set(img, st);
      }
    }
    // tuvaller
    for (const c of liveCanvases) {
      if (!c.isConnected) { liveCanvases.delete(c); continue; }
      const f = c.__face;
      if (f.expr) { if (now > f.t0 + EXPR_DUR[f.expr]) f.expr = null; drawFaceCanvas(c); }
      else if (Math.random() < 0.04) { f.expr = pickExpr(); f.t0 = now; drawFaceCanvas(c); }
    }
  }, FRAME_MS);
}
