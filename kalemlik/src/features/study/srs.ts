// Aralıklı tekrar (SM-2'nin sade bir türevi). Not: 0 = Tekrar (bilemedim), 1 = Zor, 2 = Orta, 3 = Kolay.
import type {Card} from '@/lib/types';

export const DAY_MS = 86_400_000;
export const GRADES = [
  {grade: 0, label: 'Tekrar', hint: 'Bilemedim', tone: 'danger'},
  {grade: 1, label: 'Zor', hint: 'Zorlandım', tone: 'warning'},
  {grade: 2, label: 'Orta', hint: 'Bildim', tone: 'accent'},
  {grade: 3, label: 'Kolay', hint: 'Çok kolay', tone: 'success'},
] as const;

export type SrsState = Pick<Card, 'ease' | 'interval' | 'due' | 'reps' | 'lapses' | 'lastReviewAt' | 'lastGrade'>;
export const NEW_CARD: SrsState = {ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReviewAt: null, lastGrade: -1};

/** Bir değerlendirmeden sonra kartın yeni tekrar durumu. */
export function review(card: SrsState, grade: 0 | 1 | 2 | 3, now = Date.now()): SrsState {
  let {ease, interval, reps, lapses} = card;
  if (grade === 0) {
    // Bilinemeyen kart 10 dakika sonra (aynı oturumda) tekrar gelir.
    return {ease: Math.max(1.3, ease - 0.2), interval: 0, due: now + 10 * 60_000, reps: 0, lapses: lapses + 1, lastReviewAt: now, lastGrade: 0};
  }
  ease = Math.min(3.5, Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0)));
  if (reps === 0 || interval < 1) interval = grade === 1 ? 1 : grade === 2 ? 1 : 3;
  else if (reps === 1) interval = grade === 1 ? 2 : grade === 2 ? 3 : 6;
  else interval = interval * (grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3);
  interval = Math.min(3650, Math.round(interval * 10) / 10);
  return {ease: Math.round(ease * 100) / 100, interval, due: now + interval * DAY_MS, reps: reps + 1, lapses, lastReviewAt: now, lastGrade: grade};
}

/** Bir sonraki tekrar için okunur süre ("10 dk", "3 gün"). */
export function nextLabel(card: SrsState, grade: 0 | 1 | 2 | 3) {
  const r = review(card, grade, 0);
  const ms = r.due;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} dk`;
  if (ms < DAY_MS) return `${Math.round(ms / 3_600_000)} sa`;
  const d = Math.round(ms / DAY_MS);
  return d >= 60 ? `${Math.round(d / 30)} ay` : `${d} gün`;
}

export const isDue = (c: Pick<Card, 'due'>, now = Date.now()) => c.due <= now;
export const isMastered = (c: Pick<Card, 'interval' | 'reps'>) => c.reps > 0 && c.interval >= 21;

/** Deste ilerlemesi: öğrenilen (en az bir kez doğru), ustalaşılan (≥21 gün aralık) ve bekleyen kart sayıları. */
export function deckProgress(cards: Card[], now = Date.now()) {
  const total = cards.length;
  const learned = cards.filter(c => c.reps > 0).length;
  const mastered = cards.filter(isMastered).length;
  const due = cards.filter(c => isDue(c, now)).length;
  const percent = total ? Math.round(((learned + mastered) / (2 * total)) * 100) : 0;
  return {total, learned, mastered, due, percent};
}

/** Çalışma sırası: önce süresi gelmiş eski tekrarlar, sonra yeni kartlar. */
export function studyQueue(cards: Card[], now = Date.now(), limit = 50) {
  const due = cards.filter(c => c.reps > 0 && isDue(c, now)).sort((a, b) => a.due - b.due);
  const fresh = cards.filter(c => c.reps === 0 && isDue(c, now)).sort((a, b) => a.createdAt - b.createdAt);
  return [...due, ...fresh].slice(0, limit);
}
