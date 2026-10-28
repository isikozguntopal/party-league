import { getStore } from '@netlify/blobs';
import { handle } from '../../public/game-core.js';
import { getIce } from './ice.mjs';
import { handleMuzik } from './muzik.mjs';

// iOS uygulaması (Capacitor) capacitor://localhost kaynağından istek atar
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Sadece POST' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Geçersiz istek' }, 400); }
  // WebRTC için TURN bilgisi: oyun durumuyla ilgisiz, depoya dokunmaz
  if (body && body.action === 'ice') return json({ iceServers: await getIce(process.env) });
  if (body && body.action === 'muzik') { try { return json(await handleMuzik(body, process.env, new URL(req.url).origin)); } catch (e) { console.error(e); return json({ status: 'error' }); } }
  const store = getStore({ name: 'lazer-kafes', consistency: 'strong' });
  try {
    return json(await handle(store, body, Date.now()));
  } catch (e) {
    if (!e.publicMessage) console.error(e);
    return json({ error: e.publicMessage || 'Sunucu hatası' }, e.status || 500);
  }
};

export const config = { path: '/api' };
