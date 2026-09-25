import {useEffect, useState} from 'react';
import {ImagePlus} from 'lucide-react';
import type {Cover, Notebook} from '@/lib/types';
import {COVER_PATTERNS, PAGE_H, PAGE_W, PALETTE} from '@/lib/constants';
import {Button, ColorPicker, Dialog, Field, Slider, Switch} from '@/components/ui';
import {toast} from '@/components/feedback';
import {get, update} from '@/lib/store';
import {shortId} from '@/lib/ids';
import {allFonts} from '@/features/fonts/fonts';
import {PlacedLayer, placeSticker} from '@/features/stickers/PlacedLayer';
import {StickerLibrary} from '@/features/stickers/StickerDialogs';
import {CoverView} from './CoverView';
import {COVER_PATTERN_NAMES, coverPatternUrl, coverTextColor, isCutePattern} from './cover';
import type {CoverPattern} from '@/lib/constants';

const clampPlaced = <T extends {x: number; y: number; w: number; h: number}>(p: T): T => ({...p, x: Math.max(-p.w / 2, Math.min(PAGE_W - p.w / 2, p.x)), y: Math.max(-p.h / 2, Math.min(PAGE_H - p.h / 2, p.y))});

/** Kapak tasarımı: renk, desen, yazılar ve stickerlar. */
export function CoverEditor({notebookId, open, onClose}: {notebookId: string; open: boolean; onClose: () => void}) {
  const nb = get('notebook', notebookId);
  const [draft, setDraft] = useState<{color: string; cover: Cover} | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  useEffect(() => { if (open && nb) setDraft({color: nb.color, cover: structuredClone(nb.cover)}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!nb || !draft) return null;
  const cover = draft.cover;
  const set = (patch: Partial<Cover>) => setDraft({...draft, cover: {...cover, ...patch}});
  const preview: Notebook = {...nb, color: draft.color, cover};
  const save = () => { update('notebook', nb.id, {color: draft.color, cover}); toast('Kapak kaydedildi.', 'success'); onClose(); };

  return (
    <>
      <Dialog open={open && !library} onClose={onClose} title="Kapağı tasarla" size="xl" footer={<><Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={save}>Kapağı kaydet</Button></>}>
        <div className="cover-editor">
          <div className="cover-editor-stage">
            <CoverView nb={preview} stickers={false} className="cover-lg">
              <PlacedLayer items={cover.stickers} pageW={PAGE_W} pageH={PAGE_H} selectedId={selected} interactive onSelect={setSelected}
                onChange={p => set({stickers: cover.stickers.map(s => (s.id === p.id ? clampPlaced(p) : s))})}
                onDuplicate={p => { if (cover.stickers.length >= 20) { toast('Kapağa en fazla 20 sticker eklenebilir.', 'error'); return; } const c = {...p, id: shortId(), x: p.x + 30, y: p.y + 30}; set({stickers: [...cover.stickers, c]}); setSelected(c.id); }}
                onDelete={p => { set({stickers: cover.stickers.filter(s => s.id !== p.id)}); setSelected(null); }}
                onFront={p => set({stickers: [...cover.stickers.filter(s => s.id !== p.id), p]})} />
            </CoverView>
            <Button icon={<ImagePlus size={18} />} onClick={() => { if (cover.stickers.length >= 20) toast('Kapağa en fazla 20 sticker eklenebilir.', 'error'); else setLibrary(true); }}>Sticker ekle</Button>
          </div>
          <div className="cover-editor-controls stack">
            <Field label="Kapak rengi"><ColorPicker value={draft.color} onChange={color => setDraft({...draft, color})} swatches={PALETTE} /></Field>
            {([['Sevimli desenler', COVER_PATTERNS.filter(isCutePattern)], ['Sade desenler', COVER_PATTERNS.filter(p => !isCutePattern(p))]] as [string, CoverPattern[]][]).map(([title, list]) => (
              <div className="field" key={title}>
                <label>{title}</label>
                <div className="pattern-grid" role="radiogroup" aria-label={title}>
                  {list.map(p => (
                    <button key={p} type="button" role="radio" aria-checked={cover.pattern === p} className={`pattern-item ${cover.pattern === p ? 'is-on' : ''}`}
                      onClick={() => set(isCutePattern(p) && !isCutePattern(cover.pattern) ? {pattern: p, patternOpacity: 1, patternSize: 9} : !isCutePattern(p) && isCutePattern(cover.pattern) ? {pattern: p, patternOpacity: 0.18, patternSize: 5} : {pattern: p})}>
                      <span className="pattern-swatch" style={{background: draft.color, backgroundImage: coverPatternUrl({...cover, pattern: p, patternOpacity: isCutePattern(p) ? 1 : Math.max(0.35, cover.patternOpacity), patternSize: isCutePattern(p) ? 9 : cover.patternSize}, nb.paper, draft.color)}} />
                      <span>{COVER_PATTERN_NAMES[p]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {cover.pattern !== 'none' && <>
              <Slider label="Desen yoğunluğu" value={cover.patternOpacity} min={0.05} max={1} step={0.01} onChange={patternOpacity => set({patternOpacity})} format={v => `%${Math.round(v * 100)}`} />
              <Slider label="Desen boyutu" value={cover.patternSize} min={2} max={20} step={0.5} onChange={patternSize => set({patternSize})} />
              <Field label="Desen rengi"><ColorPicker value={cover.patternColor || coverTextColor(draft.color)} onChange={patternColor => set({patternColor})} swatches={['#ffffff', '#16202e', ...PALETTE.slice(0, 8)]} /></Field>
            </>}
            <Field label="Kapak yazı tipi" htmlFor="cv-font">
              <select id="cv-font" className="select" value={cover.font || 'nunito'} onChange={e => set({font: e.target.value})}>{allFonts().map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </Field>
            <Switch label="Ders adını göster" checked={cover.showCourse} onChange={showCourse => set({showCourse})} />
            <Switch label="Dönemi göster" checked={cover.showTerm} onChange={showTerm => set({showTerm})} />
            <Field label="Kapak notu" htmlFor="cv-label" hint="Kapağın altında görünür (ör. öğrenci no, grup, slogan)."><input id="cv-label" className="input" value={cover.label} maxLength={80} onChange={e => set({label: e.target.value})} /></Field>
            <Field label="Kapak notu rengi"><ColorPicker value={cover.textColor || coverTextColor(draft.color)} onChange={textColor => set({textColor})} swatches={['#ffffff', '#16202e', '#fde047', '#f9a8d4']} /></Field>
          </div>
        </div>
      </Dialog>
      <StickerLibrary open={library} onClose={() => setLibrary(false)} onPick={s => { const p = placeSticker(s, PAGE_W, PAGE_H, shortId()); set({stickers: [...cover.stickers, p]}); setSelected(p.id); }} />
    </>
  );
}
