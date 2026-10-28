// Ortak Şarkı kural testleri
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as S from '../public/games/sarki.js';

const A = 'aaaaaaa', Bp = 'bbbbbbb', Cp = 'ccccccc';
const ok = (m) => console.log('✓ ' + m);
const mk = (ids, bots = []) => { const d = { round: 1, roundStart: 0, g: S.init(ids, { players: ids.map((id) => ({ id, bot: bots.includes(id) })) }) }; return d; };

// ---------- Şarkı kurma: her katkı tam bir satır, hiçbiri düşmez ----------
for (const n of [1, 2, 3, 4, 5, 7, 12]) {
  const contribs = Array.from({ length: n }, (_, i) => ({ cid: 'c' + (i + 1), pid: 'p' + i, text: `Bu bir deneme dizesi numara ${i} harika` }));
  const song = S.composeSong(contribs);
  const lines = song.sections.flatMap((s) => s.lines).filter((l) => l.cid);
  assert.equal(lines.length, n, `${n} katkı → ${n} satır`);
  assert.deepEqual(lines.map((l) => l.cid).sort(), contribs.map((c) => c.cid).sort());
  for (const l of lines) assert.equal(l.text, contribs.find((c) => c.cid === l.cid).text);
  assert.ok(song.title && song.tempo >= 108);
  const kinds = song.sections.map((x) => x.kind);
  assert.equal(kinds[0], 'intro'); assert.equal(kinds[kinds.length - 1], 'outro'); assert.ok(kinds.includes('bridge'));
  assert.ok(kinds.filter((k) => k === 'chorus').length >= 2, 'nakarat tekrar eder');
  assert.ok(song.sections.flatMap((x) => x.lines).filter((l) => !l.cid).length >= 8, 'oyunun kendi dizeleri de var: ' + n);
}
{
  const song = S.composeSong([{ cid: 'c1', pid: 'p', text: 'Yıldızlar bizimle dans eder' }, { cid: 'c2', pid: 'q', text: 'Pizza kokusu sardı sokağı' }]);
  const gen = song.sections.flatMap((x) => x.lines).filter((l) => l.gen);
  assert.ok(gen.every((l) => !/\{k\d\}/.test(l.text)), 'şablon boşlukları doldu');
  assert.ok(['major', 'minor'].includes(song.mode) && song.prog >= 0 && song.prog < 3 && song.groove >= 0 && song.groove < 3);
}
ok('Şarkı: her katkı tam bir kez satır olur, metin değişmez; giriş/nakarat/köprü/bitiş oyunun kendi dizeleriyle tamamlanır (1–12 katkı)');

// ---------- Yazma turu ----------
{
  const d = mk([A, Bp, Cp], [Cp]);
  assert.throws(() => S.normalize(d, A, { text: 'x' }, 0), /uzun/);
  assert.throws(() => S.normalize(d, A, { text: 'siktir git' }, 0), /kullanılamaz/);
  assert.equal(S.normalize(d, A, { text: '  Merhaba   dünya ' }, 0).text, 'Merhaba dünya');
  assert.equal(S.normalize(d, A, { text: 'a'.repeat(300) + ' b' }, 0).text.length <= S.TEXT_MAX, true);
  const acts = { [A]: S.normalize(d, A, { text: 'Çay demle hayat güzel' }, 0), [Bp]: S.auto(d, Bp, false), [Cp]: S.auto(d, Cp, true) };
  const { entry } = S.resolve(d, acts);
  assert.equal(d.g.contribs.length, 2, 'yazmayan insan katkısız, bot yazar');
  assert.deepEqual(entry.missing, [Bp]);
  assert.equal(S.ranking(d, [A, Bp, Cp]), null);
  ok('Yazma: doğrulama, küfür filtresi, yazmayan insan işaretlenir, bot dize yazar');
}

// ---------- Oylama: kendine oy yok, 1–5, tek oy, eşitlik, az oy ----------
{
  const ids = [A, Bp, Cp, 'ddddddd'];
  const d = mk(ids);
  S.resolve(d, Object.fromEntries(ids.map((id, i) => [id, { text: 'Dize numara ' + i }])));
  d.round = 2;
  const cid = (pid) => d.g.contribs.find((c) => c.pid === pid).cid;
  assert.throws(() => S.normalize(d, A, { votes: { [cid(Bp)]: 6 } }, 0), /1 ile 5/);
  assert.throws(() => S.normalize(d, A, { votes: { [cid(Bp)]: 0 } }, 0), /1 ile 5/);
  assert.throws(() => S.normalize(d, A, { votes: { zzz: 3 } }, 0), /Geçersiz/);
  assert.deepEqual(S.normalize(d, A, { votes: { [cid(A)]: 5, [cid(Bp)]: 4 } }, 0).votes, { [cid(Bp)]: 4 }, 'kendi dizene oy atılamaz');
  const acts = {
    [A]: { votes: { [cid(Bp)]: 5, [cid(Cp)]: 3, [cid(A)]: 5 } },       // kendine verdiği oy sayılmamalı
    [Bp]: { votes: { [cid(A)]: 5, [cid(Cp)]: 3 } },
    [Cp]: { votes: { [cid(A)]: 5, [cid(Bp)]: 4 } },
    ddddddd: { votes: {} },
  };
  const { entry } = S.resolve(d, acts);
  const by = Object.fromEntries(entry.results.map((r) => [r.pid, r]));
  assert.equal(by[A].n, 2); assert.equal(by[A].avg, 5);
  assert.equal(by[Bp].avg, 4.5); assert.equal(by[Bp].fives, 1);
  assert.equal(by[Cp].avg, 3); assert.equal(by.ddddddd.n, 0);
  assert.equal(by[A].rank, 1); assert.equal(by[Bp].rank, 2); assert.equal(by[Cp].rank, 3);
  assert.equal(by.ddddddd.final, false, 'hiç oy almayan kesinleşmez');
  assert.deepEqual(S.ranking(d, ids), [[A], [Bp], [Cp], ['ddddddd']]);
  ok('Oylama: kendine oy sayılmaz, 1–5 doğrulanır, ortalama + sıralama, oy almayan en sonda');
}
{ // eşitlikte 5 sayısı fazla olan öne geçer
  const ids = [A, Bp, Cp, 'ddddddd'];
  const d = mk(ids);
  S.resolve(d, Object.fromEntries(ids.map((id, i) => [id, { text: 'Dize numara ' + i }])));
  d.round = 2;
  const cid = (pid) => d.g.contribs.find((c) => c.pid === pid).cid;
  // A: 5+3 = ort 4 (bir 5); Bp: 4+4 = ort 4 (sıfır 5)
  const acts = { [A]: { votes: {} }, [Bp]: { votes: { [cid(A)]: 5 } }, [Cp]: { votes: { [cid(A)]: 3, [cid(Bp)]: 4 } }, ddddddd: { votes: { [cid(Bp)]: 4 } } };
  const { entry } = S.resolve(d, acts);
  const by = Object.fromEntries(entry.results.map((r) => [r.pid, r]));
  assert.equal(by[A].avg, 4); assert.equal(by[Bp].avg, 4);
  assert.equal(by[A].rank, 1); assert.equal(by[Bp].rank, 2, 'eşit ortalamada çok 5 alan kazanır');
  ok('Eşitlik: ortalama eşitse 5 sayısı fazla olan öne geçer');
}
{ // az oy: kesinleşmez, tam eşit olanlar aynı sırayı paylaşır
  const ids = [A, Bp, Cp, 'ddddddd', 'eeeeeee'];
  const d = mk(ids);
  S.resolve(d, Object.fromEntries(ids.map((id, i) => [id, { text: 'Dize numara ' + i }])));
  d.round = 2;
  const cid = (pid) => d.g.contribs.find((c) => c.pid === pid).cid;
  const { entry } = S.resolve(d, { [A]: { votes: { [cid(Bp)]: 5 } }, [Bp]: { votes: {} }, [Cp]: { votes: { [cid(Bp)]: 5 } }, ddddddd: { votes: { [cid(Cp)]: 5 } }, eeeeeee: { votes: {} } });
  const by = Object.fromEntries(entry.results.map((r) => [r.pid, r]));
  assert.equal(by[Bp].final, true); assert.equal(by[Cp].final, false, 'tek oyla 5 ortalaması kesinleşmez');
  assert.ok(by[Bp].rank < by[Cp].rank, 'kesinleşen, az oy alanın önünde');
  assert.equal(entry.need, 2);
  ok('Az oy: yeterince oy almayan katkı kesinleşmez ve kesinleşenin arkasında kalır');
}

// ---------- Uçtan uca: oda, 3 insan + 1 bot ----------
{
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'join', code, playerId: Bp, name: 'Banu' }, 0);
  await handle(st, { action: 'join', code, playerId: Cp, name: 'Can' }, 0);
  await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: 'sarki' }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const seq = r.state.seq; let now = r.state.roundStart;
  assert.equal(r.state.g.phase, 'write');
  await assert.rejects(handle(st, { action: 'act', code, playerId: A, seq, round: 1, text: '' }, now), /uzun/);
  await handle(st, { action: 'act', code, playerId: A, seq, round: 1, text: 'Yıldızlar bizimle dans eder' }, now);
  await handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, text: 'Pizza kokusu sardı sokağı' }, now);
  r = await handle(st, { action: 'act', code, playerId: Cp, seq, round: 1, text: 'Çay demle hayat güzel' }, now);
  assert.equal(r.state.round, 2, 'herkes yazınca oylamaya geçer');
  assert.equal(r.state.last.count, 4, '3 insan + 1 bot dizesi');
  now = r.state.roundStart;
  r = await handle(st, { action: 'state', code, playerId: A }, now);
  const g = r.state.g;
  assert.equal(g.phase, 'vote'); assert.equal(g.contribs.length, 4);
  assert.equal(g.contribs.filter((c) => c.mine).length, 1);
  assert.ok(!JSON.stringify(g).includes('"pid"'), 'oylama sırasında yazarlar gizli');
  const others = (pid) => Object.fromEntries(g.contribs.filter((c) => !c.mine).map((c) => [c.cid, 4]));
  const vA = await handle(st, { action: 'state', code, playerId: A }, now); // A'nın kendi dizesi
  await handle(st, { action: 'act', code, playerId: A, seq, round: 2, votes: others() }, now);
  const vB = (await handle(st, { action: 'state', code, playerId: Bp }, now)).state.g;
  await handle(st, { action: 'act', code, playerId: Bp, seq, round: 2, votes: Object.fromEntries(vB.contribs.filter((c) => !c.mine).map((c) => [c.cid, 5])) }, now);
  const vC = (await handle(st, { action: 'state', code, playerId: Cp }, now)).state.g;
  r = await handle(st, { action: 'act', code, playerId: Cp, seq, round: 2, votes: Object.fromEntries(vC.contribs.filter((c) => !c.mine).map((c) => [c.cid, 3])) }, now);
  assert.ok(['over', 'inter'].includes(r.state.status) || r.state.last.phase === 'vote', 'oylama bitince oyun biter');
  assert.equal(r.state.last.results.length, 4);
  assert.ok(r.state.last.results.every((x) => x.n >= 1));
  ok('Uçtan uca: yaz → birleştir → oyla → sonuç (3 insan + bot)');
}

// ---------- Hiç kimse yazmazsa oyun tıkanmaz ----------
{
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: 'sarki' }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  let now = r.state.deadline + 20000;
  for (let i = 0; i < 12 && r.state.status === 'playing'; i++) { r = await handle(st, { action: 'state', code, playerId: A }, now); now = Math.max(now + 1, r.state.deadline + 20000); }
  assert.notEqual(r.state.status, 'playing', 'süre dolunca oyun biter');
  ok('Süre dolunca: kimse yazmasa da oyun tıkanmaz');
}
console.log('Ortak Şarkı testleri tamam');
