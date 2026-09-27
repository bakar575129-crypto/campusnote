// Bildirim merkezi (zil) ve bildirim ayarları.
import {useEffect, useMemo, useRef, useState} from 'react';
import {Bell, BellRing, BookCheck, Brain, CheckCheck, Flame, GraduationCap, Layers, Sparkles, Timer} from 'lucide-react';
import {navigate} from '@/app/router';
import {Button, Field, Popover, Switch} from '@/components/ui';
import {toast} from '@/components/feedback';
import {useList} from '@/lib/store';
import {updateSettings, useSettings} from '@/lib/settings';
import {browserNotifySupported, computeNotifications, dismissNotice, NOTICE_LABELS, requestBrowserPermission, type NoticeType} from './notifications';

const ICONS: Record<NoticeType, typeof Bell> = {exam: GraduationCap, homework: BookCheck, study: Timer, flashcard: Layers, streak: Flame, ai: Sparkles};

export function useNotifications() {
  // Veri değişince (görev, kart, quiz, odak, ayar) yeniden hesaplanır; dakikada bir de saat koşulları için.
  const deps = [useList('task'), useList('card'), useList('quiz'), useList('focus'), useList('studyPlan'), useSettings()];
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(t); }, []);
  return useMemo(() => computeNotifications(), [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function NotificationBell({compact = false}: {compact?: boolean}) {
  const items = useNotifications();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const urgent = items.some(n => n.urgent);
  return (
    <>
      <button ref={btn} type="button" className={`icon-btn notif-bell ${compact ? '' : 'notif-bell-wide'}`} aria-label={`Bildirimler (${items.length})`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {urgent ? <BellRing size={20} /> : <Bell size={20} />}
        {!compact && <span>Bildirimler</span>}
        {items.length > 0 && <span className={`notif-count ${urgent ? 'is-urgent' : ''}`}>{items.length}</span>}
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} label="Bildirimler" placement={compact ? 'bottom' : 'right'}>
        <div className="notif-panel">
          <div className="row notif-head"><strong>Bildirimler</strong><span className="spacer" />
            {items.length > 0 && <Button size="sm" variant="ghost" icon={<CheckCheck size={15} />} onClick={() => dismissNotice(...items.map(i => i.id))}>Tümünü okundu say</Button>}
          </div>
          {items.length ? items.map(n => {
            const Icon = ICONS[n.type];
            return (
              <button key={n.id} type="button" className={`notif-item ${n.urgent ? 'is-urgent' : ''}`} onClick={() => { dismissNotice(n.id); setOpen(false); navigate(n.link); }}>
                <span className={`notif-icon type-${n.type}`}><Icon size={17} /></span>
                <span className="notif-text"><strong>{n.title}</strong>{n.body && <span className="muted small">{n.body}</span>}</span>
              </button>
            );
          }) : <p className="muted small notif-empty"><Brain size={16} /> Şimdilik yeni bildirim yok.</p>}
          <button type="button" className="notif-settings-link" onClick={() => { setOpen(false); navigate('/ayarlar#bildirimler'); }}>Bildirim ayarları</button>
        </div>
      </Popover>
    </>
  );
}

export function NotificationSettings() {
  const s = useSettings();
  const p = s.notifications;
  const set = (patch: Partial<typeof p>) => updateSettings({notifications: {...p, ...patch}});
  const browser = async (on: boolean) => {
    if (on && !(await requestBrowserPermission())) { toast('Bildirim izni verilmedi. Tarayıcı ayarlarından Kalemlik’e bildirim izni ver.', 'error'); return; }
    set({browser: on});
    if (on) toast('Bildirimler açık. Kalemlik açıkken (ve destekleyen telefonlarda yüklü uygulamada arka planda) hatırlatırız.', 'success');
  };
  return (
    <section className="card card-pad settings-section" id="bildirimler">
      <h2><Bell size={20} /> Bildirimler</h2>
      <div className="notif-toggles">
        {(Object.keys(NOTICE_LABELS) as NoticeType[]).map(k => <Switch key={k} label={NOTICE_LABELS[k]} checked={p[k]} onChange={v => set({[k]: v} as Partial<typeof p>)} />)}
      </div>
      <div className="grid-2">
        <Field label="Sınav hatırlatması (gün kala)" htmlFor="nt-exam" hint="Virgülle ayır, ör. 7, 3, 1">
          <input id="nt-exam" className="input" defaultValue={p.examDays.join(', ')} onBlur={e => set({examDays: e.target.value.split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 60).slice(0, 5)})} />
        </Field>
        <Field label="Ödev hatırlatması (gün kala)" htmlFor="nt-hw"><input id="nt-hw" className="input" type="number" min={1} max={14} value={p.homeworkDays} onChange={e => set({homeworkDays: Math.max(1, Math.min(14, Number(e.target.value) || 2))})} /></Field>
        <Field label="Çalışma hedefi hatırlatma saati" htmlFor="nt-time"><input id="nt-time" className="input" type="time" value={p.studyTime} onChange={e => set({studyTime: e.target.value || '20:00'})} /></Field>
        <Field label="Günlük çalışma hedefi (dk)" htmlFor="nt-goal"><input id="nt-goal" className="input" type="number" min={10} max={900} step={5} value={s.studyGoal} onChange={e => updateSettings({studyGoal: Math.max(10, Math.min(900, Number(e.target.value) || 90))})} /></Field>
      </div>
      {browserNotifySupported()
        ? <Switch label="Telefon / tarayıcı bildirimi" description="Uygulama içindeki bildirimler ayrıca sistem bildirimi olarak da gösterilir." checked={p.browser} onChange={v => void browser(v)} />
        : <p className="muted small">Bu tarayıcı sistem bildirimlerini desteklemiyor; bildirimler uygulama içinde (zil) görünür.</p>}
    </section>
  );
}
