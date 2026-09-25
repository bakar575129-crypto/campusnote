import {useEffect, useLayoutEffect, useRef} from 'react';
import {Bold, List, ListOrdered, Move, Trash2} from 'lucide-react';
import type {TextBox} from '@/lib/types';
import {INK_COLORS} from '@/lib/constants';
import {allFonts, ensureFont, fontStack} from '@/features/fonts/fonts';

/** Enter ile madde işaretli / numaralı listeyi sürdürür; boş madde satırında listeyi bitirir. */
export function continueList(value: string, caret: number): {value: string; caret: number} | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const bullet = /^(\s*)([•\-*])\s/.exec(line);
  const numbered = /^(\s*)(\d+)([.)])\s/.exec(line);
  const m = bullet || numbered;
  if (!m) return null;
  if (line.trim() === m[0].trim()) {
    // Boş madde: işareti kaldır, listeden çık.
    const next = value.slice(0, lineStart) + value.slice(caret);
    return {value: next, caret: lineStart};
  }
  const prefix = bullet ? `${bullet[1]}${bullet[2]} ` : `${numbered![1]}${Number(numbered![2]) + 1}${numbered![3]} `;
  const insert = '\n' + prefix;
  return {value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length};
}

/** Satırın başına madde işareti / numara ekler ya da kaldırır. */
export function toggleListPrefix(value: string, kind: 'bullet' | 'number') {
  const lines = value.split('\n');
  const has = lines.every(l => (kind === 'bullet' ? /^\s*[•\-*]\s/ : /^\s*\d+[.)]\s/).test(l) || !l.trim());
  return lines.map((l, i) => {
    const clean = l.replace(/^\s*([•\-*]|\d+[.)])\s/, '');
    if (has || !clean.trim()) return clean;
    return kind === 'bullet' ? `• ${clean}` : `${i + 1}. ${clean}`;
  }).join('\n');
}

interface Props {
  texts: TextBox[];
  interactive: boolean;
  activeId: string | null;
  selectedIds: string[];
  onActivate(id: string | null): void;
  onChange(next: TextBox, live: boolean): void;
  onDelete(id: string): void;
  onEditStart(): void;
  onEditEnd(): void;
}

function Box({t, active, interactive, selected, onActivate, onChange, onDelete, onEditStart, onEditEnd}: {t: TextBox; active: boolean; interactive: boolean; selected: boolean} & Omit<Props, 'texts' | 'activeId' | 'interactive' | 'selectedIds'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  useEffect(() => { void ensureFont(t.font); }, [t.font]);
  // Liste devamında imleç, metin güncellenir güncellenmez doğru yere konur (yazmaya devam eden karakterler kaçmaz).
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) { ref.current.setSelectionRange(caret.current, caret.current); caret.current = null; }
  }, [t.text]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [t.text, t.size, t.w, t.font]);
  useEffect(() => { if (active) ref.current?.focus({preventScroll: true}); }, [active]);

  const drag = (e: React.PointerEvent, mode: 'move' | 'width') => {
    e.stopPropagation(); e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    const paper = el.closest('.paper') as HTMLElement;
    const zoom = paper.getBoundingClientRect().width / paper.offsetWidth;
    const sx = e.clientX, sy = e.clientY;
    let last = t;
    onEditStart();
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      last = mode === 'move' ? {...t, x: t.x + dx, y: t.y + dy} : {...t, w: Math.max(60, t.w + dx)};
      onChange(last, true);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onChange(last, true); onEditEnd(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };

  return (
    <div className={`textbox ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`} style={{left: t.x, top: t.y, width: t.w}}
      onPointerDown={e => { if (interactive) { e.stopPropagation(); if (!active) onActivate(t.id); } }}>
      <textarea ref={ref} value={t.text} spellCheck lang="tr" aria-label="Metin kutusu" readOnly={!interactive}
        style={{fontFamily: fontStack(t.font), fontSize: t.size, color: t.color, fontWeight: t.bold ? 700 : 400, lineHeight: 1.35}}
        onFocus={onEditStart} onBlur={onEditEnd}
        onChange={e => onChange({...t, text: e.target.value.slice(0, 20000)}, true)}
        onKeyDown={e => {
          if (e.key === 'Escape') { (e.target as HTMLTextAreaElement).blur(); onActivate(null); }
          if (e.key === 'Enter' && !e.shiftKey) {
            const el = e.currentTarget;
            const res = continueList(el.value, el.selectionStart);
            if (res) {
              e.preventDefault();
              caret.current = res.caret;
              onChange({...t, text: res.value}, true);
            }
          }
          e.stopPropagation();
        }} />
      {active && (
        <>
          <button type="button" className="textbox-move" aria-label="Metin kutusunu taşı" onPointerDown={e => drag(e, 'move')}><Move size={14} /></button>
          <button type="button" className="textbox-width" aria-label="Genişliği ayarla" onPointerDown={e => drag(e, 'width')} />
          <div className="textbox-tools" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}>
            <select value={t.font} aria-label="Yazı tipi" onChange={e => onChange({...t, font: e.target.value}, false)} onPointerDown={e => e.stopPropagation()}>
              {allFonts().map(f => <option key={f.id} value={f.id}>{f.name.replace(/ \(.*\)/, '')}</option>)}
            </select>
            <select value={t.size} aria-label="Yazı boyutu" onChange={e => onChange({...t, size: Number(e.target.value)}, false)} onPointerDown={e => e.stopPropagation()}>
              {[12, 14, 16, 18, 20, 22, 26, 30, 36, 44, 56, 72].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" aria-label="Kalın" aria-pressed={!!t.bold} className={t.bold ? 'is-on' : ''} onClick={() => onChange({...t, bold: !t.bold}, false)}><Bold size={16} /></button>
            <button type="button" aria-label="Madde işareti" onClick={() => onChange({...t, text: toggleListPrefix(t.text, 'bullet')}, false)}><List size={16} /></button>
            <button type="button" aria-label="Numaralı liste" onClick={() => onChange({...t, text: toggleListPrefix(t.text, 'number')}, false)}><ListOrdered size={16} /></button>
            {INK_COLORS.slice(0, 6).map(c => <button key={c} type="button" aria-label={`Renk ${c}`} className={`dot-btn ${c === t.color ? 'is-on' : ''}`} style={{background: c}} onClick={() => onChange({...t, color: c}, false)} />)}
            <button type="button" aria-label="Metin kutusunu sil" className="is-danger" onClick={() => onDelete(t.id)}><Trash2 size={16} /></button>
          </div>
        </>
      )}
    </div>
  );
}

export function TextLayer(props: Props) {
  return (
    <div className={`text-layer ${props.interactive ? 'is-interactive' : ''}`}>
      {props.texts.map(t => <Box key={t.id} t={t} active={props.activeId === t.id} selected={props.selectedIds.includes(t.id)} interactive={props.interactive} onActivate={props.onActivate} onChange={props.onChange} onDelete={props.onDelete} onEditStart={props.onEditStart} onEditEnd={props.onEditEnd} />)}
    </div>
  );
}
