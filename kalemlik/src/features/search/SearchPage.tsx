// 🔎 Gelişmiş arama sayfası: tek alandan her şey. Sonuçlar: kategori, başlık, kaynak, tarih (+ eşleşen parça).
import {useEffect, useMemo, useRef, useState} from 'react';
import {Search, Star, X} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate, useLocation} from '@/app/router';
import {Badge, EmptyState, Switch} from '@/components/ui';
import {formatDate} from '@/lib/format';
import {allCourses} from '@/features/study/sources';
import {applyFilters, fold, searchLocal, searchServer, TYPE_LABELS, type ResultType, type SearchFilters, type SearchResult} from './search';

const FILTER_TYPES: ResultType[] = ['notebook', 'page', 'lesson', 'task', 'exam', 'card', 'quiz', 'plan', 'journal', 'recording', 'grade'];

function Highlight({text, q}: {text: string; q: string}) {
  const f = fold(text), w = fold(q.trim().split(/\s+/)[0] || '');
  const i = w ? f.indexOf(w) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
}

export function SearchPage() {
  const {query} = useLocation();
  const [q, setQ] = useState(query.get('q') || '');
  const [filters, setFilters] = useState<SearchFilters>({types: [], course: '', since: '', favorites: false});
  const [local, setLocal] = useState<SearchResult[]>([]);
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setLocal([]); setRemote([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      const found = await searchLocal(term);
      if (!alive) return;
      setLocal(found);
      navigate(`/ara?q=${encodeURIComponent(term)}`, {replace: true});
      const more = await searchServer(term, new Set(found.map(r => r.key)));
      if (alive) { setRemote(more); setBusy(false); }
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const results = useMemo(() => applyFilters([...local, ...remote], filters), [local, remote, filters]);
  const toggleType = (t: ResultType) => setFilters(f => ({...f, types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t]}));
  const counts = useMemo(() => { const m = new Map<ResultType, number>(); for (const r of [...local, ...remote]) m.set(r.type, (m.get(r.type) || 0) + 1); return m; }, [local, remote]);

  return (
    <div className="page">
      <PageHeader title="Ara" subtitle="Defterler, sayfalar, PDF’ler, el yazısı (aranabilir yapılmış), dersler, görevler, sınavlar, flashcardlar, günlük ve daha fazlası" />
      <div className="search-box">
        <Search size={20} />
        <input ref={input} className="search-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ör. mitoz, türev, fizik vize…" aria-label="Ara" />
        {q && <button type="button" className="icon-btn icon-btn-sm" aria-label="Temizle" onClick={() => { setQ(''); input.current?.focus(); }}><X size={18} /></button>}
      </div>
      <div className="search-filters">
        <div className="chip-row" role="group" aria-label="İçerik tipi">
          {FILTER_TYPES.map(t => <button key={t} type="button" className={`chip ${filters.types.includes(t) ? 'is-on' : ''}`} aria-pressed={filters.types.includes(t)} onClick={() => toggleType(t)}>{TYPE_LABELS[t]}{counts.get(t) ? ` · ${counts.get(t)}` : ''}</button>)}
        </div>
        <div className="row wrap">
          <select className="select select-sm" value={filters.course} onChange={e => setFilters({...filters, course: e.target.value})} aria-label="Ders">
            <option value="">Tüm dersler</option>
            {allCourses().map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select select-sm" value={filters.since} onChange={e => setFilters({...filters, since: e.target.value as SearchFilters['since']})} aria-label="Tarih">
            <option value="">Her zaman</option><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="180">Bu dönem (6 ay)</option>
          </select>
          <Switch label="Yalnızca favoriler" checked={filters.favorites} onChange={favorites => setFilters({...filters, favorites})} />
        </div>
      </div>
      {q.trim().length < 2 ? (
        <EmptyState icon={<Search size={28} />} title="Aramak istediğini yaz">El yazısı sayfalarını aranabilir yapmak için editörde <b>Diğer işlemler → Sayfayı aranabilir yap</b>.</EmptyState>
      ) : results.length ? (
        <div className="list-stack" aria-live="polite">
          <p className="muted small">{results.length} sonuç{busy ? ' · sunucuda da aranıyor…' : ''}</p>
          {results.slice(0, 200).map(r => (
            <a key={r.key} {...linkProps(r.link)} className="card list-row search-row">
              <span className="list-row-main">
                <span className="row wrap search-meta"><Badge tone={r.type === 'exam' ? 'danger' : r.type === 'page' || r.type === 'notebook' ? 'accent' : 'neutral'}>{TYPE_LABELS[r.type]}</Badge>{r.favorite && <Star size={14} className="fav-star" />}<span className="muted small">{r.source}</span>{r.date && <span className="muted small">· {formatDate(r.date, false)}</span>}</span>
                <strong><Highlight text={r.title} q={q} /></strong>
                {r.snippet && r.snippet !== r.title && <span className="muted small clamp-2"><Highlight text={r.snippet} q={q} /></span>}
              </span>
            </a>
          ))}
        </div>
      ) : busy ? <p className="muted">Aranıyor…</p> : <EmptyState icon={<Search size={28} />} title="Sonuç yok">Farklı bir kelime dene ya da filtreleri kaldır.</EmptyState>}
    </div>
  );
}
