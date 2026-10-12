// Oyun mantığı testleri: npm test
import assert from 'node:assert/strict';
import { handle, MemoryStore, POINTS, QUICK, TOUR } from '../public/game-core.js';
import * as L from '../public/games/lazer.js';
import * as B from '../public/games/bomba.js';
import * as Y from '../public/games/yaris.js';
import * as C from '../public/games/cizim.js';
import * as Q from '../public/games/bilgi.js';
import * as KS from '../public/games/keski.js';
import * as BB from '../public/games/bombaci.js';
import * as KR from '../public/games/korkosu.js';
import * as HL from '../public/games/halat.js';
import * as KY from '../public/games/kayik.js';
import * as NZ from '../public/games/neciz.js';
import { WORDS } from '../public/games/kelimeler.js';
import { drawDoodle, DOODLES } from '../public/games/doodles.js';
import { cleanLook, DEFAULT_LOOK } from '../public/games/avatar.js';

const A = 'aaaaaaa', Bp = 'bbbbbbb', Cp = 'ccccccc';
const ok = (m) => console.log('✓ ' + m);

async function room(nHumans, nBots = 0, mode = 'tour') {
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  if (nHumans >= 2) await handle(st, { action: 'join', code, playerId: Bp, name: 'Banu' }, 0);
  if (nHumans >= 3) await handle(st, { action: 'join', code, playerId: Cp, name: 'Can' }, 0);
  for (let i = 0; i < nBots; i++) await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode }, 0);
  return { st, code };
}
// Gerçek zamanlı oyunları sunucu tarafında "oda sahibi cihazı" gibi oynatır (bot simülasyonu + rtResult)
async function playRealtime(st, code, s, now) {
  const mod = { yaris: Y, bomba: B, kor: KR, halat: HL, kayik: KY }[s.kind];
  const sim = mod.createSim(s.players.filter((p) => p.inGame).map((p) => ({ id: p.id, bot: true })), s.g);
  if (s.kind === 'kor') sim.teams.forEach((tm) => { tm.botRunner = true; });
  if (s.kind === 'halat') Object.values(sim.ps).forEach((p) => { p.bot = true; });
  if (s.kind === 'kayik') sim.boats.forEach((b) => { b.bots = [true, true]; });
  mod.startCountdown(sim);
  while (sim.phase !== 'done' && sim.t < 400) mod.stepSim(sim, 1 / 30, {});
  return handle(st, { action: 'rtResult', code, playerId: s.hostId, seq: s.seq, ranking: mod.rankingOf(sim) }, now);
}
// Süreleri ileri sararak oyunu sonuna kadar götürür (insanlar "uzakta" sayılır → bot gibi oynatılır)
async function runUntil(st, code, cond, start = 0, maxSteps = 800) {
  let now = start, r = await handle(st, { action: 'state', code, playerId: A }, now);
  for (let i = 0; i < maxSteps && !cond(r.state); i++) {
    const s = r.state;
    if (s.status === 'playing' && s.g && s.g.simHost) { now = Math.max(now + 1, s.roundStart + 100); r = await playRealtime(st, code, s, now); continue; }
    if (s.status === 'inter') now = s.interUntil + 1;
    else { const nx = Math.max(now + 1, s.deadline + 1100); now = nx === now + 1 ? now + 3000 : nx; } // oy bekleyen albüm: zaman ilerlesin
    r = await handle(st, { action: 'state', code, playerId: A }, now);
  }
  return { r, now };
}

// ---------- Lazer ----------
for (let r = 2; r <= 15; r++) assert.ok(L.arenaScale(r) < L.arenaScale(r - 1));
{
  const { st, code } = await room(3, 0, 'lazer');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const seq = r.state.seq, t = r.state.roundStart;
  await handle(st, { action: 'act', code, playerId: A, seq, round: 1, x: -0.6, y: 0, a: 0 }, t);
  await handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, x: -0.3, y: 0, a: Math.PI / 2 }, t);
  r = await handle(st, { action: 'act', code, playerId: Cp, seq, round: 1, x: -0.1, y: 0, a: -Math.PI / 2 }, t);
  assert.deepEqual(r.state.last.shots.find((s) => s.by === A).moves.map((m) => m.id), [Bp, Cp]);
  ok('Lazer: itme zinciri (bilardo) ve daralan alan');
}

// ---------- Gerçek zamanlı motorlar ----------
{
  const ps = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, bot: true }));
  const sim = Y.createSim(ps);
  for (const c of Object.values(sim.cars)) assert.ok(Y.onTrack(c.x, c.y), 'araba pistte başlamalı');
  Y.startCountdown(sim);
  while (sim.phase !== 'done' && sim.t < 400) Y.stepSim(sim, 1 / 30, {});
  const fin = Object.values(sim.cars).filter((c) => c.done !== null).length;
  assert.ok(fin >= 4, 'botlar yarışı bitirmeli');
  ok(`Yarış motoru: ${fin}/5 bot 3 turu ${(sim.t - sim.raceT0).toFixed(0)} sn'de bitirdi`);
  // insan girdisi: gaz + düz → ilerler; fren → durur; geri vites
  const s2 = Y.createSim([{ id: 'h' }]);
  Y.startCountdown(s2);
  for (let i = 0; i < 120; i++) Y.stepSim(s2, 1 / 30, { h: { gas: true } });
  assert.ok(s2.cars.h.sp > 3 && s2.cars.h.y < 20, 'gaz ile ilerlemeli');
  for (let i = 0; i < 90; i++) Y.stepSim(s2, 1 / 30, { h: { brake: true } });
  assert.ok(s2.cars.h.sp < 0.5, 'fren ile durup geri gitmeli: ' + s2.cars.h.sp);
  const snap = Y.readSnapshot(JSON.parse(JSON.stringify(Y.snapshot(s2))));
  assert.ok(Math.abs(snap.cars.h.x - s2.cars.h.x) < 0.01);
  ok('Yarış: gaz/fren/geri vites, anlık görüntü aktarımı');

  const bs = B.createSim(ps);
  B.startCountdown(bs);
  while (bs.phase !== 'done' && bs.t < 300) B.stepSim(bs, 1 / 30, {});
  assert.equal(bs.phase, 'done');
  assert.equal(B.rankingOf(bs).flat().length, 5);
  // insan: bomba bırak, kaçmazsa ölür
  const b2 = B.createSim([{ id: 'h' }, { id: 'x', bot: false }]);
  B.startCountdown(b2);
  for (let i = 0; i < 100; i++) B.stepSim(b2, 1 / 30, {});
  B.stepSim(b2, 1 / 30, { h: { bomb: true } });
  assert.equal(b2.bombs.length, 1);
  for (let i = 0; i < 90; i++) B.stepSim(b2, 1 / 30, {});
  assert.equal(b2.ps.h.alive, false, 'kendi bombasında kalan ölmeli');
  ok('Bomba motoru: botlar oynayıp bitirdi; bombada kalan elendi');
}

// ---------- Kulaktan Kulağa ----------
{
  for (const n of DOODLES) { const s = drawDoodle(n, 7); assert.ok(s.length && s.every((x) => x.p.every((v) => v >= -20 && v <= 1020)), n); }
  const { st, code } = await room(3, 1, 'cizim');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  let now = r.state.roundStart;
  const order = r.state.g.order;
  assert.equal(r.state.g.type, 'write');
  // 1) yaz
  for (const id of [A, Bp, Cp]) r = await handle(st, { action: 'act', code, playerId: id, seq, round: 1, text: `Cümle ${id[0]}` }, now);
  assert.equal(r.state.round, 2); assert.equal(r.state.g.type, 'draw');
  // A'nın görevi: zincirdeki önceki cümle (kendi cümlesi değil)
  r = await handle(st, { action: 'state', code, playerId: A }, now + 1000);
  assert.ok(r.state.g.task && r.state.g.task.text && r.state.g.task.text !== 'Cümle a', 'başkasının cümlesi gelmeli');
  now = r.state.roundStart;
  // 2) çiz (A gerçek çizim gönderir)
  r = await handle(st, { action: 'act', code, playerId: A, seq, round: 2, strokes: [{ c: 1, w: 1, p: [10, 10, 500, 500, 900, 100], t: [0, 1500] }] }, now);
  assert.ok(r.state.myAction.art.key.startsWith(`room-${code}-art-`));
  assert.equal(r.state.myAction.art.dur, 1500, 'çizim süresi saklanmalı (hızlandırılmış tekrar)');
  const art = await handle(st, { action: 'art', code, playerId: Bp, key: r.state.myAction.art.key }, now);
  assert.deepEqual(art.art[0].p, [10, 10, 500, 500, 900, 100]);
  // kalanlar süre dolunca otomatik
  const out = await runUntil(st, code, (s) => s.g && s.g.phase === 'album', now);
  r = out.r; now = out.now;
  assert.equal(r.state.g.ai, 0);
  // albüm: oda sahibi ilerletir; çizimlere yalnızca çizmeyenler +/- oy verir
  await assert.rejects(handle(st, { action: 'gact', code, playerId: A, seq, vote: 0, v: 1 }, now), /Yalnızca çizim/);
  r = await handle(st, { action: 'gact', code, playerId: A, seq, next: true }, r.state.roundStart + 10);
  assert.equal(r.state.g.ai, 1, 'oda sahibi ilerletebilmeli');
  const it = r.state.g.shown[1];
  assert.equal(it.type, 'draw');
  assert.ok(it.dur > 0, 'albüm çizimi süre taşımalı');
  if ([A, Bp, Cp].includes(it.by)) await assert.rejects(handle(st, { action: 'gact', code, playerId: it.by, seq, vote: 1, v: 1 }, now), /Kendi/);
  const voters = [A, Bp, Cp].filter((id) => id !== it.by);
  await handle(st, { action: 'gact', code, playerId: voters[0], seq, vote: 1, v: 1 }, now);
  await handle(st, { action: 'gact', code, playerId: voters[1], seq, vote: 1, v: -1 }, now);
  r = await handle(st, { action: 'gact', code, playerId: voters[1], seq, vote: 1, v: 1 }, now); // fikrini değiştirdi
  assert.equal(r.state.g.shown[1].score, 2);
  r = await handle(st, { action: 'state', code, playerId: voters[0] }, now);
  assert.equal(r.state.g.shown[1].myVote, 1);
  const fin = await runUntil(st, code, (s) => s.status === 'over', now);
  const res = fin.r.state.tour.results[0];
  assert.equal(res.kind, 'cizim');
  const firstBy = fin.r.state.tour.results[0].ranking[0];
  assert.ok(firstBy.length >= 1);
  ok(`Kulaktan Kulağa: ${order.length} oyuncu, yaz→çiz→tahmin zinciri, zamanlı çizim kaydı, albümde +/- oy`);
}

// ---------- Ne Çizdim? (gartic.io) ----------
{
  assert.equal(NZ.norm('Çiçek!'), NZ.norm('cicek'));
  assert.ok(NZ.closeTo('kedx', 'kedi') && !NZ.closeTo('köpek', 'kedi') && !NZ.closeTo('kedi', 'kedi'));
  assert.deepEqual([0, 1, 2, 8, 20].map(NZ.guessPoints), [10, 9, 8, 3, 3]);
  // oda hafızası: çıkmış kelimeler tekrar sunulmaz
  const mem = { used: WORDS.slice(0, WORDS.length - 9) };
  const g0 = NZ.init(['a', 'b'], { players: [{ id: 'a', bot: false }, { id: 'b', bot: false }], mem });
  assert.ok(g0.turn.options.every((w) => WORDS.slice(-9).includes(w)), 'kullanılmış kelime gelmemeli');
  assert.equal(NZ.maskOf('kar topu', [0, 1, 2, 4, 5, 6, 7], 0), '___ ____');

  const { st, code } = await room(3, 1, 'neciz');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  assert.equal(r.state.g.T, 4);
  // insan çizene kadar turları ilerlet
  let now = r.state.roundStart;
  for (let i = 0; i < 4 && r.state.g.botDrawer; i++) ({ r, now } = await runUntil(st, code, (s) => s.status !== 'playing' || !s.g.botDrawer || s.round > i + 1, now));
  assert.ok(!r.state.g.botDrawer, 'bir insan çizmeli');
  const round = r.state.round, drawer = r.state.g.drawer, t0 = r.state.roundStart;
  const others = [A, Bp, Cp].filter((id) => id !== drawer);
  const sd = await handle(st, { action: 'state', code, playerId: drawer }, t0 + 100);
  assert.equal(sd.state.g.phase, 'choose'); assert.equal(sd.state.g.options.length, 3);
  const so = await handle(st, { action: 'state', code, playerId: others[0] }, t0 + 100);
  assert.equal(so.state.g.options, null, 'kelimeler yalnızca çizene görünür');
  await assert.rejects(handle(st, { action: 'gact', code, playerId: others[0], seq, pick: 0 }, t0 + 200), /Sıra/);
  r = await handle(st, { action: 'gact', code, playerId: drawer, seq, pick: 1 }, t0 + 1000);
  const word = sd.state.g.options[1];
  assert.equal(r.state.g.phase, 'draw'); assert.equal(r.state.g.word, word);
  assert.equal(r.state.deadline, t0 + 1000 + NZ.DRAW_MS, 'seçince çizim süresi başlar');
  // canlı çizim: parça parça gönder, izleyen elindekinden sonrasını alır
  const S = (x) => ({ c: 1, w: 1, p: [x, x, x + 50, x + 50] });
  await assert.rejects(handle(st, { action: 'live', code, playerId: others[0], seq, round, from: 0, strokes: [S(1)] }, t0 + 1100), /çizen/);
  await handle(st, { action: 'live', code, playerId: drawer, seq, round, from: 0, strokes: [S(10), S(20)] }, t0 + 1200);
  let lv = (await handle(st, { action: 'state', code, playerId: others[0], live: { gen: -1, since: 0 } }, t0 + 1300)).live;
  assert.equal(lv.s.length, 2); const gen = lv.gen;
  await handle(st, { action: 'live', code, playerId: drawer, seq, round, from: 1, strokes: [S(30), S(40)] }, t0 + 1400);
  lv = (await handle(st, { action: 'state', code, playerId: others[0], live: { gen, since: 1 } }, t0 + 1500)).live;
  assert.equal(lv.from, 1); assert.deepEqual(lv.s.map((x) => x.p[0]), [30, 40]);
  await handle(st, { action: 'live', code, playerId: drawer, seq, round, from: 0, strokes: [] }, t0 + 1600); // temizle
  lv = (await handle(st, { action: 'state', code, playerId: others[0], live: { gen, since: 2 } }, t0 + 1700)).live;
  assert.ok(lv.gen !== gen && lv.from === 0 && lv.s.length === 0, 'temizleyince izleyen baştan alır');
  // tahminler: yanlış, yakın, doğru (büyük harf / Türkçe karakter farkı önemsiz)
  const ga = (pid, guess, t) => handle(st, { action: 'gact', code, playerId: pid, seq, guess }, t);
  await assert.rejects(ga(drawer, word, t0 + 1800), /Çizen/);
  r = await ga(others[0], 'zzzz', t0 + 2000);
  assert.equal(r.state.g.feed.at(-1).txt, 'zzzz');
  const near = word.length >= 4 ? word.slice(0, -1) + (word.at(-1) === 'x' ? 'y' : 'x') : null;
  if (near) {
    r = await ga(others[0], near, t0 + 2600);
    assert.equal(r.state.g.feed.at(-1).close, true, 'yakın tahmin uyarısı');
    const ro = await handle(st, { action: 'state', code, playerId: others[1] }, t0 + 2700);
    assert.ok(!ro.state.g.feed.some((f) => f.close), 'yakın tahmin başkasına görünmez');
  }
  r = await ga(others[1], word.toLocaleUpperCase('tr'), t0 + 3000);
  assert.equal(r.state.g.myHit, true); assert.equal(r.state.g.word, word);
  await assert.rejects(ga(others[1], word, t0 + 3600), /Zaten/);
  const ro = await handle(st, { action: 'state', code, playerId: others[0] }, t0 + 3700);
  assert.equal(ro.state.g.word, null, 'bilmeyen kelimeyi görmez'); assert.ok(/^[_ ]+$/.test(ro.state.g.mask));
  r = await ga(others[0], word, t0 + 5000);
  // bot da zamanı gelince bilir ya da süre biter → tur çözülür
  ({ r } = await runUntil(st, code, (s) => s.round > round || s.status !== 'playing', t0 + 5100));
  const e = r.state.last.round === round ? r.state.last : r.state.tour && null;
  assert.ok(e && e.word === word);
  assert.equal(e.gains[others[1]], 10, 'ilk bilen 10'); assert.equal(e.gains[others[0]], 9, 'ikinci 9');
  assert.equal(e.gains[drawer], NZ.drawerPoints(e.order.length, e.all));
  const fin = await runUntil(st, code, (s) => s.status === 'over', r.state.roundStart);
  assert.equal(fin.r.state.tour.results[0].ranking.flat().length, 4);
  ok(`Ne Çizdim?: sırayla çizim, kelime seçimi, canlı çizim aktarımı, yakın/doğru tahmin, 10-9-8 puan, çizene +${e.gains[drawer]}, ${WORDS.length} kelime`);
}

// ---------- Bil Bakalım ----------
{
  const { st, code } = await room(2, 1, 'bilgi');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  // 1) kategori oylaması: kim neye oy verdi herkes görür
  assert.equal(r.state.g.phase, 'vote');
  let t0 = r.state.roundStart;
  await handle(st, { action: 'act', code, playerId: A, seq, round: 1, cat: 'tarih' }, t0 + 500);
  r = await handle(st, { action: 'state', code, playerId: Bp }, t0 + 600);
  assert.equal(r.state.g.votes[A], 'tarih');
  await assert.rejects(handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, cat: 'yok' }, t0 + 700), /kategori/);
  r = await handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, cat: 'tarih' }, t0 + 800);
  assert.equal(r.state.last.phase, 'vote'); assert.equal(r.state.last.winner, 'tarih');
  assert.equal(r.state.g.cat, 'tarih');
  // 2) çark yok: oylamadan hemen sonra sorular başlar, herkeste iki joker hazır
  assert.equal(r.state.g.phase, 'q');
  assert.equal(r.state.round, 2);
  assert.equal(r.state.g.qs.length, 1);
  assert.equal(r.state.g.qs[0].c, undefined, 'doğru cevap gizli olmalı');
  assert.deepEqual((await handle(st, { action: 'state', code, playerId: A }, r.state.roundStart)).state.g.jokers, { yari: true, cift: true });
  t0 = r.state.roundStart;
  await handle(st, { action: 'act', code, playerId: A, seq, round: 2, a: 0 }, t0 + 1500);
  r = await handle(st, { action: 'act', code, playerId: Bp, seq, round: 2, a: 1 }, t0 + 9000);
  const e = r.state.last;
  const exp = (id, t) => (e.answers[id].a === e.c ? Math.round(Q.points(t) * e.mult) : 0); // az bilen çarpanı dahil
  assert.equal(e.answers[A].pts, exp(A, 1500)); assert.equal(e.answers[Bp].pts, exp(Bp, 9000));
  assert.ok(r.state.g.qs[0].c !== undefined, 'çözülen sorunun cevabı görünmeli');
  // 4 soru sonra: o an sonuncu olan kalan 4 sorunun konusunu seçer
  let pk = await runUntil(st, code, (s) => s.g && s.g.phase === 'pick', r.state.roundStart);
  let ps = pk.r.state;
  assert.equal(ps.round, Q.PICK_ROUND); assert.equal(ps.g.qs.length, Q.HALF);
  const low = Math.min(...Object.values(ps.g.scores));
  assert.equal(ps.g.scores[ps.g.chooser], low, 'konuyu sonuncu seçer');
  assert.equal(ps.last.chooser, ps.g.chooser, '4. sorunun açılışında seçecek kişi duyurulur');
  if ([A, Bp].includes(ps.g.chooser)) {
    const other = ps.g.chooser === A ? Bp : A;
    await assert.rejects(handle(st, { action: 'act', code, playerId: other, seq, round: ps.round, cat: 'bilim' }, ps.roundStart + 100), /sonuncu/);
    await assert.rejects(handle(st, { action: 'act', code, playerId: ps.g.chooser, seq, round: ps.round, cat: 'tarih' }, ps.roundStart + 200), /kategori/);
    ps = (await handle(st, { action: 'act', code, playerId: ps.g.chooser, seq, round: ps.round, cat: 'bilim' }, ps.roundStart + 300)).state;
    assert.equal(ps.last.cat, 'bilim', 'diğerleri beklenmeden seçim uygulanır');
  } else ps = (await runUntil(st, code, (s) => s.round > Q.PICK_ROUND, pk.now)).r.state;
  assert.equal(ps.last.phase, 'pick'); assert.notEqual(ps.last.cat, 'tarih');
  assert.equal(ps.g.phase, 'q'); assert.equal(ps.g.qi, Q.HALF); assert.equal(ps.g.cat2, ps.last.cat);
  const fin = await runUntil(st, code, (s) => s.status === 'over', ps.roundStart);
  assert.equal(fin.r.state.tour.results[0].ranking.flat().length, 3);
  // jokerler (doğrudan modül): yarı yarıya ve çift cevap, her biri bir kez
  const mkq = (c) => ({ q: '?', o: ['x', 'y', 'z', 'w'], c });
  const d = { round: 2, status: 'playing', actions: {}, g: { alive: { a: true, b: true }, qs: [mkq(2), mkq(1)], scores: { a: 0, b: 0 }, jk: { a: { yari: true, cift: true }, b: { yari: true, cift: true } }, yari: {}, cift: {} } };
  assert.ok(Q.gact(d, 'a', { cift: true }));
  assert.equal(Q.view(d, 'a').ciftNow, true); assert.equal(Q.view(d, 'b').ciftNow, false);
  assert.deepEqual(Q.view(d, 'a').jokers, { yari: true, cift: false });
  assert.throws(() => Q.gact(d, 'a', { cift: true }), /kullanılamaz/, 'çift cevap bir kez');
  assert.equal(Q.normalize(d, 'b', { a: 1, a2: 3 }, 0).cift, undefined, 'açmayan oyuncu çift cevap veremez');
  const na = Q.normalize(d, 'a', { a: 0, a2: 2 }, 1000);
  assert.deepEqual([na.a, na.a2, na.cift], [0, 2, true]);
  assert.equal(Q.normalize(d, 'a', { a: 0, a2: 0 }, 1000).cift, undefined, 'aynı şık iki kez: tek cevap');
  // a: ikinci şıkkı doğru (c=2) → doğru sayılır, puan %60; b: tek cevap doğru → tam puan
  const out = Q.resolve(d, { a: { a: 0, a2: 2, cift: true, t: 0 }, b: { a: 2, t: 0 } }).entry;
  assert.equal(out.nCorrect, 2); assert.equal(out.answers.b.pts, 1000);
  assert.equal(out.answers.a.pts, Math.round(1000 * Q.CIFT_MULT), 'çift cevapla doğru: puan %60');
  assert.equal(out.answers.a.bonus, 'cift'); assert.equal(d.g.jk.a.cift, false);
  // ikisi de yanlış → puan yok
  const d3 = { round: 2, status: 'playing', actions: {}, g: { alive: { a: true }, qs: [mkq(3)], scores: { a: 0 }, jk: { a: { yari: true, cift: true } }, yari: {}, cift: {} } };
  assert.equal(Q.resolve(d3, { a: { a: 0, a2: 1, cift: true, t: 0 } }).entry.answers.a.pts, 0);
  // yarı yarıya: iki yanlış şıkkı gizler, doğru şık silinmez, bir kez
  const d2 = { round: 3, status: 'playing', actions: {}, g: { alive: { a: true }, qs: [mkq(2), mkq(1)], scores: { a: 0 }, jk: { a: { yari: true, cift: true } }, yari: {}, cift: {} } };
  assert.ok(Q.gact(d2, 'a', { yari: true }));
  const v = Q.view(d2, 'a');
  assert.equal(v.hide.length, 2); assert.ok(!v.hide.includes(1), 'doğru şık silinmez');
  assert.throws(() => Q.gact(d2, 'a', { yari: true }), /kullanılamaz/);
  ok('Bil Bakalım: kategori oylaması → (çark yok, herkeste 2 joker) → 4 soru → sonuncu yeni konuyu seçer → 4 soru; yarı yarıya + çift cevap');
}

// ---------- Keski Düellosu ----------
{
  for (let i = 0; i < 300; i++) { const tg = KS.init(['a']).targets[1]; assert.ok(!tg.includes(KS.CENTER) && !tg.includes(KS.BOTTOM) && new Set(tg).size === 3); }
  const { st, code } = await room(2, 1, 'keski');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  const t0 = r.state.roundStart, show = r.state.g.showMs;
  r = await handle(st, { action: 'state', code, playerId: A }, t0 - 3000);
  assert.equal(r.state.g.target, null, 'hedef erken gönderilmez');
  r = await handle(st, { action: 'state', code, playerId: A }, t0 + 100);
  const tg = r.state.g.target;
  assert.equal(tg.length, KS.removeCount(1));
  r = await handle(st, { action: 'state', code, playerId: A }, t0 + show + 50);
  assert.equal(r.state.g.target, null, 'gösterim bitince hedef gizlenir');
  await assert.rejects(handle(st, { action: 'act', code, playerId: A, seq, round: 1, removed: tg }, t0 + 1000), /ezberle/i);
  await handle(st, { action: 'state', code, playerId: Bp }, t0 + show + 1900); // Bp ekranda (uzakta sayılmasın)
  await handle(st, { action: 'act', code, playerId: A, seq, round: 1, removed: tg.slice().reverse() }, t0 + show + 2000);
  r = await handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, removed: tg.slice(1) }, t0 + show + 3000);
  assert.equal(r.state.last.results[A].ok, true);
  assert.equal(r.state.last.results[Bp].ok, false);
  assert.equal(r.state.g.alive[Bp], false, 'yanlış yontan elenir');
  if (r.state.status === 'playing') assert.equal(r.state.g.count, KS.removeCount(2)); // bot da hata yaptıysa oyun biter
  const fin = await runUntil(st, code, (s) => s.status === 'over', r.state.roundStart);
  assert.equal(fin.r.state.tour.results[0].ranking.at(-1)[0], Bp);
  ok('Keski Düellosu: hedef yalnızca gösterimde, ezberden yontma, yanlış yapan elenir, her tur zorlaşır');
}

// ---------- Bombayı Çöz (KTANE benzeri) ----------
{
  const { st, code } = await room(3, 1, 'bombaci');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  const teams = r.state.g.teams;
  // 3 insan → 1 anlatıcı + 2 dinleyici; bot yalnız kaldı → yanına geçici bot
  const trio = teams.find((t) => t.members.length === 3);
  assert.ok(trio && trio.expert && trio.defusers.length === 2);
  assert.ok(teams.some((t) => t.bot && t.members.length === 2), 'bot takıma yedek eklenmeli');
  assert.ok(r.state.players.some((p) => p.temp));
  const [d1, d2] = trio.defusers;
  const t0 = r.state.roundStart;
  await assert.rejects(handle(st, { action: 'gact', code, playerId: trio.expert, seq, m: 'wire', i: 0 }, t0 + 10), /görmüyorsun/);
  r = await handle(st, { action: 'state', code, playerId: trio.expert }, t0 + 10);
  assert.equal(r.state.g.role, 'anlatici'); assert.equal(r.state.g.bomb, null, 'anlatıcı bombayı görmez');
  r = await handle(st, { action: 'state', code, playerId: d1 }, t0 + 10);
  assert.equal(r.state.g.role, 'cozen');
  const b = r.state.g.bomb;
  const ga = (pid, body, t) => handle(st, { action: 'gact', code, playerId: pid, seq, ...body }, t);
  // d1 kılavuza göre doğru çözer
  let now = t0 + 5000;
  r = await ga(d1, { m: 'wire', i: BB.wireToCut(b) }, now);
  for (const k of BB.keypadOrder(b)) r = await ga(d1, { m: 'key', i: k }, now);
  if (BB.buttonAction(b) === 'press') r = await ga(d1, { m: 'btn', a: 'press' }, now);
  else {
    r = await ga(d1, { m: 'btn', a: 'hold' }, now);
    const digit = BB.releaseDigit(r.state.g.bomb.hold.strip);
    while (!BB.timerText(t0 + BB.TIME_MS - now).includes(digit)) now += 1000;
    r = await ga(d1, { m: 'btn', a: 'release', timer: BB.timerText(t0 + BB.TIME_MS - now) }, now);
  }
  assert.equal(r.state.g.bomb.strikes, 0);
  assert.ok(r.state.g.bomb.done > 0, 'bomba çözüldü');
  // d2 üç hata yapar → patlar
  const wrong = BB.keypadOrder(b)[1];
  for (let i = 0; i < 3; i++) r = await ga(d2, { m: 'key', i: wrong }, now + 100);
  assert.equal(r.state.last && r.state.last.seq === seq ? true : r.state.status !== 'playing', true, 'herkes bitince sonuçlanır');
  const res = r.state.tour.results[0];
  assert.deepEqual(res.ranking[0], [d1], 'ilk çözen en yüksek puanı alır');
  assert.ok(!res.ranking.flat().some((id) => id.startsWith('tmp-')), 'geçici bot puan almaz');
  assert.ok(!r.state.players.some((p) => p.temp), 'geçici bot oyun sonunda çıkar');
  ok('Bombayı Çöz: üçlü takım (anlatıcı + 2 dinleyici), kablo/düğme/sembol kuralları, 3 hata = patlama, yedek bot');
}

// ---------- Kör Koşu + Halat Çekme ----------
{
  const { st, code } = await room(3, 0, 'kor');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const teams = r.state.g.teams;
  assert.equal(teams.length, 2);
  const mixed = teams.find((t) => t.members.some((id) => id.startsWith('tmp-')));
  assert.ok(mixed && !mixed.runner.startsWith('tmp-') && mixed.botGuide, 'botla eşleşen insan koşar, bot rehber olur');
  const sim = KR.createSim([], r.state.g);
  sim.teams.forEach((tm) => { tm.botRunner = true; });
  KR.startCountdown(sim);
  const g0 = sim.teams[0].guide;
  for (let i = 0; i < 120; i++) KR.stepSim(sim, 1 / 30, { [g0]: { ping: [3, 50, 7] } });
  assert.deepEqual(sim.teams[0].ping.slice(0, 3), [3, 50, 7], 'rehberin işareti takıma iletilir');
  while (sim.phase !== 'done' && sim.t < 200) KR.stepSim(sim, 1 / 30, {});
  assert.ok(sim.teams.every((tm) => tm.done !== null), 'bot koşucular parkuru bitirir');
  const snap = KR.readSnapshot(JSON.parse(JSON.stringify(KR.snapshot(sim))));
  assert.equal(snap.teams.length, 2);
  ok(`Kör Koşu: ikili takım + yedek bot rehber, işaret, botlar ${sim.teams.map((t) => t.done.toFixed(0)).join('/')} sn'de bitirdi`);

  const h = await room(3, 0, 'halat');
  r = await handle(h.st, { action: 'start', code: h.code, playerId: A }, 0);
  const [TA, TB] = r.state.g.teams;
  assert.equal(TA.length, TB.length, 'takımlar eşit');
  const hs = HL.createSim([{ id: 'h' }, { id: 'b', bot: true }], { teams: [['h'], ['b']] });
  HL.startCountdown(hs);
  let taps = 0;
  for (let i = 0; i < 2000 && hs.phase !== 'done'; i++) { if (i % 3 === 0) taps++; HL.stepSim(hs, 1 / 30, { h: { taps } }); }
  assert.deepEqual(HL.rankingOf(hs)[0], ['h'], 'saniyede 10 basan bottan güçlü çeker');
  ok('Halat Çekme: eşit takımlar (yedek bot), hızlı basan takım kazanır');
}

// ---------- Gerçek zamanlı akış: sonuç, oda sahibi kaybolursa kapanış, sinyal ----------
{
  const { st, code } = await room(2, 1, 'bomba');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  assert.equal(r.state.g.simHost, A);
  r = await handle(st, { action: 'sig', code, playerId: A, seq: r.state.seq, to: Bp, data: { type: 'offer', sdp: 'x' } }, 100);
  const rb = await handle(st, { action: 'state', code, playerId: Bp }, 200);
  assert.equal(rb.state.sig.length, 1); assert.equal(rb.state.sig[0].data.type, 'offer');
  await assert.rejects(handle(st, { action: 'rtResult', code, playerId: Bp, seq: r.state.seq, ranking: [[Bp]] }, 300), /oda sahibi/);
  await handle(st, { action: 'rtProgress', code, playerId: A, seq: r.state.seq, ranking: [[Bp], [A]] }, 1000);
  // oda sahibi sessizleşti → son bilinen sıralamayla biter (Banu yoklamaya devam ediyor)
  for (let t = 5000; t <= 17000; t += 3000) r = await handle(st, { action: 'state', code, playerId: Bp }, t);
  assert.equal(r.state.status, 'over');
  assert.deepEqual(r.state.tour.results[0].ranking.slice(0, 2), [[Bp], [A]]);
  ok('Gerçek zamanlı: sinyal mesajı iletildi, yalnızca oda sahibi sonuç verir, sessizleşince ara sıralamayla biter');
}

// ---------- Yedek aktarım (sunucu üzerinden görüntü/kumanda) + oda sahibi herkesi lobiye döndürür ----------
{
  const { st, code } = await room(2, 1, 'halat');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const seq = r.state.seq;
  await assert.rejects(handle(st, { action: 'rtSnap', code, playerId: Bp, seq, n: 1, snap: { x: 1 } }, 100), /aktif/);
  await handle(st, { action: 'rtSnap', code, playerId: A, seq, n: 1, snap: { t: 1, ph: 'pull' } }, 100);
  await handle(st, { action: 'rtInput', code, playerId: Bp, seq, i: { taps: 5 } }, 120);
  r = await handle(st, { action: 'state', code, playerId: Bp, rt: { snap: true, have: -1 } }, 150);
  assert.equal(r.rt.snap.n, 1); assert.deepEqual(r.rt.snap.snap, { t: 1, ph: 'pull' });
  r = await handle(st, { action: 'state', code, playerId: Bp, rt: { snap: true, have: 1 } }, 160);
  assert.equal(r.rt.snap, null, 'aynı görüntü tekrar gönderilmez');
  r = await handle(st, { action: 'state', code, playerId: A, rt: { inputs: [Bp] } }, 170);
  assert.deepEqual(r.rt.inputs[Bp].i, { taps: 5 });
  r = await handle(st, { action: 'state', code, playerId: Bp, rt: { inputs: [A] } }, 180);
  assert.equal(r.rt.inputs, undefined, 'kumandaları yalnızca oda sahibi okur');
  await assert.rejects(handle(st, { action: 'lobby', code, playerId: Bp }, 200), /oda sahibi/);
  r = await handle(st, { action: 'lobby', code, playerId: A }, 200);
  assert.equal(r.state.status, 'lobby');
  r = await handle(st, { action: 'state', code, playerId: Bp }, 300);
  assert.equal(r.state.status, 'lobby', 'diğer oyuncu da lobiye döner');
  ok('Yedek aktarım: rtSnap/rtInput sunucu üzerinden; oda sahibi oyun ortasında herkesi lobiye döndürür');
}

// ---------- Bil Bakalım: az bilen çarpanı, jokerlerin sunucu tarafı ----------
{
  assert.equal(Q.multFor(4, 4), 1); assert.equal(Q.multFor(1, 4), 1.75); assert.equal(Q.multFor(2, 4), 1.5); assert.equal(Q.multFor(0, 4), 1);
  const { st, code } = await room(3, 0, 'bilgi');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  let t0 = r.state.roundStart;
  for (const id of [A, Bp, Cp]) r = await handle(st, { action: 'act', code, playerId: id, seq, round: 1, cat: 'bilim' }, t0 + 500);
  assert.equal(r.state.last.phase, 'vote'); assert.equal(r.state.round, 2, 'oylamadan sonra doğrudan ilk soru');
  t0 = r.state.roundStart;
  // oyunda: joker gact ile açılır, çift cevap ikinci şıkla birlikte gider; cevap verdikten sonra joker açılamaz
  r = await handle(st, { action: 'gact', code, playerId: A, seq, cift: true }, t0 + 100);
  assert.equal(r.state.g.ciftNow, true); assert.equal(r.state.g.jokers.cift, false);
  r = await handle(st, { action: 'act', code, playerId: A, seq, round: 2, a: 0, a2: 1 }, t0 + 200);
  assert.deepEqual([r.state.myAction.a, r.state.myAction.a2, r.state.myAction.cift], [0, 1, true]);
  await assert.rejects(handle(st, { action: 'gact', code, playerId: A, seq, yari: true }, t0 + 300), /kullanılamaz/);
  // tek bilen çarpan alır
  const sa = await handle(st, { action: 'state', code, playerId: A }, t0);
  const qc = Q.resolve({ ...JSON.parse(JSON.stringify(sa.state)), g: { ...sa.state.g, qs: [{ q: '?', o: ['a', 'b', 'c', 'd'], c: 1 }], scores: { [A]: 0, [Bp]: 0, [Cp]: 0 }, jk: {}, yari: {}, cift: {}, alive: { [A]: true, [Bp]: true, [Cp]: true } }, round: 2, roundStart: 0 }, { [A]: { a: 1, t: 0 }, [Bp]: { a: 0, t: 0 }, [Cp]: { a: 2, t: 0 } }).entry;
  assert.equal(qc.nCorrect, 1); assert.ok(qc.mult > 1.6 && qc.answers[A].pts > 1000, 'tek bilen ×' + qc.mult);
  ok('Bil Bakalım: oylamadan sonra çark yok, joker gact + çift cevap, tek bilen çarpanı');
}

// ---------- Turnuva: 5 oyun, puanlar, oyun seçimi ----------
{
  const { st, code } = await room(2, 2, 'tour');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  assert.equal(r.state.kind, TOUR[0]);
  const out = await runUntil(st, code, (s) => s.status === 'over');
  const T = out.r.state.tour;
  assert.deepEqual(T.results.map((x) => x.kind), TOUR);
  const total = Object.fromEntries(Object.keys(T.scores).map((id) => [id, T.results.reduce((s, x) => s + (x.gained[id] || 0), 0)]));
  assert.deepEqual(total, T.scores);
  ok('Turnuva: ' + T.results.map((x) => x.kind).join(' → ') + ' — puanlar: ' + JSON.stringify(T.scores));
  r = await handle(st, { action: 'rematch', code, playerId: Bp }, out.now + 10);
  assert.equal(r.state.status, 'playing');

  const r2 = await room(2, 0, 'tour');
  await handle(r2.st, { action: 'tourGames', code: r2.code, playerId: A, games: ['bilgi', 'lazer'] }, 0);
  r = await handle(r2.st, { action: 'start', code: r2.code, playerId: A }, 0);
  assert.deepEqual(r.state.tour.list, ['lazer', 'bilgi']);
  ok('Turnuvada oyun seçimi: yalnızca seçilen oyunlar, sabit sırada');
}

// ---------- Oyun ortasında çıkan, mesajlar, görünüm, bekleme ----------
{
  const { st, code } = await room(3, 0, 'lazer');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  await handle(st, { action: 'leave', code, playerId: Cp }, 10);
  await handle(st, { action: 'leave', code, playerId: Bp }, 20);
  r = await handle(st, { action: 'state', code, playerId: A }, 30);
  assert.equal(r.state.status, 'over');
  assert.deepEqual(r.state.tour.results[0].ranking[0], [A]);

  const m = await room(2);
  r = await handle(m.st, { action: 'say', code: m.code, playerId: Bp, k: 10 }, 1000);
  assert.equal(QUICK[r.state.chat[0].k], QUICK[10]);
  await assert.rejects(handle(m.st, { action: 'say', code: m.code, playerId: Bp, k: 1 }, 1500), /yavaş/);
  r = await handle(m.st, { action: 'look', code: m.code, playerId: Bp, look: { skin: 3, hair: 99, style: 'mohikan', hat: 'tac' } }, 2000);
  const lk = r.state.players.find((p) => p.id === Bp).look;
  assert.equal(lk.skin, 3); assert.equal(lk.hair, DEFAULT_LOOK.hair); assert.equal(lk.hat, 'tac');
  assert.equal(cleanLook({ style: '<x>' }).style, DEFAULT_LOOK.style);
  ok('Oyundan çıkan sonuncu; hazır mesajlar + spam sınırı; görünüm doğrulama');
}

// ---------- Takım oyunları: takımlar ekranı, herkes Tamam deyince başlar ----------
{
  for (const kind of ['halat', 'kor', 'kayik', 'bombaci']) {
    const { st, code } = await room(2, 0, kind);
    let r = await handle(st, { action: 'start', code, playerId: A }, 0);
    const { seq } = r.state;
    assert.ok(r.state.gate, kind + ': takımlar ekranı açık'); assert.deepEqual(r.state.gate.ready, []);
    assert.ok(r.state.roundStart >= 40000, kind + ': oyun henüz başlamadı');
    assert.ok(r.state.g.teams && r.state.g.teams.length >= 1, 'takımlar önceden görünür');
    // tek kişi Tamam derse başlamaz
    await assert.rejects(handle(st, { action: 'teamReady', code, playerId: 'zzzzzzz', seq }, 1000), /./);
    r = await handle(st, { action: 'teamReady', code, playerId: A, seq: seq + 5 }, 1000); // eski/yanlış oyun: yok sayılır
    assert.deepEqual(r.state.gate.ready, []);
    r = await handle(st, { action: 'teamReady', code, playerId: A, seq }, 1000);
    assert.deepEqual(r.state.gate.ready, [A]); assert.deepEqual(r.state.gate.waiting, [Bp]);
    await handle(st, { action: 'state', code, playerId: Bp }, 2000); // Bp ekranda
    r = await handle(st, { action: 'state', code, playerId: A }, 3000);
    assert.ok(r.state.gate, 'Bp hazır değilken oyun başlamaz');
    // herkes Tamam deyince kısa bir an sonra başlar; süre/ilk tur bu andan sayılır
    r = await handle(st, { action: 'teamReady', code, playerId: Bp, seq }, 4000);
    assert.equal(r.state.gate, null, kind + ': herkes Tamam dedi');
    assert.equal(r.state.roundStart, 5500);
    assert.ok(r.state.deadline > r.state.roundStart);
  }
  // süre dolarsa Tamam demeyen beklenmez
  const { st, code } = await room(2, 0, 'halat');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  await handle(st, { action: 'teamReady', code, playerId: A, seq: r.state.seq }, 1000);
  await handle(st, { action: 'state', code, playerId: Bp }, 38000); // Bp ekranda (uzakta sayılmasın), ama Tamam demiyor
  r = await handle(st, { action: 'state', code, playerId: A }, 39000);
  assert.ok(r.state.gate, 'süre dolmadan açılmaz');
  r = await handle(st, { action: 'state', code, playerId: A }, 41000);
  assert.equal(r.state.gate, null, 'süre dolunca başlar'); assert.equal(r.state.roundStart, 42500);
  // takım olmayan oyunlarda ekran yok
  const rr = await room(2, 0, 'keski');
  const k = await handle(rr.st, { action: 'start', code: rr.code, playerId: A }, 0);
  assert.equal(k.state.gate, null); assert.equal(k.state.roundStart, 3000);
  ok('Takım oyunları: takımlar önceden görünür, herkes Tamam deyince (ya da 40 sn sonra) başlar');
}
console.log('TÜM TESTLER GEÇTİ');
