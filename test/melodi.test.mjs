// Şarkıyı Tahmin Et: takım ortak tahmin hakkı, aşamalar, puanlama, gizlilik, otomatik tamamlama
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as M from '../public/games/melodi.js';
import { suggest } from '../public/client/melodi.js';

const ok = (m) => console.log('✓ ' + m);
const P = ['aaaaaaa', 'bbbbbbb', 'ccccccc', 'ddddddd'];

// ---------- Havuz ----------
{
  assert.ok(M.POOL_SIZE >= 5, 'havuzda en az 5 şarkı');
  assert.equal(new Set(M.POOL.map((s) => s.id)).size, M.POOL_SIZE, 'şarkı numaraları benzersiz');
  assert.ok(M.POOL.every((s) => Number.isInteger(s.id) && s.t && s.a), 'her şarkıda numara, ad, sanatçı var');
  assert.deepEqual(M.STAGES, [500, 1500, 5000, 10000, 20000], 'dinleme süreleri 0,5 → 1,5 → 5 → 10 → 20 sn');
  assert.ok(M.STAGE_POINTS.every((p, i, a) => !i || p < a[i - 1]), 'erken bilmek daha çok puan');
  ok(`Havuz: ${M.POOL_SIZE} şarkı, numaralar benzersiz; aşamalar 0,5/1,5/5/10/20 sn`);
}

// ---------- Otomatik tamamlama ----------
{
  const first = M.POOL[0], q = first.t.slice(0, 4);
  const r = suggest(q); assert.ok(r.length >= 1 && r.length <= 6); assert.ok(r.some((i) => M.POOL[i].id === first.id), 'adın başı yazılınca şarkı listede');
  assert.deepEqual(suggest('a'), [], 'tek harfte öneri yok');
  assert.deepEqual(suggest('zzzzqqqq'), [], 'olmayan şarkı → boş liste (seçilemez)');
  // sanatçıyla da bulunur, Türkçe karakter/büyük-küçük harf duyarsız
  const withTr = M.POOL.findIndex((s) => /[ışğüöç]/i.test(s.t + s.a));
  if (withTr >= 0) { const s = M.POOL[withTr]; const word = (s.t + ' ' + s.a).split(' ').find((w) => /[ışğüöçİŞĞÜÖÇ]/.test(w)); assert.ok(suggest(word.toUpperCase()).includes(withTr) || suggest(word.toLowerCase()).includes(withTr)); }
  const art = suggest(first.a); assert.ok(art.some((i) => M.POOL[i].a === first.a), 'sanatçı adıyla da bulunur');
  ok('Otomatik tamamlama: ad/sanatçı, harf duyarsız, listede olmayan çıkmaz (en çok 6 öneri)');
}

// ---------- Çekirdek kurallar ----------
const mkd = (ids = P, bots = []) => {
  const env = { players: ids.map((id) => ({ id, bot: bots.includes(id) })), addBot: () => ({ id: 'x', bot: true }) };
  const g = M.init(ids, env);
  return { round: 1, roundStart: 0, deadline: 1e9, hostId: ids[0], players: env.players, g };
};
{
  const d = mkd(), g = d.g;
  assert.equal(g.teams.length, 2); assert.ok(g.teams.every((t) => t.members.length === 2)); assert.equal(g.songs.length, M.SONG_COUNT);
  assert.equal(new Set(g.songs).size, M.SONG_COUNT, '5 farklı şarkı');
  const t0 = g.teams[0], [m1, m2] = t0.members, other = g.teams[1].members[0], ans = g.cur.song;
  const wrongA = M.POOL.findIndex((_, i) => i !== ans), wrongB = M.POOL.findIndex((_, i) => i !== ans && i !== wrongA);
  assert.throws(() => M.gact(d, m1, { t: 'guess', i: -1, round: 1 }, 1), /Listeden/);
  assert.throws(() => M.gact(d, m1, { t: 'guess', i: 9999, round: 1 }, 1), /Listeden/);
  assert.throws(() => M.gact(d, m1, { t: 'guess', i: 1.5, round: 1 }, 1), /Listeden/);
  assert.equal(M.gact(d, m1, { t: 'guess', i: wrongA, round: 2 }, 1), false, 'başka turun hamlesi yok sayılır');
  assert.equal(M.gact(d, m1, { t: 'guess', i: wrongA, round: 1 }, 1), true);
  const st = g.cur.teams[t0.id]; assert.equal(st.stage, 1); assert.equal(st.wrong.length, 1);
  assert.equal(M.gact(d, m2, { t: 'guess', i: wrongA, round: 1 }, 2), false, 'aynı yanlış tekrar sayılmaz (takım arkadaşı da)');
  assert.equal(st.stage, 1);
  assert.equal(M.gact(d, m2, { t: 'skip', round: 1 }, 3), true); assert.equal(st.stage, 2, 'atla = sonraki aşama (takım ortak hak)');
  assert.equal(g.cur.teams[g.teams[1].id].stage, 0, 'diğer takım etkilenmez');
  assert.equal(M.gact(d, m1, { t: 'guess', i: ans, round: 1 }, 4), true);
  assert.equal(st.solved, 2, '3. aşamada bildi'); assert.equal(st.done, true);
  assert.equal(M.gact(d, m2, { t: 'guess', i: wrongB, round: 1 }, 5), false, 'bitmiş takım tahmin edemez');
  assert.equal(M.isDue(d, 5), false, 'diğer takım bitirmeden tur bitmez');
  // diğer takım 5 hakkı da kullanır → başarısız
  for (let k = 0; k < 5; k++) M.gact(d, other, { t: 'skip', round: 1 }, 6 + k);
  assert.equal(g.cur.teams[g.teams[1].id].done, true); assert.equal(g.cur.teams[g.teams[1].id].solved, -1);
  assert.equal(M.isDue(d, 20), true, 'tüm takımlar bitince tur sonuçlanır');
  const { entry } = M.resolve(d);
  assert.equal(entry.rows.find((r) => r.team === t0.id).pts, M.STAGE_POINTS[2]);
  assert.equal(g.scores[m1], M.STAGE_POINTS[2]); assert.equal(g.scores[m2], M.STAGE_POINTS[2], 'puan takımın herkesine');
  assert.equal(g.scores[other], 0); assert.equal(entry.song.id, M.POOL[ans].id, 'sonuçta cevap açıklanır');
  assert.notEqual(g.cur.song, ans, 'sonraki tur başka şarkı'); assert.equal(g.cur.teams[t0.id].stage, 0, 'yeni tur taze');
  ok('Kurallar: ortak tahmin hakkı, yanlış/atla aşama atlatır, tekrar yanlış sayılmaz, erken bilen çok puan alır, puan takıma yazılır');
}
{
  // 5 aşama biter: dördüncü yanlıştan sonra 5. aşama (20 sn) hâlâ hak verir; 5 hak bitince başarısız
  const d = mkd(), g = d.g, [m1] = g.teams[0].members, st = g.cur.teams[g.teams[0].id], ans = g.cur.song;
  const wrong = M.POOL.map((_, i) => i).filter((i) => i !== ans);
  for (let k = 0; k < 4; k++) M.gact(d, m1, { t: 'guess', i: wrong[k], round: 1 }, 1);
  assert.equal(st.stage, 4); assert.equal(st.done, false, '5. aşama (20 sn) için hak sürüyor');
  assert.equal(M.gact(d, m1, { t: 'guess', i: ans, round: 1 }, 2), true); assert.equal(st.solved, 4); assert.equal(M.STAGE_POINTS[4], 30);
  const d2 = mkd(), s2 = d2.g.cur.teams[d2.g.teams[0].id], m = d2.g.teams[0].members[0];
  const w2 = M.POOL.map((_, i) => i).filter((i) => i !== d2.g.cur.song);
  for (let k = 0; k < 5; k++) M.gact(d2, m, { t: 'guess', i: w2[k], round: 1 }, 1);
  assert.equal(s2.done, true); assert.equal(s2.solved, -1, '5 yanlış → bilemedi');
  assert.equal(M.gact(d2, m, { t: 'guess', i: d2.g.cur.song, round: 1 }, 2), false, 'hak bitince doğru tahmin de sayılmaz');
  ok('5 hak: 5. aşamada bilirse 30 puan, 5 yanlışta takım bilemez');
}
{
  // takımda olmayan / bot / zamanından önce
  const d = mkd([P[0], P[1], P[2]], [P[2]]);
  const t = d.g.teams.find((x) => x.members.includes(P[0]));
  assert.throws(() => M.gact(d, 'zzzzzzz', { t: 'skip', round: 1 }, 1), /oynamıyorsun/);
  assert.throws(() => M.gact(d, P[2], { t: 'skip', round: 1 }, 1), /oynamıyorsun/, 'bot hamle yapamaz');
  d.roundStart = 100; assert.equal(M.gact(d, P[0], { t: 'skip', round: 1 }, 50), false, 'tur başlamadan hamle yok');
  assert.throws(() => M.normalize(), /listeden/);
  ok('Yetki: takım dışı, bot ve erken hamle reddedilir');
}
{
  // yalnızca bottan oluşan takım kendiliğinden bitmiş sayılır; sonuçta rastgele bilebilir
  const d = mkd([P[0], P[1], P[2], P[3]], [P[2], P[3]]);
  const humanTeam = d.g.teams.find((t) => !t.bot), botTeam = d.g.teams.find((t) => t.bot);
  assert.ok(humanTeam && botTeam);
  for (let k = 0; k < 5; k++) M.gact(d, humanTeam.members[0], { t: 'skip', round: 1 }, 1);
  assert.equal(M.isDue(d, 2), true, 'bot takım beklenmez');
  const { entry } = M.resolve(d); const br = entry.rows.find((r) => r.team === botTeam.id);
  assert.ok(br.solved === -1 || (br.solved >= 1 && br.solved <= 4));
  ok('Bot takımı: beklenmez, sonuçta rastgele bilir/bilemez');
}
{
  // gizlilik: görünümde cevap sırası yok, rakip takımın yanlışları yok
  const d = mkd(), g = d.g, [m1] = g.teams[0].members, [o1] = g.teams[1].members;
  const ans = g.cur.song, w = M.POOL.findIndex((_, i) => i !== ans);
  M.gact(d, o1, { t: 'guess', i: w, round: 1 }, 1);
  const v = M.view(d, m1);
  assert.equal(v.tid, M.POOL[ans].id, 'ses için şarkı numarası gerekir'); assert.equal(v.wrong.length, 0, 'rakibin yanlışları gizli');
  assert.ok(!('song' in v) && !('answer' in v) && !JSON.stringify(v).includes(`"i":${ans}`), 'cevap indeksi yok');
  assert.equal(v.teams.find((t) => t.id === g.teams[1].id).stage, 1, 'rakibin aşaması görünür'); assert.equal(M.view(d, o1).wrong.length, 1);
  ok('Gizlilik: rakip takımın yanlış tahminleri ve cevap indeksi görünmez; aşama ilerlemesi görünür');
}
{
  // sıralama: son şarkıdan sonra takım puanı
  const d = mkd(); const g = d.g;
  assert.equal(M.ranking({ ...d, round: 4 }, P), null);
  g.scores[P[0]] = 200; g.scores[P[1]] = 200; g.scores[P[2]] = 50; g.scores[P[3]] = 50;
  assert.deepEqual(M.ranking({ ...d, round: M.SONG_COUNT }, P), [[P[0], P[1]], [P[2], P[3]]]);
  ok('Sıralama: son şarkıda puana göre, eşit puan aynı grupta');
}

// ---------- Uçtan uca: 4 insan, 2 takım ----------
{
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: P[0], name: 'A' }, 0);
  const code = r.state.code;
  for (const p of P.slice(1)) await handle(st, { action: 'join', code, playerId: p, name: p.slice(0, 1) }, 0);
  await handle(st, { action: 'mode', code, playerId: P[0], mode: 'melodi' }, 0);
  await handle(st, { action: 'teamSize', code, playerId: P[0], size: 2 }, 0);
  r = await handle(st, { action: 'teams', code, playerId: P[0], teams: [[P[0], P[2]], [P[1], P[3]]] }, 0);
  assert.deepEqual(r.state.teams, [[P[0], P[2]], [P[1], P[3]]]);
  r = await handle(st, { action: 'start', code, playerId: P[0] }, 0);
  assert.ok(r.state.gate, 'takım ekranı');
  const members = r.state.g.teams.map((t) => t.members.slice().sort().join());
  assert.deepEqual(members.sort(), [[P[0], P[2]].sort().join(), [P[1], P[3]].sort().join()].sort(), 'oda sahibinin dağıttığı takımlar kullanıldı');
  for (const p of P) r = await handle(st, { action: 'teamReady', code, playerId: p, seq: r.state.seq }, 1);
  const seq = r.state.seq; let now = r.state.roundStart + 100;
  for (let rd = 1; rd <= M.SONG_COUNT; rd++) {
    for (const p of P) await handle(st, { action: 'state', code, playerId: p }, now);
    const v = (await handle(st, { action: 'state', code, playerId: P[0] }, now)).state;
    assert.equal(v.round, rd); assert.equal(v.g.n, rd);
    // her takım 5 kez atlayıp bitirir
    for (let k = 0; k < 5; k++) { await handle(st, { action: 'gact', code, playerId: P[0], seq, round: rd, t: 'skip' }, now); r = await handle(st, { action: 'gact', code, playerId: P[1], seq, round: rd, t: 'skip' }, now); }
    now = r.state.roundStart + 100;
  }
  assert.equal(r.state.status, 'over', '5 şarkı sonunda oyun biter');
  ok('Uçtan uca: oda sahibinin dağıttığı takımlarla 5 şarkı oynanır ve oyun biter');
}
console.log('Şarkıyı Tahmin Et testleri tamam');
