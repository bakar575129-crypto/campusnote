import {useEffect, useState, type FormEvent} from 'react';
import {LogOut, MonitorSmartphone, ShieldCheck, Trash2} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {logout, setUser, useSession} from '@/app/session';
import {Badge, Button, Dialog, Field} from '@/components/ui';
import {toast} from '@/components/feedback';
import {api} from '@/lib/api';
import {timeAgo} from '@/lib/format';
import type {User} from '@/lib/types';
import {currentUserId, unloadUser} from '@/lib/store';
import {idbClearUser} from '@/lib/idb';

interface SessionInfo {current: boolean; createdAt: number; lastSeen: number; userAgent: string}

function device(ua: string) {
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Cihaz';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  return `${os} · ${br}`;
}

export function AccountPage() {
  const {user} = useSession();
  const [name, setName] = useState(user?.name || '');
  const [university, setUniversity] = useState(user?.university || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({current: '', next: '', repeat: ''});
  const [pwError, setPwError] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const loadSessions = () => api<{sessions: SessionInfo[]}>('/api/auth/sessions').then(r => setSessions(r.sessions)).catch(() => {});
  useEffect(() => { void loadSessions(); }, []);
  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault(); setBusy('profile');
    try { const r = await api<{user: User}>('/api/auth/profile', {method: 'PATCH', json: {name, university, department}}); setUser(r.user); toast('Profil kaydedildi.', 'success'); }
    catch (err) { toast(err instanceof Error ? err.message : 'Kaydedilemedi.', 'error'); } finally { setBusy(''); }
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault(); setPwError('');
    if (pw.next !== pw.repeat) { setPwError('Yeni şifreler aynı değil.'); return; }
    setBusy('pw');
    try { await api('/api/auth/password', {method: 'POST', json: {currentPassword: pw.current, newPassword: pw.next}}); setPw({current: '', next: '', repeat: ''}); toast('Şifren değişti. Diğer cihazlardaki oturumlar kapatıldı.', 'success'); void loadSessions(); }
    catch (err) { setPwError(err instanceof Error ? err.message : 'Şifre değiştirilemedi.'); } finally { setBusy(''); }
  };
  const logoutOthers = async () => {
    setBusy('others');
    try { const r = await api<{closed: number}>('/api/auth/logout-others', {method: 'POST'}); toast(`${r.closed} oturum kapatıldı.`, 'success'); void loadSessions(); }
    catch (err) { toast(err instanceof Error ? err.message : 'İşlem yapılamadı.', 'error'); } finally { setBusy(''); }
  };
  const deleteAccount = async () => {
    setBusy('delete');
    try {
      await api('/api/auth/delete-account', {method: 'POST', json: {password: delPw}});
      const id = currentUserId(); unloadUser(); if (id) await idbClearUser(id);
      toast('Hesabın ve tüm verilerin silindi.', 'info');
      await logout();
    } catch (err) { toast(err instanceof Error ? err.message : 'Hesap silinemedi.', 'error'); } finally { setBusy(''); }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="Hesabım" subtitle={<>{user.email} {user.role === 'admin' && <Badge tone="accent">Yönetici</Badge>}</>} />
      <section className="card card-pad settings-section">
        <h2>Profil</h2>
        <form className="stack" onSubmit={saveProfile}>
          <Field label="Ad soyad" htmlFor="ac-name"><input id="ac-name" className="input" value={name} minLength={2} maxLength={100} required onChange={e => setName(e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Üniversite" htmlFor="ac-uni"><input id="ac-uni" className="input" value={university} maxLength={120} onChange={e => setUniversity(e.target.value)} /></Field>
            <Field label="Bölüm" htmlFor="ac-dep"><input id="ac-dep" className="input" value={department} maxLength={120} onChange={e => setDepartment(e.target.value)} /></Field>
          </div>
          <div><Button type="submit" variant="primary" busy={busy === 'profile'}>Profili kaydet</Button></div>
        </form>
      </section>
      <section className="card card-pad settings-section">
        <h2><ShieldCheck size={20} /> Şifre</h2>
        <form className="stack" onSubmit={changePassword}>
          <Field label="Mevcut şifre" htmlFor="pw-cur"><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={pw.current} required onChange={e => setPw({...pw, current: e.target.value})} /></Field>
          <div className="grid-2">
            <Field label="Yeni şifre" htmlFor="pw-new" hint="En az 10 karakter"><input id="pw-new" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={pw.next} required onChange={e => setPw({...pw, next: e.target.value})} /></Field>
            <Field label="Yeni şifre (tekrar)" htmlFor="pw-rep"><input id="pw-rep" className="input" type="password" autoComplete="new-password" value={pw.repeat} required onChange={e => setPw({...pw, repeat: e.target.value})} /></Field>
          </div>
          {pwError && <p className="form-error" role="alert">{pwError}</p>}
          <div><Button type="submit" busy={busy === 'pw'}>Şifreyi değiştir</Button></div>
        </form>
      </section>
      <section className="card card-pad settings-section">
        <h2><MonitorSmartphone size={20} /> Açık oturumlar</h2>
        <ul className="session-list">
          {sessions.map((s, i) => <li key={i}><strong>{device(s.userAgent)}</strong>{s.current && <Badge tone="success">Bu cihaz</Badge>}<span className="muted small">son etkinlik {timeAgo(s.lastSeen)}</span></li>)}
        </ul>
        <div className="row wrap">
          <Button onClick={() => void logoutOthers()} busy={busy === 'others'} disabled={sessions.length < 2}>Diğer cihazlardan çıkış yap</Button>
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void logout()}>Çıkış yap</Button>
        </div>
      </section>
      <section className="card card-pad settings-section danger-zone">
        <h2>Hesabı sil</h2>
        <p className="muted small">Hesabın, defterlerin, sayfaların, dosyaların ve planlayıcı kayıtların kalıcı olarak silinir.</p>
        <div><Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setDel(true)}>Hesabımı sil</Button></div>
      </section>
      <Dialog open={del} onClose={() => setDel(false)} title="Hesap kalıcı olarak silinsin mi?" size="sm" footer={<><Button variant="ghost" onClick={() => setDel(false)}>Vazgeç</Button><Button variant="danger" busy={busy === 'delete'} disabled={!delPw} onClick={() => void deleteAccount()}>Kalıcı olarak sil</Button></>}>
        <div className="stack">
          <p className="muted">Bu işlem geri alınamaz. Onaylamak için şifreni yaz.</p>
          <Field label="Şifre" htmlFor="del-pw"><input id="del-pw" className="input" type="password" autoComplete="current-password" value={delPw} onChange={e => setDelPw(e.target.value)} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
