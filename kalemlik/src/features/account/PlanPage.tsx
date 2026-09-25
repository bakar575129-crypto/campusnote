import {useEffect, useState} from 'react';
import {BookOpen, Check, FileImage, FileType2, HardDrive, ScanText, Sparkles, Trash2} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {Badge, Button, ProgressBar} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {api} from '@/lib/api';
import {formatBytes, timeAgo} from '@/lib/format';
import {refreshPlan, usePlan} from '@/lib/plan';
import {hasUnsyncedChanges, syncNow} from '@/lib/store';

const KIND: Record<string, string> = {page: 'PDF / fotoğraf sayfası', image: 'Görsel', sticker: 'Sticker', font: 'Yazı tipi', pdf: 'PDF'};

export function PlanPage() {
  const info = usePlan();
  const [busy, setBusy] = useState('');
  const [showFiles, setShowFiles] = useState(false);
  useEffect(() => { void refreshPlan(); }, []);
  if (!info) return <div className="page page-narrow"><PageHeader title="Plan & Depolama" /><p className="muted">{navigator.onLine ? 'Yükleniyor…' : 'Plan bilgisi için internet bağlantısı gerekiyor.'}</p></div>;
  const {plan, usage, notebooks, ocr} = info;
  const pct = usage.quotaBytes ? usage.usedBytes / usage.quotaBytes : 0;
  const unused = info.files.filter(f => !f.inUse);

  const checkout = async (planId: string) => {
    setBusy(planId);
    try { await api('/api/billing/checkout', {method: 'POST', json: {planId}}); }
    catch (e) { toast(e instanceof Error ? e.message : 'Ödeme başlatılamadı.', 'info'); } finally { setBusy(''); }
  };
  const cleanup = async () => {
    if (hasUnsyncedChanges()) { await syncNow(); }
    if (!(await confirmDialog({title: 'Kullanılmayan dosyalar silinsin mi?', message: `Hiçbir defterde, kapakta veya arşivde kullanılmayan ${unused.length} dosya (${formatBytes(unused.reduce((n, f) => n + f.size, 0))}) silinecek. Son bir saatte yüklenenler korunur.`, confirmLabel: 'Temizle', danger: true}))) return;
    setBusy('cleanup');
    try { const r = await api<{removed: number; freedBytes: number}>('/api/storage/cleanup', {method: 'POST'}); toast(`${r.removed} dosya silindi, ${formatBytes(r.freedBytes)} yer açıldı.`, 'success'); await refreshPlan(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Temizlenemedi.', 'error'); } finally { setBusy(''); }
  };
  const deleteFile = async (id: string) => {
    try { await api(`/api/files/${id}`, {method: 'DELETE'}); await refreshPlan(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Silinemedi.', 'error'); }
  };
  const cancel = async () => {
    if (!(await confirmDialog({title: 'Otomatik yenileme iptal edilsin mi?', message: 'Ödediğin dönemin sonuna kadar planın sürer; sonra ücretsiz plana geçersin. Dosyaların silinmez.', confirmLabel: 'Yenilemeyi iptal et', danger: true}))) return;
    try { await api('/api/billing/cancel', {method: 'POST'}); toast('Yenileme iptal edildi.', 'success'); await refreshPlan(); } catch (e) { toast(e instanceof Error ? e.message : 'İptal edilemedi.', 'error'); }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="Plan & Depolama" subtitle={<>Şu anki planın: <b>{plan.name}</b>{plan.subscription && ` · ${new Date(plan.subscription.periodEnd).toLocaleDateString('tr')} tarihine kadar`}</>} />
      <section className="card card-pad usage-grid">
        <div className="usage-item">
          <HardDrive size={22} />
          <div><strong>{formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaBytes)}</strong><span className="muted small">Depolama · {usage.fileCount} dosya</span>
            <ProgressBar value={usage.usedBytes} max={usage.quotaBytes} label="Kullanılan depolama" tone={pct > 0.95 ? 'danger' : pct > 0.8 ? 'warn' : undefined} /></div>
        </div>
        <div className="usage-item">
          <BookOpen size={22} />
          <div><strong>{notebooks.active}{notebooks.limit ? ` / ${notebooks.limit}` : ''} defter</strong><span className="muted small">{notebooks.limit ? 'Çöp kutusundakiler sayılmaz' : 'Sınırsız defter'}</span>
            {notebooks.limit && <ProgressBar value={notebooks.active} max={notebooks.limit} label="Defter kullanımı" tone={notebooks.active >= notebooks.limit ? 'warn' : undefined} />}</div>
        </div>
        <div className="usage-item">
          <ScanText size={22} />
          <div><strong>{ocr.today} / {ocr.limit}</strong><span className="muted small">Bugünkü el yazısı tanıma</span><ProgressBar value={ocr.today} max={Math.max(1, ocr.limit)} label="Tanıma kullanımı" /></div>
        </div>
      </section>

      <section className="plan-cards">
        {info.plans.map(p => {
          const current = p.id === plan.id;
          return (
            <div key={p.id} className={`card plan-card ${current ? 'is-current' : ''}`}>
              <div className="row"><h3>{p.name}</h3>{current && <Badge tone="accent">Şu anki plan</Badge>}</div>
              <p className="plan-price">{p.priceMonthly > 0 ? `${p.priceMonthly.toLocaleString('tr', {minimumFractionDigits: 2})} ${p.currency} / ay` : p.id === 'free' ? 'Ücretsiz' : 'Fiyat yakında'}</p>
              <ul>
                <li><Check size={16} /> {formatBytes(p.storageBytes)} depolama</li>
                <li><Check size={16} /> {p.notebookLimit ? `Aynı anda ${p.notebookLimit} defter` : 'Sınırsız defter'}</li>
                <li><Check size={16} /> Günde {p.ocrDailyLimit} el yazısı tanıma</li>
                <li><Check size={16} /> Tüm kalemler, şablonlar, PDF ve çevrimdışı kullanım</li>
              </ul>
              {!current && p.id !== 'free' && <Button variant="primary" icon={<Sparkles size={17} />} busy={busy === p.id} onClick={() => void checkout(p.id)}>{info.billingEnabled ? `${p.name}'a geç` : 'Yükseltme iste'}</Button>}
              {current && plan.subscription && !plan.subscription.cancelAtPeriodEnd && plan.subscription.provider !== 'manual' && <Button variant="ghost" onClick={() => void cancel()}>Yenilemeyi iptal et</Button>}
            </div>
          );
        })}
      </section>
      {!info.billingEnabled && <p className="muted small">Çevrimiçi ödeme bu sunucuda henüz etkin değil.{info.supportEmail && <> Plan yükseltmek için <a href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a> adresine yazabilirsin.</>}</p>}

      <section className="card card-pad settings-section">
        <div className="row"><h2>Dosyalar</h2><span className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => setShowFiles(!showFiles)}>{showFiles ? 'Gizle' : `Listeyi göster (${info.files.length})`}</Button>
        </div>
        <p className="muted small">PDF sayfaları, fotoğraflar, stickerlar ve yazı tipleri depolama alanını kullanır. Defterlerdeki çizim ve metinler çok az yer kaplar.</p>
        {unused.length > 0 && <Button icon={<Trash2 size={17} />} busy={busy === 'cleanup'} onClick={() => void cleanup()}>Kullanılmayan {unused.length} dosyayı temizle ({formatBytes(unused.reduce((n, f) => n + f.size, 0))})</Button>}
        {showFiles && (
          <ul className="file-list">
            {info.files.map(f => (
              <li key={f.id}>
                {f.kind === 'font' ? <FileType2 size={18} /> : <FileImage size={18} />}
                <span className="file-name"><strong title={f.name}>{f.name}</strong><small className="muted">{KIND[f.kind] || f.kind} · {formatBytes(f.size)} · {timeAgo(f.createdAt)}</small></span>
                {f.inUse ? <Badge tone="success">Kullanımda</Badge> : <button type="button" className="icon-btn icon-btn-sm" aria-label={`${f.name} dosyasını sil`} onClick={() => void deleteFile(f.id)}><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
