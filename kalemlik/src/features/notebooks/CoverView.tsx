import type {Notebook, Placed} from '@/lib/types';
import {PAGE_H, PAGE_W} from '@/lib/constants';
import {usePlacedUrl} from '@/lib/useFile';
import {fontStack} from '@/features/fonts/fonts';
import {coverPatternUrl, coverTextColor} from './cover';

export function PlacedImage({p, onPointerDown, selected}: {p: Placed; onPointerDown?: (e: React.PointerEvent) => void; selected?: boolean}) {
  const url = usePlacedUrl(p);
  return (
    <div className={`placed ${selected ? 'is-selected' : ''}`} onPointerDown={onPointerDown}
      style={{left: `${(p.x / PAGE_W) * 100}%`, top: `${(p.y / PAGE_H) * 100}%`, width: `${(p.w / PAGE_W) * 100}%`, height: `${(p.h / PAGE_H) * 100}%`, transform: `rotate(${p.rot}deg)`}}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

/** Defter kapağı: kartta, kapak düzenleyicide ve defterin ilk sayfasında aynı bileşen. Ölçeği kapsayıcı genişliğidir. */
export function CoverView({nb, children, className = '', stickers = true}: {nb: Pick<Notebook, 'title' | 'course' | 'term' | 'color' | 'paper' | 'cover'>; children?: React.ReactNode; className?: string; stickers?: boolean}) {
  const c = nb.cover;
  const ink = c.textColor || coverTextColor(nb.color);
  const sub = [c.showCourse ? nb.course : '', c.showTerm ? nb.term : ''].filter(Boolean).join(' · ');
  return (
    <div className={`cover ${className}`} style={{background: nb.color, '--cover-ink': ink, fontFamily: fontStack(c.font || 'nunito')} as React.CSSProperties}>
      <div className="cover-pattern" style={{backgroundImage: coverPatternUrl(c, nb.paper, nb.color)}} />
      <div className="cover-spine" />
      <div className="cover-label">
        <strong>{nb.title}</strong>
        {sub && <span>{sub}</span>}
      </div>
      {c.label && <div className="cover-note">{c.label}</div>}
      {stickers && c.stickers.map(p => <PlacedImage key={p.id} p={p} />)}
      {children}
    </div>
  );
}
