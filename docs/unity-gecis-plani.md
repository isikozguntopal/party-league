# Unity'ye geçiş planı (Parti Ligi)

Karar tarihi: 2026-10-12. Kullanıcı tüm projeyi Unity'ye çevirmek ve ücretsiz, en çok kullanılan asset'leri kullanmak istiyor.

## Kararlar
- **Unity sürümü:** Unity 6.3 LTS (`6000.3.26f1`, Apple silicon) + iOS Build Support. Kurulu eski 2022.3.21f1 kullanılmayacak.
- **Mimari:** JS sunucu (Netlify Functions + Blobs) **kalır**. Oda, tur akışı ve tur tabanlı oyunların kuralları (`public/games/*.js`, `public/game-core.js`)
  sunucuda aynen durur. Unity yalnızca istemci olur: görüntü, giriş, ses, animasyon. Unity istemci `/api`'yi `UnityWebRequest` ile çağırır
  (aynı JSON protokolü: `create`, `join`, `state`, `act`, `gact`, `say`…).
- Mevcut PWA ve testler çalışmaya devam eder. `public/` silinmez.
- **Gerçek zamanlı 5 oyun** (bomba, yarış, kör koşu, halat, kayık): simülasyon bugün oda sahibinin telefonunda JS ile çalışıyor.
  Unity'de C#'a taşınacak; aktarım için Cloudflare Workers + Durable Objects WebSocket sunucusu (yol haritasındaki plan). Bu faz ayrı.

## Fazlar
0. **Kurulum:** Unity 6.3 + iOS modülü, `unity/` klasöründe proje (URP mobil), `.gitignore` (Library, Temp, Logs, Builds).
1. **Dikey dilim (önce bunu bitir, gerçek iPhone'da dene):** ana menü, oda kur/katıl, lobi, avatar, Sapan Arenası (tur tabanlı).
   Amaç: mimarinin ve asset hattının çalıştığını kanıtlamak. Bu fazdan sonra devam etmek için kullanıcı onayı.
2. **Diğer tur tabanlı oyunlar:** Kulaktan Kulağa, Ne Çizdim?, Bil Bakalım, Keski Düellosu, Bombayı Çöz.
3. **WebSocket sunucu + gerçek zamanlı oyunlar** (C# simülasyon).
4. **Cila:** ses, müzik, haptik, açılış ekranı, geçişler, Game Center, bildir/engelle + küfür filtresi (sunucuda `games/filtre.js` var).
5. **TestFlight → App Store** (Apple Developer üyeliği bu aşamada açılacak; Xcode 26 için macOS 15.6+ gerekecek).

## Asset politikası (ücretsiz, yaygın)
Her asset'in lisansı projeye eklenmeden önce kontrol edilir ve `unity/ASSETS.md`'ye (kaynak, lisans, URL) yazılır.
Aday kaynaklar:
- **Kenney** (kenney.nl): CC0, ticari kullanım ve atıfsız serbest. 3D karakter/prop, UI, ses paketleri. (Ses paketlerinin lisansı pakette ayrıca doğrulanacak.)
- **Quaternius**: CC0 low-poly 3D paketleri (lisans sayfasından doğrulanacak).
- Unity paketleri: Input System, Cinemachine, TextMeshPro, Universal RP (hepsi Unity'nin kendi paket yöneticisinde ücretsiz).
- Tween/animasyon için ücretsiz bir kütüphane (lisansı doğrulanarak seçilecek).
- Ses: CC0 kaynaklar (Kenney, OpenGameArt/Freesound'da yalnızca CC0 olanlar).
Yasak: lisansı belirsiz, "yalnızca kişisel kullanım" ya da atıf gerektirip arayüzde yer bulamayacağımız asset'ler.

## Riskler
- 11 oyunun istemci kodu (~6.600 satır canvas/three.js) C#/Unity'de baştan yazılır; en büyük iş bu.
- Gerçek zamanlı oyunlarda ağ gecikmesi/senkron ayarı gerçek cihaz testi ister.
- Unity editörü GUI'si olmadan (komut satırı/batchmode) sahne kurmak sınırlı; kullanıcının editörde bazı adımları (lisans girişi, önizleme) yapması gerekebilir.
- Gerçek telefonda denenmemiş hiçbir şey "çalışıyor" diye sunulmaz.
