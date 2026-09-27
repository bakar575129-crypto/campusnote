// AI çıktısını (özet, açıklama, sınav notu, transkript) bir deftere metin sayfası olarak ekler.
// Uzun metin, sayfaya sığacak şekilde birden çok sayfaya bölünür.
import {get, notebookPages, put} from '@/lib/store';
import {shortId, uuid} from '@/lib/ids';
import {blankPage, createNotebook} from '@/features/notebooks/actions';
import {currentTerm} from '@/lib/format';
import {courseColor} from './actions';

const CHARS_PER_LINE = 84, LINES_PER_PAGE = 44;

function paginate(text: string): string[] {
  const pages: string[] = [];
  let cur: string[] = [], lines = 0;
  for (const para of text.split('\n')) {
    const need = Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
    if (lines + need > LINES_PER_PAGE && cur.length) { pages.push(cur.join('\n')); cur = []; lines = 0; }
    cur.push(para); lines += need;
  }
  if (cur.length) pages.push(cur.join('\n'));
  return pages.length ? pages : [''];
}

/** notebookId boşsa "Kalemlik AI notları" defteri oluşturulur. Dönüş: defter kimliği ve eklenen sayfa sayısı. */
export function saveTextToNotebook(notebookId: string, title: string, text: string, course = ''): {notebookId: string; pages: number} {
  const nb = notebookId ? get('notebook', notebookId) : undefined;
  const chunks = paginate(`${title}\n\n${text}`.trim());
  const contents = chunks.map(chunk => {
    const content = blankPage(nb?.paper || 'lined');
    content.texts = [{id: shortId(), x: 70, y: 90, w: 860, text: chunk, font: 'nunito', size: 20, color: '#1b2433'}];
    return content;
  });
  if (!nb) {
    const created = createNotebook({title: title.slice(0, 60) || 'Kalemlik AI notları', course, term: currentTerm(), color: courseColor(course), paper: 'lined'}, contents);
    return {notebookId: created.id, pages: contents.length};
  }
  const existing = notebookPages(nb.id);
  let pos = (existing[existing.length - 1]?.position || 0) + 1;
  for (const content of contents) put('page', {id: uuid(), notebookId: nb.id, position: pos++, content});
  return {notebookId: nb.id, pages: contents.length};
}
