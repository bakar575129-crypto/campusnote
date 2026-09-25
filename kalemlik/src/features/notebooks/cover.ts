import type {CoverPattern, PaperId} from '@/lib/constants';
import type {Cover} from '@/lib/types';
import {contrastText} from '@/lib/format';
import {PAGE_H, PAGE_W} from '@/lib/constants';

export const COVER_PATTERN_NAMES: Record<CoverPattern, string> = {
  none: 'Düz', theme: 'Deftere uygun', lined: 'Çizgili', grid: 'Kareli', dotted: 'Noktalı',
  diagonal: 'Çapraz', checker: 'Dama', waves: 'Dalga', triangles: 'Üçgen',
};

export const DEFAULT_COVER: Cover = {pattern: 'theme', patternOpacity: 0.18, patternSize: 5, showCourse: true, showTerm: true, label: '', stickers: []};

export const coverTextColor = contrastText;

/** "Deftere uygun": iç sayfa çizgiliyse çizgili, kareliyse kareli, noktalıysa noktalı kapak. */
export function resolveCoverPattern(pattern: CoverPattern, paper: PaperId): CoverPattern {
  if (pattern !== 'theme') return pattern;
  if (['lined', 'narrow', 'wide', 'margin', 'cornell', 'vocabulary', 'weekly', 'music', 'lab'].includes(paper)) return 'lined';
  if (['grid', 'grid-small', 'grid-large', 'engineering', 'coordinate', 'cornell-grid', 'isometric'].includes(paper)) return 'grid';
  if (['dotted', 'cornell-dotted'].includes(paper)) return 'dotted';
  return 'diagonal';
}

/**
 * Kapak deseni: kapak boyutunda (1000 × 1414) tek bir SVG. Kartta, düzenleyicide, editörde ve PDF'te
 * aynı kaynaktan çizildiği için her yerde birebir aynı görünür. size = desen karesi, kapak yüksekliğinin %'si.
 */
export function coverPatternSvg(pattern: CoverPattern, color: string, opacity: number, size: number): {markup: string} | null {
  if (pattern === 'none' || pattern === 'theme') return null;
  const t = Math.max(2, Math.min(20, size)) / 100 * PAGE_H;
  const sw = Math.max(1.5, t * 0.05);
  let body = '';
  let w = t, h = t;
  switch (pattern) {
    case 'lined': body = `<line x1="0" y1="${t - sw / 2}" x2="${t}" y2="${t - sw / 2}" stroke="${color}" stroke-width="${sw}"/>`; break;
    case 'grid': body = `<path d="M0 0H${t}M0 0V${t}" stroke="${color}" stroke-width="${sw * 1.4}" fill="none"/>`; break;
    case 'dotted': body = `<circle cx="${t / 2}" cy="${t / 2}" r="${sw * 1.4}" fill="${color}"/>`; break;
    case 'diagonal': body = `<path d="M${-t * 0.25} ${t * 0.25}L${t * 0.25} ${-t * 0.25}M0 ${t}L${t} 0M${t * 0.75} ${t * 1.25}L${t * 1.25} ${t * 0.75}" stroke="${color}" stroke-width="${sw}"/>`; break;
    case 'checker': w = h = t * 2; body = `<rect width="${t}" height="${t}" fill="${color}"/><rect x="${t}" y="${t}" width="${t}" height="${t}" fill="${color}"/>`; break;
    case 'waves': w = t * 2; body = `<path d="M0 ${t / 2}Q${t / 2} 0 ${t} ${t / 2}T${t * 2} ${t / 2}" fill="none" stroke="${color}" stroke-width="${sw}"/>`; break;
    case 'triangles': body = `<path d="M0 ${t}L${t / 2} ${t * 0.1}L${t} ${t}Z" fill="none" stroke="${color}" stroke-width="${sw}"/>`; break;
  }
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" preserveAspectRatio="none"><defs><pattern id="p" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern></defs><rect width="100%" height="100%" fill="url(#p)" opacity="${opacity}"/></svg>`;
  return {markup};
}

export function coverPatternUrl(cover: Cover, paper: PaperId, bg: string) {
  const svg = coverPatternSvg(resolveCoverPattern(cover.pattern, paper), cover.patternColor || coverTextColor(bg), cover.patternOpacity, cover.patternSize);
  return svg ? `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}")` : 'none';
}
