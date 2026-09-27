// 🛍️ Şablon Mağazası: hazır defter şablonları (kâğıt, renk, kapak ve başlıklı sayfalar). Ücretsiz şablonları herkes,
// premium şablonları planında "premiumTemplates" açık olanlar (ya da satın alanlar) kullanır. Şablonlar veritabanında
// durur; hazır olanlar ilk açılışta eklenir, yönetici panelden yenisini ekleyebilir, düzenleyebilir, kapatabilir.
import {Router} from 'express';
import {z} from 'zod';
import C from '../shared/constants.json' with {type: 'json'};
import {HttpError} from './errors.mjs';
import {rateLimit} from './security.mjs';
import {currentPlan} from './plans.mjs';

export const TEMPLATE_CATEGORIES = ['Ders notları', 'Üniversite planner', 'Cornell Notes', 'Matematik', 'Mühendislik', 'Tıp', 'Hukuk', 'Günlük', 'Haftalık plan', 'Aylık plan', 'Sınav planı', 'Minimal', 'Renkli'];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const tText = z.object({x: z.number().min(0).max(1000), y: z.number().min(0).max(1414), w: z.number().min(20).max(1000), text: z.string().max(2000), size: z.number().min(8).max(80), color: hex, bold: z.boolean().optional(), font: z.string().regex(/^[a-z0-9-]{1,40}$/).optional()});
export const templateContent = z.object({
  paper: z.enum(C.papers),
  color: hex,
  cover: z.object({pattern: z.enum(C.coverPatterns), patternOpacity: z.number().min(0.03).max(1).optional(), patternSize: z.number().min(2).max(20).optional(), label: z.string().max(80).optional()}),
  pages: z.array(z.object({template: z.enum(C.papers), paperColor: hex.optional(), lineColor: hex.optional(), texts: z.array(tText).max(60)})).min(1).max(30),
});
const templateBody = z.object({
  name: z.string().trim().min(2).max(120), category: z.enum(TEMPLATE_CATEGORIES), description: z.string().trim().max(500).default(''),
  premium: z.boolean().default(false), price: z.number().min(0).max(100000).default(0), active: z.boolean().default(true), sortOrder: z.number().int().min(-1000).max(100000).default(500),
  content: templateContent,
});

// ---------------------------------------------------------------- hazır şablonlar
const INK = '#33415c', SOFT = '#7b8aa3';
const h = (y, text, extra = {}) => ({x: 60, y, w: 880, text, size: 30, color: INK, bold: true, ...extra});
const label = (x, y, text, extra = {}) => ({x, y, w: 420, text, size: 18, color: SOFT, bold: true, ...extra});
const page = (template, texts, extra = {}) => ({template, texts, ...extra});
const BUILTIN = [
  {id: 'ders-klasik', name: 'Klasik ders notu', category: 'Ders notları', description: 'Ders, tarih ve konu başlıklı çizgili sayfalar. Her derse uyan sade düzen.', premium: false,
    content: {paper: 'lined', color: '#3a6ff7', cover: {pattern: 'theme'}, pages: [page('lined', [label(60, 40, 'DERS:'), label(520, 40, 'TARİH:'), label(60, 72, 'KONU:')]), page('lined', [])]}},
  {id: 'ders-ozet', name: 'Konu özeti', category: 'Ders notları', description: 'Anahtar kavramlar ve özet bölümleri olan kenar boşluklu sayfa.', premium: false,
    content: {paper: 'margin', color: '#1f9d7a', cover: {pattern: 'lined'}, pages: [page('margin', [h(40, 'Konu'), label(60, 420, 'ANAHTAR KAVRAMLAR'), label(60, 1000, 'ÖZET')])]}},
  {id: 'uni-planner', name: 'Üniversite planner', category: 'Üniversite planner', description: 'Dönem hedefleri, ders listesi ve haftalık plan: dönemin tek defterde.', premium: false,
    content: {paper: 'weekly', color: '#7c5cff', cover: {pattern: 'stars', label: 'Dönem planım'}, pages: [
      page('dotted', [h(40, 'Dönem hedeflerim'), label(60, 110, '1.'), label(60, 190, '2.'), label(60, 270, '3.'), label(60, 420, 'BU DÖNEM ALDIĞIM DERSLER')]),
      page('grid', [h(40, 'Ders listesi'), label(60, 100, 'DERS'), label(430, 100, 'HOCA'), label(700, 100, 'AKTS')]),
      page('weekly', [])]}},
  {id: 'cornell-klasik', name: 'Cornell not sistemi', category: 'Cornell Notes', description: 'Soru sütunu, not alanı ve alt özet: tekrar ederken kendini test et.', premium: false,
    content: {paper: 'cornell', color: '#d9467a', cover: {pattern: 'theme'}, pages: [page('cornell', [label(40, 40, 'ANAHTAR SORULAR', {w: 230, size: 15}), label(320, 40, 'NOTLAR', {size: 15}), label(40, 1150, 'ÖZET', {size: 15})]), page('cornell', [])]}},
  {id: 'cornell-kareli', name: 'Cornell kareli (sayısal)', category: 'Cornell Notes', description: 'Formül ve çözümler için kareli Cornell düzeni.', premium: false,
    content: {paper: 'cornell-grid', color: '#0ea5b7', cover: {pattern: 'grid'}, pages: [page('cornell-grid', [label(40, 40, 'SORULAR', {w: 230, size: 15}), label(320, 40, 'ÇÖZÜM', {size: 15}), label(40, 1150, 'ÖZET', {size: 15})])]}},
  {id: 'mat-formul', name: 'Formül ve çözüm defteri', category: 'Matematik', description: 'Kareli sayfada formüller, örnek çözümler ve hatalarım bölümü.', premium: false,
    content: {paper: 'grid', color: '#f08c00', cover: {pattern: 'grid'}, pages: [page('grid', [h(40, 'Formüller')]), page('grid', [h(40, 'Örnek çözümler')]), page('grid', [h(40, 'Hatalarım ve doğrusu')])]}},
  {id: 'mat-grafik', name: 'Fonksiyon ve grafik', category: 'Matematik', description: 'Koordinat düzlemi ve fonksiyon inceleme alanı.', premium: true,
    content: {paper: 'coordinate', color: '#e8590c', cover: {pattern: 'grid'}, pages: [page('coordinate', [label(60, 30, 'FONKSİYON:'), label(520, 30, 'TANIM KÜMESİ:')]), page('grid', [h(40, 'Türev / limit notları')])]}},
  {id: 'muh-hesap', name: 'Mühendislik hesap föyü', category: 'Mühendislik', description: 'Proje, hesaplayan, tarih ve sayfa alanlı mühendislik kareleri.', premium: true,
    content: {paper: 'engineering', color: '#2f9e44', cover: {pattern: 'grid'}, pages: [page('engineering', [label(40, 20, 'PROJE:', {size: 15}), label(420, 20, 'HESAPLAYAN:', {size: 15}), label(760, 20, 'TARİH:', {w: 200, size: 15})])]}},
  {id: 'muh-lab', name: 'Laboratuvar raporu', category: 'Mühendislik', description: 'Amaç, malzemeler, yöntem, veriler ve sonuç bölümleri.', premium: false,
    content: {paper: 'lab', color: '#12b886', cover: {pattern: 'theme'}, pages: [page('lab', [h(40, 'Deney:'), label(60, 110, 'AMAÇ'), label(60, 300, 'MALZEMELER'), label(60, 520, 'YÖNTEM'), label(60, 800, 'VERİLER'), label(60, 1150, 'SONUÇ')])]}},
  {id: 'tip-vaka', name: 'Klinik vaka notu', category: 'Tıp', description: 'Hasta, şikâyet, bulgular, ön tanı ve tedavi başlıkları.', premium: true,
    content: {paper: 'lined', color: '#c92a2a', cover: {pattern: 'hearts'}, pages: [page('lined', [h(30, 'Vaka'), label(60, 100, 'HASTA / YAŞ:'), label(60, 250, 'ŞİKÂYET'), label(60, 480, 'BULGULAR'), label(60, 800, 'ÖN TANI'), label(60, 1050, 'TEDAVİ / PLAN')])]}},
  {id: 'tip-terim', name: 'Anatomi terimleri', category: 'Tıp', description: 'Latince terim – Türkçe karşılık tablosu.', premium: false,
    content: {paper: 'vocabulary', color: '#e03131', cover: {pattern: 'theme'}, pages: [page('vocabulary', [label(60, 20, 'TERİM (LATİNCE)'), label(520, 20, 'ANLAMI')])]}},
  {id: 'hukuk-irac', name: 'Dava analizi (IRAC)', category: 'Hukuk', description: 'Olay, hukuki sorun, kural, uygulama ve sonuç düzeninde karar incelemesi.', premium: false,
    content: {paper: 'margin', color: '#5c3d2e', cover: {pattern: 'lined'}, pages: [page('margin', [h(30, 'Karar / Dava:'), label(110, 110, 'OLAY'), label(110, 380, 'HUKUKİ SORUN'), label(110, 600, 'KURAL / MEVZUAT'), label(110, 860, 'UYGULAMA'), label(110, 1150, 'SONUÇ')])]}},
  {id: 'gunluk-sayfa', name: 'Günlük sayfa', category: 'Günlük', description: 'Bugün nasılım, şükran listesi ve serbest notlar.', premium: false,
    content: {paper: 'dotted', color: '#e599f7', cover: {pattern: 'daisies'}, pages: [page('dotted', [h(40, 'Bugün'), label(60, 110, 'NASIL HİSSEDİYORUM?'), label(60, 330, 'MİNNETTAR OLDUKLARIM'), label(60, 620, 'NOTLAR')])]}},
  {id: 'haftalik', name: 'Haftalık plan', category: 'Haftalık plan', description: 'Haftalık çalışma planı ve haftanın hedefleri.', premium: false,
    content: {paper: 'weekly', color: '#4263eb', cover: {pattern: 'dotted'}, pages: [page('dotted', [h(40, 'Bu haftanın hedefleri'), label(60, 120, '☐'), label(60, 190, '☐'), label(60, 260, '☐')]), page('weekly', [])]}},
  {id: 'aylik', name: 'Aylık plan', category: 'Aylık plan', description: 'Ay görünümü, önemli tarihler ve aylık değerlendirme.', premium: true,
    content: {paper: 'grid-large', color: '#1098ad', cover: {pattern: 'clouds'}, pages: [page('grid-large', [h(30, 'Ay:'), ...['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d, i) => label(40 + i * 132, 100, d, {w: 120, size: 16}))]), page('lined', [h(40, 'Aylık değerlendirme')])]}},
  {id: 'sinav-plani', name: 'Sınav hazırlık planı', category: 'Sınav planı', description: 'Sınav bilgileri, konu listesi, geri sayım ve kontrol listesi.', premium: false,
    content: {paper: 'lined', color: '#d9480f', cover: {pattern: 'stars', label: 'Sınav planı'}, pages: [page('lined', [h(30, 'Sınav:'), label(60, 100, 'TARİH:'), label(520, 100, 'YER:'), label(60, 180, 'KONULAR'), label(60, 700, 'TEKRAR LİSTESİ'), label(60, 760, '☐'), label(60, 830, '☐'), label(60, 900, '☐')])]}},
  {id: 'minimal', name: 'Minimal', category: 'Minimal', description: 'Başlık yok, süs yok: noktalı sade sayfalar.', premium: false,
    content: {paper: 'dotted', color: '#495057', cover: {pattern: 'none'}, pages: [page('dotted', []), page('dotted', [])]}},
  {id: 'renkli-pastel', name: 'Pastel ders notu', category: 'Renkli', description: 'Krem kâğıt, pembe çizgiler ve kalpli kapak.', premium: true,
    content: {paper: 'lined', color: '#f783ac', cover: {pattern: 'hearts'}, pages: [page('lined', [h(40, 'Konu', {color: '#c2255c'})], {paperColor: '#fff8ef', lineColor: '#f3b7c7'})]}},
  {id: 'renkli-mint', name: 'Nane yeşili planner', category: 'Renkli', description: 'Nane yeşili kareli sayfalar ve papatya kapak.', premium: true,
    content: {paper: 'grid', color: '#20c997', cover: {pattern: 'daisies'}, pages: [page('grid', [h(40, 'Plan', {color: '#087f5b'})], {paperColor: '#f3fbf7', lineColor: '#b2e5d2'})]}},
];

export async function seedTemplates(pool) {
  const now = Date.now();
  for (const [i, t] of BUILTIN.entries()) {
    templateContent.parse(t.content);
    // Yöneticinin değişikliklerini ezmemek için yalnızca eksik olanlar eklenir.
    await pool.execute('INSERT IGNORE INTO templates (id,name,category,description,premium,price,uses,content,active,sort_order,builtin,created_at,updated_at) VALUES (?,?,?,?,?,0,0,?,1,?,1,?,?)',
      [t.id, t.name, t.category, t.description, t.premium ? 1 : 0, JSON.stringify(t.content), i * 10, now, now]);
  }
}

const toItem = (r, locked) => ({id: r.id, name: r.name, category: r.category, description: r.description, premium: !!r.premium, price: Number(r.price), uses: Number(r.uses), active: !!r.active, builtin: !!r.builtin, sortOrder: r.sort_order, locked, content: JSON.parse(r.content)});

export function createTemplates({pool}) {
  const router = Router();
  // Hazır şablonlar ilk istekte (bir kez) eklenir.
  let seeded = null;
  const ready = () => (seeded ||= seedTemplates(pool).catch(e => { seeded = null; throw e; }));
  router.use('/templates', (req, res, next) => { ready().then(() => next(), next); });
  const access = async userId => {
    const plan = await currentPlan(pool, userId);
    const [bought] = await pool.execute('SELECT template_id FROM template_purchases WHERE user_id=?', [userId]);
    return {premium: !!plan.features.premiumTemplates, bought: new Set(bought.map(b => b.template_id))};
  };
  router.get('/templates', async (req, res) => {
    const a = await access(req.user.id);
    const [rows] = await pool.execute('SELECT * FROM templates WHERE active=1 ORDER BY sort_order, name LIMIT 500');
    res.json({categories: TEMPLATE_CATEGORIES, premiumAccess: a.premium, items: rows.map(r => toItem(r, !!r.premium && !a.premium && !a.bought.has(r.id)))});
  });
  router.post('/templates/:id/use', async (req, res) => {
    const id = z.string().regex(/^[a-z0-9-]{1,40}$/).parse(req.params.id);
    await rateLimit(pool, 'template-use:' + req.user.id, 30, 60 * 1000, 'Çok hızlı şablon kullanıyorsun. Biraz bekle.');
    const [[t]] = await pool.execute('SELECT * FROM templates WHERE id=? AND active=1', [id]);
    if (!t) throw new HttpError(404, 'Şablon bulunamadı.');
    const a = await access(req.user.id);
    if (t.premium && !a.premium && !a.bought.has(t.id)) throw new HttpError(402, 'Bu premium şablonu kullanmak için planını yükselt.', 'PREMIUM_REQUIRED');
    await pool.execute('UPDATE templates SET uses=uses+1 WHERE id=?', [id]);
    res.json({content: JSON.parse(t.content)});
  });

  // Yönetim (admin router altında bağlanır)
  const admin = Router();
  admin.use('/templates', (req, res, next) => { ready().then(() => next(), next); });
  admin.get('/templates', async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM templates ORDER BY sort_order, name LIMIT 1000');
    res.json({categories: TEMPLATE_CATEGORIES, items: rows.map(r => toItem(r, false))});
  });
  admin.post('/templates', async (req, res) => {
    const b = templateBody.parse(req.body);
    const id = z.string().regex(/^[a-z0-9-]{2,40}$/, 'Kimlik yalnızca küçük harf, rakam ve tire içerebilir.').parse(req.body?.id);
    const now = Date.now();
    const [r] = await pool.execute('INSERT IGNORE INTO templates (id,name,category,description,premium,price,uses,content,active,sort_order,builtin,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,0,?,?)',
      [id, b.name, b.category, b.description, b.premium ? 1 : 0, b.price, JSON.stringify(b.content), b.active ? 1 : 0, b.sortOrder, now, now]);
    if (!r.affectedRows) throw new HttpError(409, 'Bu kimlikte bir şablon zaten var.');
    res.status(201).json({ok: true});
  });
  admin.patch('/templates/:id', async (req, res) => {
    const id = z.string().regex(/^[a-z0-9-]{1,40}$/).parse(req.params.id);
    const b = templateBody.partial().parse(req.body);
    const sets = [], vals = [];
    const map = {name: 'name', category: 'category', description: 'description', premium: 'premium', price: 'price', active: 'active', sortOrder: 'sort_order'};
    for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col}=?`); vals.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]); }
    if (b.content) { sets.push('content=?'); vals.push(JSON.stringify(b.content)); }
    if (!sets.length) return res.json({ok: true});
    const [r] = await pool.execute(`UPDATE templates SET ${sets.join(',')}, updated_at=? WHERE id=?`, [...vals, Date.now(), id]);
    if (!r.affectedRows) throw new HttpError(404, 'Şablon bulunamadı.');
    res.json({ok: true});
  });
  admin.delete('/templates/:id', async (req, res) => {
    const id = z.string().regex(/^[a-z0-9-]{1,40}$/).parse(req.params.id);
    // Hazır şablonlar silinmez, kapatılır (yeniden başlatınca geri gelmesin).
    const [[t]] = await pool.execute('SELECT builtin FROM templates WHERE id=?', [id]);
    if (!t) throw new HttpError(404, 'Şablon bulunamadı.');
    if (t.builtin) await pool.execute('UPDATE templates SET active=0, updated_at=? WHERE id=?', [Date.now(), id]);
    else await pool.execute('DELETE FROM templates WHERE id=?', [id]);
    res.json({ok: true});
  });
  return {router, admin};
}
