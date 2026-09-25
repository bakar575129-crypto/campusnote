import {useCallback, useEffect, useRef, useState} from 'react';
import {Coffee, Pause, Play, RotateCcw, SkipForward, Settings2, Timer, Trash2} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {Badge, Button, Dialog, IconButton, Slider, Switch} from '@/components/ui';
import {toast} from '@/components/feedback';
import {list, put, remove, useList} from '@/lib/store';
import {useSettings, updateSettings} from '@/lib/settings';
import {uuid} from '@/lib/ids';
import {addDays, DAYS_SHORT, isoDate, timeAgo, weekday} from '@/lib/format';

type Mode = 'work' | 'short' | 'long';
interface TimerState {mode: Mode; status: 'idle' | 'running' | 'paused'; endsAt: number; remaining: number; startedAt: number; focused: number; cycle: number; topic: string; course: string}
const KEY = 'klm:focus-timer';
const LABEL: Record<Mode, string> = {work: 'Odak', short: 'Kısa mola', long: 'Uzun mola'};

function load(): TimerState | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function save(s: TimerState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* yok */ } }

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i === 2 ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* ses yok */ }
}

const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function FocusPage() {
  const settings = useSettings();
  const f = settings.focus;
  const minutes = (m: Mode) => (m === 'work' ? f.work : m === 'short' ? f.short : f.long);
  const [state, setState] = useState<TimerState>(() => load() || {mode: 'work', status: 'idle', endsAt: 0, remaining: f.work * 60000, startedAt: 0, focused: 0, cycle: 0, topic: '', course: ''});
  const [now, setNow] = useState(Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const sessions = useList('focus');
  const lessons = useList('lesson');
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback((s: TimerState) => { setState(s); save(s); }, []);
  const remaining = state.status === 'running' ? state.endsAt - now : state.remaining;
  const total = minutes(state.mode) * 60000;

  // Boşta iken süre ayarı değişince sayaç güncellenir.
  useEffect(() => { if (state.status === 'idle') commit({...stateRef.current, remaining: minutes(stateRef.current.mode) * 60000}); }, [f.work, f.short, f.long]); // eslint-disable-line react-hooks/exhaustive-deps

  const logSession = useCallback((s: TimerState, completed: boolean, focusedMs: number) => {
    if (s.mode !== 'work' || focusedMs < 60000) return;
    put('focus', {id: uuid(), topic: s.topic.trim(), course: s.course, plannedMinutes: minutes('work'), focusedSeconds: Math.round(focusedMs / 1000), completed, startedAt: s.startedAt || Date.now() - focusedMs, endedAt: Date.now()});
  }, [f.work]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sayaç bitti (ya da atlandı): odak turu kaydedilir, sıradaki moda geçilir. */
  const finish = useCallback((completed = true) => {
    const s = stateRef.current;
    if (completed && settings.focus.sound) beep();
    if (completed && s.mode === 'work') logSession(s, true, minutes('work') * 60000);
    const cycle = s.mode === 'work' ? s.cycle + 1 : s.cycle;
    const next: Mode = s.mode === 'work' ? (cycle % f.every === 0 ? 'long' : 'short') : 'work';
    const msg = s.mode === 'work' ? `Odak tamamlandı! ${LABEL[next]} zamanı.` : 'Mola bitti, odaklanmaya hazır mısın?';
    if (completed) toast(msg, 'success');
    if (completed && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification('Kalemlik', {body: msg});
    const auto = next !== 'work' ? f.autoBreak : false;
    const dur = minutes(next) * 60000;
    commit({...s, mode: next, cycle, status: auto ? 'running' : 'idle', endsAt: auto ? Date.now() + dur : 0, remaining: dur, startedAt: auto ? Date.now() : 0, focused: 0});
  }, [f.every, f.autoBreak, settings.focus.sound, logSession, commit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.status !== 'running') { document.title = 'Kalemlik'; return; }
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = stateRef.current.endsAt - t;
      document.title = `${fmt(left)} · ${LABEL[stateRef.current.mode]} — Kalemlik`;
      if (left <= 0) finish(true);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => { clearInterval(id); document.title = 'Kalemlik'; };
  }, [state.status, finish]);

  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    const rem = state.status === 'paused' ? state.remaining : total;
    commit({...state, status: 'running', endsAt: Date.now() + rem, remaining: rem, startedAt: state.startedAt || Date.now()});
  };
  const pause = () => {
    const left = Math.max(0, state.endsAt - Date.now());
    commit({...state, status: 'paused', remaining: left, focused: state.focused + (state.remaining - left)});
  };
  const reset = () => {
    const left = state.status === 'running' ? Math.max(0, state.endsAt - Date.now()) : state.remaining;
    const focused = state.focused + (state.status === 'running' ? state.remaining - left : 0);
    logSession(state, false, focused);
    if (state.mode === 'work' && focused >= 60000) toast(`${Math.round(focused / 60000)} dakikalık çalışma kaydedildi.`, 'info');
    commit({...state, status: 'idle', endsAt: 0, remaining: total, startedAt: 0, focused: 0});
  };
  const switchMode = (mode: Mode) => { if (state.status === 'running' || state.status === 'paused') reset(); commit({...stateRef.current, mode, status: 'idle', remaining: minutes(mode) * 60000, endsAt: 0, startedAt: 0, focused: 0}); };
  const skip = () => { if (state.mode === 'work' && state.status !== 'idle') reset(); finish(false); };

  // İstatistik
  const today = isoDate(new Date());
  const byDay = new Map<string, number>();
  for (const s of sessions) { const d = isoDate(new Date(s.startedAt)); byDay.set(d, (byDay.get(d) || 0) + s.focusedSeconds); }
  const week = Array.from({length: 7}, (_, i) => { const d = addDays(new Date(), i - 6); return {d, iso: isoDate(d), min: Math.round((byDay.get(isoDate(d)) || 0) / 60)}; });
  const maxMin = Math.max(30, ...week.map(w => w.min));
  const todayMin = week[6].min;
  const weekMin = week.reduce((n, w) => n + w.min, 0);
  const recent = sessions.slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);
  const topics = [...new Set(list('focus').map(s => s.topic).filter(Boolean))].slice(0, 20);
  const pct = Math.max(0, Math.min(1, 1 - remaining / total));
  const R = 118, C = 2 * Math.PI * R;

  return (
    <div className="page">
      <PageHeader title="Odaklan" subtitle="Pomodoro: odaklan, kısa mola ver, tekrarla." actions={<IconButton label="Süre ayarları" onClick={() => setShowSettings(true)}><Settings2 size={20} /></IconButton>} />
      <div className="focus-layout">
        <section className={`card focus-card mode-${state.mode}`}>
          <div className="segmented" role="tablist" aria-label="Sayaç türü">
            {(['work', 'short', 'long'] as Mode[]).map(m => <button key={m} type="button" role="tab" aria-selected={state.mode === m} className={state.mode === m ? 'is-on' : ''} onClick={() => switchMode(m)}>{LABEL[m]}</button>)}
          </div>
          <div className="focus-ring" role="timer" aria-live="off" aria-label={`${LABEL[state.mode]}: ${fmt(remaining)} kaldı`}>
            <svg viewBox="0 0 260 260" aria-hidden>
              <circle cx="130" cy="130" r={R} className="ring-bg" />
              <circle cx="130" cy="130" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
            </svg>
            <div className="focus-time">
              <strong>{fmt(remaining)}</strong>
              <span>{state.mode === 'work' ? `${(state.cycle % f.every) + 1}. tur / ${f.every}` : LABEL[state.mode]}</span>
            </div>
          </div>
          <div className="focus-topic">
            <input className="input" list="focus-topics" placeholder="Ne üzerinde çalışıyorsun? (ör. İntegral alıştırmaları)" aria-label="Çalışılan konu" value={state.topic} maxLength={160} onChange={e => commit({...state, topic: e.target.value})} />
            <datalist id="focus-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
            {lessons.length > 0 && <select className="select" aria-label="Ders" value={state.course} onChange={e => commit({...state, course: e.target.value})}><option value="">Ders seç (isteğe bağlı)</option>{[...new Set(lessons.map(l => l.title))].map(c => <option key={c}>{c}</option>)}</select>}
          </div>
          <div className="focus-controls">
            {state.status === 'running'
              ? <Button size="lg" variant="primary" icon={<Pause size={20} />} onClick={pause}>Duraklat</Button>
              : <Button size="lg" variant="primary" icon={<Play size={20} />} onClick={start}>{state.status === 'paused' ? 'Devam' : 'Başlat'}</Button>}
            <Button size="lg" icon={<RotateCcw size={19} />} onClick={reset} disabled={state.status === 'idle'}>Sıfırla</Button>
            <IconButton size="lg" label={state.mode === 'work' ? 'Molaya geç' : 'Molayı atla'} onClick={skip}>{state.mode === 'work' ? <Coffee size={20} /> : <SkipForward size={20} />}</IconButton>
          </div>
        </section>
        <section className="card card-pad focus-stats">
          <div className="stat-row">
            <div><span className="stat-num">{todayMin}</span><span className="muted small">dk bugün</span></div>
            <div><span className="stat-num">{weekMin}</span><span className="muted small">dk son 7 gün</span></div>
            <div><span className="stat-num">{sessions.filter(s => isoDate(new Date(s.startedAt)) === today && s.completed).length}</span><span className="muted small">tur bugün</span></div>
          </div>
          <div className="bars" role="img" aria-label={`Son 7 gün: ${week.map(w => `${DAYS_SHORT[weekday(w.d)]} ${w.min} dakika`).join(', ')}`}>
            {week.map(w => (
              <div key={w.iso} className={`bar ${w.iso === today ? 'is-today' : ''}`}>
                <span className="bar-val">{w.min || ''}</span>
                <span className="bar-fill" style={{height: `${(w.min / maxMin) * 100}%`}} />
                <span className="bar-label">{DAYS_SHORT[weekday(w.d)]}</span>
              </div>
            ))}
          </div>
          <h3 className="section-title">Son çalışmalar</h3>
          {recent.length ? (
            <ul className="history">
              {recent.map(s => (
                <li key={s.id}>
                  <Timer size={16} />
                  <span className="history-text"><strong>{s.topic || 'Konu belirtilmedi'}</strong><small className="muted">{s.course && `${s.course} · `}{Math.round(s.focusedSeconds / 60)} dk · {timeAgo(s.startedAt)}</small></span>
                  {s.completed ? <Badge tone="success">Tamam</Badge> : <Badge>Yarım</Badge>}
                  <IconButton size="sm" label="Kaydı sil" onClick={() => remove('focus', s.id)}><Trash2 size={15} /></IconButton>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">İlk odak turunu tamamladığında burada görünecek.</p>}
        </section>
      </div>
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} title="Sayaç ayarları" size="sm" footer={<Button variant="primary" onClick={() => setShowSettings(false)}>Tamam</Button>}>
        <div className="stack">
          <Slider label="Odak süresi" value={f.work} min={5} max={120} step={5} onChange={work => updateSettings({focus: {work}})} format={v => `${v} dk`} />
          <Slider label="Kısa mola" value={f.short} min={1} max={30} onChange={short => updateSettings({focus: {short}})} format={v => `${v} dk`} />
          <Slider label="Uzun mola" value={f.long} min={5} max={60} step={5} onChange={long => updateSettings({focus: {long}})} format={v => `${v} dk`} />
          <Slider label="Uzun mola sıklığı" value={f.every} min={2} max={8} onChange={every => updateSettings({focus: {every}})} format={v => `${v} turda bir`} />
          <Switch label="Molayı otomatik başlat" checked={f.autoBreak} onChange={autoBreak => updateSettings({focus: {autoBreak}})} />
          <Switch label="Bitince sesli uyarı" checked={f.sound} onChange={sound => updateSettings({focus: {sound}})} />
          <Button variant="ghost" onClick={() => updateSettings({focus: {work: 25, short: 5, long: 15, every: 4}})}>Varsayılana dön (25 / 5)</Button>
        </div>
      </Dialog>
    </div>
  );
}
