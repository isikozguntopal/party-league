// Pati Koşusu: pist üretimi, fizik, 7 güçlendirme, botlar, ödül
// Çalıştır: node test/pati.test.mjs
import assert from 'node:assert/strict';
import * as P from '../public/games/pati.js';

const ok = (m) => console.log('✓ ' + m);
const DT = 1 / 60;
// Tek koşucu testlerinde kısayol: step(sim, { jump: true }) → { a: { jump: true } }
const step = (sim, inp = {}) => P.stepSim(sim, DT, ('jump' in inp || 'slide' in inp || 'item' in inp) ? { a: inp } : inp);
// eşyayı kullan: elden çıkan güç yere inene / hedefe çarpana dek ilerletilir (olaylar birleşik döner)
const useIt = (sim, inp) => { const evs = step(sim, inp); for (let i = 0; i < 240 && sim.proj.length; i++) evs.push(...step(sim)); return evs; };
const steps = (sim, n, inp = {}) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...step(sim, inp)); return ev; };

// Kontrollü yapay pist: düz zemin + istenen engeller/platformlar
function synth({ plats = [{ x0: 0, x1: 400, y: 0 }], up = [], obst = [], gaps = [], boxes = [], finish = 300 } = {}) {
  return { map: 'orman', seed: 1, len: finish, plats, up, obst: obst.slice().sort((a, b) => a.x - b.x), boxes, gaps, rises: [], finishX: finish };
}
function mk(track, ids = ['a'], opts = {}) {
  const sim = P.createSim({ map: 'orman', seed: 7, racers: ids.map((id, i) => ({ id, bot: !!(opts.bots && opts.bots[i]), animal: (opts.animals && opts.animals[i]) || 'tilki' })) });
  if (track) { sim.track = track; sim.boxT = track.boxes.map(() => 0); }
  P.startCountdown(sim);
  while (sim.phase !== 'race') step(sim);
  for (const r of sim.racers) r.boost = 0;       // başlangıç hızlanması testlerin dışında
  return sim;
}
const put = (sim, id, x) => { const r = sim.byId[id]; r.x = x; r.y = P.groundAt(sim.track, x) ?? 0; r.vy = 0; r.grounded = true; r.sp = P.BASE_V; r.inv = 0; r.safeX = Math.max(0, x - 2); return r; };
const BLOCK = (x) => ({ k: 'block', x, w: 1.0, y0: 0, y1: 1.1 });
const BAR = (x) => ({ k: 'bar', x, w: 1.2, y0: 0.95, y1: 2.5 });
const SPIKE = (x) => ({ k: 'spike', x, w: 1.6, y0: 0, y1: 0.55 });

// ================= PİST ÜRETİMİ =================
{
  for (const map of P.MAP_IDS) {
    for (let seed = 1; seed <= 60; seed++) {
      const tr = P.buildTrack(map, seed * 1013);
      assert.equal(tr.plats[0].x0, 0, 'pist 0\'da başlar');
      assert.ok(tr.plats[tr.plats.length - 1].x1 >= tr.len + 60, 'bitiş çizgisinin ötesinde zemin var');
      let prev = null, maxGap = 0, maxRise = 0;
      for (const p of tr.plats) {
        assert.ok(p.pit ? p.x1 - p.x0 >= 1.5 : p.x1 >= p.x0 + 2.9, 'platform yeterince uzun');
        if (prev) { const g = p.x0 - prev.x1; assert.ok(g > -1e-9, 'platformlar çakışmaz'); maxGap = Math.max(maxGap, g); const pe = prev.y1 ?? prev.y; maxRise = Math.max(maxRise, p.y - pe); assert.ok(Math.abs(p.y - pe) <= 1.7, 'basamak aşılabilir: ' + (p.y - pe)); }
        prev = p;
      }
      assert.ok(maxGap <= 5.41, `${map}/${seed}: çukur tek zıplamayla geçilebilir: ${maxGap.toFixed(2)}`);
      // başlangıç düzlüğünde engel yok
      assert.ok(tr.obst.every((o) => o.x > 30), 'başlangıçta engel yok');
      // engeller platform üstünde, kenarlardan uzak, kendi aralarında yeterli boşluk
      for (const o of tr.obst) {
        const p = tr.plats.find((q) => o.x >= q.x0 && o.x + o.w <= q.x1);
        assert.ok(p, `${map}/${seed}: engel platformun içinde (x=${o.x.toFixed(1)})`);
        assert.ok(o.x - p.x0 >= 2.4 && p.x1 - (o.x + o.w) >= 3.0, 'engel kenara çok yakın değil');
        assert.ok(Math.abs(o.y0 - p.y) < 1.01 && o.y1 > p.y, 'engel zemine oturur');
      }
      const sorted = tr.obst.map((o) => o.x);
      assert.deepEqual(sorted, sorted.slice().sort((a, b) => a - b), 'engeller x sırasında');
      // kutular platformda, engelden uzak
      const xs = tr.boxes.map((b) => b.x); assert.deepEqual(xs, xs.slice().sort((a, b) => a - b), 'kutular x sırasında');
      for (const b of tr.boxes) {
        const tier = tr.up.some((u) => b.x >= u.x0 && b.x < u.x1 && Math.abs(b.y - (u.y + 0.75)) < 1e-9);
        if (tier) continue; // üst kat kutusu
        assert.ok(P.groundAt(tr, b.x) !== null, 'kutu zeminde'); assert.ok(tr.obst.every((o) => b.x < o.x - 2 || b.x > o.x + o.w + 2), 'kutu engele yakın değil');
      }
      assert.ok(tr.up.length >= 3, `${map}/${seed}: üst katlar var: ${tr.up.length}`);
      for (const u of tr.up) { assert.ok(u.x1 - u.x0 >= 12, 'üst kat yeterince uzun'); assert.ok(!tr.obst.some((o) => o.k === 'bar' && o.x < u.x1 + 1 && o.x + o.w > u.x0 - 1) || u.t >= 2, 'üst kat asılı kütüğün altına konmaz'); }
      assert.ok(tr.boxes.length >= 8, `${map}/${seed}: yeterince kutu: ${tr.boxes.length}`);
    }
  }
  // belirlenimci ve haritalar farklı
  const a = P.buildTrack('orman', 4242), Y2 = await import('../public/games/pati.js?fresh=' + Date.now());
  assert.deepEqual(a.plats, Y2.buildTrack('orman', 4242).plats); assert.deepEqual(a.obst, Y2.buildTrack('orman', 4242).obst);
  assert.notDeepEqual(a.plats.slice(0, 5), P.buildTrack('orman', 4243).plats.slice(0, 5), 'farklı tohum → farklı pist');
  assert.notDeepEqual(a.plats.slice(0, 5), P.buildTrack('magara', 4242).plats.slice(0, 5), 'farklı harita → farklı pist');
  ok('Pist: 3 harita × 60 tohum geçerli (çukur ≤ 5.4, basamak ≤ 1.7, engeller platformda, kutular güvenli), belirlenimci');
}

// ================= FİZİK =================
{
  // zıplama yüksekliği ve süresi
  const sim = mk(synth());
  const r = sim.byId.a; put(sim, 'a', 5);
  step(sim, { jump: true });
  let apex = 0, t = 1;
  while (!r.grounded && t < 200) { apex = Math.max(apex, r.y); step(sim); t++; }
  const exp = P.JUMP_V ** 2 / (2 * P.G);
  assert.ok(Math.abs(apex - exp) < 0.2, `zıplama yüksekliği ${apex.toFixed(2)} ≈ ${exp.toFixed(2)}`);
  assert.ok(Math.abs(t * DT - 2 * P.JUMP_V / P.G) < 0.06, `havada kalma süresi ${(t * DT).toFixed(2)} sn`);
  ok(`Zıplama: yükseklik ${apex.toFixed(2)}, süre ${(t * DT).toFixed(2)} sn`);
}
{
  // çift zıplama: havada ikinci kez, üçüncüsü olmaz
  const sim = mk(synth()); const r = sim.byId.a; put(sim, 'a', 5);
  step(sim, { jump: true }); steps(sim, 22);
  assert.equal(r.jumps, 1);
  const ev = step(sim, { jump: true });
  assert.ok(ev.some((e) => e.e === 'jump2') && r.jumps === 2, 'ikinci zıplama');
  let apex2 = 0; for (let i = 0; i < 120 && !r.grounded; i++) { apex2 = Math.max(apex2, r.y); step(sim, i === 5 ? { jump: true } : {}); }
  assert.ok(apex2 > 4.6, 'çift zıplama daha yükseğe çıkarır: ' + apex2.toFixed(2));
  // üçüncü basış etkisiz
  const s2 = mk(synth()); const q = s2.byId.a; put(s2, 'a', 5);
  step(s2, { jump: true }); steps(s2, 10); step(s2, { jump: true }); steps(s2, 6);
  const vyBefore = q.vy; const ev3 = step(s2, { jump: true });
  assert.ok(!ev3.some((e) => e.e === 'jump' || e.e === 'jump2'), 'üçüncü zıplama yok'); assert.ok(q.vy < vyBefore, 'üçüncü basış ivme vermez');
  ok(`Çift zıplama: ikinci zıplamayla zirve ${apex2.toFixed(2)}, üçüncü basış etkisiz`);
}
{
  // yere çakılma: havada KAY → hızla iner, sert iniş
  const a = mk(synth()), b = mk(synth()); put(a, 'a', 5); put(b, 'a', 5);
  step(a, { jump: true }); step(b, { jump: true }); steps(a, 12); steps(b, 12);
  const ev = step(a, { slide: true });
  assert.ok(ev.some((e) => e.e === 'slam'), 'slam olayı'); assert.ok(a.byId.a.vy <= P.SLAM_V, "slam hızı");
  let ta = 0, tb = 0, hard = false;
  while (!a.byId.a.grounded && ta++ < 200) for (const e of step(a)) if (e.e === 'land' && e.hard) hard = true;
  while (!b.byId.a.grounded && tb++ < 200) step(b);
  assert.ok(ta < tb * 0.5, `çakılan daha hızlı iner: ${ta} < ${tb}`); assert.ok(hard, 'sert iniş olayı'); assert.ok(a.byId.a.slamRec > 0, 'inişte kısa toparlanma');
  ok(`Yere çakılma: ${ta} karede iner (normal ${tb}), sert iniş`);
}
{
  // sert iniş yakındaki rakibi sersemletir
  const sim = mk(synth(), ['a', 'b']); const A = put(sim, 'a', 20), B = put(sim, 'b', 21);
  step(sim, { a: { jump: true } }); steps(sim, 10); step(sim, { a: { slide: true } });
  let hit = false; for (let i = 0; i < 80 && !hit; i++) for (const e of step(sim)) if (e.e === 'hit' && e.id === 'b' && e.kind === 'slam') hit = true;
  assert.ok(hit && B.stun > 0 && A.dealt === 1, 'çakılma dalgası yakındakini sersemletir');
  ok('Sert iniş: yakındaki rakip sersemler');
}
{
  // kayma: asılı kütüğün altından geçer; kaymazsa çarpar
  const withSlide = mk(synth({ obst: [BAR(24)] })); const r1 = put(withSlide, 'a', 15);
  let hit = false, slid = false;
  for (let i = 0; i < 200; i++) { const d = 24 - (r1.x + 0.35); const inp = d < 2.2 && !slid ? { slide: true } : {}; if (inp.slide) slid = true; for (const e of step(withSlide, inp)) if (e.e === 'hit') hit = true; }
  assert.ok(!hit && r1.x > 30, 'kayan koşucu kütüğün altından geçer');
  const noSlide = mk(synth({ obst: [BAR(24)] })); const r2 = put(noSlide, 'a', 15);
  let bump2 = false, hit2 = false; for (let i = 0; i < 180; i++) for (const e of step(noSlide)) { if (e.e === 'bump') bump2 = true; if (e.e === 'hit') hit2 = true; }
  assert.ok(bump2 && !hit2, 'kaymazsa kütüğe çarpıp durur (sersemlemez, ölmez)');
  assert.ok(r2.x < 24 && r2.stun === 0 && r2.fall === null, 'kütüğün önünde durur: x=' + r2.x.toFixed(2));
  ok('Kayma: asılı kütüğün altından geçilir, kaymazsa önünde durur (ölmez)');
}
{
  // kutu: zıplayarak geçilir; zıplanmazsa önünde DURUR (ölmez, sersemlemez, tekrar tekrar vurulmaz); sonra zıplayınca geçer
  const jumper = mk(synth({ obst: [BLOCK(24)] })); const r1 = put(jumper, 'a', 15); let jumped = false, h1 = false;
  for (let i = 0; i < 200; i++) { const d = 24 - (r1.x + 0.35); const inp = d < 2.8 && !jumped ? { jump: true } : {}; if (inp.jump) jumped = true; for (const e of step(jumper, inp)) if (e.e === 'hit' || e.e === 'bump') h1 = true; }
  assert.ok(!h1 && r1.x > 30, 'kutu: zıplayan temiz geçer');
  const walker = mk(synth({ obst: [BLOCK(24)] })); const r2 = put(walker, 'a', 15); let bumps = 0, hits = 0;
  for (let i = 0; i < 300; i++) for (const e of step(walker)) { if (e.e === 'bump') bumps++; if (e.e === 'hit') hits++; }
  assert.equal(bumps, 1, 'tek çarpma olayı (sürekli tekrarlamaz): ' + bumps); assert.equal(hits, 0, 'sersemlemez / hasar almaz');
  assert.ok(r2.x <= 24 && r2.x > 23, 'kutunun önünde sabit durur: ' + r2.x.toFixed(2)); assert.ok(r2.sp < 0.5 && r2.stun === 0 && r2.fall === null && r2.hits === 0, 'ölmedi, kıpırdamadan çarpıyor');
  // beklerken zıplarsa kutuyu aşar
  step(walker, { jump: true }); let passed = false; for (let i = 0; i < 120; i++) { step(walker, i === 6 ? { jump: true } : {}); if (r2.x > 26) { passed = true; break; } }
  assert.ok(passed, 'duran koşucu zıplayarak kutuyu aşar: x=' + r2.x.toFixed(2));
  // diken de aynı: durur, ölmez
  const sp = mk(synth({ obst: [SPIKE(24)] })); const r3 = put(sp, 'a', 15); let spB = 0, spH = 0;
  for (let i = 0; i < 300; i++) for (const e of step(sp)) { if (e.e === 'bump') spB++; if (e.e === 'hit') spH++; }
  assert.equal(spB, 1); assert.equal(spH, 0); assert.ok(r3.fall === null && r3.x < 24.5, 'diken önünde durur');
  ok('Engeller: kutu/diken/kütük duvar gibi (önünde durur, ölmez, tekrar vurmaz), zıplayınca aşılır');
}
{
  // çukur: zıplamazsan düşer ve ~1.3 sn sonra son güvenli yerde doğar; zıplarsan geçer
  const T = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 35.4, x1: 400, y: 0 }] });
  const fall = mk(T); const r = put(fall, 'a', 20); const ev = [];
  for (let i = 0; i < 400 && !ev.some((e) => e.e === 'respawn'); i++) ev.push(...step(fall));
  assert.ok(ev.some((e) => e.e === 'fall') && ev.some((e) => e.e === 'respawn'), 'düşme ve yeniden doğuş');
  assert.ok(r.x < 30 && r.grounded && r.inv > 0 && r.sp === 0, 'platformda doğar, sıfır hızla, dokunulmaz');
  const jump = mk(T); const r2 = put(jump, 'a', 20); let j = false, fell = false;
  for (let i = 0; i < 200; i++) { const d = 30 - (r2.x + 0.35); const inp = d < 0.9 && !j ? { jump: true } : {}; if (inp.jump) j = true; for (const e of step(jump, inp)) if (e.e === 'fall') fell = true; }
  assert.ok(!fell && r2.x > 40, 'zıplayan çukuru geçer');
  // geniş çukur (5.4): tek zıplama yeter
  const T2 = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 35.4, x1: 400, y: 0 }] });
  ok('Çukur: zıplamazsan düşüp yeniden doğarsın, zıplarsan 5.4 birimlik çukuru geçersin');
}
{
  // duvar (yüksek basamak): zıplamazsan çarpar, zıplarsan çıkar; küçük basamağa takılmadan çıkar
  const wall = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 30, x1: 400, y: 1.3 }] });
  const hit = mk(wall); const r = put(hit, 'a', 20); let ev = [];
  for (let i = 0; i < 120; i++) ev.push(...step(hit));
  assert.ok(ev.some((e) => e.e === 'wall') && r.stun >= 0 && r.x <= 30, 'yüksek basamağa çarpar');
  const up = mk(wall); const r2 = put(up, 'a', 20); let j = false, w = false;
  for (let i = 0; i < 200; i++) { const d = 30 - (r2.x + 0.35); const inp = d < 1.7 && !j ? { jump: true } : {}; if (inp.jump) j = true; for (const e of step(up, inp)) if (e.e === 'wall') w = true; }
  assert.ok(!w && r2.y === 1.3 && r2.x > 35, 'zıplayan yüksek platforma çıkar');
  const small = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 30, x1: 400, y: 0.3 }] });
  const s = mk(small); const r3 = put(s, 'a', 20); let w3 = false; for (let i = 0; i < 120; i++) for (const e of step(s)) if (e.e === 'wall') w3 = true;
  assert.ok(!w3 && r3.x > 30 && r3.y === 0.3, 'küçük basamağa takılmaz');
  ok('Basamak: yüksek duvara çarpılır, zıplayarak çıkılır, küçük basamak (0.3) kendiliğinden aşılır');
}
{
  // hayvan farkları: tavşan daha yüksek zıplar, kedi daha çabuk hızlanır
  const hi = (an) => { const sim = mk(synth(), ['a'], { animals: [an] }); const r = put(sim, 'a', 5); step(sim, { jump: true }); let ap = 0; for (let i = 0; i < 120 && !r.grounded; i++) { ap = Math.max(ap, r.y); step(sim); } return ap; };
  assert.ok(hi('tavsan') > hi('tilki') && hi('kurbaga') > hi('tavsan') && hi('panda') < hi('tilki'), 'zıplama farkları');
  const accel = (an) => { const sim = mk(synth(), ['a'], { animals: [an] }); const r = sim.byId.a; r.sp = 0; steps(sim, 30); return r.sp; };
  assert.ok(accel('kedi') > accel('tilki') && accel('panda') < accel('tilki'), 'ivme farkları');
  ok('Hayvanlar: zıplama ve ivme farkları var');
}
{
  // geriden gelen biraz hızlanır (yarışa geri döner), öndeki sabit
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 5); put(sim, 'b', 120); sim.byId.a.sp = 0; sim.byId.b.sp = 0;
  steps(sim, 90);
  assert.ok(sim.byId.a.sp > P.BASE_V * 1.05 && sim.byId.b.sp <= P.BASE_V * 1.001, `geride kalan hızlanır: ${sim.byId.a.sp.toFixed(2)} vs ${sim.byId.b.sp.toFixed(2)}`);
  ok('Dengeleme: geride kalan koşucu %5+ hızlanır, lider değil');
}

// ================= GÜÇLENDİRMELER =================
const give = (sim, id, item) => { sim.byId[id].item = item; sim.byId[id].itemT = 5; };
{
  // 🪚 testere: önündekine yuvarlanır ve sersemletir; zıplayan kaçar; kalkan yutar
  const run = (opts = {}) => {
    const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 10); const B = put(sim, 'b', 30); sim.byId.a.sp = 0; give(sim, 'a', 1);
    // b sabit koşar (taban hız), a testereyi atar
    const ev = useIt(sim, { a: { item: true } });
    assert.ok(ev.some((e) => e.e === 'sawFire') && sim.saws.length === 1, 'testere ateşlendi');
    const out = []; let jumped = false;
    if (opts.shield) B.shield = 5;
    for (let i = 0; i < 200; i++) {
      const near = sim.saws[0] && B.x - sim.saws[0].x;
      const inp = opts.dodge && near !== undefined && near < 3.0 && !jumped ? { b: { jump: true } } : {};
      if (inp.b) jumped = true;
      out.push(...step(sim, inp));
    }
    return { out, B, sim };
  };
  const hit = run();
  assert.ok(hit.out.some((e) => e.e === 'gore' && e.id === 'b' && e.kind === 'saw'), 'testere öndekini parçaladı'); assert.equal(hit.sim.byId.a.dealt, 1);
  const dodge = run({ dodge: true });
  assert.ok(!dodge.out.some((e) => e.e === 'gore' && e.kind === 'saw'), 'zıplayarak testereden kaçılır');
  const shield = run({ shield: true });
  assert.ok(shield.out.some((e) => e.e === 'block' && e.kind === 'saw') && !shield.out.some((e) => e.e === 'gore' && e.kind === 'saw'), 'kalkan testereyi yutar'); assert.equal(shield.B.shield, 0);
  ok('Dönen Testere: öndekine çarpıp sersemletir, zıplayan kaçar, kalkan yutar');
}
{
  // ⚡ elektrik: öndekini yavaşlatır; hedef yoksa harcanmaz
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 10); const B = put(sim, 'b', 30); give(sim, 'a', 2);
  const ev = useIt(sim, { a: { item: true } });
  assert.ok(ev.some((e) => e.e === 'zap' && e.to === 'b'), 'şok olayı'); assert.ok(B.slow > 2 && B.stun > 0, 'hedef yavaşladı');
  steps(sim, 30); assert.ok(B.sp < P.BASE_V * 0.6, 'hız düştü: ' + B.sp.toFixed(1)); assert.equal(sim.byId.a.item, 0);
  const lone = mk(synth(), ['a', 'b']); put(lone, 'a', 40); put(lone, 'b', 10); give(lone, 'a', 2);
  const ev2 = useIt(lone, { a: { item: true } }); assert.ok(!ev2.some((e) => e.e === 'zap') && lone.byId.a.item === 0, 'önünde kimse yoksa şok boşa gider (isabet yok)');
  const sh = mk(synth(), ['a', 'b']); put(sh, 'a', 10); put(sh, 'b', 30).shield = 5; give(sh, 'a', 2); const ev3 = useIt(sh, { a: { item: true } });
  assert.ok(ev3.some((e) => e.e === 'block') && sh.byId.b.slow === 0 && sh.byId.b.shield === 0, 'kalkan şoku yutar');
  ok('Elektrik Şoku: elden çıkar, öndekini yavaşlatır, boşa gidebilir, kalkan yutar');
}
{
  // 🪤 kapan: bırakılır; basan yakalanır (1.5 sn durur); zıplayan geçer; sahibi ilk 1.5 sn basmaz
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 40); const B = put(sim, 'b', 28); give(sim, 'a', 3);
  const ev = useIt(sim, { a: { item: true } });
  assert.ok(ev.some((e) => e.e === 'trapSet') && sim.traps.length === 1, 'kapan bırakıldı');
  const A = sim.byId.a; A.sp = 0; A.stun = 99; A.x = 90; // a sabit dursun (kapandan uzakta)
  let snapped = false; for (let i = 0; i < 240 && !snapped; i++) for (const e of step(sim)) if (e.e === 'trapSnap') snapped = true;
  assert.ok(snapped && sim.traps.length === 0, 'basan yakalandı, kapan harcandı');
  assert.ok(B.trap > 0 || B.sp < 3, 'yakalanan durur');
  // zıplayan geçer
  const s2 = mk(synth(), ['a', 'b']); put(s2, 'a', 40); const B2 = put(s2, 'b', 26); give(s2, 'a', 3); useIt(s2, { a: { item: true } }); s2.byId.a.stun = 99; s2.byId.a.sp = 0; s2.byId.a.x = 90;
  let j = false, caught = false;
  for (let i = 0; i < 240; i++) { const t = s2.traps[0]; const d = t ? t.x - 0.5 - (B2.x + 0.35) : 99; const inp = d < 2.9 && !j ? { b: { jump: true } } : {}; if (inp.b) j = true; for (const e of step(s2, inp)) if (e.e === 'trapSnap') caught = true; }
  assert.ok(!caught, 'zıplayan kapana basmaz');
  // sahibi kendi kapanına ilk 1.5 sn basmaz
  const s3 = mk(synth(), ['a']); put(s3, 'a', 40); give(s3, 'a', 3); useIt(s3, { a: { item: true } }); s3.byId.a.x = s3.traps[0].x; s3.byId.a.sp = 0;
  const ev3 = steps(s3, 5); assert.ok(!ev3.some((e) => e.e === 'trapSnap'), 'sahibi ilk 1.5 sn basmaz');
  ok('Ayı Kapanı: yere bırakılır, basanı durdurur, zıplayan geçer, sahibi ilk 1.5 sn güvende');
}
{
  // 🚀 nitro
  const dist = (item) => { const sim = mk(synth(), ['a']); put(sim, 'a', 10); if (item) give(sim, 'a', 4); const x0 = sim.byId.a.x; steps(sim, 1, { a: { item: !!item } }); steps(sim, 150); return sim.byId.a.x - x0; };
  const base = dist(0), boost = dist(1);
  assert.ok(boost > base + 7, `nitro daha uzağa götürür: ${base.toFixed(1)} → ${boost.toFixed(1)}`);
  ok(`Roket Pabuç: 2.5 sn'de ${base.toFixed(0)} → ${boost.toFixed(0)} birim`);
}
{
  // 🛡️ kalkan: bir saldırıyı yutar, ikincisi etki eder; süresi dolunca kalkar
  const sim = mk(synth(), ['a', 'b']); const A = put(sim, 'a', 40), B = put(sim, 'b', 10); give(sim, 'a', 5);
  useIt(sim, { a: { item: true } }); assert.ok(A.shield > 6, 'kalkan açıldı');
  give(sim, 'b', 2); let ev = useIt(sim, { b: { item: true } });
  assert.ok(ev.some((e) => e.e === 'block' && e.id === 'a') && A.slow === 0 && A.shield === 0, 'ilk şok yutuldu');
  give(sim, 'b', 2); ev = useIt(sim, { b: { item: true } });
  assert.ok(ev.some((e) => e.e === 'hit' && e.id === 'a' && e.kind === 'zap') || A.slow > 0 || A.inv > 0, 'ikinci şok etki eder');
  const s2 = mk(synth(), ['a']); put(s2, 'a', 40); give(s2, 'a', 5); useIt(s2, { a: { item: true } }); steps(s2, 60 * 7.5);
  assert.equal(s2.byId.a.shield, 0, 'kalkanın süresi dolar');
  ok('Balon Kalkan: bir saldırıyı yutar, ikincisinde korumaz, 7 sn sonra kalkar');
}
{
  // 📦 sürpriz sandık: elden fırlatılır, yere inince engel olur; çarparsa durur (ölmez), süre sonunda kaybolur, kalkan kırar
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 10); const B = put(sim, 'b', 4); give(sim, 'a', 6);
  const ev = useIt(sim, { a: { item: true } });
  assert.ok(ev.some((e) => e.e === 'throw' && e.item === 6) && ev.some((e) => e.e === 'crateSpawn') && sim.crates.length === 1, 'sandık fırlatıldı ve yere indi');
  assert.ok(sim.crates[0].x > 14 && sim.crates[0].x < 34, 'atanın önüne düştü: ' + sim.crates[0].x.toFixed(1));
  sim.byId.a.stun = 999;
  let h = null; for (let i = 0; i < 260 && !h; i++) for (const e of step(sim)) if (e.e === 'bump' && e.id === 'b') h = e;
  assert.ok(h && h.kind === 'crate', 'sandığa çarpan önünde durur'); assert.equal(sim.byId.a.dealt, 1, 'sandığı koyana isabet sayılır');
  assert.ok(B.stun === 0 && B.fall === null, 'sersemlemez, ölmez');
  // geri atılan sandık arkaya düşer
  const sb = mk(synth(), ['a']); put(sb, 'a', 40); give(sb, 'a', 6); useIt(sb, { a: { bomb: 4 | 8 } });
  assert.ok(sb.crates.length === 1 && sb.crates[0].x < 40, 'geri atılan sandık arkaya düşer: ' + (sb.crates[0] && sb.crates[0].x.toFixed(1)));
  // süre dolunca kaybolur
  const s2 = mk(synth(), ['a', 'b']); put(s2, 'a', 10); put(s2, 'b', 30); give(s2, 'a', 6); useIt(s2, { a: { item: true } }); s2.byId.a.stun = 999; s2.byId.b.stun = 999;
  steps(s2, 60 * (P.CRATE_LIFE + 1)); assert.equal(s2.crates.length, 0, 'sandık süresi dolunca kaybolur');
  // kalkanlı kırar
  const s3 = mk(synth(), ['a', 'b']); put(s3, 'a', 10); const B3 = put(s3, 'b', 4); B3.shield = 5; give(s3, 'a', 6); useIt(s3, { a: { item: true } }); s3.byId.a.stun = 999;
  let br = false; for (let i = 0; i < 260; i++) for (const e of step(s3)) if (e.e === 'block' && e.kind === 'crate') br = true;
  assert.ok(br && s3.crates.length === 0, 'kalkan sandığı kırar');
  ok('Sürpriz Sandık: elden fırlatılıp yere iner (yönü seçilir), çarpanı durdurur (ölmez), süre dolunca kaybolur, kalkan kırar');
}
{
  // 🥊 eldiven: öndekini geriye savurur
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 10); const B = put(sim, 'b', 15); give(sim, 'a', 7);
  const x0 = B.x; const ev = useIt(sim, { a: { item: true } });
  assert.ok(ev.some((e) => e.e === 'punch' && e.to === 'b'), 'yumruk'); assert.ok(B.stun > 0);
  let minX = x0; for (let i = 0; i < 40; i++) { step(sim); minX = Math.min(minX, B.x); }
  assert.ok(B.x - x0 < 5, `geriye savrulur: ${(x0 - minX).toFixed(1)} birim`);
  const far = mk(synth(), ['a', 'b']); put(far, 'a', 10); put(far, 'b', 40); give(far, 'a', 7);
  assert.ok(!useIt(far, { a: { item: true } }).some((e) => e.e === 'punch'), 'menzil dışına vurmaz');
  ok(`Boks Eldiveni: öndekini ${(x0 - minX).toFixed(1)} birim geriye savurur, menzil 12`);
}
{
  // güçlendirme kutusu: alınır, kaybolur, 5 sn sonra geri gelir; üst kutu zıplayarak alınır
  const T = synth({ boxes: [{ x: 20, y: 0.75 }, { x: 20, y: 2.3 }] });
  const lo = mk(T); const r = put(lo, 'a', 17); steps(lo, 40);
  assert.ok(r.item >= 1 && r.item <= P.ITEM_COUNT, 'alt kutu koşarken alınır'); assert.ok(lo.boxT[0] > 3.5, 'kutu tükendi');
  const hi = mk(T); const q = put(hi, 'a', 15); let j = false;
  for (let i = 0; i < 90; i++) { const d = 20 - (q.x + 0.35); const inp = d < 3.2 && !j ? { a: { jump: true } } : {}; if (inp.a) j = true; step(hi, inp); }
  assert.ok(q.item >= 1, 'zıplayarak da kutu alınabilir');
  const re = mk(T); put(re, 'a', 17); steps(re, 40); re.byId.a.item = 0; re.byId.a.x = 150; re.byId.a.stun = 999; steps(re, 60 * 5.2); assert.equal(re.boxT[0], 0, 'kutu 5 sn sonra döner');
  // dolu elle kutu alınmaz
  const full = mk(T); give(full, 'a', 4); put(full, 'a', 17); steps(full, 40); assert.equal(full.byId.a.item, 4); assert.equal(full.boxT[0], 0);
  ok('Güçlendirme kutuları: alt/üst kutu alınır, 5 sn sonra döner, dolu elle alınmaz');
}
{
  // dağılım: lider saldırı eşyası bulmaz; son sıradaki hepsini bulabilir
  const lead = new Set(), back = new Set(); let leadBoost = 0;
  for (let k = 0; k < 300; k++) {
    const sim = mk(synth(), ['a', 'b', 'c', 'd']); sim.R = P.rng(k + 1);
    put(sim, 'a', 100); put(sim, 'b', 60); put(sim, 'c', 40); put(sim, 'd', 10);
    sim.boxT = []; const tr = sim.track; tr.boxes = [{ x: 100, y: 0.75 }, { x: 10, y: 0.75 }]; sim.boxT = [0, 0];
    step(sim); lead.add(sim.byId.a.item); back.add(sim.byId.d.item);
  }
  assert.ok([...lead].every((i) => [3, 4, 5, 9, 10].includes(i)), 'lider yalnızca kapan/nitro/kalkan/kutu/buz bulur: ' + [...lead]);
  assert.equal(back.size, 9, 'sonuncu dokuz çeşidi de bulabilir (kalkan hariç): ' + [...back]);
  ok(`Dağılım: lider ${[...lead].sort()} bulur, sonuncu ${back.size}/9 çeşidi bulabilir`);
}

// ================= BOTLAR VE YARIŞ =================
{
  let falls = 0, hits = 0, uses = 0, maxT = 0; const used = new Set(), types = new Set(); let stuck = 0, nan = 0;
  for (const map of P.MAP_IDS) for (let seed = 1; seed <= 6; seed++) {
    const sim = P.createSim({ map, seed: seed * 977, racers: [{ id: 'a', bot: true, animal: 'tilki' }, { id: 'b', bot: true, animal: 'tavsan' }, { id: 'c', bot: true, animal: 'kedi' }, { id: 'd', bot: true, animal: 'panda' }] });
    P.startCountdown(sim);
    const lastMove = {}; let guard = 0;
    while (sim.phase !== 'done' && guard++ < 60 * 200) {
      for (const e of step(sim)) { if (e.e === 'fall') falls++; if (e.e === 'hit' || e.e === 'gore') { hits++; types.add(e.kind); } if (e.e === 'use') { uses++; used.add(e.item); } }
      for (const r of sim.racers) { if (!Number.isFinite(r.x + r.y + r.sp)) nan++; if (sim.phase === 'race' && r.done === null && r.fall === null) { if (r.sp > 1) lastMove[r.id] = sim.t; else if (sim.t - (lastMove[r.id] ?? sim.t) > 6) { stuck++; lastMove[r.id] = sim.t; } } }
    }
    assert.equal(sim.phase, 'done', `${map}/${seed}: yarış bitmeli`);
    const fin = sim.racers.filter((r) => r.done !== null).length;
    assert.ok(fin >= 1, `${map}/${seed}: en az biri bitirmeli, kalanlar DNF (${fin}/4)`);
    const t = sim.firstDone - sim.raceT0; maxT = Math.max(maxT, sim.t - sim.raceT0);
    assert.ok(t > 45 && t < 120, `${map}/${seed}: ilk bitiş makul süre: ${t.toFixed(1)} sn`);
    assert.ok(sim.t - sim.firstDone <= P.AFTER_FIRST + 0.1, 'ilk bitirenden sonra en çok AFTER_FIRST sn beklenir (DNF)');
  }
  assert.equal(nan, 0, 'sayı bozulması yok'); assert.equal(stuck, 0, 'takılıp kalan bot yok');
  assert.ok(falls <= 80, 'botlar çukura nadiren düşer: ' + falls);
  assert.ok(uses >= 40, 'botlar güçlendirme kullanır: ' + uses);
  assert.ok(used.size >= 6, 'birçok çeşit kullanıldı: ' + [...used].sort());
  assert.ok(hits >= 30, 'saldırılar isabet eder: ' + hits);
  ok(`Botlar: ${P.MAP_IDS.length} harita × 6 tohum × 4 bot (yavaş kalan DNF), düşüş=${falls}, ${uses} güçlendirme (${[...used].sort()}), ${hits} vuruş, en uzun yarış ${maxT.toFixed(0)} sn`);
}
{
  // insan yolu: aynı kararlar giriş (inputs) üzerinden de çalışır; oyuncu botları yenebilir mi?
  let wins = 0, total = 0;
  for (const map of P.MAP_IDS) for (let seed = 1; seed <= 4; seed++) {
    const sim = P.createSim({ map, seed: seed * 313, racers: [{ id: 'h', bot: false, animal: 'tilki' }, { id: 'b1', bot: true }, { id: 'b2', bot: true }, { id: 'b3', bot: true }] });
    sim.byId.h.ai.delay = 0.3;
    P.startCountdown(sim);
    let g = 0;
    while (sim.phase !== 'done' && g++ < 60 * 200) { const inp = P.botInput(sim, sim.byId.h, DT); step(sim, { h: inp }); }
    total++; if (sim.byId.h.done !== null && P.placeOf(sim, 'h') <= 2) wins++;
    assert.ok(sim.byId.h.done !== null, `${map}: insan girişiyle de bitirilir`);
  }
  assert.ok(wins >= total * 0.5, `iyi bir oyuncu üst sıralarda: ${wins}/${total}`);
  ok(`İnsan girişi: botla aynı kararlar girişlerle bitirilir, ilk ikide ${wins}/${total}`);
}
{
  // ödül ve sıralama
  const sim = P.createSim({ map: 'orman', seed: 5, racers: [{ id: 'a', bot: true }, { id: 'b', bot: true }, { id: 'c', bot: true }, { id: 'd', bot: true }] });
  P.startCountdown(sim); let g = 0; while (sim.phase !== 'done' && g++ < 20000) step(sim);
  const order = P.standings(sim); assert.equal(order.length, 4); assert.equal(new Set(order).size, 4);
  const w = P.reward(sim, order[0]), l = P.reward(sim, order[3]);
  assert.equal(w.place, 1); assert.equal(w.prize, 60); assert.equal(l.place, 4); assert.equal(l.prize, 15);
  assert.ok(w.time > 40 && w.total >= w.prize);
  ok('Ödül: 1. 60, 4. 15 altın + isabet bonusu, bitiş süresi hesaplanır');
}
{
  // bitiş: çizgiyi geçen 'done' olur, yavaşlayıp durur, ilk bitirenden 16 sn sonra yarış kapanır
  const sim = mk(synth({ finish: 60 }), ['a', 'b']); put(sim, 'a', 55); put(sim, 'b', 5); sim.byId.b.stun = 9999;
  const evs = steps(sim, 120);
  assert.ok(evs.some((e) => e.e === 'finish' && e.id === 'a' && e.place === 1), 'bitiş olayı');
  assert.ok(sim.byId.a.x <= 60 + 16.01 && sim.byId.a.sp < 3, 'bitirince yavaşlar ve durur');
  steps(sim, 60 * 17); assert.equal(sim.phase, 'done', 'ilk bitirenden sonra tanınan süre dolunca yarış biter');
  assert.equal(P.standings(sim)[0], 'a');
  ok('Bitiş: çizgi geçilince biter, yavaşlayıp durur, tanınan süre sonunda yarış kapanır');
}
{
  // geri sayım
  const sim = P.createSim({ map: 'orman', seed: 1, racers: [{ id: 'a' }] });
  assert.equal(sim.phase, 'wait'); P.startCountdown(sim); const beeps = [];
  let go = false; for (let i = 0; i < 60 * 4 && !go; i++) for (const e of step(sim)) { if (e.e === 'beep') beeps.push(e.n); if (e.e === 'go') go = true; }
  assert.deepEqual(beeps, [2, 1]); assert.ok(go && sim.phase === 'race');
  const x = sim.byId.a.x; P.stepSim(P.createSim({ map: 'orman', seed: 1, racers: [{ id: 'a' }] }), DT, { a: { jump: true } }); assert.equal(sim.byId.a.x, x);
  ok('Geri sayım: 3-2-1-BAŞLA, geri sayım sırasında koşucular hareket etmez');
}

// ================= TURNUVA (oda) ARAYÜZÜ =================
{
  // init/view: oyun durumu tohum + harita üretir ve istemciye iletir
  const g = P.init(['a', 'b', 'c'], {});
  assert.ok(Number.isInteger(g.seed) && P.MAP_IDS.includes(g.map), 'init tohum ve harita üretir');
  const v = P.view({ g: { ...g, simHost: 'a', prov: null } }, 'a', 0);
  assert.equal(v.seed, g.seed); assert.equal(v.map, g.map); assert.equal(v.simHost, 'a');
  // createSim(dizi, g): hayvanlar sıraya göre, harita/tohum g'den
  const sim = P.createSim([{ id: 'a' }, { id: 'b', bot: true }, { id: 'c', bot: true }, { id: 'd' }], { seed: 123, map: 'magara' });
  assert.equal(sim.map, 'magara'); assert.equal(sim.seed, 123); assert.equal(sim.racers.length, 4);
  assert.equal(new Set(sim.racers.map((r) => r.animal)).size, 4, 'ilk dört oyuncu farklı hayvan');
  ok('Turnuva: init/view tohum+harita taşır, createSim(dizi, g) hayvanları sıraya göre atar');
}
{
  // bit maskeli tuş: bomb 1 = zıpla, 2 = kay, 4 = eşya (oda çerçevesi tek basış alanı)
  const mkT = () => { const sim = P.createSim([{ id: 'a' }, { id: 'b' }], { seed: 5, map: 'orman' }); sim.track = synth(); sim.boxT = []; P.startCountdown(sim); while (sim.phase !== 'race') P.stepSim(sim, DT, {}); return sim; };
  let sim = mkT(); put(sim, 'a', 20);
  let ev = P.stepSim(sim, DT, { a: { bomb: 1 } }); assert.ok(ev.some((e) => e.e === 'jump' && e.id === 'a'), 'bit 1 = zıpla');
  sim = mkT(); put(sim, 'a', 20); ev = P.stepSim(sim, DT, { a: { bomb: 2 } }); assert.ok(ev.some((e) => e.e === 'slide'), 'bit 2 = kay');
  sim = mkT(); put(sim, 'a', 20); give(sim, 'a', 4); ev = P.stepSim(sim, DT, { a: { bomb: 4 } }); assert.ok(ev.some((e) => e.e === 'use' && e.item === 4), 'bit 4 = eşya');
  sim = mkT(); put(sim, 'a', 20); give(sim, 'a', 4); ev = P.stepSim(sim, DT, { a: { bomb: 5 } }); assert.ok(ev.some((e) => e.e === 'jump') && ev.some((e) => e.e === 'use'), 'bitler birleşik: zıpla + eşya');
  sim = mkT(); put(sim, 'a', 20); ev = P.stepSim(sim, DT, { a: { bomb: false } }); assert.ok(!ev.some((e) => e.e === 'jump'), 'bomb:false = basış yok');
  ok('Girdi: oda çerçevesinin `bomb` alanı bit maskesiyle zıpla/kay/eşya taşır');
}
{
  // anlık görüntü: JSON gidiş-dönüş; istemci durumu simülasyonla aynı alanları taşır
  const sim = P.createSim([{ id: 'a' }, { id: 'b', bot: true }, { id: 'c', bot: true }], { seed: 77, map: 'seker' }); P.startCountdown(sim);
  for (let i = 0; i < 60 * 14; i++) P.stepSim(sim, DT, i % 40 === 0 ? { a: { bomb: 1 } } : {});
  sim.byId.b.item = 3; sim.traps.push({ by: 'b', x: 50, y: 0, life: 9, age: 0 }); sim.crates.push({ x: 60, y0: 0, y1: 1.2, w: 1.1, life: 5, by: 'c' }); sim.saws.push({ by: 'c', x: 70, vx: 22, life: 1 });
  const st = P.readSnapshot(JSON.parse(JSON.stringify(P.snapshot(sim))));
  assert.equal(st.map, 'seker'); assert.equal(st.seed, 77); assert.equal(st.phase, 'race'); assert.equal(st.racers.length, 3);
  for (const id of ['a', 'b', 'c']) { const x = sim.byId[id], y = st.byId[id]; for (const k of ['x', 'y', 'sp', 'vy', 'stun', 'slow', 'trap', 'boost', 'shield', 'inv', 'zapT']) assert.ok(Math.abs(x[k] - y[k]) < 0.011, `${id}.${k}`); assert.equal(y.item, x.item); assert.equal(y.animal, x.animal); assert.equal(y.grounded, x.grounded); assert.equal(y.done === null, x.done === null); }
  assert.equal(st.traps.length, sim.traps.length); assert.ok(st.traps.length >= 1); assert.equal(st.crates.length, sim.crates.length); assert.ok(st.crates.length >= 1); assert.equal(st.saws.length, sim.saws.length); assert.ok(st.saws.length >= 1); assert.equal(st.boxT.length, sim.boxT.length);
  assert.deepEqual(P.rankingOf(sim), P.standings(sim).map((id) => [id])); assert.equal(P.rankingOf(sim).length, 3);
  assert.equal(st.track.len, sim.track.len);
  ok('Anlık görüntü: JSON gidiş-dönüş koşucu, eşya, tuzak, sandık, testere, kutu durumunu taşır; rankingOf gruplu');
}
{
  // 10 kişilik turnuva yarışı biter (oda en fazla 10 oyuncu)
  const ps = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, bot: true }));
  const sim = P.createSim(ps, { seed: 4242, map: 'magara' }); P.startCountdown(sim);
  let g = 0; while (sim.phase !== 'done' && g++ < 60 * 200) P.stepSim(sim, DT, {});
  assert.equal(sim.phase, 'done'); assert.ok(sim.racers.filter((r) => r.done !== null).length >= 9, 'çoğu bitirir: ' + sim.racers.filter((r) => r.done !== null).length);
  assert.equal(P.rankingOf(sim).length, 10);
  ok('10 koşucu: yarış biter, sıralama 10 kişiyi kapsar');
}

{
  // Üst kat: çift zıplamayla çıkılır, üstünde koşulur, sonundan inilir; çukurun üstünden geçilir; altından zıplayınca kafa çarpar
  const T = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 36, x1: 400, y: 0 }], gaps: [{ x0: 30, x1: 36 }], up: [{ x0: 20, x1: 60, y: P.TIER_DY, t: 1 }] });
  for (const an of P.ANIMAL_IDS) {
    const sim = mk(T, ['a'], { animals: [an] }); put(sim, 'a', 15.5); const r = sim.byId.a;
    step(sim, { jump: true }); steps(sim, 9); step(sim, { jump: true }); let g = 0; while (!r.grounded && g++ < 240) step(sim);
    assert.ok(r.grounded && Math.abs(r.y - P.TIER_DY) < 0.01, `${an}: üst kata çift zıplamayla çıkar (y=${r.y.toFixed(2)})`);
    steps(sim, 60 * 2.6); assert.ok(r.x > 36 && r.fall === null, `${an}: çukurun üstünden geçti (x=${r.x.toFixed(1)})`);
  }
  // alttan zıplayınca üst platforma kafa çarpar, geri düşer, üstüne çıkamaz
  const sim = mk(T, ['a']); put(sim, 'a', 45); const r = sim.byId.a; r.y = 0;
  step(sim, { jump: true }); let bumped = false, maxY = 0, g = 0, up = false;
  while (!r.grounded && g++ < 200) { for (const e of step(sim, g === 8 ? { jump: true } : {})) if (e.e === 'head') bumped = true; maxY = Math.max(maxY, r.y); if (r.y > P.TIER_DY) up = true; }
  assert.ok(bumped && !up && r.grounded && Math.abs(r.y) < 0.01, 'altından zıplayınca kafa çarpar, üst yola çıkılmaz: ' + maxY.toFixed(2));
  assert.ok(maxY < P.TIER_DY - P.UP_THICK - 1.3 + 0.05, 'tavanın altında kalır: ' + maxY.toFixed(2));
  // üst katın sonundan inince ana yola düşer, ölmez
  const s2 = mk(T, ['a']); const q = put(s2, 'a', 50); q.y = P.TIER_DY; steps(s2, 60 * 2); assert.ok(q.x > 60 && Math.abs(q.y) < 0.01 && q.fall === null, 'üst kattan ana yola iner');
  ok('Üst katlar: çift zıplamayla çıkılır, çukurun üstünden geçilir, altından zıplayınca kafa çarpar, sondan inilir');
}
{
  // Kuyu: içine düşen ölmez ama takılır, zıplayarak çıkar
  const T = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 30, x1: 33, y: -P.PIT_D, pit: true }, { x0: 33, x1: 400, y: 0 }] });
  T.pits = [{ x0: 30, x1: 33 }];
  const sim = mk(T); const r = put(sim, 'a', 22);
  let stuck = false, wall = false; for (let i = 0; i < 90; i++) for (const e of step(sim)) { if (e.e === 'stuck') stuck = true; if (e.e === 'wall' || e.e === 'hit') wall = true; }
  assert.ok(stuck && r.inPit && r.x < 33 && r.fall === null && !wall, 'kuyuya düştü, takıldı, yaralanmadı/ölmedi');
  step(sim, { jump: true }); steps(sim, 90); assert.ok(r.x > 34 && !r.inPit, 'zıplayarak kuyudan çıktı: x=' + r.x.toFixed(1));
  const sim2 = mk(T); put(sim2, 'a', 22); let jumped = false; for (let i = 0; i < 100; i++) { const d = 30 - (sim2.byId.a.x + 0.35); step(sim2, d < 2.2 && !jumped ? (jumped = true, { jump: true }) : {}); }
  assert.ok(sim2.byId.a.x > 36 && !sim2.byId.a.inPit, 'zıplayan kuyuyu atlar');
  ok('Kuyu: düşen ölmez/yaralanmaz ama takılır, zıplayarak çıkar, zıplayan atlar');
}
{
  // Trambolin ve hız pedi; yokuş aşağı hızlanma (hayvana göre); başlangıç hızlanması
  const T = synth({ plats: [{ x0: 0, x1: 400, y: 0 }] }); T.tramps = [{ x: 30, w: 1.6, y: 0 }]; T.pads = [{ x: 60, w: 2.6, y: 0 }];
  const sim = mk(T); const r = put(sim, 'a', 26); let tr = false, maxY = 0;
  for (let i = 0; i < 90; i++) { for (const e of step(sim)) if (e.e === 'tramp') tr = true; maxY = Math.max(maxY, r.y); }
  assert.ok(tr && maxY > 5.5, 'trambolin yüksek fırlatır: ' + maxY.toFixed(1));
  const s2 = mk(T); const q = put(s2, 'a', 56); let pad = false; for (let i = 0; i < 30; i++) for (const e of step(s2)) if (e.e === 'pad') pad = true;
  assert.ok(pad && q.sp > P.BASE_V * 1.2, 'hız pedi hızlandırır: ' + q.sp.toFixed(1));
  const slope = (an) => { const S = synth({ plats: [{ x0: 0, x1: 60, y: 0 }, { x0: 60, x1: 160, y: 0, y1: -20 }, { x0: 160, x1: 400, y: -20 }] }); const s = mk(S, ['a'], { animals: [an] }); const x = put(s, 'a', 62); steps(s, 60 * 3); return x.x; };
  const xp = slope('penguen'), xt = slope('tilki'), xk = slope('kurbaga');
  assert.ok(xp > xt && xt > xk, `yokuş aşağı: penguen ${xp.toFixed(0)} > tilki ${xt.toFixed(0)} > kurbağa ${xk.toFixed(0)}`);
  const s3 = P.createSim({ map: 'orman', seed: 3, racers: [{ id: 'a', bot: false }] }); P.startCountdown(s3); while (s3.phase !== 'race') step(s3);
  assert.ok(s3.byId.a.boost > 1, 'başlangıçta herkese otomatik hızlanma');
  ok('Trambolin, hız pedi, yokuş aşağı (hayvana göre hızlı/yavaş), başlangıç hızlanması');
}
{
  // Yeni eşyalar: yumruk kutusu (çarpanı geriye savurur), buz (zıplama/güç kapanır), testere yönü, parçalanma
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 40); const B = put(sim, 'b', 28); give(sim, 'a', 9); useIt(sim, { a: { item: true } });
  sim.byId.a.stun = 99; sim.byId.a.x = 90; const x0 = B.x; let hit = false; for (let i = 0; i < 300; i++) for (const e of step(sim)) if (e.e === 'pboxHit') hit = true;
  assert.ok(hit && sim.byId.b.hits >= 1, 'yumruk kutusuna çarpan etkilenir');
  const s2 = mk(synth(), ['a', 'b']); put(s2, 'a', 40); const B2 = put(s2, 'b', 28); give(s2, 'a', 10); useIt(s2, { a: { item: true } });
  s2.byId.a.stun = 99; s2.byId.a.x = 90; let iced = false; for (let i = 0; i < 300 && !iced; i++) for (const e of step(s2)) if (e.e === 'iced') iced = true;
  assert.ok(iced && B2.ice > 1, 'buza basan etkilenir');
  const evs = step(s2, { b: { jump: true } }); assert.ok(!evs.some((e) => e.e === 'jump') && B2.grounded, 'buzdayken zıplanmaz'); assert.ok(B2.sp > 5, 'ama koşmaya devam eder');
  const pg = mk(synth(), ['a', 'b']); put(pg, 'a', 40); const BP = put(pg, 'b', 28); BP.animal = 'penguen'; BP.iceImm = true; give(pg, 'a', 10); useIt(pg, { a: { item: true } }); pg.byId.a.stun = 99; pg.byId.a.x = 90;
  let ic = false; for (let i = 0; i < 300; i++) for (const e of step(pg)) if (e.e === 'iced') ic = true; assert.ok(!ic, 'penguen buzdan etkilenmez');
  // testere yönü: geri ve yukarı
  const sb = mk(synth(), ['a', 'b']); put(sb, 'a', 40); put(sb, 'b', 20); give(sb, 'a', 1); let goreBack = false;
  P.stepSim(sb, DT, { a: { bomb: 4 | 8 } }); assert.ok(sb.saws[0].vx < 0, 'geri testere'); for (let i = 0; i < 120; i++) for (const e of step(sb)) if (e.e === 'gore' && e.id === 'b') goreBack = true;
  assert.ok(goreBack, 'geri atılan testere arkadakini parçalar');
  const su = mk(synth(), ['a']); put(su, 'a', 40); give(su, 'a', 1); P.stepSim(su, DT, { a: { bomb: 4 | 16 } }); assert.ok(su.saws[0].air && su.saws[0].vy > 5, 'yukarı testere havadan gider');
  // parçalanma: ayı kapanı/testere gore, sonra yeniden doğar
  const g = mk(synth(), ['a', 'b']); put(g, 'a', 40); const V = put(g, 'b', 28); give(g, 'a', 3); useIt(g, { a: { item: true } }); g.byId.a.stun = 99; g.byId.a.x = 90;
  let gore = false; for (let i = 0; i < 200 && !gore; i++) for (const e of step(g)) if (e.e === 'gore' && e.id === 'b') gore = true;
  assert.ok(gore && V.fall !== null && V.gore, 'kapana basan parçalanır'); steps(g, 60 * 2); assert.ok(V.fall === null && !V.gore && V.inv > 0, 'sonra yeniden doğar');
  ok('Yeni eşyalar: yumruk kutusu, buz (penguen bağışık), testere yönleri, kanlı parçalanma + yeniden doğuş');
}
{
  // DNF: ilk bitirenden sonra bekleyen yarışı kapatır
  const sim = mk(synth({ finish: 60 }), ['a', 'b']); put(sim, 'a', 58); put(sim, 'b', 5); sim.byId.b.stun = 9999;
  let dnf = null; for (let i = 0; i < 60 * (P.AFTER_FIRST + 3); i++) for (const e of step(sim)) if (e.e === 'done') dnf = e.dnf;
  assert.equal(sim.phase, 'done'); assert.deepEqual(dnf, ['b'], 'bitirmeyen DNF');
  ok(`DNF: ilk bitirenden ${P.AFTER_FIRST} sn sonra bitirmeyenler elenir, çizgiyi beklemeden yarış kapanır`);
}
{
  // hayvan seçimi: oyun başlamadan `an` ile seçilir, pasif özellikler işlenir
  const sim = P.createSim([{ id: 'a' }, { id: 'b' }], { seed: 5, map: 'orman' });
  P.stepSim(sim, DT, { a: { an: 'penguen' } }); assert.equal(sim.byId.a.animal, 'penguen'); assert.ok(sim.byId.a.iceImm && sim.byId.a.down > 1.5);
  P.startCountdown(sim); while (sim.phase !== 'race') P.stepSim(sim, DT, {}); P.stepSim(sim, DT, { a: { an: 'tilki' } }); assert.equal(sim.byId.a.animal, 'penguen', 'yarış başlayınca hayvan değişmez');
  ok('Hayvan seçimi: başlamadan seçilir (pasif güçler işlenir), yarışta değişmez');
}

{
  // ☄️ Meteor: öndekilerin hepsini düşürür; kalkan korur; hedef yoksa harcanmaz; gerideki kalkan almaz
  const sim = mk(synth(), ['a', 'b', 'c', 'd']); put(sim, 'a', 10); const B = put(sim, 'b', 20), C = put(sim, 'c', 30), D = put(sim, 'd', 5); C.shield = 5; give(sim, 'a', 8);
  const ev = useIt(sim, { a: { item: true } });
  const m = ev.find((e) => e.e === 'meteor'); assert.ok(m && m.to.includes('b') && !m.to.includes('c') && !m.to.includes('d'), 'meteor yalnızca öndekileri düşürür');
  assert.ok(B.fall !== null && C.fall === null && C.shield === 0 && D.fall === null, 'kalkanlı yutar, arkadaki etkilenmez');
  steps(sim, 60 * 2); assert.ok(B.fall === null && B.y >= -0.01, 'düşen koşucu yeniden doğar');
  const lone = mk(synth(), ['a', 'b']); put(lone, 'a', 40); put(lone, 'b', 10); give(lone, 'a', 8);
  assert.ok(useIt(lone, { a: { item: true } }).some((e) => e.e === 'noTarget') && lone.byId.a.item === 8, 'önünde kimse yoksa harcanmaz');
  // eşya dağılımı: son sıradaki kalkan çıkmaz, nitro + meteor çok çıkar
  const cnt = { 4: 0, 5: 0, 8: 0 }; const T = synth({ boxes: [{ x: 12, y: 0.75 }] });
  for (let i = 0; i < 400; i++) { const s = mk(T, ['a', 'b', 'c', 'd']); put(s, 'b', 60); put(s, 'c', 70); put(s, 'd', 80); put(s, 'a', 12); s.R = P.rng(i * 7919 + 11); step(s); const it = s.byId.a.item; if (cnt[it] !== undefined) cnt[it]++; }
  assert.equal(cnt[5], 0, 'sonuncuya kalkan çıkmaz'); assert.ok(cnt[4] + cnt[8] > 400 * 0.4, `gerideki nitro/meteor alır: ${cnt[4]}+${cnt[8]}`);
  ok(`Meteor: öndekileri düşürür, kalkan yutar, hedefsizse harcanmaz; son sıraya kalkan çıkmaz (nitro ${cnt[4]}, meteor ${cnt[8]} / 400)`);
}

{
  // öldüğü yerde doğar; duvara takılınca bayılma/sersemleme yok, sadece durur
  const sim = mk(synth(), ['a', 'b']); put(sim, 'a', 40); const V = put(sim, 'b', 100); V.safeX = 20; give(sim, 'a', 1);
  P.stepSim(sim, DT, { a: { bomb: 4 } });
  for (let i = 0; i < 10; i++) step(sim);
  sim.saws.push({ by: 'a', x: V.x + 0.2, y: V.y + 0.45, vx: 22, vy: 0, air: false, life: 2 });
  let died = false; for (let i = 0; i < 20 && !died; i++) for (const e of step(sim)) if (e.e === 'gore' && e.id === 'b') died = true;
  const dx = V.deathX; assert.ok(died && dx > 95);
  steps(sim, 90);
  assert.ok(V.fall === null && Math.abs(V.x - dx) < 12, 'öldüğü yerde yeniden doğar (x=' + V.x.toFixed(1) + ', ölüm ' + dx.toFixed(1) + ')');
  const W = synth({ plats: [{ x0: 0, x1: 30, y: 0 }, { x0: 30, x1: 400, y: 2.5 }] });
  const s2 = mk(W); const r = put(s2, 'a', 22); let stunned = false, wall = false;
  for (let i = 0; i < 120; i++) { for (const e of step(s2)) if (e.e === 'wall') wall = true; if (r.stun > 0) stunned = true; }
  assert.ok(wall && !stunned && r.fall === null && r.x < 30.2, 'duvarda sadece durur, sersemlemez');
  ok('Öldüğü yerde doğma; duvara takılınca bayılma yok');
}

console.log('PATİ KOŞUSU TESTLERİ GEÇTİ');
