// Kayık Kafilesi testleri: node test/kayik.test.mjs
import assert from 'node:assert/strict';
import * as K from '../public/games/kayik.js';

const ok = (m) => console.log('✓ ' + m);
const DT = 1 / 30;
const teamDef = (id, a, b, bots = [false, false]) => ({ id, members: [a, b], bots });
// Yarışı başlat (geri sayımı geç)
function racing(seed, teams) {
  const sim = K.createSim(teams.flatMap((t) => t.members.map((id, k) => ({ id, bot: t.bots[k] }))), { seed, teams });
  K.startCountdown(sim);
  while (sim.phase !== 'race') K.stepSim(sim, DT, {});
  return sim;
}
const run = (sim, secs, inputs) => { const evs = []; for (let i = 0; i < Math.round(secs / DT); i++) evs.push(...K.stepSim(sim, DT, typeof inputs === 'function' ? inputs(i) : inputs)); return evs; };

// ---------- Nehir: tohumdan aynı üretilir ----------
{
  const pick = (c) => JSON.stringify({ L: c.LEN, px: c.px.slice(0, 50), w: Array.from(c.w.slice(0, 200)), rocks: c.rocks, logs: c.logs, whirls: c.whirls, rapids: c.rapids, narrows: c.narrows, line: Array.from(c.line.slice(0, 200)) });
  const a = pick(K.course(4242));
  for (let s = 1; s <= 14; s++) K.course(s); // önbellekten düşsün
  assert.equal(pick(K.course(4242)), a, 'aynı tohum aynı nehri vermeli');
  assert.notEqual(pick(K.course(4243)), a, 'farklı tohum farklı nehir');
  const tot = { rocks: 0, logs: 0, whirls: 0, rapids: 0, narrows: 0 };
  for (let s = 1; s <= 40; s++) {
    const c = K.course(s);
    for (const k of Object.keys(tot)) tot[k] += c[k].length;
    assert.ok(c.LEN > 190 && c.LEN < 280, 'nehir uzunluğu ' + c.LEN);
    for (let i = 0; i < c.n; i++) assert.ok(c.w[i] >= K.HW_NARROW - 1e-6 && c.w[i] <= K.HW_MAX + 1e-6);
    for (let i = 0; i < c.n; i++) assert.ok(Math.abs(c.line[i]) < c.w[i], 'bot çizgisi nehrin içinde');
    for (const rk of c.rocks) assert.ok(Math.abs(rk.d) - rk.r < K.widthAt(c, rk.s), 'kaya nehirde');
    assert.ok(c.cps.length >= 5 && c.cps[0] === 0);
  }
  for (const k of Object.keys(tot)) assert.ok(tot[k] > 0, k + ' hiç üretilmedi');
  ok(`Nehir tohumdan aynı üretiliyor; 40 tohumda: ${Object.entries(tot).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

// ---------- Kürek: tek taraf döndürür, iki taraf düz gider ----------
{
  const seed = 77;
  const turn = (inp) => {
    const sim = racing(seed, [teamDef(0, 'L', 'R')]);
    const b = sim.boats[0], h0 = b.h, x0 = b.x, y0 = b.y;
    run(sim, 1.0, inp);
    return { dh: K.angN(b.h - h0), dist: Math.hypot(b.x - x0, b.y - y0) };
  };
  const left = turn({ L: { push: true } }), right = turn({ R: { push: true } }), both = turn({ L: { push: true }, R: { push: true } }), none = turn({});
  assert.ok(left.dh > 0.4, 'yalnız sol kürek → sağa (saat yönü) dönmeli: ' + left.dh.toFixed(2));
  assert.ok(right.dh < -0.4, 'yalnız sağ kürek → sola dönmeli: ' + right.dh.toFixed(2));
  assert.ok(Math.abs(both.dh) < 0.1, 'ikisi birlikte → düz: ' + both.dh.toFixed(2));
  assert.ok(both.dist > left.dist && both.dist > none.dist + 1, 'ikisi birlikte daha hızlı');
  // çubuk aşağı = geri kürek: tek başına ters yöne döndürür, ikisi birlikte yavaşlatır
  const backL = turn({ L: { y: 1 } });
  assert.ok(backL.dh < -0.1, 'sol geri kürek → sola döner');
  // dümen: çubuk yana küçük dönüş verir
  const sweep = turn({ L: { push: true, x: 1 }, R: { push: true, x: 1 } });
  assert.ok(sweep.dh > 0.1 && sweep.dh < left.dh, 'çubukla dümen hafif sağa çevirir');
  // ritim: aynı anda başlayan kürekler senkron ve daha hızlı
  const sync = racing(seed, [teamDef(0, 'L', 'R')]);
  run(sync, 1.5, { L: { push: true }, R: { push: true } });
  const off = racing(seed, [teamDef(0, 'L', 'R')]);
  run(off, 1.5, (i) => (i < 13 ? { L: { push: true } } : { L: { push: true }, R: { push: true } }));
  assert.ok(sync.boats[0].sync > 0.95 && off.boats[0].sync < 0.2, `senkron ${sync.boats[0].sync.toFixed(2)} / ${off.boats[0].sync.toFixed(2)}`);
  ok(`Kürek: sol→sağa ${left.dh.toFixed(2)} rad, sağ→sola ${right.dh.toFixed(2)} rad, ikisi düz (${both.dh.toFixed(2)}) ve ${both.dist.toFixed(1)} m; geri kürek, dümen, ritim senkronu`);
}

// ---------- 💨 gaz: birlikte = güçlü ve düz, tek = fırıldak ----------
{
  const s1 = racing(5, [teamDef(0, 'L', 'R')]), b1 = s1.boats[0];
  const v0 = Math.hypot(b1.vx, b1.vy), h0 = b1.h;
  let ev = run(s1, DT, { L: { bomb: true }, R: { bomb: true } });
  const e1 = ev.find((e) => e.e === 'burst');
  assert.ok(e1 && e1.sync === 1, 'aynı anda basınca senkron gaz');
  assert.ok(Math.hypot(b1.vx, b1.vy) - v0 > 3.5 && Math.abs(b1.w) < 0.3, 'senkron gaz hızlı ve düz');
  run(s1, 0.5, {});
  assert.ok(Math.abs(K.angN(b1.h - h0)) < 0.15, 'senkron gaz yönü bozmaz');
  // 0,2 sn arayla basmak da senkron sayılır
  const s2 = racing(5, [teamDef(0, 'L', 'R')]);
  ev = run(s2, 0.25, (i) => (i === 0 ? { R: { bomb: true } } : i === 6 ? { L: { bomb: true } } : {}));
  assert.ok(ev.some((e) => e.e === 'burst' && e.sync === 1), '0,2 sn içinde senkron');
  // tek başına: 0,3 sn sonra patlar ve kayığı döndürür
  const s3 = racing(5, [teamDef(0, 'L', 'R')]), b3 = s3.boats[0], h3 = b3.h;
  ev = run(s3, 0.2, (i) => (i === 0 ? { L: { bomb: true } } : {}));
  assert.ok(!ev.some((e) => e.e === 'burst'), 'arkadaş beklenirken patlamaz');
  assert.equal(b3.pend && b3.pend.seat, 0);
  ev = run(s3, 0.3, {});
  const e3 = ev.find((e) => e.e === 'burst');
  assert.ok(e3 && e3.sync === 0 && e3.seat === 0, 'süre dolunca tek gaz');
  run(s3, 0.5, {});
  assert.ok(K.angN(b3.h - h3) > 0.8, 'sol koltuğun tek gazı kayığı sağa fırlatır: ' + K.angN(b3.h - h3).toFixed(2));
  // geç kalan ikinci basış ayrı bir tek gaz olur; bekleme süresi
  const s4 = racing(5, [teamDef(0, 'L', 'R')]);
  ev = run(s4, 1.2, (i) => (i === 0 ? { L: { bomb: true } } : i === 15 ? { R: { bomb: true } } : {}));
  assert.equal(ev.filter((e) => e.e === 'burst' && e.sync === 0).length, 2, 'geç basış: iki ayrı tek gaz');
  ev = run(s4, 1, { L: { bomb: true }, R: { bomb: true } });
  assert.ok(!ev.some((e) => e.e === 'burst'), `bekleme süresi (${K.BURST_CD} sn) dolmadan gaz yok`);
  // bot arkadaş insanın gazına katılır
  const s5 = racing(5, [teamDef(0, 'H', 'B', [false, true])]);
  ev = run(s5, 0.5, (i) => (i === 0 ? { H: { bomb: true } } : {}));
  assert.ok(ev.some((e) => e.e === 'burst' && e.sync === 1), 'bot arkadaş gaza katılır');
  ok('Gaz: birlikte (≤0,3 sn) güçlü ve düz; tek başına gecikmeli ve fırıldak; bekleme süresi; bot katılır');
}

// ---------- Kıyılar katı: kayık nehirden çıkmaz ----------
{
  const sim = racing(9, [teamDef(0, 'L', 'R')]), b = sim.boats[0], c = sim.c;
  b.h += Math.PI / 2; // kıyıya dik
  let worst = 0, bumps = 0;
  for (let i = 0; i < 150; i++) {
    bumps += K.stepSim(sim, DT, { L: { push: true }, R: { push: true } }).filter((e) => e.e === 'bump').length;
    worst = Math.max(worst, Math.abs(b.d) - (K.widthAt(c, b.s) - K.HULL_R));
  }
  assert.ok(worst < 0.05, 'kıyıya girmemeli: ' + worst.toFixed(3));
  assert.ok(bumps >= 1, 'kıyıya çarpma olayı');
  // bot yarışlarında da hiçbir kayık kıyıdan dışarı taşmaz
  const s2 = racing(31, [0, 1, 2, 3].map((i) => teamDef(i, 'a' + i, 'b' + i, [true, true])));
  let w2 = -Infinity;
  for (let i = 0; i < 30 * 40; i++) { K.stepSim(s2, DT, {}); for (const o of s2.boats) w2 = Math.max(w2, Math.abs(o.d) - K.widthAt(s2.c, o.s)); }
  assert.ok(w2 < 0, 'bot kayıkları nehirde kalır');
  ok(`Kıyılar katı: kayık sekip içeride kalır (en kötü ${worst.toFixed(3)}), ${bumps} çarpma`);
}

// ---------- Botlar nehri bitirir ----------
{
  const times = [], lines = [];
  let fin = 0, tot = 0;
  for (let seed = 101; seed <= 112; seed++) {
    const sim = racing(seed, [teamDef(0, 'a', 'b', [true, true]), teamDef(1, 'c', 'd', [true, true])]);
    while (sim.phase !== 'done') K.stepSim(sim, DT, {});
    for (const b of sim.boats) { tot++; if (b.done !== null) { fin++; times.push(b.done); } }
    lines.push(sim.boats.map((b) => (b.done !== null ? b.done.toFixed(0) : 'X')).join('/'));
    const rk = K.rankingOf(sim);
    assert.equal(rk.length, 2); assert.deepEqual(rk.flat().sort(), ['a', 'b', 'c', 'd']);
  }
  assert.ok(fin / tot >= 0.9, `botlar en az %90 bitirmeli: ${fin}/${tot}`);
  assert.ok(Math.max(...times) < K.MAX_TIME);
  // insan + bot: insan sadece İT'e bassa bile bitirebilmeli
  const hb = racing(103, [teamDef(0, 'h', 'bot', [false, true])]);
  while (hb.phase !== 'done') K.stepSim(hb, DT, { h: { push: true } });
  assert.ok(hb.boats[0].done !== null, 'insan+bot takımı bitirir');
  ok(`Bot takımları ${fin}/${tot} bitirdi (12 tohum, sn): ${lines.join(' ')}; insan+bot ${hb.boats[0].done.toFixed(0)} sn`);
}

// ---------- Anlık görüntü gidiş-dönüş ----------
{
  const sim = racing(12, [0, 1, 2, 3, 4, 5].map((i) => teamDef(i, 'a' + i, 'b' + i, [true, true])));
  run(sim, 6, {});
  const snap = K.snapshot(sim), json = JSON.stringify(snap);
  const st = K.readSnapshot(JSON.parse(json));
  assert.equal(st.phase, 'race'); assert.equal(st.seed, sim.seed);
  assert.equal(st.boats.length, 6);
  for (const b of sim.boats) {
    const r = st.boats.find((x) => x.id === b.id);
    assert.ok(Math.abs(r.x - b.x) < 0.01 && Math.abs(r.y - b.y) < 0.01 && Math.abs(r.h - b.h) < 0.01 && Math.abs(r.s - b.s) < 0.01);
    assert.equal(r.seats[0].mode, b.seats[0].mode); assert.equal(r.seats[1].mode, b.seats[1].mode);
    assert.equal(r.done, b.done);
  }
  assert.ok(json.length < 1600, 'görüntü küçük olmalı: ' + json.length);
  ok(`Anlık görüntü gidiş-dönüş (6 kayık: ${json.length} bayt)`);
}

// ---------- Takım bölme: tek sayıda oyuncuya geçici bot ----------
{
  let added = 0;
  const env = { players: [{ id: 'h1', bot: false }, { id: 'h2', bot: false }, { id: 'h3', bot: false }], addBot() { const e = { id: 'tmp' + ++added, bot: true }; env.players.push(e); return e; } };
  const g = K.init(env.players.map((p) => p.id), env);
  assert.equal(added, 1, 'tek sayıda insan → 1 geçici bot');
  assert.equal(g.teams.length, 2);
  for (const t of g.teams) assert.equal(t.members.length, 2);
  const mixed = g.teams.find((t) => t.members.includes('tmp1'));
  assert.deepEqual(mixed.bots, mixed.members.map((id) => id === 'tmp1'));
  assert.ok(g.alive.tmp1 && g.alive.h1 && g.alive.h2 && g.alive.h3);
  assert.ok(g.seed >= 0);
  const v = K.view({ g, players: [] }, 'h1', 0);
  assert.deepEqual(v.teams, g.teams); assert.equal(v.seed, g.seed);
  // 1 insan + 2 bot: insan bir botla, kalan bot geçici botla
  added = 0;
  const env2 = { players: [{ id: 'h', bot: false }, { id: 'b1', bot: true }, { id: 'b2', bot: true }], addBot() { const e = { id: 'tmp' + ++added, bot: true }; env2.players.push(e); return e; } };
  const g2 = K.init(env2.players.map((p) => p.id), env2);
  assert.equal(added, 1); assert.equal(g2.teams.length, 2);
  assert.ok(g2.teams.some((t) => t.members.includes('h') && t.bots.filter(Boolean).length === 1));
  assert.ok(g2.teams.some((t) => t.bots.every(Boolean)));
  // createSim botluğu oyuncu listesinden alır; setBot benzeri bayrak değişimi çalışır
  const sim = K.createSim([{ id: 'h' }, { id: 'b1', bot: true }, { id: 'b2', bot: true }, { id: 'tmp1', bot: true }], g2);
  assert.ok(sim.boats.every((b) => b.members.length === 2));
  ok('Takımlar: tek sayıda oyuncuya geçici bot; koltuklar sol/sağ; görünümde takımlar + tohum');
}
console.log('KAYIK TESTLERİ GEÇTİ');
