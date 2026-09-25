import {useEffect, useRef, useState} from 'react';
import {Download, Monitor, Moon, Sun, Trash2, Upload, Type} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {useSession} from '@/app/session';
import {Button, ColorPicker, Field, Segmented, Slider, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {useSettings, updateSettings} from '@/lib/settings';
import {put, remove, useList, hasUnsyncedChanges, currentUserId, unloadUser} from '@/lib/store';
import {saveFile} from '@/lib/files';
import {uuid} from '@/lib/ids';
import {idbClearUser} from '@/lib/idb';
import {PAPERS} from '@/features/editor/paper';
import {BUILTIN_FONTS, allFonts, fontStack, inspectFontFile, ensureFont} from '@/features/fonts/fonts';
import type {StylusAction, WriteMode} from '@/lib/types';
import {logout} from '@/app/session';

const ACCENTS = ['#2f6fed', '#1f9d7a', '#8b5cf6', '#e0643a', '#d9467a', '#0e7490', '#1f3a5f', '#b45309'];
export const STYLUS_LABELS: Record<StylusAction, string> = {none: 'Hiçbir şey', eraser: 'Silgi', pen: 'Kalem', highlighter: 'Fosforlu', select: 'Alan seç', hand: 'Sayfayı kaydır', undo: 'Geri al'};
export const WRITE_MODES: {value: WriteMode; label: string}[] = [{value: 'off', label: 'Kapalı'}, {value: 'word', label: 'Kelime'}, {value: 'sentence', label: 'Cümle'}];

type InstallEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: string}>};
let deferredInstall: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e as InstallEvent; });

export function FontManager() {
  const fonts = useList('font');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { for (const f of allFonts()) void ensureFont(f.id); }, [fonts]);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const {name, missing} = await inspectFontFile(file);
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      const fileId = await saveFile(file, 'font', `${name}${ext}`);
      put('font', {id: uuid(), fileId, name, missingChars: missing});
      toast(missing ? `"${name}" eklendi. Bu yazı tipinde eksik Türkçe harfler var: ${missing}` : `"${name}" eklendi; tüm cihazlarında kullanılabilir.`, missing ? 'info' : 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Yazı tipi eklenemedi.', 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="font-list">
        {BUILTIN_FONTS.map(f => <div key={f.id} className="font-item"><span style={{fontFamily: fontStack(f.id)}} className="font-sample">Ağaç şişe ığdır</span><span className="muted small">{f.name}</span></div>)}
        {fonts.map(f => {
          const id = 'custom-' + f.id;
          return (
            <div key={f.id} className="font-item">
              <span style={{fontFamily: fontStack(id)}} className="font-sample">Ağaç şişe ığdır</span>
              <span className="muted small">{f.name} · yüklendi{f.missingChars && ` · eksik: ${f.missingChars}`}</span>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={`${f.name} yazı tipini sil`} onClick={async () => { if (await confirmDialog({title: 'Yazı tipi silinsin mi?', message: 'Bu yazı tipiyle yazılmış metinler yedek yazı tipiyle görünür.', confirmLabel: 'Sil', danger: true})) remove('font', f.id); }}><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      <input ref={input} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
      <Button icon={<Upload size={18} />} busy={busy} onClick={() => input.current?.click()}>Yazı tipi yükle (TTF, OTF, WOFF, WOFF2 · en fazla 5 MB)</Button>
    </div>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const {config} = useSession();
  const [canInstall, setCanInstall] = useState(!!deferredInstall);
  useEffect(() => { const t = setInterval(() => setCanInstall(!!deferredInstall), 1000); return () => clearInterval(t); }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const clearDevice = async () => {
    const unsynced = hasUnsyncedChanges();
    const ok = await confirmDialog({title: 'Bu cihazdaki veriler silinsin mi?', danger: true, confirmLabel: 'Sil ve çıkış yap',
      message: unsynced ? 'DİKKAT: Henüz sunucuya kaydedilmemiş değişikliklerin var; silersen kaybolur. Önce internete bağlanıp eşitlemeyi bekle.' : 'Sunucudaki verilerin silinmez. Bu cihazdaki çevrimdışı kopyalar temizlenir ve çıkış yapılır.'});
    if (!ok) return;
    const id = currentUserId();
    unloadUser();
    if (id) await idbClearUser(id);
    await logout();
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="Ayarlar" subtitle="Tercihlerin hesabına kaydedilir ve tüm cihazlarında geçerli olur." />
      <section className="card card-pad settings-section">
        <h2>Görünüm</h2>
        <div className="field"><label>Tema</label>
          <Segmented label="Tema" value={s.theme} onChange={theme => updateSettings({theme})} options={[{value: 'system', label: <><Monitor size={16} />Sistem</>}, {value: 'light', label: <><Sun size={16} />Açık</>}, {value: 'dark', label: <><Moon size={16} />Koyu</>}]} />
        </div>
        <Field label="Vurgu rengi"><ColorPicker value={s.accent} onChange={accent => updateSettings({accent})} swatches={ACCENTS} /></Field>
      </section>

      <section className="card card-pad settings-section">
        <h2>Defter ve kalem</h2>
        <Field label="Yeni defterlerde varsayılan şablon" htmlFor="st-paper"><select id="st-paper" className="select" value={s.defaultPaper} onChange={e => updateSettings({defaultPaper: e.target.value as typeof s.defaultPaper})}>{PAPERS.map(p => <option key={p.id} value={p.id}>{p.group} · {p.name}</option>)}</select></Field>
        <div className="field"><label>Kalem çubuğu konumu</label><Segmented label="Kalem çubuğu" value={s.railSide} onChange={railSide => updateSettings({railSide})} options={[{value: 'left', label: 'Solda'}, {value: 'right', label: 'Sağda'}]} /></div>
        <Switch label="Yalnızca kalem" description="Stylus yazar; parmak ve avuç içi çizmez. İki parmakla kaydırma/yakınlaştırma çalışır." checked={s.penOnly} onChange={penOnly => updateSettings({penOnly})} />
        <Switch label="Yakınlaştırmayı kilitle" description="Sıkıştırma, Ctrl + tekerlek ve +/− kapalı; iki parmakla kaydırma sürer." checked={s.zoomLock} onChange={zoomLock => updateSettings({zoomLock})} />
        <div className="field"><label>Silgi</label><Segmented label="Silgi türü" value={s.eraser.mode} onChange={mode => updateSettings({eraser: {mode}})} options={[{value: 'partial', label: 'Dokunduğu yeri sil'}, {value: 'stroke', label: 'Çizginin tamamını sil'}]} /></div>
        <div className="grid-2">
          <Field label="Kalemin yan tuşu" htmlFor="st-barrel"><select id="st-barrel" className="select" value={s.stylus.barrel} onChange={e => updateSettings({stylus: {barrel: e.target.value as StylusAction}})}>{Object.entries(STYLUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Kalemin silgi ucu" htmlFor="st-tip"><select id="st-tip" className="select" value={s.stylus.tip} onChange={e => updateSettings({stylus: {tip: e.target.value as StylusAction}})}>{Object.entries(STYLUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
      </section>

      <section className="card card-pad settings-section">
        <h2>Otomatik yazı düzeltme</h2>
        <p className="muted small">Kalemle yazıp kısa bir süre durduğunda yazın satıra (çizgili) veya karelerin içine (kareli) oturtulur. Yazarken hiçbir şey kaymaz; tek dokunuşla geri alınır.</p>
        <div className="field"><label>Kip</label><Segmented label="Düzeltme kipi" value={s.write.mode} onChange={mode => updateSettings({write: {mode}})} options={WRITE_MODES} /></div>
        <Field label="Yazı" htmlFor="st-wfont" hint={s.write.font === 'own' ? 'Kendi el yazın korunur; yalnızca hizalanır ve boyutlanır. İnternetsiz çalışır.' : config?.ocrEnabled ? 'Yazın tanınır ve seçtiğin yazı tipinde temiz metne dönüşür. Tanıma olmazsa kendi yazın korunur.' : 'Bu sunucuda el yazısı tanıma kapalı; kendi el yazın düzeltilerek korunur.'}>
          <select id="st-wfont" className="select" value={s.write.font} onChange={e => updateSettings({write: {font: e.target.value}})}>
            <option value="own">Kendi el yazım</option>
            {allFonts().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Slider label="Yazı boyutu" value={s.write.size} min={0.6} max={1.3} step={0.05} onChange={size => updateSettings({write: {size}})} format={v => `%${Math.round(v * 100)}`} />
        <Slider label="Kalınlık" value={s.write.weight} min={1} max={9} onChange={weight => updateSettings({write: {weight}})} />
        <Slider label="Harf aralığı" value={s.write.spacing} min={-3} max={12} onChange={spacing => updateSettings({write: {spacing}})} />
        <Slider label="Bekleme süresi" value={s.write.delay} min={200} max={1500} step={50} onChange={delay => updateSettings({write: {delay}})} format={v => `${(v / 1000).toLocaleString('tr', {minimumFractionDigits: 1, maximumFractionDigits: 2})} sn`} />
      </section>

      <section className="card card-pad settings-section">
        <h2><Type size={20} /> Yazı tipleri</h2>
        <p className="muted small">Hazır yazı tipleri Türkçe karakterleri destekler. Yüklediğin yazı tipleri hesabına kaydedilir ve diğer cihazlarında da görünür.</p>
        <FontManager />
      </section>

      <section className="card card-pad settings-section">
        <h2>Uygulama</h2>
        {standalone ? <p className="muted small">Kalemlik uygulama olarak yüklü.</p>
          : canInstall ? <Button icon={<Download size={18} />} onClick={async () => { await deferredInstall?.prompt(); deferredInstall = null; setCanInstall(false); }}>Cihaza uygulama olarak yükle</Button>
          : <p className="muted small">Uygulama olarak yüklemek için: iPad/iPhone'da Safari → Paylaş → <b>Ana Ekrana Ekle</b>; Android/Chrome'da menü → <b>Uygulamayı yükle</b>; Windows/Mac'te adres çubuğundaki yükle simgesi.</p>}
        <Button variant="ghost" className="danger-text" icon={<Trash2 size={18} />} onClick={() => void clearDevice()}>Bu cihazdaki çevrimdışı verileri temizle</Button>
        <p className="muted small">Sürüm {__APP_VERSION__}{config && config.version !== __APP_VERSION__ ? ` · sunucu ${config.version} (sayfayı yenile)` : ''}</p>
      </section>
    </div>
  );
}
