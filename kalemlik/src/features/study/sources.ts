// Öğrenme kaynakları: bir defterin/sayfanın, destenin, ses kaydının ya da dersin içeriğini metin (+ el yazısı
// sayfaların görüntüsü) olarak toplar. Kalemlik AI ve kural tabanlı üreticiler aynı kaynağı kullanır.
import type {PageContent} from '@/lib/types';
import {get, list, loadNotebookPages, notebookPages} from '@/lib/store';

export type SourceKind = 'notebook' | 'deck' | 'recording' | 'course' | 'text';
export interface StudySource {kind: SourceKind; id: string; title: string; course: string; text: string; images: string[]; pageCount?: number}
export interface SourceRef {kind: SourceKind; id: string; label: string; course: string}

/** Sayfadaki yazılı metin: yazı tipine çevrilmiş satırlar, metin kutuları ve aranabilir metin (PDF/tanınan el yazısı). */
export function pageText(c: PageContent) {
  const runs = c.strokes.filter(s => s.run).sort((a, b) => a.pts[1] - b.pts[1] || a.pts[0] - b.pts[0]).map(s => s.run!.text);
  const boxes = [...c.texts].sort((a, b) => a.y - b.y || a.x - b.x).map(t => t.text);
  return [c.searchText || '', ...boxes, runs.join(' ')].map(s => s.trim()).filter(Boolean).join('\n');
}

/** El yazısı (henüz metne dönmemiş kalem çizgisi) içeren sayfa mı? Görüntüsü AI'ya gönderilir. */
export const hasHandwriting = (c: PageContent) => c.strokes.filter(s => s.t === 'pen' && s.pen !== 'highlighter').length >= 8 && !c.searchText;

async function pageImage(c: PageContent) {
  const {renderPage} = await import('@/features/editor/render');
  const canvas = await renderPage(c, Math.min(1, 1100 / c.width));
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function notebookSource(id: string, opts: {pageIds?: string[]; images?: boolean} = {}): Promise<StudySource> {
  const nb = get('notebook', id);
  await loadNotebookPages(id).catch(() => {});
  const pages = notebookPages(id).filter(p => p.content && (!opts.pageIds || opts.pageIds.includes(p.id)));
  const parts: string[] = [];
  const images: string[] = [];
  for (const [i, p] of pages.entries()) {
    const t = pageText(p.content!);
    if (t) parts.push(`--- Sayfa ${i + 1} ---\n${t}`);
    if (opts.images !== false && images.length < 8 && hasHandwriting(p.content!)) images.push(await pageImage(p.content!));
  }
  return {kind: 'notebook', id, title: nb?.title || 'Defter', course: nb?.course || '', text: parts.join('\n\n').slice(0, 110_000), images, pageCount: pages.length};
}

export function deckSource(id: string): StudySource {
  const deck = get('deck', id);
  const cards = list('card').filter(c => c.deckId === id);
  return {kind: 'deck', id, title: deck?.title || 'Deste', course: deck?.course || '', text: cards.map(c => `S: ${c.front}\nC: ${c.back}${c.topic ? `\nKonu: ${c.topic}` : ''}`).join('\n\n').slice(0, 110_000), images: []};
}

export function recordingSource(id: string): StudySource {
  const r = get('recording', id);
  const marks = (r?.bookmarks || []).map(b => `[${Math.floor(b.t / 60000)}:${String(Math.floor(b.t / 1000) % 60).padStart(2, '0')}] ${b.label}`).join('\n');
  return {kind: 'recording', id, title: r?.title || 'Ders kaydı', course: r?.course || '', text: [r?.transcript || '', marks && `Önemli anlar:\n${marks}`].filter(Boolean).join('\n\n').slice(0, 110_000), images: []};
}

/** Bir dersin tüm defterleri, desteleri ve kayıtları (görüntüsüz; hızlı). */
export async function courseSource(course: string): Promise<StudySource> {
  const parts: string[] = [];
  for (const nb of list('notebook').filter(n => n.course === course && n.trashedAt === null)) {
    const s = await notebookSource(nb.id, {images: false});
    if (s.text) parts.push(`### Defter: ${nb.title}\n${s.text}`);
  }
  for (const d of list('deck').filter(d => d.course === course)) { const s = deckSource(d.id); if (s.text) parts.push(`### Deste: ${d.title}\n${s.text}`); }
  for (const r of list('recording').filter(r => r.course === course)) { const s = recordingSource(r.id); if (s.text) parts.push(`### Ders kaydı: ${r.title}\n${s.text}`); }
  return {kind: 'course', id: course, title: course, course, text: parts.join('\n\n').slice(0, 110_000), images: []};
}

export async function loadSource(ref: Pick<SourceRef, 'kind' | 'id'>, text = ''): Promise<StudySource> {
  if (ref.kind === 'notebook') return notebookSource(ref.id);
  if (ref.kind === 'deck') return deckSource(ref.id);
  if (ref.kind === 'recording') return recordingSource(ref.id);
  if (ref.kind === 'course') return courseSource(ref.id);
  return {kind: 'text', id: '', title: 'Metin', course: '', text: text.slice(0, 110_000), images: []};
}

/** Kaynak seçicideki seçenekler: defterler, desteler, ses kayıtları, dersler. */
export function sourceOptions(): {group: string; items: SourceRef[]}[] {
  const notebooks = list('notebook').filter(n => n.trashedAt === null).sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt));
  const courses = allCourses();
  return [
    {group: 'Defterler ve PDF’ler', items: notebooks.map(n => ({kind: 'notebook', id: n.id, label: n.title, course: n.course}))},
    {group: 'Flashcard desteleri', items: list('deck').map(d => ({kind: 'deck', id: d.id, label: d.title, course: d.course}))},
    {group: 'Ders kayıtları', items: list('recording').filter(r => r.transcript.trim()).map(r => ({kind: 'recording', id: r.id, label: r.title, course: r.course}))},
    {group: 'Dersin tamamı', items: courses.map(c => ({kind: 'course', id: c, label: c, course: c}))},
  ].filter(g => g.items.length) as {group: string; items: SourceRef[]}[];
}

/** Uygulamadaki tüm ders adları (program, defter, görev, deste, not hesaplama). */
export function allCourses(): string[] {
  const names = [
    ...list('lesson').map(l => l.title), ...list('notebook').filter(n => n.trashedAt === null).map(n => n.course), ...list('task').map(t => t.course),
    ...list('deck').map(d => d.course), ...list('gradeCourse').map(g => g.name), ...list('recording').map(r => r.course), ...list('quiz').map(q => q.course),
  ].map(s => s.trim()).filter(Boolean);
  const seen = new Map<string, string>();
  for (const n of names) { const k = n.toLocaleLowerCase('tr'); if (!seen.has(k)) seen.set(k, n); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}
