import {useMemo, useRef, useState} from 'react';
import {BookOpen, Copy, FileUp, LayoutGrid, List, MoreVertical, Palette, PenLine, Plus, RotateCcw, Search, Star, Trash2, X, CalendarClock, ListChecks} from 'lucide-react';
import type {Notebook} from '@/lib/types';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate} from '@/app/router';
import {Badge, Button, EmptyState, IconButton, Menu, Segmented} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {list, loadNotebookPages, notebookPages, remove, update, useList} from '@/lib/store';
import {DAYS, minutesOf, relativeDay, timeAgo, todayIso, weekday} from '@/lib/format';
import {CoverView} from './CoverView';
import {NotebookDialog} from './NotebookDialog';
import {CoverEditor} from './CoverEditor';
import {activeNotebooks, checkCapacity, createNotebook, deleteForever, duplicateNotebook, restoreNotebook, toggleFavorite, trashNotebook} from './actions';
import {usePlan} from '@/lib/plan';
import {PALETTE} from '@/lib/constants';
import {currentTerm} from '@/lib/format';

type Mode = 'all' | 'favorites' | 'trash';
type Sort = 'recent' | 'updated' | 'name';

function readPref<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}
function writePref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* yok */ } }

function Today() {
  const lessons = useList('lesson');
  const tasks = useList('task');
  const today = weekday(new Date());
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const todays = lessons.filter(l => l.day === today).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = tasks.filter(t => !t.done && t.dueDate >= todayIso()).sort((a, b) => (a.dueDate + a.dueTime).localeCompare(b.dueDate + b.dueTime)).slice(0, 3);
  const overdue = tasks.filter(t => !t.done && t.dueDate < todayIso()).length;
  if (!todays.length && !upcoming.length && !overdue) return null;
  return (
    <section className="today" aria-label="Bugün">
      <div className="today-col">
        <h3><CalendarClock size={18} /> Bugün · {DAYS[today]}</h3>
        {todays.length ? todays.map(l => {
          const live = now >= minutesOf(l.start) && now < minutesOf(l.end);
          return <a key={l.id} {...linkProps('/program')} className={`today-item ${live ? 'is-live' : ''}`} style={{'--c': l.color} as React.CSSProperties}><b>{l.start}</b><span>{l.title}</span>{l.room && <small>{l.room}</small>}{live && <Badge tone="success">Şimdi</Badge>}</a>;
        }) : <p className="muted small">Bugün dersin yok.</p>}
      </div>
      <div className="today-col">
        <h3><ListChecks size={18} /> Yaklaşan {overdue > 0 && <Badge tone="danger">{overdue} gecikmiş</Badge>}</h3>
        {upcoming.length ? upcoming.map(t => <a key={t.id} {...linkProps('/gorevler')} className="today-item" style={{'--c': t.color} as React.CSSProperties}><b>{relativeDay(t.dueDate)}</b><span>{t.title}</span><small>{t.category === 'exam' ? 'Sınav' : t.category === 'homework' ? 'Ödev' : 'Yapılacak'}</small></a>) : <p className="muted small">Yaklaşan ödev veya sınav yok.</p>}
      </div>
    </section>
  );
}

function NotebookCard({nb, mode, view, onEdit, onCover}: {nb: Notebook; mode: Mode; view: 'grid' | 'list'; onEdit: () => void; onCover: () => void}) {
  const pages = useList('page').filter(p => p.notebookId === nb.id).length;
  const [menu, setMenu] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const open = () => { if (mode !== 'trash') navigate(`/defter/${nb.id}`); };
  return (
    <article className={`nb-card nb-${view}`}>
      <button type="button" className="nb-open" onClick={open} aria-label={`${nb.title} defterini aç`} disabled={mode === 'trash'}>
        <CoverView nb={nb} className="nb-cover" />
      </button>
      <div className="nb-info">
        <div className="nb-title-row">
          <h3 title={nb.title}>{nb.title}</h3>
          {mode !== 'trash' && <IconButton size="sm" label={nb.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'} active={nb.favorite} onClick={() => toggleFavorite(nb)}><Star size={17} fill={nb.favorite ? 'currentColor' : 'none'} /></IconButton>}
          <IconButton size="sm" ref={btn} label="Defter işlemleri" onClick={() => setMenu(true)}><MoreVertical size={18} /></IconButton>
        </div>
        <p className="nb-meta">{[nb.course, nb.term].filter(Boolean).join(' · ') || 'Ders belirtilmemiş'}</p>
        <p className="nb-meta muted">{pages} sayfa · {mode === 'trash' && nb.trashedAt ? `silindi ${timeAgo(nb.trashedAt)}` : timeAgo(nb.updatedAt)}</p>
      </div>
      <Menu anchor={btn.current} open={menu} onClose={() => setMenu(false)} label="Defter işlemleri" items={mode === 'trash' ? [
        {label: 'Geri getir', icon: <RotateCcw size={17} />, onSelect: () => void restoreNotebook(nb)},
        {label: 'Kalıcı olarak sil', icon: <Trash2 size={17} />, danger: true, onSelect: () => void deleteForever(nb)},
      ] : [
        {label: 'Aç', icon: <BookOpen size={17} />, onSelect: open},
        {label: 'Bilgileri düzenle / yeniden adlandır', icon: <PenLine size={17} />, onSelect: onEdit},
        {label: 'Kapağı tasarla', icon: <Palette size={17} />, onSelect: onCover},
        {label: nb.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', icon: <Star size={17} />, onSelect: () => toggleFavorite(nb)},
        {label: 'Kopyasını oluştur', icon: <Copy size={17} />, onSelect: () => void duplicateNotebook(nb, id => loadNotebookPages(id))},
        'sep',
        {label: 'Çöp kutusuna taşı', icon: <Trash2 size={17} />, danger: true, onSelect: () => trashNotebook(nb)},
      ]} />
    </article>
  );
}

export function NotebooksPage({mode}: {mode: Mode}) {
  const notebooks = useList('notebook');
  const plan = usePlan();
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<Sort>(() => readPref('klm:sort', 'recent'));
  const [view, setView] = useState<'grid' | 'list'>(() => readPref('klm:view', 'grid'));
  const [dialog, setDialog] = useState<{mode: 'create' | 'edit'; nb?: Notebook} | null>(null);
  const [coverFor, setCoverFor] = useState<Notebook | null>(null);
  const [importing, setImporting] = useState('');
  const pdfInput = useRef<HTMLInputElement>(null);

  const scoped = notebooks.filter(n => mode === 'trash' ? n.trashedAt !== null : n.trashedAt === null && (mode !== 'favorites' || n.favorite));
  const courses = [...new Set(scoped.map(n => n.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const terms = [...new Set(scoped.map(n => n.term).filter(Boolean))];
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return scoped
      .filter(n => (!course || n.course === course) && (!term || n.term === term))
      .filter(n => !q || `${n.title} ${n.course} ${n.term}`.toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'tr') : sort === 'updated' ? b.updatedAt - a.updatedAt : (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  }, [scoped, query, course, term, sort]);

  const create = async () => { if (await checkCapacity()) setDialog({mode: 'create'}); };
  const importPdfFile = async (file: File) => {
    if (!(await checkCapacity())) return;
    setImporting('PDF hazırlanıyor…');
    try {
      const {importPdf} = await import('@/features/editor/pdf');
      const pages = await importPdf(file, (d, t) => setImporting(`PDF sayfaları hazırlanıyor: ${d} / ${t}`));
      const nb = createNotebook({title: file.name.replace(/\.pdf$/i, '').slice(0, 160) || 'PDF', course: '', term: currentTerm(), color: PALETTE[3], paper: 'blank'}, pages);
      toast(`${pages.length} sayfalık PDF deftere dönüştü. Üzerine yazabilirsin.`, 'success');
      navigate(`/defter/${nb.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'PDF içe aktarılamadı.', 'error');
    } finally { setImporting(''); }
  };
  const emptyTrash = async () => {
    const trashed = list('notebook').filter(n => n.trashedAt !== null);
    const ok = await confirmDialog({title: 'Çöp kutusu boşaltılsın mı?', message: `${trashed.length} defter ve tüm sayfaları kalıcı olarak silinir. Bu işlem geri alınamaz.`, confirmLabel: 'Çöpü boşalt', danger: true});
    if (!ok) return;
    for (const nb of trashed) { for (const p of notebookPages(nb.id)) remove('page', p.id); remove('notebook', nb.id); }
    toast('Çöp kutusu boşaltıldı.', 'success');
  };

  const titles = {all: 'Defterlerim', favorites: 'Favoriler', trash: 'Çöp Kutusu'};
  const limit = plan?.plan.notebookLimit;
  const subtitle = mode === 'all' ? (limit ? <span>{activeNotebooks().length} / {limit} defter · {plan?.plan.name} plan</span> : `${scoped.length} defter`)
    : mode === 'favorites' ? 'Yıldızladığın defterler' : 'Çöpteki defterler plan sınırına sayılmaz. Geri getirebilir ya da kalıcı silebilirsin.';

  return (
    <div className="page">
      <PageHeader title={titles[mode]} subtitle={subtitle} actions={mode === 'trash' ? (scoped.length > 0 && <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => void emptyTrash()}>Çöpü boşalt</Button>) : (
        <>
          <Button icon={<FileUp size={18} />} onClick={() => pdfInput.current?.click()} busy={!!importing}>PDF içe aktar</Button>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => void create()}>Yeni defter</Button>
          <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importPdfFile(f); }} />
        </>
      )} />
      {importing && <div className="notice notice-progress" role="status"><span className="spinner" /> {importing}</div>}
      {mode === 'all' && <Today />}
      {scoped.length > 0 && (
        <div className="toolbar-row">
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Defterlerde ara" aria-label="Defterlerde ara" />
            {query && <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery('')}><X size={16} /></button>}
          </label>
          {courses.length > 1 && <select className="select select-sm" value={course} onChange={e => setCourse(e.target.value)} aria-label="Derse göre süz"><option value="">Tüm dersler</option>{courses.map(c => <option key={c}>{c}</option>)}</select>}
          {terms.length > 1 && <select className="select select-sm" value={term} onChange={e => setTerm(e.target.value)} aria-label="Döneme göre süz"><option value="">Tüm dönemler</option>{terms.map(t => <option key={t}>{t}</option>)}</select>}
          <select className="select select-sm" value={sort} onChange={e => { setSort(e.target.value as Sort); writePref('klm:sort', e.target.value); }} aria-label="Sırala">
            <option value="recent">Son açılan</option><option value="updated">Son değişen</option><option value="name">Ada göre</option>
          </select>
          <Segmented size="sm" label="Görünüm" value={view} onChange={v => { setView(v); writePref('klm:view', v); }} options={[{value: 'grid', label: <LayoutGrid size={16} />, title: 'Kart görünümü'}, {value: 'list', label: <List size={16} />, title: 'Liste görünümü'}]} />
        </div>
      )}
      {shown.length ? (
        <div className={view === 'grid' ? 'nb-grid' : 'nb-list'}>
          {shown.map(nb => <NotebookCard key={nb.id} nb={nb} mode={mode} view={view} onEdit={() => setDialog({mode: 'edit', nb})} onCover={() => setCoverFor(nb)} />)}
        </div>
      ) : scoped.length ? (
        <EmptyState icon={<Search size={28} />} title="Eşleşen defter yok">Aramayı ya da süzgeçleri değiştir.</EmptyState>
      ) : mode === 'all' ? (
        <EmptyState icon={<BookOpen size={28} />} title="İlk defterini oluştur" action={<div className="row"><Button variant="primary" icon={<Plus size={18} />} onClick={() => void create()}>Yeni defter</Button><Button icon={<FileUp size={18} />} onClick={() => pdfInput.current?.click()}>PDF içe aktar</Button></div>}>
          Her ders için bir defter aç; şablonunu seç, kalemle ya da klavyeyle yaz. Ders slaytlarını PDF olarak içe aktarıp üzerine not alabilirsin.
        </EmptyState>
      ) : mode === 'favorites' ? (
        <EmptyState icon={<Star size={28} />} title="Henüz favori yok">Sık kullandığın defterlerin kartındaki yıldıza dokun.</EmptyState>
      ) : (
        <EmptyState icon={<Trash2 size={28} />} title="Çöp kutusu boş" />
      )}
      <NotebookDialog open={!!dialog} mode={dialog?.mode || 'create'} initial={dialog?.nb} onClose={() => setDialog(null)} onSave={v => {
        if (dialog?.mode === 'edit' && dialog.nb) { update('notebook', dialog.nb.id, v); toast('Defter bilgileri kaydedildi.', 'success'); }
        else { const nb = createNotebook(v); navigate(`/defter/${nb.id}`); }
      }} />
      {coverFor && <CoverEditor notebookId={coverFor.id} open onClose={() => setCoverFor(null)} />}
    </div>
  );
}
