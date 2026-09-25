import {useState, type FormEvent, type ReactNode} from 'react';
import {Eye, EyeOff, WifiOff} from 'lucide-react';
import {Brand} from '@/components/Brand';
import {Button, Field} from '@/components/ui';
import {api, ApiError} from '@/lib/api';
import {linkProps, navigate, useLocation} from '@/app/router';
import {login, register, useSession} from '@/app/session';

function AuthLayout({title, subtitle, children}: {title: string; subtitle: string; children: ReactNode}) {
  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <Brand />
          <h2>Ders notların, planın ve odağın tek defterde.</h2>
          <ul>
            <li>Kalemle yaz — yazın satıra kendiliğinden otursun</li>
            <li>PDF slaytların üzerine not al, tekrar PDF indir</li>
            <li>Ders programı, ödev ve sınav takvimi, Pomodoro</li>
            <li>İnternet gitse de yazmaya devam et</li>
          </ul>
          <div className="auth-paper" />
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Brand /></div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {!navigator.onLine && <p className="auth-offline"><WifiOff size={16} /> İnternet bağlantısı yok. Giriş için bağlantı gerekir.</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

function PasswordInput({id, value, onChange, autoComplete}: {id: string; value: string; onChange: (v: string) => void; autoComplete: string}) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 10 : 1} maxLength={128} />
      <button type="button" className="icon-btn icon-btn-sm" aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Bir sorun oluştu.');

export function LoginPage() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const {config} = useSession();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await login(email, password); navigate('/defterler', {replace: true}); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Tekrar hoş geldin" subtitle="Defterlerine devam etmek için giriş yap.">
      <form className="stack" onSubmit={submit} noValidate={false}>
        <Field label="E-posta" htmlFor="email"><input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Şifre" htmlFor="password"><PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" busy={busy}>Giriş yap</Button>
        <div className="auth-links">
          <a {...linkProps('/sifremi-unuttum')}>Şifremi unuttum</a>
          {config?.registrationOpen !== false && <span>Hesabın yok mu? <a {...linkProps('/kayit')}>Kayıt ol</a></span>}
        </div>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const {config} = useSession();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await register(name, email, password); navigate('/defterler', {replace: true}); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  if (config && !config.registrationOpen) {
    return <AuthLayout title="Kayıt kapalı" subtitle="Bu sitede yeni hesap oluşturma şu anda kapalı."><a {...linkProps('/giris')}>Giriş sayfasına dön</a></AuthLayout>;
  }
  return (
    <AuthLayout title="Hesap oluştur" subtitle="Ücretsiz başla; notların tüm cihazlarında eşitlenir.">
      <form className="stack" onSubmit={submit}>
        <Field label="Ad soyad" htmlFor="name"><input id="name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} /></Field>
        <Field label="E-posta" htmlFor="email"><input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Şifre" htmlFor="password" hint="En az 10 karakter. Uzun bir cümle iyi bir şifredir."><PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" busy={busy}>Hesabı oluştur</Button>
        <div className="auth-links"><span>Zaten hesabın var mı? <a {...linkProps('/giris')}>Giriş yap</a></span></div>
      </form>
    </AuthLayout>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/auth/forgot', {method: 'POST', json: {email}}); setSent(true); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Şifreni sıfırla" subtitle="E-posta adresini yaz; sıfırlama bağlantısı gönderelim.">
      {sent ? (
        <div className="stack">
          <p className="notice">Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi. Bağlantı 1 saat geçerlidir. E-posta gelmezse site yöneticisine başvur.</p>
          <a {...linkProps('/giris')}>Giriş sayfasına dön</a>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label="E-posta" htmlFor="email"><input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" busy={busy}>Bağlantı gönder</Button>
          <div className="auth-links"><a {...linkProps('/giris')}>Giriş sayfasına dön</a></div>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPage() {
  const {query} = useLocation();
  const token = query.get('token') || '';
  const [password, setPassword] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/auth/reset', {method: 'POST', json: {token, password}}); setDone(true); } catch (err) { setError(err instanceof ApiError ? err.message : message(err)); } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Yeni şifre belirle" subtitle="Tüm cihazlardaki oturumların kapatılacak.">
      {done ? (
        <div className="stack"><p className="notice">Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.</p><Button variant="primary" onClick={() => navigate('/giris', {replace: true})}>Giriş yap</Button></div>
      ) : !token ? (
        <p className="form-error">Bağlantı eksik. E-postadaki bağlantıyı eksiksiz aç.</p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label="Yeni şifre" htmlFor="password" hint="En az 10 karakter."><PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" /></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" busy={busy}>Şifreyi kaydet</Button>
        </form>
      )}
    </AuthLayout>
  );
}
