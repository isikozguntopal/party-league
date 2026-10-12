// Karakter özelleştirme: seçenek listeleri + doğrulama (sunucu ve tarayıcı ortak kullanır)
// Her giysi parçasının rengi ayrı seçilir (üst, ikinci renk, alt, ayakkabı, şapka, aksesuar).

const GARMENT = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#111827', '#f8fafc', '#14b8a6', '#f97316', '#7c3aed', '#64748b', '#854d0e', '#fde047'];

export const LOOK_OPTIONS = {
  gender: { label: 'Cinsiyet', group: 'yuz', options: [['erkek', 'Erkek'], ['kadin', 'Kadın']] },
  skin: { label: 'Ten', group: 'yuz', colors: ['#f6d3b3', '#f1c495', '#e0a878', '#c68a5a', '#9a6440', '#6e4426'] },
  eyes: { label: 'Göz rengi', group: 'yuz', colors: ['#2b1d12', '#5a3a1e', '#2f6fd1', '#2e9a52', '#7a7f87', '#9b3fd1'] },
  beard: { label: 'Sakal', group: 'yuz', options: [['yok', 'Yok'], ['biyik', 'Bıyık'], ['keci', 'Keçi sakal'], ['sakal', 'Sakal'], ['kirli', 'Kirli sakal']] },
  style: { label: 'Saç şekli', group: 'sac', options: [['kisa', 'Kısa'], ['uzun', 'Uzun'], ['dalgali', 'Dalgalı'], ['kakul', 'Küt'], ['topuz', 'Topuz'], ['orgu', 'Örgü'], ['mohikan', 'Mohikan'], ['kivircik', 'Kıvırcık'], ['atkuyrugu', 'At kuyruğu'], ['kel', 'Kel']] },
  hair: { label: 'Saç rengi', group: 'sac', colors: ['#1d1410', '#3a2416', '#7a4a22', '#c98a3c', '#f2d27a', '#d23b2f', '#6d4bd8', '#2fb7a6', '#e8e8e8', '#ff5fa2'] },
  outfit: { label: 'Kıyafet', group: 'giysi', options: [['tisort', 'Tişört'], ['kapusonlu', 'Kapüşonlu'], ['takim', 'Takım elbise'], ['forma', 'Forma'], ['elbise', 'Elbise'], ['ceket', 'Deri ceket'], ['yelek', 'Yelek']] },
  shirt: { label: 'Üst rengi', group: 'giysi', colors: GARMENT },
  shirt2: { label: 'İkinci renk', group: 'giysi', colors: GARMENT },
  pants: { label: 'Alt rengi', group: 'giysi', colors: ['#1e3a8a', '#111827', '#57534e', '#7c2d12', '#e5e7eb', '#166534', '#be123c', '#0f766e', '#fde68a'] },
  shoes: { label: 'Ayakkabı', group: 'giysi', colors: ['#1f1f1f', '#f8fafc', '#ef4444', '#3b82f6', '#854d0e', '#facc15', '#22c55e', '#ec4899'] },
  hat: { label: 'Şapka', group: 'aks', options: [['yok', 'Yok'], ['kep', 'Kep'], ['bere', 'Bere'], ['tac', 'Taç'], ['kask', 'Kask'], ['parti', 'Parti'], ['fes', 'Fes'], ['kovboy', 'Kovboy'], ['korsan', 'Korsan'], ['bandana', 'Bandana'], ['kulaklik', 'Kulaklık'], ['cicek', 'Çiçek tacı'], ['silindir', 'Silindir']] },
  hatColor: { label: 'Şapka rengi', group: 'aks', colors: GARMENT },
  glasses: { label: 'Gözlük', group: 'aks', options: [['yok', 'Yok'], ['gozluk', 'Gözlük'], ['gunes', 'Güneş'], ['monokl', 'Monokl'], ['maske', 'Kahraman maskesi'], ['yuzucu', 'Yüzücü'], ['kalp', 'Kalp gözlük']] },
  acc: { label: 'Aksesuar', group: 'aks', options: [['yok', 'Yok'], ['kupe', 'Küpe'], ['kolye', 'Kolye'], ['fular', 'Fular'], ['papyon', 'Papyon'], ['pelerin', 'Pelerin'], ['kanat', 'Kanat'], ['madalya', 'Madalya']] },
  accColor: { label: 'Aksesuar rengi', group: 'aks', colors: GARMENT },
};
export const LOOK_GROUPS = [['yuz', '🙂 Yüz'], ['sac', '💇 Saç'], ['giysi', '👕 Giysi'], ['aks', '🎩 Aksesuar']];

export const DEFAULT_LOOK = { gender: 'erkek', skin: 1, eyes: 0, beard: 'yok', style: 'kisa', hair: 1, outfit: 'tisort', shirt: 0, shirt2: 7, pants: 0, shoes: 0, hat: 'yok', hatColor: 1, glasses: 'yok', acc: 'yok', accColor: 3 };

export function randomLook(rand = Math.random) {
  const look = {};
  for (const [k, o] of Object.entries(LOOK_OPTIONS)) {
    look[k] = o.colors ? Math.floor(rand() * o.colors.length) : o.options[Math.floor(rand() * o.options.length)][0];
  }
  if (rand() < 0.45) look.hat = 'yok';
  if (rand() < 0.6) look.glasses = 'yok';
  if (rand() < 0.5) look.acc = 'yok';
  if (look.gender === 'kadin' && rand() < 0.85) look.beard = 'yok';
  if (look.gender === 'erkek' && rand() < 0.5) look.beard = 'yok';
  return look;
}

// Sunucuya gelen görünümü doğrular; geçersiz alanlar varsayılana döner
export function cleanLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  for (const [k, o] of Object.entries(LOOK_OPTIONS)) {
    const v = look[k];
    if (o.colors && Number.isInteger(v) && v >= 0 && v < o.colors.length) out[k] = v;
    if (o.options && o.options.some(([id]) => id === v)) out[k] = v;
  }
  return out;
}

// Renk değerlerini çözer: { skin:'#..', hair, eyes, shirt, shirt2, pants, shoes, hatColor, accColor, + seçenekler }
export function lookColors(look) {
  const l = cleanLook(look);
  const out = { ...l };
  for (const [k, o] of Object.entries(LOOK_OPTIONS)) if (o.colors) out[k] = o.colors[l[k]];
  return out;
}
