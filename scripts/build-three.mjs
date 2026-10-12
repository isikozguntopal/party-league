// three.js'i tek, sıkıştırılmış bir dosyaya paketler: public/vendor/three.min.js
// Kullanım: npm run build:three   (esbuild burada esbuild-wasm'dır; exe gerektirmez)
import { build } from 'esbuild';

await build({
  entryPoints: ['node_modules/three/build/three.module.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'public/vendor/three.min.js',
  legalComments: 'none',
  banner: { js: '/* three.js r186 — MIT License — https://threejs.org */' },
});
console.log('public/vendor/three.min.js hazır');
