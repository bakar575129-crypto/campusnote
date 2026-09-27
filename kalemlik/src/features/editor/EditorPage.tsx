import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {Target, Sparkles, ArrowLeft, ChevronDown, ImagePlus, ChevronLeft, ChevronRight, ChevronUp, ClipboardPaste, Copy, CopyPlus, Download, FileImage, FileUp, Info, Layers, LayoutTemplate, Lock, LockOpen, Maximize, MoreHorizontal, Palette, PenLine, Plus, Redo2, ScanText, Star, Trash2, Undo2, Wand2, ZoomIn, ZoomOut, X, MoveHorizontal, Settings2, Hand as HandIcon} from 'lucide-react';
import type {Page, PageContent, Placed, Stroke, TextBox} from '@/lib/types';
import {deviceOcrSupported, plausibleText, recognizeOnDevice, warmDeviceOcr} from './deviceOcr';
import {INK_COLORS} from '@/lib/constants';
import {navigate} from '@/app/router';
import {useSession} from '@/app/session';
import {SyncBadge} from '@/app/Shell';
import {Button, Dialog, Field, IconButton, Menu, Popover, type MenuItem} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {api} from '@/lib/api';
import {saveFile} from '@/lib/files';
import {get, loadNotebookPages, onStoreEvent, put, remove, update, useList, useRecord} from '@/lib/store';
import {useSettings} from '@/lib/settings';
import {shortId, uuid} from '@/lib/ids';
import {CoverView} from '@/features/notebooks/CoverView';
import {CoverEditor} from '@/features/notebooks/CoverEditor';
import {NotebookDialog} from '@/features/notebooks/NotebookDialog';
import {markOpened, toggleFavorite, trashNotebook} from '@/features/notebooks/actions';
import {StickerLibrary} from '@/features/stickers/StickerDialogs';
import {PlacedLayer, placeSticker} from '@/features/stickers/PlacedLayer';
import {ensureFont} from '@/features/fonts/fonts';
import {openGenerate} from '@/features/study/GenerateDialog';
import {History, type HistoryEntry, type PageSnap} from './history';
import {PageCanvas, textHeight, type CanvasHandle} from './PageCanvas';
import {TextLayer} from './TextLayer';
import {TemplatePanel, ToolRail, ViewPanel, WritePanel} from './Panels';
import {PagesPanel} from './PagesPanel';
import {cleanRecognized, consistentWithInk, hoveringNear, looksLikeWriting, movedAway, placeText, splitLines, strokesToPng} from './beautify';
import {drawStroke} from './ink';
import {inkBox, transformStroke} from './geometry';
import {writingGuide} from './paper';
import type {Selection, Tool, View} from './types';
import {emptySelection, hasSelection} from './types';

const byPosition = (a: Page, b: Page) => a.position - b.position || a.createdAt - b.createdAt;
const snap = (p: Page): PageSnap | null => (p.content ? {id: p.id, position: p.position, content: p.content} : null);

/**
 * Defterin ilk ekranı: kapak ve hemen altında ilk sayfa görünür. Aşağı kaydırınca (tekerlek, parmak, kalem)
 * doğrudan deftere geçilir; ayrıca "aç" düğmesine gerek yoktur.
 */
function CoverStage({nb, first, onEnter, onEditCover}: {nb: NonNullable<ReturnType<typeof get<'notebook'>>>; first?: Page; onEnter: () => void; onEditCover: () => void}) {
  const ref = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState('');
  const entered = useRef(false);
  useEffect(() => {
    let alive = true;
    if (first?.content) void import('./render').then(m => m.renderPage(first.content!, 0.5)).then(c => { if (alive) setPeek(c.toDataURL('image/jpeg', 0.8)); });
    return () => { alive = false; };
  }, [first?.content]);
  const enter = () => { if (!entered.current && first) { entered.current = true; onEnter(); } };
  return (
    <div ref={ref} className="cover-stage" onScroll={e => { const el = e.currentTarget; if (el.scrollTop > el.clientHeight * 0.45) enter(); }}
      onWheel={e => { if (e.deltaY > 0 && ref.current && ref.current.scrollTop + ref.current.clientHeight >= ref.current.scrollHeight - 4) enter(); }}>
      <div className="cover-top">
        <CoverView nb={nb} className="cover-open" />
        <Button size="sm" variant="ghost" icon={<Palette size={16} />} onClick={onEditCover}>Kapağı düzenle</Button>
      </div>
      {first && (
        <button type="button" className="cover-peek" onClick={enter} aria-label="İlk sayfaya geç">
          <span className="scroll-hint"><ChevronDown size={18} /> Kaydırarak deftere geç</span>
          <span className="page-peek" style={{aspectRatio: first.content ? `${first.content.width} / ${first.content.height}` : '1 / 1.414'}}>{peek && <img src={peek} alt="" />}</span>
        </button>
      )}
    </div>
  );
}

export default function EditorPage({id}: {id: string}) {
  const nb = useRecord('notebook', id);
  const allPages = useList('page');
  const pages = useMemo(() => allPages.filter(p => p.notebookId === id).sort(byPosition), [allPages, id]);
  const settings = useSettings();
  const {config} = useSession();
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0); // 0 = kapak
  const [tool, setTool] = useState<Tool>('pen');
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [activeText, setActiveText] = useState<string | null>(null);
  const [activeSticker, setActiveSticker] = useState<string | null>(null);
  const [dimIds, setDimIds] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>({zoom: 1, x: 0, y: 0});
  const [panel, setPanel] = useState<{kind: 'template' | 'write' | 'view' | 'color'; anchor: HTMLElement} | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [showPages, setShowPages] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [coverEdit, setCoverEdit] = useState(false);
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState('');
  const [convert, setConvert] = useState<{text: string; ids: string[]} | null>(null);
  const canvas = useRef<CanvasHandle>(null);
  const history = useRef(new History()).current;
  useSyncExternalStore(history.subscribe, history.getVersion);
  const clipboard = useRef<{strokes: Stroke[]; texts: TextBox[]} | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const page = index > 0 ? pages[index - 1] : undefined;
  const content = page?.content;

  // ------------------------------------------------------------ yükleme
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadNotebookPages(id).finally(() => { if (alive) setLoading(false); });
    markOpened(id);
    const off = onStoreEvent(e => { if (e.type === 'pages-updated' && e.notebookId === id) void loadNotebookPages(id, true); });
    return () => { alive = false; off(); };
  }, [id]);
  useEffect(() => { if (index > pages.length) setIndex(pages.length); }, [pages.length, index]);
  // Aramadan ya da paylaşımdan gelindiyse (?sayfa=<kimlik>) doğrudan o sayfa açılır.
  const wantPage = useRef(new URLSearchParams(location.search).get('sayfa'));
  useEffect(() => {
    if (!wantPage.current) return;
    const i = pages.findIndex(p => p.id === wantPage.current);
    if (i >= 0) { setIndex(i + 1); wantPage.current = null; }
  }, [pages]);
  useEffect(() => { setSelection(emptySelection); setActiveText(null); setActiveSticker(null); }, [index]);
  useEffect(() => { if (content) for (const f of new Set([...content.texts.map(t => t.font), ...content.strokes.flatMap(s => (s.run ? [s.run.font] : []))])) void ensureFont(f); }, [content]);

  // ------------------------------------------------------------ içerik değişiklikleri
  const latest = useCallback((pageId: string) => get('page', pageId), []);

  /** Geri alınabilir değişiklik. */
  const commit = useCallback((next: PageContent, pageId = page?.id) => {
    if (!pageId) return;
    const cur = latest(pageId);
    if (!cur?.content || cur.content === next) return;
    history.push({kind: 'content', pageId, before: cur.content, after: next});
    put('page', {...cur, content: next});
  }, [page?.id, latest, history]);

  // Metin yazma / sticker sürükleme gibi sürekli değişiklikler tek geri al adımı olur.
  const editStart = useRef<{pageId: string; before: PageContent} | null>(null);
  const beginEdit = useCallback(() => { if (page?.content && !editStart.current) editStart.current = {pageId: page.id, before: page.content}; }, [page]);
  const liveChange = useCallback((next: PageContent) => { const cur = page && latest(page.id); if (cur) put('page', {...cur, content: next}); }, [page, latest]);
  const endEdit = useCallback(() => {
    const s = editStart.current;
    editStart.current = null;
    if (!s) return;
    const cur = latest(s.pageId);
    if (cur?.content && cur.content !== s.before && JSON.stringify(cur.content) !== JSON.stringify(s.before)) history.push({kind: 'content', pageId: s.pageId, before: s.before, after: cur.content});
  }, [latest, history]);

  const applyEntry = useCallback((e: HistoryEntry, dir: 'undo' | 'redo') => {
    if (e.kind === 'content') {
      const cur = latest(e.pageId);
      if (!cur) { toast('Bu değişikliğin sayfası artık yok.', 'info'); return; }
      put('page', {...cur, content: dir === 'undo' ? e.before : e.after});
      const i = pages.findIndex(p => p.id === e.pageId);
      if (i >= 0 && i + 1 !== index) setIndex(i + 1);
    } else {
      for (const c of e.changes) {
        const target = dir === 'undo' ? c.before : c.after;
        if (!target) remove('page', c.id);
        else put('page', {id: c.id, notebookId: id, position: target.position, content: target.content});
      }
      setIndex(dir === 'undo' ? e.focusBefore : e.focusAfter);
    }
    setSelection(emptySelection);
  }, [latest, pages, index, id]);
  const undo = useCallback(() => { endEdit(); const e = history.undo(); if (e) applyEntry(e, 'undo'); }, [history, applyEntry, endEdit]);
  const redo = useCallback(() => { const e = history.redo(); if (e) applyEntry(e, 'redo'); }, [history, applyEntry]);

  // ------------------------------------------------------------ sayfa işlemleri
  const positionAfter = (i: number) => {
    const a = pages[i - 1], b = pages[i];
    if (!a) return (pages[0]?.position ?? 1) - 1;
    return b ? (a.position + b.position) / 2 : a.position + 1;
  };
  const addPage = useCallback((after = index, base?: PageContent) => {
    const ref = base || (pages[Math.max(0, after - 1)]?.content);
    const content: PageContent = base ? structuredClone(base) : {v: 1, template: ref?.template && !ref.background ? ref.template : nb?.paper || 'lined', width: 1000, height: 1414, paperColor: ref?.paperColor, lineColor: ref?.lineColor, textColor: ref?.textColor, spacing: ref?.spacing, strokes: [], texts: [], stickers: []};
    if (base) content.strokes = content.strokes.map(s => ({...s, id: shortId()}));
    const p = put('page', {id: uuid(), notebookId: id, position: positionAfter(after), content});
    history.push({kind: 'pages', changes: [{id: p.id, before: null, after: snap(p)}], focusBefore: index, focusAfter: after + 1});
    setIndex(after + 1);
  }, [index, pages, nb?.paper, id, history]); // eslint-disable-line react-hooks/exhaustive-deps
  const deletePage = useCallback(async (i = index) => {
    const p = pages[i - 1];
    if (!p || pages.length <= 1) { toast('Defterde en az bir sayfa olmalı.', 'info'); return; }
    const empty = p.content && !p.content.strokes.length && !p.content.texts.length && !p.content.stickers.length && !p.content.background;
    if (!empty && !(await confirmDialog({title: `Sayfa ${i} silinsin mi?`, message: 'Geri al ile geri getirebilirsin.', confirmLabel: 'Sil', danger: true}))) return;
    history.push({kind: 'pages', changes: [{id: p.id, before: snap(p), after: null}], focusBefore: i, focusAfter: Math.max(1, i - 1)});
    remove('page', p.id);
    setIndex(Math.max(1, Math.min(i, pages.length - 1)));
  }, [index, pages, history]);
  const movePage = useCallback((i: number, dir: -1 | 1) => {
    const a = pages[i - 1], b = pages[i - 1 + dir];
    if (!a || !b) return;
    history.push({kind: 'pages', changes: [{id: a.id, before: snap(a), after: a.content ? {...snap(a)!, position: b.position} : null}, {id: b.id, before: snap(b), after: b.content ? {...snap(b)!, position: a.position} : null}], focusBefore: i, focusAfter: i + dir});
    put('page', {...a, position: b.position});
    put('page', {...b, position: a.position});
    setIndex(i + dir);
  }, [pages, history]);

  const importPagesFrom = async (file: File, kind: 'pdf' | 'image') => {
    setBusy(kind === 'pdf' ? 'PDF hazırlanıyor…' : 'Fotoğraf hazırlanıyor…');
    try {
      const mod = await import('./pdf');
      const list = kind === 'pdf' ? await mod.importPdf(file, (d, t) => setBusy(`PDF sayfaları: ${d} / ${t}`)) : [await mod.importImagePage(file)];
      let after = Math.max(index, 0);
      const changes: {id: string; before: null; after: PageSnap | null}[] = [];
      let pos = positionAfter(after);
      const next = pages[after];
      const step = next ? (next.position - pos) / (list.length + 1) : 1;
      for (const c of list) { const p = put('page', {id: uuid(), notebookId: id, position: pos, content: c}); changes.push({id: p.id, before: null, after: snap(p)}); pos += step; }
      history.push({kind: 'pages', changes, focusBefore: index, focusAfter: after + 1});
      after += 1;
      setIndex(after);
      toast(kind === 'pdf' ? `${list.length} PDF sayfası eklendi.` : 'Fotoğraf sayfa olarak eklendi.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'İçe aktarılamadı.', 'error'); } finally { setBusy(''); }
  };
  const exportPdf = async () => {
    if (!nb) return;
    if (pages.some(p => !p.content)) { await loadNotebookPages(id, true); }
    const ready = pages.map(p => get('page', p.id)?.content).filter(Boolean) as PageContent[];
    if (ready.length < pages.length) { toast('Bazı sayfalar bu cihazda yok. İnternete bağlanıp tekrar dene.', 'error'); return; }
    setBusy('PDF oluşturuluyor…');
    try {
      const {exportPdf: run} = await import('./pdf');
      await run(nb, ready, {cover: true}, (d, t) => setBusy(`PDF oluşturuluyor: ${d} / ${t}`));
      toast('PDF indirildi.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'PDF oluşturulamadı.', 'error'); } finally { setBusy(''); }
  };

  // ------------------------------------------------------------ Akıllı Yazı Güzelleştirme
  // Kalemle yazılan kelime bittiğinde (kalem başka yere geçti ya da bekleme süresi doldu) tanınır ve aynı yere seçilen
  // yazı tipinde yerleştirilir. Emin olunamazsa el yazısına hiç dokunulmaz.
  const pending = useRef<{pageId: string; ids: string[]}>({pageId: '', ids: []});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeRef = useRef(settings.write);
  writeRef.current = settings.write;
  useEffect(() => { if (settings.write.mode === 'beautify' && (settings.write.engine === 'device' || !config?.ocrEnabled)) warmDeviceOcr(); }, [settings.write.mode, settings.write.engine, config?.ocrEnabled]);

  /**
   * El yazısını metne çevirir: önce sunucu (API anahtarı tanımlıysa), olmazsa ya da başarısız olursa cihazda
   * (internetsiz). İkisi de emin değilse hata döner ve el yazısı korunur.
   */
  const recognize = useCallback(async (strokes: Stroke[], mode: 'word' | 'block', engine: 'auto' | 'device' = 'auto', lang = 'tr'): Promise<{text: string} | {error: string}> => {
    const image = strokesToPng(strokes, (ctx, s) => drawStroke(ctx, s));
    if (!image) return {error: ''};
    let serverError = '';
    if (engine !== 'device' && config?.ocrEnabled && navigator.onLine) {
      try {
        const {text} = await api<{text: string}>('/api/ocr', {method: 'POST', json: {image, mode, lang}});
        if (text.trim()) return {text};
      } catch (e) { serverError = e instanceof Error ? e.message.replace(/ Yazın korunuyor\.?$/, '') : ''; }
    }
    if (deviceOcrSupported()) {
      try {
        const r = await recognizeOnDevice(image, mode);
        if (plausibleText(r)) return {text: r.text};
        return {error: 'Yazı cihazda yeterince net okunamadı.'};
      } catch { /* cihazda tanıma yüklenemedi */ }
    }
    return {error: serverError || 'Yazı tanınamadı.'};
  }, [config?.ocrEnabled]);
  const lastNotice = useRef(0);

  /** Bekleyen yazının kutusu (kelime bitti mi / kalem yakında mı hesapları için). */
  const pendingBox = () => {
    const cur = latest(pending.current.pageId)?.content;
    if (!cur || !pending.current.ids.length) return null;
    const ids = new Set(pending.current.ids);
    return {box: inkBox(cur.strokes.filter(st => ids.has(st.id))), gap: writingGuide(cur).gap};
  };

  const beautify = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const {pageId, ids} = pending.current;
    pending.current = {pageId: '', ids: []};
    const w = writeRef.current;
    const cur = latest(pageId)?.content;
    if (!cur || !ids.length || w.mode !== 'beautify') return;
    const idSet = new Set(ids);
    const group = cur.strokes.filter(st => idSet.has(st.id));
    const guide = writingGuide(cur);
    if (!group.length || !looksLikeWriting(group, guide.gap)) return;
    setDimIds(prev => new Set([...prev, ...ids]));
    const lines = splitLines(group, guide.gap);
    const results = await Promise.all(lines.map(line => recognize(line, 'word', w.engine, w.lang)));
    setDimIds(prev => { const n = new Set(prev); for (const i of ids) n.delete(i); return n; });
    const now = latest(pageId)?.content;
    if (!now) return;
    let strokes = now.strokes;
    let failed = '';
    lines.forEach((line, i) => {
      const r = results[i];
      // Bu arada silinen/değiştirilen çizgiler dönüştürülmez.
      const lineIds = line.map(st => st.id);
      if (!lineIds.every(x => strokes.some(st => st.id === x))) return;
      if (!('text' in r)) { if (r.error) failed = r.error; return; }
      const text = cleanRecognized(r.text);
      if (!text || !consistentWithInk(text, line)) { failed = 'Yazı güvenle okunamadı.'; return; }
      const placed = placeText(strokes, lineIds, now, text, w.font);
      if (placed) strokes = placed;
    });
    // Her kelimede uyarı çıkmasın: en fazla dakikada bir bilgi verilir.
    if (failed && Date.now() - lastNotice.current > 60000) { lastNotice.current = Date.now(); toast(`${failed} El yazın olduğu gibi korundu.`, 'info'); }
    if (strokes !== now.strokes) commit({...now, strokes}, pageId);
  }, [latest, commit, recognize]);

  const restartTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void beautify(), writeRef.current.delay);
  }, [beautify]);

  const onPenStroke = useCallback((strokeId: string) => {
    if (writeRef.current.mode !== 'beautify' || !page) return;
    if (pending.current.pageId !== page.id) { void beautify(); pending.current = {pageId: page.id, ids: []}; }
    pending.current.ids.push(strokeId);
    restartTimer();
  }, [page, beautify, restartTimer]);
  const onInputStart = useCallback((x: number, y: number, kind: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current.ids.length) return;
    // Kalem başka bir yere (sonraki kelime, alt satır) ya da başka bir araca geçtiyse önceki kelime bitmiştir.
    const p = pendingBox();
    if (kind !== 'pen' || !p?.box || movedAway(p.box, x, y, p.gap)) void beautify();
  }, [beautify]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPenHover = useCallback((x: number, y: number) => {
    // Kalem kelimenin yanında havada duruyorsa kullanıcı yazmaya devam etmek üzere: süre yeniden başlar.
    if (!timer.current) return;
    const p = pendingBox();
    if (p?.box && hoveringNear(p.box, x, y, p.gap)) restartTimer();
  }, [restartTimer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Sayfa değişirse bekleyen kelime hemen dönüştürülür.
  useEffect(() => { if (pending.current.ids.length) void beautify(); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  // Özellik kapatılırsa bekleyen iş bırakılır.
  useEffect(() => { if (settings.write.mode !== 'beautify') { if (timer.current) clearTimeout(timer.current); timer.current = null; pending.current = {pageId: '', ids: []}; } }, [settings.write.mode]);

  // ------------------------------------------------------------ seçim işlemleri
  const selectedStrokes = () => content ? content.strokes.filter(s => selection.strokes.includes(s.id)) : [];
  const deleteSelection = () => {
    if (!content) return;
    const ids = new Set(selection.strokes), tids = new Set(selection.texts);
    commit({...content, strokes: content.strokes.filter(s => !ids.has(s.id)), texts: content.texts.filter(t => !tids.has(t.id))});
    setSelection(emptySelection);
  };
  const copySelection = () => {
    if (!content) return;
    clipboard.current = {strokes: selectedStrokes(), texts: content.texts.filter(t => selection.texts.includes(t.id))};
    toast('Seçim kopyalandı.', 'info');
  };
  const paste = (offset = 24) => {
    if (!content || !clipboard.current) return;
    const strokes = clipboard.current.strokes.map(s => ({...transformStroke(s, offset, offset), id: shortId()}));
    const texts = clipboard.current.texts.map(t => ({...t, id: shortId(), x: t.x + offset, y: t.y + offset}));
    commit({...content, strokes: [...content.strokes, ...strokes], texts: [...content.texts, ...texts]});
    setSelection({strokes: strokes.map(s => s.id), texts: texts.map(t => t.id)});
    if (tool !== 'select' && tool !== 'lasso') setTool('select');
  };
  const duplicateSelection = () => { copySelection(); paste(); };
  const recolorSelection = (color: string) => {
    if (!content) return;
    const ids = new Set(selection.strokes), tids = new Set(selection.texts);
    commit({...content, strokes: content.strokes.map(s => (ids.has(s.id) && s.pen !== 'highlighter' ? {...s, c: color} : s)), texts: content.texts.map(t => (tids.has(t.id) ? {...t, color} : t))});
  };
  const ocrSelection = async () => {
    const strokes = selectedStrokes().filter(s => s.t === 'pen');
    if (!strokes.length) { toast('Metne çevirmek için el yazısı seç.', 'info'); return; }
    setBusy('El yazısı okunuyor…');
    try {
      const r = await recognize(strokes, 'block', settings.write.engine, settings.write.lang);
      if ('text' in r) setConvert({text: r.text, ids: strokes.map(s => s.id)});
      else toast(`${r.error || 'Yazı tanınamadı.'} El yazın korunuyor.`, 'error');
    } finally { setBusy(''); }
  };
  /** Sayfadaki el yazısını okuyup görünmez "aranabilir metin" olarak saklar (arama ve Kalemlik AI için; yazı değişmez). */
  const makeSearchable = async () => {
    if (!content || !page) return;
    const strokes = content.strokes.filter(s => s.t === 'pen' && s.pen !== 'highlighter');
    if (!strokes.length) return;
    setBusy('El yazısı okunuyor…');
    try {
      const guide = writingGuide(content);
      const lines = splitLines(strokes, guide.gap);
      const parts: string[] = [];
      for (const line of lines) { const r = await recognize(line, 'block', settings.write.engine, settings.write.lang); if ('text' in r && r.text.trim()) parts.push(r.text.trim()); }
      if (!parts.length) { toast('El yazısı okunamadı. Yazı olduğu gibi duruyor.', 'error'); return; }
      const now = latest(page.id)?.content;
      if (now) commit({...now, searchText: parts.join('\n').slice(0, 60_000)}, page.id);
      toast('Sayfa aranabilir yapıldı. El yazın değişmedi.', 'success');
    } finally { setBusy(''); }
  };
  const applyConvert = (replace: boolean) => {
    if (!convert || !content) return;
    const strokes = content.strokes.filter(s => convert.ids.includes(s.id));
    const b = inkBox(strokes);
    const box: TextBox = {id: shortId(), x: b ? b.x : 80, y: b ? (replace ? b.y : b.y + b.h + 12) : 120, w: Math.max(240, Math.min(content.width - 60, b ? b.w + 40 : 500)), text: convert.text, font: settings.text.font, size: settings.text.size, color: strokes[0]?.c || settings.text.color};
    commit({...content, strokes: replace ? content.strokes.filter(s => !convert.ids.includes(s.id)) : content.strokes, texts: [...content.texts, box]});
    setConvert(null);
    setSelection(emptySelection);
  };

  // ------------------------------------------------------------ galeriden görsel
  /** Fotoğrafı sayfaya taşınabilir/boyutlandırılabilir görsel olarak ekler (büyük fotoğraflar küçültülür). */
  const insertImage = async (file: File) => {
    let target = content, targetIndex = index;
    if (!target && pages[0]?.content) { target = pages[0].content; targetIndex = 1; setIndex(1); }
    if (!target) return;
    if (!file.type.startsWith('image/')) { toast('Bir fotoğraf ya da görsel seç.', 'error'); return; }
    if (file.size > 40 * 1024 * 1024) { toast('Görsel 40 MB’den küçük olmalı.', 'error'); return; }
    setBusy('Görsel hazırlanıyor…');
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => { throw new Error('Bu görsel açılamadı. JPG, PNG veya WEBP dene.'); });
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const alpha = /png|webp|gif/.test(file.type);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Görsel hazırlanamadı.'))), alpha ? 'image/png' : 'image/jpeg', 0.88));
      const fileId = await saveFile(blob, 'image', file.name.replace(/\.[^.]+$/, '') + (alpha ? '.png' : '.jpg'));
      const p = placeSticker({fileId, width: c.width, height: c.height}, target.width, target.height, shortId(), 0.6);
      commit({...target, stickers: [...target.stickers, p]}, pages[targetIndex - 1].id);
      setTool('select');
      setActiveSticker(p.id);
      toast('Görsel eklendi. Sürükleyerek taşı, köşeden boyutlandır, üstten döndür.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'Görsel eklenemedi.', 'error'); } finally { setBusy(''); }
  };

  // ------------------------------------------------------------ metin ve sticker
  const updateText = (t: TextBox, live: boolean) => {
    const cur = page && latest(page.id)?.content;
    if (!cur) return;
    const next = {...cur, texts: cur.texts.map(x => (x.id === t.id ? t : x))};
    if (live) liveChange(next); else commit(next);
  };
  const createText = (x: number, y: number) => {
    if (!content) return;
    const t: TextBox = {id: shortId(), x: Math.max(4, x - 6), y: Math.max(4, y - settings.text.size * 0.7), w: Math.min(520, content.width - x - 20), text: '', font: settings.text.font, size: settings.text.size, color: settings.text.color};
    if (t.w < 120) { t.x = Math.max(4, content.width - 420); t.w = 400; }
    commit({...content, texts: [...content.texts, t]});
    setActiveText(t.id);
  };
  // Boş bırakılan metin kutusu kapanınca kaldırılır.
  const activateText = (tid: string | null) => {
    if (activeText && activeText !== tid && page) {
      const cur = latest(page.id)?.content;
      const old = cur?.texts.find(t => t.id === activeText);
      if (cur && old && !old.text.trim()) liveChange({...cur, texts: cur.texts.filter(t => t.id !== old.id)});
    }
    setActiveText(tid);
  };
  const updateSticker = (p: Placed, done: boolean) => {
    const cur = page && latest(page.id)?.content;
    if (!cur) return;
    beginEdit();
    const clamped = {...p, x: Math.max(-p.w / 2, Math.min(cur.width - p.w / 2, p.x)), y: Math.max(-p.h / 2, Math.min(cur.height - p.h / 2, p.y))};
    liveChange({...cur, stickers: cur.stickers.map(s => (s.id === p.id ? clamped : s))});
    if (done) endEdit();
  };

  // ------------------------------------------------------------ kısayollar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'c' && hasSelection(selection)) { e.preventDefault(); copySelection(); return; }
      if (mod && k === 'v' && clipboard.current) { e.preventDefault(); paste(); return; }
      if (mod && k === 'd' && hasSelection(selection)) { e.preventDefault(); duplicateSelection(); return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); if (!settings.zoomLock) canvas.current?.zoomBy(1.2); return; }
      if (mod && k === '-') { e.preventDefault(); if (!settings.zoomLock) canvas.current?.zoomBy(1 / 1.2); return; }
      if (mod && k === '0') { e.preventDefault(); canvas.current?.fit('page'); return; }
      if (mod) return;
      if ((k === 'delete' || k === 'backspace') && hasSelection(selection)) { e.preventDefault(); deleteSelection(); return; }
      if (k === 'escape') { setSelection(emptySelection); setActiveSticker(null); return; }
      if (k === 'pagedown') { e.preventDefault(); setIndex(i => Math.min(pages.length, i + 1)); return; }
      if (k === 'pageup') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); return; }
      const map: Record<string, Tool> = {p: 'pen', e: 'eraser', v: 'select', l: 'lasso', t: 'text', h: 'hand', s: 'shape'};
      if (map[k]) setTool(map[k]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Tarayıcının kendi yakınlaştırmasını (Ctrl + tekerlek) editör boyunca engelle: yalnızca kâğıt büyür.
  useEffect(() => {
    const stop = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    window.addEventListener('wheel', stop, {passive: false});
    return () => window.removeEventListener('wheel', stop);
  }, []);

  if (!nb) {
    return <div className="editor-missing"><p>Defter bulunamadı ya da henüz bu cihaza gelmedi.</p><Button onClick={() => navigate('/defterler')}>Defterlerime dön</Button></div>;
  }

  const writable = index > 0 && !!content;
  const zoomPct = Math.round((view.zoom / Math.max(0.01, canvas.current?.fitZoom() || view.zoom)) * 100);
  const gap = content ? writingGuide(content).gap : 36;
  const moreItems: (MenuItem | 'sep')[] = [
    {label: 'Sayfa ekle', icon: <Plus size={17} />, onSelect: () => addPage(Math.max(index, pages.length && index === 0 ? 0 : index))},
    {label: 'Sayfayı çoğalt', icon: <CopyPlus size={17} />, disabled: !content, onSelect: () => content && addPage(index, content)},
    {label: 'Sayfayı sil', icon: <Trash2 size={17} />, disabled: !page, danger: true, onSelect: () => void deletePage()},
    ...(clipboard.current ? [{label: 'Yapıştır', icon: <ClipboardPaste size={17} />, disabled: !writable, onSelect: () => paste()}] : []),
    'sep',
    {label: 'PDF içe aktar (sayfa olarak)', icon: <FileUp size={17} />, onSelect: () => pdfInput.current?.click()},
    {label: 'Galeriden görsel ekle', icon: <ImagePlus size={17} />, onSelect: () => galleryInput.current?.click()},
    {label: 'Fotoğrafı sayfa yap', icon: <FileImage size={17} />, onSelect: () => imgInput.current?.click()},
    {label: 'PDF olarak indir', icon: <Download size={17} />, onSelect: () => void exportPdf()},
    'sep',
    {label: '🪄 Flashcard oluştur', icon: <Layers size={17} />, onSelect: () => openGenerate({kind: 'flashcards', source: {kind: 'notebook', id}})},
    {label: '🎯 Quiz oluştur', icon: <Target size={17} />, onSelect: () => openGenerate({kind: 'quiz', source: {kind: 'notebook', id}})},
    {label: '✨ Kalemlik AI’ya sor', icon: <Sparkles size={17} />, onSelect: () => navigate(`/ai?kaynak=notebook&id=${id}`)},
    {label: 'Sayfayı aranabilir yap (el yazısını oku)', icon: <ScanText size={17} />, disabled: !content || !content.strokes.some(s => s.t === 'pen'), onSelect: () => void makeSearchable()},
    'sep',
    {label: 'Kapağı düzenle', icon: <Palette size={17} />, onSelect: () => setCoverEdit(true)},
    {label: 'Defter bilgileri / yeniden adlandır', icon: <Info size={17} />, onSelect: () => setInfo(true)},
    {label: nb.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle', icon: <Star size={17} />, onSelect: () => toggleFavorite(nb)},
    {label: 'Çöp kutusuna taşı', icon: <Trash2 size={17} />, danger: true, onSelect: () => { trashNotebook(nb); navigate('/defterler'); }},
  ];

  const selectionTools = hasSelection(selection) && (
    <div className="float-tools">
      <button type="button" onClick={copySelection} title="Kopyala"><Copy size={16} /><span>Kopyala</span></button>
      <button type="button" onClick={duplicateSelection} title="Çoğalt"><CopyPlus size={16} /><span>Çoğalt</span></button>
      <button type="button" onClick={e => setPanel({kind: 'color', anchor: e.currentTarget})} title="Renk"><Palette size={16} /><span>Renk</span></button>
      {selection.strokes.length > 0 && <button type="button" onClick={() => void ocrSelection()} title="Metne çevir"><ScanText size={16} /><span>Metne çevir</span></button>}
      <button type="button" className="is-danger" onClick={deleteSelection} title="Sil"><Trash2 size={16} /><span>Sil</span></button>
      <button type="button" onClick={() => setSelection(emptySelection)} aria-label="Seçimi kaldır"><X size={16} /></button>
    </div>
  );

  return (
    <div className={`editor rail-on-${settings.railSide}`}>
      <header className="editor-top">
        <IconButton label="Defterlere dön" onClick={() => navigate('/defterler')}><ArrowLeft size={22} /></IconButton>
        <button type="button" className="editor-title" onClick={() => setInfo(true)} title="Defter bilgileri">
          <span className="editor-dot" style={{background: nb.color}} /><strong>{nb.title}</strong>{nb.course && <small>{nb.course}</small>}
        </button>
        <div className="editor-top-group">
          <IconButton label="Geri al (Ctrl+Z)" disabled={!history.canUndo} onClick={undo}><Undo2 size={20} /></IconButton>
          <IconButton label="Yinele (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={redo}><Redo2 size={20} /></IconButton>
        </div>
        <span className="spacer" />
        <div className="editor-top-group">
          <IconButton label="Sayfa şablonu ve renkleri" disabled={!writable} onClick={e => setPanel({kind: 'template', anchor: e.currentTarget})}><LayoutTemplate size={20} /></IconButton>
          <IconButton label="Akıllı yazı güzelleştirme" active={settings.write.mode === 'beautify'} onClick={e => setPanel({kind: 'write', anchor: e.currentTarget})}><Wand2 size={20} /></IconButton>
          <IconButton label="Yalnızca kalem / yakınlaştırma kilidi" active={settings.penOnly || settings.zoomLock} onClick={e => setPanel({kind: 'view', anchor: e.currentTarget})}><Settings2 size={20} /></IconButton>
          <Button size="sm" variant="ghost" icon={<Layers size={18} />} onClick={() => setShowPages(!showPages)} aria-expanded={showPages}>{index === 0 ? 'Kapak' : `${index} / ${pages.length}`}</Button>
          <SyncBadge compact />
          <IconButton label="Diğer işlemler" onClick={e => setMenu(e.currentTarget)}><MoreHorizontal size={22} /></IconButton>
        </div>
      </header>

      <div className="editor-body">
        <ToolRail tool={tool} settings={settings} side={settings.railSide} disabled={!writable}
          onTool={t => { setTool(t); if (t !== 'select' && t !== 'lasso') setSelection(emptySelection); if (t !== 'select') setActiveSticker(null); if (t !== 'text') activateText(null); if (index === 0 && pages.length) setIndex(1); }}
          onSticker={() => setStickers(true)} onImage={() => galleryInput.current?.click()} />

        <div className="stage">
          {index === 0 ? (
            <CoverStage nb={nb} first={pages[0]} onEnter={() => { if (pages.length) setIndex(1); }} onEditCover={() => setCoverEdit(true)} />
          ) : !content ? (
            <div className="stage-loading">{loading || navigator.onLine ? <><span className="spinner" /> Sayfa yükleniyor…</> : 'Bu sayfa bu cihazda yok. İnternete bağlanınca açılacak.'}</div>
          ) : (
            <PageCanvas ref={canvas} content={content} pageId={page!.id} tool={tool} settings={settings} zoomLock={settings.zoomLock} penOnly={settings.penOnly} writable={writable}
              selection={selection} dimIds={dimIds} onSelection={setSelection}
              onCommit={next => commit(next)} onPenStroke={onPenStroke} onInputStart={onInputStart} onPenHover={onPenHover}
              onStylusAction={a => { if (a === 'undo') { undo(); return true; } return false; }}
              onTap={(x, y) => { if (tool === 'text') { if (activeText) activateText(null); else createText(x, y); } }}
              onViewChange={setView}
              onOverscroll={dir => setIndex(i => Math.max(0, Math.min(pages.length, i + dir)))}
              selectionTools={selectionTools}
              underlay={
                <PlacedLayer mode="images" items={content.stickers} pageW={content.width} pageH={content.height} selectedId={activeSticker} interactive={tool === 'select'}
                  onSelect={setActiveSticker} onChange={updateSticker}
                  onDuplicate={p => { const c = {...p, id: shortId(), x: p.x + 30, y: p.y + 30}; commit({...content, stickers: [...content.stickers, c]}); setActiveSticker(c.id); }}
                  onDelete={p => { commit({...content, stickers: content.stickers.filter(s => s.id !== p.id)}); setActiveSticker(null); }}
                  onFront={p => commit({...content, stickers: [...content.stickers.filter(s => s.id !== p.id), p]})} />}
              overlay={<>
                <PlacedLayer mode="controls" items={content.stickers} pageW={content.width} pageH={content.height} selectedId={activeSticker} interactive={tool === 'select'}
                  onSelect={setActiveSticker} onChange={updateSticker}
                  onDuplicate={p => { const c = {...p, id: shortId(), x: p.x + 30, y: p.y + 30}; commit({...content, stickers: [...content.stickers, c]}); setActiveSticker(c.id); }}
                  onDelete={p => { commit({...content, stickers: content.stickers.filter(s => s.id !== p.id)}); setActiveSticker(null); }}
                  onFront={p => commit({...content, stickers: [...content.stickers.filter(s => s.id !== p.id), p]})} />
                <TextLayer texts={content.texts} interactive={tool === 'text' || tool === 'select'} activeId={activeText} selectedIds={selection.texts}
                  onActivate={activateText} onChange={updateText} onDelete={tid => { commit({...content, texts: content.texts.filter(t => t.id !== tid)}); setActiveText(null); }}
                  onEditStart={beginEdit} onEditEnd={endEdit} />
              </>} />
          )}

          {busy && <div className="stage-busy" role="status"><span className="spinner" /> {busy}</div>}

          {index > 0 && content && (
            <div className="zoom-cluster" role="group" aria-label="Yakınlaştırma">
              <IconButton size="sm" label="Uzaklaştır" disabled={settings.zoomLock} onClick={() => canvas.current?.zoomBy(1 / 1.2)}><ZoomOut size={18} /></IconButton>
              <button type="button" className="zoom-pct" onClick={() => canvas.current?.fit('page')} title="Sayfaya sığdır">%{zoomPct}</button>
              <IconButton size="sm" label="Yakınlaştır" disabled={settings.zoomLock} onClick={() => canvas.current?.zoomBy(1.2)}><ZoomIn size={18} /></IconButton>
              <IconButton size="sm" label="Sayfaya sığdır" onClick={() => canvas.current?.fit('page')}><Maximize size={16} /></IconButton>
              <IconButton size="sm" label="Genişliğe sığdır" onClick={() => canvas.current?.fit('width')}><MoveHorizontal size={16} /></IconButton>
              <IconButton size="sm" label={settings.zoomLock ? 'Yakınlaştırma kilidini aç' : 'Yakınlaştırmayı kilitle'} active={settings.zoomLock} onClick={() => void import('@/lib/settings').then(m => m.updateSettings({zoomLock: !settings.zoomLock}))}>{settings.zoomLock ? <Lock size={16} /> : <LockOpen size={16} />}</IconButton>
              {settings.penOnly && <>
                <span className="zoom-sep" />
                <IconButton size="sm" label="Yukarı kaydır (iki satır)" onClick={() => canvas.current?.panBy(0, -gap * 2 * view.zoom)}><ChevronUp size={18} /></IconButton>
                <IconButton size="sm" label="Aşağı kaydır (iki satır)" onClick={() => canvas.current?.panBy(0, gap * 2 * view.zoom)}><ChevronDown size={18} /></IconButton>
                <span className="pen-only-badge" title="Yalnızca kalem açık"><PenLine size={14} /><HandIcon size={12} /></span>
              </>}
            </div>
          )}

          <div className="page-nav" role="group" aria-label="Sayfa gezinme">
            <IconButton size="sm" label="Önceki sayfa" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={20} /></IconButton>
            <button type="button" className="page-nav-label" onClick={() => setShowPages(true)}>{index === 0 ? 'Kapak' : `Sayfa ${index} / ${pages.length}`}</button>
            <IconButton size="sm" label="Sonraki sayfa" disabled={index >= pages.length} onClick={() => setIndex(index + 1)}><ChevronRight size={20} /></IconButton>
            <IconButton size="sm" label="Bu sayfadan sonra yeni sayfa ekle" onClick={() => addPage(Math.max(index, 0))}><Plus size={18} /></IconButton>
          </div>
        </div>

        {showPages && <PagesPanel notebook={nb} pages={pages} current={index} onGo={i => { setIndex(i); if (window.innerWidth < 900) setShowPages(false); }} onAddAfter={i => addPage(i)} onDuplicate={i => { const c = pages[i - 1]?.content; if (c) addPage(i, c); }} onDelete={i => void deletePage(i)} onMove={movePage} onClose={() => setShowPages(false)} />}
      </div>

      <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importPagesFrom(f, 'pdf'); }} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void insertImage(f); }} />
      <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importPagesFrom(f, 'image'); }} />

      <Menu anchor={menu} open={!!menu} onClose={() => setMenu(null)} label="Diğer işlemler" items={moreItems} />
      <Popover anchor={panel?.anchor || null} open={!!panel} onClose={() => setPanel(null)} label="Panel" placement="bottom">
        {panel?.kind === 'template' && content && page && <TemplatePanel content={content}
          onChange={patch => commit({...content, ...patch})}
          onApplyAll={() => {
            const changes: {id: string; before: PageSnap | null; after: PageSnap | null}[] = [];
            for (const p of pages) {
              if (!p.content || p.id === page.id) continue;
              const next = {...p.content, template: p.content.background ? p.content.template : content.template, paperColor: content.paperColor, lineColor: content.lineColor, textColor: content.textColor, spacing: content.spacing};
              changes.push({id: p.id, before: snap(p), after: {id: p.id, position: p.position, content: next}});
              put('page', {...p, content: next});
            }
            history.push({kind: 'pages', changes, focusBefore: index, focusAfter: index});
            update('notebook', nb.id, {paper: content.template});
            toast('Şablon ve renkler tüm sayfalara uygulandı.', 'success');
          }} />}
        {panel?.kind === 'write' && <WritePanel settings={settings} ocrEnabled={!!config?.ocrEnabled} />}
        {panel?.kind === 'view' && <ViewPanel settings={settings} />}
        {panel?.kind === 'color' && <div className="panel swatch-row">{INK_COLORS.map(c => <button key={c} type="button" className="swatch" style={{background: c}} aria-label={c} onClick={() => { recolorSelection(c); setPanel(null); }} />)}</div>}
      </Popover>

      <StickerLibrary open={stickers} onClose={() => setStickers(false)} onPick={s => {
        let target = content, targetIndex = index;
        if (!target && pages[0]?.content) { target = pages[0].content; targetIndex = 1; setIndex(1); }
        if (!target) return;
        const p = placeSticker(s, target.width, target.height, shortId());
        commit({...target, stickers: [...target.stickers, p]}, pages[targetIndex - 1].id);
        setTool('select');
        setActiveSticker(p.id);
      }} />
      {coverEdit && <CoverEditor notebookId={nb.id} open onClose={() => setCoverEdit(false)} />}
      <NotebookDialog open={info} mode="edit" initial={nb} onClose={() => setInfo(false)} onSave={v => { update('notebook', nb.id, v); toast('Defter bilgileri kaydedildi.', 'success'); }} />
      <Dialog open={!!convert} onClose={() => setConvert(null)} title="Tanınan metin" footer={<>
        <Button variant="ghost" onClick={() => setConvert(null)}>Vazgeç</Button>
        <Button onClick={() => applyConvert(false)}>Metin kutusu olarak ekle</Button>
        <Button variant="primary" onClick={() => applyConvert(true)}>El yazısının yerine koy</Button>
      </>}>
        <Field label="Metni kontrol et, gerekirse düzelt" htmlFor="ocr-text">
          <textarea id="ocr-text" className="textarea" rows={6} value={convert?.text || ''} onChange={e => convert && setConvert({...convert, text: e.target.value})} />
        </Field>
        <p className="muted small">"Yerine koy" seçersen el yazın kaldırılır; geri al ile geri getirebilirsin.</p>
      </Dialog>
    </div>
  );
}

export {textHeight};
