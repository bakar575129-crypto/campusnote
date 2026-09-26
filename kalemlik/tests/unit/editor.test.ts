import './setup';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PageContent, Stroke} from '@/lib/types';
import {cleanRecognized, consistentWithInk, hoveringNear, inkMetrics, looksLikeWriting, movedAway, placeText, splitLines} from '@/features/editor/beautify';
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

test('satır ayırma', () => {
  const g = 38;
  const a = [letter(100, 200, 20, 18), letter(122, 200, 20, 18), letter(200, 200, 20, 18), letter(100, 300, 20, 18)];
  const lines = splitLines(a, g);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3);
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

test('kelime bitti mi: harfin noktası/şapkası aynı kelime, sağdaki yeni kelime ve alt satır başka yer', () => {
  const g = 38;
  const box = inkMetrics([letter(100, 200, 80, 18)]).box; // "üniver" gibi yarım kelime
  assert.equal(movedAway(box, 150, 175, g), false, 'ü noktası (kelimenin üstü) aynı kelime');
  assert.equal(movedAway(box, 186, 195, g), false, 'hemen sağında devam eden harf aynı kelime');
  assert.equal(movedAway(box, 230, 195, g), true, 'boşluk bırakıp sağda yazmak yeni kelime');
  assert.equal(movedAway(box, 110, 250, g), true, 'alt satır');
  assert.equal(hoveringNear(box, 190, 190, g), true, 'kalem kelimenin yanında geziniyor');
  assert.equal(hoveringNear(box, 600, 700, g), false);
});

test('tanıma sonucu: emin olunmayan ya da tutarsız metin reddedilir, kelimeler asla değiştirilmez', () => {
  assert.equal(cleanRecognized('[okunamadı]'), '');
  assert.equal(cleanRecognized('mit[?]oz'), '');
  assert.equal(cleanRecognized('  Bugün   fizik\ndersinde  '), 'Bugün fizik dersinde', 'yalnızca boşluk sadeleşir');
  assert.equal(cleanRecognized('"mitoz"'), 'mitoz');
  assert.equal(cleanRecognized('İstanbul’da %25 (x+1) ₺40'), 'İstanbul’da %25 (x+1) ₺40', 'Türkçe harfler ve işaretler korunur');
  const word = [letter(100, 200, 90, 16)]; // ~6 harflik genişlik
  assert.equal(consistentWithInk('mitoz', word), true);
  assert.equal(consistentWithInk('Bugün fizik dersinde yeni bir konu işledik ve çok eğlendik', word), false, 'uydurma uzun metin reddedilir');
});

test('güzelleştirme: metin el yazısının yerine, aynı konuma; diğer yazı hiç kaymaz', () => {
  const c = page('lined');
  const {gap, origin} = writingGuide(c);
  const baseline = origin + gap * 2 - 5; // satırın biraz üstünde yazılmış
  const word = [letter(120, baseline, 60, 16), letter(182, baseline, 20, 16)];
  const other = letter(400, baseline, 40, 16);
  const before = JSON.stringify(other);
  const out = placeText([...word, other], word.map(s => s.id), c, 'Eylül', 'caveat')!;
  assert.ok(out);
  const text = out.find(s => s.t === 'text')!;
  assert.equal(text.run!.text, 'Eylül', 'metin aynen');
  assert.equal(text.c, '#000000', 'kalemin rengi korunur');
  const m = inkMetrics(word);
  assert.equal(text.pts[0], m.box.x, 'aynı sol kenar');
  assert.equal(text.pts[1], m.baseline, 'aynı taban çizgisi (satıra itilmez)');
  assert.equal(JSON.stringify(out.find(s => s.id === other.id)), before, 'başka yazı değişmez');
  assert.ok(text.pts[3] <= other.pts[0], 'sağdaki yazının üstüne binmez');
  assert.equal(out.length, 2, 'el yazısı çizgileri kaldırılır, tek metin kalır');
  assert.equal(placeText(word, word.map(s => s.id), c, '[okunamadı]', 'caveat'), null, 'tanınamayan yazı korunur');
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
  // Eski otomatik düzeltme ayarları kapalı sayılır; yeni özellik yalnızca bilerek açılır.
  const old = resolveSettings({write: {mode: 'word', font: 'own', delay: 750}} as never);
  assert.equal(old.write.mode, 'off');
  assert.equal(old.write.font, 'nunito');
  assert.equal(old.write.delay, 600);
  assert.equal(resolveSettings({write: {mode: 'beautify', font: 'caveat', delay: 1000}} as never).write.delay, 1000);
});

import {BUILTIN_STICKERS, builtinSvg} from '@/features/stickers/builtin';
import {coverPatternSvg, CUTE_PATTERNS} from '@/features/notebooks/cover';

/** SVG görsel olarak (img/tuval) açılınca katı XML kuralları geçerlidir: yinelenen öznitelik = boş görsel. */
function assertWellFormed(svg: string, name: string) {
  for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) || []) {
    const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map(m => m[1]);
    assert.equal(new Set(names).size, names.length, `${name}: yinelenen öznitelik → ${tag.slice(0, 80)}`);
  }
  const opened = (svg.match(/<(?!\/)[a-zA-Z][^>]*[^/]>/g) || []).length, closed = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
  assert.equal(opened, closed, `${name}: açılan/kapanan etiket sayısı eşit olmalı`);
}

test('hazır stickerlar ve sevimli kapak desenleri geçerli SVG', () => {
  assert.ok(BUILTIN_STICKERS.length >= 40);
  assert.equal(new Set(BUILTIN_STICKERS.map(s => s.id)).size, BUILTIN_STICKERS.length, 'kimlikler benzersiz');
  for (const s of BUILTIN_STICKERS) assertWellFormed(builtinSvg(s.id), s.id);
  for (const p of Object.keys(CUTE_PATTERNS)) assertWellFormed(coverPatternSvg(p as never, '#ffffff', 1, 9)!.markup, p);
});
