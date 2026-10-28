// Telve kart resimlerini indirir: The Metropolitan Museum of Art "Open Access" (CC0 / kamu malı) resimleri.
// Çalıştır: node scripts/telve-resim-bul.mjs  → public/telve/001.jpg … ve public/telve/kaynak.json (başlık, sanatçı, nesne no)
// Gereken: macOS `sips` (küçültme). Mevcut dosyalar silinip yeniden üretilir.
import { mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT = path.resolve('public/telve');
const API = 'https://collectionapi.metmuseum.org/public/collection/v1.1', API1 = 'https://collectionapi.metmuseum.org/public/collection/v1';   // arama v1.1, nesne v1
// [arama, kaç resim]: doğa, hayvan, insan, kapı/dolap, bina, çimen/bahçe, köpek ve sosyal ortamlar
const Q = [
  ['landscape trees', 6], ['forest', 5], ['mountains', 5], ['river', 5], ['sea waves', 5], ['snow winter', 4], ['sunset sky', 4], ['meadow grass', 5], ['garden flowers', 5], ['field harvest', 4],
  ['dog', 7], ['horse', 5], ['cat', 4], ['birds', 5], ['sheep cattle', 4], ['lion tiger', 3], ['fish', 2], ['deer', 2],
  ['door', 5], ['cabinet furniture interior', 4], ['window room interior', 4], ['stairs', 2], ['mirror', 2], ['kitchen still life', 3],
  ['house village', 6], ['castle tower', 4], ['church cathedral', 4], ['bridge', 3], ['city street', 4], ['harbor ships', 3], ['windmill', 2],
  ['portrait of a woman', 5], ['portrait of a man', 4], ['children playing', 5], ['mother and child', 3], ['old man', 3], ['dancers', 3],
  ['dinner party banquet', 5], ['tavern merry company', 4], ['picnic', 3], ['concert musicians', 4], ['market crowd', 4], ['wedding festival', 3], ['skating', 2], ['card players', 2], ['coffee cup table', 2], ['sleeping', 2],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let i = 0; i < 4; i++) { let r; try { r = await fetch(u, { signal: AbortSignal.timeout(20000) }); } catch { r = null; } if (r && r.ok) return r; await sleep(800 * (i + 1)); } throw new Error('indirilemedi ' + u); };

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const seen = new Set(), meta = [];
let n = 0;
for (const [q, want] of Q) {
  let ids = [];
  try { ids = (await (await get(`${API}/search?hasImages=true&isPublicDomain=true&medium=Paintings&q=${encodeURIComponent(q)}&limit=60`)).json()).objectIDs || []; } catch (e) { console.log('arama hatası', q); continue; }
  ids = ids.sort(() => Math.random() - 0.5);
  let got = 0;
  for (const id of ids) {
    if (got >= want) break;
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const o = await (await get(`${API1}/objects/${id}`)).json();
      if (!o.isPublicDomain || !o.primaryImageSmall) continue;
      const buf = Buffer.from(await (await get(o.primaryImageSmall)).arrayBuffer());
      const name = String(++n).padStart(3, '0');
      const tmp = path.join(OUT, name + '.jpg');
      writeFileSync(tmp, buf);
      execFileSync('sips', ['-Z', '420', '--setProperty', 'format', 'jpeg', '--setProperty', 'formatOptions', '68', tmp], { stdio: 'ignore' });
      meta.push({ id: n, q, title: o.title, artist: o.artistDisplayName || '', date: o.objectDate || '', met: o.objectID });
      got++;
      await sleep(120);
    } catch (e) { n = Math.max(0, n - 1); }
  }
  console.log(q, got, 'toplam', meta.length);
}
writeFileSync(path.join(OUT, 'kaynak.json'), JSON.stringify(meta, null, 1));
console.log('bitti:', readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length, 'resim');
