import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import pkg from './package.json' with {type: 'json'};

/** Service worker'ın çevrimdışı kabuk için önbelleğe alacağı dosya listesini üretir. */
function offlineManifest(): Plugin {
  return {
    name: 'kalemlik-offline-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      // .woff (eski biçim) atlanır: modern tarayıcılar .woff2 kullanır.
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map') && !f.endsWith('.woff') && f !== 'index.html').map(f => '/' + f);
      this.emitFile({type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({version: pkg.version, builtAt: Date.now(), files})});
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineManifest()],
  resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url)), '@shared': fileURLToPath(new URL('./shared', import.meta.url))}},
  define: {__APP_VERSION__: JSON.stringify(pkg.version)},
  server: {port: 5173, proxy: {'/api': 'http://localhost:3000'}},
  build: {outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500, assetsInlineLimit: 0},
});
