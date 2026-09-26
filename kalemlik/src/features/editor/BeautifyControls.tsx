// Akıllı Yazı Güzelleştirme ayarları: editör paneli ve Ayarlar sayfası aynı bileşeni kullanır.
import {Field, Segmented, Switch} from '@/components/ui';
import {updateSettings} from '@/lib/settings';
import type {UserSettings} from '@/lib/types';
import {allFonts, fontStack} from '@/features/fonts/fonts';
import {BEAUTIFY_SPEEDS, RECOGNITION_LANGS} from './beautify';

export function BeautifyControls({settings, ocrEnabled, idPrefix = 'bw'}: {settings: UserSettings; ocrEnabled: boolean; idPrefix?: string}) {
  const w = settings.write;
  const on = w.mode === 'beautify';
  return (
    <div className="stack">
      <Switch label="Akıllı Yazı Güzelleştirme" checked={on} onChange={v => updateSettings({write: {mode: v ? 'beautify' : 'off'}})}
        description={on ? 'Yazdığın kelime bittiğinde tanınır ve aynı yerde seçtiğin yazı tipiyle gösterilir. Kelimeler ve anlam değişmez; emin olunamazsa el yazın olduğu gibi kalır.' : 'Kapalı: yalnızca kendi el yazınla yazarsın, yazına hiç dokunulmaz.'} />
      {on && <>
        <Field label="Yazı tipi" htmlFor={`${idPrefix}-font`}>
          <select id={`${idPrefix}-font`} className="select" value={w.font} onChange={e => updateSettings({write: {font: e.target.value}})}>
            {allFonts().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <p className="write-preview" style={{fontFamily: fontStack(w.font)}}>Matematik sınavı cuma günü</p>
        <div className="field"><label>Kelime bitti sayma süresi</label>
          <Segmented label="Hız" value={String(w.delay)} onChange={v => updateSettings({write: {delay: Number(v)}})}
            options={BEAUTIFY_SPEEDS.map(s => ({value: String(s.value), label: `${s.label} · ${s.value} ms`}))} />
        </div>
        <p className="muted small">Kalemi kaldırdıktan sonra bu kadar beklenir; kalemi bir sonraki kelimeye götürdüğünde hemen dönüşür. Kalem yazının yanında havada dururken beklenir.</p>
        <div className="field"><label>Dil</label>
          <Segmented label="Tanıma dili" value={w.lang} onChange={lang => updateSettings({write: {lang}})} options={RECOGNITION_LANGS.map(l => ({value: l.id, label: l.label}))} />
        </div>
        <div className="field"><label>Tanıma</label>
          <Segmented label="Tanıma motoru" value={w.engine} onChange={engine => updateSettings({write: {engine}})} options={[{value: 'auto', label: 'Otomatik (sunucu + cihaz)'}, {value: 'device', label: 'Yalnızca cihazda'}]} />
        </div>
        <p className="muted small">{w.engine === 'device' || !ocrEnabled ? 'Yazın bu cihazda, internetsiz tanınır. En iyi sonuç için harfleri net yaz.' : 'Önce sunucudaki el yazısı tanıma denenir (Türkçe için en iyisi), olmazsa cihazda tanınır.'} Geri al (↶) dönüşümü tek adımda el yazısına çevirir.</p>
      </>}
    </div>
  );
}
