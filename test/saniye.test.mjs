// Kayıp Saniye: hedef süreye en yakın durduran kazanır; 4 tur, toplam sapma
import assert from 'node:assert/strict';
import { handle, MemoryStore, TOUR } from '../public/game-core.js';
import * as S from '../public/games/saniye.js';

const ok = (m) => console.log('✓ ' + m);
const A = 'aaaaaaa', Bp = 'bbbbbbb';
assert.ok(TOUR.includes('saniye'));

const st = new MemoryStore();
let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
const code = r.state.code;
await handle(st, { action: 'join', code, playerId: Bp, name: 'Banu' }, 0);
await handle(st, { action: 'mode', code, playerId: A, mode: 'saniye' }, 0);
r = await handle(st, { action: 'start', code, playerId: A }, 0);
const seq = r.state.seq;
assert.equal(r.state.kind, 'saniye'); assert.equal(r.state.g.rounds, S.ROUNDS);
let now = r.state.roundStart;
for (let round = 1; round <= S.ROUNDS; round++) {
  r = await handle(st, { action: 'state', code, playerId: A }, now + 50);
  assert.equal(r.state.round, round);
  const target = r.state.g.target;
  await assert.rejects(handle(st, { action: 'act', code, playerId: A, seq, round, t: 1000 }, now + 100), /Henüz başlamadı/);
  await handle(st, { action: 'state', code, playerId: Bp }, now + 120);
  r = await handle(st, { action: 'gact', code, playerId: A, seq, round, t: 'ready' }, now + 150);
  assert.equal(r.state.g.started, false, 'herkes hazır olmadan başlamaz');
  r = await handle(st, { action: 'gact', code, playerId: Bp, seq, round, t: 'ready' }, now + 200);
  assert.equal(r.state.g.started, true, 'herkes hazır deyince başlar'); const t0 = r.state.g.startAt; assert.equal(t0, now + 200 + S.COUNT_MS);
  await assert.rejects(handle(st, { action: 'act', code, playerId: A, seq, round, t: -5 }, t0 + 100), /Geçersiz/);
  await handle(st, { action: 'state', code, playerId: Bp }, t0 + target + 150);
  await handle(st, { action: 'act', code, playerId: A, seq, round, t: target + 100 }, t0 + target + 200);   // Ali 0,1 sn sapma
  r = await handle(st, { action: 'act', code, playerId: Bp, seq, round, t: target - 900 }, t0 + target + 300); // Banu 0,9 sn
  if (round < S.ROUNDS) {
    const row = r.state.last.rows;
    assert.equal(row[0].id, A, 'hedefe yakın olan önde'); assert.equal(row[0].err, 100); assert.equal(row[1].err, 900);
    now = r.state.roundStart;
  }
}
assert.equal(r.state.status, 'over');
const rk = r.state.tour.results[0].ranking.flat();
assert.equal(rk[0], A, 'toplam sapması az olan birinci');
ok('Kayıp Saniye: 4 tur, hedefe yakın kazanır, geçersiz süre reddedilir, toplam sapmayla sıralanır');

// durdurmayan: ceza; bot makul sapar
{
  const g = S.init(['x', 'y'], { players: [{ id: 'x', bot: false }, { id: 'y', bot: true }] });
  const d = { round: 1, g };
  const errs = Array.from({ length: 200 }, () => Math.abs(S.auto(d, 'y', true).t - g.targets[0] * 1000));
  assert.ok(errs.reduce((a, b) => a + b) / 200 < 1200, 'bot hedefe yakın');
  assert.equal(S.auto(d, 'x', false).t, null);
  const { entry } = S.resolve(d, { x: { t: null }, y: { t: g.targets[0] * 1000 } });
  assert.equal(entry.rows[0].id, 'y'); assert.equal(g.total.x, S.PENALTY_MS);
  ok('Durdurmayan ceza alır, bot hedefe yakın durdurur');
}
console.log('KAYIP SANİYE TESTLERİ GEÇTİ');
