// Sunucuyla ortak sabitler (shared/constants.json ile birebir aynı olmalı — tests/unit/constants.test.mjs kontrol eder).
export const PAGE_W = 1000;
export const PAGE_H = 1414;

export const PAPER_IDS = ['blank', 'lined', 'narrow', 'wide', 'margin', 'grid', 'grid-small', 'grid-large', 'dotted', 'cornell', 'cornell-grid', 'cornell-dotted', 'lab', 'vocabulary', 'weekly', 'mindmap', 'engineering', 'coordinate', 'polar', 'semilog', 'loglog', 'isometric', 'hexagonal', 'music'] as const;
export type PaperId = typeof PAPER_IDS[number];

export const PEN_IDS = ['ballpoint', 'fountain', 'pencil', 'fineliner', 'brush', 'marker', 'highlighter'] as const;
export type PenId = typeof PEN_IDS[number];

export const SHAPE_IDS = ['line', 'arrow', 'square', 'rectangle', 'circle', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star'] as const;
export type ShapeId = typeof SHAPE_IDS[number];

export const COVER_PATTERNS = ['none', 'theme', 'lined', 'grid', 'dotted', 'diagonal', 'checker', 'waves', 'triangles', 'paws', 'cats', 'bunnies', 'bears', 'daisies', 'tulips', 'bees', 'ladybugs', 'butterflies', 'hearts', 'stars', 'strawberries', 'clouds', 'mushrooms'] as const;
export type CoverPattern = typeof COVER_PATTERNS[number];

export const TASK_CATEGORIES = ['homework', 'exam', 'todo'] as const;
export type TaskCategory = typeof TASK_CATEGORIES[number];

export const PALETTE = ['#2f6fed', '#e0643a', '#1f9d7a', '#8b5cf6', '#d9467a', '#e3a008', '#0e7490', '#475569', '#16a34a', '#b45309', '#1f3a5f', '#be123c'];
export const INK_COLORS = ['#1b2433', '#1d4ed8', '#b91c1c', '#15803d', '#7c3aed', '#c2410c', '#0f766e', '#6b7280', '#db2777', '#0369a1'];
export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd'];
