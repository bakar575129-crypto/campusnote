// 🎓 Notlarım: üniversite/bölüm/dönem, dersler (kredi, AKTS, vize, final, ödev, quiz, diğer + özel ağırlıklar),
// ders notu, harf notu, dönem ortalaması, GANO, AKTS toplamı ve "Finalden kaç almalıyım?".
import {useMemo, useState} from 'react';
import {Award, Calculator, GraduationCap, Plus, Scale, Trash2, Save} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {setUser, useSession} from '@/app/session';
import {Badge, Button, Dialog, EmptyState, Field, Switch} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {api} from '@/lib/api';
import {put, remove, useList} from '@/lib/store';
import {shortId, uuid} from '@/lib/ids';
import {currentTerm} from '@/lib/format';
import {updateSettings, useSettings} from '@/lib/settings';
import type {GradeComponent, GradeCourse, User} from '@/lib/types';
import {courseAverage, courseLetter, DEFAULT_COMPONENTS, DEFAULT_SCALE, gpa, neededFinal, neededScore, type ScaleRow} from './grades';

const COMPONENT_PRESETS = ['Vize', 'Final', 'Ödev', 'Quiz', 'Proje', 'Laboratuvar', 'Bütünleme', 'Diğer'];
const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr', {minimumFractionDigits: 2, maximumFractionDigits: 2}));

export function GradesPage() {
  const {user} = useSession();
  const settings = useSettings();
  const courses = useList('gradeCourse');
  const [term, setTerm] = useState(currentTerm());
  const terms = useMemo(() => [...new Set([currentTerm(), term, ...courses.map(c => c.term).filter(Boolean)])].sort().reverse(), [courses, term]);
  const [edit, setEdit] = useState<GradeCourse | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [newTerm, setNewTerm] = useState<string | null>(null);
  const scale = settings.gradeScale, rounding = settings.gradeRounding;
  const termCourses = courses.filter(c => c.term === term).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const termStats = gpa(termCourses, scale, rounding);
  const all = gpa(courses, scale, rounding);
  const newCourse = (): GradeCourse => ({id: uuid(), rev: 0, createdAt: 0, updatedAt: 0, term, name: '', credit: 3, ects: 5, components: DEFAULT_COMPONENTS.map(c => ({...c, id: shortId()})), letter: '', included: true});

  return (
    <div className="page">
      <PageHeader title="Notlarım" subtitle={<ProfileLine user={user} />} actions={<>
        <Button variant="ghost" icon={<Scale size={18} />} onClick={() => setScaleOpen(true)}>Harf ölçeği</Button>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEdit(newCourse())}>Ders ekle</Button>
      </>} />
      <div className="stat-tiles">
        <div className="card stat-tile"><span className="stat-icon"><GraduationCap size={20} /></span><div><strong className="stat-num">{fmt(all.gpa)}</strong><span className="muted small">GANO / genel ortalama</span></div></div>
        <div className="card stat-tile"><span className="stat-icon"><Calculator size={20} /></span><div><strong className="stat-num">{fmt(termStats.gpa)}</strong><span className="muted small">{term} ortalaması</span></div></div>
        <div className="card stat-tile"><span className="stat-icon"><Award size={20} /></span><div><strong className="stat-num">{all.ects}</strong><span className="muted small">toplam AKTS · {all.credit} kredi</span></div></div>
      </div>
      <div className="toolbar-row">
        <label className="muted small" htmlFor="gr-term">Dönem</label>
        <select id="gr-term" className="select select-sm" value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t} value={t}>{t}</option>)}</select>
        {newTerm === null ? <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setNewTerm('')}>Yeni dönem</Button> : (
          <form className="row" onSubmit={e => { e.preventDefault(); if (newTerm.trim()) { setTerm(newTerm.trim()); setNewTerm(null); } }}>
            <input className="input input-sm" autoFocus value={newTerm} maxLength={60} placeholder="ör. 2027 Bahar" onChange={e => setNewTerm(e.target.value)} aria-label="Yeni dönem adı" />
            <Button size="sm" variant="primary" type="submit">Ekle</Button>
          </form>
        )}
      </div>
      {termCourses.length ? (
        <div className="list-stack">
          {termCourses.map(c => {
            const a = courseAverage(c, rounding);
            const l = courseLetter(c, scale, rounding);
            return (
              <button key={c.id} type="button" className={`card list-row grade-row-item ${c.included ? '' : 'is-excluded'}`} onClick={() => setEdit(c)}>
                <span className="list-row-main">
                  <strong>{c.name}</strong>
                  <span className="muted small">{c.credit} kredi · {c.ects} AKTS · {c.components.map(x => `${x.name} %${x.weight}${x.score !== null ? `: ${x.score}` : ''}`).join(' · ')}</span>
                  {!a.complete && a.missing.length === 1 && <span className="small need-line">{a.missing[0].name} için: {[70, 60, 50].map(t => { const n = neededScore(c.components, a.missing[0].id, t, rounding); return `${scale.find(r => r.min === t)?.letter || t} → ${n === 'done' ? 'tamam' : n === 'impossible' ? 'yetmez' : n}`; }).join(' · ')}</span>}
                </span>
                <span className="grade-score">{a.avg !== null ? <strong>{fmt(a.avg)}</strong> : <span className="muted">—</span>}{!a.complete && a.avg !== null && <span className="muted small">şimdilik</span>}</span>
                {l ? <Badge tone={l.point >= 3 ? 'success' : l.point >= 2 ? 'accent' : l.point > 0 ? 'warning' : 'danger'}>{l.letter}{l.manual ? '*' : ''}</Badge> : <Badge>Devam</Badge>}
              </button>
            );
          })}
        </div>
      ) : <EmptyState icon={<GraduationCap size={28} />} title={`${term} için ders yok`} action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setEdit(newCourse())}>Ders ekle</Button>}>Derslerini, kredilerini ve notlarını ekle; ortalaman ve AKTS toplamın otomatik hesaplansın.</EmptyState>}
      <FinalCalculator rounding={rounding} />
      {edit && <CourseDialog course={edit} scale={scale} rounding={rounding} onClose={() => setEdit(null)} />}
      {scaleOpen && <ScaleDialog scale={scale} rounding={rounding} onClose={() => setScaleOpen(false)} />}
    </div>
  );
}

function ProfileLine({user}: {user: User | null}) {
  const [editing, setEditing] = useState(false);
  const [uni, setUni] = useState(user?.university || '');
  const [dep, setDep] = useState(user?.department || '');
  if (!user) return null;
  if (!editing) return <button type="button" className="link-btn" onClick={() => setEditing(true)}>{user.university || user.department ? [user.university, user.department].filter(Boolean).join(' · ') : 'Üniversite ve bölüm ekle'}</button>;
  const save = async () => {
    try { const r = await api<{user: User}>('/api/auth/profile', {method: 'PATCH', json: {name: user.name, university: uni.trim(), department: dep.trim()}}); setUser(r.user); setEditing(false); toast('Kaydedildi.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Kaydedilemedi.', 'error'); }
  };
  return (
    <span className="row wrap profile-edit">
      <input className="input input-sm" value={uni} maxLength={120} placeholder="Üniversite" onChange={e => setUni(e.target.value)} aria-label="Üniversite" />
      <input className="input input-sm" value={dep} maxLength={120} placeholder="Bölüm" onChange={e => setDep(e.target.value)} aria-label="Bölüm" />
      <Button size="sm" variant="primary" icon={<Save size={15} />} onClick={() => void save()}>Kaydet</Button>
    </span>
  );
}

function CourseDialog({course, scale, rounding, onClose}: {course: GradeCourse; scale: ScaleRow[]; rounding: boolean; onClose: () => void}) {
  const [v, setV] = useState(course);
  const exists = !!course.createdAt;
  const a = courseAverage(v, rounding);
  const setComp = (id: string, patch: Partial<GradeComponent>) => setV({...v, components: v.components.map(c => (c.id === id ? {...c, ...patch} : c))});
  const save = () => {
    if (!v.name.trim()) { toast('Ders adını yaz.', 'error'); return; }
    const {id, term, name, credit, ects, components, letter, included} = v;
    put('gradeCourse', {id, term, name: name.trim(), credit, ects, components, letter, included});
    onClose();
  };
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.min(100, Number(s.replace(',', '.')))));
  return (
    <Dialog open onClose={onClose} size="lg" title={exists ? v.name || 'Ders' : 'Yeni ders'} footer={<>
      {exists && <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => { if (await confirmDialog({title: 'Ders silinsin mi?', message: `"${v.name}" notlarıyla silinecek.`, confirmLabel: 'Sil', danger: true})) { remove('gradeCourse', v.id); onClose(); } }}>Sil</Button>}
      <span className="spacer" />
      <Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={save}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <div className="grid-2">
          <Field label="Ders adı" htmlFor="gc-name"><input id="gc-name" className="input" value={v.name} maxLength={120} onChange={e => setV({...v, name: e.target.value})} autoFocus={!exists} /></Field>
          <Field label="Dönem" htmlFor="gc-term"><input id="gc-term" className="input" value={v.term} maxLength={60} onChange={e => setV({...v, term: e.target.value})} /></Field>
          <Field label="Kredi" htmlFor="gc-credit"><input id="gc-credit" className="input" type="number" min={0} max={30} step={0.5} value={v.credit} onChange={e => setV({...v, credit: Math.max(0, Number(e.target.value) || 0)})} /></Field>
          <Field label="AKTS" htmlFor="gc-ects"><input id="gc-ects" className="input" type="number" min={0} max={60} step={0.5} value={v.ects} onChange={e => setV({...v, ects: Math.max(0, Number(e.target.value) || 0)})} /></Field>
        </div>
        <div className="field">
          <label>Notlar ve ağırlıklar</label>
          <div className="comp-list">
            {v.components.map(c => (
              <div key={c.id} className="comp-row">
                <input className="input input-sm" list="gc-presets" value={c.name} maxLength={40} onChange={e => setComp(c.id, {name: e.target.value})} aria-label="Bileşen adı" />
                <span className="comp-weight"><input className="input input-sm" type="number" min={0} max={100} value={c.weight} onChange={e => setComp(c.id, {weight: Math.max(0, Math.min(100, Number(e.target.value) || 0))})} aria-label={`${c.name} ağırlığı`} /><span className="muted small">%</span></span>
                <input className="input input-sm" inputMode="decimal" placeholder="Not" value={c.score ?? ''} onChange={e => setComp(c.id, {score: num(e.target.value)})} aria-label={`${c.name} notu`} />
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`${c.name} sil`} onClick={() => setV({...v, components: v.components.filter(x => x.id !== c.id)})}><Trash2 size={15} /></button>
              </div>
            ))}
            <datalist id="gc-presets">{COMPONENT_PRESETS.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="row wrap">
            <Button size="sm" icon={<Plus size={15} />} onClick={() => setV({...v, components: [...v.components, {id: shortId(), name: COMPONENT_PRESETS.find(p => !v.components.some(c => c.name === p)) || 'Diğer', weight: 0, score: null}]})} disabled={v.components.length >= 12}>Not ekle</Button>
            <span className={`small ${Math.abs(a.weightSum - 100) < 0.01 ? 'muted' : 'danger-text'}`}>Ağırlık toplamı %{a.weightSum}{Math.abs(a.weightSum - 100) >= 0.01 ? ' (100 olmalı)' : ''}</span>
          </div>
        </div>
        <div className="card card-pad grade-summary">
          <span>Ortalama: <strong>{fmt(a.avg)}</strong>{!a.complete && a.avg !== null && ' (girilen notlara göre)'}</span>
          <span>Harf: <strong>{courseLetter({...v, letter: v.letter}, scale, rounding)?.letter || '—'}</strong></span>
          {!a.complete && a.missing.length === 1 && <span className="small">{a.missing[0].name}’den: {scale.filter(r => r.point > 0).slice(0, 6).map(r => { const n = neededScore(v.components, a.missing[0].id, r.min, rounding); return `${r.letter} için ${n === 'done' ? '✓' : n === 'impossible' ? '✗' : n}`; }).join(' · ')}</span>}
        </div>
        <div className="grid-2">
          <Field label="Harf notunu elle gir (isteğe bağlı)" htmlFor="gc-letter" hint="Hocanın açıkladığı harf notu hesaplanandan farklıysa.">
            <select id="gc-letter" className="select" value={v.letter} onChange={e => setV({...v, letter: e.target.value})}><option value="">Otomatik</option>{scale.map(r => <option key={r.letter} value={r.letter}>{r.letter}</option>)}</select>
          </Field>
          <div className="field"><label>&nbsp;</label><Switch label="Ortalamaya dahil" checked={v.included} onChange={included => setV({...v, included})} /></div>
        </div>
      </form>
    </Dialog>
  );
}

function FinalCalculator({rounding}: {rounding: boolean}) {
  const [mid, setMid] = useState('60');
  const [mw, setMw] = useState('40');
  const [fw, setFw] = useState('60');
  const [target, setTarget] = useState('70');
  const n = (s: string) => Number(s.replace(',', '.'));
  const valid = [mid, mw, fw, target].every(s => s.trim() !== '' && Number.isFinite(n(s))) && n(mw) + n(fw) > 0;
  const r = valid ? neededFinal(n(mid), n(mw), n(fw), n(target), rounding) : null;
  return (
    <section className="card card-pad stack final-calc">
      <h2 className="row"><Calculator size={20} /> Finalden kaç almalıyım?</h2>
      <div className="calc-grid">
        <Field label="Vize notu" htmlFor="fc-mid"><input id="fc-mid" className="input" inputMode="decimal" value={mid} onChange={e => setMid(e.target.value)} /></Field>
        <Field label="Vize ağırlığı (%)" htmlFor="fc-mw"><input id="fc-mw" className="input" inputMode="decimal" value={mw} onChange={e => setMw(e.target.value)} /></Field>
        <Field label="Final ağırlığı (%)" htmlFor="fc-fw"><input id="fc-fw" className="input" inputMode="decimal" value={fw} onChange={e => setFw(e.target.value)} /></Field>
        <Field label="Hedef ortalama" htmlFor="fc-target"><input id="fc-target" className="input" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></Field>
      </div>
      {r !== null && <p className={`notice ${r === 'impossible' ? 'notice-danger' : 'notice-success'} calc-result`} aria-live="polite">
        <span>{r === 'done' ? 'Hedefe zaten ulaştın; finalden 0 alsan bile yeterli.' : r === 'impossible' ? 'Finalden 100 alsan bile bu hedefe ulaşılamıyor.' : <>Finalden en az <strong>{r}</strong> almalısın.</>}</span>
      </p>}
      <p className="muted small">{rounding ? 'Ortalamanın tam sayıya yuvarlandığı varsayıldı (69,5 → 70). ' : ''}Ölçeği ve yuvarlamayı "Harf ölçeği"nden değiştirebilirsin.</p>
    </section>
  );
}

function ScaleDialog({scale, rounding, onClose}: {scale: ScaleRow[]; rounding: boolean; onClose: () => void}) {
  const [rows, setRows] = useState(scale.map(r => ({...r})));
  const [round, setRound] = useState(rounding);
  const save = () => {
    const clean = rows.filter(r => r.letter.trim()).map(r => ({letter: r.letter.trim().toUpperCase().slice(0, 4), min: Math.max(0, Math.min(100, r.min)), point: Math.max(0, Math.min(5, r.point))})).sort((a, b) => b.min - a.min);
    updateSettings({gradeScale: clean, gradeRounding: round});
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Harf notu ölçeği" footer={<><Button variant="ghost" onClick={() => setRows(DEFAULT_SCALE.map(r => ({...r})))}>Varsayılan</Button><span className="spacer" /><Button variant="primary" onClick={save}>Kaydet</Button></>}>
      <div className="stack">
        <p className="muted small">Üniversitenin yönetmeliğine göre düzenle. "En düşük not" ve üstü o harfi alır.</p>
        <div className="scale-table">
          <span className="muted small">Harf</span><span className="muted small">En düşük not</span><span className="muted small">Katsayı</span><span />
          {rows.map((r, i) => (
            <div key={i} className="scale-row">
              <input className="input input-sm" value={r.letter} maxLength={4} onChange={e => setRows(rows.map((x, j) => (j === i ? {...x, letter: e.target.value} : x)))} aria-label="Harf" />
              <input className="input input-sm" type="number" min={0} max={100} value={r.min} onChange={e => setRows(rows.map((x, j) => (j === i ? {...x, min: Number(e.target.value)} : x)))} aria-label="En düşük not" />
              <input className="input input-sm" type="number" min={0} max={5} step={0.25} value={r.point} onChange={e => setRows(rows.map((x, j) => (j === i ? {...x, point: Number(e.target.value)} : x)))} aria-label="Katsayı" />
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Satırı sil" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setRows([...rows, {letter: '', min: 0, point: 0}])}>Satır ekle</Button>
        <Switch label="Ortalama tam sayıya yuvarlanır" description="ör. 69,5 → 70 (çoğu üniversitede)" checked={round} onChange={setRound} />
      </div>
    </Dialog>
  );
}
