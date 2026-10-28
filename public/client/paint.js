// 🖌️ Boya motoru: çizgi çizme, araç çubuğu, geri al / yinele, kova, şekiller.
// Kulaktan Kulağa (cizim.js) ve Ne Çizdim? (neciz.js) ortak kullanır.
import { PALETTE, WIDTHS } from '../games/doodles.js';
import { sfx, clamp } from './util.js';

// vt: tekrar oynatmada "şu ana kadar çizilmiş" zaman (ms). Verilmezse çizimin tamamı.
// Çizgi biçimi: {c, w, p:[x,y,...] 0..1000, t?:[t0,t1], f?:1}  f:1 → kapalı dolu şekil (evenodd; delikler korunur)
export function drawStrokes(g, strokes, x, y, size, vt = Infinity) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const k = size / 1000;
  for (const s of strokes || []) {
    let p = s.p;
    if (!p || p.length < 2) continue;
    if (s.f) {
      // dolu şekil: çizilmeye başlandığı anda bütün olarak belirir
      if (s.t && vt < s.t[0]) continue;
      if (p.length < 6) continue;
      g.fillStyle = PALETTE[s.c] || '#111';
      g.beginPath(); g.moveTo(x + p[0] * k, y + p[1] * k);
      for (let i = 2; i < p.length; i += 2) g.lineTo(x + p[i] * k, y + p[i + 1] * k);
      g.closePath(); g.fill('evenodd');
      if (s.w > 0) { g.strokeStyle = g.fillStyle; g.lineWidth = (WIDTHS[s.w] || 10) * k; g.stroke(); }
      continue;
    }
    if (s.t && vt < s.t[1]) {
      if (vt < s.t[0]) continue;
      const n = Math.max(1, Math.floor((p.length / 2) * (vt - s.t[0]) / Math.max(1, s.t[1] - s.t[0])));
      p = p.slice(0, n * 2);
    }
    g.strokeStyle = g.fillStyle = PALETTE[s.c] || '#111';
    g.lineWidth = (WIDTHS[s.w] || 10) * k;
    if (p.length === 2) { g.beginPath(); g.arc(x + p[0] * k, y + p[1] * k, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); continue; }
    g.beginPath(); g.moveTo(x + p[0] * k, y + p[1] * k);
    for (let i = 2; i < p.length; i += 2) g.lineTo(x + p[i] * k, y + p[i + 1] * k);
    g.stroke();
  }
  g.restore();
}

// ---------- Kova (flood fill): çizim raster'a çizilir, tıklanan bölge doldurulur, sınırı poligona çevrilir ----------
const FR = 320;            // raster çözünürlüğü (hücre ≈ 3 birim / 1000)
const FILL_TOL = 120;      // renk toleransı (3 kanal mutlak fark toplamı) — kenar yumuşatma saçaklarını içeri alır
const FILL_MAX_COORDS = 1600;
let fillCv = null;
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Maskedeki dolu hücrelerin sınır kenarlarını (dolu bölge sağda kalacak şekilde yönlü) halkalara bağlar.
// Dış halkalar ve delikler ayrı halkalar olarak döner; köşe noktaları (örgü koordinatı 0..R).
export function traceRings(mask, R) {
  const at = (x, y) => x >= 0 && y >= 0 && x < R && y < R && mask[y * R + x];
  const W = R + 1, out = new Map();
  const add = (x, y, d) => { const key = y * W + x; const a = out.get(key); if (a) a.push(d); else out.set(key, [d]); };
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) if (mask[y * R + x]) {
    if (!at(x, y - 1)) add(x, y, 0);         // üst kenar: sağa
    if (!at(x + 1, y)) add(x + 1, y, 1);     // sağ kenar: aşağı
    if (!at(x, y + 1)) add(x + 1, y + 1, 2); // alt kenar: sola
    if (!at(x - 1, y)) add(x, y + 1, 3);     // sol kenar: yukarı
  }
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const rings = [];
  for (const [k0, dirs0] of out) {
    while (dirs0.length) {
      let d = dirs0.pop();
      const x0 = k0 % W, y0 = (k0 - x0) / W;
      const ring = [x0, y0];
      let x = x0 + DX[d], y = y0 + DY[d], prev = d, guard = 0;
      while (!(x === x0 && y === y0) && guard++ < 4e6) {
        const dirs = out.get(y * W + x);
        if (!dirs || !dirs.length) break;
        let nd;
        if (dirs.length === 1) nd = dirs.pop();
        else { const pref = (prev + 1) % 4, i = dirs.indexOf(pref); nd = i >= 0 ? dirs.splice(i, 1)[0] : dirs.pop(); } // sağa dönüş tercihi
        if (nd !== prev) ring.push(x, y); // yalnızca köşeler
        prev = nd; x += DX[nd]; y += DY[nd];
      }
      if (ring.length >= 6) rings.push(ring);
    }
  }
  return rings;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay);
  let imax = 0, dmax = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = L ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L : Math.hypot(x - ax, y - ay);
    if (d > dmax) { dmax = d; imax = i; }
  }
  if (dmax > eps) { const l = rdp(pts.slice(0, imax + 1), eps), r = rdp(pts.slice(imax), eps); return l.slice(0, -1).concat(r); }
  return [pts[0], pts[pts.length - 1]];
}
// kapalı halkayı sadeleştir (en uzak noktadan ikiye bölüp RDP)
export function simplifyRing(ring, eps) {
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  if (pts.length < 4) return pts;
  let f = 0, dm = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > dm) { dm = d; f = i; } }
  const a = rdp(pts.slice(0, f + 1), eps), b = rdp(pts.slice(f).concat([pts[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
// Halkaları tek bir poligon yoluna birleştir: delikler ilk halkaya "köprü" ile bağlanır (evenodd ile dolgu doğru kalır)
export function ringsToPoly(rings, R, maxCoords = FILL_MAX_COORDS) {
  const sc = (v) => Math.round(v * 1000 / R);
  let eps = 0.9, simp = [];
  for (let it = 0; it < 7; it++) {
    simp = rings.map((r) => simplifyRing(r, eps)).filter((r) => r.length >= 3);
    const n = simp.reduce((a, r) => a + r.length * 2 + 4, 0);
    if (n <= maxCoords) break;
    eps *= 1.6;
    if (it === 6) { simp.sort((a, b) => b.length - a.length); while (simp.reduce((a, r) => a + r.length * 2 + 4, 0) > maxCoords && simp.length > 1) simp.pop(); }
  }
  if (!simp.length) return null;
  // en büyük sınır kutusuna sahip halka dış halka olsun
  const box = (r) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return (x1 - x0) * (y1 - y0); };
  simp.sort((a, b) => box(b) - box(a));
  const p = [];
  const main = simp[0];
  for (const [x, y] of main) p.push(sc(x), sc(y));
  for (let i = 1; i < simp.length; i++) {
    const r = simp[i];
    p.push(sc(main[0][0]), sc(main[0][1]));
    for (const [x, y] of r) p.push(sc(x), sc(y));
    p.push(sc(r[0][0]), sc(r[0][1]));
  }
  if (simp.length > 1) p.push(sc(main[0][0]), sc(main[0][1]));
  return p;
}
// 4-komşulu taşma doldurma; maske döner
export function floodMask(img, R, sx, sy, tol = FILL_TOL) {
  const mask = new Uint8Array(R * R);
  const si = (sy * R + sx) * 4, r0 = img[si], g0 = img[si + 1], b0 = img[si + 2];
  const stack = [sy * R + sx];
  mask[sy * R + sx] = 1;
  const ok = (j) => { const o = j * 4; return Math.abs(img[o] - r0) + Math.abs(img[o + 1] - g0) + Math.abs(img[o + 2] - b0) < tol; };
  while (stack.length) {
    const i = stack.pop(), x = i % R, y = (i - x) / R;
    if (x > 0 && !mask[i - 1] && ok(i - 1)) { mask[i - 1] = 1; stack.push(i - 1); }
    if (x < R - 1 && !mask[i + 1] && ok(i + 1)) { mask[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !mask[i - R] && ok(i - R)) { mask[i - R] = 1; stack.push(i - R); }
    if (y < R - 1 && !mask[i + R] && ok(i + R)) { mask[i + R] = 1; stack.push(i + R); }
  }
  return mask;
}
// Tıklanan noktadaki kapalı bölgeyi dolduran çizgi ({c, w:0, p, f:1}) ya da null
export function bucketFill(strokes, px, py, color) {
  if (!fillCv) { fillCv = document.createElement('canvas'); fillCv.width = fillCv.height = FR; }
  const c = fillCv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, FR, FR);
  drawStrokes(c, strokes, 0, 0, FR);
  const img = c.getImageData(0, 0, FR, FR).data;
  const sx = clamp(Math.floor(px * FR / 1000), 0, FR - 1), sy = clamp(Math.floor(py * FR / 1000), 0, FR - 1);
  const si = (sy * FR + sx) * 4, t = hexRGB(PALETTE[color]);
  if (Math.abs(img[si] - t[0]) + Math.abs(img[si + 1] - t[1]) + Math.abs(img[si + 2] - t[2]) < 30) return null; // zaten bu renk
  const mask = floodMask(img, FR, sx, sy);
  const p = ringsToPoly(traceRings(mask, FR), FR);
  return p && p.length >= 6 ? { c: color, w: 0, p, f: 1 } : null;
}

export const TOOLS = [
  ['pen', '✏️', 'Kalem'], ['eraser', '🧽', 'Silgi'], ['fill', '🪣', 'Kova'], ['line', '📏', 'Çizgi'],
  ['rect', '▭', 'Kare'], ['frect', '■', 'Dolu kare'], ['circle', '○', 'Daire'], ['fcircle', '●', 'Dolu daire'],
];
const TOOL_ICO = Object.fromEntries(TOOLS.map(([t, i]) => [t, i]));
const MAX_STROKES = 600, MAX_COORDS = 23500;
const coordCount = (list) => list.reduce((a, s) => a + s.p.length, 0);
const ellipsePts = (x0, y0, x1, y1, closed) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2, n = 36, p = [];
  for (let i = 0; i < n + (closed ? 1 : 0); i++) { const a = (i / n) * Math.PI * 2; p.push(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)); }
  return p;
};
// İki çizgi listesinin (referansla) ayrıştığı ilk sıra; kısalmışsa yeni uzunluk
const firstDiff = (a, b) => { const n = Math.min(a.length, b.length); let i = 0; while (i < n && a[i] === b[i]) i++; return i; };

// ctx: { size(), cv, toast }  — DPR ve tuval konumu için
// onChange(i): çizgi listesi değişince çağrılır; i = değişen ilk çizginin sırası
//   (yeni çizgi → eski uzunluk, geri al / temizle → kısalan uzunluk, devam eden çizgi (cur) → strokes.length)
export function createPainter(ctx, { onChange } = {}) {
  let strokes = [], cur = null, start = null, tool = { c: 0, w: 1, t: 'pen', e: 1 }; // e: silgi boyutu 0-3 (WIDTHS 1-4)
  let past = [], future = [], drawT0 = performance.now();
  let root = null, handler = null;

  const notify = (i) => { if (onChange) onChange(i, strokes, cur); };
  const setStrokes = (next) => { const i = firstDiff(strokes, next); strokes = next; notify(i); };
  const commit = (next) => { past.push(strokes); if (past.length > 150) past.shift(); future = []; setStrokes(next); };
  const undo = () => { if (!past.length) return; future.push(strokes); setStrokes(past.pop()); };
  const redo = () => { if (!future.length) return; past.push(strokes); setStrokes(future.pop()); };
  const clear = () => { if (strokes.length) commit([]); };
  function addStroke(s) {
    if (strokes.length >= MAX_STROKES || coordCount(strokes) + s.p.length > MAX_COORDS) { if (ctx.toast) ctx.toast('Çizim çok büyüdü'); return false; }
    commit(strokes.concat([s]));
    return true;
  }
  const q$ = (sel) => (root ? root.querySelector(sel) : null);
  function refresh() {
    if (!root) return;
    const ico = q$('#czToolIco'); if (ico) ico.textContent = TOOL_ICO[tool.t];
    const dot = q$('#czColorDot'); if (dot) dot.style.background = PALETTE[tool.t === 'eraser' ? 11 : tool.c];
    root.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', +x.dataset.c === tool.c));
    root.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', +x.dataset.w === tool.w));
    root.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('on', +x.dataset.e === tool.e));
    if (tool.t !== 'eraser') hideEraserSizes();
    root.querySelectorAll('.cz-side [data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === tool.t));
    const u = q$('#czUndo'), r = q$('#czRedo');
    if (u) u.disabled = !past.length;
    if (r) r.disabled = !future.length;
  }
  // Silgiye dokununca yanında boyut kutusu açılır (panel kaydırmalı olduğu için kutu panelin dışında, silgi düğmesinin hizasında)
  const isEraserSizesOpen = () => { const z = q$('#czEsz'); return !!z && !z.classList.contains('hidden'); };
  function hideEraserSizes() { const z = q$('#czEsz'); if (z) z.classList.add('hidden'); }
  function showEraserSizes(btn) {
    const z = q$('#czEsz'), side = q$('#czSide');
    if (!z || !side || !btn) return;
    z.style.left = (side.offsetLeft + side.offsetWidth + 6) + 'px';
    z.style.top = (side.offsetTop + btn.offsetTop - side.scrollTop - 3) + 'px';
    z.classList.remove('hidden');
  }
  // Araç çubuğu: solda dikey panel (.cz-side) + altta kalem düğmesi, palet, geri al / yinele (.cz-tools > .cz-bar)
  function toolbarHTML(extraClass = '') {
    return `<div class="cz-side hidden" id="czSide">
          ${TOOLS.map(([t, i, n]) => `<button class="opt" data-t="${t}" title="${n}">${i}</button>`).join('')}
          <span class="cz-sep"></span>
          ${[0, 1, 2, 3].map((w) => `<button class="opt" data-w="${w}" title="Kalınlık"><i style="width:${5 + w * 5}px;height:${5 + w * 5}px"></i></button>`).join('')}
          <span class="cz-sep"></span>
          <button class="opt" data-t="clear" title="Temizle">🗑️</button>
        </div>
        <div class="cz-esz hidden" id="czEsz">${[0, 1, 2, 3].map((e) => `<button class="opt" data-e="${e}" title="Silgi boyutu"><i style="width:${[8, 13, 19, 27][e]}px;height:${[8, 13, 19, 27][e]}px"></i></button>`).join('')}</div>
        <div class="cz-tools cz-tools2${extraClass ? ' ' + extraClass : ''}">
          <div class="cz-bar">
            <button class="opt cz-pen" data-t="toggle" title="Araçlar"><span id="czToolIco">✏️</span><i id="czColorDot"></i></button>
            <div class="cz-colors">${PALETTE.map((c, i) => `<button class="sw" data-c="${i}" style="background:${c}"></button>`).join('')}</div>
            <button class="opt" id="czUndo" data-t="undo" title="Geri al">↩️</button><button class="opt" id="czRedo" data-t="redo" title="Yinele">↪️</button>
          </div>
        </div>`;
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !b.closest('.cz-side, .cz-bar, .cz-esz')) return;
    const t = b.dataset.t;
    if (b.dataset.c) { tool.c = +b.dataset.c; if (tool.t === 'eraser') tool.t = 'pen'; }
    else if (b.dataset.w) tool.w = +b.dataset.w;
    else if (b.dataset.e) { tool.e = +b.dataset.e; hideEraserSizes(); }
    else if (t === 'toggle') { const side = q$('#czSide'); if (side) side.classList.toggle('hidden'); hideEraserSizes(); }
    else if (t === 'undo') undo();
    else if (t === 'redo') redo();
    else if (t === 'clear') clear();
    else if (t === 'eraser') { const open = tool.t === 'eraser' && isEraserSizesOpen(); tool.t = 'eraser'; if (open) hideEraserSizes(); else showEraserSizes(b); }
    else if (t) tool.t = t;
    refresh();
    sfx('tick');
  }
  // uiRoot: araç çubuğu markup'ının içinde bulunduğu eleman; yalnızca .cz-side / .cz-bar düğmeleri dinlenir
  function bind(uiRoot) {
    unbind();
    root = uiRoot; handler = onClick;
    root.addEventListener('click', handler);
    refresh();
  }
  function unbind() { if (root && handler) root.removeEventListener('click', handler); root = null; handler = null; }
  function reset() {
    strokes = []; past = []; future = []; cur = null; start = null;
    if (tool.t === 'fill' || tool.t === 'eraser') tool.t = 'pen';
    drawT0 = performance.now();
    refresh();
  }
  // area = {x, y, size} tuval pikseli; editable false ise girdi yok sayılır
  function pointer(type, ev, area, editable = true) {
    if (!editable || !area) return;
    if (type === 'down') hideEraserSizes();
    const { DPR } = ctx.size();
    const r = ctx.cv.getBoundingClientRect();
    const px = ((ev.clientX - r.left) * DPR - area.x) / area.size * 1000, py = ((ev.clientY - r.top) * DPR - area.y) / area.size * 1000;
    const inside = px >= -20 && py >= -20 && px <= 1020 && py <= 1020;
    const q = [Math.round(clamp(px, 0, 1000)), Math.round(clamp(py, 0, 1000))];
    const tnow = Math.round(performance.now() - drawT0);
    const t = tool.t, col = t === 'eraser' ? 11 : tool.c;
    if (type === 'down') {
      if (!inside) return;
      if (t === 'fill') {
        const f = bucketFill(strokes, q[0], q[1], col);
        if (f) { f.t = [tnow, tnow + 200]; if (addStroke(f)) sfx('pop'); refresh(); }
        return;
      }
      start = { q, t: tnow };
      cur = { c: col, w: t === 'eraser' ? tool.e + 1 : tool.w, p: q.slice(), t: [tnow, tnow] };
      if (t !== 'pen' && t !== 'eraser') cur.shape = t;
      notify(strokes.length);
    } else if (type === 'move' && cur) {
      if (!cur.shape) {
        const n = cur.p.length;
        if (Math.hypot(q[0] - cur.p[n - 2], q[1] - cur.p[n - 1]) > 4 && cur.p.length < 3000) { cur.p.push(...q); cur.t[1] = tnow; notify(strokes.length); }
      } else {
        const [x0, y0] = start.q, [x1, y1] = q;
        cur.t[1] = tnow;
        if (cur.shape === 'line') cur.p = [x0, y0, x1, y1];
        else if (cur.shape === 'rect') cur.p = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
        else if (cur.shape === 'frect') { cur.p = [x0, y0, x1, y0, x1, y1, x0, y1]; cur.f = 1; }
        else if (cur.shape === 'circle') cur.p = ellipsePts(x0, y0, x1, y1, true);
        else if (cur.shape === 'fcircle') { cur.p = ellipsePts(x0, y0, x1, y1, false); cur.f = 1; }
        notify(strokes.length);
      }
    } else if ((type === 'up' || type === 'cancel') && cur) {
      cur.t[1] = Math.max(cur.t[1], tnow);
      const s = { c: cur.c, w: cur.w, p: cur.p, t: cur.t };
      if (cur.f) s.f = 1;
      const dragged = !cur.shape || cur.p.length > 2;
      const at = strokes.length;
      cur = null; start = null;
      if (!dragged || !addStroke(s)) notify(at); // iptal / sınır aşımı: devam eden çizgi kalktı
      refresh();
    }
  }
  return {
    get strokes() { return strokes; },
    get cur() { return cur; },
    get tool() { return tool; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    toolbarHTML, bind, unbind, reset, pointer, refresh, undo, redo, clear, addStroke,
    dispose() { unbind(); strokes = []; past = []; future = []; cur = null; },
  };
}
