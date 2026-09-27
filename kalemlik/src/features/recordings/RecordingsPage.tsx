// 🎙️ Ders kayıtları: derse bağlı ses kaydı, bookmark ("12:32 → Önemli formül"), canlı ya da sunucuda transkript,
// Kalemlik AI ile özet / önemli noktalar / konu başlıkları, quiz ve flashcard. Kayıt çevrimdışı da alınır; ses
// dosyası internet gelince yüklenir.
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, Bookmark, BookOpen, Circle, FileText, Layers, Mic, Pause, Play, Plus, Sparkles, Square, Target, Trash2, X, Wand2} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate} from '@/app/router';
import {Badge, Button, Dialog, EmptyState, Field, IconButton, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {Markdown} from '@/components/Markdown';
import {api, ApiError} from '@/lib/api';
import {list, put, remove, update, useList, useRecord} from '@/lib/store';
import {saveFile} from '@/lib/files';
import {useFileUrl} from '@/lib/useFile';
import {shortId, uuid} from '@/lib/ids';
import {formatDate, isoDate} from '@/lib/format';
import {useSettings} from '@/lib/settings';
import type {Bookmark as Mark, Recording} from '@/lib/types';
import {allCourses, recordingSource} from '@/features/study/sources';
import {generateSummary, useAiStatus} from '@/features/study/generate';
import {openGenerate} from '@/features/study/GenerateDialog';
import {saveTextToNotebook} from '@/features/study/saveToNotebook';
import {clock, LectureRecorder, linesToTranscript, liveTranscriptSupported, recordingSupported} from './recorder';

export function RecordingsPage() {
  const recs = useList('recording');
  const [recording, setRecording] = useState(false);
  const [course, setCourse] = useState('');
  const courses = allCourses();
  const sorted = [...recs].sort((a, b) => b.createdAt - a.createdAt);
  if (recording) return <RecorderView course={course} onDone={id => { setRecording(false); if (id) navigate(`/kayitlar/${id}`); }} />;
  return (
    <div className="page">
      <PageHeader title="Ders kayıtları" subtitle="Dersi kaydet, önemli anları işaretle, sonra metne çevir, özetle ve soru üret." actions={
        <Button variant="primary" icon={<Mic size={18} />} disabled={!recordingSupported()} onClick={() => setRecording(true)}>Kayda başla</Button>
      } />
      {!recordingSupported() && <p className="notice notice-warn">Bu tarayıcı ses kaydını desteklemiyor. Güncel Chrome, Edge ya da Safari kullan.</p>}
      <div className="toolbar-row">
        <label className="muted small" htmlFor="rc-course">Kayıt dersi</label>
        <input id="rc-course" className="input input-sm rc-course" list="rc-courses" value={course} maxLength={120} placeholder="ör. Fizik II" onChange={e => setCourse(e.target.value)} />
        <datalist id="rc-courses">{courses.map(c => <option key={c} value={c} />)}</datalist>
      </div>
      {sorted.length ? (
        <div className="list-stack">
          {sorted.map(r => (
            <a key={r.id} {...linkProps(`/kayitlar/${r.id}`)} className="card list-row">
              <span className="stat-icon"><Mic size={18} /></span>
              <span className="list-row-main"><strong>{r.title}</strong><span className="muted small">{r.course || 'Ders yok'} · {clock(r.durationMs)} · {formatDate(isoDate(new Date(r.createdAt)))} · {r.bookmarks.length} işaret</span></span>
              {r.summary ? <Badge tone="success">Özet var</Badge> : r.transcript ? <Badge tone="accent">Transkript</Badge> : null}
            </a>
          ))}
        </div>
      ) : <EmptyState icon={<Mic size={28} />} title="Henüz ders kaydı yok">Ders anlatılırken kaydet; önemli formül ya da ödev duyurusu geldiğinde tek dokunuşla işaretle.</EmptyState>}
    </div>
  );
}

function RecorderView({course, onDone}: {course: string; onDone: (id?: string) => void}) {
  const settings = useSettings();
  const recorder = useRef(new LectureRecorder());
  const [, force] = useState(0);
  const [live, setLive] = useState(liveTranscriptSupported());
  const [marks, setMarks] = useState<Mark[]>([]);
  const [title, setTitle] = useState(`${course || 'Ders'} · ${formatDate(isoDate(new Date()), false)}`);
  const [busy, setBusy] = useState(false);
  const r = recorder.current;
  useEffect(() => {
    r.onChange = () => force(n => n + 1);
    const t = setInterval(() => force(n => n + 1), 500);
    return () => { clearInterval(t); if (r.state !== 'idle') r.cancel(); };
  }, [r]);
  const start = async () => {
    try { await r.start({live, lang: settings.write.lang}); }
    catch (e) { toast((e as Error)?.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından Kalemlik’e mikrofon izni ver.' : 'Mikrofon açılamadı.', 'error'); }
  };
  const mark = () => setMarks(m => [...m, {id: shortId(), t: r.elapsed(), label: `Önemli an ${m.length + 1}`}]);
  const finish = async () => {
    setBusy(true);
    try {
      const {blob, durationMs, mime} = await r.stop();
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const fileId = await saveFile(blob, 'audio', `${title}.${ext}`);
      const id = uuid();
      put('recording', {id, title: title.trim() || 'Ders kaydı', course: course.trim(), fileId, durationMs, bookmarks: marks, transcript: linesToTranscript(r.lines), summary: '', notebookId: ''});
      toast('Kayıt kaydedildi. Ses dosyası internet bağlantısıyla yüklenir.', 'success');
      onDone(id);
    } catch { toast('Kayıt kaydedilemedi.', 'error'); setBusy(false); }
  };
  const state = r.state;
  return (
    <div className="page page-narrow recorder">
      <div className="row"><button type="button" className="back-link" onClick={async () => { if (state === 'idle' || await confirmDialog({title: 'Kayıt iptal edilsin mi?', message: 'Kaydedilmemiş ses silinecek.', confirmLabel: 'İptal et', danger: true})) { r.cancel(); onDone(); } }}><X size={18} /> Vazgeç</button></div>
      <Field label="Kayıt adı" htmlFor="rc-title"><input id="rc-title" className="input" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></Field>
      <div className={`card recorder-stage state-${state}`}>
        <span className="rec-dot" aria-hidden="true"><Circle size={14} /></span>
        <span className="rec-time" role="timer" aria-live="off">{clock(r.elapsed())}</span>
        <span className="muted small">{state === 'recording' ? 'Kaydediliyor' : state === 'paused' ? 'Duraklatıldı' : 'Hazır'}{course && ` · ${course}`}</span>
        <div className="rec-controls">
          {state === 'idle' && <Button variant="primary" size="lg" icon={<Mic size={20} />} onClick={() => void start()}>Kaydı başlat</Button>}
          {state === 'recording' && <Button size="lg" icon={<Pause size={20} />} onClick={() => r.pause()}>Duraklat</Button>}
          {state === 'paused' && <Button size="lg" variant="primary" icon={<Play size={20} />} onClick={() => r.resume()}>Devam et</Button>}
          {state !== 'idle' && <Button size="lg" icon={<Bookmark size={20} />} onClick={mark}>İşaretle</Button>}
          {state !== 'idle' && <Button size="lg" variant="danger" icon={<Square size={18} />} busy={busy} onClick={() => void finish()}>Bitir</Button>}
        </div>
        {state === 'idle' && (liveTranscriptSupported()
          ? <Switch label="Canlı transkript" description="Konuşmalar kayıt sırasında yazıya dökülür (tarayıcının konuşma tanıması)." checked={live} onChange={setLive} />
          : <p className="muted small">Bu tarayıcıda canlı transkript yok; kayıttan sonra sunucuda metne çevirebilirsin (varsa).</p>)}
      </div>
      {marks.length > 0 && (
        <section className="stack-tight">
          <h3 className="group-title">İşaretler</h3>
          {marks.map(m => (
            <div key={m.id} className="bookmark-row">
              <span className="bm-time">{clock(m.t)}</span>
              <input className="input input-sm" value={m.label} maxLength={200} onChange={e => setMarks(ms => ms.map(x => (x.id === m.id ? {...x, label: e.target.value} : x)))} aria-label="İşaret notu" />
              <IconButton size="sm" label="İşareti sil" onClick={() => setMarks(ms => ms.filter(x => x.id !== m.id))}><Trash2 size={15} /></IconButton>
            </div>
          ))}
        </section>
      )}
      {(r.lines.length > 0 || r.interim) && (
        <section className="card card-pad live-transcript" aria-live="polite">
          {r.lines.slice(-12).map((l, i) => <p key={i}><span className="bm-time">{clock(l.t)}</span> {l.text}</p>)}
          {r.interim && <p className="muted">{r.interim}…</p>}
        </section>
      )}
    </div>
  );
}

export function RecordingDetail({id}: {id: string}) {
  const rec = useRecord('recording', id);
  const url = useFileUrl(rec?.fileId || undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const ai = useAiStatus();
  const [busy, setBusy] = useState('');
  const [transcript, setTranscript] = useState(rec?.transcript || '');
  const [link, setLink] = useState(false);
  const [canServer, setCanServer] = useState(false);
  useEffect(() => { setTranscript(rec?.transcript || ''); }, [rec?.transcript]);
  useEffect(() => { api<{available: boolean}>('/api/recordings/transcribe-status').then(r => setCanServer(r.available)).catch(() => {}); }, []);
  const marks = useMemo(() => [...(rec?.bookmarks || [])].sort((a, b) => a.t - b.t), [rec?.bookmarks]);
  if (!rec) return <div className="page"><EmptyState icon={<X size={28} />} title="Kayıt bulunamadı" action={<Button onClick={() => navigate('/kayitlar')}>Kayıtlara dön</Button>} /></div>;
  const seek = (t: number) => { if (audio.current) { audio.current.currentTime = t / 1000; void audio.current.play().catch(() => {}); } };
  const addMark = () => update('recording', rec.id, {bookmarks: [...rec.bookmarks, {id: shortId(), t: Math.round((audio.current?.currentTime || 0) * 1000), label: 'Önemli an'}]});
  const saveTranscript = () => { if (transcript !== rec.transcript) { update('recording', rec.id, {transcript}); toast('Transkript kaydedildi.', 'success'); } };
  const serverTranscribe = async () => {
    setBusy('transcribe');
    try { const r = await api<{transcript: string}>(`/api/recordings/${rec.id}/transcribe`, {method: 'POST', json: {}}); update('recording', rec.id, {transcript: r.transcript}); setTranscript(r.transcript); toast('Kayıt metne çevrildi.', 'success'); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Metne çevrilemedi.', 'error'); } finally { setBusy(''); }
  };
  const summarize = async () => {
    if (!rec.transcript.trim()) { toast('Önce transkript gerekli.', 'info'); return; }
    setBusy('summary');
    try {
      const r = await generateSummary(recordingSource(rec.id));
      const md = `${r.data.summary}\n\n${r.data.keyPoints.length ? `### Önemli noktalar\n${r.data.keyPoints.map(k => `- ${k}`).join('\n')}\n\n` : ''}${r.data.topics.length ? `### Konu başlıkları\n${r.data.topics.map(t => `- ${t}`).join('\n')}` : ''}`;
      update('recording', rec.id, {summary: md.trim()});
      toast(r.via === 'ai' ? 'Özet hazır.' : `Özet hazır. ${r.note || ''}`, r.via === 'ai' ? 'success' : 'info');
    } catch (e) { toast(e instanceof Error ? e.message : 'Özet çıkarılamadı.', 'error'); } finally { setBusy(''); }
  };
  const nb = rec.notebookId ? list('notebook').find(n => n.id === rec.notebookId) : undefined;
  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/kayitlar')}><ArrowLeft size={18} /> Kayıtlar</button>
      <PageHeader title={rec.title} subtitle={`${rec.course || 'Ders yok'} · ${clock(rec.durationMs)} · ${formatDate(isoDate(new Date(rec.createdAt)))}`} actions={
        <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => { if (await confirmDialog({title: 'Kayıt silinsin mi?', message: 'Ses, işaretler ve transkript silinecek.', confirmLabel: 'Sil', danger: true})) { remove('recording', rec.id); navigate('/kayitlar'); } }}>Sil</Button>
      } />
      <div className="card card-pad stack">
        {url ? <audio ref={audio} className="rec-audio" src={url} controls preload="metadata" /> : <p className="muted small">Ses dosyası bu cihazda yok; internete bağlanınca indirilir.</p>}
        <div className="row wrap">
          <Button size="sm" icon={<Bookmark size={16} />} onClick={addMark} disabled={!url}>Şu ana işaret koy</Button>
          <Button size="sm" variant="ghost" icon={<BookOpen size={16} />} onClick={() => setLink(true)}>{nb ? `Defter: ${nb.title}` : 'Deftere bağla'}</Button>
        </div>
        {marks.length > 0 && (
          <div className="stack-tight">
            {marks.map(m => (
              <div key={m.id} className="bookmark-row">
                <button type="button" className="bm-time bm-jump" onClick={() => seek(m.t)} aria-label={`${clock(m.t)} anına git`}>{clock(m.t)}</button>
                <input className="input input-sm" defaultValue={m.label} maxLength={200} onBlur={e => { if (e.target.value !== m.label) update('recording', rec.id, {bookmarks: rec.bookmarks.map(b => (b.id === m.id ? {...b, label: e.target.value} : b))}); }} aria-label="İşaret notu" />
                <IconButton size="sm" label="İşareti sil" onClick={() => update('recording', rec.id, {bookmarks: rec.bookmarks.filter(b => b.id !== m.id)})}><Trash2 size={15} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="card card-pad stack">
        <div className="row wrap"><h2 className="row"><FileText size={20} /> Transkript</h2><span className="spacer" />
          {canServer && <Button size="sm" icon={<Wand2 size={16} />} busy={busy === 'transcribe'} onClick={() => void serverTranscribe()}>{rec.transcript ? 'Yeniden metne çevir' : 'Metne çevir'}</Button>}
        </div>
        <textarea className="textarea transcript" rows={8} value={transcript} maxLength={500000} onChange={e => setTranscript(e.target.value)} onBlur={saveTranscript} placeholder={canServer ? '“Metne çevir” ile kaydı yazıya dök ya da buraya kendin yaz.' : 'Kayıt sırasında canlı transkript açıksa burada görünür. Kendin de yazabilir ya da düzeltebilirsin.'} />
        <div className="row wrap">
          <Button size="sm" variant="primary" icon={<Sparkles size={16} />} busy={busy === 'summary'} onClick={() => void summarize()} disabled={!rec.transcript.trim()}>{ai?.configured ? 'AI ile özetle' : 'Özet çıkar'}</Button>
          <Button size="sm" icon={<Target size={16} />} disabled={!rec.transcript.trim()} onClick={() => openGenerate({kind: 'quiz', source: {kind: 'recording', id: rec.id}})}>Quiz oluştur</Button>
          <Button size="sm" icon={<Layers size={16} />} disabled={!rec.transcript.trim()} onClick={() => openGenerate({kind: 'flashcards', source: {kind: 'recording', id: rec.id}})}>Flashcard oluştur</Button>
          <Button size="sm" variant="ghost" icon={<Plus size={16} />} disabled={!rec.transcript.trim()} onClick={() => { const r = saveTextToNotebook(rec.notebookId, `${rec.title} · transkript`, rec.transcript, rec.course); if (!rec.notebookId) update('recording', rec.id, {notebookId: r.notebookId}); toast('Transkript deftere eklendi.', 'success', {label: 'Aç', run: () => navigate(`/defter/${r.notebookId}`)}); }}>Transkripti deftere ekle</Button>
        </div>
      </section>

      {rec.summary && (
        <section className="card card-pad stack">
          <h2 className="row"><Sparkles size={20} /> Özet</h2>
          <Markdown text={rec.summary} />
          <div className="row wrap"><Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => { const r = saveTextToNotebook(rec.notebookId, `${rec.title} · özet`, rec.summary.replace(/\*\*/g, ''), rec.course); toast('Özet deftere eklendi.', 'success', {label: 'Aç', run: () => navigate(`/defter/${r.notebookId}`)}); }}>Özeti deftere ekle</Button></div>
        </section>
      )}
      {link && <LinkNotebookDialog rec={rec} onClose={() => setLink(false)} />}
    </div>
  );
}

function LinkNotebookDialog({rec, onClose}: {rec: Recording; onClose: () => void}) {
  const notebooks = list('notebook').filter(n => n.trashedAt === null);
  const [target, setTarget] = useState(rec.notebookId);
  return (
    <Dialog open onClose={onClose} title="Deftere bağla" footer={<><span className="spacer" /><Button variant="primary" onClick={() => { update('recording', rec.id, {notebookId: target}); onClose(); }}>Kaydet</Button></>}>
      <Field label="Defter" htmlFor="rc-nb">
        <select id="rc-nb" className="select" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Bağlı değil</option>
          {notebooks.map(n => <option key={n.id} value={n.id}>{n.title}{n.course ? ` · ${n.course}` : ''}</option>)}
        </select>
      </Field>
    </Dialog>
  );
}
