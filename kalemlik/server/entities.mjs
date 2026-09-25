// Eşitlenen kayıt türlerinin tablo eşlemesi. Her kayıt: istemcinin ürettiği UUID + revizyon numarası.
// Yazma kuralı (iyimser kilit): istemci elindeki revizyonu gönderir; sunucudaki revizyon farklıysa 409 döner
// ve istemci çakışmayı veri kaybetmeden çözer (bkz. src/lib/sync.ts).

/** @typedef {{key:string,col:string,type:'str'|'num'|'bool'|'json'|'nullnum'}} Field */

/** @type {Record<string,{table:string, fields:Field[], metaFields?:string[], fileRefs?:(d:any)=>string[]}>} */
export const ENTITIES = {
  notebook: {
    table: 'notebooks',
    fields: [
      {key: 'title', col: 'title', type: 'str'},
      {key: 'course', col: 'course', type: 'str'},
      {key: 'term', col: 'term', type: 'str'},
      {key: 'color', col: 'color', type: 'str'},
      {key: 'paper', col: 'paper', type: 'str'},
      {key: 'cover', col: 'cover', type: 'json'},
      {key: 'favorite', col: 'favorite', type: 'bool'},
      {key: 'trashedAt', col: 'trashed_at', type: 'nullnum'},
      {key: 'lastOpenedAt', col: 'last_opened_at', type: 'nullnum'},
    ],
    fileRefs: d => d.cover.stickers.map(s => s.fileId),
  },
  page: {
    table: 'notebook_pages',
    fields: [
      {key: 'notebookId', col: 'notebook_id', type: 'str'},
      {key: 'position', col: 'position', type: 'num'},
      {key: 'content', col: 'content', type: 'json'},
    ],
    // Eşitleme listesinde sayfa içeriği gönderilmez; içerik defter açılınca ayrıca istenir.
    metaFields: ['notebookId', 'position'],
    fileRefs: d => [...(d.content.background ? [d.content.background.fileId] : []), ...d.content.stickers.map(s => s.fileId)],
  },
  lesson: {
    table: 'lessons',
    fields: [
      {key: 'title', col: 'title', type: 'str'},
      {key: 'day', col: 'day', type: 'num'},
      {key: 'start', col: 'start_time', type: 'str'},
      {key: 'end', col: 'end_time', type: 'str'},
      {key: 'room', col: 'room', type: 'str'},
      {key: 'instructor', col: 'instructor', type: 'str'},
      {key: 'color', col: 'color', type: 'str'},
      {key: 'note', col: 'note', type: 'str'},
    ],
  },
  task: {
    table: 'tasks',
    fields: [
      {key: 'title', col: 'title', type: 'str'},
      {key: 'course', col: 'course', type: 'str'},
      {key: 'description', col: 'description', type: 'str'},
      {key: 'dueDate', col: 'due_date', type: 'str'},
      {key: 'dueTime', col: 'due_time', type: 'str'},
      {key: 'category', col: 'category', type: 'str'},
      {key: 'color', col: 'color', type: 'str'},
      {key: 'done', col: 'done', type: 'bool'},
      {key: 'completedAt', col: 'completed_at', type: 'nullnum'},
    ],
  },
  focus: {
    table: 'focus_sessions',
    fields: [
      {key: 'topic', col: 'topic', type: 'str'},
      {key: 'course', col: 'course', type: 'str'},
      {key: 'plannedMinutes', col: 'planned_minutes', type: 'num'},
      {key: 'focusedSeconds', col: 'focused_seconds', type: 'num'},
      {key: 'completed', col: 'completed', type: 'bool'},
      {key: 'startedAt', col: 'started_at', type: 'num'},
      {key: 'endedAt', col: 'ended_at', type: 'num'},
    ],
  },
  sticker: {
    table: 'user_stickers',
    fields: [
      {key: 'fileId', col: 'file_id', type: 'str'},
      {key: 'name', col: 'name', type: 'str'},
      {key: 'width', col: 'width', type: 'num'},
      {key: 'height', col: 'height', type: 'num'},
    ],
    fileRefs: d => [d.fileId],
  },
  font: {
    table: 'fonts',
    fields: [
      {key: 'fileId', col: 'file_id', type: 'str'},
      {key: 'name', col: 'name', type: 'str'},
      {key: 'missingChars', col: 'missing_chars', type: 'str'},
    ],
    fileRefs: d => [d.fileId],
  },
};

export function toColumn(field, value) {
  if (field.type === 'json') return JSON.stringify(value);
  if (field.type === 'bool') return value ? 1 : 0;
  if (field.type === 'nullnum') return value ?? null;
  return value;
}

export function fromRow(entity, row, {meta = false} = {}) {
  const def = ENTITIES[entity];
  const out = {id: row.id, rev: row.rev, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)};
  for (const f of def.fields) {
    if (meta && def.metaFields && !def.metaFields.includes(f.key)) continue;
    const v = row[f.col];
    out[f.key] = f.type === 'json' ? JSON.parse(v) : f.type === 'bool' ? !!v : f.type === 'nullnum' ? (v == null ? null : Number(v)) : f.type === 'num' ? Number(v) : v;
  }
  return out;
}

export function selectColumns(entity, {meta = false} = {}) {
  const def = ENTITIES[entity];
  const cols = def.fields.filter(f => !meta || !def.metaFields || def.metaFields.includes(f.key)).map(f => f.col);
  return ['id', 'rev', 'created_at', 'updated_at', ...cols].join(',');
}

/** Sayfa, kapak ve arşivlerde kullanılan tüm dosya kimliklerini toplar (depolama temizliği için). */
export function collectFileRefs(entity, data) {
  const def = ENTITIES[entity];
  return def?.fileRefs ? def.fileRefs(data) : [];
}
