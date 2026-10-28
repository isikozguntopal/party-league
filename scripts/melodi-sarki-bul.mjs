// 🎧 Şarkıyı Tahmin Et şarkı havuzunu (public/games/melodi-sarkilar.js) iTunes Search API ile yeniden üretir.
// Kullanım: node scripts/melodi-sarki-bul.mjs   (≈ 10 dk sürer: iTunes dakikada ~20 isteğe izin verir, araya bekleme konur)
// Aday listesini aşağıdan düzenle; iTunes'ta (TR mağazası) önizlemesi olan ve sanatçı + ad eşleşen şarkılar yazılır.
// Çıktıdaki adres yedektir: oyun şarkı numarasından (id) çalışırken güncel adresi kendisi alır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// [şarkı adı, sanatçı]
const C = [
// Türkçe
['Şımarık','Tarkan'],['Dudu','Tarkan'],['Kuzu Kuzu','Tarkan'],['Hepsi Senin Mi?','Tarkan'],['Yolla','Tarkan'],['Firuze','Sezen Aksu'],['Gidiyorum','Sezen Aksu'],['Hadi Bakalım','Sezen Aksu'],['Kaçın Kurası','Sezen Aksu'],['Sakin Ol','Sertab Erener'],['Every Way That I Can','Sertab Erener'],['Tutamıyorum Zamanı','Kenan Doğulu'],['Yaparım Bilirsin','Kenan Doğulu'],['Araba','Mustafa Sandal'],['Jest Oldu','Mustafa Sandal'],['Düm Tek Tek','Hadise'],['Aşkkolik','Hadise'],['Bangır Bangır','Gülşen'],['Be Adam','Gülşen'],['Vaziyetler','Sıla'],['Aşkı Bulamam','Murat Boz'],['Uçurum','Murat Boz'],['Gel Bana','Murat Boz'],['Yankı','Simge'],['Aşkın Olayım','Simge'],['Kırmızı','Hande Yener'],['Acele Etme','Hande Yener'],['Bambaşka Biri','Ajda Pekkan'],['Kaybolan Yıllar','Ajda Pekkan'],['Mavi Mavi','İbrahim Tatlıses'],['Hatasız Kul Olmaz','Orhan Gencebay'],['Gülpembe','Barış Manço'],['Dönence','Barış Manço'],['Can Bedenden Çıkmayınca','Barış Manço'],['Nilüfer','Müslüm Gürses'],['Affet','Müslüm Gürses'],['Huzurum Kalmadı','Ferdi Tayfur'],['Başım Belada','Ahmet Kaya'],['Resimdeki Gözyaşları','Cem Karaca'],['Tamirci Çırağı','Cem Karaca'],['Papatya','Teoman'],['Paramparça','Teoman'],['Cambaz','Mor ve Ötesi'],['Bir Derdim Var','Mor ve Ötesi'],['Deli','Mor ve Ötesi'],['Her Şeyi Yak','Duman'],['Köprüaltı','Duman'],['Seni Kendime Sakladım','Duman'],['Bir Kadın Çizeceksin','maNga'],['Fly to Stay Alive','maNga'],['Senden Benden Bizden','Athena'],['Holigan','Athena'],['Belki Üstümüzden Bir Kuş Geçer','Yüksek Sadakat'],['Kimdir O','Gripin'],['Aşk Kendi Yağmurunu','Model'],['Dünyadan Uzak','Pinhani'],['Beni Büyüten Şarkılar','Pinhani'],['Martılar','Edis'],['Benim Ol','Edis'],['Karaböcek','Mabel Matiz'],['Geceler','Ezhel'],['Suspus','Ceza'],['Kuşu Kalmadı','Zeynep Bastık'],['Yalan','Ece Seçkin'],['Aşk Şarkıları','Sezen Aksu'],['Sarışın','Tarkan'],['Beni Çok Sev','Tarkan'],['Kış Güneşi','Tarkan'],['Gül Döktüm Yollarına','Hakan Peker'],['Karam','Mustafa Ceceli'],['Sevmemeliyiz','Mustafa Ceceli'],['Bu Aşk Fazla Sana','Murat Dalkılıç'],['Gamzelim','Murat Dalkılıç'],['Ben Böyleyim','Kenan Doğulu'],['Rüya','Teoman'],['Aşkın Mapushane','Bülent Ersoy'],['Bir Ben Bir Allah Biliyor','Sezen Aksu'],['Sen Ağlama','Sezen Aksu'],['Ölürüm Sana','Tarkan'],
// Uluslararası
['Bohemian Rhapsody','Queen'],['We Will Rock You','Queen'],["Don't Stop Me Now",'Queen'],['Hey Jude','The Beatles'],['Let It Be','The Beatles'],['Billie Jean','Michael Jackson'],['Thriller','Michael Jackson'],['Beat It','Michael Jackson'],['Like a Prayer','Madonna'],['Vogue','Madonna'],['Dancing Queen','ABBA'],['Mamma Mia','ABBA'],['Waterloo','ABBA'],['Hotel California','Eagles'],['Smells Like Teen Spirit','Nirvana'],["Sweet Child O' Mine",'Guns N\' Roses'],['Stairway to Heaven','Led Zeppelin'],['Another Brick in the Wall','Pink Floyd'],['Back In Black','AC/DC'],['Highway to Hell','AC/DC'],["Livin' on a Prayer",'Bon Jovi'],['Take On Me','a-ha'],['I Wanna Dance with Somebody','Whitney Houston'],['I Will Always Love You','Whitney Houston'],['My Heart Will Go On','Celine Dion'],['Rolling in the Deep','Adele'],['Someone Like You','Adele'],['Hello','Adele'],['Shape of You','Ed Sheeran'],['Perfect','Ed Sheeran'],['Thinking Out Loud','Ed Sheeran'],['Shake It Off','Taylor Swift'],['Blank Space','Taylor Swift'],['Roar','Katy Perry'],['Firework','Katy Perry'],['Umbrella','Rihanna'],['Diamonds','Rihanna'],['Single Ladies','Beyoncé'],['Poker Face','Lady Gaga'],['Bad Romance','Lady Gaga'],['Uptown Funk','Bruno Mars'],['Just the Way You Are','Bruno Mars'],['Locked Out of Heaven','Bruno Mars'],['Blinding Lights','The Weeknd'],['Starboy','The Weeknd'],['Levitating','Dua Lipa'],['New Rules','Dua Lipa'],['Watermelon Sugar','Harry Styles'],['bad guy','Billie Eilish'],['Viva La Vida','Coldplay'],['Yellow','Coldplay'],['Fix You','Coldplay'],['Believer','Imagine Dragons'],['Radioactive','Imagine Dragons'],['Sugar','Maroon 5'],['Moves Like Jagger','Maroon 5'],['Counting Stars','OneRepublic'],["Hips Don't Lie",'Shakira'],['Waka Waka (This Time for Africa)','Shakira'],['Despacito','Luis Fonsi'],['Happy','Pharrell Williams'],['Get Lucky','Daft Punk'],['Wake Me Up','Avicii'],['Summer','Calvin Harris'],['Gangnam Style','PSY'],['Sorry','Justin Bieber'],['Baby','Justin Bieber'],['Lose Yourself','Eminem'],['Without Me','Eminem'],['In Da Club','50 Cent'],['In the End','Linkin Park'],['Numb','Linkin Park'],['Boulevard of Broken Dreams','Green Day'],['Californication','Red Hot Chili Peppers'],['Mr. Brightside','The Killers'],['Wonderwall','Oasis'],['Creep','Radiohead'],['With or Without You','U2'],['Chandelier','Sia'],['Stay With Me','Sam Smith'],['Circles','Post Malone'],['Someone You Loved','Lewis Capaldi'],['Señorita','Shawn Mendes'],['Havana','Camila Cabello'],['7 rings','Ariana Grande'],['drivers license','Olivia Rodrigo'],['Say So','Doja Cat'],['Good as Hell','Lizzo'],['All I Want for Christmas Is You','Mariah Carey'],['Superstition','Stevie Wonder'],['Three Little Birds','Bob Marley'],["Can't Help Falling in Love",'Elvis Presley'],['My Way','Frank Sinatra'],['What a Wonderful World','Louis Armstrong'],['Eye of the Tiger','Survivor'],['The Final Countdown','Europe'],['Africa','Toto'],["Don't Stop Believin'",'Journey'],['Never Gonna Give You Up','Rick Astley'],['I Want It That Way','Backstreet Boys'],['Bye Bye Bye','*NSYNC'],['Wannabe','Spice Girls'],['...Baby One More Time','Britney Spears'],['I Will Survive','Gloria Gaynor'],["Stayin' Alive",'Bee Gees'],['Rasputin','Boney M.'],['Cheri Cheri Lady','Modern Talking'],['Shape of My Heart','Sting'],['Wind of Change','Scorpions'],['Nothing Else Matters','Metallica'],['Enter Sandman','Metallica'],['Sultans of Swing','Dire Straits'],['In the Air Tonight','Phil Collins'],['Careless Whisper','George Michael'],['Purple Rain','Prince'],['Heroes','David Bowie'],['Roxanne','The Police'],['Lovely Day','Bill Withers'],['September','Earth, Wind & Fire'],['Billie Jean','Michael Jackson'],
];

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'games', 'melodi-sarkilar.js');
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e' };
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîûé]/g, (c) => TR[c]).replace(/[^a-z0-9]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = new Set(), out = [], miss = [];
for (const [title, artist] of C) {
  const k = norm(title) + '|' + norm(artist); if (seen.has(k)) continue; seen.add(k);
  let found = null;
  for (let attempt = 0; attempt < 3 && !found; attempt++) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=8&country=TR`);
      if (r.status === 403 || r.status === 429) { await sleep(20000); continue; }
      const j = await r.json();
      const a0 = norm(artist.split(/[ ,&]/)[0]), t0 = norm(title).slice(0, 14);
      found = (j.results || []).find((x) => x.previewUrl && norm(x.artistName).includes(a0) && norm(x.trackName).includes(t0) && !/\b(live|acoustic|remix|mix|karaoke|instrumental)\b/i.test(x.trackName.replace(title, ''))) || null;   // canlı/akustik/remix kayıtlar alınmaz
      break;
    } catch (e) { await sleep(5000); }
  }
  if (found) out.push({ id: found.trackId, t: title, a: artist, u: found.previewUrl }); else miss.push(`${artist} - ${title}`);
  await sleep(3300);
}
const rows = out.map((x) => `  [${x.id}, ${JSON.stringify(x.t)}, ${JSON.stringify(x.a)}, ${JSON.stringify(x.u)}],`).join('\n');
fs.writeFileSync(OUT, `// 🎧 Şarkıyı Tahmin Et şarkı havuzu: [iTunes şarkı numarası, şarkı adı, sanatçı, 30 sn önizleme adresi].
// Ses önce numarayla iTunes'tan güncel adresi alır (client/melodi.js); bu dosyadaki adres yedektir. Yenilemek için: node scripts/melodi-sarki-bul.mjs
export const SONGS = [
${rows}
];
`);
console.log(`${out.length} şarkı yazıldı → ${OUT}`);
if (miss.length) console.log('Bulunamayan:', miss.join(' | '));
