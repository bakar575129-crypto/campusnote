import {useSyncExternalStore} from 'react';

const subs = new Set<() => void>();
const notify = () => { for (const s of subs) s(); };
window.addEventListener('popstate', notify);

export function navigate(to: string, opts: {replace?: boolean} = {}) {
  if (to === location.pathname + location.search) return;
  if (opts.replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  notify();
  window.scrollTo(0, 0);
}

const getPath = () => location.pathname + location.search;
export function useLocation() {
  const full = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, getPath);
  const url = new URL(full, location.origin);
  return {path: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams};
}

/** "/defter/:id" gibi kalıpları eşleştirir. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** <a> yerine: tam sayfa yenilemeden gezinme. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
