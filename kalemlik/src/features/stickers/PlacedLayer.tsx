import {useRef} from 'react';
import {Copy, RotateCcw, RotateCw, Trash2, ArrowUpToLine} from 'lucide-react';
import type {Placed} from '@/lib/types';
import {usePlacedUrl} from '@/lib/useFile';
import {isNotepad} from './builtin';

interface Props {
  items: Placed[];
  pageW: number;
  pageH: number;
  selectedId: string | null;
  interactive: boolean;
  /** images: yalnızca görseller (mürekkebin altında), controls: yalnızca tutma alanları ve çerçeve (en üstte). */
  mode?: 'all' | 'images' | 'controls';
  onSelect: (id: string | null) => void;
  /** Sürükleme sırasında canlı; commit=true bırakınca (geri al adımı). */
  onChange: (item: Placed, commit: boolean) => void;
  onDuplicate: (item: Placed) => void;
  onDelete: (item: Placed) => void;
  onFront: (item: Placed) => void;
}

function Item({p, pageW, pageH, ghost}: {p: Placed; pageW: number; pageH: number; ghost?: boolean}) {
  const url = usePlacedUrl(ghost ? {} : p);
  return (
    <div className="placed" data-id={p.id} style={{left: `${(p.x / pageW) * 100}%`, top: `${(p.y / pageH) * 100}%`, width: `${(p.w / pageW) * 100}%`, height: `${(p.h / pageH) * 100}%`, transform: `rotate(${p.rot}deg)`}}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

/**
 * Sayfadaki / kapaktaki stickerlar: taşı, köşeden büyüt/küçült (oran korunur), üstteki tutamaçla döndür,
 * çoğalt, sil. Kalem, dokunma ve fareyle çalışır.
 */
export function PlacedLayer({items, pageW, pageH, selectedId, interactive, onSelect, onChange, onDuplicate, onDelete, onFront, mode = 'all'}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const selected = items.find(i => i.id === selectedId) || null;

  const unit = () => {
    const r = root.current!.getBoundingClientRect();
    return {sx: pageW / r.width, sy: pageH / r.height, rect: r};
  };

  const startDrag = (e: React.PointerEvent, item: Placed, kind: 'move' | 'resize' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    const {sx, sy, rect} = unit();
    const start = {x: e.clientX, y: e.clientY};
    const cx = rect.left + ((item.x + item.w / 2) / pageW) * rect.width, cy = rect.top + ((item.y + item.h / 2) / pageH) * rect.height;
    let last = item;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) * sx, dy = (ev.clientY - start.y) * sy;
      if (kind === 'move') last = {...item, x: item.x + dx, y: item.y + dy};
      else if (kind === 'resize') {
        const d0 = Math.hypot(start.x - cx, start.y - cy), d1 = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        const f = Math.max(0.1, d1 / Math.max(1, d0));
        const w = Math.max(24, Math.min(pageW * 2, item.w * f)), h = w * (item.h / item.w);
        last = {...item, w, h, x: item.x + item.w / 2 - w / 2, y: item.y + item.h / 2 - h / 2};
      } else {
        let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
        if (deg > 180) deg -= 360;
        for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(deg - snap) < 4) deg = snap;
        last = {...item, rot: Math.round(deg)};
      }
      onChange(last, false);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (last !== item) onChange(last, true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div ref={root} className={`placed-layer placed-${mode} ${interactive && mode !== 'images' ? 'is-interactive' : ''}`}
      onPointerDown={e => {
        if (!interactive) return;
        const target = (e.target as HTMLElement).closest<HTMLElement>('.placed');
        const item = target && items.find(i => i.id === target.dataset.id);
        if (item) { onSelect(item.id); startDrag(e, item, 'move'); }
        else if (!(e.target as HTMLElement).closest('.placed-frame')) onSelect(null);
      }}>
      {items.map(p => <Item key={p.id} p={p} pageW={pageW} pageH={pageH} ghost={mode === 'controls'} />)}
      {mode !== 'images' && interactive && selected && (
        <div className="placed-frame" style={{left: `${(selected.x / pageW) * 100}%`, top: `${(selected.y / pageH) * 100}%`, width: `${(selected.w / pageW) * 100}%`, height: `${(selected.h / pageH) * 100}%`, transform: `rotate(${selected.rot}deg)`}}>
          <div className="placed-move" onPointerDown={e => startDrag(e, selected, 'move')} />
          <button type="button" className="handle handle-rotate" aria-label="Döndür (sürükle)" onPointerDown={e => startDrag(e, selected, 'rotate')} />
          <button type="button" className="handle handle-resize" aria-label="Boyutlandır (sürükle)" onPointerDown={e => startDrag(e, selected, 'resize')} />
          <div className="placed-tools" style={{transform: `rotate(${-selected.rot}deg)`}} onPointerDown={e => e.stopPropagation()}>
            <button type="button" aria-label="Sola döndür" title="Sola döndür" onClick={() => onChange({...selected, rot: ((selected.rot - 15 + 540) % 360) - 180}, true)}><RotateCcw size={16} /></button>
            <button type="button" aria-label="Sağa döndür" title="Sağa döndür" onClick={() => onChange({...selected, rot: ((selected.rot + 15 + 540) % 360) - 180}, true)}><RotateCw size={16} /></button>
            <button type="button" aria-label="Öne getir" title="Öne getir" onClick={() => onFront(selected)}><ArrowUpToLine size={16} /></button>
            <button type="button" aria-label="Çoğalt" title="Çoğalt" onClick={() => onDuplicate(selected)}><Copy size={16} /></button>
            <button type="button" aria-label="Sil" title="Sil" className="is-danger" onClick={() => onDelete(selected)}><Trash2 size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Yeni stickerı alanın ortasına, uygun boyutta yerleştirir. */
export interface PlaceSource {fileId?: string; builtin?: string; width: number; height: number}
export function placeSticker(s: PlaceSource, pageW: number, pageH: number, id: string, widthRatio = 0.3): Placed {
  // Bloknotlar üstüne yazılacağı için daha büyük yerleşir.
  const w = isNotepad(s.builtin) ? Math.min(pageW * 0.42, 440) : Math.min(pageW * widthRatio, s.builtin ? 220 : 600), h = w * (s.height / s.width);
  return {id, ...(s.builtin ? {builtin: s.builtin} : {fileId: s.fileId}), x: pageW / 2 - w / 2, y: pageH / 2 - h / 2, w, h, rot: 0};
}
