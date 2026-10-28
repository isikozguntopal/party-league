// Cloudflare Worker: /api → oda koduna göre bir Durable Object (oda başına bir tane). Statik site (public/) "assets" ile servis edilir.
import { newRoomCode } from '../public/game-core.js';
import { getIce } from '../netlify/functions/ice.mjs';
export { Room } from './room.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });

const askRoom = (env, code, body) => env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room/handle', { method: 'POST', body: JSON.stringify(body) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/api') return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Bulunamadı', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Sadece POST' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Geçersiz istek' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Geçersiz istek' }, 400);

    if (body.action === 'ice') return json({ iceServers: await getIce(env) });
    if (body.action === 'muzik') return json({ status: 'off' }); // yapay zekâ müziği henüz taşınmadı: istemci yerel müziğe döner

    if (body.action === 'create') {
      for (let i = 0; i < 12; i++) {
        const code = newRoomCode();
        const res = await askRoom(env, code, { ...body, newCode: code });
        if (res.status === 409) { const t = await res.clone().json().catch(() => ({})); if (t.error === 'KOD_DOLU') continue; }
        return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
      }
      return json({ error: 'Oda oluşturulamadı, tekrar dene' }, 500);
    }

    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z]{4}$/.test(code)) return json({ error: 'Oda kodu 4 harf olmalı' }, 400);
    const res = await askRoom(env, code, { ...body, code });
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
  },
};
