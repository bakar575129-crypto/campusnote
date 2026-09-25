// cPanel "Setup Node.js App" / Passenger giriş dosyası.
import('./server/main.mjs').catch(error => {
  console.error('Kalemlik başlatılamadı:', error.message);
  process.exit(1);
});
