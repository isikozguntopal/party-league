// TURN kimlik bilgisi modülü (sahte Cloudflare yanıtlarıyla; gerçek API'ye karşı denenmedi)
import assert from 'node:assert/strict';

const calls = [];
const okFetch = (body, ok = true) => async (url, init) => { calls.push({ url, init }); return { ok, json: async () => body }; };

// Her test için modülü taze yükle (önbellek sıfırlansın)
const fresh = async () => (await import(`../netlify/functions/ice.mjs?x=${Math.random()}`));

{ // anahtar yoksa boş liste, ağ çağrısı yok
  const { getIce } = await fresh();
  assert.deepEqual(await getIce({}, okFetch({})), []);
  assert.deepEqual(await getIce({ TURN_KEY_ID: 'a' }, okFetch({})), []);
  assert.equal(calls.length, 0);
  console.log('✓ Anahtar yoksa boş liste, ağ çağrısı yok');
}
{ // dizi biçimi + doğru istek
  const { getIce } = await fresh();
  const l = await getIce({ TURN_KEY_ID: 'kimlik', TURN_API_TOKEN: 'gizli' }, okFetch({ iceServers: [{ urls: ['turn:t.example:3478?transport=udp', 'turns:t.example:5349'], username: 'u1', credential: 'c1' }] }), 1000);
  assert.equal(l.length, 1);
  assert.equal(l[0].username, 'u1');
  const c = calls[calls.length - 1];
  assert.match(c.url, /turn\/keys\/kimlik\/credentials\/generate-ics$/);
  assert.equal(c.init.headers.authorization, 'Bearer gizli');
  assert.equal(JSON.parse(c.init.body).ttl, 6 * 3600);
  console.log('✓ Dizi biçimi ve istek doğru (anahtar, token, ttl)');
}
{ // tek nesne biçimi dizi olur
  const { getIce } = await fresh();
  const l = await getIce({ TURN_KEY_ID: 'k', TURN_API_TOKEN: 't' }, okFetch({ iceServers: { urls: 'turn:x:3478', username: 'u', credential: 'c' } }), 1000);
  assert.equal(l.length, 1);
  assert.equal(l[0].urls, 'turn:x:3478');
  console.log('✓ Tek nesne biçimi diziye çevriliyor');
}
{ // önbellek: 30 dk içinde ikinci çağrı ağa gitmez, sonra gider
  const { getIce } = await fresh();
  const env = { TURN_KEY_ID: 'k', TURN_API_TOKEN: 't' };
  const before = calls.length;
  const f = okFetch({ iceServers: [{ urls: 'turn:x', username: 'u', credential: 'c' }] });
  await getIce(env, f, 1000); await getIce(env, f, 1000 + 60_000);
  assert.equal(calls.length - before, 1);
  await getIce(env, f, 1000 + 31 * 60_000);
  assert.equal(calls.length - before, 2);
  console.log('✓ Önbellek çalışıyor');
}
{ // hata durumları boş liste, çökme yok
  const { getIce } = await fresh();
  const env = { TURN_KEY_ID: 'k', TURN_API_TOKEN: 't' };
  assert.deepEqual(await getIce(env, okFetch({}, false)), []);
  assert.deepEqual(await getIce(env, async () => { throw new Error('ağ yok'); }), []);
  assert.deepEqual(await getIce(env, okFetch({ iceServers: 'bozuk' })), []);
  assert.deepEqual(await getIce(env, okFetch({ iceServers: [{ yok: 1 }, null] })), []);
  console.log('✓ Hata ve bozuk yanıtlar boş liste döndürüyor');
}
console.log('ICE TESTLERİ GEÇTİ');
