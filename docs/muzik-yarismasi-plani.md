# Ortak Şarkı (müzik yarışması) — karar ve plan

**Karar:** Parti Ligi içinde 13. oyun olarak yapıldı (`public/games/sarki.js`, `public/client/sarki.js`). Oda kodu, oyuncu, tur, oy, bot, yeniden bağlanma
ve sunucu tarafı faz yönetimi zaten var; ayrı Next.js + Supabase projesi aynı şeyi sıfırdan kurardı ve yeni hesap/altyapı gerektirirdi.

## Akış (sunucu yönetir)
1. **Yazma (55 sn):** herkes bir dize yazar (2–80 karakter, küfür filtresi, tek gönderim).
2. **Birleştirme:** sunucu tüm dizeleri TEK şarkıya dizer. Her katkı şarkıda tam bir satırdır (`cid` ile eşlenir), hiçbiri düşmez.
   Araya nakarat dolgusu girer (`cid: null`). Yazmayan insan "yazmadı" diye işaretlenir; bot stok dize yazar.
3. **Oylama (70 sn):** yazarlar gizli; kendi dizene oy yok (sunucu yok sayar), dize başına tek oy, 1–5 tamsayı.
4. **Sonuç:** ortalama; eşitlikte 5 sayısı; `minVotesFor` kadar oy almayan katkı "kesinleşmedi" sayılır ve geride kalır.

## Ücretsiz mi?
- Sunucu: mevcut Netlify (ek maliyet yok). Müzik: tarayıcıda Web Audio vurucu/bas + cihazın sesli okuması (`speechSynthesis`, tr-TR). Anahtar, ücretli API yok.
- Telefonda Türkçe ses yoksa yalnızca ritim çalar (uyarı gösterilir). **Gerçek telefonda denenmedi.**

## Sonraki aşamalar (henüz yapılmadı)
- **Gerçek AI söz (isteğe bağlı):** Gemini Flash ücretsiz katmanı var ama kaynaklar limit konusunda çelişiyor (15 RPM/1.500 RPD ↔ 5 RPM/100 RPD);
  resmi sayfadan (ai.google.dev) doğrulanmadan kullanılmamalı. Ücretsiz katmanda istemler model eğitiminde kullanılabilir (AB/İngiltere hariç) → gizlilik politikasına yazılmalı.
  `resolve` senkron olduğu için çağrı ayrı bir adımda (anahtar yalnızca sunucu ortam değişkeninde) yapılmalı; hata olursa mevcut birleştirici yedek kalır.
- **Gerçek şarkı sesi:** ücretsiz+ticari lisanslı seçenek yalnızca kendi barındırdığın açık modeller (ACE-Step, lisans repoda doğrulanmalı; GPU gerekir). Suno'nun resmi ücretsiz API'si yok.
- Küfür/bildir-engelle, İngilizce.
