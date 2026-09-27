// Ortak defter ve not paylaşımı.
//  • Ortak defter: sahibi, kayıtlı bir kullanıcıyı e-postayla davet eder (görüntüleme ya da düzenleme). Davet kabul
//    edilince defter ve sayfaları üyenin eşitlemesine girer; düzenleyiciler sayfa yazabilir. Her yazma yetki kontrolünden
//    geçer; değişiklik geçmişi ve "son düzenleyen" tutulur.
//  • Not paylaşımı: /share/note/<bağlantı> — gizli (kapalı), bağlantıya sahip olan görüntüler, herkese açık (Keşfet).
import {Router} from 'express';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import {HttpError} from './errors.mjs';
import {rateLimit} from './security.mjs';
import {uuid} from './schemas.mjs';
import {currentPlan} from './plans.mjs';
import {fromRow} from './entities.mjs';

const email = z.string().trim().toLowerCase().max(190).pipe(z.email('Geçerli bir e-posta yaz.'));
const role = z.enum(['viewer', 'editor']);
const visibility = z.enum(['private', 'link', 'public']);
const linkId = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'Bağlantı geçersiz.');

/** Kullanıcının defterdeki yetkisi: owner | editor | viewer | null. */
export async function notebookAccess(db, userId, notebookId) {
  const [[nb]] = await db.execute('SELECT user_id FROM notebooks WHERE id=?', [notebookId]);
  if (!nb) return null;
  if (nb.user_id === userId) return 'owner';
  const [[m]] = await db.execute("SELECT role FROM notebook_members WHERE notebook_id=? AND user_id=? AND status='accepted'", [notebookId, userId]);
  return m ? m.role : null;
}

/** Kullanıcının üyesi olduğu (kabul ettiği) defterler. */
export async function memberNotebookIds(db, userId) {
  const [rows] = await db.execute("SELECT notebook_id FROM notebook_members WHERE user_id=? AND status='accepted'", [userId]);
  return rows.map(r => r.notebook_id);
}

/** Defterin sahibi ve kabul etmiş üyeleri (silme izleri ve bildirimler için). */
export async function notebookAudience(db, notebookId) {
  const [[nb]] = await db.execute('SELECT user_id FROM notebooks WHERE id=?', [notebookId]);
  const [rows] = await db.execute("SELECT user_id FROM notebook_members WHERE notebook_id=? AND status='accepted'", [notebookId]);
  return [...new Set([nb?.user_id, ...rows.map(r => r.user_id)].filter(Boolean))];
}

/** Ortak defterde yapılan değişikliği geçmişe yazar (aynı kişinin art arda düzenlemeleri 2 dakikada bir kaydedilir). */
export async function logActivity(db, notebookId, userId, action, detail = '') {
  const [[hasMembers]] = await db.execute('SELECT 1 AS x FROM notebook_members WHERE notebook_id=? LIMIT 1', [notebookId]);
  if (!hasMembers) return;
  const [[recent]] = await db.execute('SELECT id FROM notebook_activity WHERE notebook_id=? AND user_id=? AND action=? AND detail=? AND created_at>? LIMIT 1', [notebookId, userId, action, detail, Date.now() - 120_000]);
  if (recent) return;
  await db.execute('INSERT INTO notebook_activity (notebook_id,user_id,action,detail,created_at) VALUES (?,?,?,?,?)', [notebookId, userId, action, detail.slice(0, 200), Date.now()]);
}

/** Paylaşılan içerikte geçen dosya kimlikleri (arka plan, sticker, kapak stickerları). */
function fileIdsOf(pages, cover) {
  const ids = new Set();
  for (const c of pages) {
    if (c.background?.fileId) ids.add(c.background.fileId);
    for (const s of c.stickers || []) if (s.fileId) ids.add(s.fileId);
  }
  for (const s of cover?.stickers || []) if (s.fileId) ids.add(s.fileId);
  return ids;
}

export function createPublicShare({pool, config}) {
  const router = Router();
  async function load(id) {
    const [[link]] = await pool.execute(`SELECT l.*, n.title, n.course, n.term, n.color, n.cover, n.paper, n.updated_at AS nb_updated, u.name AS owner_name
      FROM share_links l JOIN notebooks n ON n.id=l.notebook_id JOIN users u ON u.id=l.user_id WHERE l.id=? AND n.trashed_at IS NULL`, [id]);
    if (!link || link.visibility === 'private') throw new HttpError(404, 'Bu paylaşım bağlantısı kapalı ya da bulunamadı.', 'NOT_FOUND');
    return link;
  }
  router.get('/share/:id', async (req, res) => {
    const id = linkId.parse(req.params.id);
    await rateLimit(pool, 'share-view:' + (req.ip || ''), 240, 60 * 1000, 'Çok fazla istek. Biraz bekle.');
    const link = await load(id);
    const [pages] = link.page_id
      ? await pool.execute('SELECT id, content, updated_at FROM notebook_pages WHERE id=? AND notebook_id=?', [link.page_id, link.notebook_id])
      : await pool.execute('SELECT id, content, updated_at FROM notebook_pages WHERE notebook_id=? ORDER BY position LIMIT 300', [link.notebook_id]);
    await pool.execute('UPDATE share_links SET views=views+1 WHERE id=?', [id]);
    res.set('Cache-Control', 'no-store').json({
      id, title: link.title, course: link.course, term: link.term, color: link.color, paper: link.paper, cover: JSON.parse(link.cover),
      owner: link.owner_name, allowDownload: !!link.allow_download, visibility: link.visibility, pageOnly: !!link.page_id,
      updatedAt: Math.max(Number(link.nb_updated), ...pages.map(p => Number(p.updated_at))),
      pages: pages.map(p => ({id: p.id, content: JSON.parse(p.content)})),
    });
  });
  // Paylaşılan sayfadaki görseller: yalnızca bu paylaşımda geçen dosyalar, yalnızca defter sahibi ya da üyelerinin dosyası.
  router.get('/share/:id/files/:fileId', async (req, res, next) => {
    const id = linkId.parse(req.params.id);
    const fileId = uuid.parse(req.params.fileId);
    const link = await load(id);
    const [pages] = link.page_id
      ? await pool.execute('SELECT content FROM notebook_pages WHERE id=? AND notebook_id=?', [link.page_id, link.notebook_id])
      : await pool.execute('SELECT content FROM notebook_pages WHERE notebook_id=?', [link.notebook_id]);
    const allowed = fileIdsOf(pages.map(p => JSON.parse(p.content)), JSON.parse(link.cover));
    if (!allowed.has(fileId)) throw new HttpError(404, 'Dosya bulunamadı.', 'NOT_FOUND');
    const [[file]] = await pool.execute('SELECT user_id, mime FROM files WHERE id=?', [fileId]);
    if (!file) throw new HttpError(404, 'Dosya bulunamadı.', 'NOT_FOUND');
    res.set({'Content-Type': file.mime, 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff'});
    res.sendFile(path.join(config.storage, file.user_id, fileId), {dotfiles: 'deny'}, e => { if (e && !res.headersSent) next(new HttpError(404, 'Dosya okunamadı.', 'NOT_FOUND')); });
  });
  // Keşfet: herkese açık paylaşımlar (sayfalı).
  router.get('/gallery', async (req, res) => {
    const offset = Math.max(0, Math.min(10_000, Number(req.query.offset) || 0));
    const [rows] = await pool.query(`SELECT l.id, l.views, l.updated_at, n.title, n.course, n.color, u.name AS owner_name FROM share_links l
      JOIN notebooks n ON n.id=l.notebook_id JOIN users u ON u.id=l.user_id WHERE l.visibility='public' AND n.trashed_at IS NULL ORDER BY l.updated_at DESC LIMIT 30 OFFSET ?`, [offset]);
    res.json({items: rows.map(r => ({id: r.id, title: r.title, course: r.course, color: r.color, owner: r.owner_name, views: Number(r.views), updatedAt: Number(r.updated_at)})), hasMore: rows.length === 30});
  });
  return router;
}

export function createSharing({pool, mailer, config}) {
  const router = Router();
  const own = async (userId, notebookId) => {
    const access = await notebookAccess(pool, userId, notebookId);
    if (access !== 'owner') throw new HttpError(access ? 403 : 404, access ? 'Bu işlemi yalnızca defterin sahibi yapabilir.' : 'Defter bulunamadı.', access ? 'FORBIDDEN' : 'NOT_FOUND');
  };
  /** Üyenin cihazlarından defteri ve sayfalarını kaldırmak için silme izi. */
  async function forgetFor(userId, notebookId) {
    const now = Date.now();
    const [pages] = await pool.execute('SELECT id FROM notebook_pages WHERE notebook_id=?', [notebookId]);
    const rows = [[userId, 'notebook', notebookId, now], ...pages.map(p => [userId, 'page', p.id, now])];
    for (const r of rows) await pool.execute('INSERT INTO deletions (user_id,entity,entity_id,deleted_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at)', r);
  }

  router.get('/shares', async (req, res) => {
    const uid = req.user.id;
    const [invites] = await pool.execute(`SELECT m.notebook_id, m.role, m.created_at, n.title, n.course, n.color, u.name AS owner_name FROM notebook_members m
      JOIN notebooks n ON n.id=m.notebook_id JOIN users u ON u.id=n.user_id WHERE m.user_id=? AND m.status='pending' AND n.trashed_at IS NULL ORDER BY m.created_at DESC`, [uid]);
    const [shared] = await pool.execute(`SELECT m.notebook_id, m.role, n.title, n.course, n.color, n.updated_at, u.name AS owner_name FROM notebook_members m
      JOIN notebooks n ON n.id=m.notebook_id JOIN users u ON u.id=n.user_id WHERE m.user_id=? AND m.status='accepted' ORDER BY n.updated_at DESC`, [uid]);
    const [mine] = await pool.execute(`SELECT n.id, n.title, n.course, n.color, COUNT(m.user_id) AS members, SUM(m.status='pending') AS pending FROM notebooks n
      JOIN notebook_members m ON m.notebook_id=n.id WHERE n.user_id=? GROUP BY n.id ORDER BY n.updated_at DESC`, [uid]);
    const [links] = await pool.execute(`SELECT l.id, l.notebook_id, l.page_id, l.visibility, l.allow_download, l.views, l.created_at, n.title FROM share_links l
      JOIN notebooks n ON n.id=l.notebook_id WHERE l.user_id=? ORDER BY l.created_at DESC`, [uid]);
    res.json({
      invites: invites.map(i => ({notebookId: i.notebook_id, role: i.role, title: i.title, course: i.course, color: i.color, owner: i.owner_name, createdAt: Number(i.created_at)})),
      shared: shared.map(s => ({notebookId: s.notebook_id, role: s.role, title: s.title, course: s.course, color: s.color, owner: s.owner_name, updatedAt: Number(s.updated_at)})),
      mine: mine.map(m => ({notebookId: m.id, title: m.title, course: m.course, color: m.color, members: Number(m.members), pending: Number(m.pending || 0)})),
      links: links.map(l => ({id: l.id, notebookId: l.notebook_id, pageId: l.page_id, visibility: l.visibility, allowDownload: !!l.allow_download, views: Number(l.views), createdAt: Number(l.created_at), title: l.title})),
    });
  });

  // ---- defterin ortak çalışma bilgisi: üyeler, son düzenleyenler, geçmiş (sahip ve üyeler görebilir)
  router.get('/notebooks/:id/collab', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const access = await notebookAccess(pool, req.user.id, id);
    if (!access) throw new HttpError(404, 'Defter bulunamadı.', 'NOT_FOUND');
    const [[owner]] = await pool.execute('SELECT u.id, u.name, u.email FROM notebooks n JOIN users u ON u.id=n.user_id WHERE n.id=?', [id]);
    const [members] = await pool.execute('SELECT m.user_id, m.role, m.status, m.created_at, u.name, u.email FROM notebook_members m JOIN users u ON u.id=m.user_id WHERE m.notebook_id=? ORDER BY m.created_at', [id]);
    const [activity] = await pool.execute('SELECT a.action, a.detail, a.created_at, u.name FROM notebook_activity a JOIN users u ON u.id=a.user_id WHERE a.notebook_id=? ORDER BY a.created_at DESC LIMIT 50', [id]);
    const [pages] = await pool.execute('SELECT p.id, p.updated_at, u.name FROM notebook_pages p LEFT JOIN users u ON u.id=p.updated_by WHERE p.notebook_id=? ORDER BY p.position', [id]);
    const plan = await currentPlan(pool, owner.id);
    const showEmail = access === 'owner';
    res.json({
      access, owner: {id: owner.id, name: owner.name},
      members: members.map(m => ({userId: m.user_id, name: m.name, email: showEmail ? m.email : undefined, role: m.role, status: m.status, createdAt: Number(m.created_at)})),
      activity: activity.map(a => ({action: a.action, detail: a.detail, at: Number(a.created_at), name: a.name})),
      pages: pages.map(p => ({id: p.id, updatedAt: Number(p.updated_at), lastEditor: p.name || owner.name})),
      limits: {collaboration: plan.features.collaboration, maxCollaborators: plan.features.maxCollaborators},
    });
  });

  router.post('/notebooks/:id/members', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await own(req.user.id, id);
    const body = z.object({email, role}).parse(req.body);
    await rateLimit(pool, 'invite:' + req.user.id, 40, 60 * 60 * 1000, 'Kısa sürede çok fazla davet gönderildi.');
    const plan = await currentPlan(pool, req.user.id);
    if (!plan.features.collaboration) throw new HttpError(403, `Ortak defter ${plan.name} planında yok. Planını yükseltebilirsin.`, 'PLAN_FEATURE');
    const [[target]] = await pool.execute('SELECT id, name, email FROM users WHERE email=? AND disabled=0', [body.email]);
    if (!target) throw new HttpError(404, 'Bu e-postayla kayıtlı bir Kalemlik kullanıcısı yok. Önce Kalemlik’e kayıt olmasını iste.', 'NO_USER');
    if (target.id === req.user.id) throw new HttpError(400, 'Kendini davet edemezsin.');
    const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM notebook_members WHERE notebook_id=? AND user_id<>?', [id, target.id]);
    if (Number(count.n) >= plan.features.maxCollaborators) throw new HttpError(403, `${plan.name} planında bir deftere en fazla ${plan.features.maxCollaborators} kişi eklenebilir.`, 'COLLAB_LIMIT');
    const now = Date.now();
    await pool.execute(`INSERT INTO notebook_members (notebook_id,user_id,role,status,invited_by,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?)
      ON DUPLICATE KEY UPDATE role=VALUES(role), updated_at=VALUES(updated_at)`, [id, target.id, body.role, req.user.id, now, now]);
    await logActivity(pool, id, req.user.id, 'invite', `${target.name} (${body.role === 'editor' ? 'düzenleyebilir' : 'görüntüleyebilir'})`);
    const [[nb]] = await pool.execute('SELECT title FROM notebooks WHERE id=?', [id]);
    if (mailer?.configured) {
      void mailer.send({to: target.email, subject: `${req.user.name} seninle bir defter paylaştı`, text: `${req.user.name}, "${nb.title}" defterini seninle paylaştı (${body.role === 'editor' ? 'düzenleme' : 'görüntüleme'} izni).\n\nDaveti görmek için: ${config.origin}/paylasimlar`}).catch(() => {});
    }
    res.status(201).json({ok: true, member: {userId: target.id, name: target.name, email: target.email, role: body.role, status: 'pending'}});
  });

  router.patch('/notebooks/:id/members/:userId', async (req, res) => {
    const id = uuid.parse(req.params.id), userId = uuid.parse(req.params.userId);
    await own(req.user.id, id);
    const body = z.object({role}).parse(req.body);
    const [r] = await pool.execute('UPDATE notebook_members SET role=?, updated_at=? WHERE notebook_id=? AND user_id=?', [body.role, Date.now(), id, userId]);
    if (!r.affectedRows) throw new HttpError(404, 'Üye bulunamadı.', 'NOT_FOUND');
    res.json({ok: true});
  });

  // Sahip üyeyi çıkarır ya da üye kendisi ayrılır; üyenin cihazlarından defter kaldırılır.
  router.delete('/notebooks/:id/members/:userId', async (req, res) => {
    const id = uuid.parse(req.params.id), userId = uuid.parse(req.params.userId);
    const access = await notebookAccess(pool, req.user.id, id);
    if (userId !== req.user.id && access !== 'owner') throw new HttpError(403, 'Bu işlemi yalnızca defterin sahibi yapabilir.', 'FORBIDDEN');
    const [r] = await pool.execute('DELETE FROM notebook_members WHERE notebook_id=? AND user_id=?', [id, userId]);
    if (r.affectedRows) {
      await forgetFor(userId, id);
      await logActivity(pool, id, req.user.id, userId === req.user.id ? 'leave' : 'remove', '');
    }
    res.json({ok: true});
  });

  router.post('/notebooks/:id/invite/:answer', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const answer = z.enum(['accept', 'decline']).parse(req.params.answer);
    if (answer === 'decline') {
      await pool.execute("DELETE FROM notebook_members WHERE notebook_id=? AND user_id=? AND status='pending'", [id, req.user.id]);
      return res.json({ok: true});
    }
    const [r] = await pool.execute("UPDATE notebook_members SET status='accepted', updated_at=? WHERE notebook_id=? AND user_id=? AND status='pending'", [Date.now(), id, req.user.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Davet bulunamadı.', 'NOT_FOUND');
    // Daha önce ayrıldıysa kalan silme izleri temizlenir (defter yeniden görünür).
    await pool.execute("DELETE FROM deletions WHERE user_id=? AND ((entity='notebook' AND entity_id=?) OR (entity='page' AND entity_id IN (SELECT id FROM notebook_pages WHERE notebook_id=?)))", [req.user.id, id, id]);
    await logActivity(pool, id, req.user.id, 'join', '');
    res.json({ok: true});
  });

  // ---- yakın gerçek zamanlı: açık defterde birkaç saniyede bir değişen sayfalar (içerikle) ve silinenler
  router.get('/notebooks/:id/changes', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const since = Math.max(0, Number(req.query.since) || 0);
    const access = await notebookAccess(pool, req.user.id, id);
    if (!access) throw new HttpError(404, 'Defter bulunamadı.', 'NOT_FOUND');
    const now = Date.now();
    const [rows] = await pool.execute('SELECT * FROM notebook_pages WHERE notebook_id=? AND updated_at>? ORDER BY updated_at LIMIT 100', [id, since]);
    const [dels] = await pool.execute("SELECT entity_id FROM deletions WHERE user_id=? AND entity='page' AND deleted_at>?", [req.user.id, since]);
    res.json({now: now - 3000, access, pages: rows.map(r => fromRow('page', r)), deleted: dels.map(d => d.entity_id)});
  });

  // ---- paylaşım bağlantıları
  router.post('/notebooks/:id/links', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await own(req.user.id, id);
    const body = z.object({pageId: z.union([uuid, z.literal('')]).default(''), visibility: visibility.default('link'), allowDownload: z.boolean().default(true)}).parse(req.body || {});
    if (body.pageId) {
      const [[p]] = await pool.execute('SELECT id FROM notebook_pages WHERE id=? AND notebook_id=?', [body.pageId, id]);
      if (!p) throw new HttpError(404, 'Sayfa bulunamadı.', 'NOT_FOUND');
    }
    await rateLimit(pool, 'links:' + req.user.id, 60, 60 * 60 * 1000);
    const linkIdValue = randomBytes(16).toString('base64url');
    const now = Date.now();
    await pool.execute('INSERT INTO share_links (id,user_id,notebook_id,page_id,visibility,allow_download,views,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)', [linkIdValue, req.user.id, id, body.pageId, body.visibility, body.allowDownload ? 1 : 0, now, now]);
    res.status(201).json({link: {id: linkIdValue, notebookId: id, pageId: body.pageId, visibility: body.visibility, allowDownload: body.allowDownload, views: 0, createdAt: now}});
  });
  router.patch('/links/:id', async (req, res) => {
    const id = linkId.parse(req.params.id);
    const body = z.object({visibility: visibility.optional(), allowDownload: z.boolean().optional()}).parse(req.body);
    const [[link]] = await pool.execute('SELECT user_id FROM share_links WHERE id=?', [id]);
    if (!link || link.user_id !== req.user.id) throw new HttpError(404, 'Bağlantı bulunamadı.', 'NOT_FOUND');
    if (body.visibility) await pool.execute('UPDATE share_links SET visibility=?, updated_at=? WHERE id=?', [body.visibility, Date.now(), id]);
    if (body.allowDownload !== undefined) await pool.execute('UPDATE share_links SET allow_download=? WHERE id=?', [body.allowDownload ? 1 : 0, id]);
    res.json({ok: true});
  });
  router.delete('/links/:id', async (req, res) => {
    const id = linkId.parse(req.params.id);
    await pool.execute('DELETE FROM share_links WHERE id=? AND user_id=?', [id, req.user.id]);
    res.json({ok: true});
  });

  return router;
}
