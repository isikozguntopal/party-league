// WebRTC için TURN kimlik bilgisi (Cloudflare Realtime TURN). Anahtar yoksa boş liste döner; istemci yalnızca STUN ile devam eder.
// Gerekli ortam değişkenleri (Netlify → Site settings → Environment variables): TURN_KEY_ID, TURN_API_TOKEN
const TTL = 6 * 3600;            // kimlik bilgisinin ömrü (sn)
const CACHE_MS = 30 * 60 * 1000; // aynı sunucu örneğinde bu kadar süre yeniden kullanılır
let cache = null;

// Cloudflare yanıtı iceServers'ı dizi ya da tek nesne olarak verebilir; her durumda diziye çevir
export const normalizeIce = (x) => {
  const list = Array.isArray(x) ? x : x && typeof x === 'object' ? [x] : [];
  return list
    .filter((s) => s && (typeof s.urls === 'string' || (Array.isArray(s.urls) && s.urls.length)))
    .map((s) => ({ urls: s.urls, ...(s.username ? { username: String(s.username) } : {}), ...(s.credential ? { credential: String(s.credential) } : {}) }));
};

export async function getIce(env, fetchFn = fetch, now = Date.now()) {
  const id = env && env.TURN_KEY_ID, token = env && env.TURN_API_TOKEN;
  if (!id || !token) return [];
  if (cache && now - cache.t < CACHE_MS) return cache.list;
  try {
    const r = await fetchFn(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ics`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const list = normalizeIce(j && j.iceServers);
    if (list.length) cache = { t: now, list };
    return list;
  } catch { return []; }
}
