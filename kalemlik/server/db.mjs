import mysql from 'mysql2/promise';

export function createPool(dbConfig) {
  return mysql.createPool(dbConfig);
}

/** Bağlantıyı alır, işlemi transaction içinde çalıştırır; hata olursa geri alır. */
export async function transaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
