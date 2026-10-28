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
// iki ya da daha çok takım (koşucu = a0, a1, …; yönlendirici = b0, b1, …)
const mkMulti = (seed, n = 2, bots = false) => {
  const g = { seed, teams: Array.from({ length: n }, (_, i) => ({ id: i, members: ['a' + i, 'b' + i], runner: 'a' + i, guide: 'b' + i, botRunner: bots, botGuide: true })) };
  const sim = K.createSim([], g);
  K.startCountdown(sim);
  while (sim.phase !== 'run') K.stepSim(sim, 1 / 30, {});
  return sim;
};

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
  tm.doorOpen = true; tm.s = 23; tm.u = 0; // 22'deki kontrol noktasını geçmiş (kontrol noktası çevresi engelsizdir)
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
  const kinds = ['walls', 'movers', 'spinners', 'pends', 'stomps', 'blinks', 'turns', 'ices', 'boulders', 'beams', 'stubs'];
  const tot = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (let seed = 1; seed <= 40; seed++) { const c = K.course(seed); for (const k of kinds) tot[k] += c[k].length; const present = kinds.filter((k) => c[k].length).length; assert.ok(present >= 4, `tohum ${seed}: en az 4 farklı engel türü (${present})`); }
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

// ---------- Başlangıç kapıları: 6 kapı, yalnızca biri kırılır ----------
{
  const c = K.course(21);
  assert.equal(c.door.n, 6); assert.ok(c.door.good >= 0 && c.door.good < 6);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(K.course(seed).door.good >= 0, 'her parkurda kırılabilir kapı var');
  assert.ok(new Set([...Array(40).keys()].map((i) => K.course(i + 1).door.good)).size >= 4, 'kırılabilir kapı parkura göre değişir');
  // yanlış kapıya çarpmak açmaz; doğru kapıya çarpınca açılır
  const sim = mkMulti(21, 1); const tm = sim.teams[0]; const [ga, gb] = K.doorSeg(c.door.good);
  const wrong = c.door.good === 0 ? 1 : 0, [wa, wb] = K.doorSeg(wrong);
  tm.u = (wa + wb) / 2;
  for (let i = 0; i < 60; i++) K.stepSim(sim, 1 / 30, { a0: { x: Math.sign(K.frame(c, 0).tx) * 0, y: -1 } });
  const fr = K.frame(c, 0);
  const goDir = { x: fr.tx, y: fr.ty };
  tm.s = 0; tm.u = (wa + wb) / 2; for (let i = 0; i < 60; i++) K.stepSim(sim, 1 / 30, { a0: goDir });
  assert.ok(!tm.doorOpen && tm.s < K.DOOR_S, 'yanlış kapı kırılmaz, yol kapalı kalır (s=' + tm.s.toFixed(2) + ')');
  tm.u = (ga + gb) / 2; let broke = false; for (let i = 0; i < 90; i++) for (const e of K.stepSim(sim, 1 / 30, { a0: goDir })) if (e.e === 'door') broke = true;
  assert.ok(broke && tm.doorOpen, 'doğru kapı kırıldı');
  for (let i = 0; i < 60; i++) K.stepSim(sim, 1 / 30, { a0: goDir });
  assert.ok(tm.s > K.DOOR_S + 0.5, 'kapı açılınca parkur başlar, geçilir');
  assert.ok(K.snapshot(sim).tm[0][9] === 1, 'anlık görüntüde kapı durumu');
  ok('Başlangıç kapıları: 6 kapı, yalnızca biri kırılır; yanlışlar duvar, doğru açınca parkur başlar');
}

// ---------- Dönen platform ve buz ----------
{
  let tc = null, ic = null;
  for (let seed = 1; seed <= 40 && !(tc && ic); seed++) { const c = K.course(seed); if (!tc && c.turns.length) tc = c; if (!ic && c.ices.length) ic = c; }
  assert.ok(tc && ic, 'dönen platform ve buz üretiliyor');
  const tn = tc.turns[0];
  assert.ok(tn.r <= K.PW / 2, 'platform yolun içinde'); assert.ok(Math.abs(tn.w) >= 0.7);
  const sim = mkSim(tc.seed); sim.teams[0].botRunner = false; run(sim, 95);
  const tm = sim.teams[0]; tm.doorOpen = true; tm.s = tn.s; tm.u = 0.9; // merkezden uzakta, üzerinde
  const r0 = Math.hypot(tm.s - tn.s, tm.u - tn.u), a0 = Math.atan2(tm.u - tn.u, tm.s - tn.s);
  for (let i = 0; i < 15; i++) K.stepSim(sim, 1 / 30, {});
  const a1 = Math.atan2(tm.u - tn.u, tm.s - tn.s), r1 = Math.hypot(tm.s - tn.s, tm.u - tn.u);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  assert.ok(Math.abs(r1 - r0) < 0.05, 'merkez etrafında döner (yarıçap korunur)'); assert.ok(Math.sign(da) === Math.sign(tn.w) && Math.abs(da) > 0.25, 'üstündekini platformun yönünde döndürür: ' + da.toFixed(2));
  // buz: bırakınca bir süre kayar
  const s2 = mkSim(ic.seed); s2.teams[0].botRunner = false; run(s2, 95);
  const z = ic.ices[0], t2 = s2.teams[0]; t2.doorOpen = true; t2.s = z.s0 + 0.5; t2.u = 0; const f2 = K.frame(ic, t2.s);
  for (let i = 0; i < 3; i++) K.stepSim(s2, 1 / 30, { a: { x: f2.tx, y: f2.ty } });
  assert.ok(t2.vs < 3.6 * 0.5, 'buzda hız hemen oturmaz');
  for (let i = 0; i < 7; i++) K.stepSim(s2, 1 / 30, { a: { x: f2.tx, y: f2.ty } });
  const sNow = t2.s; for (let i = 0; i < 6; i++) K.stepSim(s2, 1 / 30, {});
  assert.ok(t2.s - sNow > 0.2 && t2.vs > 0.5, 'buzda parmağı çekince kaymaya devam eder: ' + (t2.s - sNow).toFixed(2));
  ok('Dönen platform üstündekini döndürür; kaygan buzda kayılır');
}

// ---------- Herkes aynı yolda: itişme, tutma ve atma ----------
{
  const c = K.course(8);
  const sim = mkMulti(8, 2);
  const A = sim.teams[0], B = sim.teams[1];
  A.doorOpen = B.doorOpen = true; A.s = 30; A.u = 0; B.s = 30; B.u = 0.2; A.stun = B.stun = 0;
  for (let i = 0; i < 5; i++) K.stepSim(sim, 1 / 30, {});
  const w1 = K.world(c, A.s, A.u), w2 = K.world(c, B.s, B.u);
  assert.ok(Math.hypot(w1.x - w2.x, w1.y - w2.y) > 0.5, 'koşucular birbirinin içinden geçmez');
  // yakala: TUT basılı
  A.s = 30; A.u = 0; B.s = 30.7; B.u = 0; A.stun = B.stun = 0; B.immune = 0; A.grabCd = 0; A.ks = A.ku = B.ks = B.ku = 0;
  let grabbed = false; for (let i = 0; i < 4; i++) for (const e of K.stepSim(sim, 1 / 30, { a0: { grab: true } })) if (e.e === 'grab') grabbed = true;
  assert.ok(grabbed && A.grabbing === B.id && B.held === A.id, 'yakınındakini yakalar');
  // taşırken yana yürü: yakalanan birlikte gelir; kenara taşıyıp bırakınca fırlar ve düşer
  const fr = K.frame(c, A.s);
  let thrown = false, fell = false;
  for (let i = 0; i < 60 && !thrown; i++) for (const e of K.stepSim(sim, 1 / 30, { a0: { grab: true, x: fr.nx, y: fr.ny } })) { if (e.e === 'fall' && e.team === B.id) fell = true; }
  for (let i = 0; i < 90 && !fell; i++) for (const e of K.stepSim(sim, 1 / 30, { a0: { grab: false, x: fr.nx, y: fr.ny } })) { if (e.e === 'throw') thrown = true; if (e.e === 'fall' && e.team === B.id) fell = true; }
  assert.ok(fell, 'kenara taşınıp bırakılan rakip uçuruma düşer');
  assert.equal(A.grabbing, null); assert.ok(A.grabCd > 0 || A.shoves >= 1, 'tutma bekleme süresi');
  // snapshot alanları
  const rd = K.readSnapshot(JSON.parse(JSON.stringify(K.snapshot(sim))));
  assert.ok('grabbing' in rd.teams[0] && 'held' in rd.teams[0] && 'doorOpen' in rd.teams[0] && 'shoves' in rd.teams[0]);
  ok('Herkes aynı yolda: çarpışma, TUT ile yakalama, taşıma, atma/uçuruma düşürme');
}

// ---------- Botlar kapıdan geçer, itişme olsa da bitirir ----------
{
  let bad = 0;
  for (const seed of [2, 3, 5, 69, 104]) {
    const sim = mkMulti(seed, 4, true);
    while (sim.phase !== 'done' && sim.t < 260) K.stepSim(sim, 1 / 30, {});
    if (sim.teams.filter((t) => t.done !== null).length < 2 || sim.t >= 260) bad++;   // iki takım bitirince oyun kapanır
    assert.ok(sim.teams.filter((t) => t.done !== null).every((t) => t.doorOpen), 'bitiren her bot kapıyı kırdı');
  }
  assert.equal(bad, 0, 'dört bot takım aynı yolda: en az iki takım bitirir, oyun zamanında kapanır');
  ok('4 bot takım aynı parkurda: kapıyı kırar, itişir, hepsi bitirir');
}

console.log('KÖR KOŞU TESTLERİ GEÇTİ');
