// Pota Atışı: fizik, puan katlama, pota hareketi, sonuç doğrulama, uçtan uca oda akışı
import assert from 'node:assert/strict';
import { handle, MemoryStore } from '../public/game-core.js';
import * as B from '../public/games/basket.js';

const ok = (m) => console.log('✓ ' + m);
const A = 'aaaaaaa', Bp = 'bbbbbbb';

// t anında (pota o sırada nerede olursa) çekiş uzunluğu / açı ile atış yap; olaylar ve sayı döner
function shoot(len, ang, t = 0, ball = B.newBall()) {
  const vel = B.launchVel(-Math.cos(ang) * len, -Math.sin(ang) * len);
  if (!vel) return null;
  B.fire(ball, vel);
  const evs = [];
  for (let i = 0; i < 600 && ball.live; i++) evs.push(...B.stepBall(ball, 1 / 60, t + i / 60));
  return { evs, scored: evs.includes('score'), swish: evs.includes('swish') };
}
// Bu t için sayı yapan bir atış bul (ızgara taraması): [len, ang] — tercihen temiz
function solve(t, wantSwish = false) {
  for (let len = 1.6; len <= 3.0; len += 0.02) for (let a = 0.3; a <= 1.45; a += 0.01) { const r = shoot(len, a, t); if (r && r.scored && (!wantSwish || r.swish)) return { len, a, ...r }; }
  return null;
}

// ---------- Pota hareketi ----------
{
  const ys = [], xs = [];
  for (let t = 0; t <= 45; t += 0.1) { const h = B.hoopAt(t); ys.push(h.y); xs.push(h.x); }
  const still = [], mid = [], late = [];
  for (let t = 0; t < 12; t += 0.1) still.push(B.hoopAt(t));
  assert.ok(still.every((h) => h.x === 7.6 && h.y === 9), 'ilk 8 saniye pota sabit');
  const y2 = []; for (let t = 18; t < 27; t += 0.05) y2.push(B.hoopAt(t).y);
  assert.ok(Math.max(...y2) - Math.min(...y2) > 2, 'sonra yukarı-aşağı oynar');
  assert.ok(new Set(y2.map((v) => 7.6)).size === 1 && [...Array(90)].every((_, i) => B.hoopAt(18 + i * 0.1).x === 7.6), '8-18 sn yalnızca dikey');
  const x3 = []; for (let t = 27; t <= 45; t += 0.05) x3.push(B.hoopAt(t).x);
  assert.ok(Math.max(...x3) - Math.min(...x3) > 1.2, 'son 12 saniyede yana da oynar');
  assert.ok(Math.min(...ys) > 5.5 && Math.max(...ys) < 12 && Math.min(...xs) > 5.3 && Math.max(...xs) < 7.7, 'pota ekranda kalır, ulaşılabilir bölgede');
  ok('Pota: 8 sn sabit → yukarı-aşağı → yana da; hep erişilebilir bölgede');
}

// ---------- Atış fiziği ----------
{
  assert.equal(B.launchVel(0.1, 0.1), null, 'çok kısa çekiş atış sayılmaz');
  const v = B.launchVel(-1, -1), vMax = B.launchVel(-9, -9);
  assert.ok(v.vx > 0 && v.vy > 0, 'geri (sol-aşağı) çekince sağa-yukarı gider');
  assert.ok(Math.hypot(vMax.vx, vMax.vy) <= B.MAX_DRAG * B.POWER + 1e-9, 'güç sınırlı');
  const tr = B.trajectory(v.vx, v.vy); assert.ok(Math.abs(tr[0].x - B.BALL_X0) < 1e-9 && tr[5].y > tr[0].y, 'önizleme topun başlangıcından kalkar');
  // boşa atış: sayı yok, "miss", kombo bitirir
  const r = shoot(0.7, 1.3); assert.ok(r && !r.scored && r.evs.includes('miss') && r.evs.every((e) => e !== 'score'));
  // sayı: halkanın içinden aşağı geçer; tek atışta bir kez
  const s0 = solve(0); assert.ok(s0, 'sabit potada sayı yapan atış var');
  const sc = shoot(s0.len, s0.a, 0); assert.equal(sc.evs.filter((e) => e === 'score').length, 1, 'bir atış en çok bir sayı');
  assert.ok(!sc.evs.includes('miss'), 'sayı olan atış "miss" değildir');
  // hareketli potada da (her aşamada) sayı mümkün
  for (const t of [0, 9, 13, 16, 20, 24, 27]) assert.ok(solve(t), `t=${t}: sayı yapılabilir`);
  // temiz atış (kenara değmeden) mümkün
  const sw = solve(0, true); assert.ok(sw && sw.swish, 'temiz atış var'); { const before = sw.evs.slice(0, sw.evs.indexOf('score')); assert.ok(!before.includes('rim') && !before.includes('board'), 'sayıdan önce kenara/tahtaya değmez'); }
  // yukarıdan değil alttan geçen top sayılmaz: potanın altından yukarı fırlat
  const b = B.newBall(); B.fire(b, { vx: 8, vy: 14 }); let up = 0; for (let i = 0; i < 200 && b.live; i++) if (B.stepBall(b, 1 / 60, 0).includes('score')) up++;
  assert.ok(up === 0 || b.scored, 'alttan geçen sayılmaz (yalnızca yukarıdan aşağı)');
  ok('Fizik: çekiş→hız, önizleme, boşa atış = miss, sayı tek seferlik, her pota konumunda sayı mümkün, temiz atış var');
}

// ---------- Puan katlama ----------
{
  const sc = B.newScore();
  assert.equal(B.awardMake(sc, false), 2, '1. sayı ×1: 2 puan');
  assert.equal(B.awardMake(sc, false), 4, '2. ardışık ×2: 4 puan');
  assert.equal(B.awardMake(sc, true), 9, '3. ardışık ×3, temiz: (2+1)×3 = 9');
  assert.equal(B.awardMake(sc, false), 8); assert.equal(B.awardMake(sc, false), 10); assert.equal(B.awardMake(sc, false), 10, '×5 sınırı');
  assert.equal(sc.streak, 6); assert.equal(sc.best, 6); assert.equal(sc.made, 6); assert.equal(sc.score, 2 + 4 + 9 + 8 + 10 + 10);
  B.awardMiss(sc); assert.equal(sc.streak, 0, 'kaçırınca kombo biter'); assert.equal(sc.best, 6, 'en iyi seri korunur');
  assert.equal(B.awardMake(sc, false), 2, 'kombo sıfırdan başlar');
  assert.equal(B.multiplier(0), 1); assert.equal(B.multiplier(9), 5);
  ok('Puan: 2/4/6/8/10 katlanır (×5 sınırı), temiz +1 (katlanır), kaçırınca kombo biter, en iyi seri korunur');
}

// ---------- 30 sn'lik tam oyun: çözücü oyuncu (gerçek zamanlı akışla) ----------
{
  let t = 0, sc = B.newScore(), shots = 0;
  const ball = B.newBall();
  while (t < 45 && shots < B.MAX_SHOTS) {
    // her atış için o anki pota ile çöz (ızgara): yaklaşık 0.9 sn uçuş + 0.2 sn bekleme
    const s = solve(t);
    if (!s) { t += 0.5; continue; }
    B.fire(ball, B.launchVel(-Math.cos(s.a) * s.len, -Math.sin(s.a) * s.len)); shots++; sc.shots++;
    const t0 = t;
    for (let i = 0; i < 600 && ball.live; i++) {
      const ev = B.stepBall(ball, 1 / 60, t); t += 1 / 60;
      if (ev.includes('score')) B.awardMake(sc, ev.includes('swish'));
      if (ev.includes('miss')) B.awardMiss(sc);
    }
    t += 0.15;
    assert.ok(t > t0);
  }
  assert.ok(sc.made >= 8, `çözücü 30 sn'de çok sayı yapar: ${sc.made}`);
  assert.ok(sc.best >= 3 && sc.score > sc.made * 2, `seri sayılar puanı katlar: ${sc.score} puan, ${sc.made} sayı, en iyi seri ${sc.best}`);
  assert.ok(sc.score <= B.MAX_SCORE, 'sunucu sınırı aşılmaz');
  ok(`45 sn tam oyun (çözücü): ${sc.made} sayı / ${sc.shots} atış, en iyi seri ${sc.best}, ${sc.score} puan`);
}

// ---------- Sunucu: sonuç doğrulama ----------
{
  const d = { roundStart: 0, g: B.init([A, Bp], { players: [{ id: A, bot: false }, { id: Bp, bot: true }] }) };
  const now = B.COUNT_MS + B.PLAY_MS + 500;
  assert.deepEqual(B.normalize(d, A, { score: 20, made: 6, shots: 12, best: 3 }, now), { score: 20, made: 6, shots: 12, best: 3 });
  for (const bad of [{ score: -1, made: 0, shots: 0, best: 0 }, { score: 20, made: 7, shots: 5, best: 1 }, { score: 999, made: 40, shots: 40, best: 5 }, { score: 20, made: 2, shots: 4, best: 1 }, { score: 5, made: 3, shots: 3, best: 3 }, { score: 'x', made: 1, shots: 1, best: 1 }, { score: 5, made: 1, shots: 1, best: 2 }, { score: 3.5, made: 1, shots: 1, best: 1 }]) {
    assert.throws(() => B.normalize(d, A, bad, now), /Geçersiz/, JSON.stringify(bad));
  }
  assert.throws(() => B.normalize(d, A, { score: 150, made: 30, shots: 30, best: 5 }, B.COUNT_MS + 4000), /Geçersiz/, 'oyun başlar başlamaz 30 sayı gelemez');
  ok('Sonuç doğrulama: negatif, sayıdan çok sayı, fazla puan, kesirli, çok erken sonuç reddedilir');
}

// ---------- Uçtan uca: iki insan + bot ----------
{
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'join', code, playerId: Bp, name: 'Banu' }, 0);
  await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: 'basket' }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  const seq = r.state.seq, rs = r.state.roundStart, end = rs + B.COUNT_MS + B.PLAY_MS + 200;
  assert.equal(r.state.kind, 'basket'); assert.equal(r.state.g.phase, 'play'); assert.equal(r.state.deadline, rs + B.PLACE_MS);
  await handle(st, { action: 'state', code, playerId: A }, end - 100); await handle(st, { action: 'state', code, playerId: Bp }, end - 100);   // ikisi de çevrimiçi
  r = await handle(st, { action: 'act', code, playerId: A, seq, round: 1, score: 40, made: 8, shots: 14, best: 4 }, end);
  assert.equal(r.state.status, 'playing', 'herkes göndermeden sonuç açılmaz');
  await assert.rejects(handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, score: 9999, made: 5, shots: 5, best: 2 }, end), /Geçersiz/);
  r = await handle(st, { action: 'act', code, playerId: Bp, seq, round: 1, score: 60, made: 9, shots: 12, best: 5 }, end);
  assert.equal(r.state.status, 'over', 'tek oyun: herkes gönderince biter');
  const rk = r.state.tour.results[0].ranking;
  const rows = r.state.last.rows;
  assert.ok(rows.every((x, i) => !i || rows[i - 1].score >= x.score), 'sonuç satırları puana göre sıralı');
  const order = rk.flat(); assert.equal(order.length, 3);
  assert.ok(order.indexOf(Bp) < order.indexOf(A) || rows.find((x) => x.id === Bp).score <= rows.find((x) => x.id === A).score, 'Banu (60) Ali\'den (40) önde');
  assert.ok(order.indexOf(Bp) < order.indexOf(A), 'Banu Ali\'nin önünde');
  assert.equal(rows.find((x) => x.id === Bp).score, 60);
  ok('Uçtan uca: 2 insan + bot — sonuçlar toplanır, sıralama puana göre, sahte sonuç reddedilir');
}
{
  // süre dolup kimse göndermezse oyun tıkanmaz
  const st = new MemoryStore();
  let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, 0);
  const code = r.state.code;
  await handle(st, { action: 'addBot', code, playerId: A }, 0);
  await handle(st, { action: 'mode', code, playerId: A, mode: 'basket' }, 0);
  r = await handle(st, { action: 'start', code, playerId: A }, 0);
  r = await handle(st, { action: 'state', code, playerId: A }, r.state.deadline + 2000);
  assert.equal(r.state.status, 'over'); assert.equal(r.state.tour.results.length, 1);
  ok('Süre dolunca: göndermeyen insan 0 puanla sıralanır, oyun tıkanmaz');
}
console.log('Pota Atışı testleri tamam');
