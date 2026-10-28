// Telve kartları: public/telve/001.jpg … resimleri (The Met Open Access, kamu malı/CC0 resimler; kaynaklar public/telve/kaynak.json).
// Resimleri yenilemek için: node scripts/telve-resim-bul.mjs ve ardından CARD_COUNT'ı bulunan resim sayısına eşitle.
export const CARD_COUNT = 118;
export const cardSrc = (i) => `telve/${String(i + 1).padStart(3, '0')}.jpg`;
