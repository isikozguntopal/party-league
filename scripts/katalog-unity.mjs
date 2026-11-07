// Oyun kataloğu metinleri (ad + kurallar) sunucudaki oyun modüllerinden Unity'ye aktarılır.
//   node scripts/katalog-unity.mjs   (oyun kuralları değişince yeniden çalıştır)
import { writeFileSync } from 'node:fs';
import { GAMES, TEAM_GAMES } from '../public/game-core.js';
const UNITY = ['lazer', 'bilgi', 'keski', 'tanir', 'basket', 'bombaci', 'cizim', 'neciz', 'melodi', 'halat', 'saniye', 'suru', 'ayar', 'telve'];
const emojiYok = (s) => s.replace(/➕/g, '+').replace(/➖/g, '−').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s{2,}/g, ' ').trim();   // Unity Text emoji çizemez
const out = UNITY.map((k) => ({ kind: k, ad: GAMES[k].TITLE, kurallar: (GAMES[k].RULES || []).map(emojiYok), takim: TEAM_GAMES.includes(k), anlik: !!GAMES[k].realtime }));
writeFileSync('unity/Assets/Resources/Katalog/oyunlar.json', JSON.stringify(out, null, 1));
console.log('yazıldı:', out.length, 'oyun');
