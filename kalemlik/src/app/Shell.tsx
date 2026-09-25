import {useEffect, useState, type ReactNode} from 'react';
import {BookOpen, CalendarClock, CalendarDays, CloudOff, HardDrive, ListChecks, LogOut, Menu as MenuIcon, MoreHorizontal, RefreshCw, Settings, Star, Timer, Trash2, UserRound, Check, AlertCircle} from 'lucide-react';
import {Brand} from '@/components/Brand';
import {linkProps, useLocation} from './router';
import {logout, useSession} from './session';
import {syncNow, useSyncState} from '@/lib/store';
import {timeAgo} from '@/lib/format';

export const NAV = [
  {to: '/defterler', label: 'Defterlerim', icon: BookOpen},
  {to: '/favoriler', label: 'Favoriler', icon: Star},
  {to: '/program', label: 'Ders Programı', icon: CalendarClock},
  {to: '/gorevler', label: 'Ödevler & Sınavlar', icon: ListChecks},
  {to: '/takvim', label: 'Takvim', icon: CalendarDays},
  {to: '/odak', label: 'Odaklan', icon: Timer},
  {to: '/cop', label: 'Çöp Kutusu', icon: Trash2},
];
export const NAV_BOTTOM = [
  {to: '/plan', label: 'Plan & Depolama', icon: HardDrive},
  {to: '/ayarlar', label: 'Ayarlar', icon: Settings},
  {to: '/hesap', label: 'Hesabım', icon: UserRound},
];
const TABS = ['/defterler', '/program', '/gorevler', '/odak'];

export function SyncBadge({compact = false}: {compact?: boolean}) {
  const s = useSyncState();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const offline = s.phase === 'offline' || !navigator.onLine;
  const icon = offline ? <CloudOff size={16} /> : s.phase === 'syncing' ? <RefreshCw size={16} className="spin" /> : s.phase === 'error' ? <AlertCircle size={16} /> : <Check size={16} />;
  const text = offline ? (s.pending ? `Çevrimdışı · ${s.pending} değişiklik cihazda` : 'Çevrimdışı')
    : s.phase === 'syncing' ? 'Kaydediliyor…'
    : s.phase === 'error' ? (s.pending ? `${s.pending} değişiklik bekliyor` : s.message || 'Eşitleme sorunu')
    : s.lastSync ? `Kaydedildi · ${timeAgo(s.lastSync)}` : 'Hazır';
  return (
    <button type="button" className={`sync-badge sync-${offline ? 'offline' : s.phase}`} onClick={() => void syncNow()} title="Şimdi eşitle" aria-label={`Eşitleme durumu: ${text}. Şimdi eşitle`}>
      {icon}{!compact && <span>{text}</span>}
    </button>
  );
}

function NavLink({to, label, icon: Icon, active, onClick}: {to: string; label: string; icon: typeof BookOpen; active: boolean; onClick?: () => void}) {
  const link = linkProps(to);
  return (
    <a {...link} onClick={e => { link.onClick(e); onClick?.(); }} className={`nav-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon size={20} /><span>{label}</span>
    </a>
  );
}

export function Shell({children}: {children: ReactNode}) {
  const {path} = useLocation();
  const {user} = useSession();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const isActive = (to: string) => path === to || (to === '/defterler' && path === '/');
  useEffect(() => { setOpen(false); setMore(false); }, [path]);

  const sidebar = (
    <nav className="sidebar-inner" aria-label="Ana menü">
      <div className="sidebar-brand"><Brand /></div>
      <div className="nav-group">{NAV.map(n => <NavLink key={n.to} {...n} active={isActive(n.to)} />)}</div>
      <div className="spacer" />
      <div className="nav-group">{NAV_BOTTOM.map(n => <NavLink key={n.to} {...n} active={isActive(n.to)} />)}</div>
      <div className="sidebar-foot">
        <div className="user-chip"><span className="avatar">{user?.name.slice(0, 1).toLocaleUpperCase('tr')}</span><span className="user-name">{user?.name}</span>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Çıkış yap" title="Çıkış yap" onClick={() => void logout()}><LogOut size={18} /></button>
        </div>
        <SyncBadge />
      </div>
    </nav>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>{sidebar}</aside>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <header className="mobile-top">
        <button type="button" className="icon-btn" aria-label="Menüyü aç" onClick={() => setOpen(true)}><MenuIcon size={22} /></button>
        <Brand />
        <SyncBadge compact />
      </header>
      <main className="main" id="main">{children}</main>
      <nav className="tabbar" aria-label="Hızlı menü">
        {NAV.filter(n => TABS.includes(n.to)).map(n => (
          <a key={n.to} {...linkProps(n.to)} className={`tab ${isActive(n.to) ? 'is-active' : ''}`} aria-current={isActive(n.to) ? 'page' : undefined}><n.icon size={22} /><span>{n.label.split(' ')[0]}</span></a>
        ))}
        <button type="button" className={`tab ${more ? 'is-active' : ''}`} onClick={() => setMore(!more)} aria-expanded={more}><MoreHorizontal size={22} /><span>Daha</span></button>
      </nav>
      {more && (
        <>
          <div className="sidebar-scrim" onClick={() => setMore(false)} />
          <div className="more-sheet" role="dialog" aria-label="Diğer bölümler">
            {[...NAV.filter(n => !TABS.includes(n.to)), ...NAV_BOTTOM].map(n => <NavLink key={n.to} {...n} active={isActive(n.to)} onClick={() => setMore(false)} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function PageHeader({title, subtitle, actions}: {title: string; subtitle?: ReactNode; actions?: ReactNode}) {
  return (
    <header className="page-head">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
