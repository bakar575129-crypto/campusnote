import {Router} from 'express';
import {HttpError} from './errors.mjs';
import {transaction} from './db.mjs';
import {ENTITIES, collectFileRefs, fromRow, selectColumns, toColumn} from './entities.mjs';
import {entitySchemas, syncBody, uuid} from './schemas.mjs';
import {activeNotebookCount, currentPlan} from './plans.mjs';

const OVERLAP_MS = 5000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_SETTINGS_BYTES = 64 * 1024;

export function createSync({pool}) {
  const router = Router();

  function parseData(entity, raw) {
    const schema = entitySchemas[entity];
    if (!schema) throw new HttpError(404, 'Bilinmeyen kayıt türü.');
    return schema.parse(raw);
  }

  async function assertFilesOwned(db, userId, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const [rows] = await db.query('SELECT id FROM files WHERE user_id=? AND id IN (?)', [userId, unique]);
    if (rows.length !== unique.length) throw new HttpError(409, 'Kayıtta henüz yüklenmemiş bir dosya var. Dosya yüklenince tekrar denenecek.', 'MISSING_FILE');
  }

  /** Ücretsiz planda aktif defter sınırı: yeni defter veya çöpten geri getirme bu kontrolden geçer. */
  async function assertNotebookCapacity(db, userId, id, data, existing) {
    if (data.trashedAt !== null) return;
    const becomesActive = !existing || existing.trashed_at !== null;
    if (!becomesActive) return;
    const plan = await currentPlan(db, userId);
    if (!plan.notebookLimit) return;
    const count = await activeNotebookCount(db, userId, id);
    if (count >= plan.notebookLimit) {
      throw new HttpError(403, `${plan.name} planında aynı anda en fazla ${plan.notebookLimit} defter kullanabilirsin. Bir defteri çöp kutusuna taşıyabilir ya da planını yükseltebilirsin.`, 'NOTEBOOK_LIMIT', {limit: plan.notebookLimit});
    }
  }

  // ---- tüm değişiklikler (sayfa içerikleri hariç)
  router.get('/sync', async (req, res) => {
    const since = Math.max(0, Number(req.query.since) || 0);
    const serverTime = Date.now();
    const userId = req.user.id;
    const records = {};
    for (const entity of Object.keys(ENTITIES)) {
      const def = ENTITIES[entity];
      const [rows] = await pool.execute(`SELECT ${selectColumns(entity, {meta: true})} FROM ${def.table} WHERE user_id=? AND updated_at>? ORDER BY updated_at`, [userId, since]);
      records[entity] = rows.map(r => fromRow(entity, r, {meta: true}));
    }
    const [[settings]] = await pool.execute('SELECT data,rev,updated_at FROM user_settings WHERE user_id=? AND updated_at>?', [userId, since]);
    records.settings = settings ? [{id: 'me', rev: settings.rev, updatedAt: Number(settings.updated_at), data: JSON.parse(settings.data)}] : [];
    const [deleted] = await pool.execute('SELECT entity,entity_id FROM deletions WHERE user_id=? AND deleted_at>?', [userId, since]);
    res.json({cursor: Math.max(0, serverTime - OVERLAP_MS), serverTime, records, deletions: deleted.map(d => ({entity: d.entity, id: d.entity_id}))});
  });

  // ---- bir defterin bütün sayfaları (içerikle)
  router.get('/notebooks/:id/pages', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const [[nb]] = await pool.execute('SELECT id FROM notebooks WHERE id=? AND user_id=?', [id, req.user.id]);
    if (!nb) throw new HttpError(404, 'Defter bulunamadı.', 'NOT_FOUND');
    const [rows] = await pool.execute(`SELECT ${selectColumns('page')} FROM notebook_pages WHERE notebook_id=? AND user_id=? ORDER BY position`, [id, req.user.id]);
    res.json({pages: rows.map(r => fromRow('page', r))});
  });

  router.get('/pages/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const [[row]] = await pool.execute(`SELECT ${selectColumns('page')} FROM notebook_pages WHERE id=? AND user_id=?`, [id, req.user.id]);
    if (!row) throw new HttpError(404, 'Sayfa bulunamadı.', 'NOT_FOUND');
    res.json({page: fromRow('page', row)});
  });

  // ---- kullanıcı ayarları (tek kayıt)
  router.put('/sync/settings/me', async (req, res) => {
    const body = syncBody.parse(req.body);
    const {data} = parseData('settings', body.data);
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_SETTINGS_BYTES) throw new HttpError(413, 'Ayarlar çok büyük.');
    const now = Date.now();
    const result = await transaction(pool, async db => {
      const [[row]] = await db.execute('SELECT data,rev,updated_at FROM user_settings WHERE user_id=? FOR UPDATE', [req.user.id]);
      if (!row) {
        await db.execute('INSERT INTO user_settings (user_id,data,rev,updated_at) VALUES (?,?,1,?)', [req.user.id, json, now]);
        return {rev: 1};
      }
      if (row.rev !== body.rev) throw new HttpError(409, 'Ayarlar başka bir cihazda değişti.', 'CONFLICT', {current: {id: 'me', rev: row.rev, updatedAt: Number(row.updated_at), data: JSON.parse(row.data)}});
      await db.execute('UPDATE user_settings SET data=?, rev=rev+1, updated_at=? WHERE user_id=?', [json, now, req.user.id]);
      return {rev: row.rev + 1};
    });
    res.json({...result, updatedAt: now});
  });

  // ---- genel yazma: yeni kayıt (rev 0) veya güncelleme (elindeki rev)
  router.put('/sync/:entity/:id', async (req, res) => {
    const entity = req.params.entity;
    const def = ENTITIES[entity];
    if (!def) throw new HttpError(404, 'Bilinmeyen kayıt türü.');
    const id = uuid.parse(req.params.id);
    const body = syncBody.parse(req.body);
    const data = parseData(entity, body.data);
    const userId = req.user.id;
    const now = Date.now();

    let pageBytes = 0;
    if (entity === 'page') {
      pageBytes = Buffer.byteLength(JSON.stringify(data.content));
      if (pageBytes > MAX_PAGE_BYTES) throw new HttpError(413, 'Bu sayfa çok doldu. Yeni bir sayfada devam et.', 'PAGE_TOO_LARGE');
    }

    const result = await transaction(pool, async db => {
      const [[existing]] = await db.execute(`SELECT * FROM ${def.table} WHERE id=? FOR UPDATE`, [id]);
      if (existing && existing.user_id !== userId) throw new HttpError(409, 'Bu kayıt kimliği kullanılamıyor.', 'ID_TAKEN');
      if (existing && existing.rev !== body.rev) {
        throw new HttpError(409, 'Kayıt başka bir cihazda değişti.', 'CONFLICT', {current: fromRow(entity, existing)});
      }
      await assertFilesOwned(db, userId, collectFileRefs(entity, data));
      if (entity === 'page') {
        const [[nb]] = await db.execute('SELECT id FROM notebooks WHERE id=? AND user_id=?', [data.notebookId, userId]);
        if (!nb) throw new HttpError(409, 'Sayfanın defteri sunucuda yok. Defter eşitlenince tekrar denenecek.', 'MISSING_PARENT');
      }
      if (entity === 'notebook') await assertNotebookCapacity(db, userId, id, data, existing);

      const cols = def.fields.map(f => f.col);
      const values = def.fields.map(f => toColumn(f, data[f.key]));
      const extraCols = entity === 'page' ? ['content_bytes', 'stroke_count'] : [];
      const extraVals = entity === 'page' ? [pageBytes, data.content.strokes.length] : [];
      if (!existing) {
        // Silinmiş bir kaydın düzenlenmiş hâli geri gelirse (başka cihazda silinmişti) veri kaybolmasın diye yeniden oluşturulur.
        const allCols = ['id', 'user_id', ...cols, ...extraCols, 'created_at', 'updated_at', 'rev'];
        await db.execute(`INSERT INTO ${def.table} (${allCols.join(',')}) VALUES (${allCols.map(() => '?').join(',')})`, [id, userId, ...values, ...extraVals, now, now, 1]);
        await db.execute('DELETE FROM deletions WHERE user_id=? AND entity=? AND entity_id=?', [userId, entity, id]);
        return {rev: 1};
      }
      const sets = [...cols, ...extraCols].map(c => `${c}=?`).join(',');
      await db.execute(`UPDATE ${def.table} SET ${sets}, updated_at=?, rev=rev+1 WHERE id=? AND user_id=?`, [...values, ...extraVals, now, id, userId]);
      return {rev: existing.rev + 1};
    });
    res.json({...result, updatedAt: now});
  });

  router.delete('/sync/:entity/:id', async (req, res) => {
    const entity = req.params.entity;
    const def = ENTITIES[entity];
    if (!def) throw new HttpError(404, 'Bilinmeyen kayıt türü.');
    const id = uuid.parse(req.params.id);
    const rev = Number(req.query.rev);
    if (!Number.isInteger(rev) || rev < 0) throw new HttpError(400, 'Revizyon eksik.');
    const userId = req.user.id;
    const now = Date.now();
    await transaction(pool, async db => {
      const [[existing]] = await db.execute(`SELECT * FROM ${def.table} WHERE id=? AND user_id=? FOR UPDATE`, [id, userId]);
      if (!existing) return; // zaten silinmiş: işlem tekrarlanabilir
      if (existing.rev !== rev) throw new HttpError(409, 'Kayıt başka bir cihazda değişti; silinmedi.', 'CONFLICT', {current: fromRow(entity, existing)});
      if (entity === 'notebook') {
        if (existing.trashed_at === null) throw new HttpError(409, 'Defter kalıcı silinmeden önce çöp kutusuna taşınmalı.', 'NOT_TRASHED');
        const [pages] = await db.execute('SELECT id FROM notebook_pages WHERE notebook_id=?', [id]);
        for (const p of pages) await db.execute('INSERT INTO deletions (user_id,entity,entity_id,deleted_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at)', [userId, 'page', p.id, now]);
      }
      await db.execute(`DELETE FROM ${def.table} WHERE id=? AND user_id=?`, [id, userId]);
      await db.execute('INSERT INTO deletions (user_id,entity,entity_id,deleted_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at)', [userId, entity, id, now]);
    });
    res.json({ok: true});
  });

  return router;
}
