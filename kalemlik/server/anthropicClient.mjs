// Anthropic istemcisi: el yazısı tanıma ve Kalemlik AI aynı ayarları kullanır.
// Bazı API anahtarları bir çalışma alanına (workspace) bağlı değildir; Anthropic bu anahtarlarla gelen isteklerde
// hangi çalışma alanının kullanılacağını `anthropic-workspace-id` başlığında ister. Çalışma alanı kimliği yönetim
// panelinden ya da `.env` (ANTHROPIC_WORKSPACE_ID) ile verilir; verilmediyse ve anahtarın yetkisi yetiyorsa bulunur.
import Anthropic from '@anthropic-ai/sdk';

export const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{3,100}$/;

/** Sağlayıcı yanıtı "anahtar bir çalışma alanına bağlı değil" mi diyor? */
export function isWorkspaceError(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return m.includes('not scoped to a workspace') || m.includes('anthropic-workspace-id');
}

export function createAnthropicClient(key, {workspaceId = '', timeout = 60_000, fetch: fetchImpl} = {}) {
  return new Anthropic({
    apiKey: key, maxRetries: 1, timeout, ...(fetchImpl ? {fetch: fetchImpl} : {}),
    ...(workspaceId ? {defaultHeaders: {'anthropic-workspace-id': workspaceId}} : {}),
  });
}

/**
 * Anahtarın erişebildiği çalışma alanlarından kullanılacak olanı bulur (yalnızca anahtarın kuruluş yönetimi yetkisi
 * varsa çalışır; yoksa boş döner). Arşivlenmemiş tek çalışma alanı varsa o, birden çoksa "Default" adlı olan seçilir.
 */
export async function discoverWorkspace(key, factory = k => new Anthropic({apiKey: k, maxRetries: 0, timeout: 15_000})) {
  try {
    const list = [];
    for await (const w of factory(key).beta.organization.workspaces.list({limit: 50})) {
      if (!w.archived_at) list.push(w);
      if (list.length >= 50) break;
    }
    if (list.length === 1) return list[0].id;
    return list.find(w => /^default/i.test(w.name))?.id || '';
  } catch {
    return '';
  }
}

/**
 * Çalışma alanı ayarı: panelden girilen (app_settings) → .env → (bulunduysa) otomatik bulunan.
 * Bulunan kimlik panele kaydedilir; böylece bir kez bulunur, her istekte aranmaz.
 */
export function createWorkspaceResolver(config, appSettings, discover = discoverWorkspace) {
  const tried = new Set();
  return {
    get() { return appSettings?.get('anthropic_workspace_id') || config.anthropicWorkspaceId || ''; },
    /** Çalışma alanı hatasında bir kez çağrılır; bulunursa kaydeder ve kimliği döner. */
    async recover(key) {
      if (tried.has(key)) return '';
      tried.add(key);
      const id = await discover(key);
      if (id && WORKSPACE_ID_PATTERN.test(id)) {
        try { await appSettings?.set('anthropic_workspace_id', id); } catch { /* kaydedilemese de bu istekte kullanılır */ }
        return id;
      }
      return '';
    },
    reset() { tried.clear(); },
  };
}
