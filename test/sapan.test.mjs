// Sapan Arenası (iç ad: lazer) sunucu tarafı testleri: isimler, kavis geometrisi, yürüme sınırları,
// uçuş süresi/zaman planı, normalize, çözümleme (itme zinciri, düşme, eleme)
import assert from 'node:assert/strict';
import * as L from '../public/games/lazer.js';

const ok = (m) => console.log('✓ ' + m);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const randFrom = (seq) => { let i = 0; return () => seq[i++ % seq.length]; };

// ---------- Kimlik ----------
assert.equal(L.KIND, 'lazer');
assert.equal(L.TITLE, 'Sapan Arenası');
assert.equal(L.EMOJI, '🪨');
assert.ok(Array.isArray(L.RULES) && L.RULES.length === 3 && L.RULES.every((r) => typeof r === 'string' && r.length > 10));
ok('Kimlik: KIND lazer kaldı, başlık/emoji/kurallar sapana göre');

// ---------- Alan ölçeği ----------
assert.equal(L.arenaScale(1), 1);
for (let r = 2; r <= 40; r++) assert.ok(L.arenaScale(r) <= L.arenaScale(r - 1));
for (let r = 2; r <= 10; r++) assert.ok(L.arenaScale(r) < L.arenaScale(r - 1));
assert.equal(L.arenaScale(60), L.MIN_SCALE);
ok('Alan ölçeği: azalan, tabanı MIN_SCALE');

// ---------- Platform geometrisi / yürüme ----------
for (const sc of [1, 0.6, L.MIN_SCALE]) {
  // Çok uzağa yürümeye çalışmak platformun içinde (pay bırakarak) kalır
  let p = { x: 0, y: 0 };
  for (let i = 0; i < 200; i++) p = L.walk(p.x, p.y, 0.05, 0.03, sc);
  assert.ok(L.onPlatform(p.x, p.y, sc));
  assert.ok(L.onPlatform(p.x + L.BODY_R * 0.99, p.y, sc) || L.onPlatform(p.x - L.BODY_R * 0.99, p.y, sc));
  const lim = L.APOTHEM * sc - L.BODY_R - 0.01;
  assert.ok(Math.hypot(p.x, p.y) <= L.APOTHEM * sc - L.BODY_R - 0.01 + 1e-9 || Math.abs(p.x) <= lim + 1e-9);
  // Küçük adım serbestçe uygulanır
  const q = L.walk(0, 0, 0.02, -0.01, sc);
  assert.ok(near(q.x, 0.02) && near(q.y, -0.01));
  // Dışarıdaki nokta içeri çekilir
  const c = L.clampInside(5, -5, L.BODY_R + 0.01, sc);
  assert.ok(L.onPlatform(c.x, c.y, sc));
}
ok('Yürüme: walk() platformun içinde kalır, küçük adımlar serbest');

{
  const w = L.wallHit(0, 0, 0, 1);
  assert.ok(near(w.x, L.APOTHEM) && near(w.y, 0) && near(w.t, L.APOTHEM));
  assert.ok(L.onPlatform(w.x - 1e-6, w.y, 1) && !L.onPlatform(w.x + 1e-6, w.y, 1));
  const w2 = L.wallHit(0.3, 0.1, Math.PI, 0.5);
  assert.ok(near(w2.x, -L.APOTHEM * 0.5) && near(w2.y, 0.1));
  const r = L.castShot(-0.6, 0, 0, [{ id: 'far', x: 0.4, y: 0 }, { id: 'near', x: -0.2, y: 0.03 }, { id: 'behind', x: -0.9, y: 0 }, { id: 'side', x: 0, y: 0.3 }], 1);
  assert.equal(r.hit, 'near');
  assert.ok(r.x < -0.2 && r.x > -0.6);
  assert.equal(L.castShot(0, 0, Math.PI / 2, [{ id: 'a', x: 0.5, y: 0 }], 1).hit, null);
}
ok('Geometri: wallHit kenarda biter, castShot hattaki en yakın oyuncuyu bulur');

// ---------- Taş kavisi (görsel geometri, sunucu + istemci ortak) ----------
{
  const s = { x1: -0.5, y1: 0, x2: 0.5, y2: 0 };
  const d = L.shotDist(s);
  assert.ok(near(d, 1));
  const p0 = L.arcPoint(s.x1, s.y1, s.x2, s.y2, 0), p1 = L.arcPoint(s.x1, s.y1, s.x2, s.y2, 1), pm = L.arcPoint(s.x1, s.y1, s.x2, s.y2, 0.5);
  assert.ok(near(p0.z, L.STONE_H) && near(p1.z, L.STONE_H) && near(p0.x, -0.5) && near(p1.x, 0.5));
  assert.ok(near(pm.z, L.STONE_H + L.arcHeight(d)) && near(pm.x, 0));
  // Iskalayan taş yerde (zEnd=0) biter; taş dümdüz gider (lazer gibi): hiçbir noktada fırlatma yüksekliğini aşmaz
  const pe = L.arcPoint(s.x1, s.y1, s.x2, s.y2, 1, 0);
  assert.ok(near(pe.z, 0));
  let zmax = -1;
  for (let k = 0; k <= 1; k += 0.01) zmax = Math.max(zmax, L.arcPoint(s.x1, s.y1, s.x2, s.y2, k).z);
  assert.ok(near(zmax, L.STONE_H), 'düz uçuş');
  assert.equal(L.arcHeight(1.5), 0);
  // Menzil: hattaki oyuncu menzilin ötesindeyse vurulmaz, taş menzilin sonunda düşer
  const tg = [{ id: 'b', x: 0.6, y: 0 }];
  assert.equal(L.castShot(-0.5, 0, 0, tg, 1, 0.5).hit, null);
  assert.ok(near(L.castShot(-0.5, 0, 0, tg, 1, 0.5).x, 0));
  assert.equal(L.castShot(-0.5, 0, 0, tg, 1, 1.5).hit, 'b');
  assert.equal(L.castShot(-0.5, 0, 0, [], 1).x > 0.9, true, 'menzilsiz atış kenara kadar');
  assert.equal(L.cleanRange(undefined), L.MAX_RANGE); assert.equal(L.cleanRange(0), L.MIN_RANGE); assert.equal(L.cleanRange(99), L.MAX_RANGE);
  // Uçuş süresi mesafeyle artar ve sınırlı kalır
  let prev = 0;
  for (let dist = 0; dist <= 2; dist += 0.1) {
    const f = L.flightMs({ x1: 0, y1: 0, x2: dist, y2: 0 });
    assert.ok(f >= prev && f >= 220 && f <= 900);
    prev = f;
  }
  assert.equal(L.flightMs({ x1: 0, y1: 0, x2: 0, y2: 0 }), 220);
  assert.equal(L.flightMs({ x1: 0, y1: 0, x2: 3, y2: 0 }), 900);
}
ok('Kavis: uçlar fırlatma yüksekliğinde, tepe ortada, uçuş süresi mesafeyle uzar');

// ---------- Zaman planı ----------
{
  const miss = { x1: 0, y1: 0, x2: 0.5, y2: 0, hit: null, moves: [] };
  const pm = L.shotPlan(miss);
  assert.equal(pm.fly, L.flightMs(miss));
  assert.equal(pm.dur, pm.fly + 700);
  assert.deepEqual(pm.moves, []);
  const hit = { x1: 0, y1: 0, x2: 0.3, y2: 0, hit: 'b', moves: [{ id: 'b', fx: 0.3, fy: 0, tx: 0.55, ty: 0, fell: false }, { id: 'c', fx: 0.68, fy: 0, tx: 0.9, ty: 0, fell: true }] };
  const ph = L.shotPlan(hit);
  assert.equal(ph.moves[0].t0, ph.fly);            // ilk kayma taş çarpınca başlar
  assert.equal(ph.moves[1].t0, ph.moves[0].t1);    // zincir ardışık
  assert.ok(ph.moves[1].t1 - ph.moves[1].t0 >= 160);
  assert.equal(ph.dur, ph.moves[1].t1 + L.FALL_MS + 450);
  assert.equal(L.revealMs([miss, hit]), L.INTRO_MS + pm.dur + ph.dur + L.OUTRO_MS);
  assert.equal(L.shotDur(hit), ph.dur);
}
ok('Zaman planı: kayma uçuş bitince başlar, revealMs toplamı tutarlı');

// ---------- normalize ----------
{
  const d = { round: 3 };
  assert.throws(() => L.normalize(d, 'p', { x: 'abc', y: 0, a: 0 }));
  assert.throws(() => L.normalize(d, 'p', { x: 0, y: 0 }));
  const n = L.normalize(d, 'p', { x: '9', y: '-9', a: '1.5' });
  assert.ok(L.onPlatform(n.x, n.y, L.arenaScale(3)));
  assert.equal(n.a, 1.5);
  const inside = L.normalize(d, 'p', { x: 0.1, y: 0.1, a: 0 });
  assert.ok(near(inside.x, 0.1) && near(inside.y, 0.1));
}
ok('normalize: geçersiz girdi reddedilir, konum tur ölçeğine göre içeri çekilir');

// ---------- auto / randomInside ----------
for (let round = 1; round <= 20; round++) {
  const sc = L.arenaScale(round);
  const d = { round, g: L.init(['a', 'b', 'c']), history: [] };
  for (let i = 0; i < 30; i++) {
    const act = L.auto(d, 'a', true);
    assert.ok(L.onPlatform(act.x, act.y, sc) && Number.isFinite(act.a));
    const p = L.randomInside(Math.random, sc);
    assert.ok(L.onPlatform(p.x, p.y, sc));
  }
}
{
  const d = { round: 2, g: L.init(['a', 'b']), history: [{ placements: { b: { x: 0.4, y: 0.4, a: 0 } } }] };
  for (let i = 0; i < 20; i++) { const act = L.auto(d, 'a', true); assert.ok(L.onPlatform(act.x, act.y, L.arenaScale(2))); }
}
ok('auto: bot hamlesi her turda platformun içinde');

// ---------- resolve: itme zinciri, düşme, eleme ----------
{
  const ids = ['A', 'B', 'C'];
  const d = { round: 1, g: L.init(ids), history: [] };
  const r = L.resolve(d, { A: { x: -0.6, y: 0, a: 0 }, B: { x: -0.3, y: 0, a: Math.PI / 2 }, C: { x: -0.1, y: 0, a: -Math.PI / 2 } });
  const e = r.entry;
  assert.equal(e.scale, 1);
  assert.deepEqual([...e.order].sort(), ids);
  assert.equal(e.shots.length, 3);
  const sa = e.shots.find((s) => s.by === 'A');
  assert.equal(sa.hit, 'B');
  assert.deepEqual(sa.moves.map((m) => m.id), ['B', 'C']);
  assert.ok(sa.moves.every((m) => !m.fell));
  assert.ok(sa.moves[0].tx > sa.moves[0].fx && sa.moves[1].tx > sa.moves[1].fx);   // atış yönünde itildiler
  assert.ok(near(sa.x1, -0.6) && near(sa.y1, 0) && sa.x2 > -0.6 && sa.x2 < -0.3);  // taş B'nin gövdesine çarptı
  for (const s of e.shots) { assert.ok(['A', 'B', 'C'].includes(s.by)); assert.ok(Number.isFinite(s.x2) && Number.isFinite(s.y2)); }
  assert.equal(r.dur, L.revealMs(e.shots));
  assert.deepEqual(d.g.alive, { A: true, B: true, C: true });
  assert.equal(L.ranking(d, ids), null);
}
{
  // Kenardaki oyuncu itilince düşer ve elenir; aynı anda düşenler aynı grupta
  const ids = ['A', 'B'];
  const d = { round: 1, g: L.init(ids), history: [] };
  const edge = L.APOTHEM - L.BODY_R - 0.02;
  const r = L.resolve(d, { A: { x: edge - 0.3, y: 0, a: 0 }, B: { x: edge, y: 0, a: Math.PI / 2 } });
  const sa = r.entry.shots.find((s) => s.by === 'A');
  assert.equal(sa.hit, 'B');
  assert.equal(sa.moves.length, 1);
  assert.ok(sa.moves[0].fell && !L.onPlatform(sa.moves[0].tx, sa.moves[0].ty, 1));
  assert.equal(d.g.alive.B, false);
  assert.deepEqual(d.g.outs, [['B']]);
  assert.deepEqual(L.ranking(d, ids), [['A'], ['B']]);
  // Sırası gelmeden düşen atış yapmaz
  if (r.entry.order[0] === 'A') assert.equal(r.entry.shots.length, 1);
  assert.deepEqual(L.view(d), { alive: { A: true, B: false }, scale: 1 });
}
{
  // Üst üste yerleşenler ayrılır
  const d = { round: 4, g: L.init(['A', 'B']), history: [] };
  const r = L.resolve(d, { A: { x: 0, y: 0, a: 1 }, B: { x: 0, y: 0, a: 2 } });
  const pa = r.entry.placements.A, pb = r.entry.placements.B;
  assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= L.BODY_R * 2 - 1e-6);
  assert.ok(L.onPlatform(pa.x, pa.y, L.arenaScale(4)) && L.onPlatform(pb.x, pb.y, L.arenaScale(4)));
  assert.equal(r.entry.scale, L.arenaScale(4));
}
ok('resolve: bilardo zinciri [B, C], kenardan düşen elenir, çakışanlar ayrılır');

console.log('Sapan Arenası testleri tamam');
