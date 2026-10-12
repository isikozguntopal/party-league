# Parti Ligi (Party League)

Telefonda arkadaşlarla (oda koduyla) ya da botlarla oynanan, 11 mini oyunluk Türkçe parti oyunu.
Şu an PWA olarak Netlify'da yayında (`https://lazer-kafes.netlify.app`). Hedef: iOS App Store'da
gerçek bir uygulama olarak yayınlamak. Proje klasörü/depo adı tarihsel olarak `lazer-kafes`.

Önceki tüm konuşmalar (kararlar, kullanıcının istekleri, neden böyle yapıldığı):
`docs/sohbet-gecmisi/oyun-gelistirme-sohbetleri.md`. Büyük bir değişiklikten önce ilgili kısmı oku.

## Kullanıcıyla çalışma

- Kullanıcıyla **Türkçe** konuş; oyundaki tüm metinler Türkçe.
- Kullanıcı yeni süreçlerde (App Store, GitHub, Apple hesabı) **adım adım yönlendirilmek** istiyor:
  her seferinde tek adım ver, "tamam" deyince sonrakine geç.
- Yayına alma (`npx netlify deploy --prod`) yalnızca kullanıcı isteyince.
- Uzun işleri kendi terminalinden izlemeyi seviyor; arka planda bir şey başlatırsan söyle.
- Gerçek telefonda denenmemiş şeyleri "denendi" diye sunma; neyin tarayıcıda/testte doğrulandığını ayrı söyle.

## Yapı

```
public/                 Statik site (PWA) — her şey buradan servis edilir
  index.html, style.css, ui.css, app.js   Uygulama kabuğu: ekranlar, lobi, panel, yoklama
  game-core.js          Oda + turnuva akışı. Hem sunucuda (Netlify Function) hem tarayıcıda (çevrimdışı bot modu) çalışır
  games/*.js            Oyun kuralları (sunucu + istemci ortak, saf JS)
  client/*.js           Çizim/kumanda (canvas 2D + three.js 3D). rt.js = gerçek zamanlı oyun çerçevesi
  vendor/three.min.js   three.js r186 (esbuild ile paketlenmiş)
netlify/functions/api.mjs   Tek API ucu /api → game-core.handle(store, body, now); oda verisi Netlify Blobs
dev-server.mjs          Netlify'sız yerel sunucu (bellekte depo): npm run dev → http://localhost:8888
test/*.test.mjs         Kural testleri; npm test hepsini çalıştırır (test/run.mjs)
docs/sohbet-gecmisi/    Önceki Claude oturumlarının temizlenmiş dökümü
```

**Oyunlar** (`game-core.js` → `GAMES`, `TOUR`): Sapan Arenası (iç ad `lazer`), Bomba Ustası, Kulaktan Kulağa,
Ne Çizdim?, Bil Bakalım, Keski Düellosu, Bombayı Çöz (takım), Kör Koşu (takım), Halat Çekme (takım),
Kayık Kafilesi (takım), Pist Canavarı. Takım oyunları eksik oyuncuyu geçici "Yedek" botla tamamlar.

**İki oyun türü:**
- *Tur tabanlı:* herkes gizlice hamle gönderir (`act`) → herkes hazır ya da süre dolunca sunucu çözer →
  istemciler açılışı oynatır. Anlık işlemler `gact`. İstemciler saniyede bir `state` ile yoklar.
- *Gerçek zamanlı* (bomba, yarış, kör koşu, halat, kayık): oda sahibinin telefonu simülasyonu 30 Hz çalıştırır,
  15 Hz anlık görüntüyü WebRTC ile yayınlar; bağlantı kurulamazsa sunucu üzerinden yedek aktarım (`rtSnap`/`rtInput`).

Avatarlar: `games/avatar.js` (seçenekler + doğrulama), `client/avatar2d.js` (portre + canlı ifadeler),
`client/avatar3d.js` (blok karakter + emote'lar). Çizim araçları: `client/paint.js`.

## Komutlar

```bash
npm install
npm run dev                 # http://localhost:8888  (?cizim = test modu)
npm test                    # tüm kural testleri
npx netlify deploy --prod   # yayın (yalnızca kullanıcı isteyince)
```

Her değişiklikten sonra `npm test` yeşil kalmalı. `public/sw.js` içindeki `CACHE` sürümünü dosya değiştikçe artır
(yoksa telefonlar eski sürümü önbellekten gösterir).

## Kararlar ve yol haritası (App Store)

- İsim **Parti Ligi / Party League**; "Olimpiyat" ve halkalar marka riski yüzünden kaldırıldı. Başka oyunların
  adları (Gartic, Machine Party, Keep Talking…) arayüzde geçmemeli.
- İkon: `public/icons/icon-1024.png` (App Store boyutu), kupa + konfeti.
- Plan: (1) GitHub özel depo, Mac'e taşıma → (2) Apple Developer Program → (3) sunucuyu WebSocket'e taşıma
  (önerilen: Cloudflare Workers + Durable Objects, oda başına bir DO; gerçek zamanlı simülasyonlar sunucuda) →
  (4) Capacitor ile iOS paketleme (dosyalar uygulama içinde, titreşim/paylaşım/universal link) →
  (5) sanat/ses, tanıtım, İngilizce → (6) gizlilik politikası, kullanıcı içeriği için bildir/engelle + küfür filtresi →
  (7) TestFlight → (8) App Store incelemesi.

## Bilinen tuzaklar

- Bu proje önce kurumsal bir Windows bilgisayarında geliştirildi. Oradaki kısıtlar (EDR'nin exe engellemesi,
  `.npmrc`'deki `ignore-scripts=true`, `esbuild` → `esbuild-wasm` override'ı) Mac'te gerekmeyebilir; `package.json`
  `overrides` kısmını Mac'te sorun çıkarırsa kaldırmayı düşün.
- Netlify Blobs güçlü tutarlılıkla (`consistency: 'strong'`) ve etag'li iyimser kilitle (`mutate`) kullanılıyor.

## Yalnızca Windows bilgisayarında: sinir ağı (codebase-memory MCP)

Windows makinesinde proje `codebase-memory-mcp` ile `lazer-kafes` adıyla indeksli ve kullanıcı bu indekse
"sinir ağı" diyor. Orada kod yapısı sorularında ("kim çağırıyor", "nerede kullanılıyor") önce `search_graph` /
`trace_path` ile `project: "lazer-kafes"` sorgulanır. Mac'te bu araç kurulu değilse bu bölümü yok say.
