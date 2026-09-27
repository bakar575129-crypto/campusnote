// 👥 Paylaşımlar: davetler, benimle paylaşılan defterler, paylaştıklarım (kişiler ve bağlantılar), Keşfet (herkese açık notlar).
import {useEffect, useState} from 'react';
import {Check, Compass, Copy, Eye, Inbox, Link2, Share2, Users, X} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate} from '@/app/router';
import {Badge, Button, EmptyState, Segmented} from '@/components/ui';
import {toast} from '@/components/feedback';
import {api, ApiError} from '@/lib/api';
import {refreshCollab} from '@/lib/store';
import {timeAgo} from '@/lib/format';
import {ShareDialog, shareUrl, VISIBILITY, type ShareLink} from './ShareDialog';

interface Shares {
  invites: {notebookId: string; role: string; title: string; course: string; color: string; owner: string; createdAt: number}[];
  shared: {notebookId: string; role: string; title: string; course: string; color: string; owner: string; updatedAt: number}[];
  mine: {notebookId: string; title: string; course: string; color: string; members: number; pending: number}[];
  links: ShareLink[];
}
interface GalleryItem {id: string; title: string; course: string; color: string; owner: string; views: number; updatedAt: number}

export function SharesPage() {
  const [tab, setTab] = useState<'with' | 'mine' | 'explore'>('with');
  const [data, setData] = useState<Shares | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const load = async () => { try { setData(await api<Shares>('/api/shares')); } catch (e) { if (e instanceof ApiError && e.status === 0) setData({invites: [], shared: [], mine: [], links: []}); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (tab === 'explore' && !gallery) api<{items: GalleryItem[]}>('/api/public/gallery').then(r => setGallery(r.items)).catch(() => setGallery([])); }, [tab, gallery]);
  const answer = async (id: string, a: 'accept' | 'decline') => {
    try {
      await api(`/api/notebooks/${id}/invite/${a}`, {method: 'POST'});
      toast(a === 'accept' ? 'Davet kabul edildi. Defter listende; birkaç saniye içinde açılır.' : 'Davet reddedildi.', a === 'accept' ? 'success' : 'info');
      refreshCollab(); await load();
    } catch (e) { toast(e instanceof Error ? e.message : 'İşlem yapılamadı.', 'error'); }
  };
  return (
    <div className="page">
      <PageHeader title="Paylaşımlar" subtitle="Ortak defterler, paylaşım bağlantıları ve herkese açık notlar" />
      {data && data.invites.length > 0 && (
        <section className="stack-tight">
          <h3 className="group-title"><Inbox size={16} /> Davetler <span className="muted">{data.invites.length}</span></h3>
          {data.invites.map(i => (
            <div key={i.notebookId} className="card list-row invite-card" style={{'--c': i.color} as React.CSSProperties}>
              <span className="stat-icon"><Users size={18} /></span>
              <span className="list-row-main"><strong>{i.title}</strong><span className="muted small"><b>{i.owner}</b> seninle paylaştı · {i.role === 'editor' ? 'düzenleyebilirsin' : 'görüntüleyebilirsin'} · {timeAgo(i.createdAt)}</span></span>
              <Button size="sm" variant="ghost" icon={<X size={16} />} onClick={() => void answer(i.notebookId, 'decline')}>Reddet</Button>
              <Button size="sm" variant="primary" icon={<Check size={16} />} onClick={() => void answer(i.notebookId, 'accept')}>Kabul et</Button>
            </div>
          ))}
        </section>
      )}
      <div className="toolbar-row">
        <Segmented label="Bölüm" value={tab} onChange={setTab} options={[{value: 'with', label: <><Users size={16} />Benimle paylaşılan</>}, {value: 'mine', label: <><Share2 size={16} />Paylaştıklarım</>}, {value: 'explore', label: <><Compass size={16} />Keşfet</>}]} />
      </div>
      {!data ? <p className="muted">Yükleniyor…</p> : tab === 'with' ? (data.shared.length ? (
        <div className="list-stack">
          {data.shared.map(s => (
            <a key={s.notebookId} {...linkProps(`/defter/${s.notebookId}`)} className="card list-row">
              <span className="nb-swatch" style={{background: s.color}} />
              <span className="list-row-main"><strong>{s.title}</strong><span className="muted small">{s.owner} · {s.course || 'Ders yok'} · {timeAgo(s.updatedAt)}</span></span>
              <Badge tone={s.role === 'editor' ? 'accent' : 'neutral'}>{s.role === 'editor' ? 'Düzenleyebilir' : 'Görüntüleyebilir'}</Badge>
            </a>
          ))}
        </div>
      ) : <EmptyState icon={<Users size={28} />} title="Seninle paylaşılan defter yok">Arkadaşın bir defterini seninle paylaştığında burada ve Defterlerim’de görünür.</EmptyState>)
      : tab === 'mine' ? (
        <div className="stack">
          {data.mine.length > 0 && <div className="list-stack">
            {data.mine.map(m => (
              <div key={m.notebookId} className="card list-row">
                <span className="nb-swatch" style={{background: m.color}} />
                <span className="list-row-main"><strong>{m.title}</strong><span className="muted small">{m.members} kişi{m.pending ? ` · ${m.pending} davet bekliyor` : ''}</span></span>
                <Button size="sm" onClick={() => setManage(m.notebookId)}>Yönet</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/defter/${m.notebookId}`)}>Aç</Button>
              </div>
            ))}
          </div>}
          {data.links.length > 0 && <>
            <h3 className="group-title"><Link2 size={16} /> Paylaşım bağlantıları</h3>
            <div className="list-stack">
              {data.links.map(l => (
                <div key={l.id} className="card list-row">
                  <span className="stat-icon"><Link2 size={18} /></span>
                  <span className="list-row-main"><strong>{l.title}{l.pageId ? ' · tek sayfa' : ''}</strong><span className="muted small">{VISIBILITY.find(v => v.value === l.visibility)?.label} · <Eye size={12} /> {l.views} · {timeAgo(l.createdAt)}</span></span>
                  <Button size="sm" icon={<Copy size={15} />} disabled={l.visibility === 'private'} onClick={() => void navigator.clipboard?.writeText(shareUrl(l.id)).then(() => toast('Bağlantı kopyalandı.', 'success'))}>Kopyala</Button>
                  <Button size="sm" variant="ghost" onClick={() => setManage(l.notebookId)}>Yönet</Button>
                </div>
              ))}
            </div>
          </>}
          {!data.mine.length && !data.links.length && <EmptyState icon={<Share2 size={28} />} title="Henüz bir şey paylaşmadın">Bir defteri açıp <b>Paylaş</b>’a dokun: arkadaşlarını davet et ya da bağlantı oluştur.</EmptyState>}
        </div>
      ) : (gallery === null ? <p className="muted">Yükleniyor…</p> : gallery.length ? (
        <div className="learn-grid">
          {gallery.map(g => (
            <a key={g.id} {...linkProps(`/share/note/${g.id}`)} className="card learn-card" style={{'--c': g.color} as React.CSSProperties}>
              <span className="learn-card-top"><Compass size={18} /><span className="learn-card-title">{g.title}</span></span>
              <span className="muted small">{g.course || 'Ders yok'} · {g.owner}</span>
              <span className="muted small"><Eye size={12} /> {g.views} · {timeAgo(g.updatedAt)}</span>
            </a>
          ))}
        </div>
      ) : <EmptyState icon={<Compass size={28} />} title="Keşfet boş">Herkese açık paylaşılan notlar burada listelenir.</EmptyState>)}
      {manage && <ShareDialog notebookId={manage} onClose={() => { setManage(null); void load(); }} />}
    </div>
  );
}
