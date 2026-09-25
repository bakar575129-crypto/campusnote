// Yönetim panelinden değiştirilebilen uygulama ayarları (ör. tanıma API anahtarı). Değerler yalnızca sunucuda kalır.
export function createAppSettings(pool) {
  let cache = new Map();
  let loadedAt = 0;
  async function refresh() {
    try {
      const [rows] = await pool.query('SELECT name, value FROM app_settings');
      cache = new Map(rows.map(r => [r.name, r.value]));
      loadedAt = Date.now();
    } catch { /* tablo henüz yoksa boş kalır */ }
  }
  return {
    refresh,
    /** Önbellekten okur; 30 sn'den eskiyse arka planda yeniler (birden çok süreç aynı değeri görür). */
    get(name) {
      if (Date.now() - loadedAt > 30000) { loadedAt = Date.now(); void refresh(); }
      return cache.get(name) || '';
    },
    async set(name, value) {
      if (value) await pool.execute('INSERT INTO app_settings (name, value, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)', [name, value, Date.now()]);
      else await pool.execute('DELETE FROM app_settings WHERE name=?', [name]);
      await refresh();
    },
  };
}
