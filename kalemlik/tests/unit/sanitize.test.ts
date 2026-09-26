import './setup';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizePageContent, sanitizeRecord} from '@/lib/sanitize';
import {entitySchemas, pageContent} from '../../server/schemas.mjs';
import type {PageContent} from '@/lib/types';

test('kâğıt dışına çizim ve bozuk değerler onarılır, sunucu kabul eder', () => {
  const messy = {
    v: 1, template: 'lined', width: 1000.4, height: 1414, spacing: 200, lineColor: 'red',
    strokes: [
      {id: 'a', t: 'pen', pen: 'ballpoint', c: '#000000', w: 2, o: 1, pts: [-60000, 300, 0.5, 100, NaN, 0.5, 120, 310, 2]},
      {id: 'b', t: 'pen', pen: 'kalem-yok', c: '#12', w: 500, o: 0, pts: [1, 2]},
      {id: 'b', t: 'shape', shape: 'star', c: '#ff0000', w: 3, o: 1, pts: [0, 0, 1, 99999, 99999, 1]},
      {id: 'c', t: 'text', c: '#000000', w: 1, o: 1, pts: [10, 10, 1, 20, 10, 1], run: {text: 'merhaba', font: 'Caveat!', size: 900, weight: 12.4, spacing: 3}},
      {id: 'uzun', t: 'pen', pen: 'fineliner', c: '#000000', w: 1, o: 1, pts: Array.from({length: 40002 * 3}, (_, i) => (i % 3 === 2 ? 0.5 : i % 997))},
    ],
    texts: [{id: 't', x: -99999, y: 10, w: 5, text: 'x', font: 'nunito', size: 999, color: 'mavi'}],
    stickers: [{id: 's1', builtin: 'kedi', x: 1e9, y: 0, w: 1, h: 90000, rot: 900}, {id: 's2', x: 0, y: 0, w: 10, h: 10, rot: 0}],
  } as unknown as PageContent;
  const clean = sanitizePageContent(messy);
  const r = pageContent.safeParse(clean);
  assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues[0]));
  assert.equal(clean.strokes[0].pts.length, 6, 'NaN nokta atlanır');
  assert.equal(clean.strokes[0].pts[0], -20000, 'aşırı uzak konum sınıra çekilir');
  assert.ok(clean.strokes.filter(s => s.id.startsWith('uzun')).length >= 2, 'çok uzun çizgi bölünür');
  assert.equal(new Set(clean.strokes.map(s => s.id)).size, clean.strokes.length, 'kimlikler benzersiz');
  assert.equal(clean.stickers.length, 1, 'kaynağı olmayan görsel atlanır');
});

test('saat, başlık ve ders kaydı onarılır', () => {
  const lesson = sanitizeRecord('lesson', {title: '  ', day: 9, start: '10:00:00', end: '09:00', room: '', instructor: '', color: 'x', note: ''});
  assert.equal(entitySchemas.lesson.safeParse(lesson).success, true);
  assert.equal(lesson.start, '10:00');
  const task = sanitizeRecord('task', {title: 'Vize', course: '', description: '', dueDate: '2026-10-01', dueTime: '9:05:00', category: 'exam', color: '#123456', done: false, completedAt: null});
  assert.equal(task.dueTime, '09:05');
  assert.equal(entitySchemas.task.safeParse(task).success, true);
});
