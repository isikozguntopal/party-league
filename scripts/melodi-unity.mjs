// Şarkıyı Tahmin Et havuzunu Unity'ye aktarır (tahmin listesi). Sıra = sunucudaki POOL sırası (gact "i" bu sırayı kullanır).
//   node scripts/melodi-unity.mjs   (games/melodi-sarkilar.js değişince yeniden çalıştır)
import { writeFileSync, mkdirSync } from 'node:fs';
import { POOL } from '../public/games/melodi.js';
mkdirSync('unity/Assets/Resources/Melodi', { recursive: true });
writeFileSync('unity/Assets/Resources/Melodi/sarkilar.json', JSON.stringify(POOL.map((s) => [s.id, s.t, s.a, s.u || ''])));
console.log('yazıldı:', POOL.length, 'şarkı');
