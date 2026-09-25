export type Tool = 'pen' | 'eraser' | 'select' | 'lasso' | 'text' | 'shape' | 'hand';
export interface Selection {strokes: string[]; texts: string[]}
export const emptySelection: Selection = {strokes: [], texts: []};
export const hasSelection = (s: Selection) => s.strokes.length > 0 || s.texts.length > 0;
export interface View {zoom: number; x: number; y: number}
