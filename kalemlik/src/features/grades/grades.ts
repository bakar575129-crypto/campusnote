// Not hesaplama: ders notu (ağırlıklı ortalama), harf notu, dönem ortalaması, genel ortalama (GANO), AKTS toplamı ve
// "Finalden kaç almalıyım?". Harf ölçeği ve yuvarlama üniversiteye göre değiştiği için ayarlardan düzenlenebilir.
import type {GradeComponent, GradeCourse} from '@/lib/types';

export interface ScaleRow {letter: string; min: number; point: number}
/** YÖK'te yaygın 4'lük sistem (üniversiteler farklı olabilir; ayarlardan değiştirilebilir). */
export const DEFAULT_SCALE: ScaleRow[] = [
  {letter: 'AA', min: 90, point: 4}, {letter: 'BA', min: 85, point: 3.5}, {letter: 'BB', min: 80, point: 3}, {letter: 'CB', min: 75, point: 2.5},
  {letter: 'CC', min: 70, point: 2}, {letter: 'DC', min: 65, point: 1.5}, {letter: 'DD', min: 60, point: 1}, {letter: 'FD', min: 50, point: 0.5}, {letter: 'FF', min: 0, point: 0},
];
export const DEFAULT_COMPONENTS: Omit<GradeComponent, 'id'>[] = [{name: 'Vize', weight: 40, score: null}, {name: 'Final', weight: 60, score: null}];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ağırlıklı ortalama. complete: bütün bileşenlerin notu girilmiş ve ağırlıklar toplamı 100. */
export function courseAverage(c: Pick<GradeCourse, 'components'>, rounding = true) {
  const weightSum = c.components.reduce((n, x) => n + x.weight, 0);
  const scored = c.components.filter(x => x.score !== null);
  const scoredWeight = scored.reduce((n, x) => n + x.weight, 0);
  const points = scored.reduce((n, x) => n + x.weight * (x.score as number), 0);
  const complete = scored.length === c.components.length && c.components.length > 0 && Math.abs(weightSum - 100) < 0.01;
  // Eksik bileşen varken: şu ana kadarki katkı (100 üzerinden) ve girilmiş notların ortalaması ayrı gösterilir.
  const soFar = round2(points / 100);
  const raw = complete ? points / 100 : scoredWeight ? points / scoredWeight : null;
  const avg = raw === null ? null : complete && rounding ? Math.round(raw) : round2(raw);
  return {avg, complete, weightSum: round2(weightSum), soFar, missing: c.components.filter(x => x.score === null)};
}

export function letterFor(avg: number | null, scale: ScaleRow[] = DEFAULT_SCALE) {
  if (avg === null) return null;
  const rows = [...scale].sort((a, b) => b.min - a.min);
  return rows.find(r => avg >= r.min) || rows[rows.length - 1];
}

/** Dersin harf notu: elle girilen varsa o, yoksa tamamlanmış ortalamadan. */
export function courseLetter(c: GradeCourse, scale: ScaleRow[] = DEFAULT_SCALE, rounding = true) {
  if (c.letter) { const row = scale.find(r => r.letter === c.letter); return row ? {...row, manual: true} : null; }
  const {avg, complete} = courseAverage(c, rounding);
  if (!complete) return null;
  const row = letterFor(avg, scale);
  return row ? {...row, manual: false} : null;
}

/** Ağırlık: kredi (varsa), yoksa AKTS. */
const weightOf = (c: GradeCourse) => (c.credit > 0 ? c.credit : c.ects);

export function gpa(courses: GradeCourse[], scale: ScaleRow[] = DEFAULT_SCALE, rounding = true) {
  let pts = 0, w = 0, ects = 0, credit = 0, counted = 0;
  for (const c of courses) {
    if (!c.included) continue;
    const l = courseLetter(c, scale, rounding);
    if (!l) continue;
    const cw = weightOf(c);
    pts += l.point * cw; w += cw; counted++;
    if (l.point > 0) { ects += c.ects; credit += c.credit; } // kalınan ders AKTS/kredi kazandırmaz
  }
  return {gpa: w ? Math.round((pts / w) * 100) / 100 : null, ects: round2(ects), credit: round2(credit), counted};
}

/**
 * Hedef ortalamaya ulaşmak için eksik bileşenden (genellikle final) gereken en düşük not.
 * rounding: ortalama tam sayıya yuvarlanıyorsa (69,5 → 70) hedefin 0,5 altı yeterlidir.
 * Dönüş: gereken not (0–100), 'done' (zaten ulaşıldı), 'impossible' (100 bile yetmez).
 */
export function neededScore(components: GradeComponent[], missingId: string, target: number, rounding = true): number | 'done' | 'impossible' {
  const missing = components.find(c => c.id === missingId);
  if (!missing || missing.weight <= 0) return 'impossible';
  const others = components.filter(c => c.id !== missingId).reduce((n, c) => n + c.weight * (c.score ?? 0), 0) / 100;
  const goal = rounding ? target - 0.5 : target;
  const need = ((goal - others) / missing.weight) * 100;
  if (need <= 0) return 'done';
  const up = Math.ceil(need - 1e-9);
  return up > 100 ? 'impossible' : up;
}

/** Basit "Finalden kaç almalıyım?" hesabı: vize, vize ağırlığı, final ağırlığı, hedef. */
export function neededFinal(midterm: number, midWeight: number, finalWeight: number, target: number, rounding = true) {
  return neededScore([{id: 'v', name: 'Vize', weight: midWeight, score: midterm}, {id: 'f', name: 'Final', weight: finalWeight, score: null}], 'f', target, rounding);
}
