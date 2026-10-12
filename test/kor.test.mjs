// Kör Koşu: kıvrımlı parkur, uçurum, çeşitli engeller, bot koşucu, anlık görüntü
// Çalıştır: node test/kor.test.mjs
import assert from 'node:assert/strict';
import * as K from '../public/games/korkosu.js';

const ok = (m) => console.log('✓ ' + m);
const mkSim = (seed, skill = 0.8) => {
  const g = { seed, teams: [{ id: 0, members: ['a', 'b'], runner: 'a', guide: 'b', botRunner: true, botGuide: true }] };
  const sim = K.createSim([], g);
  sim.teams[0].skill = skill;
  K.startCountdown(sim);
  return sim;
};
const run = (sim, n) => { for (let i = 0; i < n; i++) K.stepSim(sim, 1 / 30, {}); };

// ---------- Parkur: tohumdan belirlenir, kıvrımlıdır ----------
{
  const a = K.course(42), b = K.course(42), c = K.course(43);
  assert.deepEqual([a.n, a.LEN, a.px.slice(0, 20), a.walls, a.spinners], [b.n, b.LEN, b.px.slice(0, 20), b.walls, b.spinners], 'aynı tohum aynı parkur');
  assert.notDeepEqual(a.px.slice(0, 60), c.px.slice(0, 60), 'farklı tohum farklı parkur');
  for (const seed of [1, 2, 3, 7, 11, 99, 12345]) {
    const cc = K.course(seed);
    let turn = 0, minx = 1e9, maxx = -1e9;
    for (let i = 1; i < cc.n; i++) {
      let d = Math.atan2(cc.ty[i], cc.tx[i]) - Math.atan2(cc.ty[i - 1], cc.tx[i - 1]);
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      turn += Math.abs(d); minx = Math.min(minx, cc.px[i]); maxx = Math.max(maxx, cc.px[i]);
    }
    assert.ok(turn > 4, `tohum ${seed}: parkur düz değil (toplam dönüş ${turn.toFixed(1)} rad)`);
    assert.ok(maxx - minx > 8, `tohum ${seed}: yanal yayılım var (${(maxx - minx).toFixed(1)})`);
    // yol kendine çakışmaz: 7 birimden uzak örnekler arası mesafe > yol genişliği
    for (let i = 0; i < cc.n; i += 3) for (let j = i + 16; j < cc.n; j += 3) assert.ok(Math.hypot(cc.px[i] - cc.px[j], cc.py[i] - cc.py[j]) > K.PW, `tohum ${seed}: yol kendine çakışmıyor (${i},${j})`);
    assert.ok(cc.cps.length >= 5 && cc.cps[0] === 0 && cc.cps.every((v) => v % K.CP_EVERY === 0), 'kontrol noktaları yol boyunca');
    assert.ok(cc.LEN >= 110 && cc.LEN <= 140, 'parkur uzunluğu makul');
  }
  ok('Parkur tohumdan belirlenir, kıvrımlıdır ve kendine çakışmaz');
}

// ---------- Geometri: world/frame/widthAt ----------
{
  const c = K.course(5);
  const p0 = K.world(c, 0, 0), p1 = K.world(c, 0, 1);
  assert.ok(Math.abs(Math.hypot(p1.x - p0.x, p1.y - p0.y) - 1) < 1e-6, 'u birim yanal sapma');
  assert.equal(K.widthAt(c, 0), K.PW);
  assert.ok(c.beams.length ? K.widthAt(c, (c.beams[0].s0 + c.beams[0].s1) / 2) === K.BEAM_W : true, 'kiriş daralır');
  assert.equal(K.checkpointS(c, 45), 44); assert.equal(K.checkpointS(c, 21.9), 0);
  ok('Geometri yardımcıları doğru');
}

// ---------- Kenardan düşme → kontrol noktasında yeniden doğma ----------
{
  const c = K.course(5);
  assert.ok(K.onGround(c, 10, 0, 0) && !K.onGround(c, 10, K.PW / 2 + 0.5, 0), 'yol üstü/dışı ayrımı');
  const sim = mkSim(5); sim.teams[0].botRunner = false;
  run(sim, 95); // geri sayım biter
  assert.equal(sim.phase, 'run');
  const tm = sim.teams[0];
  tm.s = 23; tm.u = 0; // 22'deki kontrol noktasını geçmiş (kontrol noktası çevresi engelsizdir)
  const fr = K.frame(c, 23);
  let fell = false, respawned = false;
  for (let i = 0; i < 120 && !respawned; i++) {
    const ev = K.stepSim(sim, 1 / 30, { a: { x: fr.nx, y: fr.ny } }); // yola dik, kenara doğru koş
    for (const e of ev) { if (e.e === 'fall') fell = true; if (e.e === 'respawn') respawned = true; }
    if (fell && !respawned) assert.ok(tm.fall > 0 && Math.abs(tm.u) > K.PW / 2, 'düşerken konum sabit, düşme sayacı işler');
  }
  assert.ok(fell && respawned, 'kenardan düşüldü ve yeniden doğuldu');
  assert.equal(tm.s, 22); assert.equal(tm.u, 0); assert.equal(tm.hits, 1); assert.ok(tm.stun > 0);
  ok('Kenardan düşen kısa düşüşten sonra son kontrol noktasına döner (hits +1)');
}

// ---------- Engel çeşitliliği ve belirlenimcilik ----------
{
  const kinds = ['walls', 'movers', 'spinners', 'pends', 'stomps', 'blinks', 'belts', 'boulders', 'beams', 'stubs'];
  const tot = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (let seed = 1; seed <= 40; seed++) { const c = K.course(seed); for (const k of kinds) tot[k] += c[k].length; const present = kinds.filter((k) => c[k].length).length; assert.ok(present >= 5, `tohum ${seed}: en az 5 farklı engel türü (${present})`); }
  for (const k of kinds) assert.ok(tot[k] > 0, `${k} hiç üretilmedi`);
  const c = K.course(9);
  const st = c.stomps[0], mv = c.movers[0], bl = c.blinks[0];
  if (st) { assert.equal(K.stompH(st, 0), K.stompH(st, 0)); let down = false, up = false; for (let t = 0; t < 10; t += 0.05) { if (K.stompH(st, t) === 0) down = true; if (K.stompH(st, t) === 1) up = true; } assert.ok(down && up, 'ezici iner ve kalkar'); }
  if (mv) assert.ok(Math.abs(K.moverU(mv, 3.3) - K.moverU(mv, 3.3)) === 0 && Math.abs(K.moverU(mv, 0) - K.moverU(mv, 1)) > 0, 'kayan blok zamana bağlı');
  if (bl) { let on = 0, off = 0; for (let t = 0; t < 20; t += 0.1) K.blinkOn(bl, t) ? on++ : off++; assert.ok(on > 0 && off > 0, 'platform söner ve yanar'); assert.ok(!K.onGround(c, (bl.s0 + bl.s1) / 2, 0, [...Array(200).keys()].map((i) => i / 10).find((t) => !K.blinkOn(bl, t))), 'sönük platformda zemin yok'); }
  assert.ok(K.hazardHit(c, -50, 0, 0) === false, 'engel dışı güvenli');
  ok(`Engel türleri: ${kinds.map((k) => `${k}=${tot[k]}`).join(' ')} (40 tohum)`);
}

// ---------- Botlar bitirir ----------
{
  const times = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 27, 69, 104, 278]) {
    const sim = mkSim(seed, 0.78 + (seed % 5) * 0.04);
    while (sim.phase !== 'done' && sim.t < 200) K.stepSim(sim, 1 / 30, {});
    const tm = sim.teams[0];
    assert.ok(tm.done !== null && tm.done < 150, `tohum ${seed}: bot bitirdi (${tm.done}, s=${tm.s.toFixed(1)})`);
    times.push(`${seed}:${tm.done.toFixed(0)}s/${tm.hits}💥`);
  }
  ok(`Bot koşucu 12 tohumda bitirdi — ${times.join(' ')}`);
}

// ---------- İşaret (geçici) + anlık görüntü ----------
{
  const sim = mkSim(3);
  for (let i = 0; i < 120; i++) K.stepSim(sim, 1 / 30, { b: { ping: [3, 50, 7] } });
  const tm = sim.teams[0];
  assert.deepEqual(tm.ping.slice(0, 3), [3, 50, 7]);
  assert.ok(typeof tm.ping[3] === 'number' && tm.ping[3] < 1.1, 'işaretin zamanı saklanır (istemci PING_SHOW süresince gösterir)');
  K.stepSim(sim, 1 / 30, { b: { ping: [4, 40, 8] } });
  assert.deepEqual(tm.ping.slice(0, 3), [4, 40, 8], 'yeni id ile yeni işaret');
  const raw = JSON.parse(JSON.stringify(K.snapshot(sim)));
  const snap = K.readSnapshot(raw);
  assert.equal(snap.teams.length, 1);
  const t0 = snap.teams[0], w = K.world(sim.c, t0.s, t0.u);
  assert.ok(Math.abs(t0.x - w.x) < 1e-9 && Math.abs(t0.y - w.y) < 1e-9, 'anlık görüntüden dünya konumu türetilir');
  assert.ok('fall' in t0 && 'cp' in t0 && 'hits' in t0 && t0.done === null, 'alanlar korunur');
  assert.equal(snap.seed, 3); assert.equal(snap.phase, 'run');
  assert.ok(K.rankingOf(sim).length === 1);
  ok('İşaret iletilir (zaman damgalı), anlık görüntü JSON gidiş-dönüşünü korur');
}

console.log('KÖR KOŞU TESTLERİ GEÇTİ');
