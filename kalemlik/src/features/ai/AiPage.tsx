// ✨ Kalemlik AI: kullanıcının kendi dersleri, notları, PDF'leri, görevleri, sınavları, flashcardları ve çalışma
// geçmişiyle çalışan asistan. Sohbet geçmişi sunucuda (kullanıcıya özel) saklanır; API anahtarı yalnızca sunucudadır.
import {useEffect, useRef, useState} from 'react';
import {BookmarkPlus, Copy, History, Layers, MessageSquarePlus, Paperclip, Send, Sparkles, Target, Trash2, X} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate, useLocation} from '@/app/router';
import {Button, Dialog, Field, IconButton} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {Markdown, plainText} from '@/components/Markdown';
import {api, ApiError} from '@/lib/api';
import {list} from '@/lib/store';
import {timeAgo} from '@/lib/format';
import {loadSource, sourceOptions, type SourceRef} from '@/features/study/sources';
import {refreshAiStatus, useAiStatus} from '@/features/study/generate';
import {openGenerate} from '@/features/study/GenerateDialog';
import {PlanDialog} from '@/features/study/PlanPage';
import {localAdvice} from '@/features/study/today';
import {saveTextToNotebook} from '@/features/study/saveToNotebook';

interface Conv {id: string; title: string; updatedAt: number}
interface Msg {id: string; role: 'user' | 'assistant'; content: string; meta: {context?: string; local?: boolean}; createdAt: number}

const QUICK: {label: string; text: string; needsSource?: boolean; action?: 'cards' | 'quiz' | 'plan'}[] = [
  {label: 'Bu notu özetle', text: 'Bu notu sınav çalışmasına uygun şekilde özetle.', needsSource: true},
  {label: 'Basitçe anlat', text: 'Bu konuyu çok basit, örneklerle anlat.', needsSource: true},
  {label: 'Sınav notu çıkar', text: 'Bu kaynaktan sınavdan önce okunacak kısa sınav notu çıkar: tanımlar, formüller, sık çıkan noktalar.', needsSource: true},
  {label: '20 soru hazırla', text: '', action: 'quiz'},
  {label: 'Flashcard oluştur', text: '', action: 'cards'},
  {label: 'Sınav çalışma programı', text: '', action: 'plan'},
  {label: 'Bu hafta neye çalışmalıyım?', text: 'Bu hafta hangi derslere çalışmalıyım? Teslim ve sınav tarihlerime, quiz sonuçlarıma göre öncelik sırası ver.'},
  {label: 'Bugünkü işlerimi planla', text: 'Bugünkü işlerimi planla: derslerim, teslimlerim, çalışma planım ve tekrar zamanı gelen kartlarıma göre saat saat öner.'},
];

export function AiPage() {
  const status = useAiStatus();
  const {query} = useLocation();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState(query.get('soru') || '');
  const [source, setSource] = useState<SourceRef | null>(() => {
    const k = query.get('kaynak'), id = query.get('id');
    if (!k || !id) return null;
    return sourceOptions().flatMap(g => g.items).find(i => i.kind === k && i.id === id) || null;
  });
  const [busy, setBusy] = useState('');
  const [showList, setShowList] = useState(false);
  const [pick, setPick] = useState(false);
  const [save, setSave] = useState<Msg | null>(null);
  const [plan, setPlan] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const enabled = !!status?.configured;

  const loadConvs = async () => { try { const r = await api<{conversations: Conv[]}>('/api/ai/conversations'); setConvs(r.conversations); } catch { /* çevrimdışı */ } };
  useEffect(() => { void loadConvs(); }, []);
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    let alive = true;
    api<{messages: Msg[]}>(`/api/ai/conversations/${active}/messages`).then(r => { if (alive) setMessages(r.messages); }).catch(() => {});
    return () => { alive = false; };
  }, [active]);
  useEffect(() => { endRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'}); }, [messages.length, busy]);

  const send = async (raw = text) => {
    const body = raw.trim();
    if (!body || busy) return;
    setText('');
    // AI yoksa ya da çevrimdışıysa: plan/öneri soruları cihazdaki verilerle yanıtlanır.
    if (!enabled || !navigator.onLine) {
      const local = localAdvice(body);
      const now = Date.now();
      setMessages(m => [...m, {id: `u${now}`, role: 'user', content: body, meta: {}, createdAt: now}, {id: `a${now}`, role: 'assistant', meta: {local: true}, createdAt: now + 1,
        content: local ? `${local}\n\n_Bu yanıt cihazındaki verilerden hazırlandı${enabled ? ' (çevrimdışısın)' : ''}._` : enabled ? 'Çevrimdışısın. İnternete bağlanınca Kalemlik AI yanıt verebilir; bu arada "Bugünkü işlerimi planla" gibi planlama sorularını cihazında yanıtlayabilirim.' : 'Kalemlik AI bu sunucuda henüz etkin değil (yönetici API anahtarı eklemeli). Yine de "Bugünkü işlerimi planla" ve "Bu hafta neye çalışmalıyım?" sorularını verilerinle yanıtlayabilirim; flashcard, quiz ve çalışma planı da kural tabanlı üretilir.'}]);
      return;
    }
    setBusy(source ? 'Kaynak hazırlanıyor…' : 'Düşünüyor…');
    try {
      let id = active;
      if (!id) {
        const r = await api<{conversation: Conv}>('/api/ai/conversations', {method: 'POST', json: {}});
        id = r.conversation.id;
        setActive(id);
      }
      const ctx = source ? await loadSource(source) : null;
      setBusy('Düşünüyor…');
      const tempId = `tmp${Date.now()}`;
      setMessages(m => [...m, {id: tempId, role: 'user', content: body, meta: {context: source?.label}, createdAt: Date.now()}]);
      const r = await api<{messages: Msg[]; title: string}>(`/api/ai/conversations/${id}/messages`, {method: 'POST', json: {text: body, ...(ctx ? {context: {title: ctx.title, course: ctx.course, text: ctx.text, images: ctx.images}, contextLabel: source!.label} : {})}});
      setMessages(m => [...m.filter(x => x.id !== tempId), ...r.messages]);
      void loadConvs();
      void refreshAiStatus();
    } catch (e) {
      setMessages(m => m.filter(x => !x.id.startsWith('tmp')));
      setText(body);
      toast(e instanceof ApiError ? e.message : 'Yanıt alınamadı.', 'error');
    } finally { setBusy(''); }
  };

  const quick = (q: typeof QUICK[number]) => {
    if (q.action === 'cards') { openGenerate({kind: 'flashcards', source: source ? {kind: source.kind, id: source.id} : undefined}); return; }
    if (q.action === 'quiz') { openGenerate({kind: 'quiz', source: source ? {kind: source.kind, id: source.id} : undefined}); return; }
    if (q.action === 'plan') { setPlan(true); return; }
    if (q.needsSource && !source) { setPick(true); setText(q.text); return; }
    void send(q.text);
  };

  const newChat = () => { setActive(null); setMessages([]); setShowList(false); };
  const removeConv = async (c: Conv) => {
    if (!(await confirmDialog({title: 'Sohbet silinsin mi?', message: `"${c.title}" silinecek.`, confirmLabel: 'Sil', danger: true}))) return;
    await api(`/api/ai/conversations/${c.id}`, {method: 'DELETE'}).catch(() => {});
    if (active === c.id) newChat();
    void loadConvs();
  };

  return (
    <div className="page page-wide ai-page">
      <PageHeader title="Kalemlik AI" subtitle={enabled ? <>Derslerin, notların, görevlerin ve çalışma geçmişinle çalışır · bugün {status!.usage.today}/{status!.usage.limit}</> : 'Planlama cevapları cihazında; flashcard, quiz ve plan kural tabanlı'} actions={<>
        <Button variant="ghost" icon={<History size={18} />} className="ai-history-toggle" onClick={() => setShowList(!showList)}>Geçmiş</Button>
        <Button icon={<MessageSquarePlus size={18} />} onClick={newChat}>Yeni sohbet</Button>
      </>} />
      <div className="ai-layout">
        <aside className={`card ai-list ${showList ? 'is-open' : ''}`} aria-label="Sohbet geçmişi">
          <div className="row ai-list-head"><strong>Sohbetler</strong><span className="spacer" /><IconButton size="sm" label="Kapat" className="ai-history-toggle" onClick={() => setShowList(false)}><X size={16} /></IconButton></div>
          {convs.length ? convs.map(c => (
            <div key={c.id} className={`ai-conv ${active === c.id ? 'is-active' : ''}`}>
              <button type="button" onClick={() => { setActive(c.id); setShowList(false); }}><span className="ai-conv-title">{c.title}</span><span className="muted small">{timeAgo(c.updatedAt)}</span></button>
              <IconButton size="sm" label="Sohbeti sil" onClick={() => void removeConv(c)}><Trash2 size={15} /></IconButton>
            </div>
          )) : <p className="muted small">Henüz sohbet yok.</p>}
        </aside>
        <section className="card ai-chat">
          <div className="ai-messages" aria-live="polite">
            {!messages.length && (
              <div className="ai-welcome">
                <span className="ai-orb"><Sparkles size={26} /></span>
                <h2>Bugün ne çalışmalıyım?</h2>
                <p className="muted">Notunu, PDF’ini ya da ders kaydını ekle; özetleyeyim, basitçe anlatayım, soru ya da flashcard hazırlayayım. Sınavına göre çalışma programı da çıkarabilirim.</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`ai-msg ai-${m.role}`}>
                {m.meta.context && <span className="ai-ctx"><Paperclip size={13} /> {m.meta.context}</span>}
                {m.role === 'assistant' ? <Markdown text={m.content} /> : <p>{m.content}</p>}
                {m.role === 'assistant' && !m.meta.local && (
                  <div className="ai-actions">
                    <Button size="sm" variant="ghost" icon={<BookmarkPlus size={15} />} onClick={() => setSave(m)}>Deftere kaydet</Button>
                    <Button size="sm" variant="ghost" icon={<Layers size={15} />} onClick={() => openGenerate({kind: 'flashcards', text: plainText(m.content), title: 'Kalemlik AI kartları'})}>Flashcard yap</Button>
                    <Button size="sm" variant="ghost" icon={<Target size={15} />} onClick={() => openGenerate({kind: 'quiz', text: plainText(m.content), title: 'Kalemlik AI quizi'})}>Quiz yap</Button>
                    <IconButton size="sm" label="Kopyala" onClick={() => { void navigator.clipboard?.writeText(plainText(m.content)).then(() => toast('Kopyalandı.', 'info')); }}><Copy size={15} /></IconButton>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="ai-msg ai-assistant ai-typing"><span className="spinner" /> {busy}</div>}
            <div ref={endRef} />
          </div>
          <div className="ai-quick" role="group" aria-label="Hızlı komutlar">
            {QUICK.map(q => <button key={q.label} type="button" className="chip" onClick={() => quick(q)} disabled={!!busy}>{q.label}</button>)}
          </div>
          <form className="ai-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
            {source && <span className="chip is-on ai-source"><Paperclip size={14} /> {source.label}<button type="button" aria-label="Kaynağı kaldır" onClick={() => setSource(null)}><X size={14} /></button></span>}
            <div className="ai-compose-row">
              <IconButton label="Not, PDF ya da kayıt ekle" onClick={() => setPick(true)}><Paperclip size={20} /></IconButton>
              <textarea className="textarea ai-input" rows={1} value={text} maxLength={8000} placeholder="Kalemlik AI’ya sor…" onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} aria-label="Mesaj" />
              <IconButton label="Gönder" className="ai-send" disabled={!text.trim() || !!busy} onClick={() => void send()}><Send size={20} /></IconButton>
            </div>
          </form>
        </section>
      </div>
      {pick && <SourcePicker onPick={s => { setSource(s); setPick(false); }} onClose={() => setPick(false)} />}
      {save && <SaveDialog msg={save} onClose={() => setSave(null)} />}
      {plan && <PlanDialog onClose={() => setPlan(false)} />}
    </div>
  );
}

function SourcePicker({onPick, onClose}: {onPick: (s: SourceRef) => void; onClose: () => void}) {
  const groups = sourceOptions();
  const [q, setQ] = useState('');
  const match = (s: SourceRef) => !q || `${s.label} ${s.course}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'));
  return (
    <Dialog open onClose={onClose} title="Kaynak ekle" size="md">
      <div className="stack">
        <input className="input" autoFocus placeholder="Defter, PDF, deste, kayıt ya da ders ara…" value={q} onChange={e => setQ(e.target.value)} aria-label="Kaynak ara" />
        {groups.map(g => {
          const items = g.items.filter(match);
          if (!items.length) return null;
          return (
            <section key={g.group} className="stack-tight">
              <h3 className="group-title">{g.group}</h3>
              {items.slice(0, 30).map(s => <button key={`${s.kind}:${s.id}`} type="button" className="card list-row pick-row" onClick={() => onPick(s)}><span className="list-row-main"><strong>{s.label}</strong>{s.course && s.kind !== 'course' && <span className="muted small">{s.course}</span>}</span></button>)}
            </section>
          );
        })}
        {!groups.length && <p className="muted">Henüz defter, deste ya da kayıt yok.</p>}
      </div>
    </Dialog>
  );
}

function SaveDialog({msg, onClose}: {msg: Msg; onClose: () => void}) {
  const notebooks = list('notebook').filter(n => n.trashedAt === null);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState(msg.content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').replace(/\*\*/g, '').slice(0, 80) || 'Kalemlik AI notu');
  const run = () => {
    const r = saveTextToNotebook(target, title, plainText(msg.content));
    toast(`${r.pages} sayfa deftere eklendi.`, 'success', {label: 'Aç', run: () => navigate(`/defter/${r.notebookId}`)});
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Deftere kaydet" footer={<><span className="spacer" /><Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={run}>Kaydet</Button></>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); run(); }}>
        <Field label="Başlık" htmlFor="sv-title"><input id="sv-title" className="input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Defter" htmlFor="sv-nb">
          <select id="sv-nb" className="select" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Yeni defter oluştur</option>
            {notebooks.map(n => <option key={n.id} value={n.id}>{n.title}{n.course ? ` · ${n.course}` : ''}</option>)}
          </select>
        </Field>
        <p className="muted small">Metin, defterin sonuna yeni sayfa(lar) olarak eklenir; sonra üzerine yazabilir, düzenleyebilirsin.</p>
      </form>
    </Dialog>
  );
}
