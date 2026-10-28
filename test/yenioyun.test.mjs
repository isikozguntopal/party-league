// Sürü, Ayar, Telve: kurallar + oda akışı
import assert from 'node:assert/strict';
import { handle, MemoryStore, TOUR } from '../public/game-core.js';
import * as SU from '../public/games/suru.js';
import * as AY from '../public/games/ayar.js';
import * as TE from '../public/games/telve.js';
import { CARD_COUNT, cardSrc } from '../public/games/telve-kartlar.js';
import { existsSync } from 'node:fs';

const ok = (m) => console.log('✓ ' + m);
const A = 'aaaaaaa', B = 'bbbbbbb', C = 'ccccccc';
for (const k of ['suru', 'ayar', 'telve']) assert.ok(TOUR.includes(k));

// ---- Sürü puanlaması
{
  const g = SU.init(['a', 'b', 'c', 'd'], { players: ['a', 'b', 'c', 'd'].map((id) => ({ id, bot: false })) });
  const d = { round: 1, g };
  const { entry } = SU.resolve(d, { a: { o: 0 }, b: { o: 0 }, c: { o: 0 }, d: { o: 1 } });
  assert.equal(entry.gains.a, 2 + SU.HERD_BONUS); assert.equal(entry.gains.d, 0); assert.deepEqual(entry.black, ['d']);
  const r2 = SU.resolve({ round: 2, g }, { a: { o: 0 }, b: { o: 0 }, c: { o: 1 }, d: { o: 1 } });
  assert.equal(r2.entry.gains.a, 1 + SU.HERD_BONUS, 'eşit büyük iki grup da sürü sayılır'); assert.equal(r2.entry.black.length, 0);
  const r3 = SU.resolve({ round: 3, g }, { a: { o: null }, b: { o: 2 }, c: { o: 2 }, d: { o: 3 } });
  assert.equal(r3.entry.gains.a, 0); assert.equal(r3.entry.gains.b, 1 + SU.HERD_BONUS);
  assert.equal(new Set(g.qs.map((q) => q.qi)).size, SU.ROUNDS);
  ok('Sürü: kalabalıkla aynı şık puan + sürü bonusu, tek kalan kara koyun 0');
}
// ---- Ayar puanlaması
{
  assert.equal(AY.pointsFor(2), 4); assert.equal(AY.pointsFor(9), 3); assert.equal(AY.pointsFor(15), 2); assert.equal(AY.pointsFor(25), 1); assert.equal(AY.pointsFor(60), 0);
  const g = AY.init(['a', 'b', 'c'], { players: ['a', 'b', 'c'].map((id) => ({ id, bot: false })) });
  const giver = g.order[0], others = ['a', 'b', 'c'].filter((x) => x !== giver);
  g.targets[0] = 50; const d = { round: 1, g, deadline: 0 };
  AY.resolve(d, { [giver]: { clue: 'yarım yamalak' } }); d.round = 2;
  const v = AY.view({ round: 2, g }, others[0]); assert.equal(v.target, null, 'hedef anlatıcı dışında gizli'); assert.equal(v.clue, 'yarım yamalak');
  assert.equal(AY.view({ round: 2, g }, giver).target, 50);
  const { entry } = AY.resolve(d, { [others[0]]: { v: 52 }, [others[1]]: { v: 90 } });
  assert.equal(entry.rows.find((r) => r.id === others[0]).pts, 4); assert.equal(entry.rows.find((r) => r.id === others[1]).pts, 0);
  assert.equal(g.score[giver], 2, 'anlatıcı ortalamayı alır');
  assert.throws(() => AY.normalize({ round: 2, g }, giver, { v: 5 }), /Anlatıcı/);
  // anlatıcı iki uç yazısını kendisi değiştirebilir
  { const g2 = AY.init(['a', 'b', 'c'], { players: ['a', 'b', 'c'].map((id) => ({ id, bot: false })) }), gv = g2.order[0], d1 = { round: 1, g: g2 };
    const act = AY.normalize(d1, gv, { clue: 'uzakta', left: '  Çok\nsoğuk ', right: 'Kaynar' }); assert.deepEqual([act.left, act.right], ['Çok soğuk', 'Kaynar']);
    AY.resolve(d1, { [gv]: act }); assert.deepEqual(AY.view({ round: 2, g: g2 }, 'x').axis, ['Çok soğuk', 'Kaynar'], 'özel uçlar herkese görünür');
    const dflt = AY.normalize(d1, gv, { clue: 'uzakta' }); assert.ok(dflt.left.length && dflt.right.length, 'verilmezse varsayılan uçlar'); }
  ok('Ayar: bantlara göre puan, hedef gizli, anlatıcı ortalamayı alır');
}
// ---- Telve puanlaması
{
  const env = { players: ['a', 'b', 'c', 'd'].map((id) => ({ id, bot: false })) };
  const g = TE.init(['a', 'b', 'c', 'd'], env);
  const teller = g.order[0], rest = ['a', 'b', 'c', 'd'].filter((x) => x !== teller);
  assert.ok(Object.values(g.hands).every((h) => h.length === TE.HAND) && new Set(Object.values(g.hands).flat()).size === 20, 'eller benzersiz');
  const d = { round: 1, g };
  const tc = g.hands[teller][0];
  TE.resolve(d, { [teller]: { card: tc, clue: 'uzak bir yol' } }); d.round = 2;
  const picks = Object.fromEntries(rest.map((id) => [id, { card: g.hands[id][0] }]));
  TE.resolve(d, picks); d.round = 3;
  assert.equal(g.story.table.length, 4);
  const v = TE.view(d, rest[0]); assert.equal(v.table.length, 4); assert.ok(v.table.every((x) => !('owner' in x)), 'sahipler gizli'); assert.equal(v.table.filter((x) => x.mine).length, 1);
  // rest[0] ve rest[1] doğruyu bulur; rest[2] rest[0]'ın kartına oy verir
  const votes = { [rest[0]]: { card: tc }, [rest[1]]: { card: tc }, [rest[2]]: { card: picks[rest[0]].card } };
  const { entry } = TE.resolve(d, votes);
  assert.equal(entry.gains[teller], 3); assert.equal(entry.gains[rest[1]], 3); assert.equal(entry.gains[rest[0]], 3 + 1, 'doğruyu bulan + kendi kartına gelen oy'); assert.equal(entry.gains[rest[2]], 0);
  assert.ok(Object.values(g.hands).every((h) => h.length === TE.HAND), 'eller yenilendi');
  // kimse bulamazsa Falcı 0, diğerleri 2
  const g2 = TE.init(['a', 'b', 'c'], { players: ['a', 'b', 'c'].map((id) => ({ id, bot: false })) });
  const t2 = g2.order[0], r2 = ['a', 'b', 'c'].filter((x) => x !== t2), d2 = { round: 1, g: g2 };
  TE.resolve(d2, { [t2]: { card: g2.hands[t2][0], clue: 'x yy' } }); d2.round = 2;
  TE.resolve(d2, Object.fromEntries(r2.map((id) => [id, { card: g2.hands[id][0] }]))); d2.round = 3;
  const dec = (id) => g2.story.table.find((x) => x.owner === id).card;
  assert.throws(() => TE.normalize({ round: 3, g: g2 }, r2[0], { card: dec(r2[0]) }), /Kendi/);
  const res = TE.resolve(d2, { [r2[0]]: { card: dec(r2[1]) }, [r2[1]]: { card: dec(r2[0]) } });
  assert.equal(res.entry.gains[t2], 0); assert.ok(res.entry.none);
  assert.ok(CARD_COUNT >= 100, 'en az 100 kart');
  for (let i = 0; i < CARD_COUNT; i++) assert.ok(existsSync('public/' + cardSrc(i)), 'resim var: ' + cardSrc(i));
  ok('Telve: bulan +3, Falcı +3 (herkes/hiç kimse bilirse 0, diğerleri +2), yem oyları, eller yenilenir, sahipler gizli');
}
// ---- Oda akışı: üç oyun da uçtan uca biter (insan göndermese bile süre dolunca)
for (const kind of ['suru', 'ayar', 'telve']) {
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'join', code, playerId: B, name: 'Banu' }, 0);
  await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: kind }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  assert.equal(r.state.kind, kind);
  let now = 0, guard = 0;
  while (r.state.status !== 'over' && guard++ < 400) {
    now = Math.max(now + 1, r.state.status === 'inter' ? r.state.interUntil + 1 : r.state.deadline + 1100);
    await handle(st, { action: 'state', code, playerId: B }, now - 5);
    r = await handle(st, { action: 'state', code, playerId: A }, now);
  }
  assert.equal(r.state.status, 'over', kind + ' bitmeli');
  const rk = r.state.tour.results[0].ranking.flat();
  assert.ok(rk.length >= 3 && rk.includes(A) && rk.includes(B), kind + ' sıralama herkesi kapsar');
  ok(`${kind}: oda akışı uçtan uca bitti (${rk.length} kişi)`);
}
console.log('YENİ OYUN TESTLERİ GEÇTİ');
