// İçerik üretimi: Kalemlik AI (sunucu) varsa onu kullanır; yoksa, çevrimdışıysa ya da hata verirse kural tabanlı
// üreticilerle çalışmaya devam eder. Böylece flashcard, quiz ve çalışma planı her durumda oluşturulabilir.
import {useEffect, useSyncExternalStore} from 'react';
import {api, ApiError} from '@/lib/api';
import {shortId} from '@/lib/ids';
import {addDays, isoDate, parseIso, daysBetween} from '@/lib/format';
import type {Difficulty, PlanItem, QuestionType, QuizQuestion} from '@/lib/types';
import type {StudySource} from './sources';

// ---------------------------------------------------------------- AI durumu
export interface AiStatus {configured: boolean; usage: {today: number; limit: number}; features: Record<string, boolean | number>}
let status: AiStatus | null = null;
const subs = new Set<() => void>();
export async function refreshAiStatus() {
  try { status = await api<AiStatus>('/api/ai/status'); for (const s of subs) s(); } catch { /* çevrimdışı */ }
  return status;
}
export function useAiStatus() {
  const v = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => status);
  useEffect(() => { void refreshAiStatus(); }, []);
  return v;
}

export interface GenCard {front: string; back: string; topic: string}
export type Via = 'ai' | 'local';
/** AI kullanılamadığında (anahtar yok, çevrimdışı, plan/kota) yerel üreticiye geçilir; nedeni kullanıcıya söylenir. */
export interface GenResult<T> {data: T; via: Via; note?: string}

const payloadSource = (s: StudySource) => ({title: s.title, course: s.course, text: s.text, images: s.images});
const canFallBack = (e: unknown) => e instanceof ApiError && (e.status === 0 || ['AI_DISABLED', 'AI_QUOTA', 'PLAN_FEATURE', 'RATE_LIMIT'].includes(e.code) || e.status >= 500);
const aiNote = (e: unknown) => e instanceof ApiError ? (e.status === 0 ? 'Çevrimdışısın; kural tabanlı üretildi.' : `${e.message} Kural tabanlı üretildi.`) : 'Kural tabanlı üretildi.';

async function viaAi<T>(body: Record<string, unknown>, local: () => T, needsText: boolean, hasContent: boolean): Promise<GenResult<T>> {
  if (status && !status.configured) return {data: local(), via: 'local', note: 'Kalemlik AI etkin değil; kural tabanlı üretildi.'};
  if (!navigator.onLine) return {data: local(), via: 'local', note: 'Çevrimdışısın; kural tabanlı üretildi.'};
  try {
    const data = await api<T>('/api/ai/generate', {method: 'POST', json: body});
    void refreshAiStatus();
    return {data, via: 'ai'};
  } catch (e) {
    if (!canFallBack(e) || (needsText && !hasContent)) throw e;
    return {data: local(), via: 'local', note: aiNote(e)};
  }
}

export async function generateCards(src: StudySource, count: number): Promise<GenResult<GenCard[]>> {
  const r = await viaAi<{cards: GenCard[]}>({kind: 'flashcards', count, source: payloadSource(src)}, () => ({cards: localCards(src.text, count)}), true, !!src.text.trim());
  if (!r.data.cards.length) throw new Error(src.images.length && !src.text.trim() ? 'Bu kaynaktaki el yazısı yalnızca Kalemlik AI ile okunabilir. Sayfaları "aranabilir yap" ya da metin ekle.' : 'Kaynakta karta dönüştürülebilecek metin bulunamadı.');
  return {...r, data: r.data.cards};
}

export async function generateQuiz(src: StudySource, count: number, difficulty: Difficulty, types: QuestionType[]): Promise<GenResult<QuizQuestion[]>> {
  const r = await viaAi<{questions: QuizQuestion[]}>({kind: 'quiz', count, difficulty, types, source: payloadSource(src)}, () => ({questions: localQuiz(localCards(src.text, Math.max(count, 12)), count, types)}), true, !!src.text.trim());
  if (!r.data.questions.length) throw new Error('Kaynaktan soru çıkarılamadı. Daha fazla içerik seç ya da önce flashcard oluştur.');
  return {...r, data: r.data.questions};
}

export async function generateSummary(src: StudySource): Promise<GenResult<{title: string; summary: string; keyPoints: string[]; topics: string[]}>> {
  return viaAi({kind: 'summary', source: payloadSource(src)}, () => localSummary(src), true, !!src.text.trim());
}

export interface PlanInput {examTitle: string; course: string; examDate: string; startDate: string; minutesPerDay: number; topics: string[]}
export async function generatePlan(input: PlanInput, src?: StudySource): Promise<GenResult<{items: PlanItem[]; advice: string}>> {
  return viaAi({kind: 'plan', plan: input, source: src ? payloadSource(src) : undefined}, () => localPlan(input), false, true);
}

// ---------------------------------------------------------------- kural tabanlı üreticiler
const STOP = new Set('ve veya ile için gibi kadar daha çok en bir bu şu o da de ki mi mı mu mü ne ise olan olarak olur ancak ama fakat hem her tüm bazı ya sonra önce ayrıca yani the and or of to in is are for with that this from'.split(' '));
const normalize = (s: string) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Metinden kart: "Terim: tanım", "Terim – tanım", "S:/C:" satırları; yoksa önemli kelimesi boşluk olan cümleler. */
export function localCards(text: string, count: number): GenCard[] {
  const out: GenCard[] = [];
  const seen = new Set<string>();
  const add = (front: string, back: string, topic = '') => {
    front = front.trim().replace(/^[-•*\d.)\s]+/, ''); back = back.trim();
    const k = normalize(front);
    if (front.length < 2 || back.length < 2 || seen.has(k)) return;
    seen.add(k); out.push({front: front.slice(0, 300), back: back.slice(0, 1000), topic});
  };
  let topic = '';
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const rest: string[] = []; // karta dönüşmeyen satırlar: yalnızca bunlardan boşluklu cümle kartı yapılır
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^(#{1,4}\s|---)/.test(l)) { topic = l.replace(/^[#\s-]+|[-\s]+$/g, '').replace(/^Sayfa \d+$/, '').slice(0, 120) || topic; continue; }
    const qa = /^S:\s*(.+)$/.exec(l), ans = lines[i + 1] && /^C:\s*(.+)$/.exec(lines[i + 1]);
    if (qa && ans) { const t = lines[i + 2] && /^Konu:\s*(.+)$/.exec(lines[i + 2]); add(qa[1], ans[1], t ? t[1] : topic); i += t ? 2 : 1; continue; }
    if (/^(S|C|Konu):\s/.test(l)) continue;
    const def = /^(.{2,80}?)\s*(?::|=|–|—|\s-\s)\s*(.{3,})$/.exec(l);
    if (def && def[1].split(/\s+/).length <= 8) { add(def[1], def[2], topic); continue; }
    const tr = /^(.{2,60}?),?\s+(.{8,}?)\s+(?:denir|denilir|adı verilir)\.?$/i.exec(l);
    if (tr) { add(`${tr[1]} nedir?`, tr[2], topic); continue; }
    // Kısa, noktasız satır bir konu başlığıdır (ör. "Hücre bölünmesi").
    if (l.length <= 50 && !/[.!?:]$/.test(l) && l.split(/\s+/).length <= 6) { topic = l; continue; }
    rest.push(l);
  }
  if (out.length < count) {
    const sentences = rest.join(' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 30 && s.length <= 260);
    for (const s of sentences) {
      if (out.length >= count) break;
      const words = s.match(/[\p{L}\p{N}’'-]{5,}/gu) || [];
      const key = [...words].filter(w => !STOP.has(w.toLocaleLowerCase('tr'))).sort((a, b) => b.length - a.length)[0];
      if (!key) continue;
      add(s.replace(key, '____'), key, topic);
    }
  }
  return out.slice(0, count);
}

/** Kartlardan quiz: çoktan seçmeli (diğer kartların cevapları çeldirici), doğru/yanlış, boşluk doldurma. */
export function localQuiz(cards: GenCard[], count: number, types: QuestionType[]): QuizQuestion[] {
  if (!cards.length) return [];
  const pool = shuffle(cards);
  const backs = [...new Set(cards.map(c => c.back.slice(0, 300)))];
  const out: QuizQuestion[] = [];
  for (let i = 0; out.length < count && i < pool.length * 3; i++) {
    const c = pool[i % pool.length];
    let type = types[out.length % types.length];
    if (type === 'mcq' && backs.length < 4) type = types.includes('tf') ? 'tf' : 'fill';
    const answer = c.back.slice(0, 300);
    if (type === 'mcq') {
      const wrong = shuffle(backs.filter(b => b !== answer)).slice(0, 3);
      out.push({id: shortId(), type, prompt: c.front, options: shuffle([answer, ...wrong]), answer, explanation: `Doğru cevap: ${answer}`, topic: c.topic});
    } else if (type === 'tf') {
      const truth = Math.random() < 0.5 || backs.length < 2;
      const shown = truth ? answer : shuffle(backs.filter(b => b !== answer))[0];
      out.push({id: shortId(), type, prompt: `${c.front}\n→ ${shown}`, options: ['Doğru', 'Yanlış'], answer: truth ? 'Doğru' : 'Yanlış', explanation: truth ? 'Eşleşme doğru.' : `Doğru cevap: ${answer}`, topic: c.topic});
    } else {
      const words = answer.match(/[\p{L}\p{N}’'-]{4,}/gu) || [];
      const key = [...words].filter(w => !STOP.has(w.toLocaleLowerCase('tr'))).sort((a, b) => b.length - a.length)[0];
      if (!key) continue;
      out.push({id: shortId(), type, prompt: c.front.includes('____') ? c.front : `${c.front}\n${answer.replace(key, '____')}`, options: [], answer: c.front.includes('____') ? answer : key, explanation: answer, topic: c.topic});
    }
  }
  const unique = new Map(out.map(q => [q.prompt, q]));
  return [...unique.values()].slice(0, count);
}

function localSummary(src: StudySource) {
  const cards = localCards(src.text, 12);
  const lines = src.text.split('\n').map(l => l.trim()).filter(l => l.length > 3 && !/^--- Sayfa/.test(l));
  const topics = [...new Set(lines.filter(l => /^#{1,4}\s/.test(l) || (l.length < 60 && !/[.:]$/.test(l))).map(l => l.replace(/^#+\s*/, '')))].slice(0, 12);
  const keyPoints = cards.length ? cards.slice(0, 8).map(c => `**${c.front.replace('____', '…')}**: ${c.back}`) : lines.slice(0, 8);
  return {title: src.title, summary: `## ${src.title}\n\n${keyPoints.map(k => `- ${k}`).join('\n')}`, keyPoints, topics};
}

/** Kural tabanlı çalışma planı: konular günlere dağıtılır, her 4 günde bir tekrar, son günler tekrar + deneme quizi. */
export function localPlan(p: PlanInput): {items: PlanItem[]; advice: string} {
  const days = Math.max(1, daysBetween(p.startDate, p.examDate));
  const topics = p.topics.length ? p.topics : ['Konu tekrarı'];
  const items: PlanItem[] = [];
  let t = 0;
  for (let i = 0; i < days; i++) {
    const date = isoDate(addDays(parseIso(p.startDate), i));
    const left = days - i;
    const item = (topic: string, kind: PlanItem['kind'], minutes = p.minutesPerDay) => items.push({id: shortId(), date, topic, minutes, kind, done: false, taskId: ''});
    if (left === 1 && days > 1) item('Genel tekrar + deneme quizi', 'quiz');
    else if (left === 2 && days > 3) item('Zayıf konuları tekrar et, flashcardları çalış', 'review');
    else if (i > 0 && i % 4 === 3) item(`Tekrar: ${topics.slice(Math.max(0, t - 3), t).join(', ') || topics[0]}`, 'review', Math.round(p.minutesPerDay * 0.75));
    else { item(topics[t % topics.length], 'study'); t++; }
  }
  const advice = days <= 3 ? 'Sınava az kaldı: yeni konu yerine en çok soru çıkan konuları ve yanlış yaptığın soruları tekrar et.'
    : `Her gün yaklaşık ${p.minutesPerDay} dakika çalış; tekrar günlerinde flashcardlarını çöz. Son gün deneme quiziyle kendini ölç.`;
  return {items, advice};
}

/** Boşluk doldurma cevabı: büyük/küçük harf, noktalama ve fazla boşluk önemsizdir. */
export const sameAnswer = (a: string, b: string) => normalize(a) === normalize(b) && normalize(a) !== '';
