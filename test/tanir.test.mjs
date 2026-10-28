// Ne Kadar Tanıyorsun? kural testleri
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as T from '../public/games/tanir.js';

const A = 'aaaaaaa', Bp = 'bbbbbbb', Cp = 'ccccccc', Dp = 'ddddddd';
const ok = (m) => console.log('✓ ' + m);

async function start(humans) {
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: humans[0], name: 'P0' }, 0);
  const code = r.state.code;
  for (let i = 1; i < humans.length; i++) await handle(st, { action: 'join', code, playerId: humans[i], name: 'P' + i }, 0);
  if (humans.length === 1) await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: humans[0], mode: 'tanir' }, 0);
  r = await handle(st, { action: 'start', code, playerId: humans[0] }, 0);
  return { st, code, r };
}
const seen = async (st, code, humans, now) => { for (const h of humans) await handle(st, { action: 'state', code, playerId: h }, now); };
const gate = async (st, code, r, humans) => { // takım ekranı: herkes Tamam
  if (r.state.gate) for (const h of humans) r = await handle(st, { action: 'teamReady', code, playerId: h, seq: r.state.seq }, 1);
  return r;
};

// ---------- Çekirdek ----------
{
  const env = { players: [A, Bp, Cp, Dp].map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) };
  const g = T.init([A, Bp, Cp, Dp], env);
  assert.equal(g.teams.length, 2); assert.ok(g.teams.every((t) => t.members.length === 2));
  assert.equal(new Set(g.teams.flatMap((t) => t.members)).size, 4, 'herkes tek takımda');
  assert.equal(g.qs.length, T.Q_COUNT);
  const d = { round: 1, roundStart: 0, g, actions: {} };
  assert.throws(() => T.normalize(d, A, { a: [0, 1] }), /cevapla/);
  assert.throws(() => T.normalize(d, A, { a: [0, 1, 2, 3, 9] }), /cevapla/);
  const ans = { [A]: [0, 1, 2, 3, 0], [Bp]: [1, 1, 1, 1, 1], [Cp]: [2, 2, 2, 2, 2], [Dp]: [3, 3, 3, 3, 3] };
  T.resolve(d, Object.fromEntries(Object.entries(ans).map(([k, a]) => [k, { a }])));
  assert.deepEqual(g.answers[A], ans[A]);
  // takım turu: ilk takım
  d.round = 2;
  const t = g.teams[0], [m1, m2] = t.members;
  const other = g.teams[1].members[0];
  assert.throws(() => T.normalize(d, other, { g: {} }), /başka takım/);
  assert.throws(() => T.normalize(d, m1, { g: { [m2]: [0, 0] } }), /tahmin/);
  const v = T.view(d, other);
  assert.equal(v.mine, false); assert.ok(!JSON.stringify(v).includes('"answers"'), 'cevaplar gizli'); assert.ok(!('scores' in v), 'skorlar oyun sırasında gönderilmez');
  const vm = T.view(d, m1); assert.deepEqual(vm.mates, [m2]);
  // m1, m2'nin 5 cevabından 3'ünü bilir; m2, m1'in hepsini bilir
  const guess1 = ans[m2].map((x, i) => (i < 3 ? x : (x + 1) % 4));
  const { entry } = T.resolve(d, { [m1]: T.normalize(d, m1, { g: { [m2]: guess1 } }), [m2]: T.normalize(d, m2, { g: { [m1]: ans[m1] } }) });
  assert.equal(g.scores[m1], 3 * 100 + 5 * 100, 'm1: kendi 3 doğru tahmin + m2\'nin 5 doğrusu');
  assert.equal(g.scores[m2], 5 * 100 + 3 * 100);
  assert.equal(entry.phase, 'team'); assert.ok(!('rows' in entry) && !('scores' in entry), 'giriş kaydında cevap/skor yok');
  assert.equal(g.review.rows.length, T.Q_COUNT); assert.equal(g.review.rows[0].truth[m2], ans[m2][0]); assert.equal(g.review.correct[m1], 3 + 0);
  ok('Çekirdek: takımlar, doğrulama, gizlilik, puanlama (iki taraf da kazanır)');
  // inceleme turu: cevaplar açık, yalnızca oda sahibi geçirir, skor yok
  d.round = 3; d.hostId = A; d.deadline = 1e9;
  const rv = T.view(d, other);
  assert.equal(rv.phase, 'review'); assert.equal(rv.review.rows.length, T.Q_COUNT); assert.ok(!('scores' in rv) && !JSON.stringify(rv).includes('"scores"'), 'inceleme sırasında skor yok');
  assert.equal(T.isDue(d, 5, () => true), false, 'oda sahibi basmadan inceleme bitmez');
  assert.throws(() => T.gact(d, Bp, { t: 'next', round: 3 }), /oda sahibi/);
  assert.equal(T.gact(d, A, { t: 'next', round: 2 }), false, 'eski tura ait basış yok sayılır');
  assert.equal(T.gact(d, A, { t: 'next', round: 3 }), true); assert.equal(T.isDue(d, 5, () => true), true);
  assert.equal(T.resolve(d, {}).dur, 0); assert.equal(d.g.review, null);
  assert.equal(T.isDue({ ...d, g: { ...d.g, next: false }, deadline: 100 }, 5000, () => true), true, 'güvenlik süresi dolunca kendiliğinden geçer');
  // sıralama ve eksik cevap
  d.round = 4;
  const t2 = g.teams[1], [n1, n2] = t2.members;
  g.answers[n2] = null;                                           // n2 hiç cevaplamadı → onun hakkındaki tahminler puan getirmez
  T.resolve(d, { [n1]: { g: { [n2]: [0, 0, 0, 0, 0] } }, [n2]: { g: { [n1]: ans[n1] } } });
  assert.equal(g.scores[n1], 500, 'n1 yalnızca n2 tahminini doğru bildi (n2 cevaplamadığından n1 kazanmaz)');
  assert.equal(T.ranking(d, [A, Bp, Cp, Dp]), null, 'son inceleme bitmeden sıralama yok');
  d.round = T.lastRound(g);
  const rk = T.ranking(d, [A, Bp, Cp, Dp]);
  assert.ok(Array.isArray(rk) && rk.flat().length === 4);
  ok('Eksik cevap puan getirmez, sıralama tam');
}

// ---------- Uçtan uca: 4 insan ----------
{
  const hs = [A, Bp, Cp, Dp];
  const { st, code, r: r0 } = await start(hs);
  let r = await gate(st, code, r0, hs);
  const seq = r.state.seq; let now = r.state.roundStart;
  assert.equal(r.state.g.phase, 'profile');
  const qs = r.state.g.qs;
  assert.equal(qs.length, 5);
  await seen(st, code, hs, now - 500);
  for (const h of hs) r = await handle(st, { action: 'act', code, playerId: h, seq, round: 1, a: [0, 1, 2, 3, 0] }, now);
  assert.equal(r.state.round, 2, 'herkes cevaplayınca takım turu başlar');
  now = r.state.roundStart;
  await seen(st, code, hs, now - 500);
  r = await handle(st, { action: 'state', code, playerId: A }, now);
  const team = r.state.g.team, spect = hs.filter((h) => !team.includes(h))[0];
  await assert.rejects(handle(st, { action: 'act', code, playerId: spect, seq, round: 2, g: {} }, now), /izliyorsun/);
  const [m1, m2] = team;
  const gu = (id) => ({ [id]: [0, 1, 2, 3, 0] });
  r = await handle(st, { action: 'act', code, playerId: m1, seq, round: 2, g: gu(m2) }, now);
  assert.equal(r.state.round, 2, 'takım arkadaşı gönderene dek açılmaz');
  r = await handle(st, { action: 'act', code, playerId: m2, seq, round: 2, g: gu(m1) }, now);
  assert.equal(r.state.round, 3, 'ikisi de gönderince cevaplar açılır (inceleme turu)');
  assert.equal(r.state.last.phase, 'team');
  assert.equal(r.state.g.phase, 'review'); assert.equal(r.state.g.review.rows.length, 5); assert.equal(r.state.g.review.gains[m1], 1000);
  assert.ok(!JSON.stringify(r.state.g).includes('"scores"'), 'inceleme: skor yok');
  now = r.state.roundStart + 1;
  // süre ve diğer oyuncular ne yaparsa yapsın inceleme kendiliğinden ilerlemez
  await seen(st, code, hs, now);
  for (const h of hs) { r = await handle(st, { action: 'state', code, playerId: h }, now + 20000); }
  assert.equal(r.state.round, 3, 'oda sahibi basmadan inceleme sürer');
  const nonHost = hs.find((h) => h !== A);
  await assert.rejects(handle(st, { action: 'gact', code, playerId: nonHost, seq, round: 3, t: 'next' }, now + 20000), /oda sahibi/);
  now += 20000;
  r = await handle(st, { action: 'gact', code, playerId: A, seq, round: 3, t: 'next' }, now);
  assert.equal(r.state.round, 4, 'oda sahibi Sonraki → ikinci takım');
  now = r.state.roundStart;
  await seen(st, code, hs, now - 500);
  r = await handle(st, { action: 'state', code, playerId: A }, now);
  const t2 = r.state.g.team;
  assert.equal(r.state.g.phase, 'team');
  for (const id of t2) r = await handle(st, { action: 'act', code, playerId: id, seq, round: 4, g: Object.fromEntries(t2.filter((x) => x !== id).map((x) => [x, [0, 1, 2, 3, 0]])) }, now);
  assert.equal(r.state.g.phase, 'review'); assert.equal(r.state.g.isLast, true, 'son takımın incelemesi');
  assert.equal(r.state.status, 'playing', 'son inceleme bitmeden oyun bitmez, skor yok');
  now = r.state.roundStart + 1;
  r = await handle(st, { action: 'gact', code, playerId: A, seq, round: 5, t: 'next' }, now);
  assert.notEqual(r.state.status, 'playing', 'oda sahibi Skorları göster → oyun biter');
  assert.ok(r.state.tour.results.length === 1 && r.state.tour.results[0].ranking.flat().length === 4);
  ok('Uçtan uca: profil → takım 1 → inceleme (oda sahibi geçirir) → takım 2 → inceleme → skorlar (4 insan)');
}

// ---------- 1 insan + bot: geçici/ bot takım arkadaşı ----------
{
  const { st, code, r: r0 } = await start([A]);
  let r = await gate(st, code, r0, [A]);
  let now = r.state.deadline + 30000;
  for (let i = 0; i < 20 && r.state.status === 'playing'; i++) {
    r = await handle(st, { action: 'state', code, playerId: A }, now);
    if (r.state.status === 'playing' && r.state.g.phase === 'review') r = await handle(st, { action: 'gact', code, playerId: A, seq: r.state.seq, round: r.state.round, t: 'next' }, now);
    now = Math.max(now + 1, r.state.deadline + 30000);
  }
  assert.notEqual(r.state.status, 'playing', 'süre dolunca / oda sahibi geçirince oyun biter');
  ok('1 insan + bot: oyun süreyle sonuçlanır');
}
console.log('Ne Kadar Tanıyorsun testleri tamam');
