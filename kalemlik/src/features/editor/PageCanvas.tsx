// Not alma yüzeyi: kalem/dokunma/fare girişi, çizim, silgi, şekil, seçim, kaydırma ve yakınlaştırma.
// Yakınlaştırma yalnızca kâğıdı büyütür (araç çubukları sabit kalır); tuval çözünürlüğü yakınlaştırma
// durunca yeniden ayarlanır, böylece yazı her ölçekte keskin görünür.

import {forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import type {PageContent, Stroke, UserSettings, StylusAction} from '@/lib/types';
import {cachedImage} from '@/lib/files';
import {shortId} from '@/lib/ids';
import {drawStroke, round, shapePoints} from './ink';
import {paintPaper} from './paper';
import {drawImageContain} from './render';
import {eraseFrom, strokeBox, strokeInLasso, strokeInRect, transformStroke, unionBox, type Box} from './geometry';
import type {Selection, Tool, View} from './types';
import {onFontsLoaded} from '@/features/fonts/fonts';

export interface CanvasHandle {
  zoomBy(factor: number): void;
  fit(mode: 'page' | 'width'): void;
  panBy(dx: number, dy: number): void;
  view(): View;
  fitZoom(): number;
}

interface Props {
  content: PageContent;
  pageId: string;
  tool: Tool;
  settings: UserSettings;
  zoomLock: boolean;
  penOnly: boolean;
  writable: boolean;
  selection: Selection;
  dimIds: ReadonlySet<string>;
  onSelection(sel: Selection): void;
  onCommit(next: PageContent): void;
  onPenStroke(id: string): void;
  onInputStart(): void;
  onStylusAction(action: StylusAction): boolean;
  onTap(x: number, y: number): void;
  onViewChange(v: View): void;
  onOverscroll(dir: 1 | -1): void;
  overlay?: ReactNode;
  /** Şablon ile mürekkep arasına çizilen katman (stickerlar, bloknotlar: üstlerine yazılabilsin). */
  underlay?: ReactNode;
  selectionTools?: ReactNode;
}

type Action =
  | {type: 'draw'; id: number; stroke: Stroke; lx: number; ly: number; lt: number; p: number}
  | {type: 'erase'; id: number; strokes: Stroke[]; changed: boolean; partial: boolean; size: number}
  | {type: 'shape'; id: number; x0: number; y0: number; x1: number; y1: number}
  | {type: 'rect'; id: number; x0: number; y0: number; x1: number; y1: number}
  | {type: 'lasso'; id: number; pts: number[]}
  | {type: 'move'; id: number; x0: number; y0: number; dx: number; dy: number}
  | {type: 'scale'; id: number; box: Box; f: number}
  | {type: 'pan'; id: number; sx: number; sy: number; vx: number; vy: number}
  | {type: 'tap'; id: number; x: number; y: number; sx: number; sy: number};

const MIN_ZOOM = 0.2, MAX_ZOOM = 6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Bazı tarayıcılar/kalemler yakalamayı reddedebilir; çizim yine de sürer. */
const capture = (el: Element, id: number) => { try { el.setPointerCapture(id); } catch { /* yok say */ } };

export const PageCanvas = forwardRef<CanvasHandle, Props>(function PageCanvas(props, ref) {
  const vpRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({zoom: 1, x: 0, y: 0});
  const action = useRef<Action | null>(null);
  const touches = useRef(new Map<number, {x: number; y: number}>());
  const gesture = useRef<{d0: number; mx: number; my: number; v0: View} | null>(null);
  const penSeen = useRef(0);
  const work = useRef<PageContent>(props.content);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [scale, setScale] = useState(1);
  const [, setTick] = useState(0);
  const raf = useRef(0);
  const overscroll = useRef(0);
  const {content} = props;
  const W = content.width, H = content.height;

  // ------------------------------------------------------------ görünüm
  const vpSize = () => { const r = vpRef.current!.getBoundingClientRect(); return {w: r.width, h: r.height, left: r.left, top: r.top}; };
  const fitZoom = useCallback(() => { const {w, h} = vpSize(); return clamp(Math.min((w - 32) / W, (h - 32) / H), MIN_ZOOM, MAX_ZOOM); }, [W, H]);

  const clampView = useCallback((v: View): View => {
    const {w, h} = vpSize();
    const pw = W * v.zoom, ph = H * v.zoom, m = 24;
    const x = pw + m * 2 <= w ? clamp(v.x, m, w - pw - m) : clamp(v.x, w - pw - m * 3, m * 3);
    const y = ph + m * 2 <= h ? clamp(v.y, m, h - ph - m) : clamp(v.y, h - ph - m * 3, m * 2);
    return {zoom: v.zoom, x, y};
  }, [W, H]);

  const resTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyView = useCallback((v: View, settle = true) => {
    view.current = v;
    const el = paperRef.current;
    if (el) {
      el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
      el.style.setProperty('--iz', String(1 / v.zoom));
    }
    if (!notifyTimer.current) notifyTimer.current = setTimeout(() => { notifyTimer.current = null; propsRef.current.onViewChange(view.current); }, 80);
    if (settle) {
      if (resTimer.current) clearTimeout(resTimer.current);
      resTimer.current = setTimeout(() => {
        const dpr = window.devicePixelRatio || 1;
        // iOS tuval sınırı (~16 MP) aşılmasın.
        const s = Math.min(view.current.zoom * dpr, 4096 / Math.max(W, H), Math.sqrt(15e6 / (W * H)));
        setScale(prev => (Math.abs(prev - s) / s > 0.08 ? s : prev));
      }, 180);
    }
  }, [W, H]);

  const zoomAt = useCallback((zoom: number, cx: number, cy: number) => {
    const v = view.current;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const px = (cx - v.x) / v.zoom, py = (cy - v.y) / v.zoom;
    applyView(clampView({zoom: z, x: cx - px * z, y: cy - py * z}));
  }, [applyView, clampView]);

  const fit = useCallback((mode: 'page' | 'width') => {
    const {w, h} = vpSize();
    if (mode === 'page') { const z = fitZoom(); applyView({zoom: z, x: (w - W * z) / 2, y: Math.max(16, (h - H * z) / 2)}); }
    else { const z = clamp((w - 32) / W, MIN_ZOOM, MAX_ZOOM); applyView(clampView({zoom: z, x: (w - W * z) / 2, y: 16})); }
  }, [W, H, fitZoom, applyView, clampView]);

  useImperativeHandle(ref, () => ({
    zoomBy: f => { const {w, h} = vpSize(); zoomAt(view.current.zoom * f, w / 2, h / 2); },
    fit,
    panBy: (dx, dy) => applyView(clampView({...view.current, x: view.current.x - dx, y: view.current.y - dy})),
    view: () => view.current,
    fitZoom,
  }), [zoomAt, fit, applyView, clampView, fitZoom]);

  // Sayfa değişince ya da ilk açılışta sayfayı ekrana sığdır; pencere boyutu değişince konumu koru.
  const fittedFor = useRef('');
  useLayoutEffect(() => {
    const key = `${props.pageId}:${W}x${H}`;
    if (fittedFor.current === key) return;
    const narrow = vpRef.current!.clientWidth < 700;
    fit(narrow ? 'width' : 'page');
    fittedFor.current = key;
  }, [props.pageId, W, H, fit]);
  useEffect(() => {
    const ro = new ResizeObserver(() => applyView(clampView(view.current)));
    ro.observe(vpRef.current!);
    return () => ro.disconnect();
  }, [applyView, clampView]);

  // ------------------------------------------------------------ çizim
  const setupCanvas = (c: HTMLCanvasElement | null) => {
    if (!c) return null;
    const pw = Math.round(W * scale), ph = Math.round(H * scale);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    return ctx;
  };

  const drawBg = useCallback(() => {
    const ctx = setupCanvas(bgRef.current);
    if (!ctx) return;
    const c = work.current;
    paintPaper(ctx, c);
    if (c.background) {
      const img = cachedImage(c.background.fileId, () => setTick(t => t + 1));
      if (img) drawImageContain(ctx, img, c.width, c.height);
    }
  }, [scale, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawInk = useCallback((strokes: Stroke[] = work.current.strokes) => {
    const ctx = setupCanvas(inkRef.current);
    if (!ctx) return;
    const dim = propsRef.current.dimIds;
    for (const s of strokes) if (s.pen === 'highlighter') drawStroke(ctx, s, dim.has(s.id));
    for (const s of strokes) if (s.pen !== 'highlighter') drawStroke(ctx, s, dim.has(s.id));
  }, [scale, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveCtx = () => setupCanvas(liveRef.current);

  useEffect(() => {
    if (!action.current) work.current = props.content;
    drawBg();
    drawInk();
  }, [props.content, props.dimIds, drawBg, drawInk]);
  useEffect(() => onFontsLoaded(() => drawInk()), [drawInk]);
  useEffect(() => { liveCtx(); }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = (fn: () => void) => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(fn);
  };

  const commit = (next: PageContent) => { work.current = next; propsRef.current.onCommit(next); };

  // ------------------------------------------------------------ giriş
  const toPage = (clientX: number, clientY: number) => {
    const r = vpRef.current!.getBoundingClientRect(), v = view.current;
    return {x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom};
  };

  const selectionBox = (): Box | null => {
    const sel = propsRef.current.selection;
    const c = work.current;
    const boxes: Box[] = [];
    for (const s of c.strokes) if (sel.strokes.includes(s.id)) boxes.push(strokeBox(s));
    for (const t of c.texts) if (sel.texts.includes(t.id)) boxes.push({x: t.x, y: t.y, w: t.w, h: textHeight(t.text, t.size)});
    return unionBox(boxes);
  };

  /** Seçili öğelere (dx, dy) kaydırma ve/veya ölçek uygular. */
  const transformSelection = (c: PageContent, dx: number, dy: number, f = 1, ox = 0, oy = 0): PageContent => {
    const sel = propsRef.current.selection;
    const ids = new Set(sel.strokes), tids = new Set(sel.texts);
    return {
      ...c,
      strokes: c.strokes.map(s => (ids.has(s.id) ? transformStroke(s, dx, dy, f, ox, oy) : s)),
      texts: c.texts.map(t => (tids.has(t.id) ? {...t, x: ox + (t.x - ox) * f + dx, y: oy + (t.y - oy) * f + dy, w: Math.max(40, t.w * f), size: clamp(t.size * f, 6, 160)} : t)),
    };
  };

  const effectiveTool = (e: React.PointerEvent): {tool: Tool | 'undo' | 'none'; pen?: UserSettings['activePen']} => {
    const {tool, settings} = propsRef.current;
    if (e.pointerType === 'pen') {
      const map = (a: StylusAction) => a === 'pen' ? {tool: 'pen' as const, pen: settings.activePen === 'highlighter' ? 'ballpoint' as const : settings.activePen}
        : a === 'highlighter' ? {tool: 'pen' as const, pen: 'highlighter' as const}
        : a === 'none' ? null : a === 'undo' ? {tool: 'undo' as const} : {tool: a as Tool};
      if (e.button === 5 || (e.buttons & 32)) { const m = map(settings.stylus.tip); if (m) return m; }
      if (e.button === 2 || (e.buttons & 2)) { const m = map(settings.stylus.barrel); if (m) return m; }
    }
    if (e.pointerType === 'mouse' && e.button === 1) return {tool: 'hand'};
    return {tool, pen: settings.activePen};
  };

  const pressureOf = (e: PointerEvent | React.PointerEvent, a: Extract<Action, {type: 'draw'}> | null, x: number, y: number) => {
    if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.5;
    // Basınç yoksa hızdan tahmin: hızlı çizgi incelir (doğal görünüm).
    if (!a) return 0.6;
    const dt = Math.max(1, e.timeStamp - a.lt);
    const speed = Math.hypot(x - a.lx, y - a.ly) / dt * view.current.zoom;
    const target = clamp(0.9 - speed * 0.18, 0.3, 0.9);
    return a.p + (target - a.p) * 0.3;
  };

  /** Sayfanın başında/sonunda kaydırmaya devam edilirse önceki/sonraki sayfaya (ilk sayfadan kapağa) geçilir. */
  const pulled = useRef(false);
  const pull = (dy: number) => {
    if (pulled.current) return;
    if (dy > 150) { pulled.current = true; propsRef.current.onOverscroll(-1); }
    else if (dy < -150) { pulled.current = true; propsRef.current.onOverscroll(1); }
  };

  const startGesture = () => {
    pulled.current = false;
    const pts = [...touches.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    gesture.current = {d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v0: {...view.current}};
  };

  const cancelAction = () => {
    const a = action.current;
    action.current = null;
    liveCtx();
    if (a?.type === 'erase' || a?.type === 'move' || a?.type === 'scale') { drawInk(); }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const P = propsRef.current;
    const r = vpRef.current!.getBoundingClientRect();
    if (e.pointerType === 'touch') {
      // Kalem kâğıda değerken ya da az önce kalktıysa avuç içi dokunuşları yok sayılır.
      if (Date.now() - penSeen.current < 600) return;
      touches.current.set(e.pointerId, {x: e.clientX - r.left, y: e.clientY - r.top});
      if (touches.current.size >= 2) {
        if (action.current && action.current.type !== 'pan') {
          // İlk parmak yanlışlıkla çizmeye başladıysa geri alınır; iki parmak hareketi başlar.
          cancelAction();
        }
        action.current = null;
        startGesture();
        return;
      }
      if (P.penOnly && P.tool !== 'hand') return; // tek parmak not oluşturmaz
    }
    if (e.pointerType === 'pen') {
      penSeen.current = Date.now();
      // Avuç içi önce değdiyse onun başlattığı işlem iptal edilir; kalem öncelikli.
      if (action.current) { cancelAction(); touches.current.clear(); gesture.current = null; }
    }
    if (e.pointerType === 'mouse' && e.button === 2) return;
    if (action.current) return;
    const {tool, pen} = effectiveTool(e);
    const {x, y} = toPage(e.clientX, e.clientY);
    capture(vpRef.current!, e.pointerId);
    P.onInputStart();

    if (tool === 'undo') { P.onStylusAction('undo'); return; }
    if (tool === 'hand' || !P.writable && tool !== 'select') {
      pulled.current = false;
      action.current = {type: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y};
      return;
    }
    if (tool === 'pen') {
      const s = P.settings.pens[pen!];
      const p = pressureOf(e, null, x, y);
      const stroke: Stroke = {id: shortId(), t: 'pen', pen, c: s.color, w: s.width, o: s.opacity, pts: [round(x), round(y), round(p * 100) / 100]};
      action.current = {type: 'draw', id: e.pointerId, stroke, lx: x, ly: y, lt: e.timeStamp, p};
      schedule(() => { const ctx = liveCtx(); if (ctx && action.current?.type === 'draw') drawStroke(ctx, action.current.stroke); });
      return;
    }
    if (tool === 'eraser') {
      const a: Action = {type: 'erase', id: e.pointerId, strokes: work.current.strokes, changed: false, partial: P.settings.eraser.mode === 'partial', size: P.settings.eraser.size};
      action.current = a;
      eraseAt(x, y);
      return;
    }
    if (tool === 'shape') { action.current = {type: 'shape', id: e.pointerId, x0: x, y0: y, x1: x, y1: y}; return; }
    if (tool === 'select' || tool === 'lasso') {
      const box = selectionBox();
      if (box && x >= box.x - 8 && x <= box.x + box.w + 8 && y >= box.y - 8 && y <= box.y + box.h + 8) {
        action.current = {type: 'move', id: e.pointerId, x0: x, y0: y, dx: 0, dy: 0};
        return;
      }
      P.onSelection({strokes: [], texts: []});
      action.current = tool === 'select' ? {type: 'rect', id: e.pointerId, x0: x, y0: y, x1: x, y1: y} : {type: 'lasso', id: e.pointerId, pts: [x, y]};
      return;
    }
    if (tool === 'text') { action.current = {type: 'tap', id: e.pointerId, x, y, sx: e.clientX, sy: e.clientY}; return; }
  };

  const eraseAt = (x: number, y: number) => {
    const a = action.current;
    if (a?.type !== 'erase') return;
    const r = a.size / 2 / Math.max(0.5, Math.min(2, view.current.zoom));
    const next = eraseFrom(a.strokes, x, y, Math.max(3, r), a.partial);
    const ctx = liveCtx();
    if (ctx) { ctx.save(); ctx.strokeStyle = 'rgba(80,90,110,.8)'; ctx.lineWidth = 1 / view.current.zoom; ctx.setLineDash([3 / view.current.zoom, 3 / view.current.zoom]); ctx.beginPath(); ctx.arc(x, y, Math.max(3, r), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (next) { a.strokes = next; a.changed = true; schedule(() => drawInk(a.strokes)); }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const P = propsRef.current;
    if (e.pointerType === 'pen') penSeen.current = Date.now();
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      const r = vpRef.current!.getBoundingClientRect();
      touches.current.set(e.pointerId, {x: e.clientX - r.left, y: e.clientY - r.top});
      const g = gesture.current;
      if (g && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const zoom = P.zoomLock ? g.v0.zoom : clamp(g.v0.zoom * (d / Math.max(1, g.d0)), MIN_ZOOM, MAX_ZOOM);
        const px = (g.mx - g.v0.x) / g.v0.zoom, py = (g.my - g.v0.y) / g.v0.zoom;
        const want = {zoom, x: mx - px * zoom, y: my - py * zoom};
        const got = clampView(want);
        applyView(got, true);
        if (Math.abs(zoom - g.v0.zoom) < 0.03) pull(want.y - got.y);
        return;
      }
    }
    const a = action.current;
    if (!a || a.id !== e.pointerId) {
      // Kalem havada: silgi imleci göstermek için
      return;
    }
    const events = 'getCoalescedEvents' in e.nativeEvent ? (e.nativeEvent as PointerEvent).getCoalescedEvents() : [];
    const list = events.length ? events : [e.nativeEvent as PointerEvent];
    if (a.type === 'pan') {
      const want = {...view.current, x: a.vx + (e.clientX - a.sx), y: a.vy + (e.clientY - a.sy)};
      const got = clampView(want);
      applyView(got);
      pull(want.y - got.y);
      return;
    }
    const {x, y} = toPage(e.clientX, e.clientY);
    switch (a.type) {
      case 'draw': {
        const min = 0.35 / view.current.zoom;
        for (const ev of list) {
          const pt = toPage(ev.clientX, ev.clientY);
          if (Math.hypot(pt.x - a.lx, pt.y - a.ly) < min) continue;
          const p = pressureOf(ev, a, pt.x, pt.y);
          a.stroke.pts.push(round(pt.x), round(pt.y), Math.round(p * 100) / 100);
          a.lx = pt.x; a.ly = pt.y; a.lt = ev.timeStamp; a.p = p;
        }
        schedule(() => { const ctx = liveCtx(); if (ctx && action.current === a) drawStroke(ctx, a.stroke); });
        break;
      }
      case 'erase': for (const ev of list) { const pt = toPage(ev.clientX, ev.clientY); eraseAt(pt.x, pt.y); } break;
      case 'shape': {
        a.x1 = x; a.y1 = y;
        schedule(() => { const ctx = liveCtx(); if (ctx) drawStroke(ctx, shapeStroke(a)); });
        break;
      }
      case 'rect': {
        a.x1 = x; a.y1 = y;
        schedule(() => {
          const ctx = liveCtx(); if (!ctx) return;
          ctx.save(); ctx.fillStyle = 'rgba(47,111,237,.08)'; ctx.strokeStyle = '#2f6fed'; ctx.lineWidth = 1.2 / view.current.zoom; ctx.setLineDash([5 / view.current.zoom, 4 / view.current.zoom]);
          ctx.beginPath(); ctx.rect(Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.abs(a.x1 - a.x0), Math.abs(a.y1 - a.y0)); ctx.fill(); ctx.stroke(); ctx.restore();
        });
        break;
      }
      case 'lasso': {
        a.pts.push(x, y);
        schedule(() => {
          const ctx = liveCtx(); if (!ctx) return;
          ctx.save(); ctx.fillStyle = 'rgba(47,111,237,.08)'; ctx.strokeStyle = '#2f6fed'; ctx.lineWidth = 1.2 / view.current.zoom; ctx.setLineDash([5 / view.current.zoom, 4 / view.current.zoom]);
          ctx.beginPath(); ctx.moveTo(a.pts[0], a.pts[1]); for (let i = 2; i < a.pts.length; i += 2) ctx.lineTo(a.pts[i], a.pts[i + 1]); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        });
        break;
      }
      case 'move': {
        a.dx = x - a.x0; a.dy = y - a.y0;
        schedule(() => {
          const moved = transformSelection(work.current, a.dx, a.dy);
          drawInk(moved.strokes);
          paperRef.current?.style.setProperty('--sel-dx', `${a.dx}px`);
          paperRef.current?.style.setProperty('--sel-dy', `${a.dy}px`);
        });
        break;
      }
      case 'scale': {
        const b = a.box;
        a.f = clamp(Math.max((x - b.x) / Math.max(1, b.w), (y - b.y) / Math.max(1, b.h)), 0.1, 10);
        schedule(() => {
          drawInk(transformSelection(work.current, 0, 0, a.f, b.x, b.y).strokes);
          paperRef.current?.style.setProperty('--sel-f', String(a.f));
        });
        break;
      }
      case 'tap': break;
    }
  };

  const shapeStroke = (a: Extract<Action, {type: 'shape'}>): Stroke => {
    const {settings} = propsRef.current;
    const pen = settings.pens[settings.activePen === 'highlighter' ? 'fineliner' : settings.activePen];
    return {id: shortId(), t: 'shape', shape: settings.shape, c: pen.color, w: Math.max(1, pen.width), o: 1, pts: shapePoints(settings.shape, a.x0, a.y0, a.x1, a.y1)};
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const P = propsRef.current;
    if (e.pointerType === 'pen') penSeen.current = Date.now();
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) gesture.current = null;
      if (touches.current.size >= 2) startGesture();
    }
    const a = action.current;
    if (!a || a.id !== e.pointerId) return;
    action.current = null;
    cancelAnimationFrame(raf.current);
    const cancelled = e.type === 'pointercancel';
    switch (a.type) {
      case 'draw': {
        liveCtx();
        if (cancelled) { drawInk(); break; }
        const next = {...work.current, strokes: [...work.current.strokes, a.stroke]};
        drawStroke(setupIncremental(), a.stroke);
        commit(next);
        if (a.stroke.pen !== 'highlighter') P.onPenStroke(a.stroke.id);
        break;
      }
      case 'erase': liveCtx(); if (a.changed && !cancelled) commit({...work.current, strokes: a.strokes}); else drawInk(); break;
      case 'shape': {
        liveCtx();
        if (cancelled || Math.hypot(a.x1 - a.x0, a.y1 - a.y0) < 4) break;
        commit({...work.current, strokes: [...work.current.strokes, shapeStroke(a)]});
        break;
      }
      case 'rect': case 'lasso': {
        liveCtx();
        if (cancelled) break;
        const c = work.current;
        let sel: Selection;
        if (a.type === 'rect') {
          const r: Box = {x: Math.min(a.x0, a.x1), y: Math.min(a.y0, a.y1), w: Math.abs(a.x1 - a.x0), h: Math.abs(a.y1 - a.y0)};
          if (r.w < 3 && r.h < 3) { P.onSelection({strokes: [], texts: []}); break; }
          sel = {strokes: c.strokes.filter(s => strokeInRect(s, r)).map(s => s.id), texts: c.texts.filter(t => t.x + t.w / 2 >= r.x && t.x + t.w / 2 <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h).map(t => t.id)};
        } else {
          if (a.pts.length < 6) { P.onSelection({strokes: [], texts: []}); break; }
          const poly = a.pts;
          sel = {strokes: c.strokes.filter(s => strokeInLasso(s, poly)).map(s => s.id), texts: c.texts.filter(t => {
            const cx = t.x + t.w / 2, cy = t.y + 10;
            let inside = false;
            for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) if ((poly[i + 1] > cy) !== (poly[j + 1] > cy) && cx < ((poly[j] - poly[i]) * (cy - poly[i + 1])) / (poly[j + 1] - poly[i + 1]) + poly[i]) inside = !inside;
            return inside;
          }).map(t => t.id)};
        }
        P.onSelection(sel);
        break;
      }
      case 'move': {
        paperRef.current?.style.setProperty('--sel-dx', '0px');
        paperRef.current?.style.setProperty('--sel-dy', '0px');
        if (cancelled || (Math.abs(a.dx) < 0.5 && Math.abs(a.dy) < 0.5)) { drawInk(); break; }
        commit(transformSelection(work.current, a.dx, a.dy));
        break;
      }
      case 'scale': {
        paperRef.current?.style.setProperty('--sel-f', '1');
        if (cancelled || Math.abs(a.f - 1) < 0.01) { drawInk(); break; }
        commit(transformSelection(work.current, 0, 0, a.f, a.box.x, a.box.y));
        break;
      }
      case 'tap': {
        if (!cancelled && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 10) P.onTap(a.x, a.y);
        break;
      }
      case 'pan': break;
    }
  };

  /** Yeni çizgiyi tüm katmanı yeniden çizmeden mürekkep tuvaline ekler (düşük gecikme). */
  const setupIncremental = () => {
    const c = inkRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    return ctx;
  };

  const startScale = (e: React.PointerEvent) => {
    e.stopPropagation();
    const box = selectionBox();
    if (!box) return;
    capture(vpRef.current!, e.pointerId);
    action.current = {type: 'scale', id: e.pointerId, box, f: 1};
  };

  // ------------------------------------------------------------ tekerlek / trackpad
  useEffect(() => {
    const el = vpRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        if (propsRef.current.zoomLock) return;
        zoomAt(view.current.zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
        return;
      }
      const k = e.deltaMode === 1 ? 32 : 1;
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * k, dy = (e.shiftKey ? 0 : e.deltaY) * k;
      const before = view.current;
      const next = clampView({...before, x: before.x - dx, y: before.y - dy});
      applyView(next, false);
      // Sayfanın sonunda kaydırmaya devam edilirse sonraki/önceki sayfaya geçilir.
      if (Math.abs(dy) > 0 && Math.abs(next.y - before.y) < 0.5) {
        overscroll.current += dy;
        if (Math.abs(overscroll.current) > 260) { propsRef.current.onOverscroll(overscroll.current > 0 ? 1 : -1); overscroll.current = 0; }
      } else overscroll.current = 0;
    };
    const stopGesture = (e: Event) => e.preventDefault(); // Safari'nin sayfayı yakınlaştırması engellenir
    el.addEventListener('wheel', onWheel, {passive: false});
    el.addEventListener('gesturestart', stopGesture);
    el.addEventListener('gesturechange', stopGesture);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('gesturestart', stopGesture); el.removeEventListener('gesturechange', stopGesture); };
  }, [zoomAt, applyView, clampView]);

  const box = props.selection.strokes.length || props.selection.texts.length ? selectionBox() : null;
  const cursor = props.tool === 'hand' ? 'grab' : props.tool === 'text' ? 'text' : props.tool === 'select' || props.tool === 'lasso' ? 'crosshair' : props.tool === 'eraser' ? 'cell' : 'crosshair';

  return (
    <div ref={vpRef} className={`viewport tool-${props.tool}`} style={{cursor}}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onContextMenu={e => e.preventDefault()}>
      <div ref={paperRef} className="paper" style={{width: W, height: H}}>
        <canvas ref={bgRef} className="layer" style={{width: W, height: H}} />
        {props.underlay}
        <canvas ref={inkRef} className="layer" style={{width: W, height: H}} />
        {props.overlay}
        <canvas ref={liveRef} className="layer layer-live" style={{width: W, height: H}} />
        {box && (
          <div className="selection-box" style={{left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12}}>
            <button type="button" className="handle handle-resize" aria-label="Seçimi boyutlandır (sürükle)" onPointerDown={startScale} />
            <div className="selection-tools" onPointerDown={e => e.stopPropagation()}>{props.selectionTools}</div>
          </div>
        )}
      </div>
    </div>
  );
});

export function textHeight(text: string, size: number) {
  return Math.max(1, text.split('\n').length) * size * 1.35 + 8;
}
