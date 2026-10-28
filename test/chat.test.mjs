// Laf atma: filtre + sunucu akışı (hazır mesaj ve serbest yazı)
import assert from 'node:assert/strict';
import { cleanChat, isBad, CHAT_MAX } from '../public/games/filtre.js';
import { handle, MemoryStore } from '../public/game-core.js';

// ---- Filtre: masum cümleler geçmeli ----
for (const ok of ['Sıra sende', 'sıkıldım', 'Samimi konuşalım', 'ananım aradı', 'Puset aldım', 'Gol attım 😂', 'Nişan almayı bilmiyorsun', 'Amin', 'Çok pardon', 'Bu kadar mı?', 'GG ez', 'Bilardo ustası', 'Kaç oldu 1 mi 2 mi']) {
  assert.equal(isBad(ok), false, `masum cümle engellendi: ${ok}`);
}
console.log('✓ Filtre: masum cümleler geçiyor');

// ---- Filtre: uygunsuzlar ve kaçamak yazımlar yakalanmalı ----
for (const bad of ['siktir git', 'SİKTİR', 'orospu', 'amk', 'aq', 's i k t i r', 's.i.k.t.i.r', 'siiiiktir', 'sikt1r', 'or0spu', 'pezevenk seni', 'yarrak', 'ibne']) {
  assert.equal(isBad(bad), true, `uygunsuz geçti: ${bad}`);
}
console.log('✓ Filtre: uygunsuz ve kaçamak yazımlar yakalanıyor');

// ---- Temizleme ----
assert.equal(cleanChat('  merhaba   dünya  '), 'merhaba dünya');
assert.equal(cleanChat('<b>selam</b>'), 'bselam/b');
assert.equal(cleanChat('a'.repeat(200)).length, CHAT_MAX);
for (const x of ['', '   ', 'http://kotu.site', 'www.kotu.com', 'beni ekle @kullanici', 'kotu.com', 42, null]) {
  assert.throws(() => cleanChat(x), undefined, `geçersiz mesaj kabul edildi: ${x}`);
}
console.log('✓ Temizleme: boşluk, etiket, uzunluk, bağlantı');

// ---- Sunucu akışı ----
const st = new MemoryStore();
const A = 'a-oyuncu-0001', B = 'b-oyuncu-0002';
let now = 1_000_000;
let r = await handle(st, { action: 'create', playerId: A, name: 'Ali' }, now);
const code = r.state.code;
await handle(st, { action: 'join', code, playerId: B, name: 'Banu' }, now);
const chatOf = async (t) => (await handle(st, { action: 'state', code, playerId: A }, t)).state.chat || [];

// serbest yazı
await handle(st, { action: 'say', code, playerId: A, text: '  Kaybedeceksin  ' }, now);
let c = await chatOf(now);
assert.equal(c.length, 1);
assert.equal(c[0].x, 'Kaybedeceksin');
assert.equal(c[0].p, A);
assert.equal(c[0].k, undefined);
console.log('✓ Sunucu: serbest yazı odaya yazılıyor');

// çok hızlı ikinci mesaj engellenir
await assert.rejects(() => handle(st, { action: 'say', code, playerId: A, text: 'tekrar' }, now + 300), /yavaş/);
console.log('✓ Sunucu: hız sınırı çalışıyor');

// filtre sunucuda da uygulanır
now += 2000;
await assert.rejects(() => handle(st, { action: 'say', code, playerId: A, text: 'siktir' }, now), /gönderilemez/);
await assert.rejects(() => handle(st, { action: 'say', code, playerId: A, text: '   ' }, now), /boş/);
console.log('✓ Sunucu: uygunsuz ve boş mesaj reddediliyor');

// hazır mesaj hâlâ çalışır, başkası da görür
await handle(st, { action: 'say', code, playerId: B, k: 3 }, now);
c = await chatOf(now);
assert.ok(c.some((m) => m.p === B && m.k === 3));
await assert.rejects(() => handle(st, { action: 'say', code, playerId: B, k: 999 }, now + 5000), /Geçersiz/);
console.log('✓ Sunucu: hazır mesajlar çalışıyor, herkes görüyor');

// odada olmayan yazamaz
await assert.rejects(() => handle(st, { action: 'say', code, playerId: 'c-yabanci-0003', text: 'selam' }, now + 9000));
console.log('✓ Sunucu: odada olmayan yazamaz');

console.log('LAF ATMA TESTLERİ GEÇTİ');
