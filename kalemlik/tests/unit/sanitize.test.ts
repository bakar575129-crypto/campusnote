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

// ---- rastgele bozuk veri: onarımdan sonra sunucu şeması HER ZAMAN kabul etmeli
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
const junk = (): unknown => pick<() => unknown>([
  () => undefined, () => null, () => NaN, () => Infinity, () => -1e12, () => 1e12, () => rnd() * 100, () => -rnd() * 5,
  () => '', () => '   ', () => 'x'.repeat(30000), () => '12', () => '#abc', () => '#GGGGGG', () => 'kırmızı', () => '25:99', () => '7:5',
  () => '2026-02-30', () => '2026-9-7', () => true, () => false, () => [], () => ({}), () => [1, 'a', null], () => 'ÇĞİÖŞÜ çğıöşü',
])();
const maybe = (good: unknown) => (rnd() < 0.5 ? good : junk());
const uuidv = '0b5f8a2e-6c1d-4f7e-9a3b-2d4c6e8f0a1b';
const junkPlaced = () => ({id: maybe('p' + Math.floor(rnd() * 1e6)), fileId: rnd() < 0.3 ? uuidv : junk(), builtin: rnd() < 0.5 ? 'kedi' : junk(), x: maybe(100), y: maybe(100), w: maybe(50), h: maybe(50), rot: maybe(10)});
const junkStroke = () => ({id: maybe('s'), t: maybe('pen'), pen: maybe('ballpoint'), shape: maybe('star'), c: maybe('#000000'), w: maybe(2), o: maybe(1),
  pts: rnd() < 0.2 ? junk() : Array.from({length: Math.floor(rnd() * 40)}, () => maybe(rnd() * 1000)), run: rnd() < 0.3 ? {text: maybe('merhaba'), font: maybe('kalam'), size: maybe(20), weight: maybe(4), spacing: maybe(0)} : junk()});
const junkContent = () => ({v: maybe(1), template: maybe('lined'), width: maybe(1000), height: maybe(1414), paperColor: junk(), lineColor: maybe('#aabbcc'), textColor: junk(), spacing: junk(),
  background: rnd() < 0.3 ? {fileId: maybe(uuidv), kind: maybe('pdf')} : junk(),
  strokes: rnd() < 0.1 ? junk() : Array.from({length: Math.floor(rnd() * 12)}, () => (rnd() < 0.1 ? junk() : junkStroke())),
  texts: Array.from({length: Math.floor(rnd() * 4)}, () => ({id: maybe('t'), x: maybe(1), y: maybe(1), w: maybe(200), text: maybe('yazı'), font: maybe('nunito'), size: maybe(20), color: maybe('#000000'), bold: junk()})),
  stickers: Array.from({length: Math.floor(rnd() * 4)}, junkPlaced)});
const junkRecord: Record<string, () => Record<string, unknown>> = {
  page: () => ({notebookId: uuidv, position: maybe(1), content: junkContent()}),
  notebook: () => ({title: maybe('Fizik'), course: maybe(''), term: maybe(''), color: maybe('#2f6fed'), paper: maybe('lined'), favorite: junk(), trashedAt: junk(), lastOpenedAt: junk(),
    cover: rnd() < 0.2 ? junk() : {pattern: maybe('cats'), patternColor: junk(), patternOpacity: maybe(0.2), patternSize: maybe(6), textColor: junk(), font: junk(), showCourse: junk(), showTerm: junk(), label: maybe('not'), stickers: Array.from({length: Math.floor(rnd() * 3)}, junkPlaced)}}),
  lesson: () => ({title: maybe('Matematik'), day: maybe(2), start: maybe('09:00'), end: maybe('10:00'), room: junk(), instructor: junk(), color: junk(), note: junk()}),
  task: () => ({title: maybe('Ödev'), course: junk(), description: junk(), dueDate: maybe('2026-10-01'), dueTime: maybe('09:00'), category: maybe('exam'), color: junk(), done: junk(), completedAt: junk()}),
  focus: () => ({topic: junk(), course: junk(), plannedMinutes: maybe(25), focusedSeconds: maybe(100), completed: junk(), startedAt: maybe(Date.now()), endedAt: junk()}),
  sticker: () => ({fileId: uuidv, name: junk(), width: junk(), height: junk()}),
  font: () => ({fileId: uuidv, name: junk(), missingChars: junk()}),
  settings: () => ({data: rnd() < 0.5 ? {theme: 'dark'} : junk()}),
};

test('rastgele bozuk kayıtlar onarıldıktan sonra sunucu şemasından her zaman geçer', () => {
  for (const [entity, make] of Object.entries(junkRecord)) {
    const schema = entitySchemas[entity as keyof typeof entitySchemas];
    for (let i = 0; i < 400; i++) {
      const raw = JSON.parse(JSON.stringify(make())); // ağdan gelen hâli (NaN → null, undefined düşer)
      const fixed = sanitizeRecord(entity as never, raw);
      const r = schema.safeParse(fixed);
      if (!r.success) assert.fail(`${entity} #${i}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}\n${JSON.stringify(raw).slice(0, 400)}`);
      // Onarım kararlı olmalı: onarılmış veriyi tekrar onarmak değiştirmez (gereksiz yeniden gönderim olmaz).
      assert.deepEqual(sanitizeRecord(entity as never, JSON.parse(JSON.stringify(fixed))), fixed);
    }
  }
});
