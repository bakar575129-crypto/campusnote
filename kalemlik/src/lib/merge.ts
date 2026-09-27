// Sayfa birleştirme (üç yönlü): aynı sayfa iki yerde (iki cihaz ya da ortak defterde iki kişi) aynı anda
// düzenlendiğinde, ortak başlangıç (base), bu cihazdaki sürüm (mine) ve sunucudaki sürüm (theirs) öğe öğe birleşir.
// Kural: kimin eklediği korunur; bir tarafın sildiği öğe, öbür taraf onu değiştirmediyse silinir; iki taraf da aynı
// öğeyi değiştirdiyse bu cihazdaki (son düzenleyen) sürüm kazanır. Başlangıç bilinmiyorsa hiçbir şey silinmez (birleşim).
import type {PageContent, Placed, Stroke, TextBox} from './types';

type Item = Stroke | TextBox | Placed;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeList<T extends Item>(base: T[] | null, mine: T[], theirs: T[]): T[] {
  const b = new Map((base || []).map(x => [x.id, x]));
  const m = new Map(mine.map(x => [x.id, x]));
  const t = new Map(theirs.map(x => [x.id, x]));
  const out: T[] = [];
  const decide = (id: string): T | null => {
    const bi = b.get(id), mi = m.get(id), ti = t.get(id);
    if (!base) return mi || ti || null; // başlangıç yok: birleşim (bu cihaz öncelikli)
    if (!bi) return mi || ti || null; // yeni eklenen (bir taraf ya da ikisi)
    if (!mi && !ti) return null; // iki taraf da sildi
    if (!mi) return eq(ti, bi) ? null : ti!; // ben sildim; öbürü değiştirmediyse silinir
    if (!ti) return eq(mi, bi) ? null : mi; // öbürü sildi; ben değiştirmediysem silinir
    if (eq(mi, bi)) return ti; // yalnızca öbürü değiştirdi
    return mi; // ben değiştirdim (ya da ikimiz de): benimki
  };
  const seen = new Set<string>();
  // Sıra: sunucudaki sıra korunur, bu cihazda yeni eklenenler sona gelir (çizim sırası = üst üste gelme sırası).
  for (const x of theirs) { seen.add(x.id); const r = decide(x.id); if (r) out.push(r); }
  for (const x of mine) { if (seen.has(x.id)) continue; seen.add(x.id); const r = decide(x.id); if (r) out.push(r); }
  return out;
}

const PAGE_PROPS = ['template', 'width', 'height', 'paperColor', 'lineColor', 'textColor', 'spacing', 'background', 'searchText'] as const;

export function mergePage(base: PageContent | null, mine: PageContent, theirs: PageContent): PageContent {
  const out: PageContent = {...theirs, strokes: mergeList(base?.strokes || null, mine.strokes, theirs.strokes), texts: mergeList(base?.texts || null, mine.texts, theirs.texts), stickers: mergeList(base?.stickers || null, mine.stickers, theirs.stickers)};
  for (const k of PAGE_PROPS) {
    // Sayfa ayarı: bu cihazda değiştiyse bu cihazınki, yoksa sunucudaki.
    const changedHere = base ? !eq(mine[k], base[k]) : false;
    const value = changedHere ? mine[k] : theirs[k];
    if (value === undefined) delete (out as Partial<PageContent>)[k]; else (out as unknown as Record<string, unknown>)[k] = value;
  }
  return out;
}
