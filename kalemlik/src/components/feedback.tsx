import {useEffect, useState, useSyncExternalStore, type ReactNode} from 'react';
import {AlertTriangle, CheckCircle2, Info, X} from 'lucide-react';
import {Button, Dialog} from './ui';

// ---------------------------------------------------------------- bildirimler
type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {id: number; kind: ToastKind; message: string; action?: {label: string; run: () => void}}
let toasts: ToastItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const notify = () => { for (const s of subs) s(); };

export function toast(message: string, kind: ToastKind = 'info', action?: ToastItem['action']) {
  const id = nextId++;
  toasts = [...toasts.filter(t => t.message !== message), {id, kind, message, action}].slice(-4);
  notify();
  setTimeout(() => dismiss(id), kind === 'error' ? 7000 : action ? 6000 : 3800);
}
function dismiss(id: number) { toasts = toasts.filter(t => t.id !== id); notify(); }

export function Toaster() {
  const list = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => toasts);
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {list.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
          <span>{t.message}</span>
          {t.action && <button type="button" className="toast-action" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" className="toast-x" aria-label="Kapat" onClick={() => dismiss(t.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- onay penceresi
interface ConfirmReq {title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void}
let pending: ConfirmReq | null = null;
const csubs = new Set<() => void>();

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => { pending = {...opts, resolve}; for (const s of csubs) s(); });
}

export function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); csubs.add(f); return () => { csubs.delete(f); }; }, []);
  const req = pending;
  const close = (ok: boolean) => { pending = null; req?.resolve(ok); force(n => n + 1); };
  return (
    <Dialog open={!!req} onClose={() => close(false)} title={req?.title || ''} size="sm"
      footer={<><Button variant="ghost" onClick={() => close(false)}>Vazgeç</Button><Button variant={req?.danger ? 'danger' : 'primary'} data-autofocus onClick={() => close(true)}>{req?.confirmLabel || 'Tamam'}</Button></>}>
      <div className="muted">{req?.message}</div>
    </Dialog>
  );
}
