// Gelişmiş arama: defterler, sayfalar (yazı, PDF metni, tanınan el yazısı), dersler, görevler, sınavlar, flashcardlar,
// quizler, çalışma planları, günlük, ders kayıtları, not hesaplama ve paylaşılan notlar. Önce cihazdaki veride anında,
// sonra sunucuda (cihaza inmemiş sayfalar) aranır. Türkçe harfler ve büyük/küçük harf fark etmez.
import {allPageContents, list} from '@/lib/store';
import {api} from '@/lib/api';
import {isoDate} from '@/lib/format';
import {pageText} from '@/features/study/sources';

export type ResultType = 'notebook' | 'page' | 'lesson' | 'task' | 'exam' | 'card' | 'quiz' | 'plan' | 'journal' | 'recording' | 'grade' | 'shared';
export const TYPE_LABELS: Record<ResultType, string> = {
  notebook: 'Defter', page: 'Not sayfası', lesson: 'Ders', task: 'Görev', exam: 'Sınav', card: 'Flashcard', quiz: 'Quiz',
  plan: 'Çalışma planı', journal: 'Günlük', recording: 'Ders kaydı', grade: 'Not hesaplama', shared: 'Paylaşılan not',
};
export interface SearchResult {key: string; type: ResultType; title: string; snippet: string; source: string; date: string; course: string; link: string; favorite: boolean; score: number}
export interface SearchFilters {types: ResultType[]; course: string; since: '' | '7' | '30' | '180'; favorites: boolean}

/** Türkçe katlama: "öğrenci", "OGRENCI", "Öğrenci" aynı sayılır. */
export const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

function snippetOf(text: string, q: string, width = 80) {
  const t = text.replace(/\s+/g, ' ').trim();
  const i = fold(t).indexOf(q);
  if (i < 0) return t.slice(0, width * 2);
  const start = Math.max(0, i - width), end = Math.min(t.length, i + q.length + width);
  return (start ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
}
const day = (ms: number) => (ms ? isoDate(new Date(ms)) : '');

/** Tüm sorgu kelimeleri metinde geçiyorsa puan: başlıkta geçmesi daha değerli. */
function scoreOf(q: string[], title: string, body: string) {
  const t = fold(title), b = fold(body);
  let score = 0;
  for (const w of q) {
    if (t.includes(w)) score += t.startsWith(w) ? 6 : 4;
    else if (b.includes(w)) score += 1;
    else return 0;
  }
  return score;
}

export async function searchLocal(query: string): Promise<SearchResult[]> {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const out: SearchResult[] = [];
  const add = (r: Omit<SearchResult, 'score' | 'snippet'> & {body: string}) => {
    const score = scoreOf(words, r.title, r.body);
    if (score) out.push({...r, score, snippet: snippetOf(r.body || r.title, words[0])});
  };
  const notebooks = new Map(list('notebook').map(n => [n.id, n]));
  for (const n of notebooks.values()) {
    if (n.trashedAt !== null) continue;
    add({key: 'nb' + n.id, type: 'notebook', title: n.title, body: [n.course, n.term, n.cover.label].filter(Boolean).join(' · '), source: n.course || 'Defter', date: day(n.updatedAt), course: n.course, link: `/defter/${n.id}`, favorite: n.favorite});
  }
  const contents = await allPageContents();
  const pages = list('page');
  for (const p of pages) {
    const nb = notebooks.get(p.notebookId);
    const c = contents.get(p.id);
    if (!nb || nb.trashedAt !== null || !c) continue;
    const text = pageText(c);
    if (!text) continue;
    const idx = pages.filter(x => x.notebookId === p.notebookId).sort((a, b) => a.position - b.position).findIndex(x => x.id === p.id) + 1;
    add({key: 'pg' + p.id, type: 'page', title: `${nb.title} · Sayfa ${idx}`, body: text, source: nb.title, date: day(p.updatedAt), course: nb.course, link: `/defter/${nb.id}?sayfa=${p.id}`, favorite: nb.favorite});
  }
  for (const l of list('lesson')) add({key: 'ls' + l.id, type: 'lesson', title: l.title, body: [l.room, l.instructor, l.note].filter(Boolean).join(' · '), source: 'Ders programı', date: '', course: l.title, link: '/program', favorite: false});
  for (const t of list('task')) add({key: 'tk' + t.id, type: t.category === 'exam' ? 'exam' : 'task', title: t.title, body: [t.course, t.description].filter(Boolean).join(' · '), source: t.category === 'exam' ? 'Sınavlar' : 'Görevler', date: t.dueDate, course: t.course, link: '/gorevler', favorite: false});
  const decks = new Map(list('deck').map(d => [d.id, d]));
  for (const c of list('card')) {
    const d = decks.get(c.deckId);
    add({key: 'cd' + c.id, type: 'card', title: c.front, body: `${c.back} ${c.topic}`, source: d?.title || 'Deste', date: day(c.updatedAt), course: d?.course || '', link: `/calisma/deste/${c.deckId}`, favorite: false});
  }
  for (const d of decks.values()) add({key: 'dk' + d.id, type: 'card', title: d.title, body: `${d.course} ${d.source}`, source: 'Flashcard destesi', date: day(d.updatedAt), course: d.course, link: `/calisma/deste/${d.id}`, favorite: false});
  for (const qz of list('quiz')) add({key: 'qz' + qz.id, type: 'quiz', title: qz.title, body: qz.questions.map(x => `${x.prompt} ${x.answer} ${x.topic}`).join(' '), source: qz.result ? `%${Math.round(qz.result.percent)} başarı` : 'Çözülmedi', date: day(qz.completedAt || qz.createdAt), course: qz.course, link: `/calisma/quiz/${qz.id}`, favorite: false});
  for (const p of list('studyPlan')) add({key: 'pl' + p.id, type: 'plan', title: p.title, body: p.items.map(i => i.topic).join(' · '), source: `Sınav ${p.examDate}`, date: p.examDate, course: p.course, link: `/calisma/plan/${p.id}`, favorite: false});
  for (const j of list('journal')) add({key: 'jr' + j.id, type: 'journal', title: j.title || `Günlük · ${j.day}`, body: j.body, source: 'Günlük', date: j.day, course: '', link: `/gunluk?gun=${j.day}`, favorite: false});
  for (const r of list('recording')) add({key: 'rc' + r.id, type: 'recording', title: r.title, body: `${r.transcript} ${r.summary} ${r.bookmarks.map(b => b.label).join(' ')}`, source: r.course || 'Ders kaydı', date: day(r.createdAt), course: r.course, link: `/kayitlar/${r.id}`, favorite: false});
  for (const g of list('gradeCourse')) add({key: 'gr' + g.id, type: 'grade', title: g.name, body: `${g.term} ${g.components.map(c => c.name).join(' ')}`, source: g.term || 'Notlarım', date: day(g.updatedAt), course: g.name, link: '/notlarim', favorite: false});
  return out;
}

/** Sunucuda arama: cihaza inmemiş sayfalar (başka cihazda yazılmış notlar, ortak defterler). */
export async function searchServer(query: string, known: Set<string>): Promise<SearchResult[]> {
  if (!navigator.onLine || query.trim().length < 2) return [];
  const r = await api<{pages: {id: string; notebookId: string; snippet: string; updatedAt: number}[]}>(`/api/search?q=${encodeURIComponent(query.trim())}`).catch(() => ({pages: []}));
  const notebooks = new Map(list('notebook').map(n => [n.id, n]));
  const allPages = list('page');
  return r.pages.filter(p => !known.has('pg' + p.id)).map(p => {
    const nb = notebooks.get(p.notebookId);
    const idx = allPages.filter(x => x.notebookId === p.notebookId).sort((a, b) => a.position - b.position).findIndex(x => x.id === p.id) + 1;
    return {key: 'pg' + p.id, type: 'page' as const, title: nb ? `${nb.title} · ${idx ? `Sayfa ${idx}` : 'sayfa'}` : 'Not sayfası', snippet: p.snippet, source: nb?.title || 'Başka cihazda yazıldı', date: day(p.updatedAt), course: nb?.course || '', link: `/defter/${p.notebookId}?sayfa=${p.id}`, favorite: !!nb?.favorite, score: 1};
  });
}

export function applyFilters(results: SearchResult[], f: SearchFilters) {
  const since = f.since ? isoDate(new Date(Date.now() - Number(f.since) * 86400000)) : '';
  const course = fold(f.course);
  return results
    .filter(r => !f.types.length || f.types.includes(r.type) || (r.type === 'shared' && f.types.includes('page')))
    .filter(r => !course || fold(r.course) === course)
    .filter(r => !since || (r.date && r.date >= since))
    .filter(r => !f.favorites || r.favorite)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}
