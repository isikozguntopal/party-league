// Sohbet filtresi: oyuncuların yazdığı laf atma mesajlarını temizler ve uygunsuz içeriği reddeder.
// Hem sunucuda (game-core) hem çevrimdışı modda çalışır. Liste kasıtlı olarak kısa tutuldu; ileride genişletilebilir.
export const CHAT_MAX = 60;

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

// Türkçe harfleri sadeleştir, küçült
const fold = (s) => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => FOLD[c]).normalize('NFD').replace(/[̀-ͯ]/g, '');

// Kelime olarak tam eşleşmesi gerekenler (kısa olduğu için "sıkıldım", "samimi" gibi masum kelimeleri yakalamasın)
const EXACT = new Set(['sik', 'sikik', 'amk', 'aq', 'mk', 'amq', 'got', 'pic', 'oc', 'orospu', 'ibne', 'pust', 'gavat', 'yarak', 'yarrak', 'amcik', 'sikim', 'siktir']);
// Kelimenin başı bunlarla başlıyorsa uygunsuz ("ananım", "puset" gibi masum kelimeler bilerek listede yok)
const PREFIX = ['siktir', 'sikeyim', 'sikerim', 'sikis', 'sikik', 'orospu', 'pezevenk', 'yarrak', 'yarak', 'amcik', 'amina', 'aminakoy', 'gotveren', 'gotunu', 'ibne', 'kahpe', 'gavat', 'serefsiz', 'pickurusu'];
// Harfleri boşluk/nokta ile ayırarak kaçırmayı engellemek için, tüm harfler birleştirilince aranacak uzun kökler
const LONG = ['orospu', 'yarrak', 'siktir', 'pezevenk', 'amina koy', 'aminakoy', 'anani sik', 'amcik', 'gotveren'];

export class ChatError extends Error {}

// Temizlenmiş metni döndürür; geçersizse ChatError fırlatır
export function cleanChat(raw) {
  if (typeof raw !== 'string') throw new ChatError('Mesaj yazılmadı');
  const text = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  if (!text) throw new ChatError('Mesaj boş');
  if (/https?:|www\.|\.(com|net|org|io|tr|me|gg)\b|@\w/i.test(text)) throw new ChatError('Bağlantı ve adres gönderilemez');
  if (isBad(text)) throw new ChatError('Bu mesaj gönderilemez 🙂');
  return text;
}

export function isBad(text) {
  const f = fold(text);
  // rakam/sembolle yazılmış harfler (s1k, @mk) açılmış hali de kontrol edilir
  for (const variant of [f, f.replace(/[0134578@$!]/g, (c) => LEET[c] || c)]) {
    const words = variant.split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of words) {
      const wd = w.replace(/(.)\1{2,}/g, '$1$1'); // "siiiktir" → "siiktir"
      const wc = w.replace(/(.)\1+/g, '$1');       // çift harfleri tek say
      for (const x of [w, wd, wc]) {
        if (EXACT.has(x)) return true;
        if (PREFIX.some((p) => x.startsWith(fold(p).replace(/[^a-z]/g, '')))) return true;
      }
    }
    const letters = variant.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
    if (LONG.some((p) => letters.includes(p.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1')))) return true;
  }
  return false;
}
