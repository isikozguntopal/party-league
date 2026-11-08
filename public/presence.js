// Çevrimiçi oyuncular ve davetler (Unity ana ekranı: "Davet et" paneli). Odaya bağlı değildir:
// Cloudflare'da tek bir "__lobi" Durable Object'inde, yerel sunucuda bellekte tutulur. Tek kayıt: { p: {id: kişi}, inv: {id: [davet]} }.
//   hello  { name, code?, game? }   → "buradayım" (≈ 4 sn'de bir); yanıt: çevrimiçi liste + bana gelen davetler
//   invite { to, code, game? }      → birini odama çağır
//   inviteAck { code }              → bu odanın davetini kapat (katıldım / istemiyorum)
export const PRESENCE_ACTIONS = ['hello', 'invite', 'inviteAck'];
const KEY = 'presence', ONLINE_MS = 30000, INVITE_MS = 120000;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Oyuncu';
const cleanCode = (s) => (typeof s === 'string' && /^[A-Z]{4}$/.test(s.trim().toUpperCase()) ? s.trim().toUpperCase() : null);
const cleanGame = (s) => (typeof s === 'string' && /^[a-z]{2,12}$/.test(s) ? s : null);

export async function presence(store, action, pid, body, now) {
  const r = await store.getWithMetadata(KEY, { type: 'json', consistency: 'strong' });
  const d = (r && r.data) || { p: {}, inv: {} };
  for (const [id, x] of Object.entries(d.p)) if (now - x.at > ONLINE_MS) delete d.p[id];
  for (const [id, l] of Object.entries(d.inv)) { d.inv[id] = l.filter((v) => now - v.at < INVITE_MS); if (!d.inv[id].length) delete d.inv[id]; }

  if (action === 'hello') {
    d.p[pid] = { n: cleanName(body.name), at: now, code: cleanCode(body.code), game: cleanGame(body.game) };
  } else if (action === 'invite') {
    const to = typeof body.to === 'string' ? body.to.slice(0, 40) : '', code = cleanCode(body.code);
    if (!to || !code || to === pid) return { error: 'Geçersiz davet', status: 400 };
    const me = d.p[pid] || { n: cleanName(body.name) };
    d.inv[to] = (d.inv[to] || []).filter((v) => !(v.from === pid && v.code === code));
    d.inv[to].push({ from: pid, n: me.n, code, game: cleanGame(body.game), at: now });
    if (d.inv[to].length > 5) d.inv[to].shift();
  } else if (action === 'inviteAck') {
    const code = cleanCode(body.code);
    if (d.inv[pid]) d.inv[pid] = d.inv[pid].filter((v) => v.code !== code);
  }
  await store.setJSON(KEY, d);
  const online = Object.entries(d.p).filter(([id]) => id !== pid).map(([id, x]) => ({ id, n: x.n, code: x.code, game: x.game, ago: now - x.at }));
  return { now, online, invites: d.inv[pid] || [] };
}
