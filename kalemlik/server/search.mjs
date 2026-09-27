// Sunucu tarafı sayfa araması: bu cihaza henüz inmemiş sayfalarda da metin (yazı tipine çevrilmiş satırlar,
// metin kutuları, PDF metni, tanınan el yazısı) bulunur. Yalnızca kullanıcının kendi (ve üyesi olduğu) defterleri.
import {Router} from 'express';
import {z} from 'zod';
import {rateLimit} from './security.mjs';

/** Sayfa içeriğinden aranabilir düz metin. */
export function contentText(c) {
  if (!c) return '';
  const runs = (c.strokes || []).filter(s => s.run).map(s => s.run.text);
  const boxes = (c.texts || []).map(t => t.text);
  return [c.searchText || '', ...boxes, runs.join(' ')].filter(Boolean).join('\n');
}

const fold = s => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, ch => ({ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u'})[ch]);

export function snippet(text, q, width = 90) {
  const t = text.replace(/\s+/g, ' ').trim();
  const i = fold(t).indexOf(fold(q));
  if (i < 0) return t.slice(0, width * 2);
  const start = Math.max(0, i - width), end = Math.min(t.length, i + q.length + width);
  return (start ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
}

export function createSearch({pool, memberNotebookIds = async () => []}) {
  const router = Router();
  router.get('/search', async (req, res) => {
    const q = z.string().trim().min(2).max(100).parse(String(req.query.q || ''));
    await rateLimit(pool, 'search:' + req.user.id, 120, 60 * 1000, 'Çok hızlı arama yapıldı. Biraz bekle.');
    const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
    const shared = await memberNotebookIds(req.user.id);
    // utf8mb4_unicode_ci: büyük/küçük harf ve Türkçe aksanlardan bağımsız eşleşir. En yeni 60 sayfa.
    const [rows] = await pool.query(
      `SELECT p.id, p.notebook_id, p.position, p.content, p.updated_at FROM notebook_pages p
        WHERE (p.user_id=? ${shared.length ? 'OR p.notebook_id IN (?)' : ''}) AND p.content LIKE ?
        ORDER BY p.updated_at DESC LIMIT 60`, shared.length ? [req.user.id, shared, like] : [req.user.id, like]);
    const pages = [];
    for (const r of rows) {
      let text = '';
      try { text = contentText(JSON.parse(r.content)); } catch { continue; }
      if (!fold(text).includes(fold(q))) continue; // JSON anahtarlarında (ör. yazı tipi adı) geçen eşleşmeler atlanır
      pages.push({id: r.id, notebookId: r.notebook_id, position: Number(r.position), updatedAt: Number(r.updated_at), snippet: snippet(text, q)});
    }
    res.json({pages});
  });
  return router;
}
