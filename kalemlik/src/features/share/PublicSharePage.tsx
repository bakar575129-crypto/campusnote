// Paylaşılan not (/share/note/<bağlantı>): giriş gerekmez. Başlık, ders, oluşturan, tarih, sayfa önizlemeleri ve
// (izin verildiyse) PDF olarak indirme. İçerik sunucuda yetki kontrolünden geçer; yalnızca paylaşılan sayfalar gelir.
import {useEffect, useState} from 'react';
import {Download, LogIn, NotebookPen} from 'lucide-react';
import {Brand} from '@/components/Brand';
import {Button, EmptyState} from '@/components/ui';
import {toast} from '@/components/feedback';
import {navigate} from '@/app/router';
import {api} from '@/lib/api';
import {primeFileUrl} from '@/lib/files';
import {formatDate, isoDate} from '@/lib/format';
import type {Cover, Notebook, PageContent} from '@/lib/types';

interface Shared {id: string; title: string; course: string; term: string; color: string; paper: Notebook['paper']; cover: Cover; owner: string; allowDownload: boolean; pageOnly: boolean; updatedAt: number; pages: {id: string; content: PageContent}[]}

export function PublicSharePage({id, signedIn}: {id: string; signedIn: boolean}) {
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api<Shared>(`/api/public/share/${id}`);
        const fileIds = new Set<string>();
        for (const p of d.pages) { if (p.content.background) fileIds.add(p.content.background.fileId); for (const s of p.content.stickers) if (s.fileId) fileIds.add(s.fileId); }
        for (const s of d.cover.stickers) if (s.fileId) fileIds.add(s.fileId);
        await Promise.all([...fileIds].map(async f => {
          const r = await fetch(`/api/public/share/${id}/files/${f}`);
          if (r.ok) primeFileUrl(f, URL.createObjectURL(await r.blob()));
        }));
        if (!alive) return;
        setData(d);
        document.title = `${d.title} · Kalemlik`;
        const {renderPage} = await import('@/features/editor/render');
        const out: string[] = [];
        for (const p of d.pages) {
          const c = await renderPage(p.content, Math.min(1, 900 / p.content.width));
          out.push(c.toDataURL('image/jpeg', 0.85));
          if (alive) setPreviews([...out]);
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Paylaşım açılamadı.'); }
    })();
    return () => { alive = false; };
  }, [id]);
  const download = async () => {
    if (!data) return;
    setBusy('PDF hazırlanıyor…');
    try {
      const {exportPdf} = await import('@/features/editor/pdf');
      const nb = {id: data.id, title: data.title, course: data.course, term: data.term, color: data.color, paper: data.paper, cover: data.cover, favorite: false, trashedAt: null, lastOpenedAt: null, rev: 0, createdAt: 0, updatedAt: data.updatedAt} as Notebook;
      await exportPdf(nb, data.pages.map(p => p.content), {cover: !data.pageOnly}, (d, t) => setBusy(`PDF hazırlanıyor: ${d} / ${t}`));
    } catch (e) { toast(e instanceof Error ? e.message : 'PDF oluşturulamadı.', 'error'); } finally { setBusy(''); }
  };
  return (
    <div className="public-share">
      <header className="public-head">
        <Brand />
        <span className="spacer" />
        {signedIn ? <Button size="sm" onClick={() => navigate('/')}>Kalemlik’e dön</Button> : <Button size="sm" variant="primary" icon={<LogIn size={16} />} onClick={() => navigate('/kayit')}>Ücretsiz kaydol</Button>}
      </header>
      {error ? <EmptyState icon={<NotebookPen size={28} />} title="Paylaşım açılamadı">{error}</EmptyState> : !data ? <p className="muted public-loading"><span className="spinner" /> Yükleniyor…</p> : (
        <main className="public-main">
          <div className="public-title" style={{'--c': data.color} as React.CSSProperties}>
            <h1>{data.title}</h1>
            <p className="muted">{[data.course, data.term].filter(Boolean).join(' · ')}{data.course || data.term ? ' · ' : ''}Oluşturan: <strong>{data.owner}</strong> · {formatDate(isoDate(new Date(data.updatedAt)))} · {data.pages.length} sayfa</p>
            {data.allowDownload && <Button icon={<Download size={17} />} busy={!!busy} onClick={() => void download()}>{busy || 'PDF olarak indir'}</Button>}
          </div>
          <div className="public-pages">
            {data.pages.map((p, i) => previews[i]
              ? <img key={p.id} className="public-page" src={previews[i]} alt={`Sayfa ${i + 1}`} loading="lazy" />
              : <div key={p.id} className="public-page public-page-wait" style={{aspectRatio: `${p.content.width} / ${p.content.height}`}}><span className="spinner" /></div>)}
          </div>
          <p className="muted small public-foot">Bu not Kalemlik ile hazırlandı. El yazısıyla not al, PDF’lerin üzerine yaz, flashcard ve quizlerle çalış.</p>
        </main>
      )}
    </div>
  );
}
