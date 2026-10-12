// Tüm testleri sırayla çalıştırır: test/*.test.mjs (npm test)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort((a, b) => (a === 'game.test.mjs' ? -1 : b === 'game.test.mjs' ? 1 : a.localeCompare(b)));
let fail = 0;
for (const f of files) {
  console.log(`\n── ${f} ──`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) { fail++; console.log(`✗ ${f} BAŞARISIZ`); }
}
console.log(fail ? `\n${fail} test dosyası başarısız` : '\nTÜM TEST DOSYALARI GEÇTİ');
process.exit(fail ? 1 : 0);
