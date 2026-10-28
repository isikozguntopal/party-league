// Yönetici paneli: oyuncu çıkarma, onay bekleyen girişler, turu bitirip puan dağıtma, yönetici yapma
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';

const ok = (m) => console.log('✓ ' + m);
const [A, B, C, D] = ['aaaaaaa', 'bbbbbbb', 'ccccccc', 'ddddddd'];
async function room(games, n = 3) {
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  for (const [i, id] of [B, C].slice(0, n - 1).entries()) await handle(st, { action: 'join', code, playerId: id, name: 'P' + i }, 0);
  await handle(st, { action: 'tourGames', code, playerId: A, games }, 0);
  const call = (body, pid = A, now = 0) => handle(st, { code, playerId: pid, ...body }, now);
  return { call, code, st };
}

{
  const { call } = await room(['saniye', 'basket']);
  let r = await call({ action: 'start' });
  // onay bekleyen giriş
  r = await call({ action: 'join', name: 'Deniz' }, D, 100);
  const dd = r.state.players.find((p) => p.id === D);
  assert.ok(dd.pending, 'turnuva sürerken giren onay bekler');
  assert.ok(!dd.inGame, 'bekleyen oyunda değil');
  await assert.rejects(call({ action: 'admit', target: D }, B, 150), /yönetici/i);
  r = await call({ action: 'admit', target: D }, A, 200);
  assert.ok(!r.state.players.find((p) => p.id === D).pending);
  // yönetici yapma
  await assert.rejects(call({ action: 'admin', target: B, on: true }, B, 210), /oda sahibi/i);
  r = await call({ action: 'admin', target: B, on: true }, A, 220);
  assert.equal(r.state.players.find((p) => p.id === B).admin, true);
  r = await call({ action: 'state' }, B, 230);
  assert.equal(r.state.iAdmin, true);
  // çıkarma: oda sahibi çıkarılamaz, çıkarılan geri giremez
  await assert.rejects(call({ action: 'kick', target: A }, B, 240), /Oda sahibi/);
  await assert.rejects(call({ action: 'kick', target: C }, D, 245), /yönetici/i);
  r = await call({ action: 'kick', target: C }, B, 250);
  assert.ok(r.state.players.find((p) => p.id === C).left);
  await assert.rejects(call({ action: 'join', name: 'x' }, C, 300), /çıkardı/);
  ok('Yönetici: bekleyen girişi onaylar, yönetici atar, oyuncu çıkarır; çıkarılan geri giremez');
}
{
  // turu bitir: oyunun o anki durumuna göre puan
  const { call, code, st } = await room(['saniye', 'suru']);
  let r = await call({ action: 'start' });
  const kind = r.state.kind;
  await assert.rejects(call({ action: 'finish' }, B, 500), /yönetici/i);
  const rr = await call({ action: 'finish' }, A, 600);
  assert.equal(rr.state.status, 'inter', 'tur bitti');
  assert.ok(Object.values(rr.state.tour.results[0].gained).every((v) => v === 0), 'hiçbir bilgi yokken (herkes eşit) puan dağıtılmaz');
  ok('Turu bitir: bilgi yoksa puan verilmez, yönetici olmayan yapamaz');
  // skor varken: puana göre sırala
  const k2 = await room(['suru', 'saniye']);
  await k2.call({ action: 'start' });
  const key = `room-${k2.code}`, e = k2.st.map.get(key), d = JSON.parse(e.v);
  const scoreKey = d.g.score ? 'score' : d.g.scores ? 'scores' : d.g.total ? 'total' : null;
  if (scoreKey) {
    const v = scoreKey === 'total' ? [0.5, 3, 9] : [5, 1, 0];   // saniyede toplam sapma ne kadar azsa o kadar iyi
    d.g[scoreKey][B] = v[0]; d.g[scoreKey][A] = v[1]; d.g[scoreKey][C] = v[2];
    k2.st.map.set(key, { v: JSON.stringify(d), etag: e.etag });
    const fin = await k2.call({ action: 'finish' }, A, 700);
    const g = fin.state.tour.results[0].gained;
    assert.ok(g[B] > g[A] && g[A] > g[C], 'puanı yüksek olan daha çok alır');
    ok('Turu bitir: mevcut puan durumuna göre dağıtır');
  } else ok('(atlandı: ilk oyunda puan tablosu yok)');
}
{
  const { call } = await room(['suru', 'saniye']);
  await call({ action: 'start' });
  const r = await call({ action: 'skip' }, A, 700);
  assert.equal(r.state.status, 'inter');
  ok('Yönetici oyunu atlayabilir');
}
console.log('YÖNETİCİ TESTLERİ GEÇTİ');
