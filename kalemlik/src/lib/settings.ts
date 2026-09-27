import {useSyncExternalStore} from 'react';
import {get, put, subscribe} from './store';
import type {PenSetting, UserSettings} from './types';
import {DEFAULT_SCALE} from '@/features/grades/grades';
import type {PenId} from './constants';

export const PEN_DEFAULTS: Record<PenId, PenSetting> = {
  ballpoint: {color: '#1b2433', width: 2.6, opacity: 1},
  fountain: {color: '#1d4ed8', width: 3.2, opacity: 1},
  pencil: {color: '#4b5563', width: 2.4, opacity: 0.85},
  fineliner: {color: '#111827', width: 1.6, opacity: 1},
  brush: {color: '#b91c1c', width: 6, opacity: 1},
  marker: {color: '#0f766e', width: 8, opacity: 0.95},
  highlighter: {color: '#fde047', width: 22, opacity: 0.4},
};

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  accent: '#2f6fed',
  defaultPaper: 'lined',
  pens: PEN_DEFAULTS,
  activePen: 'ballpoint',
  eraser: {size: 24, mode: 'partial'},
  shape: 'rectangle',
  railSide: 'left',
  penOnly: false,
  zoomLock: false,
  write: {mode: 'off', font: 'nunito', delay: 600, engine: 'auto', lang: 'tr'},
  stylus: {barrel: 'eraser', tip: 'eraser'},
  text: {font: 'nunito', size: 22, color: '#1b2433'},
  focus: {work: 25, short: 5, long: 15, every: 4, autoBreak: false, sound: true},
  recentColors: [],
  studyGoal: 90,
  gradeScale: DEFAULT_SCALE,
  gradeRounding: true,
  notifications: {exam: true, homework: true, study: true, flashcard: true, streak: true, ai: true, examDays: [7, 3, 1], homeworkDays: 2, studyTime: '20:00', browser: false},
  notifDismissed: [],
};

let cache: {raw: unknown; value: UserSettings} | null = null;

/**
 * Yazı ayarları. Eski "otomatik yazı düzeltme" (kelime/cümle, kendi el yazımı hizalama) kaldırıldı: eski kayıtlar
 * kapalı sayılır, herkes kendi el yazısıyla başlar. Akıllı Yazı Güzelleştirme yalnızca bilerek açılırsa çalışır.
 */
function resolveWrite(raw: Partial<UserSettings['write']> | undefined): UserSettings['write'] {
  const d = DEFAULT_SETTINGS.write;
  const w = raw || {};
  return {
    mode: w.mode === 'beautify' ? 'beautify' : 'off',
    font: typeof w.font === 'string' && w.font && w.font !== 'own' ? w.font : d.font,
    delay: [300, 600, 1000].includes(w.delay as number) ? w.delay as number : d.delay,
    engine: w.engine === 'device' ? 'device' : 'auto',
    lang: w.lang === 'en' ? 'en' : 'tr',
  };
}

/** Kayıtlı (eksik ya da eski) ayarları varsayılanlarla birleştirir. */
export function resolveSettings(raw: Partial<UserSettings> | undefined): UserSettings {
  const d = DEFAULT_SETTINGS;
  const s = raw || {};
  const pens = {...d.pens};
  for (const id of Object.keys(pens) as PenId[]) pens[id] = {...pens[id], ...(s.pens?.[id] || {})};
  return {
    ...d, ...s,
    pens,
    eraser: {...d.eraser, ...(s.eraser || {})},
    write: resolveWrite(s.write),
    stylus: {...d.stylus, ...(s.stylus || {})},
    text: {...d.text, ...(s.text || {})},
    focus: {...d.focus, ...(s.focus || {})},
    recentColors: Array.isArray(s.recentColors) ? s.recentColors.slice(0, 12) : [],
    gradeScale: Array.isArray(s.gradeScale) && s.gradeScale.length && s.gradeScale.every(r => r && typeof r.letter === 'string' && Number.isFinite(r.min) && Number.isFinite(r.point)) ? s.gradeScale.slice(0, 20) : d.gradeScale,
    gradeRounding: s.gradeRounding !== false,
    notifications: {...d.notifications, ...(s.notifications || {}), examDays: Array.isArray(s.notifications?.examDays) ? s.notifications!.examDays.filter(n => Number.isInteger(n) && n > 0 && n <= 60).slice(0, 5) : d.notifications.examDays},
    notifDismissed: Array.isArray(s.notifDismissed) ? s.notifDismissed.filter(x => typeof x === 'string').slice(-300) : [],
    studyGoal: Number.isFinite(s.studyGoal) && (s.studyGoal as number) >= 10 && (s.studyGoal as number) <= 900 ? Math.round(s.studyGoal as number) : d.studyGoal,
  };
}

export function getSettings(): UserSettings {
  const raw = get('settings', 'me')?.data;
  if (!cache || cache.raw !== raw) cache = {raw, value: resolveSettings(raw)};
  return cache.value;
}

export function useSettings(): UserSettings {
  return useSyncExternalStore(subscribe, getSettings);
}

type Patch = {[K in keyof UserSettings]?: UserSettings[K] extends object ? Partial<UserSettings[K]> : UserSettings[K]};

/** Ayarları kısmen günceller; iç içe nesneler birleştirilir. Kalem ayarları eşitlenir, her cihazda aynıdır. */
export function updateSettings(patch: Patch) {
  const cur = getSettings();
  const next: Record<string, unknown> = {...cur};
  for (const [k, v] of Object.entries(patch)) {
    const old = (cur as unknown as Record<string, unknown>)[k];
    next[k] = v && typeof v === 'object' && !Array.isArray(v) && old && typeof old === 'object' ? {...old, ...v} : v;
  }
  put('settings', {id: 'me', data: next as Partial<UserSettings>});
}

export function updatePen(id: PenId, patch: Partial<PenSetting>) {
  const cur = getSettings();
  updateSettings({pens: {...cur.pens, [id]: {...cur.pens[id], ...patch}}});
}

export function rememberColor(color: string) {
  const cur = getSettings();
  const list = [color, ...cur.recentColors.filter(c => c !== color)].slice(0, 10);
  updateSettings({recentColors: list});
}
