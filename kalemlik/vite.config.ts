import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import pkg from './package.json' with {type: 'json'};
import {readFileSync} from 'node:fs';

/** Cihazda el yazısı tanıma (Tesseract, Türkçe): çekirdek, worker ve dil verisi /ocr/ altında sunulur. */
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tur.traineddata.gz': 'node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz',
};
function deviceOcrFiles(): Plugin {
  return {
    name: 'kalemlik-device-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith('/ocr/') ? req.url.slice(5).split('?')[0] : '';
        if (!OCR_FILES[name]) return next();
        res.setHeader('Content-Type', name.endsWith('.gz') ? 'application/gzip' : 'text/javascript');
        res.end(readFileSync(OCR_FILES[name]));
      });
    },
    generateBundle() {
      for (const [name, src] of Object.entries(OCR_FILES)) this.emitFile({type: 'asset', fileName: `ocr/${name}`, source: readFileSync(src)});
    },
  };
}

/** Service worker'ın çevrimdışı kabuk için önbelleğe alacağı dosya listesini üretir. */
function offlineManifest(): Plugin {
  return {
    name: 'kalemlik-offline-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      // .woff (eski biçim) atlanır: modern tarayıcılar .woff2 kullanır.
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map') && !f.endsWith('.woff') && !f.startsWith('ocr/') && f !== 'index.html').map(f => '/' + f);
      this.emitFile({type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({version: pkg.version, builtAt: Date.now(), files})});
    },
  };
}

export default defineConfig({
  plugins: [react(), deviceOcrFiles(), offlineManifest()],
  resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url)), '@shared': fileURLToPath(new URL('./shared', import.meta.url))}},
  define: {__APP_VERSION__: JSON.stringify(pkg.version)},
  // Sunucunun .env dosyası (NODE_ENV vb.) ön yüz derlemesini etkilemesin.
  envDir: 'src/env',
  server: {port: 5173, proxy: {'/api': 'http://localhost:3000'}},
  build: {outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500, assetsInlineLimit: 0},
});
