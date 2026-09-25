import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Circle, Diamond, Eraser, Hand, Hexagon, Lasso, Minus, RectangleHorizontal, Square, Star, Sticker, Triangle, Type, BoxSelect, Shapes} from 'lucide-react';
import type {PenId, ShapeId} from '@/lib/constants';
import {HIGHLIGHT_COLORS, INK_COLORS} from '@/lib/constants';
import type {PageContent, UserSettings} from '@/lib/types';
import {ColorPicker, Field, Popover, Segmented, Slider, Button, Switch} from '@/components/ui';
import {rememberColor, updatePen, updateSettings} from '@/lib/settings';
import {PENS, SHAPES, drawStroke, penInfo} from './ink';
import {TemplatePicker} from './TemplatePicker';
import {DEFAULT_LINE_COLOR, DEFAULT_PAPER_COLOR, DEFAULT_TEXT_COLOR, paperInfo, spacingOf} from './paper';
import {allFonts, fontStack} from '@/features/fonts/fonts';
import {WRITE_MODES} from '@/features/account/SettingsPage';
import type {Tool} from './types';

/** Kalem rafındaki her kalem kendi biçiminde ve kendi mürekkep renginde çizilir. */
export function PenIcon({pen, color, size = 40}: {pen: PenId; color: string; size?: number}) {
  const body = '#e9e4da', dark = '#3a4150';
  const tips: Record<PenId, React.ReactNode> = {
    ballpoint: <><path d="M14 30 L20 44 L26 30 Z" fill={body} /><path d="M18.5 40 L20 44 L21.5 40 Z" fill={color} /></>,
    fountain: <><path d="M13 29 C13 36 18 40 20 45 C22 40 27 36 27 29 Z" fill={color} /><path d="M20 33 V42" stroke="#fff" strokeWidth="1" /><circle cx="20" cy="33" r="1.4" fill="#fff" /></>,
    pencil: <><path d="M13 30 L20 45 L27 30 Z" fill="#e8c9a0" /><path d="M17.6 40 L20 45 L22.4 40 Z" fill={color} /></>,
    fineliner: <><path d="M15 30 L18.5 38 L21.5 38 L25 30 Z" fill={body} /><rect x="19" y="38" width="2" height="7" fill={color} /></>,
    brush: <><path d="M15 29 H25 V32 H15 Z" fill="#b7b2a8" /><path d="M15.5 32 C15 38 18 42 20 46 C22 42 25 38 24.5 32 Z" fill={color} /></>,
    marker: <><path d="M13 29 H27 L25 36 H15 Z" fill={body} /><path d="M16 36 H24 L23 43 L17 41 Z" fill={color} /></>,
    highlighter: <><path d="M12 29 H28 L26 36 H14 Z" fill={body} /><path d="M15 36 H25 L25 42 L15 39 Z" fill={color} /></>,
  };
  const barrel = pen === 'marker' || pen === 'highlighter' ? 16 : pen === 'brush' ? 10 : 12;
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden className="pen-icon">
      <rect x={20 - barrel / 2} y="0" width={barrel} height="30" rx="3" fill={pen === 'pencil' ? '#f2b84b' : pen === 'highlighter' ? color : dark} opacity={pen === 'highlighter' ? 0.85 : 1} />
      {pen !== 'pencil' && pen !== 'highlighter' && <rect x={20 - barrel / 2} y="4" width={barrel} height="4" fill={color} />}
      {tips[pen]}
    </svg>
  );
}

/** Kalem türünün gerçek çizgi örneği (seçim panelinde). */
function PenSample({pen, s}: {pen: PenId; s: UserSettings['pens'][PenId]}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, dpr = window.devicePixelRatio || 1;
    c.width = 180 * dpr; c.height = 36 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const pts: number[] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(10 + t * 160, 18 + Math.sin(t * Math.PI * 2) * 9, 0.35 + 0.6 * Math.sin(t * Math.PI)); }
    drawStroke(ctx, {id: 's', t: 'pen', pen, c: s.color, w: Math.min(s.width, 16), o: s.opacity, pts});
  }, [pen, s.color, s.width, s.opacity]);
  return <canvas ref={ref} style={{width: 180, height: 36}} aria-hidden />;
}

export function PenPanel({settings, pen}: {settings: UserSettings; pen: PenId}) {
  const s = settings.pens[pen], info = penInfo(pen);
  const swatches = pen === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS;
  return (
    <div className="panel pen-panel">
      <div className="pen-types" role="radiogroup" aria-label="Kalem türü">
        {PENS.map(p => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === pen} className={`pen-type ${p.id === pen ? 'is-on' : ''}`} onClick={() => updateSettings({activePen: p.id})}>
            <PenIcon pen={p.id} color={settings.pens[p.id].color} size={22} />
            <span><strong>{p.name}</strong><small>{p.hint}</small></span>
          </button>
        ))}
      </div>
      <div className="stack">
        <PenSample pen={pen} s={s} />
        <Slider label="Kalınlık" value={s.width} min={info.min} max={info.max} step={0.1} onChange={width => updatePen(pen, {width})} format={v => v.toFixed(1)} />
        <Slider label="Opaklık" value={s.opacity} min={0.1} max={1} step={0.05} onChange={opacity => updatePen(pen, {opacity})} format={v => `%${Math.round(v * 100)}`} />
        <ColorPicker value={s.color} swatches={swatches} recent={settings.recentColors} onChange={color => { updatePen(pen, {color}); rememberColor(color); }} />
      </div>
    </div>
  );
}

export function EraserPanel({settings}: {settings: UserSettings}) {
  return (
    <div className="panel stack" style={{width: 260}}>
      <Segmented label="Silgi türü" value={settings.eraser.mode} onChange={mode => updateSettings({eraser: {mode}})} options={[{value: 'partial', label: 'Kısmi'}, {value: 'stroke', label: 'Çizgi'}]} />
      <p className="muted small">{settings.eraser.mode === 'partial' ? 'Yalnızca silginin değdiği yer silinir.' : 'Değdiği çizginin tamamı silinir.'}</p>
      <Slider label="Silgi boyutu" value={settings.eraser.size} min={6} max={90} onChange={size => updateSettings({eraser: {size}})} />
    </div>
  );
}

const SHAPE_ICONS: Record<ShapeId, React.ReactNode> = {
  line: <Minus size={20} />, arrow: <ArrowRight size={20} />, square: <Square size={20} />, rectangle: <RectangleHorizontal size={20} />, circle: <Circle size={20} />,
  ellipse: <Circle size={20} style={{transform: 'scaleX(1.35)'}} />, triangle: <Triangle size={20} />, diamond: <Diamond size={20} />, hexagon: <Hexagon size={20} />, star: <Star size={20} />,
};
export function ShapePanel({settings, onPick}: {settings: UserSettings; onPick: () => void}) {
  return (
    <div className="panel shape-grid" role="radiogroup" aria-label="Şekil">
      {SHAPES.map(s => <button key={s.id} type="button" role="radio" aria-checked={settings.shape === s.id} className={settings.shape === s.id ? 'is-on' : ''} onClick={() => { updateSettings({shape: s.id}); onPick(); }}>{SHAPE_ICONS[s.id]}<span>{s.name}</span></button>)}
      <p className="muted small" style={{gridColumn: '1 / -1'}}>Sürükleyerek çiz. Renk ve kalınlık seçili kalemden alınır.</p>
    </div>
  );
}

export function TemplatePanel({content, onChange, onApplyAll}: {content: PageContent; onChange: (patch: Partial<PageContent>) => void; onApplyAll: () => void}) {
  const [tab, setTab] = useState<'template' | 'colors'>('template');
  const lineLabel = ['grid', 'grid-small', 'grid-large', 'engineering', 'coordinate', 'cornell-grid'].includes(content.template) ? 'Kare rengi' : content.template.includes('dotted') ? 'Nokta rengi' : 'Çizgi rengi';
  return (
    <div className="panel template-panel">
      <Segmented label="Sayfa" value={tab} onChange={setTab} options={[{value: 'template', label: 'Şablon'}, {value: 'colors', label: 'Renk & aralık'}]} />
      {tab === 'template' ? (
        <TemplatePicker value={content.template} paperColor={content.paperColor} lineColor={content.lineColor} onChange={template => onChange({template, spacing: undefined})} />
      ) : (
        <div className="stack">
          <Field label="Zemin rengi"><ColorPicker value={content.paperColor || DEFAULT_PAPER_COLOR} onChange={paperColor => onChange({paperColor})} swatches={['#ffffff', '#fbf8f1', '#f6f0e1', '#eef5ee', '#eef3fb', '#fdf0f3', '#1e2430', '#10151d']} /></Field>
          <Field label={lineLabel}><ColorPicker value={content.lineColor || DEFAULT_LINE_COLOR} onChange={lineColor => onChange({lineColor})} swatches={['#c9d6e8', '#e2c9c9', '#c9e2d0', '#d6d0e8', '#cfcfcf', '#8aa2c8', '#3a4a66']} /></Field>
          <Field label="Şablon yazı rengi"><ColorPicker value={content.textColor || DEFAULT_TEXT_COLOR} onChange={textColor => onChange({textColor})} swatches={['#7b8aa3', '#a07b7b', '#6f9a7c', '#555555', '#c0c8d4']} /></Field>
          <Slider label="Çizgi / kare aralığı" value={spacingOf(content)} min={10} max={80} onChange={spacing => onChange({spacing})} format={v => `${v}${v === paperInfo(content.template).spacing ? ' (varsayılan)' : ''}`} />
          <div className="row wrap">
            <Button size="sm" variant="ghost" onClick={() => onChange({paperColor: undefined, lineColor: undefined, textColor: undefined, spacing: undefined})}>Varsayılana dön</Button>
            <Button size="sm" onClick={onApplyAll}>Tüm sayfalara uygula</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WritePanel({settings, ocrEnabled}: {settings: UserSettings; ocrEnabled: boolean}) {
  const w = settings.write;
  return (
    <div className="panel stack" style={{width: 300}}>
      <div className="field"><label>Otomatik yazı düzeltme</label><Segmented label="Kip" value={w.mode} onChange={mode => updateSettings({write: {mode}})} options={WRITE_MODES} /></div>
      <p className="muted small">{w.mode === 'off' ? 'Yazın olduğu gibi kalır.' : w.mode === 'word' ? 'Her kelimeden sonra kısa bir duraksamada düzeltir.' : 'Cümleyi bitirip biraz durduğunda düzeltir.'} Yazarken hiçbir şey kaymaz; geri al tek adımda eski hâline döndürür.</p>
      <Field label="Yazı" htmlFor="wp-font">
        <select id="wp-font" className="select" value={w.font} onChange={e => updateSettings({write: {font: e.target.value}})}>
          <option value="own">Kendi el yazım (cihazda, internetsiz)</option>
          {allFonts().map(f => <option key={f.id} value={f.id} disabled={!ocrEnabled}>{f.name}{ocrEnabled ? '' : ' — tanıma kapalı'}</option>)}
        </select>
      </Field>
      {w.font !== 'own' && <p className="write-preview" style={{fontFamily: fontStack(w.font), fontWeight: w.weight * 100, letterSpacing: w.spacing * 0.5}}>Çiğdem ağaçta şarkı söylüyor</p>}
      <Slider label="Boyut" value={w.size} min={0.6} max={1.3} step={0.05} onChange={size => updateSettings({write: {size}})} format={v => `%${Math.round(v * 100)}`} />
      <Slider label="Kalınlık" value={w.weight} min={1} max={9} onChange={weight => updateSettings({write: {weight}})} />
      <Slider label="Harf aralığı" value={w.spacing} min={-3} max={12} onChange={spacing => updateSettings({write: {spacing}})} />
      <Slider label="Bekleme" value={w.delay} min={200} max={1500} step={50} onChange={delay => updateSettings({write: {delay}})} format={v => `${(v / 1000).toFixed(2).replace('.', ',')} sn`} />
    </div>
  );
}

export function ViewPanel({settings}: {settings: UserSettings}) {
  return (
    <div className="panel stack" style={{width: 300}}>
      <Switch label="Yalnızca kalem" description="Parmak ve avuç içi çizmez; iki parmakla kaydır/yakınlaştır." checked={settings.penOnly} onChange={penOnly => updateSettings({penOnly})} />
      <Switch label="Yakınlaştırma kilidi" description="Sıkıştırma, Ctrl + tekerlek ve +/− kapalı. Kaydırma çalışır." checked={settings.zoomLock} onChange={zoomLock => updateSettings({zoomLock})} />
      <div className="field"><label>Kalem çubuğu</label><Segmented label="Kalem çubuğu konumu" value={settings.railSide} onChange={railSide => updateSettings({railSide})} options={[{value: 'left', label: 'Solda'}, {value: 'right', label: 'Sağda'}]} /></div>
    </div>
  );
}

// ---------------------------------------------------------------- kalem rafı

interface RailProps {
  tool: Tool;
  settings: UserSettings;
  onTool(t: Tool): void;
  onSticker(): void;
  disabled: boolean;
  side: 'left' | 'right';
}

export function ToolRail({tool, settings, onTool, onSticker, disabled, side}: RailProps) {
  const [panel, setPanel] = useState<{kind: 'pen' | 'eraser' | 'shape'; anchor: HTMLElement} | null>(null);
  const placement = window.innerWidth < 700 ? 'top' : side === 'left' ? 'right' : 'left';
  const click = (e: React.MouseEvent<HTMLButtonElement>, t: Tool, kind?: 'pen' | 'eraser' | 'shape', pen?: PenId) => {
    const target = e.currentTarget;
    const already = tool === t && (!pen || settings.activePen === pen);
    if (pen) updateSettings({activePen: pen});
    onTool(t);
    if (kind && (already || kind === 'shape')) setPanel(panel ? null : {kind, anchor: target});
    else setPanel(null);
  };
  return (
    <nav className={`rail rail-${side} ${disabled ? 'is-disabled' : ''}`} aria-label="Kalemler ve araçlar">
      <div className="rail-pens">
        {PENS.map(p => (
          <button key={p.id} type="button" className={`rail-pen ${tool === 'pen' && settings.activePen === p.id ? 'is-on' : ''}`} aria-pressed={tool === 'pen' && settings.activePen === p.id}
            aria-label={`${p.name}${tool === 'pen' && settings.activePen === p.id ? ' (ayarlar için tekrar dokun)' : ''}`} title={p.name} disabled={disabled}
            onClick={e => click(e, 'pen', 'pen', p.id)}>
            <PenIcon pen={p.id} color={settings.pens[p.id].color} size={32} />
          </button>
        ))}
      </div>
      <div className="rail-sep" />
      <div className="rail-tools">
        <button type="button" className={`rail-tool ${tool === 'eraser' ? 'is-on' : ''}`} aria-pressed={tool === 'eraser'} aria-label="Silgi" title="Silgi (E)" disabled={disabled} onClick={e => click(e, 'eraser', 'eraser')}><Eraser size={22} /></button>
        <button type="button" className={`rail-tool ${tool === 'select' ? 'is-on' : ''}`} aria-pressed={tool === 'select'} aria-label="Alan seç" title="Alan seç (V)" onClick={e => click(e, 'select')}><BoxSelect size={22} /></button>
        <button type="button" className={`rail-tool ${tool === 'lasso' ? 'is-on' : ''}`} aria-pressed={tool === 'lasso'} aria-label="Kement" title="Kement (L)" disabled={disabled} onClick={e => click(e, 'lasso')}><Lasso size={22} /></button>
        <button type="button" className={`rail-tool ${tool === 'text' ? 'is-on' : ''}`} aria-pressed={tool === 'text'} aria-label="Metin" title="Metin (T)" disabled={disabled} onClick={e => click(e, 'text')}><Type size={22} /></button>
        <button type="button" className={`rail-tool ${tool === 'shape' ? 'is-on' : ''}`} aria-pressed={tool === 'shape'} aria-label="Şekiller" title="Şekiller" disabled={disabled} onClick={e => click(e, 'shape', 'shape')}><Shapes size={22} /></button>
        <button type="button" className="rail-tool" aria-label="Sticker ekle" title="Sticker" disabled={disabled} onClick={onSticker}><Sticker size={22} /></button>
        <button type="button" className={`rail-tool ${tool === 'hand' ? 'is-on' : ''}`} aria-pressed={tool === 'hand'} aria-label="Sayfayı kaydır" title="Sayfayı kaydır (H)" onClick={e => click(e, 'hand')}><Hand size={22} /></button>
      </div>
      <Popover anchor={panel?.anchor || null} open={!!panel} onClose={() => setPanel(null)} placement={placement} label={panel?.kind === 'pen' ? 'Kalem ayarları' : panel?.kind === 'eraser' ? 'Silgi ayarları' : 'Şekiller'}>
        {panel?.kind === 'pen' && <PenPanel settings={settings} pen={settings.activePen} />}
        {panel?.kind === 'eraser' && <EraserPanel settings={settings} />}
        {panel?.kind === 'shape' && <ShapePanel settings={settings} onPick={() => setPanel(null)} />}
      </Popover>
    </nav>
  );
}
