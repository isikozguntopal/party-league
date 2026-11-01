// Sapan Arenası C# kopyası (unity/Assets/Scripts/Oyunlar/Sapan/SapanKural.cs) için karşılaştırma verisi üretir.
//   node scripts/sapan-fixture.mjs /tmp/sapan-fixture.json  →  Unity: -executeMethod SapanTesti.Calistir -fixture /tmp/sapan-fixture.json
import { writeFileSync } from 'node:fs';
import * as LZ from '../public/games/lazer.js';

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const r = (a, b) => a + rnd() * (b - a);
const cases = [];
for (let i = 0; i < 300; i++) {
  const scale = LZ.arenaScale(1 + Math.floor(r(0, 12)));
  const x = r(-1.2, 1.2), y = r(-1.2, 1.2), a = r(-Math.PI, Math.PI), range = r(0.1, 2.5);
  const targets = Array.from({ length: Math.floor(r(0, 6)) }, (_, k) => ({ id: 't' + k, x: r(-1, 1) * scale, y: r(-1, 1) * scale }));
  cases.push({ x, y, a, range, scale, targets, round: 1 + i % 14,
    arenaScale: LZ.arenaScale(1 + i % 14), clamp: LZ.clampInside(x, y, LZ.BODY_R + 0.01, scale),
    on: LZ.onPlatform(x, y, scale), cast: LZ.castShot(x, y, a, targets, scale, LZ.cleanRange(range)), cleanRange: LZ.cleanRange(range) });
}
// tam tur çözümleri: açılış süresi (revealMs) C# zaman planıyla aynı mı
const resolves = [];
for (let i = 0; i < 30; i++) {
  const ids = Array.from({ length: 2 + (i % 9) }, (_, k) => 'p' + k);
  const d = { round: 1 + (i % 8), g: LZ.init(ids), history: [] };
  const actions = Object.fromEntries(ids.map((id) => [id, LZ.auto(d, id, true)]));
  const { entry, dur } = LZ.resolve(d, actions);
  resolves.push({ shots: entry.shots, dur });
}
writeFileSync(process.argv[2] || '/tmp/sapan-fixture.json', JSON.stringify({ cases, resolves }));
console.log('yazıldı:', cases.length, 'durum,', resolves.length, 'çözüm');
