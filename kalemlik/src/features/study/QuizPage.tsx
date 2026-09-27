// Quiz: soruları tek tek çöz; sonunda puan, doğru/yanlış, başarı yüzdesi, yanlış yapılan ve tekrar edilmesi gereken
// konular. Sonuç hesaba kaydedilir; yanlışlarla yeniden çözme ve yanlışlardan flashcard oluşturma.
import {useState} from 'react';
import {ArrowLeft, ArrowRight, CheckCircle2, Layers, RotateCcw, Trash2, XCircle} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate} from '@/app/router';
import {Badge, Button, EmptyState, ProgressBar} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {remove, useRecord} from '@/lib/store';
import type {Quiz} from '@/lib/types';
import {addCards, createDeck, finishQuiz, isCorrect, retakeQuiz} from './actions';

const LEVEL = {easy: 'Kolay', medium: 'Orta', hard: 'Zor', mixed: 'Karışık'};

export function QuizPage({id}: {id: string}) {
  const quiz = useRecord('quiz', id);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  if (!quiz) return <div className="page"><EmptyState icon={<XCircle size={28} />} title="Quiz bulunamadı" action={<Button onClick={() => navigate('/calisma?bolum=quiz')}>Quizlere dön</Button>} /></div>;
  if (quiz.result) return <QuizResultView quiz={quiz} />;

  const q = quiz.questions[index];
  const a = answers[q.id] || '';
  const last = index === quiz.questions.length - 1;
  const ok = isCorrect(q, a);
  const next = () => {
    if (!checked) { if (!a.trim()) return; setChecked(true); return; }
    setChecked(false);
    if (last) { const r = finishQuiz(quiz, answers); toast(`Quiz bitti: %${Math.round(r.percent)} başarı.`, r.percent >= 50 ? 'success' : 'info'); }
    else setIndex(index + 1);
  };
  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/calisma?bolum=quiz')}><ArrowLeft size={18} /> Quizler</button>
      <PageHeader title={quiz.title} subtitle={`${quiz.course || 'Ders yok'} · ${LEVEL[quiz.difficulty]} · ${quiz.questions.length} soru`} />
      <div className="row"><span className="muted small">Soru {index + 1} / {quiz.questions.length}</span><span className="spacer" />{q.topic && <Badge>{q.topic}</Badge>}</div>
      <ProgressBar value={index + (checked ? 1 : 0)} max={quiz.questions.length} label="Quiz ilerlemesi" />
      <div className="card card-pad stack quiz-card">
        <p className="quiz-prompt">{q.prompt}</p>
        {q.type === 'fill' ? (
          <input className="input" value={a} disabled={checked} autoFocus placeholder="Cevabını yaz" onChange={e => setAnswers({...answers, [q.id]: e.target.value})} onKeyDown={e => { if (e.key === 'Enter') next(); }} aria-label="Cevap" />
        ) : (
          <div className="option-list" role="radiogroup" aria-label="Seçenekler">
            {q.options.map((o, i) => {
              const state = checked ? (o === q.answer ? 'is-right' : o === a ? 'is-wrong' : '') : o === a ? 'is-picked' : '';
              return (
                <button key={i} type="button" role="radio" aria-checked={o === a} disabled={checked} className={`option ${state}`} onClick={() => setAnswers({...answers, [q.id]: o})}>
                  <span className="option-key">{q.type === 'tf' ? (i === 0 ? 'D' : 'Y') : 'ABCDEF'[i]}</span><span>{o}</span>
                </button>
              );
            })}
          </div>
        )}
        {checked && (
          <p className={`notice ${ok ? 'notice-success' : 'notice-danger'}`}>
            {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{ok ? 'Doğru!' : `Yanlış. Doğru cevap: ${q.answer}`}{q.explanation && <><br /><span className="muted small">{q.explanation}</span></>}</span>
          </p>
        )}
        <div className="row">
          {index > 0 && !checked && <Button variant="ghost" icon={<ArrowLeft size={17} />} onClick={() => setIndex(index - 1)}>Önceki</Button>}
          <span className="spacer" />
          <Button variant="primary" onClick={next} disabled={!a.trim()} icon={checked ? <ArrowRight size={17} /> : undefined}>{!checked ? 'Kontrol et' : last ? 'Sonucu gör' : 'Sonraki soru'}</Button>
        </div>
      </div>
    </div>
  );
}

function QuizResultView({quiz}: {quiz: Quiz}) {
  const r = quiz.result!;
  const wrong = quiz.questions.filter(q => !isCorrect(q, r.answers[q.id]));
  const toCards = () => {
    const deck = createDeck({title: `${quiz.title} · yanlışlarım`, course: quiz.course, source: `Quiz: ${quiz.title}`});
    addCards(deck.id, wrong.map(q => ({front: q.prompt, back: `${q.answer}${q.explanation ? `\n${q.explanation}` : ''}`, topic: q.topic})));
    toast(`${wrong.length} yanlış soru flashcard oldu.`, 'success');
    navigate(`/calisma/deste/${deck.id}`);
  };
  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/calisma?bolum=quiz')}><ArrowLeft size={18} /> Quizler</button>
      <PageHeader title={quiz.title} subtitle={`${quiz.course || 'Ders yok'} · ${LEVEL[quiz.difficulty]}`} actions={
        <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => { if (await confirmDialog({title: 'Quiz silinsin mi?', message: 'Sonuçlarıyla birlikte silinecek.', confirmLabel: 'Sil', danger: true})) { remove('quiz', quiz.id); navigate('/calisma?bolum=quiz'); } }}>Sil</Button>
      } />
      <div className="card card-pad quiz-score">
        <div className={`score-ring ${r.percent >= 70 ? 'tone-success' : r.percent >= 50 ? 'tone-warning' : 'tone-danger'}`} style={{'--p': r.percent} as React.CSSProperties}><strong>%{Math.round(r.percent)}</strong><span className="small">başarı</span></div>
        <div className="stat-row quiz-stats">
          <div><span className="stat-num">{Math.round(r.percent)}</span><span className="muted small">puan / 100</span></div>
          <div><span className="stat-num">{r.correct}</span><span className="muted small">doğru</span></div>
          <div><span className="stat-num">{r.wrong}</span><span className="muted small">yanlış</span></div>
        </div>
      </div>
      {r.weakTopics.length > 0 && (
        <div className="card card-pad stack">
          <h3>Tekrar edilmesi gereken konular</h3>
          <div className="chip-row">{r.weakTopics.map(t => <span key={t} className="chip is-on">{t}</span>)}</div>
        </div>
      )}
      <div className="row wrap">
        <Button variant="primary" icon={<RotateCcw size={17} />} onClick={() => navigate(`/calisma/quiz/${retakeQuiz(quiz).id}`)}>Yeniden çöz</Button>
        {wrong.length > 0 && <Button icon={<RotateCcw size={17} />} onClick={() => navigate(`/calisma/quiz/${retakeQuiz(quiz, true).id}`)}>Yalnızca yanlışlar</Button>}
        {wrong.length > 0 && <Button icon={<Layers size={17} />} onClick={toCards}>Yanlışları flashcard yap</Button>}
      </div>
      <h3>Cevapların</h3>
      <div className="list-stack">
        {quiz.questions.map((q, i) => {
          const ok = isCorrect(q, r.answers[q.id]);
          return (
            <div key={q.id} className={`card card-pad review-row ${ok ? 'is-right' : 'is-wrong'}`}>
              <div className="row">{ok ? <CheckCircle2 size={18} className="text-success" /> : <XCircle size={18} className="text-danger" />}<strong>{i + 1}. {q.prompt}</strong></div>
              <p className="small">Senin cevabın: <strong>{r.answers[q.id] || '—'}</strong>{!ok && <> · Doğru: <strong>{q.answer}</strong></>}</p>
              {q.explanation && <p className="muted small">{q.explanation}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
