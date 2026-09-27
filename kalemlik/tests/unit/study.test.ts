import './setup';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_MS, NEW_CARD, deckProgress, review, studyQueue} from '@/features/study/srs';
import {localCards, localPlan, localQuiz, sameAnswer} from '@/features/study/generate';
import {scoreQuiz} from '@/features/study/actions';
import {plainText} from '@/components/Markdown';
import type {Card, Quiz} from '@/lib/types';

const card = (over: Partial<Card> = {}): Card => ({id: 'c' + Math.random(), rev: 0, createdAt: 0, updatedAt: 0, deckId: 'd', front: 'f', back: 'b', topic: '', ...NEW_CARD, ...over});

test('aralıklı tekrar: bilemeyen 10 dk sonra, bilen giderek daha seyrek gelir', () => {
  const now = 1_000_000;
  const again = review(NEW_CARD, 0, now);
  assert.equal(again.due, now + 10 * 60_000);
  assert.equal(again.lapses, 1);
  const g1 = review(NEW_CARD, 2, now);
  assert.equal(g1.interval, 1);
  const g2 = review(g1, 2, now);
  assert.equal(g2.interval, 3);
  const g3 = review(g2, 2, now);
  assert.ok(g3.interval > g2.interval * 2, 'üçüncü doğru cevapta aralık katlanır');
  const easy = review(g2, 3, now);
  assert.ok(easy.interval > g3.interval, 'kolay, ortadan daha uzun aralık verir');
  assert.ok(review(g2, 1, now).ease < g2.ease, 'zor, kolaylık katsayısını düşürür');
  assert.ok(review(NEW_CARD, 1, now).ease >= 1.3);
});

test('deste ilerlemesi ve çalışma sırası', () => {
  const now = 10 * DAY_MS;
  const cards = [card({reps: 0, due: 0, createdAt: 2}), card({reps: 3, interval: 30, due: now + DAY_MS}), card({reps: 1, interval: 1, due: now - 5}), card({reps: 0, due: 0, createdAt: 1})];
  const p = deckProgress(cards, now);
  assert.deepEqual([p.total, p.learned, p.mastered, p.due], [4, 2, 1, 3]);
  const q = studyQueue(cards, now);
  assert.equal(q[0].reps, 1, 'önce süresi gelmiş tekrar');
  assert.equal(q.length, 3);
  assert.equal(q[1].createdAt, 1, 'sonra yeni kartlar eskiden yeniye');
});

test('kural tabanlı flashcard: "terim: tanım", S/C satırları ve boşluklu cümleler', () => {
  const text = '# Hücre\nMitoz: Bir hücrenin iki özdeş hücreye bölünmesi\nMayoz – Üreme hücrelerinin oluşumu\nS: DNA nerede bulunur?\nC: Çekirdekte\nKloroplast bitki hücrelerinde fotosentezin gerçekleştiği organeldir ve yeşil renklidir.';
  const cards = localCards(text, 10);
  assert.equal(cards[0].front, 'Mitoz');
  assert.equal(cards[0].back, 'Bir hücrenin iki özdeş hücreye bölünmesi');
  assert.equal(cards[0].topic, 'Hücre');
  assert.ok(cards.some(c => c.front === 'Mayoz'));
  assert.ok(cards.some(c => c.front === 'DNA nerede bulunur?' && c.back === 'Çekirdekte'));
  assert.ok(cards.some(c => c.front.includes('____')), 'cümleden boşluk doldurma kartı');
  assert.equal(new Set(cards.map(c => c.front)).size, cards.length, 'kartlar tekrarlanmaz');
});

test('kural tabanlı quiz: çoktan seçmelide doğru cevap seçeneklerde, doğru/yanlış ve boşluk doldurma', () => {
  const cards = ['Mitoz', 'Mayoz', 'Osmoz', 'Difüzyon', 'Fotosentez'].map((f, i) => ({front: f, back: `Tanım numarası ${i} açıklaması`, topic: 'Biyoloji'}));
  const qs = localQuiz(cards, 6, ['mcq', 'tf', 'fill']);
  assert.equal(qs.length, 6);
  for (const q of qs) {
    if (q.type === 'mcq') { assert.equal(q.options.length, 4); assert.ok(q.options.includes(q.answer)); }
    if (q.type === 'tf') assert.ok(['Doğru', 'Yanlış'].includes(q.answer));
    if (q.type === 'fill') assert.ok(q.prompt.includes('____') && q.answer.length > 0);
  }
  assert.ok(sameAnswer('  İSTANBUL. ', 'istanbul'), 'boşluk doldurma büyük/küçük harf ve noktalamayı önemsemez');
  assert.ok(!sameAnswer('', ''));
});

test('quiz puanlama: yüzde, yanlış konular', () => {
  const quiz = {questions: [
    {id: 'a', type: 'mcq', prompt: '1', options: ['x', 'y'], answer: 'x', explanation: '', topic: 'Türev'},
    {id: 'b', type: 'tf', prompt: '2', options: ['Doğru', 'Yanlış'], answer: 'Yanlış', explanation: '', topic: 'İntegral'},
    {id: 'c', type: 'fill', prompt: '3 ____', options: [], answer: 'Limit', explanation: '', topic: 'Limit'},
    {id: 'd', type: 'mcq', prompt: '4', options: ['x', 'y'], answer: 'y', explanation: '', topic: 'İntegral'},
  ]} as unknown as Quiz;
  const r = scoreQuiz(quiz, {a: 'x', b: 'Doğru', c: ' limit ', d: 'x'});
  assert.equal(r.correct, 2);
  assert.equal(r.wrong, 2);
  assert.equal(r.percent, 50);
  assert.deepEqual(r.weakTopics, ['İntegral']);
});

test('kural tabanlı çalışma planı: sınavdan önceki her güne, son gün deneme quizi', () => {
  const p = localPlan({examTitle: 'Final', course: 'Mat', examDate: '2026-06-20', startDate: '2026-06-06', minutesPerDay: 60, topics: ['Türev', 'İntegral', 'Limit']});
  assert.equal(p.items.length, 14);
  assert.equal(p.items[0].date, '2026-06-06');
  assert.equal(p.items.at(-1)!.date, '2026-06-19');
  assert.equal(p.items.at(-1)!.kind, 'quiz');
  assert.ok(p.items.every(i => i.date < '2026-06-20'));
  assert.ok(['Türev', 'İntegral', 'Limit'].every(t => p.items.some(i => i.topic === t)), 'her konu plana girer');
  assert.ok(p.items.some(i => i.kind === 'review'));
});

test('Markdown düz metne çevrilir', () => {
  assert.equal(plainText('## Başlık\n- **kalın** madde\n`kod`'), 'Başlık\n• kalın madde\nkod');
});

test('desteden gelen S/C metni doğru kartlara dönüşür; tüm metin tek soru olmaz', () => {
  const text = 'S: Mitoz\nC: Bir hücrenin iki özdeş hücreye bölünmesi\nKonu: Hücre\n\nS: Mayoz\nC: Üreme hücrelerini oluşturan bölünme';
  const cards = localCards(text, 12);
  assert.deepEqual(cards.map(c => c.front), ['Mitoz', 'Mayoz']);
  assert.equal(cards[0].topic, 'Hücre');
  const noHeading = localCards('Hücre bölünmesi\nMitoz: İki özdeş hücre', 5);
  assert.equal(noHeading[0].topic, 'Hücre bölünmesi', 'kısa başlık satırı konu olur');
});

import {courseAverage, courseLetter, DEFAULT_SCALE, gpa, letterFor, neededFinal, neededScore} from '@/features/grades/grades';
import type {GradeCourse} from '@/lib/types';

const course = (over: Partial<GradeCourse>): GradeCourse => ({id: 'g', rev: 0, createdAt: 0, updatedAt: 0, term: '2026 Güz', name: 'Ders', credit: 3, ects: 5, components: [], letter: '', included: true, ...over});

test('not hesaplama: ağırlıklı ortalama, harf notu, yuvarlama', () => {
  const c = course({components: [{id: 'v', name: 'Vize', weight: 40, score: 60}, {id: 'f', name: 'Final', weight: 60, score: 76}]});
  const a = courseAverage(c);
  assert.equal(a.complete, true);
  assert.equal(a.avg, 70, '69,6 → 70 (yuvarlanır)');
  assert.equal(courseAverage(c, false).avg, 69.6);
  assert.equal(courseLetter(c)!.letter, 'CC');
  assert.equal(letterFor(89.9)!.letter, 'BA');
  assert.equal(letterFor(90)!.letter, 'AA');
  const partial = courseAverage(course({components: [{id: 'v', name: 'Vize', weight: 40, score: 60}, {id: 'f', name: 'Final', weight: 60, score: null}]}));
  assert.equal(partial.complete, false);
  assert.equal(partial.soFar, 24);
  assert.equal(partial.missing[0].name, 'Final');
});

test('Finalden kaç almalıyım: vize 60 (%40), final %60, hedef 70 → en az 76', () => {
  assert.equal(neededFinal(60, 40, 60, 70), 76);
  assert.equal(neededFinal(60, 40, 60, 70, false), 77, 'yuvarlanmıyorsa 76,67 → 77');
  assert.equal(neededFinal(100, 40, 60, 40), 'done');
  assert.equal(neededFinal(10, 40, 60, 90), 'impossible');
  const comps = [{id: 'v', name: 'Vize', weight: 30, score: 80}, {id: 'o', name: 'Ödev', weight: 20, score: 90}, {id: 'f', name: 'Final', weight: 50, score: null}];
  assert.equal(neededScore(comps, 'f', 85), 85, '(84,5 − 42) / 0,5 = 85');
});

test('GANO: kredi ağırlıklı; kalınan ders AKTS kazandırmaz; hariç tutulan ders hesaba girmez', () => {
  const full = (score: number) => [{id: 'x', name: 'Final', weight: 100, score}];
  const r = gpa([
    course({name: 'A', credit: 4, ects: 6, components: full(92)}), // AA 4.0
    course({name: 'B', credit: 2, ects: 3, components: full(71)}), // CC 2.0
    course({name: 'C', credit: 3, ects: 5, components: full(30)}), // FF 0
    course({name: 'D', credit: 3, ects: 5, letter: 'BB', components: []}), // elle BB 3.0
    course({name: 'E', credit: 3, ects: 5, components: full(100), included: false}),
    course({name: 'F', credit: 3, ects: 5, components: [{id: 'v', name: 'Vize', weight: 40, score: 50}, {id: 'f', name: 'Final', weight: 60, score: null}]}),
  ], DEFAULT_SCALE);
  assert.equal(r.gpa, Math.round(((4 * 4 + 2 * 2 + 0 * 3 + 3 * 3) / 12) * 100) / 100);
  assert.equal(r.ects, 14);
  assert.equal(r.counted, 4);
});
