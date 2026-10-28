// 🐾 Pati Koşusu — yandan görünümlü hayvan koşu yarışı (4 koşucu: oyuncu + botlar)
// Koşucular otomatik ileri koşar; oyuncu zıplar, havada tekrar zıplar (çift zıplama), havadayken yere çakılır, kayar
// ve yoldaki kutulardan aldığı güçlendirmelerle rakiplere saldırır. Pist tohumdan (seed) üretilir: platformlar, çukurlar,
// basamaklar, engeller (kutu, diken, asılı kütük) ve güçlendirme kutuları.
// Bu dosya saf JS'tir (DOM yok): tarayıcıda oyunu, testlerde de aynı kodu çalıştırır. Dünya: x ileri, y yukarı (birim ≈ metre).
import { realtimeServer } from './util.js';

export const KIND = 'pati';
export const TITLE = 'Pati Koşusu';
export const EMOJI = '🐾';
export const RULES = [
  'Otomatik koşarsın: ZIPLA (havada tekrar basarsan çift zıplama), KAY (havadayken yere çak).',
  'Çukurlardan ve yerdeki kuyulardan zıpla, kutuların üstünden geç, asılı engelin altından kay. Trambolin zıplatır, hız pedi hızlandırır, yokuş aşağı hızlanırsın.',
  '❓ kutulardan güçlendirme al, ÖZEL GÜÇ ile kullan: (düğmeyi basılı tutup yönü seç, bırakınca elinden fırlar) testere, şok, kapan, nitro, kalkan, sandık, eldiven, meteor, yumruk kutusu, buz.',
  'Pist çok katlı: üst platformlara ve gökyüzü yollarına çıkabilirsin ama başını tavana çarparsın. Hayvanının pasif gücü var!',
];

// ---------- Sabitler ----------
export const G = 40, JUMP_V = 15.5, JUMP2_V = 13.8, SLAM_V = -38;
export const BASE_V = 9.4, ACCEL = 16, DECEL = 34;
export const RUN_W = 0.7, RUN_H = 1.35, SLIDE_H = 0.65, SLIDE_T = 0.7, SLIDE_CD = 0.4;
export const STEP = 0.42;                 // bu kadar yüksek basamak tırmanılır, fazlası duvar
export const FALL_Y = -13, RESPAWN_T = 1.3, INV_T = 1.6;
export const PIT_D = 1.0, PIT_W = 3.0, UP_THICK = 0.35, TRAMP_V = 23, START_BOOST = 1.9, PAD_BOOST = 1.1;
export const COUNTDOWN = 3, AFTER_FIRST = 12, MAX_RACE = 220;   // ilk bitirenden 12 sn sonra bitirmeyenler DNF olur
export const LANES = [-1.5, -0.5, 0.5, 1.5]; // sadece çizim için derinlik; çarpışmalar tek düzlemde
export const START_X = 1;

// ---------- Güçlendirmeler ----------
export const ITEMS = {
  1: { key: 'saw', emoji: '🪚', name: 'Dönen Testere', desc: 'Kaydırarak yönünü seç: ileri, geri ya da yukarı. Değeni parçalar!' },
  2: { key: 'zap', emoji: '⚡', name: 'Elektrik Şoku', desc: 'Öndekini yavaşlatır' },
  3: { key: 'trap', emoji: '🪤', name: 'Ayı Kapanı', desc: 'Yere bırakılır, basanı parçalar' },
  4: { key: 'boost', emoji: '🚀', name: 'Roket Pabuç', desc: 'Kısa süre çok hızlı' },
  5: { key: 'shield', emoji: '🛡️', name: 'Balon Kalkan', desc: 'Bir darbeyi yutar' },
  6: { key: 'crate', emoji: '📦', name: 'Sürpriz Sandık', desc: 'Öndekinin önüne engel koyar' },
  7: { key: 'punch', emoji: '🥊', name: 'Boks Eldiveni', desc: 'Öndekini geriye savurur' },
  8: { key: 'meteor', emoji: '☄️', name: 'Meteor Yağmuru', desc: 'Önündeki herkesi düşürür (kalkan korur)' },
  9: { key: 'pbox', emoji: '🥊', name: 'Yumruk Kutusu', desc: 'Yere bırakılır, çarpanı geriye savurur' },
  10: { key: 'ice', emoji: '🧊', name: 'Buz Parçası', desc: 'Yere bırakılır, basan bir süre zıplayamaz ve güç kullanamaz' },
};
export const ITEM_COUNT = 10;
export const TIER_DY = 3.3;           // üst platform yüksekliği: altından blok üstü zıplanabilir (kafa çarpmaz), çıkmak için çift zıplama gerekir
export const FX = { stun: 0.9, zap: 2.6, trap: 1.5, boost: 2.3, shield: 7, kb: 0.32, saw: 1.0, kbBox: 0.55, ice: 2.4 };
export const BOX_RESPAWN = 5, TRAP_LIFE = 22, TRAP_MAX = 8, CRATE_LIFE = 14, SAW_V = 22, SAW_LIFE = 3.2;

// ---------- Haritalar ----------
// len: pist uzunluğu; gap/obst/hang/steps: zorluk çarpanları; slope: yokuş aşağı sıklığı; tramp/pad: trambolin ve hız pedi sıklığı
export const MAPS = {
  orman: { id: 'orman', name: 'Orman Koşusu', emoji: '🌲', len: 650, gap: 0.8, obst: 1.0, hang: 0.7, steps: 1.0, slope: 1.0, tramp: 1.0, pad: 1.0, price: 0 },
  magara: { id: 'magara', name: 'Kristal Mağara', emoji: '💎', len: 700, gap: 1.15, obst: 1.1, hang: 1.2, steps: 1.2, slope: 0.8, tramp: 1.2, pad: 0.8, price: 120 },
  seker: { id: 'seker', name: 'Şeker Diyarı', emoji: '🍭', len: 760, gap: 1.45, obst: 1.2, hang: 1.0, steps: 1.5, slope: 1.3, tramp: 1.5, pad: 1.0, price: 260 },
  kar: { id: 'kar', name: 'Karlı Dağ', emoji: '🏔️', len: 720, gap: 1.0, obst: 1.0, hang: 0.9, steps: 1.0, slope: 2.0, tramp: 0.8, pad: 1.4, price: 300 },
  col: { id: 'col', name: 'Çöl Yolu', emoji: '🏜️', len: 680, gap: 1.3, obst: 1.2, hang: 0.8, steps: 1.3, slope: 0.7, tramp: 1.0, pad: 1.2, price: 340 },
};
export const MAP_IDS = Object.keys(MAPS);

// Hayvan başına küçük farklar (hız, zıplama, ivme çarpanı) ve PASİF GÜÇ.
// down: yokuş aşağı hız çarpanı; stunMul: sersemleme süresi; tramp: trambolin yüksekliği; pit: kuyudan çıkış zıplaması; respawn: yeniden doğuş süresi çarpanı; iceImmune: buzdan etkilenmez
export const ANIMALS = {
  tilki: { id: 'tilki', name: 'Tilki', emoji: '🦊', price: 0, speed: 1.0, jump: 1.0, accel: 1.0, down: 1.22, stunMul: 0.8, tramp: 1, pit: 1, respawn: 1, pass: 'Çevik: yokuş aşağı hızlı, sersemleme kısa', desc: 'Dengeli' },
  tavsan: { id: 'tavsan', name: 'Tavşan', emoji: '🐰', price: 0, speed: 0.98, jump: 1.06, accel: 1.0, down: 1.0, stunMul: 1, tramp: 1.2, pit: 1.1, respawn: 1, pass: 'Zıpçı: trambolinden çok yükseğe fırlar', desc: 'Yüksek zıplar' },
  kedi: { id: 'kedi', name: 'Kedi', emoji: '🐱', price: 0, speed: 1.0, jump: 1.0, accel: 1.12, down: 1.1, stunMul: 1, tramp: 1, pit: 1, respawn: 0.55, pass: 'Dokuz can: ölünce çabuk doğar, uzun dokunulmaz', desc: 'Çabuk hızlanır' },
  panda: { id: 'panda', name: 'Panda', emoji: '🐼', price: 100, speed: 1.03, jump: 0.96, accel: 0.9, down: 1.45, stunMul: 0.6, tramp: 1, pit: 1, respawn: 1, pass: 'Tank: yokuş aşağı yuvarlanır, sersemlemesi kısa', desc: 'Hızlı ama ağır' },
  kurbaga: { id: 'kurbaga', name: 'Kurbağa', emoji: '🐸', price: 200, speed: 0.97, jump: 1.1, accel: 1.0, down: 0.8, stunMul: 1, tramp: 1.1, pit: 1.3, respawn: 1, pass: 'Yapışkan: kuyudan kolay çıkar ama yokuşta yavaş', desc: 'Süper zıplama' },
  penguen: { id: 'penguen', name: 'Penguen', emoji: '🐧', price: 300, speed: 1.02, jump: 1.0, accel: 1.05, down: 1.7, stunMul: 1, tramp: 1, pit: 1, respawn: 1, iceImmune: true, pass: 'Kaygan: yokuşta çok hızlı, buzdan etkilenmez', desc: 'Kayarken hızlı' },
};
export const ANIMAL_IDS = Object.keys(ANIMALS);
export const COLORS = [
  { id: 0, hex: '#f97316', price: 0 }, { id: 1, hex: '#94a3b8', price: 0 }, { id: 2, hex: '#f472b6', price: 0 },
  { id: 3, hex: '#38bdf8', price: 0 }, { id: 4, hex: '#a3e635', price: 60 }, { id: 5, hex: '#c084fc', price: 60 },
  { id: 6, hex: '#fbbf24', price: 90 }, { id: 7, hex: '#ef4444', price: 90 },
];
export const HATS = {
  yok: { id: 'yok', name: 'Yok', emoji: '🚫', price: 0 },
  kasket: { id: 'kasket', name: 'Kasket', emoji: '🧢', price: 0 },
  gozluk: { id: 'gozluk', name: 'Gözlük', emoji: '🕶️', price: 80 },
  fiyonk: { id: 'fiyonk', name: 'Fiyonk', emoji: '🎀', price: 60 },
  tac: { id: 'tac', name: 'Taç', emoji: '👑', price: 150 },
};
export const HAT_IDS = Object.keys(HATS);
export const PRIZES = [60, 40, 25, 15]; // sıraya göre altın
export const HIT_BONUS = 5, HIT_BONUS_MAX = 20;

// ---------- Turnuva (oda) modülü arayüzü: oyunu oda sahibinin cihazı yönetir (bkz. games/yaris.js, client/rt.js) ----------
const base = realtimeServer();
export const { realtime, PLACE_MS, normalize, auto, resolve, ranking } = base;
// Oyuncuların seçtiği hayvanlar (env.players[].animal); seçmeyen/bot kalan hayvanlardan rastgele alır
function pickAnimals(ids, env) {
  const want = Object.fromEntries(((env && env.players) || []).filter((p) => ANIMALS[p.animal]).map((p) => [p.id, p.animal]));
  const used = new Set(Object.values(want));
  const free = ANIMAL_IDS.filter((a) => !used.has(a)).sort(() => Math.random() - 0.5);
  const out = {};
  for (const id of ids) out[id] = want[id] || free.shift() || ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)];
  return out;
}
export const init = (ids, env) => ({ ...base.init(ids, env), animals: pickAnimals(ids, env), seed: (Math.random() * 0x7fffffff) >>> 0, map: MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] });
export const view = (d, pid, now) => ({ ...base.view(d, pid, now), seed: d.g.seed, map: d.g.map, animals: d.g.animals });

// ---------- Rastgelelik ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Pist üretimi ----------
// Platformlar [x0,x1] aralığında y yüksekliğinde (y1 varsa yokuş: x0'da y, x1'de y1). Aralarındaki boşluklar çukurdur. Engeller platform üstünde, kenarlardan uzak.
// Yerdeki kuyular (pits) platformu bölüp o kadar çukurlaştırır: içine düşen ölmez ama takılır, zıplayarak çıkar.
const CACHE = new Map();
const platY = (p, x) => (p.y1 === undefined ? p.y : p.y + (p.y1 - p.y) * clamp((x - p.x0) / (p.x1 - p.x0), 0, 1));
export function buildTrack(mapId, seed) {
  const M = MAPS[mapId] || MAPS.orman;
  seed = seed >>> 0;
  const key = `${M.id}:${seed}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const R = rng(seed ^ hashStr(M.id));
  const END = M.len;
  const plats = [], obst = [], boxes = [], gaps = [], rises = [], pits = [], tramps = [], pads = [];
  let x = 0, y = 0;
  const addPlat = (len, yy) => { plats.push({ x0: x, x1: x + len, y: yy }); x += len; y = yy; };
  const OB = {
    block: () => ({ k: 'block', w: 1.0, y0: 0, y1: 1.1 }),
    bar: () => ({ k: 'bar', w: 1.2, y0: 0.95, y1: 2.5 }),
  };
  // Düz platform üstüne engel / kuyu dizer (kenarlardan ≥ 3.6 uzakta, aralarında ≥ 6.2)
  const place = (kind, cx, p) => {
    if (kind === 'pit') { pits.push({ x0: cx, x1: cx + PIT_W }); return PIT_W; }
    const o = OB[kind](); o.x = cx; o.y0 += p.y; o.y1 += p.y; obst.push(o); return o.w;
  };
  const fillObstacles = (p, density) => {
    let cx = p.x0 + 3.8 + R() * 2.5;
    while (cx < p.x1 - 4.8) {
      if (R() < density) {
        const r = R(), hang = 0.2 * M.hang;
        let kind = r < hang ? 'bar' : r < hang + 0.45 ? 'block' : 'pit';
        if (kind === 'pit' && cx + PIT_W > p.x1 - 3.6) kind = 'block';     // kuyunun ardında yeterince zemin kalsın
        const w = place(kind, cx, p);
        // bazen ikili (tek zıplamayla geçilebilen yakınlıkta)
        if (kind !== 'bar' && R() < 0.22 * M.obst && cx + w + 3.0 + PIT_W <= p.x1 - 3.2) {
          const k2 = R() < 0.5 || cx + w + 3.0 + PIT_W > p.x1 - 3.6 ? 'block' : 'pit'; const w2 = place(k2, cx + w + 3.0, p); cx = cx + w + 3.0 + w2;
        } else cx += w;
        cx += 6.4 + R() * 3.2;
      } else cx += 6.2 + R() * 3;
    }
  };
  addPlat(34, 0); // başlangıç düzlüğü (engelsiz)
  const pSlope = 0.13 * M.slope;
  // Üst kat bölgeleri önceden ayrılır: altlarındaki ana yol düz ve engelsizdir (tavan yüzünden zıplama/çukur aşma imkânsız olmasın)
  const zones = [];
  for (let ux = 70; ux < END - 90; ux += 58 + R() * 38) { const len = 26 + R() * 18; if (ux + len <= END - 50) zones.push({ a: ux, b: ux + len }); }
  const inZone = (a, b) => zones.some((z) => a < z.b + 3 && b > z.a - 3);
  while (x < END - 40) {
    const prog = x / END, r = R();
    if (inZone(x, x + 26)) {             // üst katın altı: sade düz yol
      const p = { x0: x, x1: x + 11 + R() * 7, y };
      plats.push(p); x = p.x1;
      continue;
    }
    const pGap = 0.3 * M.gap, pStep = pGap + 0.17 * M.steps;
    if (r < pGap && prog > 0.07) {
      // çukur: tek zıplamayla geçilir (en geniş ≈ 5.6)
      const w = Math.min(5.4, 2.7 + R() * (1.5 + 1.4 * prog * M.gap));
      gaps.push({ x0: x, x1: x + w });
      x += w;
      const dy = y < -2.5 ? 1.2 : (R() < 0.5 ? 0 : (R() < 0.5 ? 1.2 : -1.2));
      const p = { x0: x, x1: x + 10 + R() * 5, y: clamp(y + dy, -6, 5) };
      plats.push(p); x = p.x1; y = p.y;
      fillObstacles({ ...p, x0: p.x0 + 2 }, 0.5 * M.obst);
    } else if (r < pStep) {
      // basamak: yükseklik değişir (yukarı çıkış zıplayarak)
      const dy = (y < -2.5 ? 1 : R() < 0.55 ? 1 : -1) * (0.7 + R() * 0.9);
      const ny = clamp(y + dy, -6, 5);
      if (ny > y + STEP) rises.push({ x, dy: ny - y });
      const p = { x0: x, x1: x + 9 + R() * 5, y: ny };
      plats.push(p); x = p.x1; y = ny;
      fillObstacles({ ...p, x0: p.x0 + 2.5 }, 0.5 * M.obst);
    } else if (r < pStep + pSlope && y > -3.4 && prog > 0.05) {
      // yokuş aşağı: pürüzsüz iniş (engelsiz); hayvanın pasifine göre hızlı/yavaş geçilir
      const len = 16 + R() * 9, ny = Math.max(-6, y - len * (0.17 + R() * 0.08));
      plats.push({ x0: x, x1: x + len, y, y1: ny }); x += len; y = ny;
    } else {
      const p = { x0: x, x1: x + 11 + R() * 7, y };
      plats.push(p); x = p.x1;
      fillObstacles(p, (0.55 + 0.35 * prog) * M.obst);
    }
  }
  addPlat(END - x + 70, y); // bitiş düzlüğü (engelsiz), bitiş çizgisinin ötesine uzanır
  // Kuyuları platformlara işle: platform bölünür, ortası PIT_D kadar çukur olur
  for (const pit of pits.sort((a, b) => a.x0 - b.x0)) {
    const k = plats.findIndex((q) => q.y1 === undefined && pit.x0 >= q.x0 && pit.x1 <= q.x1);
    if (k < 0) continue;
    const q = plats[k];
    plats.splice(k, 1, { x0: q.x0, x1: pit.x0, y: q.y }, { x0: pit.x0, x1: pit.x1, y: q.y - PIT_D, pit: true }, { x0: pit.x1, x1: q.x1, y: q.y });
  }
  const goodPits = pits.filter((pt) => plats.some((q) => q.pit && q.x0 === pt.x0));
  pits.length = 0; pits.push(...goodPits);
  const hazards = [...obst.map((o) => ({ a: o.x - 3, b: o.x + o.w + 3 })), ...gaps.map((g) => ({ a: g.x0 - 3, b: g.x1 + 3 })), ...pits.map((pt) => ({ a: pt.x0 - 3, b: pt.x1 + 3 }))];
  const free = (a, b) => !hazards.some((h) => a < h.b && b > h.a);
  const flatAt = (px, w) => inPlat(plats, px - w) && inPlat(plats, px + w) && groundOf(plats, px - w) === groundOf(plats, px + w) && groundOf(plats, px) === groundOf(plats, px + w) && !plats.some((q) => (q.y1 !== undefined || q.pit) && q.x1 > px - w - 0.5 && q.x0 < px + w + 0.5);
  const reserve = (a, b) => hazards.push({ a, b });
  // Trambolin ve hız pedi: ana yolda, engel/çukur/kuyu/yokuştan uzakta
  const scatter = (every, jitter, w, list, kind) => {
    for (let px = 55 + R() * 20; px < END - 40; px += every + R() * jitter) {
      let c = px;
      for (let k = 0; k < 10 && !(free(c - w, c + w) && flatAt(c, w + 2)); k++) c += 2;
      if (c > END - 36 || !(free(c - w, c + w) && flatAt(c, w + 2))) continue;
      list.push({ x: c, w: w * 2, y: groundOf(plats, c) });
      reserve(c - w - 1.5, c + w + 1.5);
    }
  };
  scatter(120 / M.tramp, 60, 0.8, tramps, 'tramp');
  scatter(95 / M.pad, 50, 1.3, pads, 'pad');
  // Güçlendirme kutuları: ~44 birimde bir; alt (koşarken) ve üst (zıplayarak) kutu. Engel/çukur/kenara yakın değil.
  for (let bx = 40; bx < END - 30; bx += 40 + R() * 14) {
    let px = bx;
    for (let k = 0; k < 14 && !(free(px - 1, px + 1) && inPlat(plats, px - 3) && inPlat(plats, px + 3)); k++) px += 2;
    if (px > END - 24 || !(free(px - 1, px + 1) && inPlat(plats, px - 3) && inPlat(plats, px + 3))) continue;
    const g = groundOf(plats, px);
    boxes.push({ x: px, y: g + 0.75 }, { x: px, y: g + 2.3 });
  }
  // Üst katlar: ana yolun 2.4 / 4.8 / 7.2 birim üstünde yüzen platformlar (tek yönlü: üstüne inilir, ama altından zıplayınca kafa tavana çarpar).
  // Gökyüzü yolları: 5.8 birim yukarıda, yalnızca trambolinle çıkılır. Asılı engelin olduğu yere konmaz.
  const up = [];
  const barNear = (a, b) => obst.some((o) => o.k === 'bar' && o.x < b + 1.5 && o.x + o.w > a - 1.5);
  const mainMax = (a, b) => plats.filter((p) => p.x1 > a && p.x0 < b).reduce((m, p) => Math.max(m, p.y, p.y1 === undefined ? -99 : p.y1), -99);
  for (const z of zones) {
    const a = z.a, b = z.b, len = b - a;
    const y1 = mainMax(a, b) + TIER_DY;
    up.push({ x0: a, x1: b, y: y1, t: 1 });
    boxes.push({ x: a + len * 0.3, y: y1 + 0.75 }, { x: a + len * 0.75, y: y1 + 0.75 });
    if (R() < 0.6) { // ikinci kat (birinci katın üstünden çift zıplamayla)
      const a2 = a + 7, b2 = b - 7;
      up.push({ x0: a2, x1: b2, y: y1 + TIER_DY, t: 2 });
      boxes.push({ x: (a2 + b2) / 2, y: y1 + TIER_DY + 0.75 });
      if (len > 34 && R() < 0.6) { // üçüncü kat
        up.push({ x0: a2 + 4, x1: b2 - 4, y: y1 + 2 * TIER_DY, t: 3 });
        boxes.push({ x: (a2 + b2) / 2, y: y1 + 2 * TIER_DY + 0.75 });
      }
    }
  }
  // gökyüzü yolu: trambolin → yüksek platform (çok kutu)
  for (let sx = 120 + R() * 40; sx < END - 130; sx += 150 + R() * 70) {
    const tx = sx;
    if (!(free(tx - 1, tx + 1) && flatAt(tx, 3))) continue;
    const gy = groundOf(plats, tx), a = tx + 4.8, len = 20 + R() * 8, b = a + len;
    if (barNear(a - 2, b + 2) || b > END - 50) continue;
    const sy = mainMax(tx, b) + 5.8;
    tramps.push({ x: tx, w: 1.6, y: gy, sky: true });
    reserve(tx - 2.5, tx + 2.5);
    up.push({ x0: a, x1: b, y: sy, t: 4 });
    boxes.push({ x: a + len * 0.25, y: sy + 0.75 }, { x: a + len * 0.55, y: sy + 0.75 }, { x: a + len * 0.85, y: sy + 0.75 });
  }
  boxes.sort((p, q) => p.x - q.x);
  up.sort((p, q) => p.x0 - q.x0);
  tramps.sort((p, q) => p.x - q.x);
  pads.sort((p, q) => p.x - q.x);
  const track = { map: M.id, seed, len: END, plats, up, obst, boxes, gaps, rises, pits, tramps, pads, finishX: END };
  CACHE.set(key, track);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value);
  return track;
}
// kuyuya (yerdeki çukur) yakın mı: kuyunun duvarı koşucuyu yaralamaz
function pitNear(tr, x) { return !!(tr.pits && tr.pits.some((pt) => x > pt.x0 - 1.0 && x < pt.x1 + 1.0)); }
// x'te yokuş (platY eğimli) mü
function onSlope(tr, x) { for (const p of tr.plats) if (x >= p.x0 && x < p.x1) return p.y1 !== undefined; return false; }
function inPlat(plats, x) { for (const p of plats) if (x >= p.x0 && x < p.x1) return true; return false; }
function groundOf(plats, x) { for (const p of plats) if (x >= p.x0 && x < p.x1) return platY(p, x); return null; }
export const groundAt = (track, x) => groundOf(track.plats, x);
// ayak aralığındaki en yüksek zemin (kenarda bir ayak boşluktaysa diğeri taşır). Yalnızca ana yol.
function footGround(track, x) {
  const a = groundOf(track.plats, x - RUN_W / 2 + 0.12), b = groundOf(track.plats, x + RUN_W / 2 - 0.12);
  return a === null ? b : b === null ? a : Math.max(a, b);
}
// Ana yol + üst katlar: yüksekliği maxY'yi geçmeyen en yüksek yüzey (üst katlar tek yönlü: yandan duvar olmaz)
function surfaceAt(track, x, maxY) {
  let best = null;
  for (const p of track.plats) { if (x >= p.x0 && x < p.x1) { const py = platY(p, x); if (py <= maxY && (best === null || py > best)) best = py; } }
  for (const p of track.up) { if (p.x0 > x) break; if (x < p.x1 && p.y <= maxY && (best === null || p.y > best)) best = p.y; }
  return best;
}
function footSurface(track, x, maxY) {
  const a = surfaceAt(track, x - RUN_W / 2 + 0.12, maxY), b = surfaceAt(track, x + RUN_W / 2 - 0.12, maxY);
  return a === null ? b : b === null ? a : Math.max(a, b);
}
// x'ten ileriye ilk zemin başlangıcı (çukur sonrası iniş yeri); zemin yoksa null
export function nextGroundX(track, x) { for (const p of track.plats) if (p.x1 > x) return Math.max(p.x0, x); return null; }

// ---------- Simülasyon ----------
// racers: [{ id, bot, animal, skill? }] → sim. Sıra: LANES'e göre derinlik atanır.
export function createSim(arg, g) {
  // createSim({ map, seed, racers })  → bağımsız mod;  createSim([{ id, bot }], g)  → turnuva (hayvanlar sıraya göre atanır, harita/tohum g'den)
  let { map = 'orman', seed, racers } = Array.isArray(arg) ? { map: g && g.map, seed: g && g.seed, racers: arg.map((p, i) => ({ ...p, animal: (g && g.animals && g.animals[p.id]) || p.animal || ANIMAL_IDS[i % ANIMAL_IDS.length] })) } : arg;
  if (!MAPS[map]) map = 'orman';
  seed = (seed == null ? (Math.random() * 0x7fffffff) : seed) >>> 0;
  const track = buildTrack(map, seed);
  const R = rng(seed ^ 0x9e3779b9);
  // Başlangıç dizilimi: koşucular aynı çizgide üst üste binmesin diye x'te 0.45'er kaydırılır (sıra tohumdan karışık, herkese eşit)
  const grid = racers.map((_, i) => i).sort(() => R() - 0.5);
  const rs = racers.map((p, i) => {
    const a = ANIMALS[p.animal] || ANIMALS.tilki;
    const sx = START_X + grid[i] * 0.45;
    return {
      id: p.id, bot: !!p.bot, animal: a.id, lane: i,
      speedMul: a.speed, jumpMul: a.jump, accelMul: a.accel, down: a.down, stunMul: a.stunMul, trampMul: a.tramp, pitMul: a.pit, respMul: a.respawn, iceImm: !!a.iceImmune,
      ice: 0, gore: false, inPit: false, trampCd: 0, padT: 0,
      skill: p.bot ? (p.skill != null ? p.skill : 0.9 + R() * 0.08) : 1,
      x: sx, y: 0, vy: 0, sp: 0, grounded: true, jumps: 0, coyote: 0, slideT: 0, slideCd: 0, slamming: false, slamRec: 0,
      stun: 0, slow: 0, trap: 0, boost: 0, shield: 0, inv: 0, kb: 0, squash: 0, zapT: 0,
      fall: null, safeX: sx, touch: null, touchT: 0, item: 0, itemT: 0, done: null, finishPlace: 0, dealt: 0, hits: 0, jumpsMade: 0,
      ai: { miss: {}, slam: R() < 0.4, delay: 0.55 + R() * 0.7, seen: null },
    };
  });
  return {
    t: 0, phase: 'wait', cd: COUNTDOWN, raceT0: 0, map: track.map, seed, track, racers: rs, byId: Object.fromEntries(rs.map((r) => [r.id, r])),
    boxT: track.boxes.map(() => 0), saws: [], proj: [], traps: [], crates: [], events: [], firstDone: null, finished: 0, R,
  };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = COUNTDOWN; } };
// Oyuncu hayvanını oyun başlamadan seçer (kumanda alanı `an`); hayvanın pasif özellikleri koşucuya işlenir
export function setAnimal(sim, id, animal) {
  const r = sim.byId[id], a = ANIMALS[animal];
  if (!r || !a || (sim.phase !== 'wait' && sim.phase !== 'count')) return;
  Object.assign(r, { animal: a.id, speedMul: a.speed, jumpMul: a.jump, accelMul: a.accel, down: a.down, stunMul: a.stunMul, trampMul: a.tramp, pitMul: a.pit, respMul: a.respawn, iceImm: !!a.iceImmune });
}

const aabb = (a0, a1, b0, b1, c0, c1, d0, d1) => a0 < c1 && a1 > c0 && b0 < d1 && b1 > d0;
const dec = (r, k, dt) => { if (r[k] > 0) r[k] = Math.max(0, r[k] - dt); };

// Zarar: kalkan varsa yutar; yoksa kadar sersemler. kind: obstacle|saw|zap|trap|crate|punch|wall
function hurt(sim, r, kind, by) {
  if (r.inv > 0 || r.done !== null) return false;
  if (r.shield > 0 && kind !== 'wall') {
    r.shield = 0; r.inv = 0.6;
    sim.events.push({ e: 'block', id: r.id, kind });
    return false;
  }
  r.hits++;
  if (by && sim.byId[by] && by !== r.id) sim.byId[by].dealt++;
  // testere ve ayı kapanı: kanlar içinde parçalanır, son güvenli yerde yeniden doğar
  if (kind === 'saw' || kind === 'trap') { goreKill(sim, r, kind, by); return true; }
  if (kind === 'zap') { r.slow = FX.zap; r.stun = Math.max(r.stun, 0.3 * r.stunMul); r.zapT = FX.zap; }
  else if (kind === 'punch') { r.kb = FX.kb; r.stun = Math.max(r.stun, 0.6 * r.stunMul); r.sp = Math.min(r.sp, 2); }
  else if (kind === 'pbox') { r.kb = FX.kbBox; r.stun = Math.max(r.stun, 0.45 * r.stunMul); r.sp = Math.min(r.sp, 2); }
  else if (kind === 'wall') { r.stun = Math.max(r.stun, 0.55 * r.stunMul); r.sp = 0; }
  else { r.stun = Math.max(r.stun, (kind === 'obstacle' ? 0.5 : FX.stun) * r.stunMul); r.sp = Math.min(r.sp, 1.5); if (r.grounded) { r.vy = 5; r.grounded = false; } }
  r.inv = kind === 'zap' ? 0.4 : kind === 'obstacle' ? 1.0 : 0.7;
  r.slideT = 0; r.slamming = false; r.ai.miss = {};
  sim.events.push({ e: 'hit', id: r.id, kind, by: by || null });
  return true;
}

// Ölüm (parçalanma): kısa süre görünmez, sonra son güvenli yerde dokunulmazlıkla doğar. Kalkan/dokunulmazlık hurt() içinde ayıklanır.
function goreKill(sim, r, kind, by) {
  r.deathX = r.x; r.deathY = r.y;
  r.fall = 0; r.gore = true; r.vy = 0; r.sp = 0; r.slideT = 0; r.slamming = false; r.stun = 0; r.trap = 0; r.ice = 0; r.boost = 0; r.slow = 0;
  sim.events.push({ e: 'gore', id: r.id, kind, by: by || null, x: r.x, y: r.y });
}

function rankOf(sim, r) { return sim.racers.filter((o) => o.done === null ? (r.done !== null ? false : o.x > r.x) : (r.done === null ? true : o.done < r.done)).length + 1; }
const leaderX = (sim) => sim.racers.reduce((m, o) => Math.max(m, o.x), 0);

// Hedef: önümüzdeki en yakın koşucu (en fazla maxD uzakta); hayalet/bitirmiş değil
function targetAhead(sim, r, maxD) {
  let best = null, bd = Infinity;
  for (const o of sim.racers) {
    if (o === r || o.fall !== null || o.done !== null) continue;
    const d = o.x - r.x;
    if (d > 0.3 && d < bd && d <= maxD) { bd = d; best = o; }
  }
  return best;
}

function rollItem(sim, r) {
  const lead = rankOf(sim, r) === 1, n = sim.racers.length;
  const back = (rankOf(sim, r) - 1) / Math.max(1, n - 1);
  // [saw, zap, trap, boost, shield, crate, punch, meteor, yumruk kutusu, buz]; lider ileriye saldıramaz (hedef yok).
  // Gerideki kalkan almaz: nitro ve ☄️ meteor (öndekileri düşürür) şansı sıralamayla artar.
  const w = lead ? [0, 0, 1.3, 1, 1.3, 0, 0, 0, 1.0, 1.0] : [1.2, 1.0, 0.7, 0.7 + back * 2.6, 0.9 * (1 - back) * (1 - back), 0.9, 0.8, back * back * 2.4 + (back > 0.3 ? 0.4 : 0), 0.8, 0.8];
  let x = sim.R() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i + 1; }
  return 4;
}

// Sandık için güvenli yer: platformun içinde (başından ≥ 3.2, sonundan ≥ 5), başka engelden/sandıktan uzak. x0'dan itibaren ileriye 10 birim tarar.
function safeCrateX(sim, x0) {
  const tr = sim.track;
  for (let sh = 0; sh <= 10; sh++) {
    const cx = x0 + sh, p = tr.plats.find((q) => cx >= q.x0 && cx < q.x1);
    if (!p || cx - p.x0 < 3.2 || p.x1 - (cx + 1.1) < 5.0) continue;
    if (tr.obst.some((o) => o.x < cx + 1.1 + 3.2 && o.x + o.w > cx - 3.2)) continue;
    if (sim.crates.some((c) => Math.abs(c.x - cx) < 6)) continue;
    return cx;
  }
  return null;
}
// Eldeki güç elinden fırlatılır: yön f (ileri/sağ), b (geri/sol), u (yukarı), d (aşağı). Kendine olanlar (nitro, kalkan) yöne bakmaz.
export const THROW = { f: (sp) => ({ vx: 13 + sp * 0.6, vy: 4 }), b: () => ({ vx: -12, vy: 3.5 }), u: (sp) => ({ vx: 2 + sp * 0.4, vy: 15 }), d: (sp) => ({ vx: 0.5 * sp, vy: -4 }) };
export const PROJ_G = G * 0.8;
export const hand = (r, dir) => ({ x: r.x + (dir === 'b' ? -0.5 : 0.5), y: r.y + 0.95 });
function throwObj(sim, r, k, dir) {
  const v = (THROW[dir] || THROW.f)(Math.max(0, r.sp)), h = hand(r, dir);
  sim.proj.push({ k, by: r.id, x: h.x, y: h.y, vx: v.vx, vy: v.vy, age: 0 });
}
function shootRay(sim, r, k, dir) {            // doğrusal giden hızlı mermi: şok / eldiven
  const sp = k === 'zap' ? 48 : 26, vx = dir === 'b' ? -sp : dir === 'f' ? sp : 0, vy = dir === 'u' ? sp : dir === 'd' ? -sp : 0, h = hand(r, dir);
  sim.proj.push({ k, by: r.id, x: h.x, y: h.y, vx, vy, age: 0, range: k === 'zap' ? 45 : 14, x0: h.x, y0: h.y });
}
function useItem(sim, r, dir = 'f') {
  const it = r.item;
  if (!it || r.fall !== null || r.stun > 0 || r.trap > 0 || r.ice > 0) return;
  if (!THROW[dir]) dir = 'f';
  const tr = sim.track;
  if (it === 1) {
    // testere: elden çıkar; ileri/geri yuvarlanır, yukarı atılırsa kavis çizer, aşağı atılırsa önünde yere düşer
    const v = (THROW[dir])(Math.max(0, r.sp)), h = hand(r, dir);
    sim.saws.push({ by: r.id, x: h.x, y: h.y, vx: dir === 'b' ? -SAW_V : dir === 'u' ? SAW_V * 0.6 : dir === 'd' ? SAW_V * 0.5 : SAW_V, vy: dir === 'u' ? 15 : dir === 'd' ? -3 : 3, air: true, life: SAW_LIFE, dir });
    sim.events.push({ e: 'sawFire', id: r.id, dir });
  } else if (it === 3 || it === 9 || it === 10 || it === 6) {
    throwObj(sim, r, it === 3 ? 'trap' : it === 9 ? 'pbox' : it === 10 ? 'ice' : 'crate', dir);
    sim.events.push({ e: 'throw', id: r.id, item: it, dir });
  } else if (it === 4) r.boost = FX.boost;
  else if (it === 5) r.shield = FX.shield;
  else if (it === 2 || it === 7) { shootRay(sim, r, it === 2 ? 'zap' : 'glove', dir); sim.events.push({ e: 'throw', id: r.id, item: it, dir }); }
  else if (it === 8) {
    // Meteor: ileri atılırsa önündekiler, geri atılırsa arkadakiler yere çöker ve olduğu yerde yeniden doğar; kalkan tek meteoru yutar
    const hit = [], back = dir === 'b';
    for (const o of sim.racers) {
      if (o === r || o.fall !== null || o.done !== null) continue;
      if (back ? !(o.x < r.x - 0.3 && o.x > r.x - 80) : !(o.x > r.x + 0.3 && o.x < r.x + 80)) continue;
      if (o.inv > 0) continue;
      if (o.shield > 0) { o.shield = 0; o.inv = 0.6; sim.events.push({ e: 'block', id: o.id, kind: 'meteor' }); continue; }
      o.fall = 0; o.vy = Math.min(o.vy, 0); o.slideT = 0; o.slamming = false; o.stun = 0; o.trap = 0; o.hits++; r.dealt++; o.deathX = o.x; o.deathY = o.y;
      hit.push(o.id);
    }
    if (!hit.length) { sim.events.push({ e: 'noTarget', id: r.id, item: it }); return; }
    sim.events.push({ e: 'meteor', id: r.id, to: hit });
  }
  r.item = 0; r.itemT = 0;
  sim.events.push({ e: 'use', id: r.id, item: it, dir });
}

// Havadaki güçler: yere inince kalıcı nesneye dönüşür (kapan, yumruk kutusu, buz, sandık); şok/eldiven doğrusal gider ve ilk koşucuya çarpar
function stepProj(sim, dt) {
  const tr = sim.track, keep = [];
  for (const p of sim.proj) {
    p.age += dt;
    const ray = p.k === 'zap' || p.k === 'glove';
    if (!ray) p.vy -= G * 0.8 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (ray) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > p.range) continue;
      let hit = null;
      for (const o of sim.racers) {
        if (o.id === p.by || o.fall !== null || o.done !== null) continue;
        if (aabb(p.x - 0.3, p.x + 0.3, p.y - 0.3, p.y + 0.3, o.x - RUN_W / 2 - 0.15, o.x + RUN_W / 2 + 0.15, o.y - 0.1, o.y + RUN_H + 0.1)) { hit = o; break; }
      }
      if (hit) {
        if (p.k === 'zap') { sim.events.push({ e: 'zap', id: p.by, to: hit.id }); hurt(sim, hit, 'zap', p.by); }
        else { sim.events.push({ e: 'punch', id: p.by, to: hit.id }); hurt(sim, hit, 'punch', p.by); }
        continue;
      }
      // şok yere/engele değmeden süzülür; sınırlar dışına çıkarsa kaybolur
      if (p.x < -10 || p.x > tr.finishX + 40 || p.y < FALL_Y) continue;
      keep.push(p); continue;
    }
    if (p.y < FALL_Y || p.x < -5 || p.x > tr.finishX + 30 || p.age > 8) continue;
    const sf = surfaceAt(tr, p.x, p.y + 0.35);
    if (p.vy <= 0 && sf !== null && p.y <= sf + 0.08) {
      if (p.k === 'crate') {
        sim.crates.push({ k: 'crate', x: p.x - 0.55, w: 1.1, y0: sf, y1: sf + 1.2, life: CRATE_LIFE, by: p.by, tmp: true });
        sim.events.push({ e: 'crateSpawn', id: p.by, to: null, x: p.x });
      } else {
        sim.traps.push({ by: p.by, kind: p.k, x: p.x, y: sf, life: TRAP_LIFE, age: 0 });
        while (sim.traps.length > TRAP_MAX) sim.traps.shift();
        sim.events.push({ e: 'trapSet', id: p.by, x: p.x, kind: p.k });
      }
      continue;
    }
    keep.push(p);
  }
  sim.proj = keep;
}

function doJump(sim, r) {
  if (r.grounded || r.coyote > 0) {
    r.vy = JUMP_V * r.jumpMul * (r.inPit ? r.pitMul : 1); r.grounded = false; r.jumps = 1; r.coyote = 0; r.slideT = 0; r.jumpsMade++;
    sim.events.push({ e: 'jump', id: r.id });
  } else if (r.jumps < 2) {
    r.vy = JUMP2_V * r.jumpMul; r.jumps = 2; r.slamming = false; r.jumpsMade++;
    sim.events.push({ e: 'jump2', id: r.id });
  }
}

function stepRacer(sim, r, inp, dt) {
  const tr = sim.track;
  for (const k of ['stun', 'slow', 'trap', 'boost', 'shield', 'inv', 'kb', 'slideCd', 'slamRec', 'squash', 'zapT', 'coyote', 'ice', 'iceCd', 'trampCd', 'padT']) dec(r, k, dt);
  if (r.slideT > 0) { r.slideT = Math.max(0, r.slideT - dt); if (r.slideT === 0) r.slideCd = SLIDE_CD; }
  if (r.item) r.itemT += dt;
  if (r.touchT > 0) { r.touchT -= dt; if (r.touchT <= 0) r.touch = null; }
  // düşüyor: aşağı iner, sonra son güvenli yerde doğar
  if (r.fall !== null) {
    r.fall += dt;
    if (!r.gore) { r.vy -= G * dt; r.y += r.vy * dt; }
    if (r.fall >= (r.gore ? 1.15 : RESPAWN_T) * r.respMul) {
      // kenardan değil, platformun içinde biraz geriden doğar (hızlanmak için koşu payı)
      // öldüğü yerde doğar (zemin varsa); boşluğa düşmüşse son güvenli yerden biraz geriden
      let sx = r.safeX, g = null;
      if (r.deathX !== undefined && r.deathX !== null && footGround(tr, r.deathX) !== null && !pitNear(tr, r.deathX)) { sx = r.deathX; g = footSurface(tr, sx, (r.deathY ?? 0) + 0.6); }
      else { const pl = tr.plats.find((q) => sx >= q.x0 && sx < q.x1); if (pl) sx = Math.max(pl.x0 + 0.9, sx - 7); }
      r.deathX = null;
      if (g === null) g = footGround(tr, sx) ?? 0;
      r.x = sx; r.y = g; r.vy = 0; r.sp = 0; r.grounded = true; r.jumps = 0; r.fall = null; r.inv = INV_T + (r.respMul < 1 ? 1.0 : 0); r.stun = 0; r.trap = 0; r.slow = 0; r.ice = 0; r.gore = false;
      r.ai.miss = {}; // bot yeni bir deneme yapar (aynı hatayı tekrarlamaz)
      sim.events.push({ e: 'respawn', id: r.id, x: r.x });
    }
    return;
  }
  const racing = sim.phase === 'race' && r.done === null;
  const free = racing && r.stun <= 0 && r.trap <= 0;
  const acts = free && r.ice <= 0;                            // buzdayken zıplama/kayma/güç kullanma çalışmaz
  if (racing && acts && inp.item) useItem(sim, r, inp.dir || 'f');
  if (acts && inp.jump) doJump(sim, r);
  if (acts && inp.slide) {
    if (!r.grounded && r.coyote <= 0) {                       // havada: hızlıca yere çak
      if (!r.slamming) { r.slamming = true; r.vy = SLAM_V; sim.events.push({ e: 'slam', id: r.id }); }
    } else if (r.slideCd <= 0 && r.slideT <= 0) { r.slideT = SLIDE_T; sim.events.push({ e: 'slide', id: r.id }); }
  }
  // hız
  const lead = leaderX(sim), gap = lead - r.x;
  const rubber = 1 + clamp(gap / 70, 0, 1) * 0.1; // geride kalan biraz hızlanır: yarışa geri döner
  let target = racing ? BASE_V * r.speedMul * (r.bot ? r.skill : 1) * rubber : 0;
  if (r.done !== null) target = 0;
  if (r.boost > 0) target *= 1.75;
  if (r.slow > 0) target *= 0.45;
  if (r.slideT > 0) target *= r.animal === 'penguen' ? 1.18 : 1.06;
  if (r.slamRec > 0) target *= 0.6;
  if (r.grounded && racing && onSlope(tr, r.x)) target *= r.down;     // yokuş aşağı: hayvanın pasif gücüne göre hızlı/yavaş
  if (r.padT > 0) target *= 1.55;
  if (r.stun > 0) target = 0; // sersemlerken durur (engelin içine sürünüp tekrar vurulmasın)
  if (r.trap > 0) target = 0;
  const acc = ACCEL * r.accelMul;
  r.sp += clamp(target - r.sp, -DECEL * dt, acc * dt);
  const prevX = r.x;
  r.x += (r.sp - (r.kb > 0 ? 14 : 0)) * dt;
  if (r.done !== null) r.x = Math.min(r.x, tr.finishX + 16);
  // dikey hareket ve zemin
  const standing = r.slideT > 0;
  if (r.grounded) {
    r.safeX = Math.max(r.safeX, 0);
    const gm = footGround(tr, r.x), g = footSurface(tr, r.x, r.y + STEP);
    if (gm !== null && gm - r.y > STEP) {
      r.x = wallEdge(tr, prevX, r.x); r.sp = 0;
      if (!pitNear(tr, prevX)) { r.sp = 0; sim.events.push({ e: 'wall', id: r.id }); }   // kuyunun duvarı vurmaz: sadece takılır, zıplayıp çıkılır
    }
    else if (g === null) { r.grounded = false; r.vy = 0; r.coyote = 0.1; }
    else if (r.y - g > STEP) { r.grounded = false; r.vy = 0; r.coyote = 0.08; } // yüksek basamaktan / üst kattan iner
    else { r.y = g; }
    if (r.grounded && r.y - (groundOf(tr.plats, r.x) ?? -99) < 0.2 && groundOf(tr.plats, r.x - 2) !== null && groundOf(tr.plats, r.x + 1) !== null) r.safeX = r.x - 1.5;
  }
  if (!r.grounded) {
    const py = r.y;
    r.vy -= G * dt; r.y += r.vy * dt;
    // tavan: üst platformların altından zıplarken kafa çarpar, geri düşersin
    if (r.vy > 0 && tr.up.length) {
      const hgt = standing ? SLIDE_H : RUN_H;
      for (const u of tr.up) {
        if (u.x0 > r.x + 1) break;
        if (r.x + RUN_W / 2 - 0.1 < u.x0 || r.x - RUN_W / 2 + 0.1 > u.x1) continue;
        const bottom = u.y - UP_THICK;
        if (py + hgt <= bottom + 0.05 && r.y + hgt > bottom) { r.y = bottom - hgt; r.vy = 0; r.jumps = Math.max(r.jumps, 1); sim.events.push({ e: 'head', id: r.id }); break; }
      }
    }
    const gm = footGround(tr, r.x);
    const g = footSurface(tr, r.x, py + STEP);        // önceki karede ayakların (en çok basamak kadar) altında/yanında kalan yüzeyler
    if (gm !== null && r.y < gm && gm - py > STEP) { r.x = wallEdge(tr, prevX, r.x); r.sp = 0; if (!pitNear(tr, prevX)) { r.sp = 0; sim.events.push({ e: 'wall', id: r.id }); } } // platformun yan yüzüne çarptı
    else if (g !== null) {
      if (r.vy <= 0 && py >= g - 0.05 && r.y <= g) { // iniş (yüksek hızda zemini atlamaz: önceki kare zeminin üstündeydi)
        const hard = r.slamming, impact = -r.vy;
        r.y = g; r.vy = 0; r.grounded = true; r.jumps = 0; r.squash = hard ? 0.28 : 0.14;
        if (hard) { r.slamRec = 0.28; r.slamming = false; slamWave(sim, r); }
        sim.events.push({ e: 'land', id: r.id, hard, impact });
      } else if (r.y < g && g === gm) { r.y = g; r.vy = Math.max(r.vy, 0); r.grounded = true; r.jumps = 0; } // kenara tutundu: basamağa çıktı (üst katlara yalnızca üstten inilir)
    }
    if (r.y < FALL_Y) { r.fall = 0; r.slamming = false; sim.events.push({ e: 'fall', id: r.id, x: r.x }); return; }
  }
  // kuyuda mı? (takılır; zıplayarak çıkılır)
  const wasPit = r.inPit;
  r.inPit = !!(r.grounded && tr.pits && tr.pits.some((pt) => r.x > pt.x0 - 0.15 && r.x < pt.x1 + 0.15 && r.y < (groundOf(tr.plats, pt.x1 + 0.1) ?? 0) - 0.3));
  if (r.inPit && !wasPit) sim.events.push({ e: 'stuck', id: r.id });
  // trambolin ve hız pedi (yerdeki koşucuya)
  if (r.grounded && racing) {
    for (const tp of tr.tramps || []) {
      if (tp.x > r.x + 2.5) break;
      if (Math.abs(r.x - tp.x) < tp.w / 2 + 0.15 && Math.abs(r.y - (tp.y ?? 0)) < 0.7 && r.trampCd <= 0) {
        r.vy = TRAMP_V * r.trampMul; r.grounded = false; r.jumps = 1; r.coyote = 0; r.trampCd = 0.5; r.squash = 0.2; r.slideT = 0;
        sim.events.push({ e: 'tramp', id: r.id, x: tp.x });
        break;
      }
    }
    for (const pd of tr.pads || []) {
      if (pd.x > r.x + 2.5) break;
      if (Math.abs(r.x - pd.x) < pd.w / 2 && Math.abs(r.y - (pd.y ?? 0)) < 0.7) { if (r.padT < 0.3) sim.events.push({ e: 'pad', id: r.id, x: pd.x }); r.padT = PAD_BOOST; break; }
    }
  }
  // engeller
  if (r.inv <= 0 && r.done === null) {
    const top = r.y + (standing ? SLIDE_H : RUN_H) - 0.05, bot = r.y + 0.02, x0 = r.x - RUN_W / 2 + 0.06, x1 = r.x + RUN_W / 2 - 0.06;
    for (const o of tr.obst) {
      if (o.x > r.x + 2) break;
      if (o.x + o.w < r.x - 2) continue;
      if (aabb(x0, x1, bot, top, o.x, o.x + o.w, o.y0, o.y1)) {
        solid(sim, r, o); // kutu / diken / kütük: duvar gibi, çarpıp durur (ölmez, sersemlemez, tekrar tekrar vurulmaz)
        break;
      }
    }
    for (const o of sim.crates) {
      if (o.life > 0 && aabb(x0, x1, bot, top, o.x, o.x + o.w, o.y0, o.y1)) {
        if (r.shield > 0) { r.shield = 0; r.inv = 0.6; o.life = 0; sim.events.push({ e: 'block', id: r.id, kind: 'crate' }); } // kalkan sandığı kırar
        else { solid(sim, r, o); if (!o.hit && o.by !== r.id) { o.hit = true; if (sim.byId[o.by]) sim.byId[o.by].dealt++; } }
        break;
      }
    }
    for (const tp of sim.traps) {
      if (tp.life <= 0 || (tp.by === r.id && tp.age < 1.5)) continue;
      if (aabb(x0, x1, bot, top, tp.x - 0.5, tp.x + 0.5, tp.y, tp.y + 0.45)) {
        if (tp.kind === 'ice') {
          if (!r.iceImm && r.ice <= 0 && !(r.iceCd > 0)) { r.ice = FX.ice; r.iceCd = FX.ice + 2.5; sim.events.push({ e: 'iced', id: r.id, by: tp.by, x: tp.x }); if (tp.by && sim.byId[tp.by] && tp.by !== r.id) sim.byId[tp.by].dealt++; }
          break;
        }
        const shielded = r.shield > 0, kind = tp.kind === 'pbox' ? 'pbox' : 'trap';
        if (hurt(sim, r, kind, tp.by) || shielded) { tp.life = 0; sim.events.push({ e: kind === 'pbox' ? 'pboxHit' : 'trapSnap', id: r.id, x: tp.x, by: tp.by }); }
        break;
      }
    }
  }
  // güçlendirme kutuları
  if (!r.item && r.done === null) {
    const bx0 = r.x - RUN_W / 2, bx1 = r.x + RUN_W / 2, by0 = r.y, by1 = r.y + (standing ? SLIDE_H : RUN_H);
    for (let i = 0; i < tr.boxes.length; i++) {
      if (sim.boxT[i] > 0) continue;
      const b = tr.boxes[i];
      if (b.x < r.x - 2) continue;
      if (b.x > r.x + 2) break;
      if (aabb(bx0, bx1, by0, by1, b.x - 0.45, b.x + 0.45, b.y - 0.45, b.y + 0.45)) {
        r.item = rollItem(sim, r); r.itemT = 0; sim.boxT[i] = BOX_RESPAWN;
        sim.events.push({ e: 'pickup', id: r.id, item: r.item, x: b.x, y: b.y });
        break;
      }
    }
  }
  // bitiş
  if (r.done === null && r.x >= tr.finishX) {
    r.done = sim.t; r.finishPlace = ++sim.finished;
    if (sim.firstDone === null) sim.firstDone = sim.t;
    sim.events.push({ e: 'finish', id: r.id, place: r.finishPlace });
  }
}

// Sert engel (kutu, diken, sandık, asılı kütük): koşucu içinden geçemez, önünde durur; ölmez, sersemlemez. Zıplayınca (ya da kayınca) devam eder.
function solid(sim, r, o) {
  const wasTouching = r.touch === o;
  r.x = Math.min(r.x, o.x - RUN_W / 2 + 0.05);
  r.sp = 0;
  if (!wasTouching) { r.touch = o; sim.events.push({ e: 'bump', id: r.id, kind: o.k }); }
  r.touchT = 0.12;
}
// engele çarpınca platformun kenarına geri it
function wallEdge(tr, prevX, x) {
  for (const p of tr.plats) if (p.x0 > prevX + RUN_W / 2 - 0.2 && p.x0 <= x + RUN_W / 2) return p.x0 - RUN_W / 2 - 0.02;
  return prevX;
}
// yere sert iniş: yakındaki yerdeki rakipleri kısa sersemletir
function slamWave(sim, r) {
  for (const o of sim.racers) {
    if (o === r || o.fall !== null || o.done !== null || !o.grounded || o.inv > 0) continue;
    if (Math.abs(o.x - r.x) < 2.2 && o.shield <= 0) { o.stun = Math.max(o.stun, 0.35); o.sp = Math.min(o.sp, 3); sim.events.push({ e: 'hit', id: o.id, kind: 'slam', by: r.id }); r.dealt++; o.inv = 0.5; }
  }
}

function stepSaws(sim, dt) {
  const keep = [];
  const tr = sim.track;
  for (const sw of sim.saws) {
    sw.life -= dt; sw.x += sw.vx * dt;
    if (sw.life <= 0 || sw.x > tr.finishX + 20 || sw.x < -5) continue;
    // havada (yukarı atılan ya da boşluğa taşan): yerçekimi; yerde: zemini izler
    const g = surfaceAt(tr, sw.x, sw.y + 0.3);
    if (sw.air) {
      sw.vy -= 30 * dt; sw.y += sw.vy * dt;
      if (g !== null && sw.vy <= 0 && sw.y <= g + 0.45) { sw.y = g + 0.45; sw.air = false; sw.vy = 0; sw.vx = sw.vx > 0 ? SAW_V : -SAW_V; }
      if (sw.y < FALL_Y) continue;
    } else if (g === null) { sw.air = true; sw.vy = 0; sw.life -= dt * 3; }
    else sw.y = g + 0.45;
    let hit = null;
    for (const o of sim.racers) {
      if (o.id === sw.by || o.fall !== null || o.done !== null || o.inv > 0) continue;
      if (aabb(o.x - RUN_W / 2, o.x + RUN_W / 2, o.y, o.y + (o.slideT > 0 ? SLIDE_H : RUN_H), sw.x - 0.5, sw.x + 0.5, sw.y - 0.45, sw.y + 0.45)) { hit = o; break; }
    }
    if (hit) { hurt(sim, hit, 'saw', sw.by); continue; } // çarpan testere (kalkana da) yok olur
    keep.push(sw);
  }
  sim.saws = keep;
}

// Sabit adımlı simülasyon. inputs[id] = { jump, slide, item } (tek basış). Olay listesini döndürür.
export function stepSim(sim, dt, inputs = {}) {
  sim.events = [];
  sim.t += dt;
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd);
    sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep', n: Math.ceil(sim.cd) });
    if (sim.cd <= 0) { sim.phase = 'race'; sim.raceT0 = sim.t; sim.events.push({ e: 'go' }); for (const r of sim.racers) r.boost = START_BOOST; }   // herkes otomatik hızlanarak başlar
  }
  for (const r of sim.racers) {
    let inp;
    if (r.bot) inp = botInput(sim, r, dt);
    else {
      // oda oyununda tek basış alanı `bomb` (framework her adımdan sonra sıfırlar): bit 1 zıpla, 2 kay, 4 eşya. Bağımsız modda doğrudan {jump,slide,item}.
      const raw = inputs[r.id] || {}, bits = typeof raw.bomb === 'number' ? raw.bomb : 0;
      if (raw.an && raw.an !== r.animal && (sim.phase === 'wait' || sim.phase === 'count')) setAnimal(sim, r.id, raw.an);
      inp = { jump: !!raw.jump || !!(bits & 1), slide: !!raw.slide || !!(bits & 2), item: !!raw.item || !!(bits & 4), dir: bits & 16 ? 'u' : bits & 32 ? 'd' : bits & 8 ? 'b' : 'f' };
    }
    stepRacer(sim, r, inp, dt);
  }
  if (sim.phase === 'race') {
    stepSaws(sim, dt);
    stepProj(sim, dt);
    for (const tp of sim.traps) { tp.life -= dt; tp.age += dt; }
    for (const c of sim.crates) c.life -= dt;
    sim.traps = sim.traps.filter((t) => t.life > 0);
    sim.crates = sim.crates.filter((c) => c.life > 0);
    for (let i = 0; i < sim.boxT.length; i++) if (sim.boxT[i] > 0) sim.boxT[i] = Math.max(0, sim.boxT[i] - dt);
    const all = sim.racers.every((r) => r.done !== null);
    if (all || (sim.firstDone !== null && sim.t - sim.firstDone > AFTER_FIRST) || sim.t - sim.raceT0 > MAX_RACE) {
      sim.phase = 'done';
      sim.events.push({ e: 'done', dnf: sim.racers.filter((r) => r.done === null).map((r) => r.id) });
    }
  }
  return sim.events;
}

// Sıralama: bitirenler bitiş zamanına göre, diğerleri ilerlemeye göre
export function standings(sim) {
  const key = (r) => (r.done !== null ? r.done - 1e6 : -r.x);
  return sim.racers.slice().sort((a, b) => key(a) - key(b)).map((r) => r.id);
}
export const placeOf = (sim, id) => standings(sim).indexOf(id) + 1;
export const rankingOf = (sim) => standings(sim).map((id) => [id]);
export const setBot = (sim, id) => { const r = sim.byId[id]; if (r) { r.bot = true; r.skill = r.skill && r.skill < 1 ? r.skill : 0.95; } };
// Yarış sonu ödülü: sıraya göre altın + isabet bonusu
export function reward(sim, id) {
  const r = sim.byId[id], place = placeOf(sim, id);
  const hitBonus = Math.min(HIT_BONUS_MAX, r.dealt * HIT_BONUS);
  return { place, prize: PRIZES[place - 1] || 10, hitBonus, total: (PRIZES[place - 1] || 10) + hitBonus, time: r.done === null ? null : r.done - sim.raceT0 };
}

// ---------- Bot yapay zekâsı ----------
// Önündeki tehlikeleri tarar: çukur (zıpla), basamak (zıpla), kutu/diken/sandık/kapan (zıpla), asılı kütük (kay).
// Beceri düşükse bazen geç tepki verir (hata yapar). Güçlendirmeleri durumuna göre kullanır.
function nextHazard(sim, r) {
  const tr = sim.track, fx = r.x + RUN_W / 2;
  let best = null;
  const consider = (k, x0, x1, extra) => { const d = x0 - fx; if (d > -0.4 && (!best || d < best.d)) best = { k, d, x0, x1, ...extra }; };
  for (const o of tr.obst) { if (o.x + o.w < r.x - 0.5) continue; if (o.x > r.x + 24) break; consider(o.k === 'bar' ? 'bar' : 'jump', o.x, o.x + o.w, { id: 'o' + o.x }); }
  for (const o of sim.crates) if (o.x + o.w > r.x - 0.5 && o.x < r.x + 24) consider('jump', o.x, o.x + o.w, { id: 'c' + o.x });
  for (const t of sim.traps) if (t.x + 0.5 > r.x - 0.5 && t.x < r.x + 24 && t.by !== r.id) consider('jump', t.x - 0.5, t.x + 0.5, { id: 't' + Math.round(t.x) });
  for (const g of tr.gaps) { if (g.x1 < r.x - 0.5) continue; if (g.x0 > r.x + 24) break; consider('gap', g.x0, g.x1, { id: 'g' + g.x0, w: g.x1 - g.x0 }); }
  for (const g of tr.pits || []) { if (g.x1 < r.x - 0.5) continue; if (g.x0 > r.x + 24) break; consider('gap', g.x0, g.x1, { id: 'p' + g.x0, w: g.x1 - g.x0 }); }
  for (const t of tr.tramps || []) { if (t.x + t.w / 2 < r.x - 0.5) continue; if (t.x - t.w / 2 > r.x + 24) break; if (Math.abs(r.y - (t.y ?? 0)) < 0.7) consider('jump', t.x - t.w / 2, t.x + t.w / 2, { id: 'tr' + Math.round(t.x) }); }
  for (const s of tr.rises) { if (s.x < r.x - 0.5) continue; if (s.x > r.x + 24) break; consider('rise', s.x, s.x + 0.5, { id: 'r' + s.x, dy: s.dy }); }
  return best;
}
// Havadaki koşucunun iniş yerini tahmin eder: { x, g (zemin yüksekliği ya da null=çukur), hazard (inişte engel/kapan var mı) }
export function predictLanding(sim, r, vy = r.vy, y = r.y) {
  const pl = sim.track.plats;
  const airT = (g) => (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * (y - g)))) / G;
  const g0 = groundOf(pl, r.x) ?? groundOf(pl, r.x + 2) ?? groundOf(pl, r.x - 2) ?? 0;
  let x = r.x + r.sp * airT(g0), g = groundOf(pl, x);
  if (g !== null && g !== g0) { x = r.x + r.sp * airT(g); g = groundOf(pl, x); }
  // yüksek bir basamağın (duvar) hemen önüne inersem artık aşacak zıplama mesafesi kalmaz: ölü bölge
  const wall = sim.track.rises.some((q) => x > q.x - 1.7 && x < q.x);
  const hazard = g !== null && (wall || hazardNear({ track: sim.track, crates: sim.crates, traps: sim.traps }, { x }, -0.3, 0.3, true));
  return { x, g, hazard };
}
// Koşucunun (geriden -back, ileriden +ahead) aralığında yerde engel/sandık/kapan var mı
function hazardNear(sim, r, back, ahead, groundOnly = false) {
  const a = r.x + back, b = r.x + ahead;
  for (const o of sim.track.obst) { if (o.x > b) break; if (o.x + o.w > a && !(groundOnly && o.k === 'bar')) return true; }
  for (const o of sim.crates) if (o.x + o.w > a && o.x < b) return true;
  for (const t of sim.traps) if (t.x + 0.5 > a && t.x - 0.5 < b) return true;
  for (const t of sim.track.tramps || []) if (t.x + t.w / 2 > a && t.x - t.w / 2 < b) return true;
  for (const t of sim.track.pits || []) if (t.x1 > a && t.x0 < b) return true;
  return false;
}
export function botInput(sim, r, dt) {
  const out = {};
  if (r.fall !== null || r.done !== null || sim.phase !== 'race') return out;
  if (r.stun > 0 || r.trap > 0 || r.ice > 0) return out;
  if (r.inPit && r.grounded) { out.jump = true; return out; }       // kuyuya takıldı: zıplayıp çık
  const hz = nextHazard(sim, r);
  const sp = Math.max(4, r.sp);
  const wantMiss = (h) => {
    if (r.ai.miss[h.id] === undefined) r.ai.miss[h.id] = sim.R() < (1 - r.skill) * 1.7;
    return r.ai.miss[h.id];
  };
  if (hz) {
    const late = wantMiss(hz) ? 0.7 : 1; // hata: çok geç (çarpar)
    if (hz.k === 'gap') {
      if (r.grounded && hz.d <= (0.75 + 0.12 * (sp / BASE_V)) * late) out.jump = true;
    } else if (hz.k === 'rise') {
      if (r.grounded && hz.d <= 1.7 * late) out.jump = true;
    } else if (hz.k === 'jump') {
      // Şimdi zıplarsam nereye inerim? İniş güvenli (çukur/engel değil) ve bu engelin ötesindeyse zıpla; değilse biraz bekle.
      // Son an (d ≤ 1.0) ya da hata (d ≤ 0.35) gelince yine de zıplar.
      if (r.grounded && hz.d > -0.3) {
        const L = predictLanding(sim, r, JUMP_V * r.jumpMul, r.y);
        const clears = L.x >= hz.x1 + 0.3, safe = L.g !== null && !L.hazard;
        const lastD = wantMiss(hz) ? 0.35 : 1.0;
        if ((clears && safe && hz.d >= 0.9 && hz.d <= 4.3) || hz.d <= lastD) out.jump = true;
      }
    } else if (hz.k === 'bar') {
      if (r.grounded && hz.d <= 2.3 * late && r.slideCd <= 0 && r.slideT <= 0) out.slide = true;
    }
  }
  // arkadan gelen testereden kaç
  if (r.grounded && !out.jump) for (const s of sim.saws) if (s.by !== r.id && s.x < r.x && r.x - s.x < 3.6 && r.x - s.x > 0.4 && sim.R() < 0.7) { out.jump = true; break; }
  // asılı kütüğün altından kayarken ya da kütüğün hemen önündeyken zıplama (kafayı çarpar; kayma iptal olur)
  if (out.jump && r.grounded && (r.slideT > 0 || sim.track.obst.some((o) => o.k === 'bar' && o.x < r.x + 3.4 && o.x + o.w > r.x - 0.4))) delete out.jump;
  // havada: nereye ineceğimi tahmin et. Çukura ya da engelin üstüne inecekse ikinci zıplama (en fazla bir kez).
  let land = null;
  if (!r.grounded) {
    land = predictLanding(sim, r);
    if (!out.jump && r.jumps < 2) {
      const unsafe = land.g === null ? (nextGroundX(sim.track, land.x) !== null && nextGroundX(sim.track, land.x) - land.x < 9) : land.hazard && r.y < 2.7;
      if (unsafe && r.vy < 4) {
        // şimdi ikinci kez zıplarsam güvenli yere inerim: zıpla. Değilse en son ana (zemine ~1 birim) kadar bekle.
        const l2 = predictLanding(sim, r, JUMP2_V * r.jumpMul, r.y);
        const groundBelow = land.g ?? groundOf(sim.track.plats, r.x) ?? 0;
        // son çare: ikinci zıplama da zemine götürüyorsa (çukura değil) atla; dikene basmak çukura düşmekten ucuzdur
        if ((l2.g !== null && !l2.hazard) || (l2.g !== null && r.y - groundBelow < 1.0)) out.jump = true;
      }
    }
  }
  // havada, önümde 12 birim boyunca hiçbir tehlike yokken ve çakılınca zemine ineceksem bazen hızlıca yere çak (süs; riskli durumda asla)
  if (!r.grounded && r.ai.slam && !out.jump && r.vy < 0 && r.y > 1.4 && (!hz || hz.d > 12) && !hazardNear(sim, r, -1.4, 12)) {
    const gnow = groundOf(sim.track.plats, r.x);
    if (gnow !== null) {
      const xs = r.x + r.sp * ((r.y - gnow) / -SLAM_V);
      if (groundOf(sim.track.plats, xs) !== null && !hazardNear(sim, { x: xs }, -0.6, 0.6, true)) out.slide = true;
    }
  }
  // güçlendirme kullanımı
  if (r.item && r.itemT > r.ai.delay) {
    const ahead = (m) => targetAhead(sim, r, m);
    const behindNear = sim.racers.some((o) => o !== r && o.done === null && o.fall === null && r.x - o.x > 0 && r.x - o.x < 14);
    const safe = !hz || hz.d > 8;
    switch (r.item) {
      case 1: if (ahead(26)) out.item = true; break;
      case 2: if (ahead(32)) out.item = true; break;
      case 3: case 9: case 10: if (behindNear && r.grounded) out.item = true; break;
      case 4: if (safe && r.grounded) out.item = true; break;
      case 5: if (r.itemT > 1.4) out.item = true; break;
      case 6: if (ahead(18)) out.item = true; break;
      case 7: if (ahead(7)) out.item = true; break;
      case 8: if (ahead(60)) out.item = true; break;
    }
  }
  return out;
}

// ---------- Ağ: anlık görüntü (oda sahibi → oyuncular). readSnapshot, simülasyonla aynı alanlara sahip bir durum döndürür; istemci çizimi ikisinde de aynı çalışır ----------
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(sim) {
  return {
    t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), rt0: r2(sim.raceT0), sd: sim.seed, mp: sim.map,
    r: sim.racers.map((r) => [r.id, r2(r.x), r2(r.y), r2(r.vy), r2(r.sp), r.grounded ? 1 : 0, r.jumps, r2(r.slideT), r.slamming ? 1 : 0, r2(r.stun), r2(r.slow), r2(r.trap), r2(r.boost), r2(r.shield), r2(r.inv), r2(r.squash), r2(r.zapT), r.fall === null ? -1 : r2(r.fall), r.item, r.done === null ? -1 : r2(r.done), ANIMAL_IDS.indexOf(r.animal), r.bot ? 1 : 0, r.dealt, r2(r.ice), r.gore ? 1 : 0, r.inPit ? 1 : 0, r2(r.padT)]),
    bx: sim.boxT.map((t) => (t > 0 ? 0 : 1)).join(''),
    fd: sim.firstDone === null ? -1 : r2(sim.firstDone), pj: sim.proj.map((x) => [x.k, r2(x.x), r2(x.y), r2(x.vx), r2(x.vy)]),
    sw: sim.saws.map((x) => [r2(x.x), x.by, r2(x.y)]), tp: sim.traps.map((x) => [r2(x.x), r2(x.y), x.kind || 'trap']), cr: sim.crates.map((x) => [r2(x.x), r2(x.y0), r2(x.y1), r2(x.w), r2(x.life)]),
    ev: sim.events,
  };
}
export function readSnapshot(s) {
  const track = buildTrack(s.mp, s.sd);
  const racers = s.r.map(([id, x, y, vy, sp, g, jumps, slideT, slam, stun, slow, trap, boost, shield, inv, squash, zapT, fall, item, done, an, bot, dealt, ice, gore, inPit, padT], i) => ({
    id, x, y, vy, sp, grounded: !!g, jumps, slideT, slamming: !!slam, stun, slow, trap, boost, shield, inv, squash, zapT, fall: fall < 0 ? null : fall, item, done: done < 0 ? null : done, animal: ANIMAL_IDS[an] || 'tilki', lane: i, bot: !!bot, dealt, ice: ice || 0, gore: !!gore, inPit: !!inPit, padT: padT || 0,
  }));
  return {
    t: s.t, phase: s.ph, cd: s.cd, raceT0: s.rt0, seed: s.sd, map: s.mp, track, racers, byId: Object.fromEntries(racers.map((r) => [r.id, r])),
    firstDone: s.fd === undefined || s.fd < 0 ? null : s.fd, proj: (s.pj || []).map(([k, x, y, vx, vy]) => ({ k, x, y, vx, vy })),
    boxT: (s.bx || '').split('').map((c) => (c === '1' ? 0 : 1)), saws: (s.sw || []).map(([x, by, y]) => ({ x, by, y })), traps: (s.tp || []).map(([x, y, kind]) => ({ x, y, kind })),
    crates: (s.cr || []).map(([x, y0, y1, w, life]) => ({ x, y0, y1, w, life })), events: s.ev || [],
  };
}
