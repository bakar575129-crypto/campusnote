import {z} from 'zod';
import C from '../shared/constants.json' with {type: 'json'};
import {LIMITS} from '../shared/repair.mjs';

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Geçersiz kimlik.');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Kâğıdın dışına (uzaklaştırılmışken kenara) yazılabilir; konumlar geniş bir aralıkta kabul edilir.
export const COORD_MIN = LIMITS.coordMin, COORD_MAX = LIMITS.coordMax;
const coord = z.number().finite().min(COORD_MIN).max(COORD_MAX);
const fontId = z.string().regex(/^[a-z0-9:-]{1,60}$/);
const shortId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }, 'Geçersiz tarih.');
const text = (max) => z.string().max(max);

// ---------------------------------------------------------------- hesap
const email = z.string().trim().toLowerCase().max(190).pipe(z.email('Geçerli bir e-posta yaz.'));
export const password = z.string().min(10, 'Şifre en az 10 karakter olmalı.').max(128, 'Şifre en fazla 128 karakter olabilir.');
export const registerBody = z.object({name: z.string().trim().min(2, 'Adını yaz.').max(100), email, password});
export const loginBody = z.object({email, password: z.string().min(1).max(128)});
export const profileBody = z.object({name: z.string().trim().min(2).max(100), university: text(120).optional(), department: text(120).optional()});
export const passwordBody = z.object({currentPassword: z.string().min(1).max(128), newPassword: password});
export const forgotBody = z.object({email});
export const resetBody = z.object({token: z.string().min(20).max(200), password});

// ---------------------------------------------------------------- defter sayfası içeriği
// Yerleştirilen görsel: kullanıcının yüklediği dosya (fileId) ya da uygulamayla gelen hazır sticker (builtin).
const placed = z.object({id: shortId, fileId: uuid.optional(), builtin: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(), x: coord, y: coord, w: z.number().min(4).max(20000), h: z.number().min(4).max(20000), rot: z.number().min(-360).max(360)})
  .refine(p => !!p.fileId !== !!p.builtin, {message: 'Görsel kaynağı geçersiz.'});
const run = z.object({text: z.string().min(1).max(400), font: fontId, size: z.number().min(4).max(200), weight: z.number().int().min(1).max(9), spacing: z.number().min(-10).max(40)});
const stroke = z.object({
  id: shortId,
  t: z.enum(['pen', 'shape', 'text']),
  pen: z.enum(C.pens).optional(),
  shape: z.enum(C.shapes).optional(),
  c: hex,
  w: z.number().min(0.2).max(80),
  o: z.number().min(0.05).max(1),
  pts: z.array(z.number().finite().min(COORD_MIN).max(COORD_MAX)).max(30000).refine(a => a.length % 3 === 0, 'Nokta dizisi bozuk.'),
  run: run.optional(),
});
const textBox = z.object({id: shortId, x: coord, y: coord, w: z.number().min(20).max(20000), text: text(20000), font: fontId, size: z.number().min(6).max(160), color: hex, bold: z.boolean().optional()});
export const pageContent = z.object({
  v: z.literal(1),
  template: z.enum(C.papers),
  width: z.number().int().min(300).max(3000),
  height: z.number().int().min(300).max(3000),
  paperColor: hex.optional(),
  lineColor: hex.optional(),
  textColor: hex.optional(),
  spacing: z.number().min(8).max(90).optional(),
  background: z.object({fileId: uuid, kind: z.enum(['pdf', 'image'])}).optional(),
  // Aranabilir metin: PDF'in metin katmanı ya da tanınan el yazısı (görünmez; arama ve Kalemlik AI için).
  searchText: text(60_000).optional(),
  strokes: z.array(stroke).max(20000),
  texts: z.array(textBox).max(300),
  stickers: z.array(placed).max(200),
});

export const coverData = z.object({
  pattern: z.enum(C.coverPatterns),
  patternColor: hex.optional(),
  patternOpacity: z.number().min(0.03).max(1),
  patternSize: z.number().min(2).max(20),
  textColor: hex.optional(),
  font: fontId.optional(),
  showCourse: z.boolean(),
  showTerm: z.boolean(),
  label: text(80),
  stickers: z.array(placed).max(20),
});

// ---------------------------------------------------------------- öğrenme merkezi parçaları
const quizQuestion = z.object({
  id: shortId, type: z.enum(['mcq', 'tf', 'fill']), prompt: z.string().trim().min(1).max(2000),
  options: z.array(text(500)).max(6), answer: text(500), explanation: text(2000), topic: text(120),
});
const quizResult = z.object({
  answers: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), text(500)), correct: z.number().int().min(0).max(60), wrong: z.number().int().min(0).max(60),
  total: z.number().int().min(0).max(60), percent: z.number().min(0).max(100), weakTopics: z.array(text(120)).max(20), finishedAt: z.number().int().nonnegative(),
});
const planItem = z.object({
  id: shortId, date, topic: z.string().trim().min(1).max(200), minutes: z.number().int().min(5).max(600),
  kind: z.enum(['study', 'review', 'quiz', 'rest']), done: z.boolean(), taskId: z.union([uuid, z.literal('')]),
});
const gradeComponent = z.object({id: shortId, name: z.string().trim().min(1).max(40), weight: z.number().min(0).max(100), score: z.number().min(0).max(100).nullable()});

// ---------------------------------------------------------------- eşitlenen varlıklar
export const entitySchemas = {
  notebook: z.object({
    title: z.string().trim().min(1).max(160),
    course: text(120), term: text(60), color: hex, paper: z.enum(C.papers),
    cover: coverData, favorite: z.boolean(),
    trashedAt: z.number().int().nonnegative().nullable(),
    lastOpenedAt: z.number().int().nonnegative().nullable(),
  }),
  page: z.object({notebookId: uuid, position: z.number().finite(), content: pageContent}),
  lesson: z.object({
    title: z.string().trim().min(1).max(120), day: z.number().int().min(0).max(6), start: time, end: time,
    room: text(80), instructor: text(100), color: hex, note: text(1000),
  }).refine(v => v.end > v.start, {message: 'Ders bitişi başlangıçtan sonra olmalı.'}),
  task: z.object({
    title: z.string().trim().min(1).max(160), course: text(120), description: text(5000), dueDate: date,
    dueTime: z.union([time, z.literal('')]), category: z.enum(C.taskCategories), color: hex, done: z.boolean(),
    completedAt: z.number().int().nonnegative().nullable(),
  }),
  focus: z.object({
    topic: text(160), course: text(120), plannedMinutes: z.number().int().min(1).max(600),
    focusedSeconds: z.number().int().min(0).max(36000), completed: z.boolean(),
    startedAt: z.number().int().nonnegative(), endedAt: z.number().int().nonnegative(),
  }),
  sticker: z.object({fileId: uuid, name: z.string().trim().min(1).max(80), width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192)}),
  font: z.object({fileId: uuid, name: z.string().trim().min(1).max(80), missingChars: text(40)}),
  settings: z.object({data: z.record(z.string(), z.unknown())}),
  // ---------------------------------------------------------------- 1.2 öğrenme merkezi
  deck: z.object({title: z.string().trim().min(1).max(160), course: text(120), color: hex, source: text(300)}),
  card: z.object({
    deckId: uuid, front: z.string().trim().min(1).max(4000), back: text(4000), topic: text(120),
    ease: z.number().min(1.3).max(3.5), interval: z.number().min(0).max(36500), due: z.number().int().min(0).max(1e15),
    reps: z.number().int().min(0).max(1e6), lapses: z.number().int().min(0).max(1e6),
    lastReviewAt: z.number().int().nonnegative().nullable(), lastGrade: z.number().int().min(-1).max(3),
  }),
  quiz: z.object({
    title: z.string().trim().min(1).max(160), course: text(120), source: text(300), difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
    questions: z.array(quizQuestion).min(1).max(60),
    result: quizResult.nullable(),
    completedAt: z.number().int().nonnegative().nullable(),
  }),
  studyPlan: z.object({
    title: z.string().trim().min(1).max(160), course: text(120), examTaskId: z.union([uuid, z.literal('')]), examDate: date,
    items: z.array(planItem).max(200), completedAt: z.number().int().nonnegative().nullable(),
  }),
  gradeCourse: z.object({
    term: text(60), name: z.string().trim().min(1).max(120), credit: z.number().min(0).max(30), ects: z.number().min(0).max(60),
    components: z.array(gradeComponent).max(12), letter: z.string().regex(/^[A-Za-z]{0,3}[+-]?$/), included: z.boolean(),
  }),
  recording: z.object({
    title: z.string().trim().min(1).max(160), course: text(120), fileId: z.union([uuid, z.literal('')]), durationMs: z.number().int().min(0).max(86_400_000),
    bookmarks: z.array(z.object({id: shortId, t: z.number().int().min(0).max(86_400_000), label: text(200)})).max(300),
    transcript: text(500_000), summary: text(50_000), notebookId: z.union([uuid, z.literal('')]),
  }),
  journal: z.object({day: date, title: text(160), body: text(100_000), mood: z.string().regex(/^[a-z-]{0,12}$/)}),
};

export const syncBody = z.object({rev: z.number().int().nonnegative(), data: z.unknown()});
