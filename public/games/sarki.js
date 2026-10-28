// 🎤 Ortak Şarkı — herkesin yazdığı söz/cümle tek bir ortak şarkıda birleşir, sonra herkes diğerlerinin katkısını 1–5 puanlar.
// Tur 1: herkes bir dize yazar → sunucu hepsini TEK şarkıya dizer (her katkı şarkıda tam bir satırdır, hiçbiri düşmez; araya nakarat dolgusu girer).
// Tur 2: herkes başkalarının satırlarına 1–5 oy verir (kendi satırına oy yok, satır başına tek oy). Ortalaması en yüksek katkı kazanır;
//        eşitlikte 5 sayısı fazla olan öne geçer. Yeterince oy almayan katkının sonucu kesinleşmez (sıralamada geride kalır).
// Müzik tarayıcıda çalınır (cihazdaki ses motoru + Web Audio vurucu); sunucuda hiçbir ücretli/anahtarlı hizmet yok.
import { GameError, shuffle } from './util.js';
import { isBad } from './filtre.js';

export const KIND = 'sarki';
export const TITLE = 'Ortak Şarkı';
export const EMOJI = '🎤';
export const RULES = [
  'Herkes bir dize yazar; hepsi tek bir ortak şarkıda birleşir.',
  'Şarkıyı dinle ve başkalarının dizelerine 1–5 puan ver (kendine veremezsin).',
  'Ortalaması en yüksek dize kazanır; eşitlikte çok 5 alan öne geçer.',
];
export const WRITE_MS = 55000, VOTE_MS = 70000, REVEAL_WRITE_MS = 2500, REVEAL_VOTE_MS = 9000;
export const PLACE_MS = WRITE_MS;
export const placeMs = (d) => (d.round === 1 ? WRITE_MS : VOTE_MS);
export const TEXT_MAX = 80;
export const MIN_VOTES = 2;                       // bir katkının sonucunun kesinleşmesi için en az oy (az kişiyle düşer, bkz. minVotesFor)
export const minVotesFor = (nContrib) => Math.max(1, Math.min(MIN_VOTES, nContrib - 1));

const BOT_LINES = [
  'Gece boyunca dans edelim', 'Yıldızlar bizi izliyor', 'Kalbim çatır çatır atıyor', 'Çay demle, hayat güzel',
  'Bugün her şey mümkün', 'Düş peşimden, sonsuza dek', 'Pizza kokusu sardı sokağı', 'Hep birlikte söyleyelim',
  'Rüzgar saçlarımı savurur', 'Bir gülüşün yeter bana', 'Denizin kıyısında şarkı', 'Ellerimizi havaya kaldır',
];
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/[^a-z0-9]/g, '');
export const cleanText = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) : '');
const cap = (w) => (w ? w.charAt(0).toLocaleUpperCase('tr') + w.slice(1) : w);

// Oyunun kendi yazdığı dizeler: şarkıyı tam bir şarkı yapar (giriş, nakarat, köprü, bitiş). {k1} {k2} = oyuncuların yazdığı anahtar kelimeler.
const INTRO = ['Hazır mısınız? Başlıyoruz!', 'Işıklar yandı, müzik başlasın!', 'Bir, iki, üç, dört, hadi söyle!', 'Mikrofon sende, sahne senin!'];
const LINK = ['Hepimiz aynı şarkıdayız', 'Ritmi tut, bırakma ellerimi', 'Söyle, söyle, durma sakın', 'Bu ezgi hepimizin bu gece'];
const CHORUS = [
  ['{k1} için söylüyoruz bu şarkıyı', 'Hep bir ağızdan, eller havada', '{k2}, {k1} diye bağırıyoruz', 'La la la, bu şarkı hepimizin!'],
  ['{k1}, {k1}, çın çın öter kalbim', 'Dön dolaş yine {k2} sesi', 'Yüksek sesle söylüyoruz hep beraber', 'Ooo ooo, nakarat bizimle!'],
  ['Her yer {k1}, her yer {k2}', 'Sesimizi duysun bütün şehir', 'Şarkı bitmez, biz bırakmayız', 'Hey hey hey, hep birlikte!'],
];
const BRIDGE = [['Bir an dur, nefes al…', 'Sonra hep beraber, bir daha!'], ['Işıkları kıs, sesi aç…', 'Son nakarata hazır mısın?']];
const OUTRO = ['Teşekkürler, şarkı burada bitti!', 'İşte böyle, ortak şarkımız hazır!', 'Alkışlar sizin, şarkı sizin!'];
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
const fillKeys = (t, k1, k2) => t.replace(/\{k1\}/g, k1).replace(/\{k2\}/g, k2);

// Katkılardan tam şarkı: Giriş → Kıta 1 → Nakarat → Kıta 2 → Nakarat → (Kıta 3) → Köprü → Final nakarat → Bitiş.
// Her katkı şarkıda TAM BİR satırdır (hiçbiri düşmez); satır { cid|null, text, gen? }. cid olmayanlar oyunun kendi dizeleridir.
export function composeSong(contribs) {
  const order = shuffle(contribs.map((c) => c.cid));
  const text = Object.fromEntries(contribs.map((c) => [c.cid, c.text]));
  // anahtar kelimeler: en uzun, tekrar etmeyen kelimeler
  const words = [...new Set(contribs.flatMap((c) => c.text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 4)))];
  words.sort((a, b) => b.length - a.length);
  const keys = shuffle(words.slice(0, 6)).slice(0, 3);
  const k1 = cap(keys[0] || 'şarkı'), k2 = cap(keys[1] || keys[0] || 'müzik');
  const gen = (t) => ({ cid: null, text: fillKeys(t, k1, k2), gen: true });
  const chorus = pickOne(CHORUS).map(gen);
  const n = order.length, nv = n >= 7 ? 3 : n >= 3 ? 2 : 1;
  const sections = [{ name: 'Giriş', kind: 'intro', lines: [gen(pickOne(INTRO))] }];
  let at = 0;
  for (let v = 0; v < nv; v++) {
    const take = Math.ceil((n - at) / (nv - v));
    const lines = order.slice(at, at + take).map((cid) => ({ cid, text: text[cid] }));
    at += take;
    lines.push(gen(LINK[(v + Math.floor(Math.random() * LINK.length)) % LINK.length]));
    sections.push({ name: `Kıta ${v + 1}`, kind: 'verse', lines });
    if (v < nv - 1 || nv === 1) sections.push({ name: 'Nakarat', kind: 'chorus', lines: chorus.map((l) => ({ ...l })) });
  }
  sections.push({ name: 'Köprü', kind: 'bridge', lines: pickOne(BRIDGE).map(gen) });
  sections.push({ name: 'Final nakarat', kind: 'chorus', lines: chorus.map((l) => ({ ...l })) });
  sections.push({ name: 'Bitiş', kind: 'outro', lines: [gen(pickOne(OUTRO))] });
  const title = keys.length >= 2 ? `${cap(keys[0])} ve ${cap(keys[1])}` : keys.length ? `${cap(keys[0])} Şarkısı` : 'Ortak Şarkımız';
  // Hızlı, oynak tempo; müzik tarayıcıda üretilir (client/music.js): mod, akor dizisi ve ritim stili burada seçilir ki herkes aynı şarkıyı duysun
  return {
    title, tempo: 108 + Math.floor(Math.random() * 30), key: Math.floor(Math.random() * 7),
    mode: Math.random() < 0.65 ? 'major' : 'minor', prog: Math.floor(Math.random() * 3), groove: Math.floor(Math.random() * 3), sections,
  };
}

export function init(ids, env) {
  const bots = env ? env.players.filter((p) => p.bot).map((p) => p.id) : [];
  return { alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [], bots, contribs: [], song: null, results: null };
}

export function normalize(d, pid, body, now) {
  if (now < d.roundStart) throw new GameError('Birazdan başlıyor');
  if (d.round === 1) {
    const text = cleanText(body.text);
    if (text.length < 2) throw new GameError('Biraz daha uzun yaz 🙂');
    if (isBad(text)) throw new GameError('Bu söz kullanılamaz 🙂');
    return { text };
  }
  const own = d.g.contribs.find((c) => c.pid === pid);
  const votes = {};
  for (const [cid, v] of Object.entries(body.votes || {})) {
    const c = d.g.contribs.find((x) => x.cid === cid);
    if (!c) throw new GameError('Geçersiz dize');
    if (own && own.cid === cid) continue;                               // kendi dizene oy sayılmaz
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new GameError('Puan 1 ile 5 arasında olmalı');
    votes[cid] = n;
  }
  return { votes };
}

// Bot: dize yazar, başkalarına 3–5 arası oy verir. İnsan hiçbir şey göndermediyse katkısı/oyu yok sayılır.
export function auto(d, pid, bot) {
  if (d.round === 1) return bot ? { text: BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)] } : { text: null };
  if (!bot) return { votes: {} };
  const votes = {};
  for (const c of d.g.contribs) if (c.pid !== pid) votes[c.cid] = 3 + Math.floor(Math.random() * 3);
  return { votes };
}

export function resolve(d, actions) {
  const g = d.g;
  if (d.round === 1) {
    const used = new Set();
    const ids = Object.keys(g.alive).filter((id) => g.alive[id]);
    ids.forEach((id) => {
      const a = actions[id];
      if (!a || !a.text) return;
      let t = a.text;
      if (used.has(norm(t))) t = `${t} ♪`;                               // aynı dizeyi iki kişi yazdıysa da ikisi de şarkıda yer alır
      used.add(norm(t));
      g.contribs.push({ cid: 'c' + (g.contribs.length + 1), pid: id, text: t });
    });
    // Hiç katkı yoksa şarkı kurulamaz: botlardan/dolgudan tek satır eklenir ki oyun tıkanmasın
    if (!g.contribs.length) g.contribs.push({ cid: 'c1', pid: ids[0], text: BOT_LINES[0] });
    g.song = composeSong(g.contribs);
    g.missing = ids.filter((id) => !g.contribs.some((c) => c.pid === id));
    return { entry: { phase: 'write', title: g.song.title, count: g.contribs.length, missing: g.missing }, dur: REVEAL_WRITE_MS };
  }
  // Oy sayımı
  const stats = {};
  for (const c of g.contribs) stats[c.cid] = { cid: c.cid, pid: c.pid, text: c.text, votes: [], sum: 0, fives: 0 };
  for (const [voter, a] of Object.entries(actions)) {
    if (!g.alive[voter]) continue;
    for (const [cid, v] of Object.entries((a && a.votes) || {})) {
      const s = stats[cid];
      if (!s || s.pid === voter || s.votes.includes(voter)) continue;     // kendine oy yok, kişi başı tek oy
      s.votes.push(voter); s.sum += v; if (v === 5) s.fives++;
    }
  }
  const need = minVotesFor(g.contribs.length);
  const list = Object.values(stats).map((s) => ({ cid: s.cid, pid: s.pid, text: s.text, n: s.votes.length, avg: s.votes.length ? s.sum / s.votes.length : 0, fives: s.fives, final: s.votes.length >= need }));
  list.sort((a, b) => (b.final - a.final) || (b.avg - a.avg) || (b.fives - a.fives));
  const key = (s) => `${s.final ? 1 : 0}|${s.avg.toFixed(4)}|${s.fives}`;
  list.forEach((s, i) => { s.rank = i && key(list[i - 1]) === key(s) ? list[i - 1].rank : i + 1; });
  const anyFinal = list.some((s) => s.final);
  g.results = { list, need, anyFinal };
  return { entry: { phase: 'vote', title: g.song.title, results: list, need, anyFinal, song: g.song }, dur: REVEAL_VOTE_MS };
}

// Sıralama: katkının sırası = yazarın sırası. Katkısı olmayan (yazmayan) oyuncular en sona.
export function ranking(d, participants) {
  if (d.round < 2) return null;
  const res = d.g.results.list;
  const groups = [];
  const byRank = new Map();
  for (const s of res) { if (!participants.includes(s.pid)) continue; if (!byRank.has(s.rank)) byRank.set(s.rank, []); byRank.get(s.rank).push(s.pid); }
  for (const r of [...byRank.keys()].sort((a, b) => a - b)) groups.push(byRank.get(r));
  const rest = participants.filter((id) => !res.some((s) => s.pid === id));
  if (rest.length) groups.push(rest);
  return groups;
}

export function view(d, pid, now) {
  const g = d.g;
  const mine = g.contribs.find((c) => c.pid === pid);
  const base = { phase: d.round === 1 ? 'write' : 'vote', textMax: TEXT_MAX, total: Object.keys(g.alive).length };
  if (d.round === 1) return base;
  // Oylama sırasında yazarlar gizli; kendi satırım işaretli
  return {
    ...base, song: g.song, myCid: mine ? mine.cid : null, minVotes: minVotesFor(g.contribs.length),
    contribs: g.contribs.map((c) => ({ cid: c.cid, text: c.text, mine: c.pid === pid })),
  };
}
