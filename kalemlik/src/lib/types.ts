import type {CoverPattern, PaperId, PenId, ShapeId, TaskCategory} from './constants';

export interface Base {id: string; rev: number; createdAt: number; updatedAt: number}

/** Sayfaya ya da kapağa yerleştirilmiş sticker / görsel (sayfa birimi: 1000 × 1414). */
export interface Placed {id: string; fileId?: string; builtin?: string; x: number; y: number; w: number; h: number; rot: number}

/** Yazı tipiyle "temize çekilmiş" satır: noktalar kutuyu, run metni tutar. */
export interface TextRun {text: string; font: string; size: number; weight: number; spacing: number}

/** pts: [x, y, basınç, x, y, basınç, ...] düz dizi (JSON'da küçük yer kaplar). */
export interface Stroke {id: string; t: 'pen' | 'shape' | 'text'; pen?: PenId; shape?: ShapeId; c: string; w: number; o: number; pts: number[]; run?: TextRun}

export interface TextBox {id: string; x: number; y: number; w: number; text: string; font: string; size: number; color: string; bold?: boolean}

export interface PageContent {
  v: 1;
  template: PaperId;
  width: number;
  height: number;
  paperColor?: string;
  lineColor?: string;
  textColor?: string;
  spacing?: number;
  background?: {fileId: string; kind: 'pdf' | 'image'};
  /** Aranabilir metin: PDF metin katmanı ya da tanınan el yazısı (görünmez). */
  searchText?: string;
  strokes: Stroke[];
  texts: TextBox[];
  stickers: Placed[];
}

export interface Cover {
  pattern: CoverPattern;
  patternColor?: string;
  patternOpacity: number;
  patternSize: number;
  textColor?: string;
  font?: string;
  showCourse: boolean;
  showTerm: boolean;
  label: string;
  stickers: Placed[];
}

export interface Notebook extends Base {
  title: string; course: string; term: string; color: string; paper: PaperId;
  cover: Cover; favorite: boolean; trashedAt: number | null; lastOpenedAt: number | null;
}
export interface Page extends Base {notebookId: string; position: number; content?: PageContent}
export interface Lesson extends Base {title: string; day: number; start: string; end: string; room: string; instructor: string; color: string; note: string}
export interface Task extends Base {title: string; course: string; description: string; dueDate: string; dueTime: string; category: TaskCategory; color: string; done: boolean; completedAt: number | null}
export interface FocusSession extends Base {topic: string; course: string; plannedMinutes: number; focusedSeconds: number; completed: boolean; startedAt: number; endedAt: number}
export interface StickerAsset extends Base {fileId: string; name: string; width: number; height: number}
export interface FontAsset extends Base {fileId: string; name: string; missingChars: string}
export interface SettingsRecord extends Base {data: Partial<UserSettings>}

// ---------------------------------------------------------------- 1.2 öğrenme merkezi
export interface Deck extends Base {title: string; course: string; color: string; source: string}
/** Aralıklı tekrar (SM-2): ease kolaylık, interval gün, due sonraki tekrar zamanı (ms). lastGrade: 0 tekrar, 1 zor, 2 orta, 3 kolay. */
export interface Card extends Base {deckId: string; front: string; back: string; topic: string; ease: number; interval: number; due: number; reps: number; lapses: number; lastReviewAt: number | null; lastGrade: number}
export type QuestionType = 'mcq' | 'tf' | 'fill';
export interface QuizQuestion {id: string; type: QuestionType; prompt: string; options: string[]; answer: string; explanation: string; topic: string}
export interface QuizResult {answers: Record<string, string>; correct: number; wrong: number; total: number; percent: number; weakTopics: string[]; finishedAt: number}
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export interface Quiz extends Base {title: string; course: string; source: string; difficulty: Difficulty; questions: QuizQuestion[]; result: QuizResult | null; completedAt: number | null}
export interface PlanItem {id: string; date: string; topic: string; minutes: number; kind: 'study' | 'review' | 'quiz' | 'rest'; done: boolean; taskId: string}
export interface StudyPlan extends Base {title: string; course: string; examTaskId: string; examDate: string; items: PlanItem[]; completedAt: number | null}
export interface GradeComponent {id: string; name: string; weight: number; score: number | null}
export interface GradeCourse extends Base {term: string; name: string; credit: number; ects: number; components: GradeComponent[]; letter: string; included: boolean}
export interface Bookmark {id: string; t: number; label: string}
export interface Recording extends Base {title: string; course: string; fileId: string; durationMs: number; bookmarks: Bookmark[]; transcript: string; summary: string; notebookId: string}
export interface JournalEntry extends Base {day: string; title: string; body: string; mood: string}

export type StylusAction = 'none' | 'eraser' | 'pen' | 'highlighter' | 'select' | 'hand' | 'undo';
/** off: yalnızca kendi el yazın. beautify: Akıllı Yazı Güzelleştirme (tanınan metin seçilen yazı tipinde). */
export type WriteMode = 'off' | 'beautify';

export interface PenSetting {color: string; width: number; opacity: number}
export interface WriteSettings {mode: WriteMode; font: string; delay: number; engine: 'auto' | 'device'; lang: 'tr' | 'en'}

export interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  accent: string;
  defaultPaper: PaperId;
  pens: Record<PenId, PenSetting>;
  activePen: PenId;
  eraser: {size: number; mode: 'stroke' | 'partial'};
  shape: ShapeId;
  railSide: 'left' | 'right';
  penOnly: boolean;
  zoomLock: boolean;
  write: WriteSettings;
  stylus: {barrel: StylusAction; tip: StylusAction};
  text: {font: string; size: number; color: string};
  focus: {work: number; short: number; long: number; every: number; autoBreak: boolean; sound: boolean};
  recentColors: string[];
  /** Günlük çalışma hedefi (dakika). */
  studyGoal: number;
}

export interface EntityMap {
  notebook: Notebook; page: Page; lesson: Lesson; task: Task; focus: FocusSession;
  sticker: StickerAsset; font: FontAsset; settings: SettingsRecord;
  deck: Deck; card: Card; quiz: Quiz; studyPlan: StudyPlan; gradeCourse: GradeCourse; recording: Recording; journal: JournalEntry;
}
export type EntityName = keyof EntityMap;
export const ENTITY_NAMES: EntityName[] = ['notebook', 'page', 'lesson', 'task', 'focus', 'sticker', 'font', 'settings', 'deck', 'card', 'quiz', 'studyPlan', 'gradeCourse', 'recording', 'journal'];

export interface User {id: string; email: string; name: string; role: 'user' | 'admin'; university: string; department: string; createdAt: number}
