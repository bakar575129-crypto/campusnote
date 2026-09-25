import {useEffect, useState} from 'react';
import type {Notebook} from '@/lib/types';
import type {PaperId} from '@/lib/constants';
import {PALETTE} from '@/lib/constants';
import {Button, ColorPicker, Dialog, Field} from '@/components/ui';
import {TemplatePicker} from '@/features/editor/TemplatePicker';
import {currentTerm} from '@/lib/format';
import {useSettings} from '@/lib/settings';
import {list} from '@/lib/store';
import {CoverView} from './CoverView';
import {DEFAULT_COVER} from './cover';

export type NotebookValues = Pick<Notebook, 'title' | 'course' | 'term' | 'color' | 'paper'>;

/** Yeni defter oluşturma ve defter bilgilerini düzenleme. */
export function NotebookDialog({open, onClose, initial, onSave, mode}: {open: boolean; onClose: () => void; initial?: Notebook; onSave: (v: NotebookValues) => void; mode: 'create' | 'edit'}) {
  const settings = useSettings();
  const [v, setV] = useState<NotebookValues>({title: '', course: '', term: currentTerm(), color: PALETTE[0], paper: settings.defaultPaper});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setV(initial ? {title: initial.title, course: initial.course, term: initial.term, color: initial.color, paper: initial.paper} : {title: '', course: '', term: currentTerm(), color: PALETTE[Math.floor(Math.random() * 6)], paper: settings.defaultPaper});
  }, [open, initial, settings.defaultPaper]);
  const courses = [...new Set([...list('notebook').map(n => n.course), ...list('lesson').map(l => l.title)].filter(Boolean))];
  const submit = () => {
    if (!v.title.trim()) { setError('Deftere bir ad ver.'); return; }
    onSave({...v, title: v.title.trim(), course: v.course.trim(), term: v.term.trim()});
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={mode === 'create' ? 'Yeni defter' : 'Defter bilgileri'}
      footer={<><Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={submit}>{mode === 'create' ? 'Defteri oluştur' : 'Kaydet'}</Button></>}>
      <form className="nb-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="nb-form-fields stack">
          <Field label="Defter adı" htmlFor="nb-title" error={error}><input id="nb-title" className="input" value={v.title} maxLength={160} placeholder="ör. Diferansiyel Denklemler" onChange={e => setV({...v, title: e.target.value})} data-autofocus /></Field>
          <div className="grid-2">
            <Field label="Ders" htmlFor="nb-course"><input id="nb-course" className="input" list="nb-courses" value={v.course} maxLength={120} placeholder="ör. MAT 204" onChange={e => setV({...v, course: e.target.value})} /></Field>
            <Field label="Dönem" htmlFor="nb-term"><input id="nb-term" className="input" value={v.term} maxLength={60} onChange={e => setV({...v, term: e.target.value})} /></Field>
          </div>
          <datalist id="nb-courses">{courses.map(c => <option key={c} value={c} />)}</datalist>
          <Field label="Kapak rengi"><ColorPicker value={v.color} onChange={color => setV({...v, color})} swatches={PALETTE} /></Field>
          {mode === 'create' && <Field label="Sayfa şablonu"><TemplatePicker value={v.paper} onChange={(paper: PaperId) => setV({...v, paper})} /></Field>}
        </div>
        <div className="nb-form-preview" aria-hidden>
          <CoverView nb={{...v, title: v.title || 'Defter adı', cover: initial?.cover || DEFAULT_COVER}} />
        </div>
      </form>
    </Dialog>
  );
}
