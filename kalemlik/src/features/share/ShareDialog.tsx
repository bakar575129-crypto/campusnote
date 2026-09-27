// 🔗 Paylaş: ortak defter (kişi davet et, görüntüleme / düzenleme), paylaşım bağlantısı (gizli / bağlantıya sahip olan
// görüntüleyebilir / herkese açık, indirme izni, kapatma) ve değişiklik geçmişi.
import {useEffect, useState} from 'react';
import {Copy, History, Link2, Trash2, UserPlus, Users} from 'lucide-react';
import {Badge, Button, Dialog, Field, Segmented, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {navigate} from '@/app/router';
import {api, ApiError} from '@/lib/api';
import {refreshCollab, useRecord} from '@/lib/store';
import {timeAgo} from '@/lib/format';
import {useSession} from '@/app/session';

export interface Member {userId: string; name: string; email?: string; role: 'viewer' | 'editor'; status: 'pending' | 'accepted'}
export interface Collab {access: 'owner' | 'editor' | 'viewer'; owner: {id: string; name: string}; members: Member[]; activity: {action: string; detail: string; at: number; name: string}[]; pages: {id: string; updatedAt: number; lastEditor: string}[]; limits: {collaboration: boolean; maxCollaborators: number}}
export interface ShareLink {id: string; notebookId: string; pageId: string; visibility: 'private' | 'link' | 'public'; allowDownload: boolean; views: number; createdAt: number; title?: string}

export const shareUrl = (id: string) => `${location.origin}/share/note/${id}`;
export const VISIBILITY: {value: ShareLink['visibility']; label: string; hint: string}[] = [
  {value: 'private', label: 'Gizli', hint: 'Bağlantı kapalı; kimse açamaz.'},
  {value: 'link', label: 'Bağlantıya sahip olan', hint: 'Bağlantıyı bilen herkes görüntüleyebilir.'},
  {value: 'public', label: 'Herkese açık', hint: 'Ayrıca Keşfet’te listelenir.'},
];
const ACTIONS: Record<string, string> = {edit_page: 'bir sayfayı düzenledi', add_page: 'sayfa ekledi', delete_page: 'bir sayfayı sildi', invite: 'davet etti', join: 'deftere katıldı', leave: 'defterden ayrıldı', remove: 'bir üyeyi çıkardı'};
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'İşlem yapılamadı.');

export function ShareDialog({notebookId, pageId, onClose}: {notebookId: string; pageId?: string; onClose: () => void}) {
  const nb = useRecord('notebook', notebookId);
  const {user} = useSession();
  const [collab, setCollab] = useState<Collab | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('editor');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<'people' | 'link' | 'history'>('people');
  const load = async () => {
    try {
      const [c, s] = await Promise.all([api<Collab>(`/api/notebooks/${notebookId}/collab`), api<{links: ShareLink[]}>('/api/shares')]);
      setCollab(c); setLinks(s.links.filter(l => l.notebookId === notebookId));
    } catch (e) { toast(msg(e), 'error'); }
  };
  useEffect(() => { if (navigator.onLine) void load(); }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps
  const isOwner = collab?.access === 'owner';
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok, 'success'); await load(); refreshCollab(); } catch (e) { toast(msg(e), 'error'); } finally { setBusy(''); }
  };
  const invite = () => run('invite', () => api(`/api/notebooks/${notebookId}/members`, {method: 'POST', json: {email: email.trim(), role}}).then(() => setEmail('')), 'Davet gönderildi. Kabul edince defter onun listesinde görünür.');
  const copy = (id: string) => { void navigator.clipboard?.writeText(shareUrl(id)).then(() => toast('Bağlantı kopyalandı.', 'success'), () => toast(shareUrl(id), 'info')); };

  if (!navigator.onLine) return <Dialog open onClose={onClose} title="Paylaş"><p className="muted">Paylaşım için internet bağlantısı gerekiyor.</p></Dialog>;
  return (
    <Dialog open onClose={onClose} size="lg" title={<span className="row"><Users size={20} /> {nb?.title || 'Defter'} · Paylaş</span>}>
      {!collab ? <p className="muted">Yükleniyor…</p> : (
        <div className="stack share-dialog">
          <Segmented label="Bölüm" value={tab} onChange={setTab} options={[{value: 'people', label: <><Users size={16} />Kişiler</>}, {value: 'link', label: <><Link2 size={16} />Bağlantı</>}, {value: 'history', label: <><History size={16} />Geçmiş</>}]} />
          {tab === 'people' && <>
            {isOwner && (collab.limits.collaboration ? (
              <form className="invite-row" onSubmit={e => { e.preventDefault(); if (email.trim()) void invite(); }}>
                <input className="input" type="email" required placeholder="Arkadaşının Kalemlik e-postası" value={email} onChange={e => setEmail(e.target.value)} aria-label="E-posta" />
                <select className="select" value={role} onChange={e => setRole(e.target.value as 'viewer' | 'editor')} aria-label="Yetki"><option value="editor">Düzenleyebilir</option><option value="viewer">Görüntüleyebilir</option></select>
                <Button type="submit" variant="primary" icon={<UserPlus size={17} />} busy={busy === 'invite'}>Davet et</Button>
              </form>
            ) : <p className="notice notice-warn small">Ortak defter bu planda kapalı. Planını yükselterek arkadaşlarınla birlikte yazabilirsin.</p>)}
            <div className="member-list">
              <div className="member-row"><span className="avatar">{collab.owner.name.slice(0, 1).toLocaleUpperCase('tr')}</span><span className="member-main"><strong>{collab.owner.name}{collab.owner.id === user?.id ? ' (sen)' : ''}</strong><span className="muted small">Defterin sahibi</span></span><Badge tone="accent">Sahip</Badge></div>
              {collab.members.map(m => (
                <div key={m.userId} className="member-row">
                  <span className="avatar">{m.name.slice(0, 1).toLocaleUpperCase('tr')}</span>
                  <span className="member-main"><strong>{m.name}{m.userId === user?.id ? ' (sen)' : ''}</strong><span className="muted small">{m.email || ''}{m.status === 'pending' ? ' · davet bekliyor' : ''}</span></span>
                  {isOwner ? (
                    <select className="select select-sm" value={m.role} aria-label={`${m.name} yetkisi`} onChange={e => void run('role', () => api(`/api/notebooks/${notebookId}/members/${m.userId}`, {method: 'PATCH', json: {role: e.target.value}}), 'Yetki güncellendi.')}>
                      <option value="editor">Düzenleyebilir</option><option value="viewer">Görüntüleyebilir</option>
                    </select>
                  ) : <Badge>{m.role === 'editor' ? 'Düzenleyebilir' : 'Görüntüleyebilir'}</Badge>}
                  {(isOwner || m.userId === user?.id) && <button type="button" className="icon-btn icon-btn-sm" aria-label={m.userId === user?.id ? 'Defterden ayrıl' : `${m.name} kişisini çıkar`} onClick={async () => {
                    const leaving = m.userId === user?.id;
                    if (!(await confirmDialog({title: leaving ? 'Defterden ayrılınsın mı?' : `${m.name} çıkarılsın mı?`, message: leaving ? 'Defter senin listenden kalkar.' : 'Defter onun cihazlarından kalkar.', confirmLabel: leaving ? 'Ayrıl' : 'Çıkar', danger: true}))) return;
                    await run('remove', () => api(`/api/notebooks/${notebookId}/members/${m.userId}`, {method: 'DELETE'}));
                    if (leaving) { onClose(); navigate('/defterler'); }
                  }}><Trash2 size={15} /></button>}
                </div>
              ))}
              {!collab.members.length && <p className="muted small">Henüz kimseyle paylaşılmadı. Birlikte not tutmak için arkadaşını davet et; aynı anda yazsanız bile çizgiler birleşir.</p>}
            </div>
          </>}
          {tab === 'link' && (isOwner ? <>
            <div className="row wrap">
              <Button icon={<Link2 size={17} />} busy={busy === 'link'} onClick={() => void run('link', () => api<{link: ShareLink}>(`/api/notebooks/${notebookId}/links`, {method: 'POST', json: {visibility: 'link'}}).then(r => copy(r.link.id)), 'Bağlantı oluşturuldu ve kopyalandı.')}>Defter için bağlantı</Button>
              {pageId && <Button icon={<Link2 size={17} />} busy={busy === 'plink'} onClick={() => void run('plink', () => api<{link: ShareLink}>(`/api/notebooks/${notebookId}/links`, {method: 'POST', json: {visibility: 'link', pageId}}).then(r => copy(r.link.id)), 'Sayfa bağlantısı oluşturuldu ve kopyalandı.')}>Yalnızca bu sayfa</Button>}
            </div>
            {links.length ? links.map(l => (
              <div key={l.id} className="card card-pad link-card">
                <div className="row wrap"><strong>{l.pageId ? 'Tek sayfa' : 'Bütün defter'}</strong><span className="muted small">{l.views} görüntülenme · {timeAgo(l.createdAt)}</span><span className="spacer" />
                  <Button size="sm" icon={<Copy size={15} />} disabled={l.visibility === 'private'} onClick={() => copy(l.id)}>Kopyala</Button>
                  <Button size="sm" variant="ghost" className="danger-text" icon={<Trash2 size={15} />} onClick={() => void run('del', () => api(`/api/links/${l.id}`, {method: 'DELETE'}), 'Bağlantı kapatıldı.')}>Bağlantıyı kapat</Button>
                </div>
                <code className="link-url">{shareUrl(l.id)}</code>
                <Field label="Kim görebilir?">
                  <select className="select" value={l.visibility} onChange={e => void run('vis', () => api(`/api/links/${l.id}`, {method: 'PATCH', json: {visibility: e.target.value}}))} aria-label="Görünürlük">
                    {VISIBILITY.map(v => <option key={v.value} value={v.value}>{v.label} — {v.hint}</option>)}
                  </select>
                </Field>
                <Switch label="PDF olarak indirmeye izin ver" checked={l.allowDownload} onChange={v => void run('dl', () => api(`/api/links/${l.id}`, {method: 'PATCH', json: {allowDownload: v}}))} />
              </div>
            )) : <p className="muted small">Henüz bağlantı yok. Bağlantı oluşturduğunda, bağlantıyı bilen kişiler notu giriş yapmadan görüntüleyebilir; istediğin an kapatabilirsin.</p>}
          </> : <p className="muted small">Paylaşım bağlantılarını yalnızca defterin sahibi yönetir.</p>)}
          {tab === 'history' && (
            <div className="stack-tight">
              {pageId && collab.pages.find(p => p.id === pageId) && <p className="notice small">Bu sayfayı en son <strong>{collab.pages.find(p => p.id === pageId)!.lastEditor}</strong> düzenledi · {timeAgo(collab.pages.find(p => p.id === pageId)!.updatedAt)}</p>}
              {collab.activity.length ? collab.activity.map((a, i) => <div key={i} className="activity-row"><strong>{a.name}</strong> <span>{ACTIONS[a.action] || a.action}{a.detail ? `: ${a.detail}` : ''}</span><span className="muted small">{timeAgo(a.at)}</span></div>)
                : <p className="muted small">Henüz ortak çalışma geçmişi yok.</p>}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
