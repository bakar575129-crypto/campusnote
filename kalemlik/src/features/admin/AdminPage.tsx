import {useCallback, useEffect, useState} from 'react';
import {BookOpen, Copy, HardDrive, KeyRound, Mail, RefreshCw, ScanText, Search, ShieldCheck, ShieldOff, Sparkles, UserCog, Users} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {useSession} from '@/app/session';
import {Badge, Button, Dialog, EmptyState, Field, ProgressBar, Segmented, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {api} from '@/lib/api';
import {formatBytes, timeAgo} from '@/lib/format';

interface PlanInfo {id: string; name: string; storageBytes: number; notebookLimit: number | null; ocrDailyLimit: number; extraStorageBytes?: number; extraNotebooks?: number; subscription: null | {status: string; periodEnd: number; provider: string}}
interface AdminUser {id: string; email: string; name: string; role: 'user' | 'admin'; createdAt: number; disabled: boolean; lastLoginAt: number | null; usedBytes: number; notebookCount: number; extraStorageMb: number; extraNotebooks: number; plan: PlanInfo}
interface AdminPlan {id: string; name: string; storageMb: number; notebookLimit: number; ocrDailyLimit: number; priceMonthly: number; currency: string; active: boolean}
interface Stats {users: {total: number; newThisWeek: number; activeThisWeek: number}; storageBytes: number; fileCount: number; notebooks: number; pages: number; subscriptions: {planId: string; count: number}[]}
interface SystemInfo {ocr: {configured: boolean; provider: string | null; model: string; modelOverride: string; keyHint: string; lastError: null | {at: number; code: string; detail: string}}; mail: {configured: boolean; from: string}; version: string; registrationOpen: boolean}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'İşlem yapılamadı.');

function StatCard({icon, label, value, hint}: {icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string}) {
  return <div className="card card-pad stat-card"><span className="stat-icon">{icon}</span><div><span className="stat-num">{value}</span><span className="muted small">{label}</span>{hint && <span className="muted small">{hint}</span>}</div></div>;
}

// ---------------------------------------------------------------- kullanıcı ayrıntısı

function UserDialog({user, plans, onClose, onChanged}: {user: AdminUser; plans: AdminPlan[]; onClose: () => void; onChanged: () => void}) {
  const {user: me} = useSession();
  const [planId, setPlanId] = useState(user.plan.id === 'free' ? (plans.find(p => p.id !== 'free')?.id || 'plus') : user.plan.id);
  const [days, setDays] = useState(30);
  const [extraGb, setExtraGb] = useState(String(Math.round((user.extraStorageMb / 1024) * 100) / 100));
  const [extraNb, setExtraNb] = useState(String(user.extraNotebooks));
  const [busy, setBusy] = useState('');
  const [resetLink, setResetLink] = useState<{link: string; emailSent: boolean} | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast(ok, 'success'); onChanged(); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); }
  };
  const self = me?.id === user.id;
  return (
    <Dialog open onClose={onClose} size="lg" title={<span className="row">{user.name}{user.role === 'admin' && <Badge tone="accent">Yönetici</Badge>}{user.disabled && <Badge tone="danger">Kapalı</Badge>}</span>}>
      <div className="stack admin-user">
        <p className="muted">{user.email} · kayıt {new Date(user.createdAt).toLocaleDateString('tr')} · son giriş {user.lastLoginAt ? timeAgo(user.lastLoginAt) : '—'}</p>
        <div className="admin-usage">
          <div><strong>{formatBytes(user.usedBytes)} / {formatBytes(user.plan.storageBytes)}</strong><ProgressBar value={user.usedBytes} max={user.plan.storageBytes} label="Depolama" /><span className="muted small">Depolama{user.extraStorageMb ? ` (ek ${formatBytes(user.extraStorageMb * 1024 * 1024)} dahil)` : ''}</span></div>
          <div><strong>{user.notebookCount}{user.plan.notebookLimit ? ` / ${user.plan.notebookLimit}` : ''} defter</strong><span className="muted small">{user.plan.notebookLimit ? `Defter hakkı${user.extraNotebooks ? ` (ek ${user.extraNotebooks} dahil)` : ''}` : 'Sınırsız defter'}</span></div>
          <div><strong>{user.plan.name}</strong><span className="muted small">{user.plan.subscription ? `${new Date(user.plan.subscription.periodEnd).toLocaleDateString('tr')} tarihine kadar` : 'Abonelik yok'}</span></div>
        </div>

        <section className="admin-block">
          <h3><Sparkles size={18} /> Abonelik paketi ver</h3>
          <div className="row wrap">
            <select className="select select-sm" value={planId} onChange={e => setPlanId(e.target.value)} aria-label="Plan">{plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === 'free' ? ' (aboneliği bitir)' : ''}</option>)}</select>
            {planId !== 'free' && <select className="select select-sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Süre">{[[7, '1 hafta'], [30, '1 ay'], [90, '3 ay'], [180, '6 ay'], [365, '1 yıl'], [3650, 'Süresiz (10 yıl)']].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>}
            <Button variant="primary" busy={busy === 'plan'} onClick={() => void run('plan', () => api(`/api/admin/users/${user.id}/subscription`, {method: 'POST', json: {planId, days}}), planId === 'free' ? 'Abonelik sonlandırıldı.' : 'Abonelik tanımlandı.')}>Uygula</Button>
          </div>
        </section>

        <section className="admin-block">
          <h3><HardDrive size={18} /> Ek depolama ve defter hakkı</h3>
          <p className="muted small">Plana ek olarak verilir; plan değişse de korunur. 0 yaparak geri alabilirsin.</p>
          <div className="grid-2">
            <Field label="Ek depolama (GB)" htmlFor="ad-gb"><input id="ad-gb" className="input" type="number" min={0} step={0.5} value={extraGb} onChange={e => setExtraGb(e.target.value)} /></Field>
            <Field label="Ek defter hakkı" htmlFor="ad-nb" hint={user.plan.notebookLimit === null ? 'Bu kullanıcının planında defter sınırı yok.' : undefined}><input id="ad-nb" className="input" type="number" min={0} step={1} value={extraNb} onChange={e => setExtraNb(e.target.value)} /></Field>
          </div>
          <div className="row wrap">
            {[1, 5, 10].map(g => <Button key={g} size="sm" variant="soft" onClick={() => setExtraGb(String(Math.round((Number(extraGb || 0) + g) * 100) / 100))}>+{g} GB</Button>)}
            {[1, 5].map(n => <Button key={n} size="sm" variant="soft" onClick={() => setExtraNb(String(Number(extraNb || 0) + n))}>+{n} defter</Button>)}
            <span className="spacer" />
            <Button variant="primary" busy={busy === 'grant'} onClick={() => void run('grant', () => api(`/api/admin/users/${user.id}/grants`, {method: 'POST', json: {extraStorageMb: Math.round(Math.max(0, Number(extraGb) || 0) * 1024), extraNotebooks: Math.max(0, Math.floor(Number(extraNb) || 0))}}), 'Ek haklar kaydedildi.')}>Kaydet</Button>
          </div>
        </section>

        <section className="admin-block">
          <h3><KeyRound size={18} /> Şifre sıfırlama</h3>
          <p className="muted small">Kullanıcıya 24 saat geçerli bir sıfırlama bağlantısı oluşturulur. E-posta ayarlıysa gönderilir; bağlantıyı kopyalayıp WhatsApp vb. ile de iletebilirsin.</p>
          <div className="row wrap">
            <Button icon={<Mail size={17} />} busy={busy === 'reset'} onClick={async () => { setBusy('reset'); try { setResetLink(await api(`/api/admin/users/${user.id}/password-reset`, {method: 'POST'})); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); } }}>Sıfırlama bağlantısı gönder</Button>
          </div>
          {resetLink && (
            <div className="reset-link">
              <p className="small">{resetLink.emailSent ? `✓ E-posta ${user.email} adresine gönderildi.` : 'E-posta ayarlı olmadığı için gönderilemedi; bağlantıyı kullanıcıya kendin ilet:'}</p>
              <div className="row"><input className="input input-sm" readOnly value={resetLink.link} onFocus={e => e.target.select()} aria-label="Sıfırlama bağlantısı" /><Button size="sm" icon={<Copy size={16} />} onClick={() => { void navigator.clipboard?.writeText(resetLink.link); toast('Bağlantı kopyalandı.', 'success'); }}>Kopyala</Button></div>
            </div>
          )}
        </section>

        <section className="admin-block">
          <h3><UserCog size={18} /> Hesap</h3>
          <div className="row wrap">
            <Button disabled={self} icon={user.role === 'admin' ? <ShieldOff size={17} /> : <ShieldCheck size={17} />} busy={busy === 'role'} onClick={() => void run('role', () => api(`/api/admin/users/${user.id}/status`, {method: 'POST', json: {role: user.role === 'admin' ? 'user' : 'admin'}}), 'Rol güncellendi.')}>{user.role === 'admin' ? 'Yöneticilikten çıkar' : 'Yönetici yap'}</Button>
            <Button disabled={self} variant={user.disabled ? 'primary' : 'danger'} busy={busy === 'dis'} onClick={async () => {
              if (!user.disabled && !(await confirmDialog({title: 'Hesap kapatılsın mı?', message: 'Kullanıcı giriş yapamaz ve açık oturumları kapanır. Verileri silinmez; istediğinde yeniden açabilirsin.', confirmLabel: 'Hesabı kapat', danger: true}))) return;
              void run('dis', () => api(`/api/admin/users/${user.id}/status`, {method: 'POST', json: {disabled: !user.disabled}}), user.disabled ? 'Hesap açıldı.' : 'Hesap kapatıldı.');
            }}>{user.disabled ? 'Hesabı yeniden aç' : 'Hesabı kapat'}</Button>
          </div>
          {self && <p className="muted small">Kendi hesabının rolünü ve durumunu değiştiremezsin.</p>}
        </section>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- sekmeler

function UsersTab({plans}: {plans: AdminPlan[]}) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{users: AdminUser[]; total: number} | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async (query = q) => { try { setData(await api(`/api/admin/users?q=${encodeURIComponent(query)}`)); } catch (e) { toast(msg(e), 'error'); } }, [q]);
  useEffect(() => { const t = setTimeout(() => void load(q), 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = data?.users.find(u => u.id === openId);
  return (
    <div className="stack">
      <label className="search"><Search size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ad veya e-posta ile ara" aria-label="Kullanıcı ara" /></label>
      {!data ? <p className="muted">Yükleniyor…</p> : !data.users.length ? <EmptyState icon={<Users size={28} />} title="Kullanıcı bulunamadı" /> : (
        <div className="admin-table card">
          <div className="admin-row admin-head"><span>Kullanıcı</span><span>Plan</span><span>Depolama</span><span>Defter</span><span>Son giriş</span></div>
          {data.users.map(u => (
            <button key={u.id} type="button" className="admin-row" onClick={() => setOpenId(u.id)}>
              <span className="admin-user-cell"><strong>{u.name} {u.role === 'admin' && <Badge tone="accent">Yönetici</Badge>} {u.disabled && <Badge tone="danger">Kapalı</Badge>}</strong><small className="muted">{u.email}</small></span>
              <span><Badge tone={u.plan.id === 'free' ? 'neutral' : 'success'}>{u.plan.name}</Badge></span>
              <span className="admin-storage"><small>{formatBytes(u.usedBytes)} / {formatBytes(u.plan.storageBytes)}</small><ProgressBar value={u.usedBytes} max={u.plan.storageBytes} label="Depolama" /></span>
              <span>{u.notebookCount}{u.plan.notebookLimit ? ` / ${u.plan.notebookLimit}` : ''}</span>
              <span className="muted small">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</span>
            </button>
          ))}
          <p className="muted small admin-foot">{data.total} kullanıcı{data.total > data.users.length ? ` (ilk ${data.users.length} gösteriliyor, aramayı daralt)` : ''}</p>
        </div>
      )}
      {open && <UserDialog user={open} plans={plans} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </div>
  );
}

function PlansTab({plans, onChanged}: {plans: AdminPlan[]; onChanged: () => void}) {
  const [edit, setEdit] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <p className="muted small">Plan sınırları sunucuda uygulanır. Defter sınırı 0 = sınırsız. Fiyat yalnızca bilgi amaçlı gösterilir.</p>
      <div className="plan-cards">
        {plans.map(p => (
          <div key={p.id} className="card plan-card">
            <div className="row"><h3>{p.name}</h3>{!p.active && <Badge>Kapalı</Badge>}</div>
            <ul>
              <li>{formatBytes(p.storageMb * 1024 * 1024)} depolama</li>
              <li>{p.notebookLimit ? `${p.notebookLimit} defter` : 'Sınırsız defter'}</li>
              <li>Günde {p.ocrDailyLimit} sunucu tanıması</li>
              <li>{p.priceMonthly ? `${p.priceMonthly} ${p.currency} / ay` : 'Fiyat belirtilmedi'}</li>
            </ul>
            <Button onClick={() => setEdit({...p})}>Düzenle</Button>
          </div>
        ))}
      </div>
      {edit && (
        <Dialog open onClose={() => setEdit(null)} title={`${edit.name} planı`} size="sm" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Vazgeç</Button><Button variant="primary" busy={busy} onClick={async () => {
          setBusy(true);
          try { await api(`/api/admin/plans/${edit.id}`, {method: 'PUT', json: {name: edit.name, storageMb: edit.storageMb, notebookLimit: edit.notebookLimit, ocrDailyLimit: edit.ocrDailyLimit, priceMonthly: edit.priceMonthly, active: edit.active}}); toast('Plan güncellendi.', 'success'); setEdit(null); onChanged(); }
          catch (e) { toast(msg(e), 'error'); } finally { setBusy(false); }
        }}>Kaydet</Button></>}>
          <div className="stack">
            <Field label="Ad" htmlFor="pl-name"><input id="pl-name" className="input" value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} /></Field>
            <Field label="Depolama (GB)" htmlFor="pl-gb"><input id="pl-gb" className="input" type="number" min={0.01} step={0.5} value={Math.round((edit.storageMb / 1024) * 100) / 100} onChange={e => setEdit({...edit, storageMb: Math.max(10, Math.round(Number(e.target.value) * 1024))})} /></Field>
            <Field label="Defter sınırı (0 = sınırsız)" htmlFor="pl-nb"><input id="pl-nb" className="input" type="number" min={0} value={edit.notebookLimit} onChange={e => setEdit({...edit, notebookLimit: Math.max(0, Math.floor(Number(e.target.value)))})} /></Field>
            <Field label="Günlük sunucu tanıma hakkı" htmlFor="pl-ocr"><input id="pl-ocr" className="input" type="number" min={0} value={edit.ocrDailyLimit} onChange={e => setEdit({...edit, ocrDailyLimit: Math.max(0, Math.floor(Number(e.target.value)))})} /></Field>
            <Field label={`Aylık fiyat (${edit.currency})`} htmlFor="pl-price"><input id="pl-price" className="input" type="number" min={0} step={1} value={edit.priceMonthly} onChange={e => setEdit({...edit, priceMonthly: Math.max(0, Number(e.target.value))})} /></Field>
            {edit.id !== 'free' && <Switch label="Plan satışta" checked={edit.active} onChange={active => setEdit({...edit, active})} />}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState<{ok: boolean; ms: number; text?: string; error?: string; detail?: string} | null>(null);
  const load = async () => { try { const i = await api<SystemInfo>('/api/admin/system'); setInfo(i); setModel(i.ocr.modelOverride || ''); } catch (e) { toast(msg(e), 'error'); } };
  useEffect(() => { void load(); }, []);
  if (!info) return <p className="muted">Yükleniyor…</p>;
  const save = async (body: Record<string, string>) => {
    setBusy('save');
    try { await api('/api/admin/system', {method: 'PUT', json: body}); setKey(''); toast('Kaydedildi.', 'success'); await load(); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <div className="stack">
      <section className="card card-pad settings-section">
        <h2><ScanText size={20} /> El yazısı tanıma</h2>
        <p className="muted small">API anahtarı olmadan da tanıma <b>cihazda</b> çalışır (internetsiz, ücretsiz). Anahtar girersen önce sunucudaki yapay zekâ tanıması denenir; daha dağınık el yazısında daha isabetlidir. Anthropic (<code>sk-ant-…</code>) veya OpenAI (<code>sk-…</code>) anahtarı kabul edilir; anahtar yalnızca sunucuda saklanır.</p>
        <div className="row wrap">
          <Badge tone={info.ocr.configured ? 'success' : 'neutral'}>{info.ocr.configured ? `Sunucu tanıması açık · ${info.ocr.provider === 'openai' ? 'OpenAI' : 'Anthropic'} ${info.ocr.keyHint}` : 'Sunucu tanıması kapalı · cihazda tanıma kullanılıyor'}</Badge>
          {info.ocr.configured && <span className="muted small">Model: {info.ocr.model}</span>}
        </div>
        {info.ocr.lastError && <p className="notice notice-warn small">Son hata ({timeAgo(info.ocr.lastError.at)}): {info.ocr.lastError.code} — {info.ocr.lastError.detail}</p>}
        <div className="grid-2">
          <Field label="API anahtarı" htmlFor="sys-key" hint="Boş bırakıp kaydedersen panelden girilen anahtar silinir (.env'deki anahtar varsa o kullanılır)."><input id="sys-key" className="input" type="password" autoComplete="off" placeholder={info.ocr.keyHint ? `Kayıtlı: ${info.ocr.keyHint}` : 'sk-ant-… veya sk-…'} value={key} onChange={e => setKey(e.target.value)} /></Field>
          <Field label="Model (isteğe bağlı)" htmlFor="sys-model" hint="Boşsa varsayılan kullanılır. Hesabında olmayan Claude modelinde otomatik olarak başka modele geçilir."><input id="sys-model" className="input" value={model} placeholder={info.ocr.model || 'varsayılan'} onChange={e => setModel(e.target.value)} /></Field>
        </div>
        <div className="row wrap">
          <Button variant="primary" busy={busy === 'save'} onClick={() => void save({...(key ? {ocrApiKey: key} : {}), ocrModel: model})}>Kaydet</Button>
          {info.ocr.keyHint && <Button variant="ghost" onClick={() => void save({ocrApiKey: ''})}>Paneldeki anahtarı sil</Button>}
          <Button icon={<RefreshCw size={16} />} busy={busy === 'test'} disabled={!info.ocr.configured} onClick={async () => { setBusy('test'); try { setTest(await api('/api/admin/system/ocr-test', {method: 'POST'})); await load(); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); } }}>Bağlantıyı test et</Button>
        </div>
        {test && (test.ok
          ? <p className="notice notice-success small">✓ Tanıma hizmeti çalışıyor ({test.ms} ms).</p>
          : <p className="notice notice-warn small">✗ {test.error}{test.detail && <><br /><span className="muted">Sağlayıcının yanıtı: {test.detail}</span></>}</p>)}
      </section>
      <section className="card card-pad settings-section">
        <h2><Mail size={20} /> E-posta</h2>
        <p className="muted small">{info.mail.configured ? `SMTP ayarlı (gönderen: ${info.mail.from}).` : 'SMTP ayarlı değil. Şifre sıfırlama bağlantıları kullanıcı detayında sana gösterilir; kopyalayıp iletebilirsin. E-posta için .env dosyasındaki SMTP_* ayarlarını doldur.'}</p>
        <div><Button busy={busy === 'mail'} onClick={async () => { setBusy('mail'); try { const r = await api<{ok: boolean; message: string}>('/api/admin/system/mail-test', {method: 'POST'}); toast(r.message, r.ok ? 'success' : 'info'); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); } }}>Deneme e-postası gönder</Button></div>
      </section>
      <p className="muted small">Sürüm {info.version} · Yeni kayıt {info.registrationOpen ? 'açık' : 'kapalı'} (REGISTRATION_OPEN)</p>
    </div>
  );
}

export function AdminPage() {
  const {user} = useSession();
  const [tab, setTab] = useState<'users' | 'plans' | 'system'>('users');
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const loadPlans = () => api<{plans: AdminPlan[]}>('/api/admin/plans').then(r => setPlans(r.plans)).catch(() => {});
  useEffect(() => { if (user?.role === 'admin') { void loadPlans(); api<Stats>('/api/admin/stats').then(setStats).catch(() => {}); } }, [user?.role]);
  if (user?.role !== 'admin') return <div className="page"><EmptyState icon={<ShieldOff size={28} />} title="Bu bölüm yöneticiler içindir" /></div>;
  return (
    <div className="page page-wide">
      <PageHeader title="Yönetim" subtitle="Kullanıcılar, abonelikler, ek haklar ve sistem ayarları" />
      {stats && (
        <div className="admin-stats">
          <StatCard icon={<Users size={20} />} label="kullanıcı" value={stats.users.total} hint={`${stats.users.newThisWeek} yeni · ${stats.users.activeThisWeek} aktif (7 gün)`} />
          <StatCard icon={<Sparkles size={20} />} label="ücretli abonelik" value={stats.subscriptions.reduce((n, s) => n + s.count, 0)} hint={stats.subscriptions.map(s => `${s.planId}: ${s.count}`).join(' · ') || '—'} />
          <StatCard icon={<BookOpen size={20} />} label="defter" value={stats.notebooks} hint={`${stats.pages} sayfa`} />
          <StatCard icon={<HardDrive size={20} />} label="toplam depolama" value={formatBytes(stats.storageBytes)} hint={`${stats.fileCount} dosya`} />
        </div>
      )}
      <Segmented label="Yönetim bölümü" value={tab} onChange={setTab} options={[{value: 'users', label: 'Kullanıcılar'}, {value: 'plans', label: 'Planlar'}, {value: 'system', label: 'Sistem'}]} />
      {tab === 'users' && <UsersTab plans={plans} />}
      {tab === 'plans' && <PlansTab plans={plans} onChanged={() => void loadPlans()} />}
      {tab === 'system' && <SystemTab />}
    </div>
  );
}
