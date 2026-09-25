import {memo, useEffect, useRef} from 'react';
import type {PaperId} from '@/lib/constants';
import {PAGE_H, PAGE_W} from '@/lib/constants';
import {PAPER_GROUPS, PAPERS, paintPaper} from './paper';

export const PaperThumb = memo(function PaperThumb({id, paperColor, lineColor}: {id: PaperId; paperColor?: string; lineColor?: string}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const w = 90, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = Math.round(w * 1.414) * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform((w * dpr) / PAGE_W, 0, 0, (w * dpr) / PAGE_W, 0, 0);
    paintPaper(ctx, {template: id, width: PAGE_W, height: PAGE_H, paperColor, lineColor: lineColor || '#aebfd8'});
  }, [id, paperColor, lineColor]);
  return <canvas ref={ref} className="paper-thumb" aria-hidden />;
});

export function TemplatePicker({value, onChange, paperColor, lineColor}: {value: PaperId; onChange: (id: PaperId) => void; paperColor?: string; lineColor?: string}) {
  return (
    <div className="template-picker">
      {PAPER_GROUPS.map(group => (
        <section key={group}>
          <h4>{group}</h4>
          <div className="template-grid" role="radiogroup" aria-label={group}>
            {PAPERS.filter(p => p.group === group).map(p => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === value} className={`template-item ${p.id === value ? 'is-on' : ''}`} onClick={() => onChange(p.id)}>
                <PaperThumb id={p.id} paperColor={paperColor} lineColor={lineColor} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
