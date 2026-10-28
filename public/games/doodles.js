// Botların el çizimi karalamaları. Çizim kaydedilmez: {doodle, seed} her cihazda aynı şekilde üretilir.
// Çizgi biçimi (insan çizimleriyle aynı): [{ c: renkNo, w: kalınlıkNo, p: [x0,y0,x1,y1,...] }] koordinatlar 0..1000

export const PALETTE = ['#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7', '#ec4899', '#8b5a2b', '#9ca3af', '#ffffff'];
export const WIDTHS = [6, 14, 28, 60, 110]; // 0-3 kalem, silgi 1-4 (4 = en büyük silgi)

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Çizim yardımcıları (titrek el etkisiyle)
function pen(R) {
  const strokes = [];
  const j = (v, k = 9) => Math.round(v + (R() - 0.5) * k);
  const api = {
    line(pts, c = 0, w = 1) { strokes.push({ c, w, p: pts.flatMap(([x, y]) => [j(x), j(y)]) }); return api; },
    circle(cx, cy, r, c = 0, w = 1, from = 0, to = Math.PI * 2) {
      const n = Math.max(10, Math.round(r / 7)), pts = [];
      for (let i = 0; i <= n; i++) { const a = from + (to - from) * (i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      return api.line(pts, c, w);
    },
    fill(cx, cy, r, c, w = 3) { for (let rr = r; rr > 0; rr -= WIDTHS[w] * 0.8) api.circle(cx, cy, rr, c, w); return api; },
    rect(x, y, w0, h0, c = 0, w = 1) { return api.line([[x, y], [x + w0, y], [x + w0, y + h0], [x, y + h0], [x, y]], c, w); },
    strokes,
  };
  return api;
}

const D = {
  kedi: (P) => { P.circle(500, 520, 220, 10, 1); P.line([[330, 380], [360, 220], [450, 320]], 0, 1).line([[550, 320], [640, 220], [670, 380]], 0, 1); P.circle(430, 490, 22, 4, 2).circle(570, 490, 22, 4, 2); P.line([[480, 570], [500, 590], [520, 570]], 8, 1); P.line([[300, 560], [420, 580]]).line([[300, 610], [420, 600]]).line([[580, 580], [700, 560]]).line([[580, 600], [700, 610]]); },
  köpek: (P) => { P.circle(500, 520, 210, 9, 1); P.line([[310, 360], [250, 560], [330, 520]], 9, 2).line([[690, 360], [750, 560], [670, 520]], 9, 2); P.circle(430, 490, 20, 0, 2).circle(570, 490, 20, 0, 2); P.fill(500, 590, 35, 0); P.line([[500, 620], [500, 680]], 1, 2); },
  ev: (P) => { P.rect(260, 460, 480, 360, 1, 1); P.line([[220, 470], [500, 200], [780, 470]], 9, 2); P.rect(450, 640, 100, 180, 9, 1); P.rect(310, 530, 100, 90, 6, 1).rect(590, 530, 100, 90, 6, 1); },
  güneş: (P) => { P.fill(500, 500, 150, 3); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.line([[500 + Math.cos(a) * 200, 500 + Math.sin(a) * 200], [500 + Math.cos(a) * 300, 500 + Math.sin(a) * 300]], 2, 2); } },
  araba: (P) => { P.line([[150, 620], [180, 480], [330, 470], [420, 360], [620, 360], [720, 470], [850, 500], [860, 620], [150, 620]], 1, 2); P.fill(310, 640, 70, 0, 2).fill(700, 640, 70, 0, 2); P.line([[440, 380], [430, 470], [690, 470], [610, 380], [440, 380]], 6, 1); },
  ağaç: (P) => { P.rect(450, 560, 100, 300, 9, 2); P.fill(500, 400, 230, 4, 3); },
  balık: (P) => { P.line([[200, 500], [350, 360], [600, 360], [720, 500], [600, 640], [350, 640], [200, 500]], 2, 2); P.line([[720, 500], [850, 380], [850, 620], [720, 500]], 2, 2); P.fill(320, 470, 25, 0); P.line([[420, 420], [460, 500], [420, 580]], 3, 1); },
  çiçek: (P) => { P.line([[500, 520], [500, 900]], 4, 2); P.line([[500, 720], [600, 640]], 4, 2); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.fill(500 + Math.cos(a) * 110, 400 + Math.sin(a) * 110, 70, 8, 2); } P.fill(500, 400, 60, 3, 2); },
  kalp: (P) => { const pts = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; pts.push([500 + 16 * Math.pow(Math.sin(t), 3) * 20, 470 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 20]); } P.line(pts, 1, 3); },
  yıldız: (P) => { const pts = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 140 : 330; pts.push([500 + Math.cos(a) * r, 520 + Math.sin(a) * r]); } P.line(pts, 3, 2); },
  ay: (P) => { P.circle(500, 500, 280, 3, 3, Math.PI * 0.4, Math.PI * 1.6); P.circle(620, 500, 230, 3, 2, Math.PI * 0.55, Math.PI * 1.45); P.circle(780, 220, 20, 3, 2).circle(250, 830, 16, 3, 2); },
  'gülen yüz': (P) => { P.circle(500, 500, 300, 3, 2); P.fill(400, 420, 35, 0).fill(600, 420, 35, 0); P.circle(500, 520, 170, 0, 2, 0.2 * Math.PI, 0.8 * Math.PI); },
  tekne: (P) => { P.line([[180, 600], [820, 600], [700, 750], [300, 750], [180, 600]], 9, 2); P.line([[500, 600], [500, 200]], 0, 1); P.line([[510, 220], [760, 560], [510, 560], [510, 220]], 1, 2); P.line([[100, 820], [300, 790], [500, 830], [700, 790], [900, 820]], 6, 2); },
  dağ: (P) => { P.line([[80, 800], [380, 280], [560, 560], [700, 380], [920, 800], [80, 800]], 10, 2); P.line([[310, 400], [380, 280], [450, 400], [380, 370], [310, 400]], 11, 3); P.fill(800, 180, 70, 3); },
  bulut: (P) => { P.fill(400, 400, 110, 10, 3).fill(530, 360, 130, 10, 3).fill(640, 420, 100, 10, 3); for (let i = 0; i < 6; i++) P.line([[330 + i * 70, 560], [310 + i * 70, 660]], 6, 2); },
  pizza: (P) => { P.line([[500, 180], [220, 820], [780, 820], [500, 180]], 2, 2); P.line([[220, 820], [500, 880], [780, 820]], 9, 3); for (const [x, y] of [[480, 450], [400, 650], [580, 640], [520, 740]]) P.fill(x, y, 40, 1); },
  dondurma: (P) => { P.line([[360, 480], [500, 880], [640, 480]], 9, 2); P.line([[380, 560], [600, 520]], 9, 1).line([[420, 680], [580, 640]], 9, 1); P.fill(430, 420, 100, 8, 3).fill(570, 420, 100, 11, 3); P.circle(430, 420, 100, 0, 0).circle(570, 420, 100, 0, 0); P.fill(500, 300, 90, 9, 3); },
  hayalet: (P) => { P.line([[280, 820], [280, 420], [320, 280], [500, 200], [680, 280], [720, 420], [720, 820], [640, 760], [570, 830], [500, 760], [430, 830], [360, 760], [280, 820]], 0, 2); P.fill(420, 440, 40, 0).fill(580, 440, 40, 0); P.circle(500, 590, 50, 0, 2); },
  roket: (P) => { P.line([[500, 120], [620, 320], [620, 680], [380, 680], [380, 320], [500, 120]], 10, 2); P.circle(500, 400, 60, 6, 2); P.line([[380, 560], [260, 720], [380, 680]], 1, 2).line([[620, 560], [740, 720], [620, 680]], 1, 2); P.line([[430, 700], [470, 880], [500, 760], [530, 880], [570, 700]], 2, 3); },
  'kardan adam': (P) => { P.circle(500, 700, 200, 0, 2).circle(500, 380, 140, 0, 2); P.fill(450, 350, 18, 0).fill(550, 350, 18, 0); P.line([[500, 390], [600, 410], [500, 420]], 2, 2); P.rect(400, 180, 200, 100, 0, 2); P.line([[360, 280], [640, 280]], 0, 2); P.fill(500, 640, 20, 0).fill(500, 720, 20, 0); },
  şemsiye: (P) => { P.circle(500, 480, 320, 7, 2, Math.PI, Math.PI * 2); P.line([[180, 480], [820, 480]], 7, 2); P.line([[500, 480], [500, 820], [440, 860], [400, 820]], 0, 2); for (let i = 0; i < 8; i++) P.line([[200 + i * 85, 300], [180 + i * 85, 380]], 6, 1); },
  gözlük: (P) => { P.circle(330, 500, 140, 0, 2).circle(670, 500, 140, 0, 2); P.line([[470, 480], [530, 480]], 0, 2); P.line([[190, 470], [90, 420]], 0, 2).line([[810, 470], [910, 420]], 0, 2); },
  saat: (P) => { P.circle(500, 500, 300, 0, 2); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.line([[500 + Math.cos(a) * 250, 500 + Math.sin(a) * 250], [500 + Math.cos(a) * 280, 500 + Math.sin(a) * 280]], 0, 1); } P.line([[500, 500], [500, 300]], 0, 2).line([[500, 500], [640, 560]], 1, 1); },
  elma: (P) => { P.fill(500, 560, 230, 1, 3); P.line([[500, 340], [520, 220]], 9, 2); P.line([[520, 280], [620, 220], [660, 280], [560, 300], [520, 280]], 4, 2); P.circle(420, 480, 50, 11, 1, Math.PI, Math.PI * 1.5); },
  top: (P) => { P.circle(500, 500, 280, 0, 2); const pts = []; for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; pts.push([500 + Math.cos(a) * 90, 500 + Math.sin(a) * 90]); } P.line(pts, 0, 2); P.fill(500, 500, 60, 0, 2); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; P.line([[500 + Math.cos(a) * 90, 500 + Math.sin(a) * 90], [500 + Math.cos(a) * 280, 500 + Math.sin(a) * 280]], 0, 1); } },
  balon: (P) => { P.fill(500, 380, 190, 1, 3); P.line([[500, 570], [470, 610], [530, 610], [500, 570]], 1, 1); P.line([[500, 610], [460, 700], [540, 780], [480, 900]], 0, 1); P.circle(430, 320, 40, 11, 1, Math.PI, Math.PI * 1.6); },
  mantar: (P) => { P.circle(500, 480, 300, 1, 3, Math.PI, Math.PI * 2); P.line([[200, 480], [800, 480]], 1, 2); P.fill(400, 360, 40, 11).fill(560, 300, 35, 11).fill(650, 410, 30, 11); P.rect(420, 480, 160, 300, 9, 1); },
  kelebek: (P) => { P.line([[500, 300], [500, 700]], 0, 2); P.fill(370, 400, 120, 7, 3).fill(630, 400, 120, 7, 3).fill(390, 600, 90, 8, 3).fill(610, 600, 90, 8, 3); P.line([[500, 300], [440, 200]], 0, 1).line([[500, 300], [560, 200]], 0, 1); },
  yılan: (P) => { const pts = []; for (let i = 0; i <= 40; i++) { const x = 150 + i * 17; pts.push([x, 500 + Math.sin(i / 4) * 140]); } P.line(pts, 4, 3); P.fill(830, 500 + Math.sin(10) * 140, 50, 4, 2); P.line([[870, 450], [940, 440]], 1, 1); },
  şimşek: (P) => { P.line([[580, 100], [340, 520], [500, 520], [400, 900], [700, 420], [530, 420], [640, 100], [580, 100]], 3, 2); P.fill(260, 200, 90, 10, 3).fill(360, 160, 110, 10, 3).fill(470, 200, 90, 10, 3); },
  pasta: (P) => { P.rect(250, 500, 500, 300, 8, 2); P.rect(320, 330, 360, 170, 11, 2); P.line([[250, 600], [750, 600]], 1, 2); for (const x of [400, 500, 600]) { P.line([[x, 330], [x, 230]], 6, 2); P.fill(x, 210, 18, 2); } },
  örümcek: (P) => { P.fill(500, 520, 110, 0, 3); P.fill(500, 380, 60, 0, 2); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.line([[500, 500 + i * 30], [500 + s * 220, 400 + i * 70], [500 + s * 300, 520 + i * 80]], 0, 1); P.line([[500, 320], [500, 80]], 10, 0); },
  anahtar: (P) => { P.circle(300, 500, 120, 3, 2); P.circle(300, 500, 40, 3, 1); P.line([[420, 500], [820, 500]], 3, 2); P.line([[700, 500], [700, 600]], 3, 2).line([[780, 500], [780, 580]], 3, 2); },
  bardak: (P) => { P.line([[330, 300], [380, 800], [620, 800], [670, 300]], 6, 2); P.line([[350, 450], [650, 450]], 6, 1); P.line([[480, 200], [560, 620]], 1, 2); for (const [x, y] of [[440, 560], [560, 700], [470, 720]]) P.circle(x, y, 18, 11, 1); },
  şapka: (P) => { P.line([[180, 650], [820, 650]], 0, 3); P.rect(320, 320, 360, 330, 0, 2); P.fill(500, 480, 100, 0, 3); P.line([[320, 580], [680, 580]], 1, 2); },
  kuş: (P) => { P.circle(480, 520, 170, 6, 2); P.circle(640, 400, 90, 6, 2); P.line([[720, 390], [820, 410], [720, 430]], 2, 2); P.fill(660, 380, 15, 0); P.line([[360, 500], [240, 380], [420, 440]], 6, 2); P.line([[420, 690], [400, 800]], 2, 1).line([[540, 690], [560, 800]], 2, 1); },
};

export const DOODLES = Object.keys(D);
export function drawDoodle(name, seed) {
  const R = rng(seed);
  const P = pen(R);
  (D[name] || D.kalp)(P);
  return withTiming(P.strokes);
}

// Çizimin yapılışını tekrar oynatmak için her çizgiye [başlangıç, bitiş] (ms) zamanı.
// Zamanı olmayan çizgilere (botlar, eski kayıtlar) uzunluğa göre zaman uydurulur.
export function withTiming(strokes) {
  let t = 0;
  return strokes.map((s) => {
    if (Array.isArray(s.t) && s.t.length === 2) { t = s.t[1]; return s; }
    const d = 250 + Math.min(900, (s.p.length / 2) * 18);
    const out = { ...s, t: [t + 120, t + 120 + d] };
    t += 120 + d;
    return out;
  });
}
export const artDuration = (strokes) => (strokes && strokes.length ? Math.max(...withTiming(strokes).map((s) => s.t[1])) : 0);
// Albümde tekrar oynatma süresi: kısa çizimler 2x, uzunlar 3x (en fazla 7 sn)
export const replayMs = (dur) => Math.max(Math.min((dur || 0) / 2, 2500), Math.min(7000, (dur || 0) / 3), 600);

// Cümleden çizilecek kavramı bul (yoksa rastgele)
export function conceptFor(text, R = Math.random) {
  const t = (text || '').toLocaleLowerCase('tr');
  const hit = DOODLES.find((k) => t.includes(k) || (k === 'güneş' && t.includes('gunes')) || (k === 'ağaç' && t.includes('agac')));
  return hit || DOODLES[Math.floor(R() * DOODLES.length)];
}

// Yazma aşaması için komik cümleler (botlar ve "🎲 öneri" butonu)
export const PROMPTS = [
  'Uçan bir kedi pizza yiyor', 'Ay\'da dondurma satan astronot', 'Şemsiyeli bir balık', 'Kardan adam güneşte eriyor',
  'Roketle okula giden köpek', 'Ağaca tırmanan araba', 'Hayalet gözlük takmış', 'Bulutların üstünde bir ev',
  'Kalbi kırık bir yıldız', 'Tekneyle dağa çıkan kuş', 'Çiçek koklayan dev bir saat', 'Gülen yüzlü bir pizza',
  'Denizde kayak yapan kedi', 'Kendini ayna sanan köpek', 'Geç kalan bir saat koşuyor', 'Dondurmadan yapılmış bir ev',
  'Uzaylı bir balık akvaryumdan kaçıyor', 'Güneş gözlüğü takan güneş', 'Araba yıkayan bir hayalet', 'Bulut yağmur yerine şeker yağdırıyor',
  'Yıldızlarla futbol oynayan ay', 'Kuş yuvasında uyuyan roket', 'Dağın tepesinde piknik yapan kardan adam', 'Tekne ile uçan bir ağaç',
  'Şemsiye ile paraşütle atlayan kedi', 'Kalp şeklinde bir pizza', 'Çiçeklerle dans eden bir köpek', 'Saati yutan bir balık',
];

// Botların tahmin cümleleri
const GUESS = ['Bir {k}!', '{k} galiba', 'Mutlu bir {k}', 'Garip bir {k}', 'Uçan bir {k}', 'Kocaman bir {k}', 'Bu kesin {k}', 'Uykulu bir {k}'];
export function botGuess(concept, R = Math.random) {
  const k = concept && R() < 0.75 ? concept : DOODLES[Math.floor(R() * DOODLES.length)];
  return GUESS[Math.floor(R() * GUESS.length)].replace('{k}', k);
}
