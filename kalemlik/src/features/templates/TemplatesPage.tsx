// 🛍️ Şablon Mağazası: kategoriye göre hazır defter şablonları; önizleme, açıklama, kullanım sayısı, ücretsiz / premium.
// "Şablonu Kullan" yeni bir defter oluşturur (kâğıt, renk, kapak ve başlıklı sayfalar şablondan gelir).
import {useEffect, useMemo, useRef, useState} from 'react';
import {Crown, Eye, LayoutTemplate, Lock, Search, Users} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate} from '@/app/router';
import {Badge, Button, Dialog, EmptyState} from '@/components/ui';
import {toast} from '@/components/feedback';
import {api, ApiError} from '@/lib/api';
import {PAGE_H, PAGE_W, type PaperId, type CoverPattern} from '@/lib/constants';
import {shortId} from '@/lib/ids';
import type {PageContent} from '@/lib/types';
import {checkCapacity, createNotebook} from '@/features/notebooks/actions';
import {DEFAULT_COVER} from '@/features/notebooks/cover';

interface TText {x: number; y: number; w: number; text: string; size: number; color: string; bold?: boolean; font?: string}
export interface TemplateContent {paper: PaperId; color: string; cover: {pattern: CoverPattern; patternOpacity?: number; patternSize?: number; label?: string}; pages: {template: PaperId; paperColor?: string; lineColor?: string; texts: TText[]}[]}
export interface StoreTemplate {id: string; name: string; category: string; description: string; premium: boolean; price: number; uses: number; locked: boolean; content: TemplateContent}

export const templatePages = (c: TemplateContent): PageContent[] => c.pages.map(p => ({
  v: 1, template: p.template, width: PAGE_W, height: PAGE_H, strokes: [], stickers: [],
  ...(p.paperColor ? {paperColor: p.paperColor} : {}), ...(p.lineColor ? {lineColor: p.lineColor} : {}),
  texts: p.texts.map(t => ({id: shortId(), x: t.x, y: t.y, w: t.w, text: t.text, font: t.font || 'nunito', size: t.size, color: t.color, ...(t.bold ? {bold: true} : {})})),
}));

// Küçük resimler sırayla çizilir (aynı anda 20 sayfa çizip arayüzü dondurmamak için) ve bellekte tutulur.
const thumbs = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
function thumb(key: string, content: PageContent, width: number): Promise<string> {
  if (thumbs.has(key)) return Promise.resolve(thumbs.get(key)!);
  const job = queue.then(async () => {
    const {renderPage} = await import('@/features/editor/render');
    const c = await renderPage(content, width / content.width);
    const url = c.toDataURL('image/png');
    thumbs.set(key, url);
    return url;
  });
  queue = job.catch(() => {});
  return job;
}
function Thumb({id, page, index = 0, width = 220}: {id: string; page: PageContent; index?: number; width?: number}) {
  const [src, setSrc] = useState(thumbs.get(`${id}:${index}:${width}`) || '');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!src) void thumb(`${id}:${index}:${width}`, page, width).then(u => { if (alive.current) setSrc(u); }).catch(() => {});
    return () => { alive.current = false; };
  }, [id, index, width]); // eslint-disable-line react-hooks/exhaustive-deps
  return src ? <img className="tpl-thumb" src={src} alt="" /> : <span className="tpl-thumb tpl-thumb-wait" style={{background: page.paperColor || '#fff'}} />;
}

export function TemplatesPage() {
  const [data, setData] = useState<{categories: string[]; premiumAccess: boolean; items: StoreTemplate[]} | null>(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('');
  const [price, setPrice] = useState<'' | 'free' | 'premium'>('');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<StoreTemplate | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api<typeof data>('/api/templates').then(setData).catch(e => setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Şablon mağazası için internet bağlantısı gerekiyor.'));
  }, []);
  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return (data?.items || []).filter(t => (!cat || t.category === cat) && (!price || (price === 'premium') === t.premium)
      && (!needle || `${t.name} ${t.category} ${t.description}`.toLocaleLowerCase('tr').includes(needle)));
  }, [data, cat, price, q]);

  const use = async (t: StoreTemplate) => {
    if (t.locked) { navigate('/plan'); return; }
    if (!(await checkCapacity())) return;
    setBusy(t.id);
    try {
      const {content} = await api<{content: TemplateContent}>(`/api/templates/${t.id}/use`, {method: 'POST'});
      const nb = createNotebook({title: t.name, course: '', term: '', color: content.color, paper: content.paper,
        cover: {...DEFAULT_COVER, pattern: content.cover.pattern, ...(content.cover.patternOpacity ? {patternOpacity: content.cover.patternOpacity} : {}), ...(content.cover.patternSize ? {patternSize: content.cover.patternSize} : {}), label: content.cover.label || ''}},
        templatePages(content));
      toast(`“${t.name}” şablonuyla yeni defter oluşturuldu.`, 'success');
      navigate(`/defter/${nb.id}`);
    } catch (e) { toast(e instanceof Error ? e.message : 'Şablon kullanılamadı.', 'error'); } finally { setBusy(''); }
  };

  return (
    <div className="page">
      <PageHeader title="Şablonlar" subtitle="Hazır defter şablonlarıyla hemen başla: ders notu, Cornell, planner, sınav planı ve daha fazlası" />
      {error ? <EmptyState icon={<LayoutTemplate size={28} />} title="Şablonlar yüklenemedi">{error}</EmptyState> : !data ? <p className="muted">Yükleniyor…</p> : <>
        <div className="toolbar-row tpl-toolbar">
          <label className="search-box"><Search size={17} /><input className="input" type="search" placeholder="Şablon ara" value={q} onChange={e => setQ(e.target.value)} aria-label="Şablon ara" /></label>
          <div className="chip-row" role="group" aria-label="Fiyat">
            {([['', 'Tümü'], ['free', 'Ücretsiz'], ['premium', 'Premium']] as const).map(([v, l]) => <button key={v} type="button" className={`chip ${price === v ? 'is-on' : ''}`} aria-pressed={price === v} onClick={() => setPrice(v)}>{l}</button>)}
          </div>
        </div>
        <div className="chip-row tpl-cats" role="group" aria-label="Kategori">
          <button type="button" className={`chip ${!cat ? 'is-on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>Tüm kategoriler</button>
          {data.categories.map(c => <button key={c} type="button" className={`chip ${cat === c ? 'is-on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {items.length ? (
          <div className="tpl-grid">
            {items.map(t => {
              const pages = templatePages(t.content);
              return (
                <article key={t.id} className="card tpl-card" style={{'--c': t.content.color} as React.CSSProperties}>
                  <button type="button" className="tpl-preview" onClick={() => setPreview(t)} aria-label={`${t.name} önizleme`}>
                    <Thumb id={t.id} page={pages[0]} />
                    {pages.length > 1 && <span className="tpl-pages">{pages.length} sayfa</span>}
                    {t.premium && <span className={`tpl-premium ${t.locked ? 'is-locked' : ''}`}>{t.locked ? <Lock size={13} /> : <Crown size={13} />} Premium</span>}
                  </button>
                  <div className="tpl-body">
                    <strong className="tpl-name">{t.name}</strong>
                    <span className="row wrap tpl-meta"><Badge>{t.category}</Badge><span className="muted small"><Users size={12} /> {t.uses} kullanım</span>{t.price > 0 && <span className="muted small">{t.price.toLocaleString('tr', {minimumFractionDigits: 2})} ₺</span>}</span>
                    <p className="muted small tpl-desc">{t.description}</p>
                    <div className="row tpl-actions">
                      <Button size="sm" variant="ghost" icon={<Eye size={15} />} onClick={() => setPreview(t)}>Önizle</Button>
                      <Button size="sm" variant={t.locked ? 'secondary' : 'primary'} icon={t.locked ? <Lock size={15} /> : undefined} busy={busy === t.id} onClick={() => void use(t)}>{t.locked ? 'Planını yükselt' : 'Şablonu Kullan'}</Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState icon={<LayoutTemplate size={28} />} title="Şablon bulunamadı">Farklı bir kategori ya da arama dene.</EmptyState>}
      </>}
      {preview && (
        <Dialog open onClose={() => setPreview(null)} size="lg" title={preview.name}
          footer={<><Button variant="ghost" onClick={() => setPreview(null)}>Kapat</Button><Button variant="primary" busy={busy === preview.id} icon={preview.locked ? <Lock size={16} /> : undefined} onClick={() => void use(preview)}>{preview.locked ? 'Planını yükselt' : 'Şablonu Kullan'}</Button></>}>
          <p className="muted">{preview.category} · {preview.uses} kullanım{preview.premium ? ' · Premium' : ' · Ücretsiz'}</p>
          <p>{preview.description}</p>
          {preview.locked && <p className="notice notice-warn small">Bu premium şablon planında kapalı. Plus ya da Pro planla tüm premium şablonları kullanabilirsin.</p>}
          <div className="tpl-preview-pages">{templatePages(preview.content).map((pg, i) => <Thumb key={i} id={preview.id} page={pg} index={i} width={300} />)}</div>
        </Dialog>
      )}
    </div>
  );
}
