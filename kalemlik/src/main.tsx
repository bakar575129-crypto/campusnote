import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/playpen-sans/400.css';
import '@fontsource/playpen-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
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
