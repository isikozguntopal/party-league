# Parti Ligi (Party League)

Telefonda arkadaşlarla (oda koduyla) ya da botlarla oynanan, 14 mini oyunluk Türkçe parti oyunu.
Şu an PWA olarak Netlify'da yayında (`https://parti-ligi.netlify.app`). Hedef: iOS App Store'da
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
Kayık Kafilesi (takım), Pist Canavarı, Pati Koşusu (`pati`, 2D sprite hayvanlar, gerçek zamanlı; kutu/engel katıdır, çarpınca durur, ölmez), Ortak Şarkı (`sarki`), Ne Kadar Tanıyorsun? (`tanir`, takım), Pota Atışı (`basket`), Şarkıyı Tahmin Et (`melodi`, takım). Takım oyunları eksik oyuncuyu geçici "Yedek" botla tamamlar.

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

## Şu an neredeyiz (Mac'e geçerken)

Kullanıcıya "Mac'te geliştirmeye başlamadan önce yapılacaklar" listesi adım adım yaptırılıyor:

1. ✅ GitHub: kişisel hesap `isikozguntopal`, özel depolar `party-league` ve `claude-ekip` yüklendi.
   Commit kimliği: `Özgün Topal <150266122+isikozguntopal@users.noreply.github.com>` (iş e-postası kullanılmaz).
2. ⏳ Apple Developer Program: **bireysel** kayıt önerildi (iPhone'daki Apple Developer uygulamasıyla, yıllık 99 USD).
   Kullanıcı kaydı göndermeye gidiyordu; onay durumunu sor.
3. ⬜ İsim ve alan adı kontrolü (App Store, Türk Patent, partyleague / partiligi alan adları), alan adı satın alma.
4. ⬜ Gizlilik politikası ve destek sayfası.
5. ⬜ Cloudflare hesabı (WebSocket oyun sunucusu için).
6. ⬜ Mac'te: Xcode, Node.js, depoları klonlama, `npm install`, `npm test`, sonra Capacitor ve sunucu taşıma.

## iOS durumu (Mac, 2026-10-12)

- Capacitor 6 kuruldu (`capacitor.config.ts`, `ios/`), appId `com.partiligi.app`. `npx cap sync ios` web dosyalarını kopyalar
  (pod install için `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` gerekir).
- Uygulama içinde (`location.protocol === 'capacitor:'`) API ve davet bağlantısı `https://parti-ligi.netlify.app` adresine gider;
  `api.mjs`'e CORS eklendi. **CORS düzeltmesi henüz yayına alınmadı**, çevrimiçi mod bu yüzden denenmedi.
- Simülatörde (iPhone 15 Pro) açıldı, "Botlarla Oyna" çalıştı. Gerçek telefonda denenmedi.
- Xcode: 15.4'ün Simulator'ü macOS 15.4.1'de çöküyor. Xcode 16.4 `/Applications/Xcode-16.4.0.app` olarak kuruldu (xcodes ile).
  Komut satırı için `DEVELOPER_DIR=/Applications/Xcode-16.4.0.app/Contents/Developer` ya da `sudo xcode-select -s`.
  App Store yüklemesi için Xcode 26 gerekecek → önce macOS 15.6+ güncellemesi.
- Apple Developer üyeliği bilerek TestFlight aşamasına bırakıldı.

## Pati Koşusu (turnuva oyunu, 2D)

Fun Run tarzı yandan koşu yarışı; gerçek zamanlı oda/turnuva oyunu (ayrı mod ya da ana ekran kartı YOK). Oyuncular lobide "🐾 Koşu hayvanın" satırından
hayvanını seçer (`animal` eylemi → `p.animal` → `init` env → `g.animals`); seçmeyen/bot kalan hayvanlardan alır.
- `public/games/pati.js`: saf JS çekirdek (pist, fizik, 7 güçlendirme, bot yapay zekâsı). Katı engeller: çarpınca durur, ölmez. Testi `test/pati.test.mjs`.
- `public/client/pati-rt.js` (turnuva istemcisi, kumanda), `pati-view2d.js` (DÜZ 2D canvas çizimi, three.js yok), `pati-sprites.js` (hayvan çizimi).
- Kontroller: sağda altlı üstlü ZIPLA (havada tekrar = çift) / KAY (havada = çak), solda ÖZEL GÜÇ. Klavye: Boşluk/↑, ↓/Shift, E/Enter.
- Oyun başında (dikeyse) "Telefonu yan çevir" uyarısı → Tamam → ekran yatay → öğretici (`app.js` `LAND_GAMES`). Oyun bitince yatay mod kapanır.
- Pist iki katlıdır: ana yolun 2.4 / 4.8 birim üstünde tek yönlü yüzen platformlar (`track.up`; çukur/engel kestirmesi + ekstra kutular). Botlar ana yolda kalır.
- Gerideki oyuncuya kalkan çıkmaz; nitro ve ☄️ Meteor (item 8: öndeki herkesi düşürür, kalkan yutar) şansı sıraya göre artar.
- Adında başka oyunların adı geçmez.

## Takımlı turnuva (2026-10-19)

Lobide "👥 Takım düzeni": Bireysel / İkili / Üçlü (`teamSize`, `teams`, `shuffleTeams` eylemleri; oda sahibi oyuncuya dokunup takıma taşır ya da iki oyuncuyu yer değiştirir).
- `game-core.js`: `TEAM_BAN` (sapan, bomba, yarış, pati: takım arkadaşları birbirine zarar verir) takımlı turnuvadan çıkar; `teamOk(kind, teams)` halat için tam 2 takım, kayık/kör koşu için ≤2 kişilik takım ister.
- Takımlı turnuvada puan takım olarak toplanır: oyun sıralaması takımın ortalama sırasına çevrilir (`endGame`), her üye takımının puanını alır. Sonuçta `places` ve takım gruplu `ranking` vardır; `ui.js` skor/podyumu takım satırı olarak çizer.
- Takım oyunları (`pairUp` / `twoTeams`, `games/util.js`) `env.teams` verilirse oda sahibinin takımlarını kullanır; verilmezse eskisi gibi rastgele.
- Test: `test/team.test.mjs`.

## Yeni/değişen oyunlar (2026-10-19, tarayıcıda denendi, gerçek telefonda DENENMEDİ)

- **Gerçek zamanlı bağlantı kontrolü** (`client/rt.js`): oda sahibi herkesten kumanda gelene (bağlandı) ve herkes öğretici/uyarıyı kapatana (`ctx.blocking()`, `rdy`) dek geri sayımı başlatmaz; 4 sn sonra sunucu aktarımı da denenir; 16 sn içinde hiç kumanda göndermeyen bot olur.
- **Ne Kadar Tanıyorsun?**: her takım için "tahmin" + "inceleme" turu; cevaplar açık kalır, oda sahibi `gact {t:'next'}` ile geçirir, skor oyun sonunda açıklanır (`view` skor göndermez).
- **Ortak Şarkı**: `composeSong` oyunun kendi dizeleriyle tam şarkı kurar (giriş/kıta/nakarat/köprü/bitiş); `client/music.js` Web Audio ile davul+bas+akor+arpej çalar, sözler hızlı okunur ve her kelimede ezgi notası çalar.
- **Pota Atışı** (`games/basket.js`, `client/basket.js`): 30 sn, sapan gibi çek-bırak, pota 8. sn'den sonra hareket eder, ardışık sayılar ×1…×5 katlanır, temiz atış +1. Fizik saf JS; sunucu sonucu sınırlarla doğrular. Test: `test/basket.test.mjs`.
- **Şarkıyı Tahmin Et** (`games/melodi.js`, `client/melodi.js`, havuz `games/melodi-sarkilar.js`): iTunes Search API önizlemesi (CORS açık), ses önce şarkı numarasından alınır ve Web Audio ile milisaniye hassas kesilir; takım ortak tahmin hakkı, 5 aşama (0,5/1,5/5/10/20 sn), yalnızca listeden seçilir. Havuzu yenilemek: `node scripts/melodi-sarki-bul.mjs`. Şarkı numarası görünümde gider (cevap indeksi gitmez). Test: `test/melodi.test.mjs`.
- Arayüzde başka oyunların adı geçmez (kural): yeni oyunların adları özgündür.

## Bil Bakalım soruları

`public/games/sorular/*.js` (8 kategori × 100 soru; ilk şık doğru). Eski `sorular.js` silindi. Sorular yapay zekâyla yazıldı, tek tek kaynakla doğrulanmadı.

## Öğretici

`client/tutorial.js`: her oyun başında parmak emojili kısa öğretici (`TUTS`); Kör Koşu rol ekranını (`koşucu`/`yönlendirici`) kendi içinde gösterir.

## Yatay mod

Telefon çevrilince otomatik yatay OLMAZ; HUD'daki "↻ Yatay" düğmesi her oyunda ekranı 90° çevirir (`client/landscape.js`; dokunuş/rect düzeltmesi `localPt`/`fixRect`).

## Unity'ye geçiş (karar: 2026-10-12)

Ayrıntılı plan: `docs/unity-gecis-plani.md`. Özet: `unity/` klasöründe Unity 6.3 LTS (`6000.3.26f1`, iOS modülü kurulu, Unity Personal lisansı
Hub'dan etkinleştirildi) projesi var. JS sunucu ve tur tabanlı kurallar kalır; Unity yalnızca istemci (`/api`'yi UnityWebRequest ile çağırır).
Faz 0 bitti (URP, Input System, Newtonsoft.Json, iOS/Metal/dikey ayarı: `unity/Assets/Editor/ProjeAyari.cs`). Sıradaki: Faz 1 dikey dilim.
Komut satırı: `/Applications/Unity/Hub/Editor/6000.3.26f1/Unity.app/Contents/MacOS/Unity -batchmode -nographics -quit -projectPath unity -executeMethod ...`
Mevcut PWA/Capacitor (`public/`, `ios/`) silinmez; asset lisansları `unity/ASSETS.md`'ye yazılır.

## Bilinen tuzaklar

- Bu proje önce kurumsal bir Windows bilgisayarında geliştirildi. Oradaki kısıtlar (EDR'nin exe engellemesi,
  `.npmrc`'deki `ignore-scripts=true`, `esbuild` → `esbuild-wasm` override'ı) Mac'te gerekmeyebilir; `package.json`
  `overrides` kısmını Mac'te sorun çıkarırsa kaldırmayı düşün.
- Netlify Blobs güçlü tutarlılıkla (`consistency: 'strong'`) ve etag'li iyimser kilitle (`mutate`) kullanılıyor.

## Yalnızca Windows bilgisayarında: sinir ağı (codebase-memory MCP)

Windows makinesinde proje `codebase-memory-mcp` ile `lazer-kafes` adıyla indeksli ve kullanıcı bu indekse
"sinir ağı" diyor. Orada kod yapısı sorularında ("kim çağırıyor", "nerede kullanılıyor") önce `search_graph` /
`trace_path` ile `project: "lazer-kafes"` sorgulanır. Mac'te bu araç kurulu değilse bu bölümü yok say.


## Büyük güncelleme (2026-10-23, tarayıcıda/testte denendi, gerçek telefonda DENENMEDİ)

Yayın: `npx netlify deploy --prod` "Forbidden" verirse taslak (`deploy` --draft) + `netlify api restoreSiteDeploy` ile üretime alındı (içerik aynı).
Hızlı görsel doğrulama: `puppeteer-core` + yerel Chrome ile `npm run dev` üzerinde botlu oyun açılıp ekran görüntüsü alınabilir (yatay zorlanmış ekran 90° döner).
- **Pati Koşusu**: hayvan seçimi lobiden kalktı, öğretici kartının içinde (`tutorialExtra`, kumanda alanı `an`); her hayvanın pasifi var (`ANIMALS.pass`: yokuş hızı `down`, trambolin `tramp`, kuyu `pit`, sersemleme `stunMul`, yeniden doğuş `respawn`, buz bağışıklığı).
  Pist 650-760 birim, 5 harita (orman, mağara, şeker, kar, çöl), yokuşlar (`plat.y1`), kuyular (çivi yerine, `pits`), trambolin/hız pedi, üst katlar çift zıplamayla çıkılır ve altından zıplayınca KAFA ÇARPAR (`UP_THICK`), tavanın altındaki ana yol engelsiz (`zones`), gökyüzü yolları (trambolinle).
  Yeni eşyalar: yumruk kutusu (9), buz (10); testere yönü düğmeyi kaydırarak seçilir (bits 8=geri, 16=yukarı); testere/ayı kapanı değeni parçalar (`gore`, yeniden doğar). Başta herkese otomatik hızlanma, DNF = ilk bitirenden 12 sn sonra. Üstte "kim kime" satırları.
  Yatay mod: oyun bitince/skor açılınca `releaseLand()` (panel gizli kaldığı için podyum görünmüyordu).
- **Kör Koşu** (yalnızca 2D görünüm): herkes aynı yolda, TUT düğmesiyle rakibi yakala/taşı/fırlat (`grab`), çarpışma, başlangıçta 6 kapı (1'i kırılır; yönlendirici hangisini görür), dönen platformlar (`turns`), buz (`ices`), konveyör kalktı. Rol duyurusu oyun başında.
- **Kayık Kafilesi**: yuvarlak kayık; çubuk dış kenarda duracağın yeri seçer (`seat.a`), GAZ basılı tutunca karakterin tersine itilir, gaz deposu (`tank`). FPS görünüm kalktı.
- **Bombayı Çöz**: takımlar sırayla oynar (her tur bir takım, 6 sn rol duyurusu), 4+ kişilik takımda 2 kişi bombayı görür, kalanlar anlatır.
- **Keski Düellosu**: 1. turda herkes "Ezberledim" deyince başlar (en fazla 60 sn), 2. tur 15 sn, sonrası 10 sn; sonuç ekranında yapamayanlar yazılı.
- Sapan: alan daha hızlı küçülür, laf balonu avatarın üstünde, FPS düğmesi yok. Bomba Ustası: görünüm düğmesi yok. Halat: daha kısa. Çizim oyunları turnuvada ayrı. Pota: pota sağda, top solda rastgele, taraftarlı salon. Şarkı tahmin: Atla uyarısı kalktı.
- Araba yarışı: araçlar yan duruyordu (sprite +90° fazla döndürülüyordu), düzeltildi.
- **Bekleyen kararlar**: oyun adı "Parti Olimpiyatları" mı (üstteki marka riski notuyla çelişiyor) ve site adresi; Ortak Şarkı için yapay zekâ müzik API'si (anahtar/servis seçimi kullanıcıda).

- **Kayıp Saniye** (`saniye`, ⏱️): kronometre 3. sn'de gizlenir, hedefe en yakın durduran kazanır; 4 tur, toplam sapma. `games/saniye.js`, `client/saniye.js`, test `test/saniye.test.mjs`. Pota Atışı'nda taraftarlar koyu siluet yapıldı, top büyütüldü/parlatıldı. Site adresi artık `parti-ligi.netlify.app`.

- **Yeni oyunlar (2026-10-23 öğleden sonra)**: Sürü (`suru`, 🐑), Ayar (`ayar`, 🎯), Telve (`telve`, ☕); testler `test/yenioyun.test.mjs`. Telve kartları resimsiz: `games/telve-kartlar.js` fal sembollerinden 72 kart üretir, istemci CSS ile çizer.
- **Ana menü** 3 büyük seçenek (Oda Kur / Odaya Katıl / Karakterim); "Botlarla Oyna" yalnızca `?bot` ya da `?cizim` ile görünür. Lobide üstte Turnuva / Tek oyun seçici; takım paneli turnuvada ya da takımlı oyunda çıkar. Karakter ekranında Erkek/Kadın/Rastgele düğmeleri her basışta rastgele avatar üretir.
- **Pati**: güçler elden fırlatılır (düğmeyi basılı tut, yönü seç: ← ↑ ↓ →, bırak; `sim.proj`), eldeki güç hayvanın elinde görünür, buz beyaz sivri kristal, öldüğü yerde doğar (`deathX`), duvara takılınca sersemlemez.
- **Pota**: 45 sn, gerçek basket sesleri (`b-*` sfx), sayı tespiti pota hareketine göre düzeltildi. **Keski**: bekleme tik sesi yok, sonuçta "Doğru bilenler / Bilemeyenler" yazılı. **Kayık**: sert çarpma kayığı patlatır (`boom`, `EXPLODE_V`), daha yavaş/dar/engelli harita.
- **Telve kartları** artık gerçek resim: `public/telve/001.jpg…118.jpg` (The Met Open Access, CC0; kaynaklar `public/telve/kaynak.json`, `KAYNAK.txt`). `CARD_COUNT` 118. Ayar'da anlatıcı iki uç yazısını da değiştirebilir. Ana menü renkleri uygulamanın lacivert + kırmızı-pembe diline uyduruldu.
- **Oda sahibi atla**: oyun başlığında `⏭ Atla` (`skip` eylemi, puan yok). **DNF**: üçten çok takımlı Kör Koşu ve Kayık'ta iki takım bitirince oyun kapanır, bitirmeyen -1 puan (`dnfOf`, `rtResult.dnf`, `DNF_PTS`). Alttaki oyuncu/sıralama şeritleri gizli (`#panel .chips`). Çizim albümünde ressam adı ve oy vermeyenler görünür, albüm akışı kaydırılabilir. Kör Koşu'da her 10 sn'de ~1,6 sn ekran açılır.

## Yönetici paneli (2026-10-25, tarayıcıda/testte denendi, gerçek telefonda DENENMEDİ, yayına alınmadı)

- Yönetici = oda sahibi + onun ⭐ yaptığı oyuncular (`p.admin`, `isAdmin`/`requireAdmin`). Oyun ekranında HUD'daki ⚙️ düğmesi paneli açar (`app.js` `renderAdmin`).
- Eylemler (`game-core.js`): `kick` (geri giremez, `x.banned`), `admit`/`deny` (turnuva sürerken giren oyuncu `pending` olur, yalnızca izler; onaylanınca sonraki oyundan oynar), `admin` (yalnızca oda sahibi), `finish` (turu bitir: `standingNow` o anki skor/sıralamadan puan dağıtır; bilgi yoksa puan vermez), `skip` (puansız atla, artık yöneticiler de yapabilir).
- Yeni giriş isteği yöneticiye toast + ses + kırmızı "İncele" çubuğu + ⚙️ rozetiyle gelir. Test: `test/admin.test.mjs`.
- Alttaki oyuncu şeridi (`.chips`) artık hiç çizilmiyor, `.panel` boşken gizli → oyun alanı büyüdü.

## >>> KALDIĞIMIZ YER (2026-10-25) — yeni oturumda önce bunu oku, kullanıcıya "kaldığımız yerden" özetle <<<

**Yayında:** Yönetici paneli, büyütülmüş oyun alanı, CORS düzeltmesi Netlify'da (sw `lazer-kafes-v57`). Sonradan yapılan *toast'ın üste taşınması* (araba yarışında popup direksiyon düğmesini kapatıyordu, sw v58) **yayına ALINMADI**; kullanıcı isteyince yayına al.

**Kullanıcının kararları:**
- Apple Developer 99 USD'yi **şimdilik vermeyecek**. Önce uygulamayı yalnızca KENDİ iPhone'unda geliştirip deneyecek (ücretsiz Apple ID ile Xcode'dan yükleme, 7 günde bir yeniden yükleme). Üyelik, arkadaşlara dağıtmaya (TestFlight/App Store) hazır olunca; o zaman kayıt adımlarında yönlendir.
- **Cloudflare/WebSocket şimdilik gerekmiyor** (kullanıcı hesap açmak zorunda değil). Düşük gecikmenin asıl çözümü sonradan WebSocket sunucusu; çok kişilik gerçek zamanlı deneme zamanı gelince öner.
- Strateji: **doğrudan Unity dikey dilimi** (`docs/unity-gecis-plani.md` Faz 1: ana menü, oda kur/katıl, lobi, avatar, Sapan Arenası), mevcut Netlify sunucusuyla; hedef kullanıcının iPhone'una yüklemek. Sonra oyunlar tek tek taşınır.
- Kullanıcının iPhone'u **iOS 26.7.1** → Xcode 26.x gerekir → macOS 15.6+ gerekir. Mac şu an macOS 15.4.1; mevcut Xcode'lar: Xcode.app (15.4) ve Xcode-16.4.0.app (ikisi de iOS 26 cihaz için yetmez).

**Sıradaki adımlar (tek tek, "tamam" bekleyerek):**
1. ⏳ Kullanıcı macOS **Sequoia 15.8.1**'e güncelliyor (macOS 27'ye GEÇME, araç uyumu belirsiz). Yeniden başlayınca "tamam" der.
2. `sw_vers` ile sürümü doğrula, sonra Xcode **26.6** indir (`xcodes install 26.6`; `xcodes list` 26.6 (17F113) gösteriyor), `xcode-select` ve iOS 26 platformu/simülatörü kur.
3. Unity Faz 1'i başlat (`unity/`, Unity 6.3 `6000.3.26f1`): ana menü → oda kur/katıl (`/api` UnityWebRequest) → lobi → avatar → Sapan Arenası; iOS build → Xcode → kullanıcının iPhone'una yükle (iPhone'da Geliştirici Modu açılmalı, ücretsiz Apple ID ile imza).
4. Gerçek telefonda denenmeyen hiçbir şeyi "çalışıyor" diye sunma.

## Cloudflare'a taşıma (2026-10-28)

Netlify ücretsiz kotası doldu (`usage_exceeded`, site ve API 503). Sunucu Cloudflare Workers + Durable Objects'e taşındı:
`wrangler.toml`, `cloudflare/worker.mjs` (/api yönlendirme + `public/` statik servis), `cloudflare/room.mjs` (oda başına bir DO, `game-core.handle` için depo adaptörü, mutex, 6 saat boşta kalan oda alarmla silinir).
`game-core.js`: `newRoomCode()`, `create` için `newCode` ipucu. `npm run dev:cf` yerelde hesapsız çalışır (test edildi, Unity `ApiTesti` + `npm test` geçti).
**Henüz deploy edilmedi** (Cloudflare hesabı bekleniyor). Yapay zekâ müziği (`muzik`) taşınmadı → `{status:'off'}`. WebRTC yedek aktarımı (`rtSnap`) DO üzerinde çalışır ama gerçek zamanlı WebSocket aşaması ayrı.
Unity: `unity/Assets/Scripts/Net/PartiApi.cs`; test `PARTI_SUNUCU=http://localhost:8787 Unity -batchmode -nographics -projectPath unity -executeMethod ApiTesti.Calistir`. Kenney CC0 asset'leri `unity/Assets/Kenney`, kaynaklar `unity/ASSETS.md`.
**Cloudflare yayında (2026-10-28):** `https://parti-ligi.lazer-kafes.workers.dev` (deploy: `npm run deploy:cf`, wrangler girişi yapıldı). Unity `PartiApi.VarsayilanSunucu` bu adrese ayarlı; Unity `ApiTesti` canlı sunucuda geçti. Netlify kotası dolu olduğu için eski adres kapalı.

## Unity Faz 1 durumu (2026-10-28, gerçek telefonda DENENMEDİ)

- `unity/Assets/Scripts/UI/Uygulama.cs` (kodla uGUI: ana menü → oda kur/katıl → lobi → oyun yer tutucusu), `Ui.cs` yardımcılar, `Scripts/Net/PartiApi.cs`. Sahne: `Assets/Scenes/Ana.unity` (`SahneKur.Olustur` ile üretilir). Kenney düğme görselleri `Assets/Resources/UI`.
- iOS derleme: `Unity -batchmode -nographics -projectPath unity -executeMethod IosDerle.Calistir` → `unity/Builds/iOS` (Xcode projesi, başarılı). Kişisel takım: `J2UN2TD73C` (Xcode'da Apple ID kayıtlı, ücretsiz).
- iPhone'a yükleme için `xcodebuild -downloadPlatform iOS` (iOS 26.5 platformu, ~8,5 GB) gerekiyor; Xcode "iOS 26.5 is not installed" diyor. Sonra: `xcodebuild -project Unity-iPhone.xcodeproj -scheme Unity-iPhone -destination 'id=00008120-000A14363A13C01E' DEVELOPMENT_TEAM=J2UN2TD73C -allowProvisioningUpdates build` ve `xcrun devicectl device install app`.
- Arayüzü ekran görüntüsüyle doğrulamadık; ilk görsel kontrol iPhone'da olacak.
