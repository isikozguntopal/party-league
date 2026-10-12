# Parti Ligi (Party League) — mini oyun partisi

Telefonda (Safari → Ana Ekrana Ekle) oynanan, oda koduyla arkadaşlarla ya da botlarla oynanan parti oyunu.

| Oyun | Tür | Nasıl |
|---|---|---|
| 🔴 **Lazer Kafes** | tur tabanlı | Gizlice yerleş, nişan al. Sırayla ateş edilir; mermi vurduğunu iter (bilardo zinciri). Platformdan düşen elenir, alan her tur küçülür. 2D / FPS. |
| 💣 **Bomba Ustası** | gerçek zamanlı | Bomberman: sol joystick yürür, 💣 bomba bırakır. Kutulardan 🔥 💣 👟 çıkar. 70 sn sonra duvarlar kapanır. 2D / 3D takip / FPS. |
| 🎨 **Kulaktan Kulağa** | tur tabanlı | Gartic Phone: yaz → çiz → tahmin et… Albümde çizimler hızlandırılmış (2–3x) tekrar edilir; çizmeyenler ➕/➖ oy verir, oylar puan olur. |
| 🖍️ **Ne Çizdim?** | tur tabanlı | Gartic.io: sırayla biri 3 kelimeden birini seçip canlı çizer, diğerleri tahmin yazar. İlk bilen 10, sonra 9, 8… (en az 3); çizen ilk doğru tahminde 10, sonraki her birinde +1, herkes bilirse +5. Harf ipuçları süre ilerledikçe açılır; ~680 kelime, aynı odada kelime tekrar etmez. |
| 🧠 **Bil Bakalım** | tur tabanlı | 6 kategoriden oylamayla seçilir (oy verenin yüzü görünür) → 4 soru → o an sonuncu olan yeni konuyu seçer → 4 soru. Herkesin baştan 2 jokeri var: ✂️ Yarı Yarıya (iki yanlış şıkkı siler) ve ✌️ Çift Cevap (iki şık işaretlenir, biri doğruysa doğru sayılır, puan %60); her biri bir kez kullanılır. |
| 🗿 **Keski Düellosu** | tur tabanlı | Machine Party'deki Chisel Gauntlet: 3×3×3 taş küpün eksik hali ~9–12 sn gösterilir, ezberden aynısını yont. Yanlış yapan elenir. |
| 🧨 **Bombayı Çöz** | takım, tur tabanlı | Keep Talking and Nobody Explodes benzeri: biri bombayı, biri kılavuzu görür. Tek sayıda oyuncuda bir anlatıcı + iki dinleyici. |
| 🏃 **Kör Koşu** | takım, gerçek zamanlı | Koşucu sisin içinde yalnızca önünü görür; rehber haritaya dokunarak yol gösterir. En hızlı takım kazanır. |
| 🪢 **Halat Çekme** | takım, gerçek zamanlı | İki eşit takım; ÇEK butonuna hızlı bas. |
| 🛶 **Kayık Kafilesi** | takım, gerçek zamanlı | İkili takım, tek kayık (Fart Together esintili): biri SOL, biri SAĞ kürekte. İT basılı = ritimli kürek; yalnız sol çekerse sağa, yalnız sağ çekerse sola dönülür, birlikte = düz ve hızlı (aynı ritim ekstra hız). Çubuk aşağı = geri kürek, yana = hafif dümen. 💨 gaz: 0,3 sn içinde ikiniz basarsanız düz roket, tek başına fırıl döndürür. Tohumdan üretilen nehir: virajlar, dar boğazlar, kayalar, kayan kütükler, girdaplar, akıntılar; şelaleye ilk varan kazanır. 2D / 3D takip / FPS. |
| 🏎️ **Pist Canavarı** | gerçek zamanlı | Solda direksiyon, sağda GAZ/FREN. 3 tur. 2D / 3D takip / FPS (kokpit). |
| 🏆 **Turnuva** | — | Lobide seçilen oyunlar sırayla. 1. → 3, 2. → 2, 3. → 1 puan. Aralarda skor grafiği, sonunda podyum. |

**Gerçek zamanlı oyunlar:** Netlify WebSocket desteklemediği için telefonlar WebRTC ile doğrudan bağlanır
(bağlantı kurulumu mevcut `/api` üzerinden). Oyunu oda sahibinin telefonu yönetir (30 Hz simülasyon, 15 Hz
görüntü), diğerleri kumanda gönderir. Bazı mobil operatör ağlarında doğrudan bağlantı kurulamayabilir;
o oyuncunun yerine bot oynar. Oda sahibi kaybolursa sunucu oyunu son bilinen sıralamayla bitirir.

**Takım oyunları** (🧨 🏃 🪢 🛶) oyuncuları eşit takımlara böler; sayı tutmazsa oyun süresince "Yedek" botlar eklenir (puan almazlar). Başlamadan önce **takımlar ekranı** açılır (kim hangi takımda, takım renkleriyle); herkes **Tamam** deyince oyun başlar. Tamam demeyen biri en fazla 40 sn beklenir; botlar ve telefonu kilitli oyuncular beklenmez. Oyun sırasında üst çubukta kendi takımın ve takım arkadaşların görünür.

Lobide oda sahibi turnuvayı ya da tek bir oyunu seçer. Oyun bitince herkes **Tekrar oyna** diyebilir.
**👕 Karakterim** ekranında (ana ekrandaki avatara dokununca da açılır) cinsiyet, ten, göz, sakal, saç, kıyafet ve her parçanın rengi ayrı ayrı,
şapka/gözlük/aksesuar seçilir (3D önizleme; döndürme açılıp kapanır, emote butonları). Avatarlar her yerde canlı: ara sıra göz kırpar,
el sallar, kafa kaşır, şaşırır, sevinir, zıplar (portrelerde ifade kareleri, 3D'de emote animasyonları).
💬 butonuyla hazır laf/emoji gönderilir.

## Yapı

```
public/
  index.html, style.css, ui.css, app.js   Uygulama kabuğu (ekranlar, ağ, panel, mesajlar)
  game-core.js                      Oda + turnuva akışı (sunucu ve tarayıcı ortak)
  games/                            Oyun kuralları (sunucu ve tarayıcı ortak)
    lazer.js  bomba.js  yaris.js  cizim.js  neciz.js  kelimeler.js  bilgi.js  keski.js  bombaci.js  korkosu.js  halat.js  kayik.js  avatar.js  util.js
  client/                           Çizim ve kontroller
    lazer.js (2D + 3D FPS)  bomba.js  yaris.js  cizim.js  neciz.js  bilgi.js  keski.js (3D)  bombaci.js  kor.js  halat.js  kayik.js
    rt.js (gerçek zamanlı çerçeve)  ui.js (skor/podyum)  custom.js  avatar2d.js  avatar3d.js
  vendor/three.min.js               three.js (yalnızca FPS ve karakter ekranında yüklenir)
netlify/functions/api.mjs           Tek API ucu: /api (oda verisi Netlify Blobs'ta)
dev-server.mjs                      Netlify'sız yerel test sunucusu
test/run.mjs + test/*.test.mjs      Kural testleri (npm test hepsini çalıştırır)
```

Netlify WebSocket desteklemediği için istemciler saniyede bir `/api`'ye soruyor; oyunlar bu yüzden
"herkes gizlice seçer → aynı anda oynanır" turlarıyla tasarlandı. Eşzamanlı hamleler Blobs'un koşullu
yazmasıyla (etag) güvenle birleşiyor. Botlar ve telefonu kilitli (12 sn sinyal yok) oyuncular beklenmez.

## Komutlar

```bash
npm install            # bağımlılıklar (kurulum betikleri .npmrc ile kapalı)
npm run dev            # http://localhost:8888
npm test               # kural testleri
npx netlify deploy --prod   # yayınla
npm run build:three    # three.js sürümü değişirse vendor dosyasını yeniden üret
```

Yerelde `http://localhost:8888/?cizim` adresi test modudur: sayfa görünmezken de çizer ve tuval
görüntülerini geçici klasöre kaydedebilir (yalnızca yerel test sunucusunda çalışır).

## Şirket bilgisayarı notu

Güvenlik yazılımı kullanıcı klasöründeki exe'leri (ör. `esbuild.exe`) engelliyor. Bu yüzden `.npmrc` kurulum
betiklerini kapatıyor, `package.json`'daki `overrides` esbuild'i exe gerektirmeyen `esbuild-wasm` ile değiştiriyor.
Global `npm install -g netlify-cli` bu makinede çalışmaz; her zaman projedeki `npx netlify` komutunu kullan.
