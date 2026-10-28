// Oyun başı kısa öğretici: parmak emojisiyle hareketler (yukarı/aşağı/sağa/sola, dokun, sürükle) canlı gösterilir.
// Her oyun başlarken (oda içinde oyun başına bir kez) açılır; "Anladım"a basınca ya da birkaç saniye sonra kapanır.
import { sfx } from './util.js';

// anim: cross (4 yön) | drag | tap | hold | up | down | left | right | swipe
const ROW = (r) => `<div class="tt-row"><span class="tt-ic tt-${r.anim || 'none'}">${r.ic || '👆'}</span><p>${r.text}</p></div>`;

export const TUTS = {
  lazer: { title: '🪨 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'drag', text: '<b>Karakterini sürükle</b><br>Parmağınla tutup istediğin yere taşı.' },
    { ic: '👆', anim: 'tap', text: '<b>Boş bir yere dokun</b><br>Sapan o yöne bakar. Parmağın ne kadar uzaksa taş o kadar uzağa gider.' },
    { ic: '🎯', anim: 'none', text: '<b>Noktalı kavis</b> taşın düşeceği yeri gösterir. Hazır olunca <b>Hazırım</b>\'a bas.' }] },
  bomba: { title: '💣 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'cross', text: '<b>Sol alttaki yuvarlağı sürükle</b><br>Parmağını yukarı, aşağı, sağa, sola kaydır: karakter o yöne yürür.' },
    { ic: '💣', anim: 'tap', text: '<b>Sağdaki 💣 düğmesine dokun</b><br>Bomba bırakır. Hemen uzaklaş! Bomba önce 1 kare her yöne patlar.' },
    { ic: '📦', anim: 'none', text: '<b>Kutuları patlat</b>: 🔥 menzil, 💣 bomba sayısı, 👟 hız güçlendirmesi çıkar. Son kalan kazanır.' }] },
  yaris: { title: '🏎️ Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'hold', text: '<b>◀ ▶ düğmelerine basılı tut</b><br>Sol alttaki iki düğme direksiyondur: sola ya da sağa döner.' },
    { ic: '🟢', anim: 'tap', text: '<b>Sağ altta GAZ (yeşil) ve FREN (kırmızı)</b><br>Düzlükte gaza bas, virajdan önce fren yap.' },
    { ic: '❓', anim: 'none', text: '<b>❓ kutulardan eşya al</b>, <b>KULLAN</b> düğmesiyle at: nitro, lazer, hortum, muz…' },
    { ic: '↻', anim: 'none', text: '<b>Yatay</b> düğmesi ekranı yan çevirir (telefonu da yan tut).' }] },
  pati: { title: '🐾 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'up', text: '<b>Sağdaki ZIPLA</b> (üstteki düğme): engel ve kuyuların üstünden atla; havada tekrar dokun: çift zıplama. <b>Altındaki KAY</b>: asılı kirişin altından kay, havadayken basarsan yere çakılırsın.' },
    { ic: '⚡', anim: 'tap', text: '<b>❓ kutuya çarp, soldaki ÖZEL GÜÇ\'ten kullan.</b> Güç düğmesine <b>basılı tut, parmağını sola / yukarı / aşağı / sağa kaydırıp bırak</b>: güç elinden o yöne fırlar (nitro ve kalkan kendine). Gerideysen nitro ve ☄️ meteor çıkar.' },
    { ic: '🟢', anim: 'tap', text: '<b>Yol bilgisi:</b> yokuş aşağı hızlanırsın (hayvanına göre), trambolin zıplatır, yeşil ped hızlandırır, kuyuya düşersen zıplayıp çıkarsın. Üst yollara çift zıplamayla çıkılır; altından zıplarsan başın tavana çarpar.' }] },
  kayik: { title: '🛶 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'cross', text: '<b>Sol alttaki yuvarlağı sürükle</b><br>Yuvarlak kayığın <b>dış kenarında</b> nerede duracağını seçersin: karakterin o yöne doğru kenarda döner.' },
    { ic: '💨', anim: 'tap', text: '<b>GAZ düğmesine basılı tut</b><br>Karakterin bulunduğu yerden gaz salar, kayık <b>tersine</b> itilir (arkadan gazlarsan ileri gidersin). Gaz deposu basılı tutunca boşalır, bırakınca dolar.' },
    { ic: '🤝', anim: 'none', text: '<b>Takım arkadaşınla uyumlu ol:</b> aynı tarafta durup birlikte basarsanız roket gibi gidersiniz; zıt taraflardaysanız birbirinizi durdurursunuz. <b>Kıyıya, kayaya ya da kütüğe sert çarparsanız kayık PATLAR</b> ve son kontrol noktasında yeniden doğarsınız: yavaş ve dikkatli gidin!' }] },
  halat: { title: '🪢 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'tap', text: '<b>ÇEK düğmesine hızlı hızlı dokun</b><br>Ne kadar hızlı basarsan takımın o kadar güçlü çeker. Rakibi çamura düşür!' }] },
  keski: { title: '🗿 Nasıl oynanır?', rows: [
    { ic: '👀', anim: 'none', text: '<b>Önce şekli ezberle</b><br>Eksik parçalı taş küp birkaç saniye görünür.' },
    { ic: '👆', anim: 'swipe', text: '<b>Küpü parmağınla döndür</b>, kırılması gereken parçaya <b>dokun</b>: parça kırılır.' },
    { ic: '✅', anim: 'none', text: 'Aynı parçaları kır ve <b>Gönder</b>\'e bas. Yanlış yapan elenir.' }] },
  bilgi: { title: '🧠 Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'tap', text: '<b>Kategoriye dokun</b> ve oy ver; sonra soruda doğru şıkka dokun.' },
    { ic: '✂️', anim: 'none', text: '<b>Jokerler:</b> ✂️ iki yanlışı siler, ✌️ iki şık işaretlemene izin verir (birer kez).' },
    { ic: '⚡', anim: 'none', text: 'Ne kadar <b>hızlı</b> cevaplarsan o kadar çok puan alırsın.' }] },
  cizim: { title: '🖍️ Nasıl oynanır?', rows: [
    { ic: '✍️', anim: 'none', text: '<b>Önce bir cümle yaz</b>. Sonra sana gelen cümleyi çizersin.' },
    { ic: '👆', anim: 'swipe', text: '<b>Parmağınla çiz</b>: renk ve kalınlığı alttan seç. Sonraki oyuncu çizimine bakıp tahmin eder.' }] },
  neciz: { title: '🖍️ Nasıl oynanır?', rows: [
    { ic: '👆', anim: 'swipe', text: '<b>Sıra sendeyse:</b> 3 kelimeden birini seç ve parmağınla çiz.' },
    { ic: '⌨️', anim: 'none', text: '<b>Başkası çiziyorsa:</b> alttaki kutuya tahminini yaz. Önce bilen çok puan alır.' }] },
  bombaci: { title: '💣 Nasıl oynanır?', rows: [
    { ic: '🗣️', anim: 'none', text: '<b>Biri bombayı görür, diğeri anlatır.</b> Takımınla konuşarak doğru kabloya/tuşa basın.' },
    { ic: '👆', anim: 'tap', text: 'Hata yapınca ekranda <b>❌</b> çıkar. Süre dolmadan bombayı çöz!' }] },
  sarki: { title: '🎤 Nasıl oynanır?', rows: [
    { ic: '✍️', anim: 'none', text: '<b>Bir dize yaz</b>: hepsi tek ortak şarkıda birleşir.' },
    { ic: '⭐', anim: 'tap', text: '<b>Dizelere 1–5 yıldız ver.</b> Kendi dizene oy veremezsin.' }] },
  tanir: { title: '🧩 Nasıl oynanır?', rows: [
    { ic: '✍️', anim: 'none', text: '<b>Önce kendin hakkında soruları cevapla</b>. Takım arkadaşların seni ne kadar tanıyor?' },
    { ic: '👆', anim: 'tap', text: '<b>Sıra takımına gelince</b> arkadaşın hakkında tahmin et. Doğru bilince puan kazanırsın.' }] },
};

TUTS.basket = { title: '🏀 Nasıl oynanır?', rows: [
  { ic: '👆', anim: 'down', text: '<b>Ekranda parmağını aşağı-sola sürükle</b><br>Top, çektiğinin tersine fırlar. Ne kadar çok çekersen o kadar güçlü; noktalı yol topun gideceği yeri gösterir.' },
  { ic: '🎯', anim: 'tap', text: '<b>Bırak: top pota yönüne gider.</b> 45 saniyede en çok sayıyı yapan kazanır. Pota süre ilerledikçe hareket eder!' },
  { ic: '🔥', anim: 'none', text: '<b>Arka arkaya sayı yap:</b> puanlar katlanır (×2, ×3 … ×5). Kaçırırsan kombo biter. Kenara değmeden giren "temiz" atış +1 puan.' }] };

TUTS.melodi = { title: '🎧 Nasıl oynanır?', rows: [
  { ic: '👆', anim: 'tap', text: '<b>Dinle\'ye dokun:</b> şarkının önce yalnızca 0,5 saniyesi çalar. Bilemezsen sonraki aşamada ses uzar (1,5 → 5 → 10 → 20 sn).' },
  { ic: '✍️', anim: 'none', text: '<b>Şarkı ya da sanatçı adını yaz</b>, çıkan listeden seç ve <b>Tahmin et</b>. Yalnızca listeden seçebilirsin.' },
  { ic: '👥', anim: 'none', text: '<b>Takımınla ortak oynarsınız:</b> bir yanlış tahmin ya da Atla, takımı sonraki aşamaya geçirir. Ne kadar erken bilirseniz o kadar çok puan!' }] };

const shown = new Set();
// host: tutarın ekleneceği öğe. key: oda içinde bir kez gösterim anahtarı (ör. `${kod}:${seq}`). def: { title, rows }
export function showTutorial(host, key, def, opt = {}) {
  if (!def || shown.has(key)) return null;
  shown.add(key);
  const el = document.createElement('div');
  el.className = 'tut';
  el.innerHTML = `<div class="tt-card"><h3>${def.title}</h3>${def.rows.map(ROW).join('')}<button class="tt-ok">${opt.ok || 'Anladım'}</button><small class="tt-auto"></small></div>`;
  if (opt.extra) opt.extra(el.querySelector('.tt-card'));
  let left = opt.auto || 12, timer = null;
  const close = () => { clearInterval(timer); el.remove(); if (opt.onClose) opt.onClose(); };
  el.querySelector('.tt-ok').onclick = () => { sfx('pop'); close(); };
  const lab = el.querySelector('.tt-auto');
  const tick = () => { lab.textContent = `${left} sn sonra kapanır`; if (left-- <= 0) close(); };
  timer = setInterval(tick, 1000); tick();
  host.appendChild(el);
  return { close, el };
}
export const hasShown = (key) => shown.has(key);

TUTS.saniye = { title: '⏱️ Nasıl oynanır?', rows: [
  { ic: '👀', anim: 'none', text: '<b>Kronometre çalışır ama 3. saniyede kaybolur.</b> Hedef süre ekranın üstünde yazar.' },
  { ic: '👆', anim: 'tap', text: '<b>İçinden say, hedefe gelince DURDUR\'a dokun.</b> Hedefe en yakın durduran turu kazanır.' },
  { ic: '🏆', anim: 'none', text: '4 tur oynanır; toplam sapması en az olan birinci olur.' }] };

TUTS.suru = { title: '🐑 Nasıl oynanır?', rows: [
  { ic: '👆', anim: 'tap', text: '<b>Soruya bir şık seç</b>: herkes gizlice seçer.' },
  { ic: '🐑', anim: 'none', text: '<b>Kalabalıkla aynı şıkkı seçersen puan alırsın</b> (seni seçen başka kaç kişi varsa o kadar, en kalabalık grupsa +3).' },
  { ic: '🖤', anim: 'none', text: '<b>Tek başına kalan kara koyun olur</b> ve 0 puan alır.' }] };
TUTS.ayar = { title: '🎯 Nasıl oynanır?', rows: [
  { ic: '👁️', anim: 'none', text: '<b>Anlatıcıysan</b> kadrandaki gizli noktayı yalnız sen görürsün: tek bir ipucu yaz.' },
  { ic: '👆', anim: 'swipe', text: '<b>Anlatıcı değilsen</b> ipucuna göre çubuğu çevir ve kilitle.' },
  { ic: '🎯', anim: 'none', text: 'Hedefe ne kadar yakınsan o kadar puan alırsın. Anlatıcı da arkadaşlarının ortalamasını alır.' }] };
TUTS.telve = { title: '☕ Nasıl oynanır?', rows: [
  { ic: '🔮', anim: 'none', text: '<b>Falcı</b> elindeki bir kartı gizler ve ona tek satırlık bir yorum yazar.' },
  { ic: '🃏', anim: 'tap', text: '<b>Herkes</b> yoruma en çok uyan kartını gizlice atar; kartlar karışık açılır.' },
  { ic: '🗳️', anim: 'tap', text: '<b>Falcı\'nın kartını bul!</b> Herkes bilirse ya da hiç kimse bilmezse Falcı kısmet alamaz. Kartına oy gelirse puan kazanırsın.' }] };
