export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const pad = (n: number) => String(n).padStart(2, '0');
/** Yerel tarih → YYYY-AA-GG */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDate(new Date());
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** Pazartesi = 0 … Pazar = 6 */
export const weekday = (d: Date) => (d.getDay() + 6) % 7;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);

export function formatDate(iso: string, withDay = true) {
  const d = parseIso(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}${withDay ? ', ' + DAYS[weekday(d)] : ''}`;
}

export function relativeDay(iso: string) {
  const diff = daysBetween(todayIso(), iso);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  if (diff < 0) return `${-diff} gün geçti`;
  if (diff < 7) return `${diff} gün sonra`;
  return formatDate(iso, false);
}

export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}

export const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function currentTerm(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth();
  if (m >= 8) return `${y}–${y + 1} Güz`;
  if (m <= 0) return `${y - 1}–${y} Güz`;
  if (m <= 5) return `${y - 1}–${y} Bahar`;
  return `${y - 1}–${y} Yaz`;
}

export function contrastText(hex: string) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#16202e' : '#ffffff';
}
