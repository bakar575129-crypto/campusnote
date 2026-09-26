import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-ext-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-ext-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-ext-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-ext-800.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-ext-400.css';
import '@fontsource/lora/latin-700.css';
import '@fontsource/lora/latin-ext-700.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-ext-400.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/caveat/latin-ext-700.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-ext-400.css';
import '@fontsource/kalam/latin-700.css';
import '@fontsource/kalam/latin-ext-700.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/latin-ext-400.css';
import '@fontsource/playpen-sans/latin-400.css';
import '@fontsource/playpen-sans/latin-ext-400.css';
import '@fontsource/playpen-sans/latin-700.css';
import '@fontsource/playpen-sans/latin-ext-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-ext-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/app.css';
import './styles/editor.css';
import {App} from './app/App';
import {bootstrap} from './app/session';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
void bootstrap();

// PWA: uygulama kabuğu çevrimdışı açılabilsin diye service worker (yalnızca derlenmiş sürümde).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => {}); });
}
// Tarayıcının depolamayı kendiliğinden silmemesini iste (çevrimdışı taslaklar için).
void navigator.storage?.persist?.().catch(() => false);

// Sunucu yeni sürüme geçtiyse (ör. cPanel'de güncelleme yapıldı) açık kalmış eski uygulama, kullanıcı uygulamaya
// geri döndüğünde kendini yeniler. Yerel değişiklikler önce IndexedDB'ye yazılır; hiçbir şey kaybolmaz.
if (import.meta.env.PROD) {
  let checking = false;
  const checkVersion = async () => {
    if (checking || document.visibilityState !== 'visible' || !navigator.onLine) return;
    checking = true;
    try {
      const res = await fetch('/api/config', {cache: 'no-store', credentials: 'same-origin'});
      const {version} = res.ok ? await res.json() as {version?: string} : {version: undefined};
      if (version && version !== __APP_VERSION__ && sessionStorage.getItem('klm-reloaded') !== version) {
        sessionStorage.setItem('klm-reloaded', version);
        const {flushPersist} = await import('./lib/store');
        flushPersist();
        setTimeout(() => location.reload(), 400);
      }
    } catch { /* çevrimdışı */ } finally { checking = false; }
  };
  document.addEventListener('visibilitychange', () => { void checkVersion(); });
  window.addEventListener('load', () => { void checkVersion(); });
}
