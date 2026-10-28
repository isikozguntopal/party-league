// Yerel test sunucusu: Netlify olmadan oyunu çalıştırır (oda verisi bellekte tutulur).
// Kullanım: npm run dev  →  http://localhost:8888
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { handle, MemoryStore } from './public/game-core.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const store = new MemoryStore();
const PORT = Number(process.env.PORT) || 8888;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let status = 200, out;
    try { out = await handle(store, JSON.parse(raw || '{}'), Date.now()); }
    catch (e) { if (!e.publicMessage) console.error(e); status = e.status || 500; out = { error: e.publicMessage || 'Sunucu hatası' }; }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(out));
  }
  // Test için: ?cizim modunda tuval görüntüsünü geçici klasöre kaydeder (yalnızca bu bilgisayardan)
  if (url.pathname === '/__snap' && req.method === 'POST' && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress)) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { name, data } = JSON.parse(raw);
    const dir = path.join(os.tmpdir(), 'lazer-kafes-snaps');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, String(name).replace(/[^a-z0-9-]/gi, '_') + '.jpg');
    await fs.writeFile(file, Buffer.from(String(data).split(',')[1] || '', 'base64'));
    res.writeHead(200); return res.end(file);
  }
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Bulunamadı'); }
}).listen(PORT, '0.0.0.0', () => console.log(`Parti Ligi → http://localhost:${PORT}`));
