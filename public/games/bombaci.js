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
  'Kablo, düğme ve sembol modüllerini çöz. 3 hata = BOOM!',
  'En hızlı çözen takım kazanır. Tek kalan takımda anlatıcı iki kişiye anlatır.',
];
export const TIME_MS = 240000;
export const PLACE_MS = TIME_MS;
export const MAX_STRIKES = 3;

// ---------- Kılavuz verisi (istemci de aynı veriden kılavuzu çizer) ----------
export const WIRE_COLORS = { kirmizi: '#e03131', mavi: '#2f6fd1', sari: '#f2c230', beyaz: '#f3f4f6', siyah: '#1f2023' };
export const WIRE_NAMES = { kirmizi: 'kırmızı', mavi: 'mavi', sari: 'sarı', beyaz: 'beyaz', siyah: 'siyah' };
export const BTN_COLORS = { mavi: '#2f6fd1', kirmizi: '#e03131', beyaz: '#f3f4f6', sari: '#f2c230' };
export const BTN_LABELS = ['İPTAL', 'PATLAT', 'TUT', 'BAS'];
export const INDICATORS = ['FRK', 'CAR', 'BOB', 'SND'];
export const SYMS = ['Ω', 'Ψ', 'Ж', 'λ', 'Ѯ', 'Ϟ', 'Ӭ', 'Ϙ', 'Ѫ', '☆', '★', '¶', '©', '¿', 'æ', 'Ѣ', 'ϗ', 'б', 'Ѧ', 'Ͼ', 'Ͽ', 'ß', 'Φ', 'Ξ', 'Ћ', 'Љ', 'Ђ'];
// Her sütun 7 sembol; iki sütun en fazla bir sembol paylaşır → 4 sembol tek bir sütunu belirler
export const COLUMNS = [
  [0, 1, 2, 3, 4, 5, 6],
  [7, 0, 8, 9, 10, 11, 12],
  [13, 14, 8, 15, 16, 2, 17],
  [18, 19, 20, 11, 15, 21, 5],
  [22, 20, 23, 24, 3, 13, 9],
  [25, 26, 22, 17, 6, 10, 19],
];

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
export const keypadOrder = (b) => b.keypad.syms.slice().sort((x, y) => COLUMNS[b.keypad.col].indexOf(x) - COLUMNS[b.keypad.col].indexOf(y));
export const timerText = (msLeft) => { const s = Math.max(0, Math.ceil(msLeft / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function makeBomb() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const AL = 'ABCDEFGHJKLMNPQRSTUVWXZ';
  let serial = '';
  for (let i = 0; i < 5; i++) serial += Math.random() < 0.5 ? pick(AL) : String(Math.floor(Math.random() * 10));
  serial += String(Math.floor(Math.random() * 10));
  const n = 3 + Math.floor(Math.random() * 4);
  const col = Math.floor(Math.random() * COLUMNS.length);
  return {
    serial, batteries: Math.floor(Math.random() * 5),
    indicators: shuffle(INDICATORS).slice(0, 1 + Math.floor(Math.random() * 2)).map((name) => ({ name, lit: Math.random() < 0.5 })),
    wires: Array.from({ length: n }, () => pick(Object.keys(WIRE_COLORS))),
    button: { color: pick(Object.keys(BTN_COLORS)), label: pick(BTN_LABELS) },
    keypad: { col, syms: shuffle(shuffle(COLUMNS[col]).slice(0, 4)) },
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
    let expert = members.length === 1 ? null : members[0];
    const def = members.length === 1 ? members : members.slice(1);
    tlist.push({ id: ti, members, expert, defusers: def, bot: isBot, botT: isBot ? 70000 + Math.random() * 130000 : null, botFail: isBot && Math.random() < 0.25 });
    for (const id of def) defusers[id] = { team: ti, bomb: JSON.parse(JSON.stringify(bomb)), cut: [], wireDone: false, btnDone: false, hold: null, keyDone: false, pressed: [], strikes: 0, doneAt: null, exploded: false };
  });
  return { alive: Object.fromEntries(teams.flat().map((id) => [id, true])), outs: [], teams: tlist, def: defusers };
}

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
  if (finished(s)) return false;
  if (now > d.roundStart + TIME_MS) throw new GameError('Süre bitti');
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
      const real = timerText(d.roundStart + TIME_MS - now);
      // istemcinin gösterdiği sayaç gerçek sayaçtan en fazla 2 sn sapabilir
      const toSec = (t) => { const [m, x] = t.split(':').map(Number); return m * 60 + x; };
      const okTime = /^\d+:\d\d$/.test(shown) && Math.abs(toSec(shown) - toSec(real)) <= 2;
      s.hold = null;
      if (want === 'hold' && okTime && shown.includes(digit)) s.btnDone = true; else strike(s, now, d);
    } else return false;
  } else if (body.m === 'key') {
    const i = Number(body.i);
    if (s.keyDone || !b.keypad.syms.includes(i) || s.pressed.includes(i)) return false;
    const order = keypadOrder(b);
    if (order[s.pressed.length] === i) { s.pressed.push(i); if (s.pressed.length === 4) s.keyDone = true; } else strike(s, now, d);
  } else return false;
  checkDone(s, now, d);
  return true;
}

// Herkes bitirdiyse (ya da süre dolduysa) oyun biter
export function isDue(d, now) {
  if (now > d.roundStart + TIME_MS) return true;
  // bot takımların süresi önceden belli; insanlar bitirince beklemeye gerek yok
  const human = d.g.teams.filter((t) => !t.bot).flatMap((t) => t.defusers);
  return human.length ? human.every((id) => finished(d.g.def[id])) : now > d.roundStart + Math.max(...d.g.teams.map((t) => t.botT));
}

export function resolve(d) {
  return { entry: { results: results(d) }, dur: 3000 };
}

// Kişi başı süre: çözen kendi süresi; anlatıcı ikili takımda ortağının süresi, üçlü takımda
// iki dinleyici de çözdüyse en iyi süre (yüksek puan), değilse başarısız.
function results(d) {
  const out = {};
  for (const t of d.g.teams) {
    if (t.bot) { for (const id of t.members) out[id] = t.botFail ? null : t.botT; continue; }
    const times = t.defusers.map((id) => { const s = d.g.def[id]; return s.doneAt !== null && !s.exploded ? s.doneAt : null; });
    t.defusers.forEach((id, i) => { out[id] = times[i]; });
    if (t.expert) out[t.expert] = times.every((x) => x !== null) ? Math.min(...times) : times.length === 1 ? times[0] : null;
  }
  return out;
}

export function ranking(d, participants) {
  const r = results(d);
  const key = (id) => (r[id] === null || r[id] === undefined ? Infinity : r[id]);
  const ids = participants.slice().sort((a, b) => key(a) - key(b));
  const groups = [];
  for (const id of ids) { const last = groups[groups.length - 1]; if (last && key(last[0]) === key(id)) last.push(id); else groups.push([id]); }
  return groups;
}

export function view(d, pid, now) {
  const g = d.g;
  const team = g.teams.find((t) => t.members.includes(pid));
  const mine = g.def[pid];
  const status = (id) => { const s = g.def[id]; return s ? { strikes: s.strikes, solved: [s.wireDone, s.btnDone, s.keyDone].filter(Boolean).length, done: s.doneAt, exploded: s.exploded } : null; };
  return {
    alive: g.alive,
    teams: g.teams.map((t) => ({ id: t.id, members: t.members, expert: t.expert, defusers: t.defusers, bot: t.bot, status: t.defusers.map(status), botDone: t.bot && now - d.roundStart >= t.botT ? !t.botFail : null })),
    myTeam: team ? team.id : null,
    role: !team ? 'izle' : team.defusers.length === 1 && !team.expert ? 'solo' : team.expert === pid ? 'anlatici' : 'cozen',
    bomb: mine ? { ...mine.bomb, cut: mine.cut, wireDone: mine.wireDone, btnDone: mine.btnDone, keyDone: mine.keyDone, hold: mine.hold, pressed: mine.pressed, strikes: mine.strikes, done: mine.doneAt, exploded: mine.exploded } : null,
    endsAt: d.roundStart + TIME_MS,
  };
}
