import { getStore } from '@netlify/blobs';
import { handle } from '../../public/game-core.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Sadece POST' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Geçersiz istek' }, 400); }
  const store = getStore({ name: 'lazer-kafes', consistency: 'strong' });
  try {
    return json(await handle(store, body, Date.now()));
  } catch (e) {
    if (!e.publicMessage) console.error(e);
    return json({ error: e.publicMessage || 'Sunucu hatası' }, e.status || 500);
  }
};

export const config = { path: '/api' };
