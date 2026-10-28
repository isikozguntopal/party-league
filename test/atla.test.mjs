// Oda sahibi oyunu atlar; iki takım bitirince kalanlar eksi puan alır
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as K from '../public/games/korkosu.js';

const ok = (m) => console.log('✓ ' + m);
const A = 'aaaaaaa', B = 'bbbbbbb';
{
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'join', code, playerId: B, name: 'Banu' }, 0);
  await handle(st, { action: 'tourGames', code, playerId: A, games: ['saniye', 'basket'] }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  assert.equal(r.state.kind, 'basket');
  await assert.rejects(handle(st, { action: 'skip', code, playerId: B }, 500), /oda sahibi/i);
  r = await handle(st, { action: 'skip', code, playerId: A }, 500);
  assert.equal(r.state.status, 'inter', 'atlanınca sonraki oyuna geçilir');
  assert.ok(Object.values(r.state.tour.results[0].gained).every((v) => v === 0), 'atlanan oyunda puan yok');
  r = await handle(st, { action: 'state', code, playerId: A }, r.state.interUntil + 10);
  assert.equal(r.state.kind, 'saniye');
  ok('Oda sahibi oyunu atlar (puan yok, sonraki oyun gelir); başkası atlayamaz');
}
{
  // kör koşu: iki takım bitirince oyun kapanır, kalan eksi puan alır
  const g = { seed: 8, teams: [0, 1, 2].map((i) => ({ id: i, members: ['a' + i, 'b' + i], runner: 'a' + i, guide: 'b' + i, botRunner: true, botGuide: true })) };
  const sim = K.createSim([], g); K.startCountdown(sim);
  while (sim.phase !== 'run') K.stepSim(sim, 1 / 30, {});
  sim.teams[0].doorOpen = sim.teams[1].doorOpen = true; sim.teams[0].s = sim.teams[1].s = sim.c.LEN - 1; sim.teams[2].s = 20;
  for (let i = 0; i < 90 && sim.phase === 'run'; i++) K.stepSim(sim, 1 / 30, {});
  assert.equal(sim.phase, 'done', 'iki takım bitirince oyun kapanır');
  assert.deepEqual(K.dnfOf(sim).sort(), ['a2', 'b2']);
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'join', code, playerId: B, name: 'Banu' }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: 'yaris' }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const ids = r.state.players.map((p) => p.id);
  const last = ids[ids.length - 1];
  r = await handle(st, { action: 'rtResult', code, playerId: A, seq: r.state.seq, ranking: ids.map((id) => [id]), dnf: [last] }, 2000);
  const gained = r.state.tour.results[0].gained;
  assert.equal(gained[last], -1, 'bitirmeyen eksi puan alır'); assert.ok(gained[ids[0]] > 0);
  assert.equal(r.state.tour.scores[last], -1);
  ok('İki takım bitirince oyun kapanır; bitirmeyen -1 puan alır');
}
console.log('ATLA TESTLERİ GEÇTİ');
