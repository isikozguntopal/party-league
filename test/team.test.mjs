// Takımlı turnuva: takım büyüklüğü (ikili/üçlü), oda sahibinin dağıtımı, takıma zarar veren oyunların çıkarılması, takım puanı
import assert from 'node:assert/strict';
import { handle, MemoryStore, teamOk, TEAM_BAN, TOUR, TEAM_GAMES } from '../public/game-core.js';
import { pairUp, twoTeams } from '../public/games/util.js';
import * as B from '../public/games/basket.js';

const ok = (m) => console.log('✓ ' + m);
const ids = ['aaaaaaa', 'bbbbbbb', 'ccccccc', 'ddddddd', 'eeeeeee', 'fffffff'];
async function room(n, bots = 0) {
  const st = new MemoryStore();
  const A = ids[0];
  let r = await handle(st, { action: 'create', playerId: A, name: 'P0' }, 0);
  const code = r.state.code;
  for (let i = 1; i < n; i++) await handle(st, { action: 'join', code, playerId: ids[i], name: 'P' + i }, 0);
  for (let i = 0; i < bots; i++) await handle(st, { action: 'addBot', code, playerId: A }, 0);
  const call = (body, pid = A, now = 0) => handle(st, { code, playerId: pid, ...body }, now);
  return { st, code, A, call };
}
const flat = (t) => t.flat().slice().sort();

// ---------- Oyun uygunluğu ----------
{
  assert.deepEqual(TEAM_BAN.slice().sort(), ['bomba', 'lazer', 'pati', 'yaris'], 'takım arkadaşına zarar verenler: sapan, bomba, yarış, pati');
  assert.equal(teamOk('lazer', [['a', 'b']]), false); assert.equal(teamOk('bomba', [['a', 'b']]), false); assert.equal(teamOk('yaris', [['a', 'b']]), false); assert.equal(teamOk('pati', [['a', 'b']]), false);
  assert.equal(teamOk('lazer', null), true, 'takımsız modda her oyun serbest');
  assert.equal(teamOk('bilgi', [['a', 'b']]), true); assert.equal(teamOk('basket', [['a', 'b']]), true); assert.equal(teamOk('melodi', [['a', 'b', 'c']]), true); assert.equal(teamOk('tanir', [['a', 'b', 'c']]), true);
  assert.equal(teamOk('halat', [['a', 'b'], ['c', 'd']]), true); assert.equal(teamOk('halat', [['a'], ['b'], ['c']]), false, 'halat tam iki takım ister');
  assert.equal(teamOk('kayik', [['a', 'b'], ['c', 'd']]), true); assert.equal(teamOk('kayik', [['a', 'b', 'c']]), false, 'kayık/kör koşu ikili oyun'); assert.equal(teamOk('kor', [['a', 'b', 'c']]), false);
  ok('Oyun uygunluğu: sapan/bomba/yarış/pati takımlı turnuvadan çıkar; halat 2 takım, kayık/kör koşu ikili ister');
}

// ---------- Takım düzeni eylemleri ----------
{
  const { call, A } = await room(5, 1);   // 5 insan + 1 bot = 6 oyuncu
  let r = await call({ action: 'teamSize', size: 2 });
  assert.equal(r.state.teamSize, 2); assert.equal(flat(r.state.teams).length, 6, 'herkes bir takımda');
  assert.deepEqual(r.state.teams.map((t) => t.length).sort(), [2, 2, 2]);
  await assert.rejects(call({ action: 'teamSize', size: 2 }, ids[1]), /oda sahibi/i);
  await assert.rejects(call({ action: 'teamSize', size: 4 }), /Geçersiz/);
  r = await call({ action: 'teamSize', size: 3 }); assert.deepEqual(r.state.teams.map((t) => t.length).sort(), [3, 3], '6 kişi üçlü: 3+3');
  r = await call({ action: 'teamSize', size: 1 }); assert.equal(r.state.teams, null); assert.equal(r.state.teamSize, 1);
  r = await call({ action: 'teamSize', size: 2 });
  const all = r.state.players.map((p) => p.id);
  // elle dağıtım
  r = await call({ action: 'teams', teams: [[all[0], all[1]], [all[2], all[3]], [all[4], all[5]]] });
  assert.deepEqual(r.state.teams, [[all[0], all[1]], [all[2], all[3]], [all[4], all[5]]]);
  await assert.rejects(call({ action: 'teams', teams: [[all[0], all[1], all[2]]] }), /en çok 2/);
  await assert.rejects(call({ action: 'teams', teams: [[all[0], all[1]]] }, ids[1]), /oda sahibi/i);
  // eksik dağıtılanlar boş yere eklenir, bilinmeyen kimlikler atılır, çift yazılan tek sayılır
  r = await call({ action: 'teams', teams: [[all[0], 'zzzzzzz', all[0]], [all[1]]] });
  assert.equal(flat(r.state.teams).length, 6); assert.ok(!flat(r.state.teams).includes('zzzzzzz')); assert.ok(r.state.teams.every((t) => t.length <= 2));
  const before = JSON.stringify(r.state.teams);
  r = await call({ action: 'shuffleTeams' }); assert.equal(flat(r.state.teams).length, 6);
  // oyuncu çıkınca/gelince takımlar düzelir
  await call({ action: 'leave' }, ids[4]);
  r = await call({ action: 'state' }); assert.ok(!flat(r.state.teams).includes(ids[4]) && flat(r.state.teams).length === 5, 'çıkan takımdan silinir');
  await handle(new MemoryStore(), { action: 'state', code: 'ZZZZ', playerId: A }, 0).catch(() => {});
  ok('Takım düzeni: ikili/üçlü rastgele dengeli, elle dağıtım doğrulanır, eksik/çift/yabancı kimlik düzeltilir, çıkan silinir');
}
{
  // yeni gelen boş yeri olan takıma, yoksa yeni takıma girer
  const { call, A, st, code } = await room(3);
  let r = await call({ action: 'teamSize', size: 2 }); assert.deepEqual(r.state.teams.map((t) => t.length).sort(), [1, 2]);
  r = await handle(st, { action: 'join', code, playerId: ids[3], name: 'P3' }, 0); assert.deepEqual(r.state.teams.map((t) => t.length).sort(), [2, 2], 'boş yere girer');
  r = await handle(st, { action: 'join', code, playerId: ids[4], name: 'P4' }, 0); assert.deepEqual(r.state.teams.map((t) => t.length).sort(), [1, 2, 2], 'yer yoksa yeni takım');
  ok('Geç gelen oyuncu boş yeri olan takıma, yoksa yeni takıma yerleşir');
}

// ---------- Takım düzenini oyunlar kullanır ----------
{
  const env = (teams, ps) => ({ players: ps.map((id) => ({ id, bot: false })), teams, addBot: () => ({ id: 'tmp' + Math.random(), bot: true }) });
  const ps = ids.slice(0, 6);
  const t3 = [[ps[0], ps[1], ps[2]], [ps[3], ps[4], ps[5]]];
  assert.deepEqual(pairUp(env(t3, ps), { trio: true }), t3, 'üçlü oyunlar atanmış takımı aynen kullanır');
  const p2 = pairUp(env(t3, ps)); assert.ok(p2.every((t) => t.length === 2), 'ikili oyun üçlüyü böler (2 + 1 + yedek)'); assert.equal(flat(p2).filter((x) => ps.includes(x)).length, 6);
  const [A2, B2] = twoTeams(env([[ps[0], ps[1]], [ps[2], ps[3]]], ps.slice(0, 4))); assert.deepEqual(A2, [ps[0], ps[1]]); assert.deepEqual(B2, [ps[2], ps[3]]);
  const rnd = twoTeams(env([[ps[0]], [ps[1]], [ps[2]]], ps.slice(0, 3))); assert.equal(rnd[0].length, rnd[1].length, 'iki takım değilse rastgele eşit bölünür');
  const late = pairUp(env([[ps[0], ps[1]]], ps.slice(0, 4))); assert.equal(flat(late).filter((x) => ps.includes(x)).length, 4, 'takımda olmayanlar da eşleşir');
  ok('Atanmış takımlar: üçlü oyunlar aynen kullanır, ikili oyun böler, halat iki takımı alır, eksikler eşleşir');
}

// ---------- Takımlı turnuva başlatma ve puanlama ----------
{
  const { call, A } = await room(4);
  await call({ action: 'teamSize', size: 2 });
  await call({ action: 'teams', teams: [[ids[0], ids[1]], [ids[2], ids[3]]] });
  // yalnızca bireysel/yasak oyunlar seçiliyse başlamaz
  await call({ action: 'tourGames', games: ['lazer', 'bomba', 'yaris', 'pati'] });
  await assert.rejects(call({ action: 'start' }), /oynanamaz/);
  await call({ action: 'tourGames', games: TOUR });
  let r = await call({ action: 'start' });
  assert.ok(r.state.tour.list.every((k) => !TEAM_BAN.includes(k)), 'turnuva listesinde yasaklı oyun yok: ' + r.state.tour.list.join());
  assert.ok(r.state.tour.list.length >= 8 && r.state.tour.list.includes('basket') && r.state.tour.list.includes('melodi') && r.state.tour.list.includes('halat'), 'takım uyumlu oyunlar kalır (2 takım → halat da)');
  assert.deepEqual(r.state.tour.teams, [[ids[0], ids[1]], [ids[2], ids[3]]]); assert.equal(r.state.tour.teamScoring, true);
  ok(`Takımlı turnuva: ${r.state.tour.list.length} oyun (sapan/bomba/yarış/pati yok), takımlar turnuvaya kilitlenir`);
}
{
  const { call } = await room(4);
  await call({ action: 'teamSize', size: 3 });          // 4 kişi → 2+2 (3'lü büyüklük, dengeli bölünür)
  let r = await call({ action: 'teamSize', size: 3 });
  r = await call({ action: 'start' });
  assert.ok(!r.state.tour.list.includes('kayik') || r.state.teams.every((t) => t.length <= 2), 'üçlü takımda kayık yok');
  const st2 = await room(5); await st2.call({ action: 'teamSize', size: 3 });
  const r5 = await st2.call({ action: 'start' });
  assert.deepEqual(r5.state.teams.map((t) => t.length).sort(), [2, 3]);
  assert.ok(!r5.state.tour.list.includes('kayik') && !r5.state.tour.list.includes('kor'), '3 kişilik takım varken kayık/kör koşu yok');
  assert.ok(!r5.state.tour.list.includes('halat') || r5.state.tour.teams.length === 2, 'halat yalnızca 2 takımda');
  ok('Üçlü takım: 5 kişi = 3+2, kayık/kör koşu çıkar; takım sayısı 2 değilse halat da çıkar');
}
{
  // takım puanı: oyun sıralaması takım ortalamasına çevrilir, üyeler aynı puanı alır
  const { call, st, code } = await room(4);
  await call({ action: 'teamSize', size: 2 });
  await call({ action: 'teams', teams: [[ids[0], ids[3]], [ids[1], ids[2]]] });
  await call({ action: 'tourGames', games: ['basket'] });
  let r = await call({ action: 'start' });
  const seq = r.state.seq, end = r.state.roundStart + B.COUNT_MS + B.PLAY_MS + 300;
  for (const p of ids.slice(0, 4)) await handle(st, { action: 'state', code, playerId: p }, end - 100);
  // takım 1: 60 (1.) + 45 (3.) → ort. sıra 2 ; takım 2: 50 (2.) + 4 (4.) → ort. sıra 3  → takım 1 kazanır, takım 2 ikinci
  const score = { [ids[0]]: 60, [ids[1]]: 50, [ids[3]]: 45, [ids[2]]: 4 };
  for (const p of ids.slice(0, 4)) { const sc = score[p]; r = await handle(st, { action: 'act', code, playerId: p, seq, round: 1, score: sc, made: Math.max(1, Math.min(Math.floor(sc / 2), 8)), shots: 20, best: 1 }, end); }
  assert.equal(r.state.status, 'over');
  const res = r.state.tour.results[0];
  assert.equal(res.gained[ids[0]], 3); assert.equal(res.gained[ids[3]], 3, 'takım arkadaşı aynı puanı alır (kendi sırası 3. olsa da)');
  assert.equal(res.gained[ids[1]], 2); assert.equal(res.gained[ids[2]], 2);
  assert.deepEqual(res.ranking.map((g) => g.slice().sort()), [[ids[0], ids[3]].sort(), [ids[1], ids[2]].sort()], 'sıralama: takım grupları');
  assert.equal(res.places[ids[0]], 0); assert.equal(res.places[ids[1]], 1);
  assert.equal(r.state.tour.scores[ids[0]], 3); assert.equal(r.state.tour.scores[ids[2]], 2);
  ok('Takım puanı: sıralama takım ortalamasına çevrilir; takım 3, ikinci takım 2 puan alır, üyeler eşit');
}
{
  // takımların ortalama sırası eşitse (1.+4. ≡ 2.+3.) en iyi oyuncusu olan takım öne geçer; aynı gruptaki herkes eşitse iki takım da eşit
  const { call, st, code } = await room(4);
  await call({ action: 'teamSize', size: 2 });
  await call({ action: 'teams', teams: [[ids[0], ids[3]], [ids[1], ids[2]]] });
  await call({ action: 'tourGames', games: ['basket'] });
  let r = await call({ action: 'start' });
  const seq = r.state.seq, end = r.state.roundStart + B.COUNT_MS + B.PLAY_MS + 300;
  for (const p of ids.slice(0, 4)) await handle(st, { action: 'state', code, playerId: p }, end - 100);
  const score = { [ids[0]]: 60, [ids[1]]: 50, [ids[2]]: 40, [ids[3]]: 4 };            // (1.+4.)/2 = (2.+3.)/2 = 2.5
  for (const p of ids.slice(0, 4)) r = await handle(st, { action: 'act', code, playerId: p, seq, round: 1, score: score[p], made: Math.max(1, Math.min(Math.floor(score[p] / 2), 8)), shots: 20, best: 1 }, end);
  const res = r.state.tour.results[0];
  assert.equal(res.gained[ids[0]], 3); assert.equal(res.gained[ids[3]], 3); assert.equal(res.gained[ids[1]], 2); assert.equal(res.gained[ids[2]], 2);
  ok('Takım ortalamaları eşitse en iyi oyuncusu öndeki takım kazanır (1.+4. ≡ 2.+3.)');
}
{
  // herkes aynı puanda: hepsi aynı grupta, iki takım da eşit
  const { call, st, code } = await room(4);
  await call({ action: 'teamSize', size: 2 });
  await call({ action: 'tourGames', games: ['basket'] });
  let r = await call({ action: 'start' });
  const seq = r.state.seq, end = r.state.roundStart + B.COUNT_MS + B.PLAY_MS + 300;
  for (const p of ids.slice(0, 4)) await handle(st, { action: 'state', code, playerId: p }, end - 100);
  for (const p of ids.slice(0, 4)) r = await handle(st, { action: 'act', code, playerId: p, seq, round: 1, score: 10, made: 5, shots: 8, best: 1 }, end);
  const res = r.state.tour.results[0];
  assert.ok(ids.slice(0, 4).every((p) => res.gained[p] === 3), 'tam eşitlik → iki takım da 3 puan');
  assert.equal(res.ranking.length, 1); assert.equal(res.ranking[0].length, 4);
  ok('Herkes eşit puandaysa iki takım da aynı sırayı ve puanı paylaşır');
}
{
  // bireysel turnuva değişmez: puanlar kişi başı, tour.teams yok
  const { call, st, code } = await room(3);
  await call({ action: 'tourGames', games: ['basket'] });
  let r = await call({ action: 'start' });
  assert.equal(r.state.tour.teams, null); assert.equal(r.state.tour.teamScoring, false);
  const seq = r.state.seq, end = r.state.roundStart + B.COUNT_MS + B.PLAY_MS + 300;
  for (const p of ids.slice(0, 3)) await handle(st, { action: 'state', code, playerId: p }, end - 100);
  for (const [i, p] of ids.slice(0, 3).entries()) r = await handle(st, { action: 'act', code, playerId: p, seq, round: 1, score: 30 - i * 10, made: 5, shots: 9, best: 2 }, end);
  assert.deepEqual(r.state.tour.results[0].gained, { [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1 }, 'bireysel: 3-2-1');
  ok('Bireysel turnuva değişmedi: 3-2-1 puan kişi başı');
}
{
  // tek takım oyunu (Halat) atanmış 2 takımla oynanır; Bombayı Çöz atanmış üçlüyle
  const { call } = await room(4);
  await call({ action: 'mode', mode: 'halat' });
  await call({ action: 'teamSize', size: 2 });
  await call({ action: 'teams', teams: [[ids[0], ids[2]], [ids[1], ids[3]]] });
  let r = await call({ action: 'start' });
  const tm = r.state.g.teams.map((t) => t.slice().sort().join());
  assert.deepEqual(tm.sort(), [[ids[0], ids[2]].sort().join(), [ids[1], ids[3]].sort().join()].sort(), 'halat: oda sahibinin takımları');
  assert.equal(r.state.tour.teamScoring, false, 'tek oyunda takım puanı toplanmaz');
  ok('Tek takım oyunu (Halat) oda sahibinin dağıttığı takımlarla başlar');
}
{
  // takımsız (teamSize 1) takım oyunu eskisi gibi rastgele
  const { call } = await room(4);
  await call({ action: 'mode', mode: 'tanir' });
  const r = await call({ action: 'start' });
  assert.equal(r.state.g.teams.length, 2); assert.equal(r.state.tour.teams, null);
  ok('Takım düzeni seçilmediyse takım oyunu eskisi gibi rastgele eşleşir');
}
console.log('Takım testleri tamam');
