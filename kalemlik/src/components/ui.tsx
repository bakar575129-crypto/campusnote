import {useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check, X} from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export function Button({variant = 'secondary', size = 'md', icon, children, className = '', busy, ...rest}: ComponentProps<'button'> & {variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; busy?: boolean}) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} disabled={busy || rest.disabled} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({label, children, active, className = '', size = 'md', ...rest}: ComponentProps<'button'> & {label: string; active?: boolean; size?: 'sm' | 'md' | 'lg'}) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active ?? undefined} className={`icon-btn icon-btn-${size} ${active ? 'is-active' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({label, hint, error, children, htmlFor}: {label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string}) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Switch({checked, onChange, label, description}: {checked: boolean; onChange: (v: boolean) => void; label: string; description?: string}) {
  const id = useId();
  return (
    <label className="switch-row" htmlFor={id}>
      <span className="switch-text"><span>{label}</span>{description && <small>{description}</small>}</span>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({value, options, onChange, label, size = 'md'}: {value: T; options: {value: T; label: ReactNode; title?: string}[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md'}) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Slider({label, value, min, max, step = 1, onChange, format}: {label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string}) {
  const id = useId();
  return (
    <div className="slider">
      <div className="slider-head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{format ? format(value) : value}</output></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{'--p': `${((value - min) / (max - min)) * 100}%`} as React.CSSProperties} />
    </div>
  );
}

// ---------------------------------------------------------------- Dialog

export function Dialog({open, onClose, title, children, footer, size = 'md', className = ''}: {open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select, button:not(.dialog-close)');
      (el || ref.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog dialog-${size} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Kapat" className="dialog-close" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Popover (araç panelleri)

export function Popover({anchor, open, onClose, children, placement = 'bottom', className = '', label}: {anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; placement?: 'bottom' | 'right' | 'left' | 'top'; className?: string; label: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{left: number; top: number} | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return;
    const place = () => {
      const a = anchor.getBoundingClientRect(), p = ref.current!.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, m = 8;
      let left = a.left + a.width / 2 - p.width / 2, top = a.bottom + m;
      if (placement === 'right') { left = a.right + m; top = a.top + a.height / 2 - p.height / 2; }
      if (placement === 'left') { left = a.left - p.width - m; top = a.top + a.height / 2 - p.height / 2; }
      if (placement === 'top') { top = a.top - p.height - m; }
      if (placement === 'bottom' && top + p.height > vh - m) top = a.top - p.height - m;
      if (placement === 'right' && left + p.width > vw - m) left = a.left - p.width - m;
      if (placement === 'left' && left < m) left = a.right + m;
      setPos({left: Math.max(m, Math.min(vw - p.width - m, left)), top: Math.max(m, Math.min(vh - p.height - m, top))});
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [open, anchor, placement]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('pointerdown', down, true));
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, [open, onClose, anchor]);
  if (!open) return null;
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={`popover ${className}`} style={pos ? {left: pos.left, top: pos.top} : {visibility: 'hidden', left: 0, top: 0}}>{children}</div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Menü

export interface MenuItem {label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean}
export function Menu({anchor, open, onClose, items, label}: {anchor: HTMLElement | null; open: boolean; onClose: () => void; items: (MenuItem | 'sep')[]; label: string}) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} label={label} className="menu">
      <div role="menu" aria-label={label}>
        {items.map((it, i) => it === 'sep' ? <hr key={i} /> : (
          <button key={it.label} role="menuitem" type="button" disabled={it.disabled} className={it.danger ? 'is-danger' : ''} onClick={() => { onClose(); it.onSelect(); }}>
            {it.icon}<span>{it.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------- Renk seçici

export function ColorPicker({value, onChange, swatches, recent = [], label = 'Renk'}: {value: string; onChange: (c: string) => void; swatches: string[]; recent?: string[]; label?: string}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const all = [...new Set([...swatches, ...recent.filter(c => !swatches.includes(c))])].slice(0, 20);
  return (
    <div className="color-picker" aria-label={label} role="group">
      <div className="swatches">
        {all.map(c => (
          <button key={c} type="button" className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'is-on' : ''}`} style={{background: c}} aria-label={c} title={c} onClick={() => onChange(c)}>
            {c.toLowerCase() === value.toLowerCase() && <Check size={14} />}
          </button>
        ))}
        <label className="swatch swatch-custom" title="Özel renk">
          <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label="Özel renk seç" />
        </label>
      </div>
      <div className="hex-row">
        <span className="hex-preview" style={{background: value}} />
        <input className="input input-sm" value={hex} maxLength={7} aria-label="HEX renk kodu" onChange={e => { const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; setHex(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase()); }} />
      </div>
    </div>
  );
}

export function ProgressBar({value, max, label, tone}: {value: number; max: number; label: string; tone?: 'warn' | 'danger'}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className={`progress ${tone ? 'progress-' + tone : ''}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><span style={{width: `${pct}%`}} /></div>;
}

export function EmptyState({icon, title, children, action}: {icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Badge({children, tone = 'neutral'}: {children: ReactNode; tone?: 'neutral' | 'accent' | 'danger' | 'success' | 'warning'}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
