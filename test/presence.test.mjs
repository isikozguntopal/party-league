// Çevrimiçi oyuncular ve davetler (public/presence.js)
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';

const store = new MemoryStore();
const t0 = 1_000_000;
let r = await handle(store, { action: 'hello', playerId: 'aaaa1', name: 'Ayşe' }, t0);
assert.deepEqual(r.online, []);
r = await handle(store, { action: 'hello', playerId: 'bbbb2', name: 'Bora', code: 'KEDI', game: 'basket' }, t0 + 1000);
assert.equal(r.online.length, 1); assert.equal(r.online[0].n, 'Ayşe');
r = await handle(store, { action: 'hello', playerId: 'aaaa1', name: 'Ayşe' }, t0 + 2000);
assert.equal(r.online[0].code, 'KEDI'); assert.equal(r.online[0].game, 'basket');
// davet
await handle(store, { action: 'invite', playerId: 'bbbb2', to: 'aaaa1', code: 'KEDI', game: 'basket' }, t0 + 3000);
r = await handle(store, { action: 'hello', playerId: 'aaaa1', name: 'Ayşe' }, t0 + 4000);
assert.equal(r.invites.length, 1); assert.equal(r.invites[0].n, 'Bora'); assert.equal(r.invites[0].code, 'KEDI');
await handle(store, { action: 'invite', playerId: 'bbbb2', to: 'aaaa1', code: 'KEDI' }, t0 + 4500);   // aynı davet tekrar: tek kalır
r = await handle(store, { action: 'inviteAck', playerId: 'aaaa1', code: 'KEDI' }, t0 + 5000);
assert.equal(r.invites.length, 0);
// 30 sn sessiz kalan listeden düşer
r = await handle(store, { action: 'hello', playerId: 'aaaa1', name: 'Ayşe' }, t0 + 40000);
assert.equal(r.online.length, 0);
await assert.rejects(handle(store, { action: 'invite', playerId: 'aaaa1', to: 'aaaa1', code: 'KEDI' }, t0 + 41000));
console.log('ÇEVRİMİÇİ / DAVET TESTLERİ GEÇTİ');

// Turnuva sırası: tourGames gönderildiği sırada oynanır
{
  const st = new MemoryStore();
  const c = await handle(st, { action: 'create', playerId: 'host1', name: 'Ev' }, 1);
  const code = c.state.code;
  await handle(st, { action: 'addBot', playerId: 'host1', code }, 2);
  await handle(st, { action: 'tourGames', playerId: 'host1', code, games: ['saniye', 'bilgi', 'saniye', 'yok'] }, 3);
  const r = await handle(st, { action: 'start', playerId: 'host1', code }, 4);
  assert.equal(r.state.kind, 'saniye');
  assert.deepEqual(r.state.tour.list || r.state.tourGames, r.state.tour.list ? ['saniye', 'bilgi'] : ['saniye', 'bilgi']);
  console.log('TURNUVA SIRASI TESTİ GEÇTİ');
}
