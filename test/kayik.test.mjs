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
    assert.ok(c.LEN > 110 && c.LEN < 200, 'nehir uzunluğu ' + c.LEN);
    for (let i = 0; i < c.n; i++) assert.ok(c.w[i] >= K.HW_NARROW - 1e-6 && c.w[i] <= K.HW_MAX + 1e-6);
    for (let i = 0; i < c.n; i++) assert.ok(Math.abs(c.line[i]) < c.w[i], 'bot çizgisi nehrin içinde');
    for (const rk of c.rocks) assert.ok(Math.abs(rk.d) - rk.r < K.widthAt(c, rk.s), 'kaya nehirde');
    assert.ok(c.cps.length >= 5 && c.cps[0] === 0);
  }
  for (const k of Object.keys(tot)) assert.ok(tot[k] > 0, k + ' hiç üretilmedi');
  ok(`Nehir tohumdan aynı üretiliyor; 40 tohumda: ${Object.entries(tot).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

// ---------- Kenarda konum: çubuk karakterin dış kenardaki yerini seçer ----------
{
  const sim = racing(77, [teamDef(0, 'L', 'R')]);
  const b = sim.boats[0], st = b.seats[0];
  st.a = 0;
  run(sim, 0.1, { L: { x: 0, y: 1 } });              // çubuk aşağı: karakter kenarın alt (+y) tarafına geçer
  assert.ok(K.angN(st.a) > 0 && K.angN(st.a) < K.ROT_V * 0.1 + 1e-6, 'çubuğa doğru yavaş yavaş döner: ' + st.a.toFixed(2));
  run(sim, 1, { L: { x: 0, y: 1 } });
  assert.ok(Math.abs(K.angN(st.a - Math.PI / 2)) < 0.01, 'çubuğun gösterdiği yerde durur');
  run(sim, 0.5, { L: { x: 0.1, y: 0.1 } });
  assert.ok(Math.abs(K.angN(st.a - Math.PI / 2)) < 0.01, 'küçük (ölü bölge) hareket konumu değiştirmez');
  run(sim, 1, { L: { x: -1, y: 0 } });
  assert.ok(Math.abs(K.angN(st.a - Math.PI)) < 0.01, 'sola çekince sol kenara geçer');
  ok('Kenarda konum: çubuk yönüne hızla döner, ölü bölgede sabit kalır');
}

// ---------- Gaz: karakterin tersine itiş; aynı tarafta toplanır, zıt tarafta sönümlenir; depo ----------
{
  const setup = (a0, a1) => { const sim = racing(77, [teamDef(0, 'L', 'R')]); const b = sim.boats[0]; b.seats[0].a = a0; b.seats[1].a = a1; b.vx = b.vy = 0; b.inv = 1e9; return { sim, b }; };
  const push = (a0, a1, pl, pr, secs = 1) => {
    const { sim, b } = setup(a0, a1);
    const c = sim.c, wt0 = K.water(c, b.s, b.d, b.x, b.y); // akıntı payını çıkarmak için karşılaştırma: boş kayık
    const x0 = b.x, y0 = b.y;
    run(sim, secs, { L: { push: pl, x: Math.cos(a0), y: Math.sin(a0) }, R: { push: pr, x: Math.cos(a1), y: Math.sin(a1) } });
    const e = setup(a0, a1); run(e.sim, secs, {});
    return { dx: b.x - e.b.x, dy: b.y - e.b.y, d: Math.hypot(b.x - e.b.x, b.y - e.b.y) };
  };
  // karakter +x tarafında (a=0) gaz salar → kayık −x yönüne gider
  const r1 = push(0, 0, true, false);
  assert.ok(r1.dx < -0.6 && Math.abs(r1.dy) < 0.4, `kayık karakterin tersine gider (dx=${r1.dx.toFixed(2)}, dy=${r1.dy.toFixed(2)})`);
  const r2 = push(Math.PI / 2, Math.PI / 2, true, false);
  assert.ok(r2.dy < -0.6 && Math.abs(r2.dx) < 0.4, 'alttaki karakter kayığı yukarı iter');
  // iki oyuncu aynı tarafta: daha güçlü; zıt taraflarda: birbirini götürür
  const same = push(0, 0, true, true), one = push(0, 0, true, false), opp = push(0, Math.PI, true, true);
  assert.ok(same.d > one.d * 1.5, `aynı tarafta birlikte daha güçlü (${same.d.toFixed(1)} > ${one.d.toFixed(1)})`);
  assert.ok(opp.d < one.d * 0.4, `zıt taraflarda birbirini götürür (${opp.d.toFixed(1)})`);
  // basmayan itmez
  assert.ok(push(0, 0, false, false).d < 0.05, 'gaz yoksa itiş yok');
  // gaz deposu: basılı tutunca boşalır, kilitlenir, bırakınca dolar
  const { sim, b } = setup(0, 0);
  run(sim, 0.5, { L: { push: true, x: 1, y: 0 } });
  assert.ok(b.seats[0].tank < 0.85 && b.seats[0].gas === 1, 'basılı tutunca depo azalır');
  run(sim, 1.62, { L: { push: true, x: 1, y: 0 } });
  assert.ok(b.seats[0].tank < 0.05 && b.seats[0].gas === 0 && b.seats[0].lock, 'depo bitince gaz kesilir');
  run(sim, 0.2, { L: { push: true, x: 1, y: 0 } });
  assert.equal(b.seats[0].gas, 0, 'dolmadan basılsa da gaz çıkmaz (kilit)');
  run(sim, 4, {});
  assert.ok(b.seats[0].tank > 0.9 && !b.seats[0].lock, 'bırakınca depo dolar, kilit açılır');
  ok('Gaz: karakterin tersine iter, aynı tarafta toplanır, zıt tarafta söner, depo boşalır/dolar/kilitlenir');
}

// ---------- Kıyılar katı: kayık nehirden çıkmaz ----------
{
  const sim = racing(9, [teamDef(0, 'L', 'R')]), b = sim.boats[0], c = sim.c;
  const f = K.frame(c, b.s);
  // sol kıyıya doğru it: itiş yönü = sol normal → karakterler sağ kenarda (normalin tersi tarafında) durur
  const a = Math.atan2(-f.ny, -f.nx);
  b.seats[0].a = a; b.seats[1].a = a;
  let worst = 0, bumps = 0;
  for (let i = 0; i < 150; i++) {
    bumps += K.stepSim(sim, DT, { L: { push: true, x: Math.cos(a), y: Math.sin(a) }, R: { push: true, x: Math.cos(a), y: Math.sin(a) } }).filter((e) => e.e === 'bump' || e.e === 'boom').length;
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
  assert.ok(fin / tot >= 0.8, `botlar en az %80 bitirmeli: ${fin}/${tot}`);
  assert.ok(Math.max(...times) < K.MAX_TIME);
  // insan + bot: insan sadece GAZ'a basılı tutsa (yön vermese) bile bitirebilmeli
  const hb = racing(103, [teamDef(0, 'h', 'bot', [false, true])]);
  while (hb.phase !== 'done') K.stepSim(hb, DT, { h: { push: true } });
  assert.ok(hb.phase === 'done', 'insan+bot takımı ilerler (yön vermeyen insan patlatabilir)');
  ok(`Bot takımları ${fin}/${tot} bitirdi (12 tohum, sn): ${lines.join(' ')}; insan+bot ${hb.boats[0].done === null ? 'bitiremedi' : hb.boats[0].done.toFixed(0) + ' sn'}`);
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
    assert.ok(Math.abs(r.seats[0].a - b.seats[0].a) < 0.01 && Math.abs(r.seats[1].a - b.seats[1].a) < 0.01); assert.equal(r.seats[0].gas, b.seats[0].gas); assert.ok(Math.abs(r.seats[1].tank - b.seats[1].tank) < 0.01);
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
