// Küçük ve güvenli Markdown görüntüleyici: başlık, madde, numaralı liste, **kalın**, *italik*, `kod`.
// HTML asla yorumlanmaz (dangerouslySetInnerHTML yok); her şey React öğesi olarak üretilir → XSS mümkün değil.
import {Fragment, type ReactNode} from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({text, className = ''}: {text: string; className?: string}) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: {ordered: boolean; items: string[]} | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `p${blocks.length}-${i}`)}</Fragment>)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<hr key={blocks.length} />); continue; }
    if (h) { flushPara(); flushList(); const level = Math.min(4, h[1].length + 1); const H = `h${level}` as 'h2'; blocks.push(<H key={blocks.length}>{inline(h[2], `h${blocks.length}`)}</H>); continue; }
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flushList(); list = {ordered, items: []}; }
      list.items.push((bullet || num)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return <div className={`md ${className}`}>{blocks}</div>;
}

/** Markdown işaretlerini kaldırıp düz metin verir (deftere/karta kaydederken). */
export function plainText(md: string) {
  return md.replace(/\r/g, '').replace(/^#{1,4}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^\s*[-*]\s+/gm, '• ').trim();
}
