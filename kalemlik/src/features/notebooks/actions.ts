import type {Notebook, PageContent} from '@/lib/types';
import type {PaperId} from '@/lib/constants';
import {PAGE_H, PAGE_W} from '@/lib/constants';
import {get, list, notebookPages, put, remove, update} from '@/lib/store';
import {uuid, shortId} from '@/lib/ids';
import {getPlan} from '@/lib/plan';
import {DEFAULT_COVER} from './cover';
import {confirmDialog, toast} from '@/components/feedback';
import {navigate} from '@/app/router';

export const blankPage = (template: PaperId): PageContent => ({v: 1, template, width: PAGE_W, height: PAGE_H, strokes: [], texts: [], stickers: []});

export const activeNotebooks = () => list('notebook').filter(n => n.trashedAt === null);

/** Ücretsiz plan sınırını sunucuya gitmeden önce de kontrol eder (sunucu ayrıca uygular). */
export async function checkCapacity(): Promise<boolean> {
  const plan = getPlan();
  const limit = plan?.plan.notebookLimit;
  if (limit && activeNotebooks().length >= limit) {
    const ok = await confirmDialog({title: 'Defter sınırı', message: `${plan!.plan.name} planında aynı anda en fazla ${limit} defter kullanabilirsin. Kullanmadığın bir defteri çöp kutusuna taşıyabilir ya da planını yükseltebilirsin.`, confirmLabel: 'Planları gör'});
    if (ok) navigate('/plan');
    return false;
  }
  return true;
}

export function createNotebook(values: Pick<Notebook, 'title' | 'course' | 'term' | 'color' | 'paper'> & {cover?: Notebook['cover']}, pages?: PageContent[]): Notebook {
  const id = uuid();
  const nb = put('notebook', {id, ...values, cover: values.cover || {...DEFAULT_COVER}, favorite: false, trashedAt: null, lastOpenedAt: null});
  (pages?.length ? pages : [blankPage(values.paper)]).forEach((content, i) => put('page', {id: uuid(), notebookId: id, position: i + 1, content}));
  return nb;
}

export function trashNotebook(nb: Notebook) {
  update('notebook', nb.id, {trashedAt: Date.now(), favorite: nb.favorite});
  toast(`"${nb.title}" çöp kutusuna taşındı.`, 'info', {label: 'Geri al', run: () => update('notebook', nb.id, {trashedAt: null})});
}

export async function restoreNotebook(nb: Notebook) {
  if (!(await checkCapacity())) return;
  update('notebook', nb.id, {trashedAt: null});
  toast(`"${nb.title}" geri getirildi.`, 'success');
}

export async function deleteForever(nb: Notebook) {
  const ok = await confirmDialog({title: 'Kalıcı olarak silinsin mi?', message: `"${nb.title}" ve tüm sayfaları bütün cihazlardan silinir. Bu işlem geri alınamaz.`, confirmLabel: 'Kalıcı sil', danger: true});
  if (!ok) return;
  for (const p of notebookPages(nb.id)) remove('page', p.id);
  remove('notebook', nb.id);
}

export async function duplicateNotebook(nb: Notebook, loadPages: (id: string) => Promise<void>) {
  if (!(await checkCapacity())) return;
  await loadPages(nb.id);
  const pages = notebookPages(nb.id);
  if (pages.some(p => !p.content)) { toast('Kopyalamak için defterin tüm sayfaları bu cihaza yüklenmeli. İnternete bağlanıp tekrar dene.', 'error'); return; }
  const copy = createNotebook({title: `${nb.title} (kopya)`, course: nb.course, term: nb.term, color: nb.color, paper: nb.paper, cover: structuredClone(nb.cover)},
    pages.map(p => ({...structuredClone(p.content!), strokes: p.content!.strokes.map(s => ({...s, id: shortId()}))})));
  toast(`"${copy.title}" oluşturuldu.`, 'success');
}

export const toggleFavorite = (nb: Notebook) => update('notebook', nb.id, {favorite: !nb.favorite});
export const markOpened = (id: string) => { const nb = get('notebook', id); if (nb && (!nb.lastOpenedAt || Date.now() - nb.lastOpenedAt > 60000)) update('notebook', id, {lastOpenedAt: Date.now()}); };
