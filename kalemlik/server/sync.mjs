import {Router} from 'express';
import {HttpError} from './errors.mjs';
import {transaction} from './db.mjs';
import {ENTITIES, collectFileRefs, fromRow, selectColumns, toColumn} from './entities.mjs';
import {entitySchemas, syncBody, uuid} from './schemas.mjs';
import {repairRecord} from '../shared/repair.mjs';
import {logActivity, memberNotebookIds, notebookAccess, notebookAudience} from './sharing.mjs';
import {activeNotebookCount, currentPlan} from './plans.mjs';

const OVERLAP_MS = 5000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_SETTINGS_BYTES = 64 * 1024;

export function createSync({pool, xp}) {
  const router = Router();

  // Kayıt önce onarılır (eski/bozuk istemci verisi reddedilmesin), sonra sıkı şemayla doğrulanır.
  function parseData(entity, raw) {
    const schema = entitySchemas[entity];
    if (!schema) throw new HttpError(404, 'Bilinmeyen kayıt türü.');
    return schema.parse(repairRecord(entity, raw));
  }
  // Revizyon eksik/bozuksa 0 sayılır: kayıt sunucuda varsa çakışma (409) döner ve istemci kendini günceller.
  const parseBody = body => syncBody.parse({rev: Number.isInteger(body?.rev) && body.rev >= 0 ? body.rev : 0, data: body?.data});

  /** Kayıtta geçen dosyalar yazanın (ortak defterde: sahibin ya da üyelerden birinin) olmalı. */
  async function assertFilesOwned(db, userId, ids, owners = [userId]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const [rows] = await db.query('SELECT id FROM files WHERE user_id IN (?) AND id IN (?)', [owners, unique]);
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
    // Ortak defterler: üyesi olunan defterler ve sayfaları da eşitlemeye girer; yeni kabul edilen davetin defteri,
    // imleç daha ileride olsa bile tamamıyla gönderilir.
    const memberIds = await memberNotebookIds(pool, userId);
    const [freshRows] = await pool.execute("SELECT notebook_id FROM notebook_members WHERE user_id=? AND status='accepted' AND updated_at>?", [userId, since]);
    const fresh = freshRows.map(r => r.notebook_id);
    for (const entity of Object.keys(ENTITIES)) {
      const def = ENTITIES[entity];
      let sql = `SELECT ${selectColumns(entity, {meta: true})} FROM ${def.table} WHERE (user_id=? AND updated_at>?)`;
      const args = [userId, since];
      const col = entity === 'notebook' ? 'id' : entity === 'page' ? 'notebook_id' : null;
      if (col && memberIds.length) { sql += ` OR (${col} IN (?) AND updated_at>?)`; args.push(memberIds, since); }
      if (col && fresh.length) { sql += ` OR ${col} IN (?)`; args.push(fresh); }
      const [rows] = await pool.query(`${sql} ORDER BY updated_at`, args);
      records[entity] = rows.map(r => fromRow(entity, r, {meta: true}));
    }
    // Kullanıcının ortak defterlerdeki rolü (görüntüleyen salt okunur açar) ve paylaştığı kendi defterleri.
    const [ms] = await pool.execute("SELECT m.notebook_id, m.role, u.name AS owner FROM notebook_members m JOIN notebooks n ON n.id=m.notebook_id JOIN users u ON u.id=n.user_id WHERE m.user_id=? AND m.status='accepted'", [userId]);
    const [outs] = await pool.execute("SELECT DISTINCT m.notebook_id FROM notebook_members m JOIN notebooks n ON n.id=m.notebook_id WHERE n.user_id=?", [userId]); // bekleyen davet de: kabul edilince sahip hemen canlı görür
    const [[settings]] = await pool.execute('SELECT data,rev,updated_at FROM user_settings WHERE user_id=? AND updated_at>?', [userId, since]);
    records.settings = settings ? [{id: 'me', rev: settings.rev, updatedAt: Number(settings.updated_at), data: JSON.parse(settings.data)}] : [];
    const [deleted] = await pool.execute('SELECT entity,entity_id FROM deletions WHERE user_id=? AND deleted_at>?', [userId, since]);
    res.json({cursor: Math.max(0, serverTime - OVERLAP_MS), serverTime, records, deletions: deleted.map(d => ({entity: d.entity, id: d.entity_id})),
      collab: [...ms.map(m => ({notebookId: m.notebook_id, role: m.role, owner: m.owner})), ...outs.map(o => ({notebookId: o.notebook_id, role: 'owner', owner: ''}))]});
  });

  // ---- bir defterin bütün sayfaları (içerikle)
  router.get('/notebooks/:id/pages', async (req, res) => {
    const id = uuid.parse(req.params.id);
    if (!(await notebookAccess(pool, req.user.id, id))) throw new HttpError(404, 'Defter bulunamadı.', 'NOT_FOUND');
    const [rows] = await pool.execute(`SELECT ${selectColumns('page')} FROM notebook_pages WHERE notebook_id=? ORDER BY position`, [id]);
    res.json({pages: rows.map(r => fromRow('page', r))});
  });

  router.get('/pages/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const [[row]] = await pool.execute(`SELECT ${selectColumns('page')} FROM notebook_pages WHERE id=?`, [id]);
    if (!row || !(await notebookAccess(pool, req.user.id, row.notebook_id))) throw new HttpError(404, 'Sayfa bulunamadı.', 'NOT_FOUND');
    res.json({page: fromRow('page', row)});
  });

  // ---- kullanıcı ayarları (tek kayıt)
  router.put('/sync/settings/me', async (req, res) => {
    const body = parseBody(req.body);
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
    const body = parseBody(req.body);
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
      // Kaydın sahibi: kendi kaydı ya da (ortak defterde) defter sahibi. Üyeler yalnızca yetkileri kadar yazar.
      let ownerId = userId;
      if (existing && existing.user_id !== userId) {
        const nbId = entity === 'page' ? existing.notebook_id : entity === 'notebook' ? existing.id : null;
        const access = nbId ? await notebookAccess(db, userId, nbId) : null;
        if (!access) throw new HttpError(409, 'Bu kayıt kimliği kullanılamıyor.', 'ID_TAKEN');
        // Defter bilgisi (ad, kapak, favori…) yalnızca sahibince değiştirilir; üyenin yerel değişikliği sessizce yok sayılır.
        if (entity === 'notebook') return {rev: existing.rev, updatedAt: Number(existing.updated_at)};
        if (access !== 'editor') throw new HttpError(403, 'Bu defterde yalnızca görüntüleme iznin var.', 'READ_ONLY');
        if (data.notebookId !== existing.notebook_id) throw new HttpError(403, 'Sayfa başka bir deftere taşınamaz.', 'READ_ONLY');
        ownerId = existing.user_id;
      }
      if (existing && existing.rev !== body.rev) {
        throw new HttpError(409, 'Kayıt başka bir cihazda değişti.', 'CONFLICT', {current: fromRow(entity, existing)});
      }
      let audience = [userId];
      if (entity === 'page') {
        const [[nb]] = await db.execute('SELECT id, user_id FROM notebooks WHERE id=?', [data.notebookId]);
        const access = nb ? (nb.user_id === userId ? 'owner' : await notebookAccess(db, userId, nb.id)) : null;
        if (!nb || !access) throw new HttpError(409, 'Sayfanın defteri sunucuda yok. Defter eşitlenince tekrar denenecek.', 'MISSING_PARENT');
        if (access === 'viewer') throw new HttpError(403, 'Bu defterde yalnızca görüntüleme iznin var.', 'READ_ONLY');
        ownerId = nb.user_id;
        audience = await notebookAudience(db, nb.id);
      }
      await assertFilesOwned(db, userId, collectFileRefs(entity, data), audience);
      if (def.parent) {
        const [[parent]] = await db.execute(`SELECT id FROM ${def.parent.table} WHERE id=? AND user_id=?`, [data[def.parent.key], userId]);
        if (!parent) throw new HttpError(409, def.parent.message, 'MISSING_PARENT');
      }
      if (entity === 'notebook') await assertNotebookCapacity(db, userId, id, data, existing);

      const cols = def.fields.map(f => f.col);
      const values = def.fields.map(f => toColumn(f, data[f.key]));
      const extraCols = entity === 'page' ? ['content_bytes', 'stroke_count', 'updated_by'] : entity === 'notebook' ? ['updated_by'] : [];
      const extraVals = entity === 'page' ? [pageBytes, data.content.strokes.length, userId] : entity === 'notebook' ? [userId] : [];
      if (entity === 'page') await logActivity(db, data.notebookId, userId, existing ? 'edit_page' : 'add_page', '');
      if (!existing) {
        // Silinmiş bir kaydın düzenlenmiş hâli geri gelirse (başka cihazda silinmişti) veri kaybolmasın diye yeniden oluşturulur.
        const allCols = ['id', 'user_id', ...cols, ...extraCols, 'created_at', 'updated_at', 'rev'];
        await db.execute(`INSERT INTO ${def.table} (${allCols.join(',')}) VALUES (${allCols.map(() => '?').join(',')})`, [id, ownerId, ...values, ...extraVals, now, now, 1]);
        await db.execute('DELETE FROM deletions WHERE user_id=? AND entity=? AND entity_id=?', [userId, entity, id]);
        return {rev: 1, own: ownerId === userId, prev: null};
      }
      const sets = [...cols, ...extraCols].map(c => `${c}=?`).join(',');
      await db.execute(`UPDATE ${def.table} SET ${sets}, updated_at=?, rev=rev+1 WHERE id=? AND user_id=?`, [...values, ...extraVals, now, id, ownerId]);
      return {rev: existing.rev + 1, own: ownerId === userId, prev: entity === 'page' ? null : fromRow(entity, existing)};
    });
    if (result.prev !== undefined) {
      // XP: kaydın önceki ve yeni hâlinden sunucu hesaplar (istemci XP göndermez). Yanıtı bekletmez.
      if (xp && result.own && entity !== 'page') void xp.onWrite(userId, entity, id, data, result.prev);
      res.json({rev: result.rev, updatedAt: now});
      return;
    }
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
    const mark = (db, users, e, eid) => Promise.all(users.map(u => db.execute('INSERT INTO deletions (user_id,entity,entity_id,deleted_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at)', [u, e, eid, now])));
    await transaction(pool, async db => {
      const [[existing]] = await db.execute(`SELECT * FROM ${def.table} WHERE id=? FOR UPDATE`, [id]);
      if (!existing) return; // zaten silinmiş: işlem tekrarlanabilir
      let audience = [userId];
      if (existing.user_id !== userId) {
        // Ortak defterde düzenleyici sayfa silebilir; başka hiçbir şey başkasınca silinemez.
        const access = entity === 'page' ? await notebookAccess(db, userId, existing.notebook_id) : null;
        if (access !== 'editor') throw new HttpError(access ? 403 : 404, access ? 'Bu defterde yalnızca görüntüleme iznin var.' : 'Kayıt bulunamadı.', access ? 'READ_ONLY' : 'NOT_FOUND');
      }
      if (existing.rev !== rev) throw new HttpError(409, 'Kayıt başka bir cihazda değişti; silinmedi.', 'CONFLICT', {current: fromRow(entity, existing)});
      if (entity === 'page') {
        audience = await notebookAudience(db, existing.notebook_id);
        await logActivity(db, existing.notebook_id, userId, 'delete_page', '');
      }
      if (entity === 'notebook') {
        if (existing.trashed_at === null) throw new HttpError(409, 'Defter kalıcı silinmeden önce çöp kutusuna taşınmalı.', 'NOT_TRASHED');
        audience = await notebookAudience(db, id); // üyelerin cihazlarından da kalkar
        const [pages] = await db.execute('SELECT id FROM notebook_pages WHERE notebook_id=?', [id]);
        for (const p of pages) await mark(db, audience, 'page', p.id);
      }
      await db.execute(`DELETE FROM ${def.table} WHERE id=? AND user_id=?`, [id, existing.user_id]);
      await mark(db, audience, entity, id);
    });
    res.json({ok: true});
  });

  return router;
}
