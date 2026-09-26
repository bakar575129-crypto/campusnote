import {useEffect, useRef, useState} from 'react';
import {ImagePlus, Trash2, Wand2} from 'lucide-react';
import {Button, Dialog, EmptyState, Field, Segmented, Slider, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {put, remove, useList} from '@/lib/store';
import {saveFile} from '@/lib/files';
import {uuid} from '@/lib/ids';
import {useFileUrl} from '@/lib/useFile';
import type {StickerAsset} from '@/lib/types';
import {renderSticker, type StickerEdit, type StickerShape} from './stickerImage';
import {BUILTIN_CATEGORIES, BUILTIN_STICKERS, builtinUrl} from './builtin';
import type {PlaceSource} from './PlacedLayer';

const CORNERS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Fotoğraftan sticker oluşturma: kırp, şekil ver, arka planı temizle, arşive kaydet. */
export function StickerStudio({open, onClose, onCreated}: {open: boolean; onClose: () => void; onCreated?: (s: StickerAsset) => void}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<StickerEdit>({shape: 'original', zoom: 1, panX: 0.5, panY: 0.5, removeBg: false, tolerance: 38, seeds: CORNERS, outline: false});
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => { if (!open) { setImg(null); setName(''); setEdit(e => ({...e, zoom: 1, panX: .5, panY: .5, removeBg: false, seeds: CORNERS, outline: false, shape: 'original'})); } }, [open]);
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const c = renderSticker(img, edit, 420);
      setPreviewUrl(c.toDataURL('image/png'));
    }, 60);
    return () => clearTimeout(t);
  }, [img, edit]);

  const pick = (file: File) => {
    if (!/^image\//.test(file.type)) { toast('Bir fotoğraf seç (PNG, JPG, WEBP, HEIC desteklenirse).', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { toast('Fotoğraf 25 MB’den küçük olmalı.', 'error'); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setName(file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Sticker'); };
    im.onerror = () => toast('Bu fotoğraf açılamadı.', 'error');
    im.src = url;
  };

  /** Önizlemeye dokunulan nokta "arka plan rengi" olur. */
  const pickSeed = (e: React.PointerEvent) => {
    if (!edit.removeBg || !preview.current) return;
    const imgEl = preview.current.querySelector('img');
    if (!imgEl) return;
    const r = imgEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    setEdit({...edit, seeds: [...edit.seeds, [x, y]]});
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = renderSticker(img, edit, 720);
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Sticker oluşturulamadı.'))), 'image/png'));
      const fileId = await saveFile(blob, 'sticker', `${name || 'sticker'}.png`);
      const asset = put('sticker', {id: uuid(), fileId, name: name.trim() || 'Sticker', width: canvas.width, height: canvas.height});
      toast('Sticker arşivine eklendi.', 'success');
      onCreated?.(asset);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sticker kaydedilemedi.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Fotoğraftan sticker oluştur" size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" disabled={!img} busy={busy} onClick={() => void save()}>Arşive kaydet</Button></>}>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
      {!img ? (
        <button type="button" className="drop-zone" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); }}>
          <ImagePlus size={36} />
          <strong>Fotoğraf seç</strong>
          <span className="muted">Galeriden, kameradan ya da sürükleyip bırakarak. Fotoğraf yalnızca senin arşivine kaydedilir.</span>
        </button>
      ) : (
        <div className="sticker-studio">
          <div ref={preview} className={`sticker-preview ${edit.removeBg ? 'is-picking' : ''}`} onPointerDown={pickSeed}>
            {previewUrl && <img src={previewUrl} alt="Sticker önizlemesi" draggable={false} />}
          </div>
          <div className="stack">
            <Field label="Ad" htmlFor="st-name"><input id="st-name" className="input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></Field>
            <div className="field"><label>Şekil</label>
              <Segmented label="Şekil" size="sm" value={edit.shape} onChange={(shape: StickerShape) => setEdit({...edit, shape})} options={[{value: 'original', label: 'Orijinal'}, {value: 'square', label: 'Kare'}, {value: 'circle', label: 'Daire'}, {value: 'rounded', label: 'Yuvarlak köşe'}]} />
            </div>
            <Slider label="Yakınlaştır / kırp" value={edit.zoom} min={1} max={4} step={0.05} onChange={zoom => setEdit({...edit, zoom})} format={v => `${v.toFixed(1)}×`} />
            {edit.zoom > 1.01 && <>
              <Slider label="Yatay konum" value={edit.panX} min={0} max={1} step={0.01} onChange={panX => setEdit({...edit, panX})} format={v => `${Math.round(v * 100)}%`} />
              <Slider label="Dikey konum" value={edit.panY} min={0} max={1} step={0.01} onChange={panY => setEdit({...edit, panY})} format={v => `${Math.round(v * 100)}%`} />
            </>}
            <Switch label="Arka planı kaldır" description="Düz veya sade arka planlarda çalışır. Kalan arka plana önizlemede dokunarak onu da temizle." checked={edit.removeBg} onChange={removeBg => setEdit({...edit, removeBg, seeds: CORNERS})} />
            {edit.removeBg && <>
              <Slider label="Hassasiyet" value={edit.tolerance} min={5} max={120} onChange={tolerance => setEdit({...edit, tolerance})} />
              <Button size="sm" variant="ghost" icon={<Wand2 size={16} />} onClick={() => setEdit({...edit, seeds: CORNERS})}>Seçilen noktaları sıfırla</Button>
            </>}
            <Switch label="Beyaz kenar" description="Kesilmiş sticker görünümü" checked={edit.outline} onChange={outline => setEdit({...edit, outline})} />
            <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>Başka fotoğraf seç</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function StickerTile({s, onPick, manage}: {s: StickerAsset; onPick?: (s: StickerAsset) => void; manage?: boolean}) {
  const url = useFileUrl(s.fileId);
  return (
    <div className="sticker-tile">
      <button type="button" className="sticker-thumb" onClick={() => onPick?.(s)} aria-label={`${s.name} stickerını ekle`} disabled={!onPick}>{url ? <img src={url} alt="" /> : <span className="spinner" />}</button>
      <span className="sticker-name" title={s.name}>{s.name}</span>
      {manage && <button type="button" className="icon-btn icon-btn-sm sticker-del" aria-label={`${s.name} stickerını sil`} onClick={async () => {
        if (await confirmDialog({title: 'Sticker silinsin mi?', message: 'Arşivden kaldırılır. Sayfalarda kullandığın kopyalar yerinde kalır.', confirmLabel: 'Sil', danger: true})) remove('sticker', s.id);
      }}><Trash2 size={15} /></button>}
    </div>
  );
}

/** Sticker seçici: uygulamayla gelen sevimli stickerlar ve kişisel arşiv (fotoğraftan oluşturulanlar). */
export function StickerLibrary({open, onClose, onPick}: {open: boolean; onClose: () => void; onPick: (s: PlaceSource) => void}) {
  const stickers = useList('sticker').slice().sort((a, b) => b.createdAt - a.createdAt);
  const [studio, setStudio] = useState(false);
  const [manage, setManage] = useState(false);
  const [tab, setTab] = useState<string>(BUILTIN_CATEGORIES[0]);
  const pick = (s: PlaceSource) => { onPick(s); onClose(); };
  return (
    <>
      <Dialog open={open && !studio} onClose={onClose} title="Stickerlar" size="lg"
        footer={<>{tab === 'mine' && stickers.length > 0 && <Button variant="ghost" onClick={() => setManage(!manage)}>{manage ? 'Bitti' : 'Düzenle'}</Button>}<span className="spacer" /><Button variant="primary" icon={<ImagePlus size={18} />} onClick={() => setStudio(true)}>Fotoğraftan oluştur</Button></>}>
        <div className="sticker-tabs" role="tablist" aria-label="Sticker grupları">
          {BUILTIN_CATEGORIES.map(c => <button key={c} type="button" role="tab" aria-selected={tab === c} className={tab === c ? 'is-on' : ''} onClick={() => setTab(c)}>{c}</button>)}
          <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-on' : ''} onClick={() => setTab('mine')}>Arşivim{stickers.length ? ` (${stickers.length})` : ''}</button>
        </div>
        {tab !== 'mine' ? (
          <div className="sticker-grid">
            {BUILTIN_STICKERS.filter(b => b.category === tab).map(b => (
              <div key={b.id} className="sticker-tile">
                <button type="button" className={`sticker-thumb is-builtin ${b.category === 'Bloknotlar' ? 'is-pad' : ''}`} onClick={() => pick({builtin: b.id, width: b.w || 120, height: b.h || 120})} aria-label={`${b.name} stickerını ekle`}><img src={builtinUrl(b.id)} alt="" /></button>
                <span className="sticker-name">{b.name}</span>
              </div>
            ))}
          </div>
        ) : stickers.length ? (
          <div className="sticker-grid">{stickers.map(s => <StickerTile key={s.id} s={s} manage={manage} onPick={manage ? undefined : st => pick(st)} />)}</div>
        ) : (
          <EmptyState icon={<ImagePlus size={28} />} title="Arşivin boş">Kendi fotoğraflarından sticker oluştur; hem sayfalarda hem kapakta kullanabilirsin.</EmptyState>
        )}
      </Dialog>
      <StickerStudio open={studio} onClose={() => setStudio(false)} onCreated={s => pick(s)} />
    </>
  );
}
