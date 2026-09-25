import './setup';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PageContent, Stroke} from '@/lib/types';
import {correctHandwriting, inkMetrics, looksLikeWriting, replaceWithText, splitLines, splitWords} from '@/features/editor/autowrite';
import {eraseFrom, inkBox, strokeInLasso, strokeInRect, transformStroke} from '@/features/editor/geometry';
import {shapePoints} from '@/features/editor/ink';
import {writingGuide} from '@/features/editor/paper';
import {continueList, toggleListPrefix} from '@/features/editor/TextLayer';
import {floodRemove} from '@/features/stickers/stickerImage';
import {resolveSettings} from '@/lib/settings';
import {PAPER_IDS, PEN_IDS, SHAPE_IDS, COVER_PATTERNS, TASK_CATEGORIES} from '@/lib/constants';
import shared from '@shared/constants.json';

const page = (template: PageContent['template'], strokes: Stroke[] = []): PageContent => ({v: 1, template, width: 1000, height: 1414, strokes, texts: [], stickers: []});
let n = 0;
/** (x, y) noktasında genişlik w, yükseklik h olan "harf" benzeri zikzak çizgi. */
function letter(x: number, baseline: number, w: number, h: number): Stroke {
  const pts: number[] = [];
  for (let i = 0; i <= 8; i++) pts.push(x + (w * i) / 8, baseline - (i % 2 ? h : 0), 0.5);
  return {id: 's' + n++, t: 'pen', pen: 'ballpoint', c: '#000000', w: 2, o: 1, pts};
}

test('sabitler sunucuyla aynı', () => {
  assert.deepEqual([...PAPER_IDS], shared.papers);
  assert.deepEqual([...PEN_IDS], shared.pens);
  assert.deepEqual([...SHAPE_IDS], shared.shapes);
  assert.deepEqual([...COVER_PATTERNS], shared.coverPatterns);
  assert.deepEqual([...TASK_CATEGORIES], shared.taskCategories);
  assert.equal(PAPER_IDS.length, 24);
});

test('satır ve kelime ayırma', () => {
  const g = 38;
  const a = [letter(100, 200, 20, 18), letter(122, 200, 20, 18), letter(200, 200, 20, 18), letter(100, 300, 20, 18)];
  const lines = splitLines(a, g);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3);
  assert.equal(splitWords(lines[0], g).length, 2, 'aradaki boşluk iki kelime ayırır');
});

test('yazı olmayan çizimlere dokunulmaz', () => {
  const underline: Stroke = {id: 'u', t: 'pen', pen: 'ballpoint', c: '#000000', w: 2, o: 1, pts: [100, 300, .5, 600, 301, .5]};
  assert.equal(looksLikeWriting([underline], 38), false);
  const hl: Stroke = {...letter(100, 200, 40, 20), pen: 'highlighter'};
  assert.equal(looksLikeWriting([hl], 38), false);
  const big = letter(100, 900, 300, 600);
  assert.equal(looksLikeWriting([big], 38), false);
  assert.equal(looksLikeWriting([letter(100, 200, 30, 20)], 38), true);
});

test('çizgili sayfada yazı satıra oturur, gereksiz küçülmez', () => {
  const c = page('lined');
  const {gap, origin} = writingGuide(c);
  // Satırın biraz üstünde (taban 7 birim yukarıda), okunur boyutta yazı
  const baseline = origin + gap * 5 - 7;
  const word = [letter(120, baseline, 14, 16), letter(136, baseline, 14, 16)];
  const out = correctHandwriting(word, word.map(s => s.id), c, {size: 1, weight: 5, spacing: 0})!;
  assert.ok(out);
  const m = inkMetrics(out);
  assert.ok(Math.abs(m.baseline - (origin + gap * 5)) < 1.5, `taban çizgisi satırda olmalı: ${m.baseline}`);
  assert.ok(Math.abs(m.box.h - inkMetrics(word).box.h) < 0.5, 'okunur yazı küçültülmez');
});

test('büyük el yazısı satıra sığdırılır ve üst üste binmez', () => {
  const c = page('lined');
  const {gap, origin} = writingGuide(c);
  const baseline = origin + gap * 8;
  const w1 = [letter(100, baseline, 60, 90), letter(165, baseline, 60, 90)];
  const w2 = [letter(260, baseline, 60, 90)];
  const all = [...w1, ...w2];
  const out = correctHandwriting(all, all.map(s => s.id), c, {size: 1, weight: 5, spacing: 0})!;
  const b1 = inkBox(out.filter(s => w1.some(w => w.id === s.id)))!;
  const b2 = inkBox(out.filter(s => w2.some(w => w.id === s.id)))!;
  assert.ok(b1.h <= gap * 1.5 + 1, `yükseklik satıra sığmalı: ${b1.h}`);
  assert.ok(b2.x >= b1.x + b1.w + 5, 'kelimeler üst üste binmemeli');
  assert.equal(out.length, all.length, 'çizgi sayısı korunur (tek geri al adımı)');
});

test('kareli sayfada yazı karenin içine yerleşir', () => {
  const c = page('grid');
  const {gap} = writingGuide(c);
  const word = [letter(200, 410, 30, 30)];
  const out = correctHandwriting(word, word.map(s => s.id), c, {size: 1, weight: 5, spacing: 0})!;
  const b = inkBox(out)!;
  const row = Math.floor(b.y / gap);
  assert.ok(b.y >= row * gap && b.y + b.h <= (row + 1) * gap + 0.5, `kare içinde olmalı: ${b.y}..${b.y + b.h}, kare ${gap}`);
});

test('sağdaki yazı itilir, sayfadan taşan kelime alt satıra geçer', () => {
  const c = page('lined');
  const {gap, origin} = writingGuide(c);
  const baseline = origin + gap * 3;
  const old = letter(300, baseline, 40, 16);
  const fresh = [letter(100, baseline, 180, 60)]; // büyütülmüş ama sağa doğru taşan yeni kelime değil
  const out = correctHandwriting([...fresh, old], fresh.map(s => s.id), c, {size: 1.3, weight: 5, spacing: 8})!;
  const oldAfter = out.find(s => s.id === old.id)!;
  const freshBox = inkBox(out.filter(s => s.id === fresh[0].id))!;
  assert.ok(inkBox([oldAfter])!.x >= freshBox.x + freshBox.w - 0.5, 'eski yazı yeni yazının sağında kalmalı');

  const nearEdge = [letter(900, baseline, 80, 20), letter(990, baseline, 5, 20)];
  const wrapped = correctHandwriting(nearEdge, nearEdge.map(s => s.id), c, {size: 1, weight: 5, spacing: 0})!;
  const ys = wrapped.map(s => inkMetrics([s]).baseline);
  assert.ok(Math.max(...ys) <= c.width, 'sayfa içinde kalmalı');
});

test('yazı tipi kipi: metin satıra, el yazısı yerine', () => {
  const c = page('lined');
  const {gap, origin} = writingGuide(c);
  const word = [letter(120, origin + gap * 2, 40, 16)];
  const out = replaceWithText(word, word.map(s => s.id), c, 'merhaba', 'caveat', '#112233', {size: 1, weight: 5, spacing: 0})!;
  assert.equal(out.length, 1);
  assert.equal(out[0].t, 'text');
  assert.equal(out[0].run!.text, 'merhaba');
  assert.equal(out[0].pts[1], origin + gap * 2);
  assert.equal(replaceWithText(word, word.map(s => s.id), c, '[okunamadı]', 'caveat', '#000000', {size: 1, weight: 5, spacing: 0}), null, 'tanınamayan yazı korunur');
});

test('kısmi silgi çizgiyi böler, şekli bütün siler', () => {
  const line: Stroke = {id: 'l', t: 'pen', pen: 'ballpoint', c: '#000000', w: 2, o: 1, pts: Array.from({length: 21}, (_, i) => [100 + i * 10, 100, .5]).flat()};
  const out = eraseFrom([line], 200, 100, 12, true)!;
  assert.equal(out.length, 2, 'ortadan silinen çizgi ikiye bölünür');
  const shape: Stroke = {id: 'sh', t: 'shape', shape: 'rectangle', c: '#000000', w: 2, o: 1, pts: shapePoints('rectangle', 0, 0, 100, 50)};
  assert.deepEqual(eraseFrom([shape], 50, 0, 5, true), []);
  assert.equal(eraseFrom([line], 500, 500, 5, true), null, 'dokunmayan silgi değişiklik yapmaz');
});

test('seçim: dikdörtgen ve kement, taşıma/ölçekleme', () => {
  const s = letter(100, 100, 40, 20);
  assert.equal(strokeInRect(s, {x: 90, y: 70, w: 70, h: 40}), true);
  assert.equal(strokeInRect(s, {x: 300, y: 300, w: 10, h: 10}), false);
  assert.equal(strokeInLasso(s, [80, 60, 160, 60, 160, 120, 80, 120]), true);
  const moved = transformStroke(s, 10, 5);
  assert.equal(moved.pts[0], s.pts[0] + 10);
  const scaled = transformStroke(s, 0, 0, 2, 100, 100);
  assert.equal(scaled.w, 4);
});

test('şekiller: kare eşit kenarlı, yıldız 10 köşe, ok 2 nokta', () => {
  const sq = shapePoints('square', 0, 0, 100, 40);
  assert.equal(sq[3] - sq[0], 100);
  assert.equal(sq[7] - sq[1], 100);
  assert.equal(shapePoints('star', 0, 0, 100, 100).length, 30);
  assert.equal(shapePoints('arrow', 0, 0, 10, 10).length, 6);
});

test('listeler: Enter ile devam, boş maddede bitir, numara artar', () => {
  assert.deepEqual(continueList('• a', 3), {value: '• a\n• ', caret: 6});
  assert.deepEqual(continueList('1. a', 4), {value: '1. a\n2. ', caret: 8});
  assert.deepEqual(continueList('• a\n• ', 6), {value: '• a\n', caret: 4});
  assert.equal(continueList('düz metin', 9), null);
  assert.equal(toggleListPrefix('a\nb', 'bullet'), '• a\n• b');
  assert.equal(toggleListPrefix('• a\n• b', 'bullet'), 'a\nb');
  assert.equal(toggleListPrefix('a\nb', 'number'), '1. a\n2. b');
});

test('sticker arka plan temizleme yalnızca bağlı arka planı siler', () => {
  const w = 5, h = 5, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d.set([255, 255, 255, 255], i * 4); }
  d.set([200, 0, 0, 255], (2 * w + 2) * 4); // ortada kırmızı nesne
  floodRemove(d, w, h, [[0, 0]], 30);
  assert.equal(d[3], 0, 'köşe saydam');
  assert.equal(d[(2 * w + 2) * 4 + 3], 255, 'nesne korunur');
});

test('ayarlar eksik/eski kayıtla da güvenli', () => {
  const s = resolveSettings({pens: {ballpoint: {color: '#ff0000', width: 3, opacity: 1}}} as never);
  assert.equal(s.pens.ballpoint.color, '#ff0000');
  assert.equal(s.pens.fountain.color, '#1d4ed8');
  assert.equal(s.focus.work, 25);
  assert.equal(s.write.mode, 'off');
});
