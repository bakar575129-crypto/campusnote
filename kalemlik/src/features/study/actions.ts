// Öğrenme kayıtları: deste, kart, quiz, çalışma planı. Hepsi yerelde (IndexedDB) tutulur ve arka planda eşitlenir.
import type {Card, Deck, PlanItem, Quiz, QuizQuestion, QuizResult, StudyPlan} from '@/lib/types';
import {get, list, put, remove, update} from '@/lib/store';
import {uuid} from '@/lib/ids';
import {PALETTE} from '@/lib/constants';
import {NEW_CARD, review, type SrsState} from './srs';
import {sameAnswer, type GenCard} from './generate';

export const courseColor = (course: string) => list('lesson').find(l => l.title === course)?.color || list('notebook').find(n => n.course === course)?.color || PALETTE[3];

export function createDeck(values: {title: string; course: string; source?: string}): Deck {
  return put('deck', {id: uuid(), title: values.title.trim() || 'Yeni deste', course: values.course.trim(), color: courseColor(values.course), source: (values.source || '').slice(0, 300)});
}

export function addCards(deckId: string, cards: GenCard[]): Card[] {
  return cards.map(c => put('card', {id: uuid(), deckId, front: c.front, back: c.back, topic: c.topic || '', ...NEW_CARD}));
}

export function gradeCard(card: Card, grade: 0 | 1 | 2 | 3) {
  const next: SrsState = review(card, grade);
  update('card', card.id, next);
}

/** Deste silinirken kartları da silinir (her cihazda kaybolsunlar diye tek tek). */
export function deleteDeck(deck: Deck) {
  for (const c of list('card').filter(c => c.deckId === deck.id)) remove('card', c.id);
  remove('deck', deck.id);
}

export function createQuiz(values: {title: string; course: string; source?: string; difficulty: Quiz['difficulty']; questions: QuizQuestion[]}): Quiz {
  return put('quiz', {id: uuid(), title: values.title.trim() || 'Quiz', course: values.course, source: (values.source || '').slice(0, 300), difficulty: values.difficulty, questions: values.questions, result: null, completedAt: null});
}

/** Cevapları puanlar; yanlış yapılan konular "tekrar edilmesi gerekenler" olur. */
export function scoreQuiz(quiz: Quiz, answers: Record<string, string>): QuizResult {
  let correct = 0;
  const weak = new Map<string, number>();
  for (const q of quiz.questions) {
    const a = answers[q.id] || '';
    const ok = q.type === 'fill' ? sameAnswer(a, q.answer) : a === q.answer;
    if (ok) correct++;
    else weak.set(q.topic || 'Genel', (weak.get(q.topic || 'Genel') || 0) + 1);
  }
  const total = quiz.questions.length;
  return {answers, correct, wrong: total - correct, total, percent: total ? Math.round((correct / total) * 1000) / 10 : 0, weakTopics: [...weak.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 20), finishedAt: Date.now()};
}
export const isCorrect = (q: QuizQuestion, a: string | undefined) => (q.type === 'fill' ? sameAnswer(a || '', q.answer) : a === q.answer);

export function finishQuiz(quiz: Quiz, answers: Record<string, string>) {
  const result = scoreQuiz(quiz, answers);
  update('quiz', quiz.id, {result, completedAt: result.finishedAt});
  return result;
}

/** Aynı soruları yeniden çözmek için sıfırlanmış kopya (geçmiş sonuç korunur). */
export function retakeQuiz(quiz: Quiz, onlyWrong = false): Quiz {
  const questions = onlyWrong && quiz.result ? quiz.questions.filter(q => !isCorrect(q, quiz.result!.answers[q.id])) : quiz.questions;
  return createQuiz({title: onlyWrong ? `${quiz.title} · yanlışlar` : quiz.title, course: quiz.course, source: quiz.source, difficulty: quiz.difficulty, questions: questions.length ? questions : quiz.questions});
}

export function createPlan(values: {title: string; course: string; examDate: string; examTaskId: string; items: PlanItem[]}): StudyPlan {
  return put('studyPlan', {id: uuid(), title: values.title, course: values.course, examDate: values.examDate, examTaskId: values.examTaskId, items: values.items, completedAt: null});
}

/** Plan maddesini işaretler; bağlı görev varsa o da işaretlenir. Tüm maddeler bitince plan tamamlanır. */
export function togglePlanItem(plan: StudyPlan, itemId: string) {
  const items = plan.items.map(i => (i.id === itemId ? {...i, done: !i.done} : i));
  const item = items.find(i => i.id === itemId)!;
  if (item.taskId && get('task', item.taskId)) update('task', item.taskId, {done: item.done, completedAt: item.done ? Date.now() : null});
  const allDone = items.filter(i => i.kind !== 'rest').every(i => i.done);
  update('studyPlan', plan.id, {items, completedAt: allDone ? plan.completedAt || Date.now() : null});
}

/** Plan maddelerini görev sistemine (ve dolayısıyla takvime) ekler. */
export function addPlanToTasks(plan: StudyPlan) {
  let added = 0;
  const items = plan.items.map(i => {
    if (i.taskId && get('task', i.taskId)) return i;
    if (i.kind === 'rest') return i;
    const id = uuid();
    put('task', {id, title: `${i.topic} (${i.minutes} dk)`, course: plan.course, description: `Çalışma planı: ${plan.title}`, dueDate: i.date, dueTime: '', category: 'todo', color: courseColor(plan.course), done: i.done, completedAt: i.done ? Date.now() : null});
    added++;
    return {...i, taskId: id};
  });
  update('studyPlan', plan.id, {items});
  return added;
}

export function deletePlan(plan: StudyPlan, withTasks: boolean) {
  if (withTasks) for (const i of plan.items) if (i.taskId && get('task', i.taskId)) remove('task', i.taskId);
  remove('studyPlan', plan.id);
}
