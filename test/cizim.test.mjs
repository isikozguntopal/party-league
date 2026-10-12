// Kulaktan Kulağa testleri: node test/cizim.test.mjs
// Tahmin yakınlığı puanı, dolu şekiller (f:1), albüm → sonuç fazı, toplam puan sıralaması
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as C from '../public/games/cizim.js';
import { drawStrokes, traceRings, ringsToPoly, floodMask } from '../public/client/cizim.js';

const A = 'aaaaaaa', Bp = 'bbbbbbb', Cp = 'ccccccc';
const ok = (m) => console.log('✓ ' + m);

async function room(nHumans, nBots = 0, mode = 'cizim') {
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  if (nHumans >= 2) await handle(st, { action: 'join', code, playerId: Bp, name: 'Banu' }, 0);
  if (nHumans >= 3) await handle(st, { action: 'join', code, playerId: Cp, name: 'Can' }, 0);
  for (let i = 0; i < nBots; i++) await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode }, 0);
  return { st, code };
}
async function runUntil(st, code, cond, start = 0, maxSteps = 400) {
  let now = start, r = await handle(st, { action: 'state', code, playerId: A }, now);
  for (let i = 0; i < maxSteps && !cond(r.state); i++) {
    // Oy zorunlu olduğundan albüm, oy vermeyen insanlar "uzakta" sayılana (12 sn) ya da ek süre bitene kadar bekler
    const nx = Math.max(now + 1, r.state.deadline + 1100); now = nx === now + 1 ? now + 3000 : nx;
    r = await handle(st, { action: 'state', code, playerId: A }, now);
  }
  return { r, now };
}

// ---------- Tahmin yakınlığı ----------
{
  const s = C.similarity;
  assert.equal(s('Uçan bir kedi pizza yiyor', 'Uçan bir kedi pizza yiyor'), 1);
  assert.equal(s('UÇAN BİR KEDİ PİZZA YİYOR', 'ucan bir kedi pizza yiyor'), 1, 'Türkçe büyük/küçük ve aksan farkı yok sayılır');
  assert.ok(s('Uçan bir kedi pizza yiyor', 'Kedi pizza yiyor') >= 0.8, 'kelimelerin çoğu örtüşüyor');
  assert.ok(s('Uçan bir kedi pizza yiyor', 'pizza yiyen kediler') >= 0.4 && s('Uçan bir kedi pizza yiyor', 'pizza yiyen kediler') < 0.8, 'kök eşleşmesi (kedi/kediler, yiyor/yiyen)');
  assert.ok(s('Şemsiyeli bir balık', 'semsiyeli balik') >= 0.8, 'aksansız yazım');
  assert.ok(s('Kardan adam güneşte eriyor', 'Kardan adem gunes') >= 0.4, 'küçük yazım hatası + kök');
  assert.ok(s('Uçan bir kedi pizza yiyor', 'Bir köpek') < 0.4, 'alakasız ("bir" sayılmaz) → puan yok');
  assert.equal(C.simPts(s('Uçan bir kedi pizza yiyor', 'Bir köpek')), 0);
  assert.equal(s('', 'kedi'), 0);
  assert.equal(C.simPts(1), 3); assert.equal(C.simPts(0.8), 3); assert.equal(C.simPts(0.79), 2); assert.equal(C.simPts(0.6), 2); assert.equal(C.simPts(0.45), 1); assert.equal(C.simPts(0.39), 0);
  assert.equal(C.levenshtein('kedi', 'kedı'), 1);
  assert.equal(C.normalizeText('  Ağaç, Çiçek! ÖĞLE  '), 'agac cicek ogle');
  ok('Tahmin yakınlığı: Türkçe normalize + kelime örtüşmesi + Levenshtein → 0..1; ≥.4/.6/.8 → 1/2/3 puan');
}

// ---------- Dolu şekiller: kova/şekil poligonu ve drawStrokes ----------
{
  // 40x40 maske: dolu kare, ortasında delik → 2 halka, tek poligon (köprülü), evenodd ile delik korunur
  const R = 40, mask = new Uint8Array(R * R);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) if (!(x >= 15 && x < 25 && y >= 15 && y < 25)) mask[y * R + x] = 1;
  const rings = traceRings(mask, R);
  assert.equal(rings.length, 2, 'dış halka + delik');
  const poly = ringsToPoly(rings, R);
  assert.ok(poly.length % 2 === 0 && poly.length <= 40 && poly.every((v) => v >= 0 && v <= 1000));
  const inside = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  assert.ok(inside(poly, 200, 200) && inside(poly, 750, 500), 'halka içi dolu');
  assert.ok(!inside(poly, 500, 500), 'delik boş kalır');
  assert.ok(!inside(poly, 50, 50), 'dışarısı boş');
  // taşma doldurma: 20x20 beyaz, 5..14 siyah kare çerçeve
  const N = 20, img = new Uint8ClampedArray(N * N * 4).fill(255);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) if (x === 5 || x === 14 || y === 5 || y === 14) { const o = (y * N + x) * 4; img[o] = img[o + 1] = img[o + 2] = 0; }
  assert.equal(floodMask(img, N, 9, 9).reduce((a, b) => a + b, 0), 64, 'çerçeve içi 8x8');
  assert.equal(floodMask(img, N, 0, 0).reduce((a, b) => a + b, 0), 300, 'dışarısı çerçeveyi geçmez');

  // drawStrokes: f:1 → kapalı yol + fill('evenodd'); w=0 ise kenar çizilmez; t0'dan önce görünmez
  const calls = [];
  const g = new Proxy({}, { get: (_, k) => (k in {}) ? undefined : (...a) => { calls.push([k, ...a]); } });
  const filled = { c: 3, w: 0, p: [100, 100, 900, 100, 900, 900, 100, 900], f: 1, t: [1000, 1200] };
  drawStrokes(g, [filled], 0, 0, 1000);
  assert.ok(calls.some(([k, r]) => k === 'fill' && r === 'evenodd'), 'evenodd dolgu');
  assert.ok(calls.some(([k]) => k === 'closePath'));
  assert.ok(!calls.some(([k]) => k === 'stroke'), 'w=0: kenar yok');
  calls.length = 0;
  drawStrokes(g, [filled], 0, 0, 1000, 500);
  assert.ok(!calls.some(([k]) => k === 'fill'), 'tekrar oynatmada t0 öncesi görünmez');
  calls.length = 0;
  drawStrokes(g, [{ ...filled, w: 2 }], 0, 0, 1000, 1100);
  assert.ok(calls.some(([k]) => k === 'fill') && calls.some(([k]) => k === 'stroke'), 'w>0: dolgu + aynı renk kenar');
  ok('Dolu şekil: maske → halkalar → köprülü poligon (delikler korunur); drawStrokes f:1 evenodd');
}

// ---------- Oyun akışı: yakınlık puanı, sonuç fazı, toplamlar ----------
{
  const { st, code } = await room(3, 1, 'cizim');
  let r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const { seq } = r.state;
  let now = r.state.roundStart;
  const order = r.state.g.order, N = order.length;
  assert.equal(N, 4); assert.equal(r.state.g.S, 4);
  const texts = { [A]: 'Uçan bir kedi pizza yiyor', [Bp]: 'Şemsiyeli bir balık', [Cp]: 'Kardan adam güneşte eriyor' };
  for (const id of [A, Bp, Cp]) r = await handle(st, { action: 'act', code, playerId: id, seq, round: 1, text: texts[id] }, now);
  assert.equal(r.state.g.type, 'draw');
  now = r.state.roundStart;
  // çiz: A dolu şekil (f:1) + normal çizgi gönderir
  r = await handle(st, { action: 'act', code, playerId: A, seq, round: 2, strokes: [{ c: 1, w: 1, p: [10, 10, 500, 500], t: [0, 800] }, { c: 4, w: 0, p: [100, 100, 900, 100, 900, 900, 100, 900, 100, 100, 400, 400, 600, 400, 600, 600, 400, 600, 400, 400, 100, 100], f: 1, t: [900, 1100] }] }, now);
  assert.equal(r.state.myAction.art.dur, 1100);
  const art = await handle(st, { action: 'art', code, playerId: Bp, key: r.state.myAction.art.key }, now);
  assert.equal(art.art[1].f, 1, 'f:1 sunucuda korunur');
  assert.equal(art.art[0].f, undefined);
  let out = await runUntil(st, code, (s) => s.round === 3, now);
  r = out.r; now = r.state.roundStart;
  assert.equal(r.state.g.type, 'guess');
  // tahmin: her insan kendi zincirinin ilk cümlesini bilir (yazar insansa) → tam isabet
  const authorOf = (id) => order[((order.indexOf(id) - 2) % N + N) % N];
  // 3 insan + 1 bot: tam iki insanın zinciri insan cümlesiyle başlar → biri tam isabet, biri kısmi; bot cümlesini bilen yok
  const guesses = {}, role = {};
  let humanChains = 0;
  for (const id of [A, Bp, Cp]) await handle(st, { action: 'state', code, playerId: id }, now); // herkes "burada" (uzakta sayılmasın)
  for (const id of [A, Bp, Cp]) {
    const au = authorOf(id);
    role[id] = !texts[au] ? 'bot' : humanChains++ === 0 ? 'exact' : 'partial';
    guesses[id] = role[id] === 'exact' ? texts[au] : role[id] === 'partial' ? texts[au].split(' ').slice(-2).join(' ') : 'Bir şey';
    r = await handle(st, { action: 'act', code, playerId: id, seq, round: 3, text: guesses[id] }, now);
  }
  assert.equal(humanChains, 2);
  out = await runUntil(st, code, (s) => s.g && s.g.phase === 'album', now);
  r = out.r; now = out.now;
  assert.equal(r.state.g.ai, 0);
  assert.equal(r.state.g.chains, N, 'albüm sayısı');
  // albümde 3. öğe (k=2) tahmin: yakınlık alanları gösterilir
  out = await runUntil(st, code, (s) => s.g && s.g.phase === 'album' && s.g.ai >= 2, now);
  r = out.r; now = out.now;
  const gs = r.state.g.shown[2];
  assert.equal(gs.type, 'text'); assert.equal(gs.k, 2);
  assert.equal(typeof gs.sim, 'number'); assert.ok(gs.pts >= 0 && gs.pts <= 3);
  assert.equal(r.state.g.shown[0].sim, undefined, 'ilk cümlede yakınlık yok');
  if (role[gs.by] === 'exact') { assert.equal(gs.sim, 1); assert.equal(gs.pts, 3); }
  if (role[gs.by] === 'partial') assert.ok(gs.pts >= 1 && gs.pts <= 2, 'kısmi tahmin 1-2 puan');
  // çizime oy: n=1 (k=1 çizim) — çizmeyen iki kişi +1
  const d1 = r.state.g.shown[1];
  assert.equal(d1.type, 'draw');
  const voters = [A, Bp, Cp].filter((id) => id !== d1.by);
  for (const v of voters.slice(0, 2)) await handle(st, { action: 'gact', code, playerId: v, seq, vote: 1, v: 1 }, now);
  await assert.rejects(handle(st, { action: 'gact', code, playerId: d1.by, seq, vote: 1, v: 1 }, now), /Kendi/);
  r = await handle(st, { action: 'state', code, playerId: A }, now);
  const sc1 = r.state.g.shown[1].score; // +2 insan; bot albüm ilerlerken ±1 vermiş olabilir
  assert.ok(r.state.g.shown[1].plus >= 2 && sc1 >= 1 && sc1 <= 3, `oy toplamı ${sc1}`);
  // albüm bitince ranking hâlâ null → 'final' fazı (puan tablosu + ressamlar), süresi FINAL_MS
  assert.equal(C.ranking({ g: { phase: 'album', ai: 99, album: [] } }, []), null);
  assert.equal(C.ranking({ g: { phase: 'final', done: false } }, []), null);
  out = await runUntil(st, code, (s) => s.status !== 'playing' || (s.g && s.g.phase === 'final'), now);
  r = out.r; now = out.now;
  assert.equal(r.state.status, 'playing');
  assert.equal(r.state.g.phase, 'final');
  assert.equal(r.state.deadline - r.state.roundStart, C.FINAL_MS);
  const G = r.state.g;
  assert.ok(Array.isArray(G.board) && G.board.length === N);
  for (const row of G.board) assert.equal(row.total, row.votes + row.sim, 'toplam = oy + yakınlık');
  for (let i = 1; i < G.board.length; i++) assert.ok(G.board[i - 1].total >= G.board[i].total, 'tablo sıralı');
  const expSim = Object.fromEntries([A, Bp, Cp].map((id) => [id, texts[authorOf(id)] ? C.simPts(C.similarity(texts[authorOf(id)], guesses[id])) : null]));
  for (const id of [A, Bp, Cp]) if (expSim[id] !== null) assert.equal(G.board.find((b) => b.id === id).sim, expSim[id], `${id} yakınlık puanı`);
  const exactId = [A, Bp, Cp].find((id) => role[id] === 'exact'), partialId = [A, Bp, Cp].find((id) => role[id] === 'partial');
  assert.equal(G.board.find((b) => b.id === exactId).sim, 3, 'tam isabet 3 puan');
  const ps = G.board.find((b) => b.id === partialId).sim;
  assert.ok(ps >= 1 && ps <= 2, 'kısmi tahmin 1-2 puan');
  // galeri: artık ressamlar açık; her oyuncunun oy puanı = kendi çizimlerinin oy toplamı
  assert.ok(G.gallery.length === G.board.length * 2, 'her zincirde 2 çizim');
  assert.ok(G.gallery.every((it) => it.by && it.art && typeof it.prompt === 'string'));
  assert.equal(G.gallery.find((it) => it.n === 1).score, sc1);
  for (const row of G.board) assert.equal(row.votes, G.gallery.filter((it) => it.by === row.id).reduce((a, it) => a + it.score, 0), 'çizim oyları ressama yazılır');
  assert.equal(G.shown, undefined);
  // oda sahibi ▶ ile sonucu geçer → oyun biter; sıralama toplam puana göre
  await assert.rejects(handle(st, { action: 'gact', code, playerId: Bp, seq, next: true }, r.state.roundStart + 10), /oda sahibi/);
  r = await handle(st, { action: 'gact', code, playerId: A, seq, next: true }, r.state.roundStart + 10);
  assert.equal(r.state.status, 'over');
  const res = r.state.tour.results[0];
  assert.equal(res.kind, 'cizim');
  assert.ok(res.ranking[0].includes(G.board[0].id), 'en yüksek toplam birinci');
  const flat = res.ranking.flat();
  assert.equal(flat.length, N);
  ok(`Kulaktan Kulağa: f:1 çizim saklandı, tahmin yakınlığı puanlandı, albüm → sonuç tablosu (${C.FINAL_MS} ms) → sıralama = oy + yakınlık`);
}

console.log('TÜM TESTLER GEÇTİ (cizim)');

// ---------- Zorunlu oy: herkes oy vermeden çizim geçilmez ----------
{
  const mk = (item) => ({
    deadline: 1000, round: 5, players: [],
    g: { phase: 'album', ai: 0, album: [item], chains: [[{ by: 'x', type: item.type }]], votes: {}, alive: { x: 1, y: 1, z: 1, b: 1 }, bots: ['b'], skip: 0 },
  });
  const d = mk({ c: 0, k: 0, type: 'draw' });
  assert.deepEqual(C.pendingVoters(d), ['y', 'z'], 'ressam ve bot beklenmez');
  assert.equal(C.isDue(d, 999), false, 'süre dolmadan geçilmez');
  assert.equal(C.isDue(d, 1000), false, 'süre doldu ama oy vermeyen var');
  d.g.skip = 5;
  assert.equal(C.isDue(d, 500), false, 'oda sahibinin ▶ tuşu da oy beklemeyi atlatmaz');
  d.g.votes[0] = { y: 1 };
  assert.deepEqual(C.pendingVoters(d), ['z']);
  assert.equal(C.isDue(d, 1000), false, 'z hâlâ oy vermedi');
  assert.equal(C.isDue(d, 1000, (id) => id !== 'z'), true, 'uzaktaki (beklenmeyen) oyuncu geçişi tutmaz');
  d.g.votes[0].z = -1;
  assert.equal(C.isDue(d, 1000), true, 'herkes oy verince geçilir');
  assert.equal(C.isDue(d, 600), true, 'herkes oy verdi + oda sahibi ▶');
  d.g.votes[0] = {}; d.g.skip = 0;
  assert.equal(C.isDue(d, 1000 + 24000), false, 'ek süre dolmadan geçilmez');
  assert.equal(C.isDue(d, 1000 + 25000), true, 'oy vermeyen biri herkesi sonsuza dek tutamaz');
  const t = mk({ c: 0, k: 0, type: 'text' });
  assert.deepEqual(C.pendingVoters(t), [], 'yazıda oy yok');
  assert.equal(C.isDue(t, 1000), true);
  ok('Zorunlu oy: ressam/bot/uzaktaki beklenmez, ▶ oyu atlatmaz, 25 sn ek süre sonrası geçilir');
}
