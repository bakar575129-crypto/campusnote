const MB = 1024 * 1024;

/** Kullanıcının şu an geçerli planı: süresi dolmamış aktif/iptal edilmiş abonelik, yoksa ücretsiz plan. */
export async function currentPlan(db, userId, now = Date.now()) {
  const [[sub]] = await db.execute(
    `SELECT s.id AS subscription_id, s.status, s.current_period_end, s.cancel_at_period_end, s.provider, p.*
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = ? AND s.status IN ('active','canceled') AND s.current_period_end > ?
      ORDER BY p.storage_mb DESC LIMIT 1`, [userId, now]);
  const [[user]] = await db.execute('SELECT extra_storage_mb, extra_notebooks FROM users WHERE id=?', [userId]);
  const extra = {storageMb: Number(user?.extra_storage_mb || 0), notebooks: Number(user?.extra_notebooks || 0)};
  if (sub) return describe(sub, sub, extra);
  const [[free]] = await db.execute("SELECT * FROM plans WHERE id='free'");
  if (!free) throw new Error('plans tablosunda "free" planı yok. sql/schema.sql dosyasını yeniden içe aktarın.');
  return describe(free, null, extra);
}

/** Yöneticinin verdiği ek depolama ve ek defter hakkı plana eklenir (sınırsız planda defter sınırı yoktur). */
function describe(plan, sub, extra = {storageMb: 0, notebooks: 0}) {
  const baseLimit = Number(plan.notebook_limit) || 0;
  return {
    id: plan.id,
    name: plan.name,
    storageBytes: (Number(plan.storage_mb) + extra.storageMb) * MB,
    notebookLimit: baseLimit ? baseLimit + extra.notebooks : null,
    extraStorageBytes: extra.storageMb * MB,
    extraNotebooks: extra.notebooks,
    ocrDailyLimit: Number(plan.ocr_daily_limit),
    subscription: sub ? {
      status: sub.status,
      periodEnd: Number(sub.current_period_end),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      provider: sub.provider,
    } : null,
  };
}

export async function listPlans(db) {
  const [rows] = await db.execute('SELECT * FROM plans WHERE active=1 ORDER BY sort_order');
  return rows.map(p => ({
    id: p.id, name: p.name, storageBytes: Number(p.storage_mb) * MB,
    notebookLimit: Number(p.notebook_limit) || null, ocrDailyLimit: Number(p.ocr_daily_limit),
    priceMonthly: Number(p.price_monthly), currency: p.currency,
  }));
}

export async function usedBytes(db, userId) {
  const [[row]] = await db.execute('SELECT COALESCE(SUM(size),0) AS used, COUNT(*) AS n FROM files WHERE user_id=?', [userId]);
  return {used: Number(row.used), count: Number(row.n)};
}

export async function activeNotebookCount(db, userId, excludeId = '') {
  const [[row]] = await db.execute('SELECT COUNT(*) AS n FROM notebooks WHERE user_id=? AND trashed_at IS NULL AND id<>?', [userId, excludeId]);
  return Number(row.n);
}
