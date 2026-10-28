// 💣 Bombayı Çöz — "Keep Talking and Nobody Explodes" benzeri ikili takım oyunu
// Takımda biri BOMBAYI görür (çözen), diğeri KILAVUZU okur (anlatıcı). Konuşarak çözerler!
// Tek sayıda oyuncu varsa bir takım 3 kişi olur: 1 anlatıcı, aynı bombayı çözen 2 dinleyici.
// En hızlı çözen takım kazanır; 3 hata ya da süre biterse bomba patlar.
import { GameError, pairUp, shuffle } from './util.js';

export const KIND = 'bombaci';
export const TITLE = 'Bombayı Çöz';
export const EMOJI = '🧨';
export const RULES = [
  'İkili takımlar: biri bombayı görür, diğeri kılavuzu. Konuşarak çözün!',
  'Kablo, düğme ve şifre kilidi modüllerini çöz. 3 hata = BOOM!',
  'En hızlı çözen takım kazanır. Tek kalan takımda anlatıcı iki kişiye anlatır.',
];
// Takımlar SIRAYLA oynar (her tur bir takım). Tur başında roller duyurulur (INTRO_MS), sonra süre başlar.
export const TIME_MS = 180000;
export const INTRO_MS = 6000;
export const PLACE_MS = TIME_MS + INTRO_MS;
export const startOf = (d) => d.roundStart + INTRO_MS;
export const endOf = (d) => d.roundStart + INTRO_MS + TIME_MS;
export const MAX_STRIKES = 3;

// ---------- Kılavuz verisi (istemci de aynı veriden kılavuzu çizer) ----------
export const WIRE_COLORS = { kirmizi: '#e03131', mavi: '#2f6fd1', sari: '#f2c230', beyaz: '#f3f4f6', siyah: '#1f2023' };
export const WIRE_NAMES = { kirmizi: 'kırmızı', mavi: 'mavi', sari: 'sarı', beyaz: 'beyaz', siyah: 'siyah' };
export const BTN_COLORS = { mavi: '#2f6fd1', kirmizi: '#e03131', beyaz: '#f3f4f6', sari: '#f2c230' };
export const BTN_LABELS = ['İPTAL', 'PATLAT', 'TUT', 'BAS'];
export const INDICATORS = ['FRK', 'CAR', 'BOB', 'SND'];

// 🔐 Şifre Kilidi: 3 haneli kod. Kılavuz: seri numarasındaki RAKAMLARIN ilk üçü (harfleri atla); 3'ten az rakam varsa sona 0 ekle; pil sayısı 3'ten fazlaysa tersten gir.
export const LOCK_RULES = [
  'Seri numarasındaki harfleri atla, yalnızca RAKAMLARA bak.',
  'Soldan ilk üç rakam kodundur. 3\'ten az rakam varsa kalan haneleri 0 yaz.',
  'Pil sayısı 3\'ten FAZLAYSA kodu tersten gir (3. rakam başa).',
  'Kilidin üstündeki ▲ ▼ ile her haneyi ayarla, sonra AÇ\'a bas. Yanlış kod 1 hata!',
];
export function lockCode(b) {
  const d = b.serial.replace(/[^0-9]/g, '').split('').slice(0, 3).map(Number);
  while (d.length < 3) d.push(0);
  return b.batteries > 3 ? d.reverse() : d;
}

export const WIRE_RULES = {
  3: ['Hiç kırmızı yoksa → 2. kabloyu kes.', 'Değilse, son kablo beyazsa → son kabloyu kes.', 'Değilse, birden fazla mavi varsa → son mavi kabloyu kes.', 'Hiçbiri değilse → son kabloyu kes.'],
  4: ['Birden fazla kırmızı varsa ve seri no son rakamı tekse → son kırmızıyı kes.', 'Değilse, son kablo sarıysa ve hiç kırmızı yoksa → 1. kabloyu kes.', 'Değilse, tam olarak bir mavi varsa → 1. kabloyu kes.', 'Değilse, birden fazla sarı varsa → son kabloyu kes.', 'Hiçbiri değilse → 2. kabloyu kes.'],
  5: ['Son kablo siyahsa ve seri no son rakamı tekse → 4. kabloyu kes.', 'Değilse, tam olarak bir kırmızı ve birden fazla sarı varsa → 1. kabloyu kes.', 'Değilse, hiç siyah yoksa → 2. kabloyu kes.', 'Hiçbiri değilse → 1. kabloyu kes.'],
  6: ['Hiç sarı yoksa ve seri no son rakamı tekse → 3. kabloyu kes.', 'Değilse, tam olarak bir sarı ve birden fazla beyaz varsa → 4. kabloyu kes.', 'Değilse, hiç kırmızı yoksa → son kabloyu kes.', 'Hiçbiri değilse → 4. kabloyu kes.'],
};
export const BUTTON_RULES = [
  'Düğme MAVİ ve üstünde "İPTAL" yazıyorsa → BASILI TUT.',
  'Değilse, 1\'den fazla pil varsa ve "PATLAT" yazıyorsa → BAS ve hemen BIRAK.',
  'Değilse, düğme BEYAZ ve "CAR" göstergesi yanıyorsa → BASILI TUT.',
  'Değilse, 2\'den fazla pil varsa ve "FRK" göstergesi yanıyorsa → BAS ve hemen BIRAK.',
  'Değilse, düğme SARI ise → BASILI TUT.',
  'Değilse, düğme KIRMIZI ve "TUT" yazıyorsa → BAS ve hemen BIRAK.',
  'Hiçbiri değilse → BASILI TUT.',
];
export const STRIP_RULES = ['Basılı tutunca yanda renkli şerit yanar:', 'MAVİ şerit → sayaçta herhangi bir yerde 4 varken bırak.', 'SARI şerit → sayaçta 5 varken bırak.', 'Başka renk → sayaçta 1 varken bırak.'];

const lastDigitOdd = (b) => Number(b.serial[b.serial.length - 1]) % 2 === 1;
const lit = (b, name) => b.indicators.some((i) => i.name === name && i.lit);
export function wireToCut(b) {
  const w = b.wires, n = w.length, cnt = (c) => w.filter((x) => x === c).length, last = w[n - 1];
  const lastIdx = (c) => w.lastIndexOf(c);
  if (n === 3) { if (!cnt('kirmizi')) return 1; if (last === 'beyaz') return n - 1; if (cnt('mavi') > 1) return lastIdx('mavi'); return n - 1; }
  if (n === 4) { if (cnt('kirmizi') > 1 && lastDigitOdd(b)) return lastIdx('kirmizi'); if (last === 'sari' && !cnt('kirmizi')) return 0; if (cnt('mavi') === 1) return 0; if (cnt('sari') > 1) return n - 1; return 1; }
  if (n === 5) { if (last === 'siyah' && lastDigitOdd(b)) return 3; if (cnt('kirmizi') === 1 && cnt('sari') > 1) return 0; if (!cnt('siyah')) return 1; return 0; }
  if (!cnt('sari') && lastDigitOdd(b)) return 2; if (cnt('sari') === 1 && cnt('beyaz') > 1) return 3; if (!cnt('kirmizi')) return n - 1; return 3;
}
export function buttonAction(b) {
  const { color, label } = b.button;
  if (color === 'mavi' && label === 'İPTAL') return 'hold';
  if (b.batteries > 1 && label === 'PATLAT') return 'press';
  if (color === 'beyaz' && lit(b, 'CAR')) return 'hold';
  if (b.batteries > 2 && lit(b, 'FRK')) return 'press';
  if (color === 'sari') return 'hold';
  if (color === 'kirmizi' && label === 'TUT') return 'press';
  return 'hold';
}
export const releaseDigit = (strip) => (strip === 'mavi' ? '4' : strip === 'sari' ? '5' : '1');
export const timerText = (msLeft) => { const s = Math.max(0, Math.ceil(msLeft / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function makeBomb() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const AL = 'ABCDEFGHJKLMNPQRSTUVWXZ';
  let serial = '';
  for (let i = 0; i < 5; i++) serial += Math.random() < 0.5 ? pick(AL) : String(Math.floor(Math.random() * 10));
  serial += String(Math.floor(Math.random() * 10));
  const n = 3 + Math.floor(Math.random() * 4);
  return {
    serial, batteries: Math.floor(Math.random() * 5),
    indicators: shuffle(INDICATORS).slice(0, 1 + Math.floor(Math.random() * 2)).map((name) => ({ name, lit: Math.random() < 0.5 })),
    wires: Array.from({ length: n }, () => pick(Object.keys(WIRE_COLORS))),
    button: { color: pick(Object.keys(BTN_COLORS)), label: pick(BTN_LABELS) },
  };
}

// ---------- Modül arayüzü ----------
export function init(ids, env) {
  const teams = pairUp(env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) }, { trio: true });
  const bots = new Set(env ? env.players.filter((p) => p.bot).map((p) => p.id) : []);
  const tlist = [], defusers = {};
  teams.forEach((members, ti) => {
    const isBot = members.every((id) => bots.has(id));
    const bomb = makeBomb();
    // 1 kişi: tek başına; 2-3 kişi: 1 anlatıcı, kalanı bombayı görür; 4+ kişi: 2 kişi bombayı görür, kalanlar anlatır
    const nDef = members.length === 1 ? 1 : members.length >= 4 ? 2 : members.length - 1;
    const def = members.length === 1 ? members : members.slice(members.length - nDef);
    const experts = members.length === 1 ? [] : members.slice(0, members.length - nDef);
    const expert = experts[0] || null;
    tlist.push({ id: ti, members, expert, experts, defusers: def, bot: isBot, botT: isBot ? 50000 + Math.random() * 90000 : null, botFail: isBot && Math.random() < 0.25 });
    for (const id of def) defusers[id] = { team: ti, bomb: JSON.parse(JSON.stringify(bomb)), cut: [], wireDone: false, btnDone: false, hold: null, keyDone: false, digits: [0, 0, 0], strikes: 0, doneAt: null, exploded: false };
  });
  return { alive: Object.fromEntries(teams.flat().map((id) => [id, true])), outs: [], teams: tlist, def: defusers, res: {} };
}
const turnTeam = (d) => d.g.teams[Math.min(d.round, d.g.teams.length) - 1];

export const normalize = () => { throw new GameError('Bu oyunda modüllere dokunarak oynanır'); };
export const auto = () => ({});

const finished = (s) => s.doneAt !== null || s.exploded;
function strike(s, now, d) {
  s.strikes++;
  if (s.strikes >= MAX_STRIKES) { s.exploded = true; s.doneAt = null; s.boomAt = now - d.roundStart; }
}
function checkDone(s, now, d) { if (s.wireDone && s.btnDone && s.keyDone && !s.exploded) s.doneAt = now - d.roundStart; }

// Bomba modülüne dokunma (çözen oyuncu)
export function gact(d, pid, body, now) {
  const s = d.g.def[pid];
  if (!s) throw new GameError('Bu takımda bombayı sen görmüyorsun');
  if (s.team !== turnTeam(d).id) throw new GameError('Sıra başka takımda, bekle 🙂');
  if (finished(s)) return false;
  if (now < startOf(d)) throw new GameError('Hazırlan, bomba birazdan başlıyor');
  if (now > endOf(d)) throw new GameError('Süre bitti');
  const b = s.bomb;
  if (body.m === 'wire') {
    const i = Number(body.i);
    if (s.wireDone || !Number.isInteger(i) || i < 0 || i >= b.wires.length || s.cut.includes(i)) return false;
    s.cut.push(i);
    if (i === wireToCut(b)) s.wireDone = true; else strike(s, now, d);
  } else if (body.m === 'btn') {
    if (s.btnDone) return false;
    const want = buttonAction(b);
    if (body.a === 'press') { s.hold = null; if (want === 'press') s.btnDone = true; else strike(s, now, d); }
    else if (body.a === 'hold') { if (!s.hold) s.hold = { strip: ['mavi', 'beyaz', 'sari', 'kirmizi'][Math.floor(Math.random() * 4)] }; }
    else if (body.a === 'release') {
      if (!s.hold) return false;
      const digit = releaseDigit(s.hold.strip);
      const shown = String(body.timer || '');
      const real = timerText(endOf(d) - now);
      // istemcinin gösterdiği sayaç gerçek sayaçtan en fazla 2 sn sapabilir
      const toSec = (t) => { const [m, x] = t.split(':').map(Number); return m * 60 + x; };
      const okTime = /^\d+:\d\d$/.test(shown) && Math.abs(toSec(shown) - toSec(real)) <= 2;
      s.hold = null;
      if (want === 'hold' && okTime && shown.includes(digit)) s.btnDone = true; else strike(s, now, d);
    } else return false;
  } else if (body.m === 'lock') {
    // ▲ ▼: bir haneyi değiştir
    const i = Number(body.i), dd = Number(body.d) < 0 ? 9 : 1;
    if (s.keyDone || !Number.isInteger(i) || i < 0 || i > 2) return false;
    s.digits[i] = (s.digits[i] + dd) % 10;
  } else if (body.m === 'open') {
    if (s.keyDone) return false;
    if (lockCode(b).every((v, k) => v === s.digits[k])) s.keyDone = true; else strike(s, now, d);
  } else return false;
  checkDone(s, now, d);
  return true;
}

// Sıradaki takım bitirince (ya da süre dolunca) tur biter. Bot takımın sonucu önceden belli: kısa bir bekleyişle geçilir.
export function isDue(d, now) {
  const t = turnTeam(d);
  if (t.bot) return now > startOf(d) + 1500;
  if (now > endOf(d)) return true;
  return t.defusers.every((id) => finished(d.g.def[id]));
}

export function resolve(d) {
  const t = turnTeam(d);
  const out = teamResults(d, t);
  d.g.res[t.id] = out;
  return { entry: { team: t.id, members: t.members, results: out }, dur: 4000 };
}

// Kişi başı süre: çözen kendi süresi; anlatıcılar ortak: tüm çözenler çözdüyse en iyi süre, değilse başarısız.
function teamResults(d, t) {
  const out = {};
  if (t.bot) { for (const id of t.members) out[id] = t.botFail ? null : t.botT; return out; }
  const times = t.defusers.map((id) => { const s = d.g.def[id]; return s.doneAt !== null && !s.exploded ? s.doneAt : null; });
  t.defusers.forEach((id, i) => { out[id] = times[i]; });
  const shared = times.every((x) => x !== null) ? Math.min(...times) : times.length === 1 ? times[0] : null;
  for (const id of t.members) if (!t.defusers.includes(id)) out[id] = shared;
  return out;
}

export function ranking(d, participants) {
  if (d.round < d.g.teams.length) return null;
  const r = Object.assign({}, ...Object.values(d.g.res));
  const key = (id) => (r[id] === null || r[id] === undefined ? Infinity : r[id]);
  const ids = participants.slice().sort((a, b) => key(a) - key(b));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && key(last[0]) === key(id)) last.push(id); else groups.push([id]); }
  return groups;
}

export function view(d, pid, now) {
  const g = d.g;
  const team = g.teams.find((t) => t.members.includes(pid));
  const turn = turnTeam(d);
  const mine = team && team.id === turn.id ? g.def[pid] : null;
  const status = (id) => { const s = g.def[id]; return s ? { strikes: s.strikes, solved: [s.wireDone, s.btnDone, s.keyDone].filter(Boolean).length, done: s.doneAt, exploded: s.exploded } : null; };
  return {
    alive: g.alive,
    teams: g.teams.map((t) => ({ id: t.id, members: t.members, expert: t.expert, experts: t.experts, defusers: t.defusers, bot: t.bot, status: t.defusers.map(status), botDone: t.bot && g.res[t.id] ? !t.botFail : null, finished: !!g.res[t.id] })),
    turn: turn.id, startsAt: startOf(d),
    myTeam: team ? team.id : null,
    role: !team ? 'izle' : team.id !== turn.id ? 'bekle' : team.defusers.length === 1 && !team.expert ? 'solo' : team.defusers.includes(pid) ? 'cozen' : 'anlatici',
    bomb: mine ? { ...mine.bomb, cut: mine.cut, wireDone: mine.wireDone, btnDone: mine.btnDone, keyDone: mine.keyDone, hold: mine.hold, digits: mine.digits, strikes: mine.strikes, done: mine.doneAt, exploded: mine.exploded } : null,
    endsAt: endOf(d),
  };
}
