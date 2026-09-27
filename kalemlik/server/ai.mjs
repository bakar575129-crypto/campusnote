// Kalemlik AI: sohbet ve içerik üretimi (özet, flashcard, quiz, çalışma planı).
// API anahtarı yalnızca sunucuda tutulur (ortam değişkeni ya da yönetim paneli); istemciye asla gönderilmez.
// Anahtarın biçimi sağlayıcıyı belirler: sk-ant-… → Anthropic (Claude), sk-… → OpenAI.
import Anthropic from '@anthropic-ai/sdk';
import {HttpError} from './errors.mjs';
import {detectProvider, explainProviderError} from './ocr.mjs';
import {createAnthropicClient, createWorkspaceResolver, isWorkspaceError} from './anthropicClient.mjs';

/** Yapılandırılan model hesapta yoksa sırayla denenecek Claude modelleri. */
const ANTHROPIC_FALLBACK_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
/** Düşünme derinliği (effort) ayarını destekleyen modeller. */
const supportsEffort = m => /^claude-(opus-5|opus-4-[678]|sonnet-5|fable)/.test(m);
/** Sunucu taraflı yedek model (güvenlik reddinde aynı istek başka modelde çalışır) desteklenen modeller. */
const supportsFallbacks = m => /^claude-(opus-5$|fable-5)/.test(m);

function aiError(status, message, detail) {
  const e = explainProviderError(status, message);
  const text = e.message.replace('Tanıma hizmeti', 'Yapay zekâ hizmeti').replace('tanıma modeli', 'yapay zekâ modeli');
  const err = new HttpError(e.status, text, e.code.replace('OCR_', 'AI_'));
  err.detail = detail || `${status || ''} ${message}`.trim();
  return err;
}

/**
 * @param {{ocr:{apiKey:string,model:string,openaiKey:string,openaiModel:string}, ai?:{model?:string, openaiModel?:string}}} config
 */
export function createAi(config, {appSettings, fetchImpl = fetch, anthropicFactory = (key, opts) => createAnthropicClient(key, {...opts, timeout: 150_000}), workspace = createWorkspaceResolver(config, appSettings)} = {}) {
  const current = () => {
    const key = appSettings?.get('ai_api_key') || appSettings?.get('ocr_api_key') || config.ocr.apiKey || config.ocr.openaiKey || '';
    const provider = detectProvider(key);
    const override = appSettings?.get('ai_model') || '';
    const fits = provider === 'openai' ? !!override && !override.startsWith('claude') : override.startsWith('claude');
    const model = fits ? override : provider === 'openai' ? (config.ai?.openaiModel || 'gpt-4.1') : (config.ai?.model || 'claude-opus-5');
    return {key, provider, model, override};
  };
  let lastError = null;

  /** Anthropic içerik blokları: metin ve görseller (base64). */
  const anthropicContent = content => content.map(c => c.type === 'image'
    ? {type: 'image', source: {type: 'base64', media_type: c.mediaType, data: c.data}}
    : {type: 'text', text: c.text});

  async function viaAnthropic(key, model, {system, messages, maxTokens, effort}) {
    let workspaceId = workspace.get();
    let client = anthropicFactory(key, {workspaceId});
    const models = [model, ...ANTHROPIC_FALLBACK_MODELS.filter(m => m !== model)];
    let last;
    for (const m of models) {
      const params = {
        model: m,
        max_tokens: maxTokens,
        system,
        messages: messages.map(msg => ({role: msg.role, content: anthropicContent(msg.content)})),
        ...(supportsEffort(m) && effort ? {output_config: {effort}} : {}),
      };
      try {
        let response;
        if (supportsFallbacks(m)) {
          try {
            response = await client.beta.messages.create({...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'});
          } catch (error) {
            // Hesapta yedek model özelliği yoksa istek yedeksiz tekrarlanır.
            if (!(error instanceof Anthropic.BadRequestError)) throw error;
            response = await client.messages.create(params);
          }
        } else response = await client.messages.create(params);
        if (response.stop_reason === 'refusal') throw new HttpError(422, 'Bu isteğe yapay zekâ yanıt veremedi. Soruyu farklı biçimde sormayı dene.', 'AI_REFUSED');
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return {text, truncated: response.stop_reason === 'max_tokens'};
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (error instanceof Anthropic.NotFoundError) { last = error; continue; } // model yok → sıradaki model
        if (error instanceof Anthropic.APIError && isWorkspaceError(error) && !workspaceId) {
          // Anahtar bir çalışma alanına bağlı değil: kimlik bulunabilirse aynı istek bir kez daha denenir.
          workspaceId = await workspace.recover(key);
          if (workspaceId) { client = anthropicFactory(key, {workspaceId}); models.splice(models.indexOf(m) + 1, 0, m); continue; }
        }
        if (error instanceof Anthropic.APIError) throw aiError(error.status, error.message);
        throw aiError(0, error?.message || 'bağlantı hatası', `Bağlantı kurulamadı: ${error?.message || error}`);
      }
    }
    throw aiError(404, last?.message || 'model not found');
  }

  async function viaOpenAI(key, model, {system, messages, maxTokens}) {
    let res;
    try {
      res = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          model, store: false, max_output_tokens: maxTokens, instructions: system,
          input: messages.map(msg => ({
            role: msg.role,
            content: msg.content.map(c => c.type === 'image'
              ? {type: 'input_image', image_url: `data:${c.mediaType};base64,${c.data}`, detail: 'high'}
              : {type: msg.role === 'assistant' ? 'output_text' : 'input_text', text: c.text}),
          })),
        }),
        signal: AbortSignal.timeout(150_000),
      });
    } catch (error) {
      throw aiError(0, error?.message || 'bağlantı hatası', `Bağlantı kurulamadı: ${error?.message || error}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw aiError(res.status, data?.error?.message || res.statusText, `${res.status} ${data?.error?.code || ''} ${data?.error?.message || ''}`.trim());
    const text = (data.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
    return {text, truncated: data.status === 'incomplete'};
  }

  return {
    get configured() { return !!current().key; },
    status() { const c = current(); return {configured: !!c.key, provider: c.provider, model: c.model, modelOverride: c.override, workspaceId: workspace.get(), lastError}; },
    clearError() { lastError = null; workspace.reset(); },
    /**
     * @param {{system:string, messages:{role:'user'|'assistant', content:({type:'text',text:string}|{type:'image',mediaType:string,data:string})[]}[], maxTokens?:number, effort?:'low'|'medium'|'high'}} req
     */
    async complete({system, messages, maxTokens = 4000, effort = 'medium'}) {
      const {key, provider, model} = current();
      if (!key) throw new HttpError(503, 'Kalemlik AI bu sunucuda henüz etkin değil. Yönetici, yönetim panelinden bir API anahtarı eklemeli.', 'AI_DISABLED');
      try {
        const out = provider === 'openai' ? await viaOpenAI(key, model, {system, messages, maxTokens}) : await viaAnthropic(key, model, {system, messages, maxTokens, effort});
        lastError = null;
        if (!out.text) throw new HttpError(502, 'Yapay zekâ boş yanıt verdi. Tekrar dene.', 'AI_EMPTY');
        return out;
      } catch (error) {
        if (error.detail) {
          lastError = {at: Date.now(), code: error.code, detail: String(error.detail).slice(0, 300)};
          console.error('[Kalemlik AI]', provider, model, error.code, lastError.detail);
        }
        throw error;
      }
    },
  };
}

/** Model çıktısından JSON nesnesini çıkarır (kod bloğu ya da açıklama içinde olsa da). */
export function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new HttpError(502, 'Yapay zekâ beklenen biçimde yanıt vermedi. Tekrar dene.', 'AI_FORMAT');
  try { return JSON.parse(body.slice(start, end + 1)); } catch { throw new HttpError(502, 'Yapay zekâ beklenen biçimde yanıt vermedi. Tekrar dene.', 'AI_FORMAT'); }
}
