// Deste: kartları düzenle, çalış (kartı çevir → Tekrar / Zor / Orta / Kolay), ilerlemeyi gör, desteden quiz üret.
import {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, Check, Pencil, Play, Plus, RotateCcw, Target, Trash2, WandSparkles, X} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate, useLocation} from '@/app/router';
import {Badge, Button, Dialog, EmptyState, Field, ProgressBar} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {put, remove, update, useList, useRecord} from '@/lib/store';
import {uuid} from '@/lib/ids';
import type {Card} from '@/lib/types';
import {deckProgress, GRADES, isMastered, nextLabel, NEW_CARD, studyQueue} from './srs';
import {allCourses} from './sources';
import {courseColor, deleteDeck, gradeCard} from './actions';
import {openGenerate} from './GenerateDialog';

export function DeckPage({id}: {id: string}) {
  const deck = useRecord('deck', id);
  const all = useList('card');
  const cards = useMemo(() => all.filter(c => c.deckId === id).sort((a, b) => a.createdAt - b.createdAt), [all, id]);
  const {query} = useLocation();
  const [editDeck, setEditDeck] = useState(query.get('duzenle') === '1');
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [session, setSession] = useState<string[] | null>(null);
  if (!deck) return <div className="page"><EmptyState icon={<X size={28} />} title="Deste bulunamadı" action={<Button onClick={() => navigate('/calisma')}>Çalışmaya dön</Button>} /></div>;
  const pr = deckProgress(cards);
  const start = (all = false) => {
    const q = all ? cards.map(c => c.id) : studyQueue(cards).map(c => c.id);
    if (!q.length) { toast('Şu an tekrar zamanı gelen kart yok. Tümünü çalışabilirsin.', 'info'); return; }
    setSession(q);
  };
  if (session) return <StudySession ids={session} onExit={() => setSession(null)} title={deck.title} />;

  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/calisma')}><ArrowLeft size={18} /> Çalışma</button>
      <PageHeader title={deck.title} subtitle={`${deck.course || 'Ders yok'} · ${cards.length} kart${deck.source ? ` · Kaynak: ${deck.source}` : ''}`} actions={<>
        <Button variant="ghost" icon={<Pencil size={17} />} onClick={() => setEditDeck(true)}>Düzenle</Button>
        <Button icon={<Target size={17} />} disabled={cards.length < 2} onClick={() => openGenerate({kind: 'quiz', source: {kind: 'deck', id}})}>Quiz oluştur</Button>
        <Button variant="primary" icon={<Play size={17} />} onClick={() => start()} disabled={!cards.length}>{pr.due ? `Çalış (${pr.due})` : 'Çalış'}</Button>
      </>} />
      <div className="card card-pad stack">
        <div className="row"><strong>İlerleme %{pr.percent}</strong><span className="spacer" /><span className="muted small">{pr.learned} öğrenildi · {pr.mastered} kalıcı · {pr.due} bekliyor</span></div>
        <ProgressBar value={pr.percent} max={100} label="Deste ilerlemesi" />
        {cards.length > 0 && pr.due === 0 && <Button size="sm" variant="ghost" icon={<RotateCcw size={16} />} onClick={() => start(true)}>Tüm kartları yine de çalış</Button>}
      </div>
      <div className="row wrap">
        <Button icon={<Plus size={17} />} onClick={() => setEditing('new')}>Kart ekle</Button>
        <Button variant="ghost" icon={<WandSparkles size={17} />} onClick={() => openGenerate({kind: 'flashcards', deckId: id})}>Notlardan kart üret</Button>
      </div>
      {cards.length ? (
        <div className="list-stack">
          {cards.map((c, i) => (
            <button key={c.id} type="button" className="card list-row card-row" onClick={() => setEditing(c)}>
              <span className="card-num">{i + 1}</span>
              <span className="list-row-main"><strong>{c.front}</strong><span className="muted small clamp-2">{c.back}</span></span>
              {c.topic && <Badge>{c.topic}</Badge>}
              {isMastered(c) ? <Badge tone="success">Kalıcı</Badge> : c.reps ? <Badge tone="accent">Öğreniliyor</Badge> : <Badge>Yeni</Badge>}
            </button>
          ))}
        </div>
      ) : <EmptyState icon={<Plus size={28} />} title="Destede kart yok">Kart ekle ya da notlarından otomatik üret.</EmptyState>}
      {editing && <CardDialog deckId={id} card={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {editDeck && <DeckDialog id={id} onClose={() => setEditDeck(false)} />}
    </div>
  );
}

function CardDialog({deckId, card, onClose}: {deckId: string; card: Card | null; onClose: () => void}) {
  const [front, setFront] = useState(card?.front || '');
  const [back, setBack] = useState(card?.back || '');
  const [topic, setTopic] = useState(card?.topic || '');
  const save = (again = false) => {
    if (!front.trim()) return;
    if (card) update('card', card.id, {front: front.trim(), back: back.trim(), topic: topic.trim()});
    else put('card', {id: uuid(), deckId, front: front.trim(), back: back.trim(), topic: topic.trim(), ...NEW_CARD});
    if (again) { setFront(''); setBack(''); } else onClose();
  };
  return (
    <Dialog open onClose={onClose} title={card ? 'Kartı düzenle' : 'Yeni kart'} footer={<>
      {card && <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={() => { remove('card', card.id); onClose(); }}>Sil</Button>}
      <span className="spacer" />
      {!card && <Button variant="ghost" onClick={() => save(true)} disabled={!front.trim()}>Kaydet ve yeni</Button>}
      <Button variant="primary" onClick={() => save()} disabled={!front.trim()}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label="Ön yüz (soru)" htmlFor="cd-front"><textarea id="cd-front" className="textarea" rows={3} value={front} maxLength={4000} onChange={e => setFront(e.target.value)} autoFocus /></Field>
        <Field label="Arka yüz (cevap)" htmlFor="cd-back"><textarea id="cd-back" className="textarea" rows={4} value={back} maxLength={4000} onChange={e => setBack(e.target.value)} /></Field>
        <Field label="Konu (isteğe bağlı)" htmlFor="cd-topic"><input id="cd-topic" className="input" value={topic} maxLength={120} onChange={e => setTopic(e.target.value)} placeholder="ör. Türev kuralları" /></Field>
      </form>
    </Dialog>
  );
}

function DeckDialog({id, onClose}: {id: string; onClose: () => void}) {
  const deck = useRecord('deck', id)!;
  const [title, setTitle] = useState(deck.title);
  const [course, setCourse] = useState(deck.course);
  const save = () => { update('deck', id, {title: title.trim() || deck.title, course: course.trim(), color: course.trim() ? courseColor(course.trim()) : deck.color}); onClose(); };
  return (
    <Dialog open onClose={onClose} title="Desteyi düzenle" footer={<>
      <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => {
        if (await confirmDialog({title: 'Deste silinsin mi?', message: `"${deck.title}" ve içindeki kartlar silinecek.`, confirmLabel: 'Sil', danger: true})) { deleteDeck(deck); navigate('/calisma'); }
      }}>Desteyi sil</Button>
      <span className="spacer" />
      <Button variant="primary" onClick={save}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label="Deste adı" htmlFor="dk-title"><input id="dk-title" className="input" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Ders" htmlFor="dk-course"><input id="dk-course" className="input" list="dk-courses" value={course} maxLength={120} onChange={e => setCourse(e.target.value)} /></Field>
        <datalist id="dk-courses">{allCourses().map(c => <option key={c} value={c} />)}</datalist>
      </form>
    </Dialog>
  );
}

/** Çalışma oturumu: kartı çevir, kendini değerlendir; "Tekrar" dediğin kart oturumun sonunda yeniden gelir. */
export function StudySession({ids, onExit, title}: {ids: string[]; onExit: () => void; title: string}) {
  const all = useList('card');
  const [queue, setQueue] = useState(ids);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({seen: 0, good: 0, again: 0});
  const card = all.find(c => c.id === queue[0]);
  const grade = (g: 0 | 1 | 2 | 3) => {
    if (!card) return;
    gradeCard(card, g);
    setStats(s => ({seen: s.seen + 1, good: s.good + (g >= 2 ? 1 : 0), again: s.again + (g === 0 ? 1 : 0)}));
    setQueue(q => (g === 0 ? [...q.slice(1), q[0]] : q.slice(1)));
    setFlipped(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) grade((Number(e.key) - 1) as 0 | 1 | 2 | 3);
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const total = ids.length;
  const doneN = total - new Set(queue).size;
  if (!card) {
    return (
      <div className="page page-narrow">
        <div className="card card-pad study-done stack">
          <Check size={40} />
          <h2>Oturum tamamlandı!</h2>
          <p className="muted">{stats.seen} değerlendirme · {stats.good} doğru · {stats.again} tekrar</p>
          <Button variant="primary" onClick={onExit}>Desteye dön</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="page page-narrow study-session">
      <div className="row"><button type="button" className="back-link" onClick={onExit}><X size={18} /> Bitir</button><span className="spacer" /><span className="muted small">{title} · {doneN}/{total}</span></div>
      <ProgressBar value={doneN} max={total} label="Oturum ilerlemesi" />
      <button type="button" className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(f => !f)} aria-label={flipped ? 'Kartın ön yüzünü göster' : 'Kartı çevir'}>
        <span className="flashcard-inner">
          <span className="flashcard-face flashcard-front"><span className="muted small">{card.topic || 'Soru'}</span><span className="flashcard-text">{card.front}</span><span className="muted small">Çevirmek için dokun</span></span>
          <span className="flashcard-face flashcard-back"><span className="muted small">Cevap</span><span className="flashcard-text">{card.back || '—'}</span></span>
        </span>
      </button>
      {flipped ? (
        <div className="grade-row">
          {GRADES.map(g => (
            <button key={g.grade} type="button" className={`grade-btn tone-${g.tone}`} onClick={() => grade(g.grade)}>
              <strong>{g.label}</strong><span className="small">{nextLabel(card, g.grade)}</span>
            </button>
          ))}
        </div>
      ) : <Button variant="primary" size="lg" onClick={() => setFlipped(true)}>Cevabı göster</Button>}
    </div>
  );
}
