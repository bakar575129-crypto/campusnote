import {readConfig} from './config.mjs';
import {createPool} from './db.mjs';
import {createApp} from './app.mjs';

const config = readConfig();
const pool = createPool(config.db);
const app = createApp({pool, config});

// Süresi dolan oturum, sıfırlama ve hız sınırı kayıtlarını saatte bir temizler.
const sweep = () => {
  const now = Date.now();
  Promise.all([
    pool.execute('DELETE FROM sessions WHERE expires_at<?', [now]),
    pool.execute('DELETE FROM rate_limits WHERE expires_at<?', [now]),
    pool.execute('DELETE FROM password_resets WHERE expires_at<?', [now - 86400000]),
    pool.execute("UPDATE subscriptions SET status='expired', updated_at=? WHERE status IN ('active','canceled') AND current_period_end<?", [now, now]),
  ]).catch(e => console.error('[Kalemlik] temizlik hatası:', e.code || e.message));
};
setInterval(sweep, 60 * 60 * 1000).unref();
setTimeout(sweep, 10_000).unref();

// Passenger (cPanel) PORT yerine kendi soketini verir; app.listen yine doğru çalışır.
const server = app.listen(config.port, () => console.log(`Kalemlik ${config.version} çalışıyor → ${config.origin} (port ${config.port})`));
const stop = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
