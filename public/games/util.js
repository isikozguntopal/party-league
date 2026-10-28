// Oyun modüllerinin ortak yardımcıları (sunucu + tarayıcı)

export class GameError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; this.publicMessage = msg; }
}

export function uid(n = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Takımlar ----------
// env: { players: [{id, bot}], addBot() → {id, bot}, teams? } (game-core sağlar)
// env.teams: oda sahibinin dağıttığı takımlar ([[id, ...], ...]); varsa oyun bunları kullanır, yoksa rastgele bölünür.
// Oyunda olmayan kimlikler elenir; takımda yer almayan oyuncular (geç gelenler) normal kurallarla eşleştirilir.
function assigned(env) {
  if (!Array.isArray(env.teams) || !env.teams.length) return null;
  const here = new Set(env.players.map((p) => p.id));
  const teams = env.teams.map((t) => t.filter((id) => here.has(id))).filter((t) => t.length);
  if (!teams.length) return null;
  const placed = new Set(teams.flat());
  return { teams, rest: env.players.filter((p) => !placed.has(p.id)) };
}
// İkişerli takımlar; insanlar önce birbiriyle eşleşir.
//  trio: üçlü takıma izin var (tek sayıda insan varsa bir takım 3 kişi olur; tek insan yalnız oynar).
//  trio yoksa: artan insan bir botla eşleşir; toplam tekse geçici bot eklenir; atanmış 3'lü takım 2+1(+bot) olarak bölünür.
export function pairUp(env, { trio = false } = {}) {
  const asg = assigned(env);
  if (asg) {
    const botIds = shuffle(env.players.filter((p) => p.bot && !asg.teams.flat().includes(p.id)).map((p) => p.id));
    const out = [];
    for (const t of asg.teams) {
      if (trio) { out.push(t.slice(0, 3)); continue; }
      for (let i = 0; i < t.length; i += 2) {
        const pair = t.slice(i, i + 2);
        if (pair.length === 1) pair.push(botIds.length ? botIds.pop() : env.addBot().id);
        out.push(pair);
      }
    }
    if (asg.rest.length) out.push(...pairUp({ players: asg.rest, addBot: env.addBot }, { trio }));
    return out;
  }
  const humans = shuffle(env.players.filter((p) => !p.bot).map((p) => p.id));
  const bots = shuffle(env.players.filter((p) => p.bot).map((p) => p.id));
  const teams = [];
  if (trio) {
    while (humans.length) teams.push(humans.splice(0, humans.length === 3 ? 3 : humans.length === 1 ? 1 : 2));
  } else {
    while (humans.length >= 2) teams.push(humans.splice(0, 2));
    if (humans.length) teams.push([humans.pop(), bots.length ? bots.pop() : env.addBot().id]);
  }
  while (bots.length >= 2) teams.push(bots.splice(0, 2));
  if (bots.length) teams.push([bots.pop(), env.addBot().id]);
  return teams;
}
// İki eşit takım (A/B); eşit değilse küçük takıma geçici bot. Atanmış takım sayısı tam 2 ise onlar kullanılır.
export function twoTeams(env) {
  const asg = assigned(env);
  if (asg && asg.teams.length === 2 && !asg.rest.length) {
    const [A, B] = asg.teams.map((t) => t.slice());
    while (A.length !== B.length) (A.length < B.length ? A : B).push(env.addBot().id);
    return [A, B];
  }
  const humans = shuffle(env.players.filter((p) => !p.bot).map((p) => p.id));
  const bots = shuffle(env.players.filter((p) => p.bot).map((p) => p.id));
  const A = [], B = [];
  for (const id of [...humans, ...bots]) (A.length <= B.length ? A : B).push(id);
  while (A.length !== B.length) (A.length < B.length ? A : B).push(env.addBot().id);
  return [A, B];
}

// Gerçek zamanlı oyunların sunucu tarafı: oyunu oda sahibinin cihazı yönetir; sunucu yalnızca
// başlangıcı, ara sıralamayı ve sonucu tutar (bkz. game-core: rtResult / rtProgress).
export function realtimeServer() {
  return {
    realtime: true,
    PLACE_MS: 10 * 60 * 1000,
    init: (ids) => ({ alive: Object.fromEntries(ids.map((id) => [id, true])), outs: [] }),
    normalize: () => { throw new GameError('Bu oyunda hamle gönderilmez'); },
    auto: () => null,
    resolve: () => ({ entry: {}, dur: 0 }),
    ranking: () => null,
    view: (d) => ({ alive: d.g.alive, simHost: d.g.simHost, prov: d.g.prov || null }),
  };
}

// Eleme sırasından sıralama: hayatta kalanlar 1., sonra en son elenenden ilk elenene.
// Aynı anda elenenler aynı grupta (berabere) olur. Sonuç: [[id, id], [id], ...]
export function rankingFromOuts(g, participants) {
  const out = new Set(g.outs.flat());
  const alive = participants.filter((id) => !out.has(id));
  const groups = [];
  if (alive.length) groups.push(alive);
  for (let i = g.outs.length - 1; i >= 0; i--) if (g.outs[i].length) groups.push(g.outs[i]);
  return groups;
}
