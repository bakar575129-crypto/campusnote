// "🪄 Flashcard oluştur" ve "🎯 Quiz oluştur": defter, PDF, deste, ders kaydı, dersin tamamı ya da yapıştırılan
// metinden. Uygulamanın her yerinden openGenerate(...) ile açılır; pencere App kökünde tek yerde durur.
import {useEffect, useState, useSyncExternalStore} from 'react';
import {Sparkles, WandSparkles, Target} from 'lucide-react';
import {Button, Dialog, Field, Segmented} from '@/components/ui';
import {toast} from '@/components/feedback';
import {navigate} from '@/app/router';
import {list} from '@/lib/store';
import type {Difficulty, QuestionType} from '@/lib/types';
import {loadSource, sourceOptions, allCourses, type SourceKind} from './sources';
import {generateCards, generateQuiz, useAiStatus} from './generate';
import {addCards, createDeck, createQuiz} from './actions';

type Kind = 'flashcards' | 'quiz';
interface Req {kind: Kind; source?: {kind: SourceKind; id: string}; deckId?: string; text?: string; title?: string; course?: string}
let req: Req | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const s of subs) s(); };
export function openGenerate(r: Req) { req = r; emit(); }
const close = () => { req = null; emit(); };

const COUNTS = ['5', '10', '20', '50'] as const;
const TYPES: {value: QuestionType; label: string}[] = [{value: 'mcq', label: 'Çoktan seçmeli'}, {value: 'tf', label: 'Doğru / Yanlış'}, {value: 'fill', label: 'Boşluk doldurma'}];

export function GenerateHost() {
  const current = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => req);
  return current ? <GenerateDialog key={JSON.stringify(current)} req={current} /> : null;
}

function GenerateDialog({req: r}: {req: Req}) {
  const ai = useAiStatus();
  const groups = sourceOptions();
  const first = r.text ? 'text:' : r.source ? `${r.source.kind}:${r.source.id}` : groups[0]?.items[0] ? `${groups[0].items[0].kind}:${groups[0].items[0].id}` : 'text:';
  const [src, setSrc] = useState(first);
  const [text, setText] = useState(r.text || '');
  const [count, setCount] = useState<typeof COUNTS[number]>(r.kind === 'quiz' ? '10' : '20');
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [types, setTypes] = useState<QuestionType[]>(['mcq', 'tf']);
  const [deckTarget, setDeckTarget] = useState(r.deckId || 'new');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [kindSel, id] = src.split(/:(.*)/s) as [SourceKind, string];
  const ref = groups.flatMap(g => g.items).find(i => i.kind === kindSel && i.id === id);
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  useEffect(() => { setTitle(ref ? ref.label : r.title || ''); setCourse(ref?.course || r.course || ''); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setError('');
    if (kindSel === 'text' && text.trim().length < 20) { setError('En az birkaç cümlelik metin yapıştır.'); return; }
    setBusy('İçerik hazırlanıyor…');
    try {
      const source = await loadSource({kind: kindSel, id}, text);
      if (!source.text.trim() && !source.images.length) throw new Error('Bu kaynakta henüz yazı yok. Önce not al ya da başka bir kaynak seç.');
      setBusy(ai?.configured ? 'Kalemlik AI hazırlıyor…' : 'Hazırlanıyor…');
      const n = Number(count);
      const sourceLabel = kindSel === 'text' ? 'Yapıştırılan metin' : `${ref?.label || ''}`;
      if (r.kind === 'flashcards') {
        const res = await generateCards(source, n);
        const deck = deckTarget === 'new' ? createDeck({title: title || `${sourceLabel} kartları`, course, source: sourceLabel}) : list('deck').find(d => d.id === deckTarget)!;
        addCards(deck.id, res.data);
        toast(`${res.data.length} flashcard oluşturuldu.${res.note ? ' ' + res.note : ''}`, res.via === 'ai' ? 'success' : 'info');
        close();
        navigate(`/calisma/deste/${deck.id}`);
      } else {
        const res = await generateQuiz(source, n, difficulty, types);
        const quiz = createQuiz({title: title || `${sourceLabel} quizi`, course, source: sourceLabel, difficulty, questions: res.data});
        toast(`${res.data.length} soruluk quiz hazır.${res.note ? ' ' + res.note : ''}`, res.via === 'ai' ? 'success' : 'info');
        close();
        navigate(`/calisma/quiz/${quiz.id}`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Oluşturulamadı.'); } finally { setBusy(''); }
  };

  const decks = list('deck');
  const isQuiz = r.kind === 'quiz';
  return (
    <Dialog open onClose={() => !busy && close()} title={<span className="row">{isQuiz ? <Target size={20} /> : <WandSparkles size={20} />}{isQuiz ? 'Quiz oluştur' : 'Flashcard oluştur'}</span>} footer={<>
      <span className="muted small ai-badge">{ai?.configured ? <><Sparkles size={14} /> Kalemlik AI · bugün {ai.usage.today}/{ai.usage.limit}</> : 'Kural tabanlı (AI anahtarı yok)'}</span>
      <span className="spacer" />
      <Button variant="ghost" onClick={close} disabled={!!busy}>Vazgeç</Button>
      <Button variant="primary" onClick={() => void run()} busy={!!busy} icon={<Sparkles size={17} />}>{busy || 'Oluştur'}</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); void run(); }}>
        <Field label="Kaynak" htmlFor="gen-src">
          <select id="gen-src" className="select" value={src} onChange={e => setSrc(e.target.value)}>
            {groups.map(g => <optgroup key={g.group} label={g.group}>{g.items.map(i => <option key={`${i.kind}:${i.id}`} value={`${i.kind}:${i.id}`}>{i.label}{i.course && i.kind !== 'course' ? ` · ${i.course}` : ''}</option>)}</optgroup>)}
            <option value="text:">Metin yapıştır…</option>
          </select>
        </Field>
        {kindSel === 'text' && <Field label="Metin" htmlFor="gen-text"><textarea id="gen-text" className="textarea" rows={6} value={text} maxLength={100000} onChange={e => setText(e.target.value)} placeholder="Ders notunu, özetini ya da kitaptan bir bölümü yapıştır." /></Field>}
        <div className="field"><label>{isQuiz ? 'Soru sayısı' : 'Kart sayısı'}</label>
          <Segmented label={isQuiz ? 'Soru sayısı' : 'Kart sayısı'} value={count} onChange={setCount} options={COUNTS.map(c => ({value: c, label: c}))} />
        </div>
        {isQuiz && <>
          <div className="field"><label>Zorluk</label>
            <Segmented label="Zorluk" value={difficulty} onChange={setDifficulty} options={[{value: 'easy', label: 'Kolay'}, {value: 'medium', label: 'Orta'}, {value: 'hard', label: 'Zor'}, {value: 'mixed', label: 'Karışık'}]} />
          </div>
          <div className="field"><label>Soru tipi</label>
            <div className="chip-row" role="group" aria-label="Soru tipi">
              {TYPES.map(t => <button key={t.value} type="button" className={`chip ${types.includes(t.value) ? 'is-on' : ''}`} aria-pressed={types.includes(t.value)} onClick={() => setTypes(ts => ts.includes(t.value) ? (ts.length > 1 ? ts.filter(x => x !== t.value) : ts) : [...ts, t.value])}>{t.label}</button>)}
            </div>
          </div>
        </>}
        {!isQuiz && decks.length > 0 && (
          <Field label="Kartlar nereye?" htmlFor="gen-deck">
            <select id="gen-deck" className="select" value={deckTarget} onChange={e => setDeckTarget(e.target.value)}>
              <option value="new">Yeni deste</option>
              {decks.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
        )}
        {(isQuiz || deckTarget === 'new') && (
          <div className="grid-2">
            <Field label={isQuiz ? 'Quiz adı' : 'Deste adı'} htmlFor="gen-title"><input id="gen-title" className="input" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder={ref?.label || 'ör. Türev'} /></Field>
            <Field label="Ders" htmlFor="gen-course"><input id="gen-course" className="input" list="gen-courses" value={course} maxLength={120} onChange={e => setCourse(e.target.value)} /></Field>
            <datalist id="gen-courses">{allCourses().map(c => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        <p className="muted small">{ai?.configured ? 'El yazılı sayfalar görüntü olarak okunur; kelimeler ve bilgiler kaynaktaki gibi korunur.' : 'Kalemlik AI etkin olmadığında kartlar "terim: tanım" satırlarından ve önemli cümlelerden üretilir.'}</p>
        {error && <p className="notice notice-danger" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
