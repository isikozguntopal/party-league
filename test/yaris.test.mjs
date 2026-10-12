// Pist Canavarı: üretilen pist, köprü, uçurum/yeniden doğuş, botlar, anlık görüntü
// Çalıştır: node test/yaris.test.mjs
import assert from 'node:assert/strict';
import * as Y from '../public/games/yaris.js';

const ok = (m) => console.log('✓ ' + m);
const step = (sim, inp = {}) => Y.stepSim(sim, 1 / 30, inp);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

// ---------- Tohumdan belirlenimci pist ----------
{
  const a = Y.buildTrack(4242);
  const Y2 = await import('../public/games/yaris.js?fresh=' + Date.now()); // ayrı modül örneği (önbelleksiz)
  const b = Y2.buildTrack(4242);
  assert.equal(a.n, b.n);
  assert.deepEqual(a.pts, b.pts);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.grid, b.grid);
  assert.equal(a.bridge.s, b.bridge.s);
  const c = Y.buildTrack(4243);
  assert.notDeepEqual(a.pts.slice(0, 20), c.pts.slice(0, 20), 'farklı tohum → farklı pist');
  assert.ok(a.length > 80 && a.length < 140, 'tur uzunluğu makul: ' + a.length);
  // başlangıç yukarı bakar, ızgara pistte
  assert.ok(angDiff(a.pointAt(0).a, -Math.PI / 2) < 0.01, 'başlangıç yönü yukarı');
  for (const [x, y] of a.grid) assert.ok(Math.abs(a.nearest(x, y).d) <= Y.HALF_W, 'ızgara asfaltta');
  ok('Pist: aynı tohum → aynı pist (ayrı modül örneğinde de), farklı tohum → farklı pist');
}

// ---------- Köprü ----------
{
  for (const seed of [1, 7, 99, 1234, 777777]) {
    const tr = Y.buildTrack(seed);
    const br = tr.bridge;
    const up = tr.pointAt(br.s), low = tr.pointAt(br.lowS);
    assert.ok(Math.hypot(up.x - br.x, up.y - br.y) < 0.6, 'üst şerit kesişme noktasından geçer');
    assert.ok(Math.hypot(low.x - br.x, low.y - br.y) < 0.6, 'alt şerit kesişme noktasından geçer');
    assert.equal(tr.elev(br.s), Y.BRIDGE_H, 'köprü üstü yüksek');
    assert.equal(tr.elev(br.lowS), 0, 'alt yol yerde');
    assert.equal(tr.elev(br.s0 - 0.1), 0); assert.equal(tr.elev(br.s1 + 0.1), 0);
    assert.ok(tr.elev(br.s0 + Y.BRIDGE_RAMP / 2) > 0.3 && tr.elev(br.s0 + Y.BRIDGE_RAMP / 2) < Y.BRIDGE_H - 0.3, 'rampa kademeli');
    let ang = angDiff(up.a, low.a); if (ang > Math.PI / 2) ang = Math.PI - ang;
    assert.ok(ang > Math.PI * 0.3, 'kesişme yeterince dik: ' + (ang * 180 / Math.PI).toFixed(0));
    // yerel arama kesişmede şerit karıştırmaz
    assert.ok(Math.abs(tr.locate(br.x, br.y, br.s).s - br.s) < 0.5);
    assert.ok(Math.abs(tr.locate(br.x, br.y, br.lowS).s - br.lowS) < 0.5);
  }
  ok('Köprü: her pistte tek kesişme, üst şerit yükselir/alçalır, alt şerit yerde, yerel konumlama şeridi karıştırmaz');
}

// ---------- Köprü üstü / altı çarpışmaz ----------
{
  const sim = Y.createSim([{ id: 'u' }, { id: 'l' }], { seed: 55 });
  const tr = sim.track, br = tr.bridge;
  const up = tr.pointAt(br.s), low = tr.pointAt(br.lowS);
  Object.assign(sim.cars.u, { x: up.x, y: up.y, h: up.a, s: br.s, safeS: br.s, z: Y.BRIDGE_H });
  Object.assign(sim.cars.l, { x: low.x, y: low.y, h: low.a, s: br.lowS, safeS: br.lowS, z: 0 });
  Y.startCountdown(sim);
  step(sim);
  assert.ok(Math.hypot(sim.cars.u.x - up.x, sim.cars.u.y - up.y) < 0.05 && Math.hypot(sim.cars.l.x - low.x, sim.cars.l.y - low.y) < 0.05, 'farklı seviyeler birbirini itmez');
  assert.equal(sim.cars.u.fall, null); assert.equal(sim.cars.l.fall, null);
  ok('Çarpışma: köprü üstündeki ve altındaki arabalar birbirine çarpmaz');
}

// ---------- Uçurum ve yeniden doğuş ----------
{
  const sim = Y.createSim([{ id: 'h' }], { seed: 31 });
  Y.startCountdown(sim);
  const c = sim.cars.h;
  const evs = [];
  let n = 0;
  while (c.fall === null && n++ < 600) for (const e of step(sim, { h: { gas: true, steer: 1 } })) evs.push(e);
  assert.ok(evs.some((e) => e.e === 'fall'), 'tam kilit direksiyon + gaz → uçurumdan düşer');
  assert.ok(Math.abs(c.d) > Y.FALL_LIMIT - 0.3, 'düşerken kenarın ötesinde');
  const fx = c.x, fy = c.y;
  const safe = c.safeS;
  // düşüş sırasında girdi işlemez, aşağı iner
  for (let i = 0; i < 15; i++) step(sim, { h: { gas: true } });
  assert.ok(c.fall > 0 && c.z < -0.05, 'düşüyor: z azalır ' + c.z);
  const snap = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(sim))));
  assert.ok(snap.cars.h.fall > 0 && snap.cars.h.z < 0, 'anlık görüntü düşüşü taşır');
  let rs = null;
  for (let i = 0; i < 120 && !rs; i++) rs = step(sim, { h: { gas: true } }).find((e) => e.e === 'respawn');
  assert.ok(rs, 'yeniden doğuş olayı');
  assert.ok(Math.abs(sim.t - (sim.raceT0 + 0)) >= 0);
  assert.equal(c.fall, null);
  assert.equal(c.sp, 0, 'sıfır hızla doğar');
  assert.ok(c.inv > 0, 'kısa süre çarpışmasız');
  const p = sim.track.pointAt(safe);
  assert.ok(angDiff(c.h, p.a) < 0.01, 'pist yönüne bakar');
  assert.ok(Math.abs(sim.track.nearest(c.x, c.y).d) <= Y.HALF_W * 0.6 + 0.01, 'asfaltta doğar');
  assert.ok(Y.onTrack(c.x, c.y, sim.track));
  assert.ok(Math.hypot(c.x - fx, c.y - fy) < 12, 'düştüğü yerin yakınında doğar');
  // tekrar sürülebilir
  for (let i = 0; i < 30; i++) step(sim, { h: { gas: true } });
  assert.ok(c.sp > 3 && c.fall === null, 'yeniden doğduktan sonra sürer');
  // süre: düşüşten doğuşa ~RESPAWN_T
  const sim2 = Y.createSim([{ id: 'h' }], { seed: 31 });
  Y.startCountdown(sim2);
  let tFall = null, tRs = null;
  for (let i = 0; i < 2000 && tRs === null; i++) for (const e of step(sim2, { h: { gas: true, steer: 1 } })) { if (e.e === 'fall' && tFall === null) tFall = sim2.t; if (e.e === 'respawn') tRs = sim2.t; }
  assert.ok(Math.abs(tRs - tFall - Y.RESPAWN_T) < 0.08, `yeniden doğuş gecikmesi ${(tRs - tFall).toFixed(2)} sn`);
  ok('Uçurum: düşüş animasyon durumu, 2,5 sn sonra son güvenli yerde pist yönüne bakarak sıfır hızla doğuş');
}

// ---------- Botlar: birçok tohumda 3 turu bitirir, düşmez ----------
{
  const seeds = [3, 11, 500, 9001, 123456, 2024, 77];
  let falls = 0, maxT = 0;
  for (const seed of seeds) {
    const ps = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, bot: true }));
    const sim = Y.createSim(ps, { seed });
    for (const c of Object.values(sim.cars)) assert.ok(Y.onTrack(c.x, c.y), 'araba pistte başlamalı');
    Y.startCountdown(sim);
    while (sim.phase !== 'done' && sim.t < 400) for (const e of step(sim)) if (e.e === 'fall') falls++;
    const fin = Object.values(sim.cars).filter((c) => c.done !== null).length;
    assert.equal(fin, 6, `tohum ${seed}: tüm botlar bitirmeli (${fin}/6)`);
    assert.ok(sim.firstDone - sim.raceT0 < 70, 'ilk bitiren 70 sn altında');
    maxT = Math.max(maxT, sim.t - sim.raceT0);
    for (const c of Object.values(sim.cars)) assert.equal(c.lap, Y.LAPS);
    const r = Y.rankingOf(sim);
    assert.equal(r.length, 6); assert.ok(r.every((gp) => Array.isArray(gp) && gp.length === 1));
  }
  assert.ok(falls <= 1, 'botlar neredeyse hiç düşmez: ' + falls);
  ok(`Botlar: ${seeds.length} tohumda 6/6 bot 3 turu bitirdi, düşüş=${falls}, en uzun yarış ${maxT.toFixed(0)} sn`);
}

// ---------- İnsan botları yenebilir (bot mantığı tam hızda, 10 araba) ----------
{
  let wins = 0;
  for (const seed of [100, 101, 102, 103]) {
    const ps = [{ id: 'h' }, ...Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, bot: true }))];
    const sim = Y.createSim(ps, { seed });
    sim.cars.h.lane = 0; sim.cars.h.react = 1;
    Y.startCountdown(sim);
    while (sim.phase !== 'done' && sim.t < 400) step(sim, { h: Y.botInput(sim, sim.cars.h) });
    if (Y.standings(sim)[0] === 'h') wins++;
  }
  assert.ok(wins >= 3, 'tam hızlı sürücü botları geçer: ' + wins + '/4');
  ok(`Botlar yenilebilir: hatasız sürücü 10 arabalık 4 yarışın ${wins}'ünü kazandı`);
}

// ---------- Anlık görüntü gidiş-dönüş ----------
{
  const sim = Y.createSim([{ id: 'h' }, { id: 'b', bot: true }], { seed: 9 });
  Y.startCountdown(sim);
  for (let i = 0; i < 200; i++) step(sim, { h: Y.botInput(sim, sim.cars.h) }); // insan düz gazla virajda düşerdi; bot mantığıyla sür
  const raw = JSON.parse(JSON.stringify(Y.snapshot(sim)));
  const st = Y.readSnapshot(raw);
  assert.equal(st.seed, 9);
  assert.equal(st.phase, 'race');
  for (const id of ['h', 'b']) {
    const c = sim.cars[id], r = st.cars[id];
    for (const k of ['x', 'y', 'h', 'sp', 'prog', 'z', 's', 'd', 'steer', 'inv']) assert.ok(Math.abs(c[k] - r[k]) < 0.011, `${id}.${k}`);
    assert.equal(r.done, null); assert.equal(r.fall, null); assert.equal(r.lap, c.lap);
  }
  assert.ok(st.cars.h.prog > 5);
  ok('Anlık görüntü: tohum, konum, yükseklik, s, düşüş/dokunulmazlık durumu aktarılır');
}

// ---------- Oyun durumu: init tohum üretir, view iletir ----------
{
  const g = Y.init(['a', 'b'], {});
  assert.ok(Number.isInteger(g.seed) && g.seed >= 0);
  const v = Y.view({ g: { ...g, simHost: 'a', prov: null } }, 'a', 0);
  assert.equal(v.seed, g.seed); assert.equal(v.simHost, 'a');
  const sim = Y.createSim([{ id: 'a', bot: true }, { id: 'b', bot: true }], g);
  assert.equal(sim.seed, g.seed);
  ok('Oyun durumu: init() tohum üretir, view() istemciye iletir, createSim aynı tohumu kullanır');
}

console.log('YARIŞ TESTLERİ GEÇTİ');
