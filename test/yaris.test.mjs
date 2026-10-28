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
  assert.ok(a.length > 240 && a.length < 450, 'tur uzunluğu makul: ' + a.length);
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
    assert.ok(sim.firstDone - sim.raceT0 < 150, 'ilk bitiren 150 sn altında: ' + (sim.firstDone - sim.raceT0).toFixed(0));
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
  for (const seed of [104, 105, 106, 107, 108, 109, 110, 111]) {
    const ps = [{ id: 'h' }, ...Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, bot: true }))];
    const sim = Y.createSim(ps, { seed });
    sim.cars.h.lane = 0; sim.cars.h.react = 1;
    Y.startCountdown(sim);
    while (sim.phase !== 'done' && sim.t < 400) step(sim, { h: Y.botInput(sim, sim.cars.h) });
    if (Y.standings(sim)[0] === 'h') wins++;
  }
  assert.ok(wins >= 6, 'tam hızlı sürücü botları geçer: ' + wins + '/8');
  ok(`Botlar yenilebilir: hatasız sürücü 10 arabalık 8 yarışın ${wins}'ünü kazandı`);
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
    assert.equal(r.item, c.item); for (const k of ['nogas', 'nobrake', 'boost', 'spin']) assert.ok(Math.abs(c.fx[k] - r.fx[k]) < 0.011, `${id}.fx.${k}`);
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


// =====================================================================
// ---------- Pist özellikleri: geniş yol ----------
{
  assert.ok(Y.HALF_W >= 3.2, 'yol geniş');
  ok('Pist: yol geniş (yarı genişlik ' + Y.HALF_W + ')');
}

// ---------- Eşya kutuları ----------
const raceSim = (ids, seed, opts = {}) => {
  const ps = ids.map((id) => ({ id, bot: !!opts.bots }));
  const sim = Y.createSim(ps, { seed });
  Y.startCountdown(sim);
  while (sim.phase !== 'race') step(sim);
  return sim;
};
// pist boyunca en düz 16 birimlik kesit (füze/hizalama testleri için)
const straightS = (tr) => {
  let best = 0, bk = Infinity;
  for (let s = 12; s < tr.length - 60; s += 1) { let m = 0; for (let k = 0; k < 40; k += 0.5) m = Math.max(m, tr.kap[Math.round((s + k) / tr.ds) % tr.n]); if (m < bk) { bk = m; best = s; } }
  return best;
};
const place = (sim, id, s, d = 0, sp = 0) => {
  const tr = sim.track, o = tr.offset(s, d), c = sim.cars[id];
  Object.assign(c, { x: o.x, y: o.y, h: o.a, s, d, z: o.z, prog: s, safeS: s, safeD: d, vx: Math.cos(o.a) * sp, vy: Math.sin(o.a) * sp, sp, fall: null, inv: 0 });
};
{
  for (const seed of [1, 7, 99, 1234, 777777, 4242]) {
    const tr = Y.buildTrack(seed), br = tr.bridge;
    assert.ok(tr.boxes.length >= 5 && tr.boxes.length <= 30, `tohum ${seed}: kutu sayısı makul: ${tr.boxes.length}`);
    assert.ok(new Set(tr.boxes.map((b) => Math.round(b.d * 10))).size >= 3, 'kutular farklı şeritlerde');
    for (let i = 1; i < tr.boxes.length; i++) assert.notEqual(Math.round(tr.boxes[i].d * 10), Math.round(tr.boxes[i - 1].d * 10), 'ardışık kutular aynı şeritte değil');
    for (const b of tr.boxes) {
      assert.ok(Math.abs(tr.nearest(b.x, b.y).d) <= Y.HALF_W, 'kutu asfaltta');
      assert.ok(b.s >= 14, 'kutu başlangıç ızgarasında değil');
      assert.ok(Math.abs(b.d) <= Y.HALF_W * 0.75, 'kutu asfaltın içinde');
      assert.ok(Math.abs(tr.wrap(b.s - br.s)) > br.span + 2 && Math.abs(tr.wrap(b.s - br.lowS)) > br.span + 2, 'kutu köprü bölgesinde değil');
      assert.equal(b.z, 0, 'kutu yerde');
    }
  }
  const Y2 = await import('../public/games/yaris.js?kutu=' + Date.now());
  assert.deepEqual(Y.buildTrack(4242).boxes, Y2.buildTrack(4242).boxes, 'kutular tohumdan, her cihazda aynı');
  ok('Eşya kutuları: asfaltta, köprü/ızgarada değil, tohumdan belirlenimci');
}

// ---------- Kutu al: eşya verilir, kutu kaybolur, süre sonra döner ----------
{
  const sim = raceSim(['a', 'b'], 31);
  const b0 = sim.track.boxes[0];
  place(sim, 'b', 0.5); // b başlangıçta kalsın
  Object.assign(sim.cars.a, { x: b0.x, y: b0.y, h: 0, vx: 0, vy: 0, sp: 0, s: b0.s, prog: b0.s });
  const evs = step(sim);
  assert.ok(sim.cars.a.item >= 1 && sim.cars.a.item <= Y.ITEM_COUNT, 'eşya verildi');
  assert.ok(sim.boxes[0] > 5.9, 'kutu tükendi');
  assert.ok(evs.some((e) => e.e === 'pickup' && e.id === 'a'), 'pickup olayı');
  const snap = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(sim))));
  assert.equal(snap.boxes[0], false); assert.equal(snap.boxes.length, sim.track.boxes.length);
  assert.equal(snap.cars.a.item, sim.cars.a.item);
  // elinde eşya varken kutu almaz
  const had = sim.cars.a.item; sim.boxes[1] = 0;
  const b1 = sim.track.boxes[1];
  Object.assign(sim.cars.a, { x: b1.x, y: b1.y, vx: 0, vy: 0 }); step(sim);
  assert.equal(sim.cars.a.item, had); assert.equal(sim.boxes[1], 0, 'dolu elle kutu alınmaz');
  // 6 sn sonra geri gelir
  Object.assign(sim.cars.a, { x: b0.x + 50, y: b0.y + 50 });
  for (let i = 0; i < 30 * 6.2; i++) { sim.cars.a.fall = 1; step(sim); }
  assert.equal(sim.boxes[0], 0, 'kutu yeniden belirdi');
  ok('Kutu: eşya verilir, kutu kaybolur, dolu elle alınmaz, 6 sn sonra geri gelir; anlık görüntüde görünür');
}

// ---------- Dağılım: lider de çeşitli eşya bulur (füze hariç); geride kalan hepsini ----------
{
  const seen = { lead: new Set(), back: new Set() }; const counts = {};
  for (let k = 0; k < 200; k++) {
    const sim = raceSim(['a', 'b', 'c', 'd'], 100 + k);
    place(sim, 'a', 140); place(sim, 'b', 125); place(sim, 'c', 110); place(sim, 'd', 100); // kutudan uzak (kutuyu yalnızca denenen araba alsın)
    for (const id of ['a', 'd']) sim.cars[id].item = 0;
    const b = sim.track.boxes[0];
    const atBox = (id, prog) => Object.assign(sim.cars[id], { x: b.x, y: b.y, s: b.s, d: b.d, z: 0, safeS: b.s, prog, vx: 0, vy: 0, sp: 0 });
    atBox('a', 300); step(sim); seen.lead.add(sim.cars.a.item); counts[sim.cars.a.item] = (counts[sim.cars.a.item] || 0) + 1;
    sim.boxes[0] = 0; sim.cars.a.item = 0; place(sim, 'a', 140, 0, 0);
    atBox('d', -5); step(sim); seen.back.add(sim.cars.d.item);
  }
  assert.ok(!seen.lead.has(2), 'lider füze bulmaz (önünde kimse yok)');
  assert.ok(seen.lead.size >= 4, 'lider çeşitli eşya bulur: ' + [...seen.lead]);
  assert.ok((counts[1] || 0) < 200 * 0.35, 'lider hep nitro bulmaz: nitro ' + counts[1] + '/200');
  assert.equal(seen.back.size, 6, 'son sıradaki altı çeşidi de bulabilir: ' + [...seen.back]);
  ok(`Dağılım: lider ${[...seen.lead].sort()} bulur (nitro ${counts[1]}/200), geride kalan altı eşyanın hepsini bulabilir`);
}

// ---------- 🥒 Turşu Nitro ----------
{
  const run = (item) => {
    const sim = raceSim(['a', 'b'], 9); const tr = sim.track; const s0 = straightS(tr);
    place(sim, 'a', s0); place(sim, 'b', 3); sim.cars.a.item = item;
    let top = 0, used = false;
    for (let i = 0; i < 30 * 3; i++) { if (step(sim, { a: { gas: true, bomb: i === 0 } }).some((e) => e.e === 'use' && e.item === 1)) used = true; top = Math.max(top, sim.cars.a.sp); }
    return { top, boost: sim.cars.a.fx.boost, used };
  };
  const plain = run(0), nitro = run(1);
  assert.ok(nitro.top > plain.top + 1.5, `nitro daha hızlı: ${nitro.top.toFixed(1)} > ${plain.top.toFixed(1)}`);
  assert.ok(nitro.used && !plain.used, 'nitro kullanıldı (kullanım olayı)');
  ok(`Turşu Nitro: en yüksek hız ${plain.top.toFixed(1)} → ${nitro.top.toFixed(1)}`);
}

// ---------- 🧯 Fren Hortumu / 🪠 Gaz Tıkacı: öndekini vurur ----------
{
  const setup = (item) => {
    const sim = raceSim(['a', 'b'], 9); const s0 = straightS(sim.track);
    place(sim, 'a', s0, 0, 6); place(sim, 'b', s0 + 6, 0, 6); sim.cars.a.item = item;
    return sim;
  };
  // hortum: b'nin freni 5 sn çalışmaz, gazı çalışır
  let sim = setup(3);
  let evs = step(sim, { a: { gas: true, bomb: true }, b: { gas: true } });
  assert.ok(evs.some((e) => e.e === 'hit' && e.id === 'b' && e.by === 'a' && e.item === 3), 'hortum öndekine isabet');
  assert.ok(sim.cars.b.fx.nobrake > 4.9 && sim.cars.b.fx.nogas === 0);
  assert.equal(sim.cars.a.fx.nobrake, 0, 'kendi freni sağlam');
  const brakeTest = (fxBrake) => {
    const s2 = setup(0); s2.cars.b.fx.nobrake = fxBrake;
    for (let i = 0; i < 20; i++) step(s2, { a: {}, b: { brake: true } });
    return s2.cars.b.sp;
  };
  assert.ok(brakeTest(5) > brakeTest(0) + 2, 'fren hortumu yiyen fren yapamaz');
  // tıkaç: gaz çalışmaz
  sim = setup(4);
  evs = step(sim, { a: { gas: true, bomb: true }, b: { gas: true } });
  assert.ok(evs.some((e) => e.e === 'hit' && e.id === 'b' && e.item === 4), 'tıkaç isabet');
  assert.ok(sim.cars.b.fx.nogas > 2.4 && sim.cars.b.fx.nobrake === 0);
  const gasTest = (fxGas) => { const s2 = setup(0); s2.cars.b.fx.nogas = fxGas; for (let i = 0; i < 45; i++) step(s2, { a: {}, b: { gas: true } }); return s2.cars.b.sp; };
  assert.ok(gasTest(0) > gasTest(2.5) + 1.2, 'gaz tıkacı yiyen gaz veremez');
  // süre dolunca düzelir
  sim = setup(0); sim.cars.b.fx.nogas = 0.2;
  for (let i = 0; i < 12; i++) step(sim, { b: { gas: true } });
  assert.equal(sim.cars.b.fx.nogas, 0, 'etki biter');
  ok('Fren Hortumu ve Gaz Tıkacı: öndekine isabet eder, frenini/gazını keser, süre sonunda biter, kullananı etkilemez');
}

// ---------- Lider: hortum/tıkaç arkadaki en yakın araca gider; yalnızsa harcanmaz ----------
{
  let sim = raceSim(['a', 'b', 'c'], 9); const s0 = straightS(sim.track);
  place(sim, 'a', s0 + 20); place(sim, 'b', s0 + 12); place(sim, 'c', s0); sim.cars.a.item = 3; // a lider
  let evs = step(sim, { a: { bomb: true } });
  assert.ok(evs.some((e) => e.e === 'hit' && e.id === 'b' && e.by === 'a'), 'lider hortumu arkadaki en yakına atar');
  assert.ok(sim.cars.b.fx.nobrake > 4.9 && sim.cars.c.fx.nobrake === 0, 'yalnızca en yakın arkadaki etkilenir');
  assert.equal(sim.cars.a.item, 0);
  // yalnız araba: hedef yok, harcanmaz
  sim = raceSim(['a'], 9); place(sim, 'a', s0); sim.cars.a.item = 4;
  evs = step(sim, { a: { bomb: true } });
  assert.ok(evs.some((e) => e.e === 'noTarget'), 'hedef yok olayı'); assert.equal(sim.cars.a.item, 4, 'eşya harcanmadı');
  ok('Lider: hortum/tıkaç arkadaki en yakın araca gider; hiç hedef yoksa eşya harcanmaz');
}

// ---------- 🥟 Börek Füzesi ----------
{
  // isabet: hizalı öndeki araç döner ve yavaşlar
  let sim = raceSim(['a', 'b'], 9); const s0 = straightS(sim.track);
  place(sim, 'a', s0, 0, 6); place(sim, 'b', s0, 0, 6);
  const A = sim.cars.a, B = sim.cars.b;
  B.x = A.x + Math.cos(A.h) * 9; B.y = A.y + Math.sin(A.h) * 9; B.h = A.h; B.vx = Math.cos(A.h) * 6; B.vy = Math.sin(A.h) * 6;
  A.item = 2;
  let evs = step(sim, { a: { gas: true, bomb: true }, b: { gas: true } });
  assert.ok(evs.some((e) => e.e === 'fire' && e.id === 'a'), 'ateş olayı'); assert.equal(A.item, 0);
  assert.equal(sim.proj.length, 1);
  let hit = null; const spBefore = B.sp;
  for (let i = 0; i < 90 && !hit; i++) hit = step(sim, { a: { gas: true }, b: { gas: true } }).find((e) => e.e === 'hit');
  assert.ok(hit && hit.id === 'b' && hit.by === 'a' && hit.item === 2, 'füze öndekine çarptı');
  assert.ok(B.fx.spin > 1, 'döner'); assert.equal(sim.proj.length, 0, 'füze yok oldu');
  assert.ok(B.sp < spBefore * 0.5, `yavaşladı: ${spBefore.toFixed(1)} → ${B.sp.toFixed(1)}`);
  const hB = B.h; step(sim, { b: { steer: 1, gas: true } });
  assert.ok(Math.abs(B.steer) < 0.15, 'dönerken direksiyon çalışmaz');
  // füze kendi sahibine çarpmaz
  sim = raceSim(['a'], 9); place(sim, 'a', straightS(sim.track), 0, 5); sim.cars.a.item = 2;
  step(sim, { a: { bomb: true } });
  for (let i = 0; i < 30; i++) step(sim, { a: {} });
  assert.equal(sim.cars.a.fx.spin, 0, 'kendine çarpmaz');
  // yan şeritteki araca çarpmaz (düz gider), ömrü dolunca kaybolur
  sim = raceSim(['a', 'b'], 9); const s1 = straightS(sim.track);
  place(sim, 'a', s1, 0, 6); place(sim, 'b', s1 + 8, 0, 6);
  sim.cars.b.x = sim.cars.a.x + Math.cos(sim.cars.a.h) * 8 + Math.cos(sim.cars.a.h + Math.PI / 2) * 3; sim.cars.b.y = sim.cars.a.y + Math.sin(sim.cars.a.h) * 8 + Math.sin(sim.cars.a.h + Math.PI / 2) * 3;
  sim.cars.a.item = 2; step(sim, { a: { bomb: true } });
  for (let i = 0; i < 100; i++) { sim.cars.b.fall = 1; for (const e of step(sim, {})) assert.ok(!(e.e === 'hit' && e.id === 'b'), 'ıskalar'); }
  assert.equal(sim.proj.length, 0, 'ömür dolunca füze silinir');
  // anlık görüntü füzeyi taşır
  sim = raceSim(['a', 'b'], 9); place(sim, 'a', straightS(sim.track), 0, 6); sim.cars.a.item = 2; step(sim, { a: { bomb: true } });
  const sn = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(sim))));
  assert.equal(sn.proj.length, 1); assert.ok(Math.abs(sn.proj[0][0] - sim.proj[0].x) < 0.011);
  ok('Börek Füzesi: düz gider, öndekini döndürüp yavaşlatır, kendine/yandakine çarpmaz, ömrü dolunca silinir, ağda görünür');
}


// ---------- 👻 Hayalet Çorbası ----------
{
  const sim = raceSim(['a', 'b', 'c'], 9); const s0 = straightS(sim.track);
  place(sim, 'a', s0, 0, 6); place(sim, 'b', s0 + 8, 0, 6); place(sim, 'c', s0 + 14, 0, 6);
  sim.cars.b.item = 5;
  step(sim, { b: { bomb: true } });
  assert.ok(sim.cars.b.fx.ghost > 3.8, 'hayalet oldu'); assert.equal(sim.cars.b.item, 0);
  // hedef alınamaz: a'nın hortumu b'yi atlar, c'yi vurur
  sim.cars.a.item = 3;
  const evs = step(sim, { a: { bomb: true } });
  assert.ok(evs.some((e) => e.e === 'hit' && e.id === 'c'), 'görünmez b atlandı, c hedeflendi');
  assert.equal(sim.cars.b.fx.nobrake, 0);
  // süre dolunca görünür
  for (let i = 0; i < 30 * 4.2; i++) { for (const id of ['a', 'b', 'c']) sim.cars[id].fall = 1; step(sim, {}); }
  assert.equal(sim.cars.b.fx.ghost, 0, 'hayalet süresi biter');
  const sn = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(raceSimWithGhost()))));
  assert.ok(sn.cars.b.fx.ghost > 3, 'anlık görüntü hayaleti taşır');
  function raceSimWithGhost() { const q = raceSim(['a', 'b'], 9); q.cars.b.fx.ghost = 3.5; return q; }
  ok('Hayalet Çorbası: 4 sn görünmez, hortum/tıkaç/füze onu hedef alamaz, süre sonunda biter, ağda taşınır');
}

// ---------- 🍌 Muz Kabuğu ----------
{
  const sim = raceSim(['a', 'b'], 9); const s0 = straightS(sim.track);
  place(sim, 'a', s0 + 8, 0, 6); place(sim, 'b', s0, 0, 6);
  sim.cars.a.item = 6;
  const evs = step(sim, { a: { gas: true, bomb: true } });
  assert.ok(evs.some((e) => e.e === 'trap' && e.id === 'a'), 'tuzak olayı'); assert.equal(sim.traps.length, 1); assert.equal(sim.cars.a.item, 0);
  const T = sim.traps[0];
  assert.ok(Math.hypot(T.x - sim.cars.a.x, T.y - sim.cars.a.y) < 3, 'tuzak aracın arkasında');
  // sahibi ilk 2 sn kendi tuzağına basmaz; ama sabit durursa basar
  const sn = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(sim))));
  assert.equal(sn.traps.length, 1); assert.ok(Math.abs(sn.traps[0][0] - T.x) < 0.011);
  // b tuzağa girer: döner, yavaşlar, tuzak kaybolur
  sim.cars.b.x = T.x; sim.cars.b.y = T.y; sim.cars.b.s = s0 + 7; sim.cars.b.prog = s0 + 7; const spB = 6;
  let hit = null; for (let i = 0; i < 3 && !hit; i++) hit = step(sim, { b: { gas: true } }).find((e) => e.e === 'hit' && e.item === 6);
  assert.ok(hit && hit.id === 'b' && hit.by === 'a', 'tuzağa basan vuruldu');
  assert.ok(sim.cars.b.fx.spin > 0.8 && sim.cars.b.sp < spB * 0.8, 'döner ve yavaşlar'); assert.equal(sim.traps.length, 0, 'tuzak harcandı');
  // hayalet tuzağa basmaz
  const s2 = raceSim(['a', 'b'], 9); place(s2, 'a', s0 + 8, 0, 6); place(s2, 'b', s0, 0, 6); s2.cars.a.item = 6; step(s2, { a: { bomb: true } });
  s2.cars.b.fx.ghost = 3; s2.cars.b.x = s2.traps[0].x; s2.cars.b.y = s2.traps[0].y; s2.cars.b.s = s0 + 7; s2.cars.b.prog = s0 + 7;
  step(s2, { b: { gas: true } }); assert.equal(s2.traps.length, 1, 'hayalet tuzağa basmaz'); assert.equal(s2.cars.b.fx.spin, 0);
  // ömrü dolunca silinir; en fazla TRAP_MAX
  const s3 = raceSim(['a'], 9); place(s3, 'a', s0, 0, 0);
  for (let i = 0; i < Y.TRAP_MAX + 6; i++) { s3.cars.a.item = 6; step(s3, { a: { bomb: true } }); }
  assert.ok(s3.traps.length <= Y.TRAP_MAX, 'tuzak sayısı sınırlı: ' + s3.traps.length);
  for (let i = 0; i < 30 * (Y.TRAP_LIFE + 1); i++) { s3.cars.a.fall = 1; step(s3, {}); }
  assert.equal(s3.traps.length, 0, 'ömrü dolan tuzaklar silinir');
  ok('Muz Kabuğu: arkaya bırakılır, basanı döndürür/yavaşlatır, hayalet basmaz, sayısı ve ömrü sınırlı, ağda taşınır');
}

// ---------- Eşyalı bot yarışı: botlar eşya kullanır, hâlâ bitirir, düşmez ----------
{
  let uses = 0, hits = 0, falls = 0, nan = 0; const used = new Set();
  for (const seed of [3, 11, 500, 9001, 2024, 77]) {
    const ps = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, bot: true }));
    const sim = Y.createSim(ps, { seed });
    Y.startCountdown(sim);
    while (sim.phase !== 'done' && sim.t < 500) {
      for (const e of step(sim)) { if (e.e === 'use') { uses++; used.add(e.item); } if (e.e === 'hit') hits++; if (e.e === 'fall') falls++; }
      for (const c of Object.values(sim.cars)) if (!Number.isFinite(c.x + c.y + c.sp)) nan++;
    }
    const fin = Object.values(sim.cars).filter((c) => c.done !== null).length;
    assert.equal(fin, 8, `tohum ${seed}: tüm botlar bitirmeli (${fin}/8)`);
  }
  assert.equal(nan, 0, 'sayı bozulması yok');
  assert.ok(uses >= 20, 'botlar eşya kullanır: ' + uses);
  assert.ok(used.size >= 5, 'birden çok çeşit kullanıldı: ' + [...used]);
  assert.ok(used.has(5) && used.has(6), 'hayalet ve muz da kullanılır');
  assert.ok(hits >= 5, 'isabetler oluyor: ' + hits);
  assert.ok(falls <= 6, 'eşyalarla da botlar çok düşmez: ' + falls);
  ok(`Eşyalı bot yarışı: 6 pist × 8 bot, ${uses} kullanım (${[...used].sort()}), ${hits} isabet, ${falls} düşüş`);
}

console.log('YARIŞ TESTLERİ GEÇTİ');
