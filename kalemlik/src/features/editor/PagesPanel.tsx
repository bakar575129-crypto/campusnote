import {memo, useEffect, useState} from 'react';
import {ArrowDown, ArrowUp, Copy, Plus, Trash2, X} from 'lucide-react';
import type {Notebook, Page} from '@/lib/types';
import {IconButton} from '@/components/ui';
import {CoverView} from '@/features/notebooks/CoverView';
import {renderPage} from './render';

const thumbCache = new Map<string, string>();

const Thumb = memo(function Thumb({page}: {page: Page}) {
  const key = `${page.id}:${page.updatedAt}:${page.content ? 1 : 0}`;
  const [url, setUrl] = useState(thumbCache.get(key) || '');
  useEffect(() => {
    if (!page.content || thumbCache.has(key)) { setUrl(thumbCache.get(key) || ''); return; }
    let alive = true;
    const t = setTimeout(() => {
      void renderPage(page.content!, 0.16).then(c => {
        const u = c.toDataURL('image/jpeg', 0.7);
        thumbCache.set(key, u);
        if (alive) setUrl(u);
      });
    }, 50);
    return () => { alive = false; clearTimeout(t); };
  }, [key, page.content]);
  const ratio = page.content ? page.content.height / page.content.width : 1.414;
  return <div className="page-thumb" style={{aspectRatio: `1 / ${ratio}`}}>{url ? <img src={url} alt="" /> : <span className="spinner" />}</div>;
});

interface Props {
  notebook: Notebook;
  pages: Page[];
  current: number;
  onGo(index: number): void;
  onAddAfter(index: number): void;
  onDuplicate(index: number): void;
  onDelete(index: number): void;
  onMove(index: number, dir: -1 | 1): void;
  onClose(): void;
}

/** Sayfa gezgini: küçük resimler, sırala, çoğalt, sil, araya sayfa ekle. */
export function PagesPanel({notebook, pages, current, onGo, onAddAfter, onDuplicate, onDelete, onMove, onClose}: Props) {
  return (
    <aside className="pages-panel" aria-label="Sayfalar">
      <header><h2>Sayfalar <span className="muted">{pages.length}</span></h2><IconButton label="Kapat" onClick={onClose}><X size={20} /></IconButton></header>
      <div className="pages-list">
        <button type="button" className={`pages-item ${current === 0 ? 'is-current' : ''}`} onClick={() => onGo(0)} aria-label="Kapak">
          <CoverView nb={notebook} className="page-thumb" />
          <span className="pages-num">Kapak</span>
        </button>
        {pages.map((p, i) => (
          <div key={p.id} className={`pages-item ${current === i + 1 ? 'is-current' : ''}`}>
            <button type="button" className="pages-open" onClick={() => onGo(i + 1)} aria-label={`Sayfa ${i + 1}`}><Thumb page={p} /></button>
            <span className="pages-num">{i + 1}</span>
            <div className="pages-actions">
              <IconButton size="sm" label="Yukarı taşı" disabled={i === 0} onClick={() => onMove(i + 1, -1)}><ArrowUp size={15} /></IconButton>
              <IconButton size="sm" label="Aşağı taşı" disabled={i === pages.length - 1} onClick={() => onMove(i + 1, 1)}><ArrowDown size={15} /></IconButton>
              <IconButton size="sm" label="Çoğalt" onClick={() => onDuplicate(i + 1)}><Copy size={15} /></IconButton>
              <IconButton size="sm" label="Arkasına sayfa ekle" onClick={() => onAddAfter(i + 1)}><Plus size={15} /></IconButton>
              <IconButton size="sm" label="Sil" disabled={pages.length <= 1} onClick={() => onDelete(i + 1)}><Trash2 size={15} /></IconButton>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
