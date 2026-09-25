export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string = 'ERROR', public body: Record<string, unknown> = {}) {
    super(message);
  }
  get offline() { return this.status === 0; }
}

/** Tüm API çağrıları: çerezli, CSRF başlıklı; ağ hatası status=0 olarak döner. */
export async function api<T = unknown>(path: string, init: RequestInit & {json?: unknown} = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-kalemlik', '1');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(path, {...init, body, headers, credentials: 'same-origin'});
  } catch {
    throw new ApiError(0, 'İnternet bağlantısı yok. Değişiklikler cihazında saklanıyor.', 'OFFLINE');
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const d = data as {error?: string; code?: string};
    throw new ApiError(res.status, d.error || `Sunucu hatası (${res.status}).`, d.code || 'ERROR', data as Record<string, unknown>);
  }
  return data as T;
}
