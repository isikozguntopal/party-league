// Boya motoru (paint.js) testleri: node test/paint.test.mjs
// Geri al / yinele / temizle, çizgi sınırı, onChange(ilk değişen sıra) — Ne Çizdim? canlı aktarımı buna dayanır
import assert from 'node:assert/strict';

// ---- DOM / canvas taklidi (kova için 2d bağlam gerekir; burada kullanılmıyor) ----
globalThis.document = { createElement: () => ({ getContext: () => null }), querySelector: () => null };
globalThis.AudioContext = undefined;
const { createPainter, drawStrokes, TOOLS } = await import('../public/client/paint.js');

const ok = (m) => console.log('✓ ' + m);
const ctx = { size: () => ({ W: 1000, H: 1000, DPR: 1 }), cv: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, toast: () => {} };
const area = { x: 0, y: 0, size: 1000 };
const ev = (x, y) => ({ clientX: x, clientY: y });

function mk() {
  const marks = [];
  const p = createPainter(ctx, { onChange: (i) => marks.push(i) });
  return { p, marks };
}
const stroke = (p, x0, y0, x1, y1) => { p.pointer('down', ev(x0, y0), area); p.pointer('move', ev(x1, y1), area); p.pointer('up', ev(x1, y1), area); };

{ // çizgi ekleme: down → cur (index = strokes.length), up → aynı sıraya kalıcı çizgi
  const { p, marks } = mk();
  stroke(p, 10, 10, 200, 200);
  assert.equal(p.strokes.length, 1);
  assert.equal(p.cur, null);
  assert.deepEqual(marks, [0, 0, 0]);
  assert.deepEqual(p.strokes[0].p, [10, 10, 200, 200]);
  assert.ok(Array.isArray(p.strokes[0].t) && p.strokes[0].t.length === 2);
  stroke(p, 300, 300, 400, 400);
  assert.deepEqual(marks.slice(3), [1, 1, 1]);
  ok('çizgi ekleme ve onChange sıraları (yeni çizgi = eski uzunluk)');
}
{ // geri al / yinele / temizle → ilk değişen sıra
  const { p, marks } = mk();
  stroke(p, 10, 10, 200, 200); stroke(p, 300, 300, 400, 400); stroke(p, 500, 500, 600, 600);
  marks.length = 0;
  p.undo(); assert.equal(p.strokes.length, 2); assert.deepEqual(marks, [2]);
  p.undo(); assert.equal(p.strokes.length, 1); assert.deepEqual(marks, [2, 1]);
  p.redo(); assert.equal(p.strokes.length, 2); assert.deepEqual(marks, [2, 1, 1]);
  assert.ok(p.canUndo && p.canRedo);
  p.clear(); assert.equal(p.strokes.length, 0); assert.deepEqual(marks, [2, 1, 1, 0]);
  assert.ok(!p.canRedo, 'temizleme yinelemeyi sıfırlar');
  p.undo(); assert.equal(p.strokes.length, 2); assert.equal(marks.at(-1), 0);
  p.undo(); p.undo(); assert.equal(p.strokes.length, 0);
  p.undo(); assert.equal(p.strokes.length, 0, 'boş geçmişte geri al etkisiz');
  ok('geri al / yinele / temizle ve değişen ilk sıra (kısalınca yeni uzunluk)');
}
{ // yeni çizgi geçmiş dalını keser; çizgi nesneleri referansla korunur
  const { p } = mk();
  stroke(p, 10, 10, 200, 200); stroke(p, 300, 300, 400, 400);
  const first = p.strokes[0];
  p.undo(); stroke(p, 500, 500, 600, 600);
  assert.ok(!p.canRedo);
  assert.equal(p.strokes[0], first);
  ok('yeni çizgi yinele yığınını temizler, önceki çizgiler aynı nesne');
}
{ // şekiller: dolu kare f:1, daire 36 nokta; sürüklenmeyen şekil eklenmez ama cur kalktığı bildirilir
  const { p, marks } = mk();
  p.tool.t = 'frect'; stroke(p, 100, 100, 300, 300);
  assert.equal(p.strokes[0].f, 1); assert.deepEqual(p.strokes[0].p, [100, 100, 300, 100, 300, 300, 100, 300]);
  p.tool.t = 'circle'; stroke(p, 100, 100, 300, 300);
  assert.equal(p.strokes[1].p.length, 74); assert.equal(p.strokes[1].f, undefined);
  p.tool.t = 'line'; marks.length = 0;
  p.pointer('down', ev(50, 50), area); p.pointer('up', ev(50, 50), area);
  assert.equal(p.strokes.length, 2); assert.deepEqual(marks, [2, 2]);
  ok('şekil araçları (dolu kare f:1, daire) ve tıklama-iptali');
}
{ // silgi rengi 11, renk seçince kaleme döner; reset aracı korur ama kova/silgiyi kaleme çevirir
  const { p } = mk();
  p.tool.t = 'eraser'; stroke(p, 10, 10, 50, 50);
  assert.equal(p.strokes[0].c, 11);
  p.tool.t = 'fill'; p.reset();
  assert.equal(p.strokes.length, 0); assert.equal(p.tool.t, 'pen'); assert.ok(!p.canUndo);
  ok('silgi rengi ve reset');
}
{ // düzenlenemezken girdi yok; alan dışı down yok sayılır; sınır: 600 çizgi
  const { p, marks } = mk();
  p.pointer('down', ev(10, 10), area, false); assert.equal(p.cur, null);
  p.pointer('down', ev(-100, 10), area); assert.equal(p.cur, null);
  for (let i = 0; i < 605; i++) p.addStroke({ c: 0, w: 1, p: [i, i, i + 1, i + 1] });
  assert.equal(p.strokes.length, 600);
  marks.length = 0;
  stroke(p, 10, 10, 200, 200);
  assert.equal(p.strokes.length, 600);
  assert.equal(marks.at(-1), 600, 'reddedilen çizgide cur kalktığı bildirilir');
  ok('kilit, alan dışı ve 600 çizgi sınırı');
}
{ // araç çubuğu markup'ı
  const { p } = mk();
  const h = p.toolbarHTML('nz-tools');
  assert.ok(h.includes('class="cz-side hidden" id="czSide"') && h.includes('cz-tools cz-tools2 nz-tools') && h.includes('cz-pen'));
  assert.equal((h.match(/data-c="/g) || []).length, 12);
  assert.equal((h.match(/data-w="/g) || []).length, 4);
  for (const [t] of TOOLS) assert.ok(h.includes(`data-t="${t}"`));
  assert.ok(!p.toolbarHTML().includes('nz-tools'));
  ok('toolbarHTML: palet 12, kalınlık 4, tüm araçlar, ek sınıf');
}
{ // drawStrokes dolu şekil ve zaman kesiti çalışır (sahte bağlam)
  const calls = [];
  const g = new Proxy({}, { get: (_, k) => (k === 'lineWidth' ? 1 : (...a) => calls.push([k, ...a])) });
  drawStrokes(g, [{ c: 0, w: 0, p: [0, 0, 100, 0, 100, 100], f: 1, t: [0, 10] }, { c: 1, w: 1, p: [0, 0, 50, 50, 100, 100], t: [20, 40] }], 0, 0, 1000, 35);
  assert.ok(calls.some(([k, m]) => k === 'fill' && m === 'evenodd'));
  assert.equal(calls.filter(([k]) => k === 'lineTo').length, 2 + 1, 'ikinci çizginin yarısı');
  ok('drawStrokes: evenodd dolgu + tekrar oynatma kesiti');
}
console.log('TÜM TESTLER GEÇTİ (paint)');
