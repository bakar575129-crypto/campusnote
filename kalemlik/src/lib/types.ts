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

export type StylusAction = 'none' | 'eraser' | 'pen' | 'highlighter' | 'select' | 'hand' | 'undo';
export type WriteMode = 'off' | 'word' | 'sentence';

export interface PenSetting {color: string; width: number; opacity: number}
export interface WriteSettings {mode: WriteMode; font: string; size: number; weight: number; spacing: number; delay: number; engine: 'auto' | 'device'}

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
}

export interface EntityMap {
  notebook: Notebook; page: Page; lesson: Lesson; task: Task; focus: FocusSession;
  sticker: StickerAsset; font: FontAsset; settings: SettingsRecord;
}
export type EntityName = keyof EntityMap;
export const ENTITY_NAMES: EntityName[] = ['notebook', 'page', 'lesson', 'task', 'focus', 'sticker', 'font', 'settings'];

export interface User {id: string; email: string; name: string; role: 'user' | 'admin'; university: string; department: string; createdAt: number}
