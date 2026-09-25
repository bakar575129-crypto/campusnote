// Geri al / yinele: sayfa içeriği değişmez nesne olarak tutulduğu için önceki/sonraki hâli saklamak ucuzdur.
import type {PageContent} from '@/lib/types';

export interface PageSnap {id: string; position: number; content: PageContent}
export type HistoryEntry =
  | {kind: 'content'; pageId: string; before: PageContent; after: PageContent}
  /** Sayfa ekleme/silme/taşıma: etkilenen sayfaların önceki ve sonraki hâli (null = yok). */
  | {kind: 'pages'; changes: {id: string; before: PageSnap | null; after: PageSnap | null}[]; focusBefore: number; focusAfter: number};

const LIMIT = 150;

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  version = 0;

  push(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }
  undo(): HistoryEntry | undefined {
    const e = this.undoStack.pop();
    if (e) { this.redoStack.push(e); this.emit(); }
    return e;
  }
  redo(): HistoryEntry | undefined {
    const e = this.redoStack.pop();
    if (e) { this.undoStack.push(e); this.emit(); }
    return e;
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; for (const l of this.listeners) l(); }
}
