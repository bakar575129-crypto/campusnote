import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sniffMime, hashPassword, verifyPassword} from '../../server/security.mjs';
import {readConfig} from '../../server/config.mjs';
import {entitySchemas, pageContent} from '../../server/schemas.mjs';

test('dosya imzası: uzantıya değil içeriğe bakılır', () => {
  assert.equal(sniffMime(Buffer.from('89504e470d0a1a0a0000000000', 'hex')), 'image/png');
  assert.equal(sniffMime(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('%PDF-1.7\n%âãÏÓ')), 'application/pdf');
  assert.equal(sniffMime(Buffer.from('wOF2' + '\0'.repeat(20), 'latin1')), 'font/woff2');
  assert.equal(sniffMime(Buffer.from('<svg onload=alert(1)></svg>')), null);
  assert.equal(sniffMime(Buffer.from('<html><script>')), null);
});

test('parola özeti doğrulanır, yanlış parola reddedilir', async () => {
  const h = await hashPassword('güçlü şifre 123');
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword('güçlü şifre 123', h), true);
  assert.equal(await verifyPassword('yanlış', h), false);
  assert.equal(await verifyPassword('herhangi', null), false);
});

test('yapılandırma: canlıda HTTPS ve depolama klasörü denetimi', () => {
  assert.throws(() => readConfig({NODE_ENV: 'production', APP_URL: 'http://x.com', DB_NAME: 'a', DB_USER: 'b', DB_PASSWORD: 'c'}), /https/);
  assert.throws(() => readConfig({APP_URL: 'http://localhost:3000', DB_NAME: 'a', DB_USER: 'b', STORAGE_DIR: './dist/uploads'}), /dist/);
  const c = readConfig({NODE_ENV: 'production', APP_URL: 'https://not.ornek.com', DB_NAME: 'a', DB_USER: 'b', DB_PASSWORD: 'c'});
  assert.equal(c.secureCookies, true);
  assert.equal(c.allowedOrigins.has('http://localhost:5173'), false, 'canlıda geliştirme adresi kabul edilmez');
});

test('sayfa içeriği şeması kötü veriyi reddeder', () => {
  const ok = {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [], stickers: []};
  assert.equal(pageContent.safeParse(ok).success, true);
  assert.equal(pageContent.safeParse({...ok, template: 'bilinmeyen'}).success, false);
  assert.equal(pageContent.safeParse({...ok, strokes: [{id: 'a', t: 'pen', c: 'red', w: 2, o: 1, pts: []}]}).success, false, 'renk HEX olmalı');
  assert.equal(entitySchemas.lesson.safeParse({title: 'x', day: 7, start: '09:00', end: '10:00', room: '', instructor: '', color: '#000000', note: ''}).success, false);
});

import Anthropic from '@anthropic-ai/sdk';
import {createOcr, detectProvider, explainProviderError} from '../../server/ocr.mjs';

test('OCR: anahtar biçiminden sağlayıcı ve anlaşılır hata', () => {
  assert.equal(detectProvider('sk-ant-api03-abc'), 'anthropic');
  assert.equal(detectProvider('sk-proj-abc'), 'openai');
  assert.equal(detectProvider(''), null);
  assert.equal(explainProviderError(401, 'invalid x-api-key').code, 'OCR_AUTH');
  assert.equal(explainProviderError(400, 'Your credit balance is too low to access the Anthropic API').code, 'OCR_BILLING');
  assert.equal(explainProviderError(404, 'model: claude-x not found').code, 'OCR_MODEL');
  assert.equal(explainProviderError(429, 'rate').code, 'OCR_BUSY');
});

test('OCR: model bulunamazsa sıradaki modele geçer; panel anahtarı ortam değişkenini ezer', async () => {
  const tried = [];
  const factory = () => ({messages: {create: async ({model}) => {
    tried.push(model);
    if (model !== 'claude-sonnet-5') throw new Anthropic.NotFoundError(404, {type: 'error', error: {type: 'not_found_error', message: 'model not found'}}, 'model not found', new Headers());
    return {stop_reason: 'end_turn', content: [{type: 'text', text: 'merhaba'}]};
  }}});
  const settings = {get: n => (n === 'ocr_api_key' ? 'sk-ant-panel' : '')};
  const ocr = createOcr({ocr: {apiKey: 'sk-ant-env', model: 'claude-opus-5', openaiKey: '', openaiModel: 'gpt-4.1-mini'}}, {appSettings: settings, anthropicFactory: key => { assert.equal(key, 'sk-ant-panel'); return factory(); }});
  assert.equal(await ocr.transcribe('AAAA', 'word'), 'merhaba');
  assert.deepEqual(tried, ['claude-opus-5', 'claude-sonnet-5']);
});

test('OCR: OpenAI anahtarı ve bakiye hatası anlaşılır bildirilir', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({error: {code: 'insufficient_quota', message: 'You exceeded your current quota'}}), {status: 429});
  const ocr = createOcr({ocr: {apiKey: '', model: 'claude-opus-5', openaiKey: 'sk-proj-x', openaiModel: 'gpt-4.1-mini'}}, {fetchImpl});
  assert.equal(ocr.status().provider, 'openai');
  await assert.rejects(ocr.transcribe('AAAA', 'word'), e => e.code === 'OCR_BILLING' && /bakiye/.test(e.message));
  assert.match(ocr.status().lastError.detail, /insufficient_quota/);
});

import {createAi, extractJson} from '../../server/ai.mjs';

test('Kalemlik AI: yedek model, varsayılan yedek (fallbacks), düşünme ayarı ve görsel içerik', async () => {
  const calls = [];
  const create = kind => async params => {
    calls.push({kind, ...params});
    if (params.model === 'claude-opus-5' && kind === 'beta') throw new Anthropic.NotFoundError(404, {type: 'error', error: {type: 'not_found_error', message: 'model not found'}}, 'model not found', new Headers());
    return {stop_reason: 'end_turn', content: [{type: 'text', text: 'hazır'}]};
  };
  const ai = createAi({ocr: {apiKey: 'sk-ant-env', model: 'claude-opus-5', openaiKey: '', openaiModel: ''}, ai: {model: 'claude-opus-5'}}, {anthropicFactory: () => ({beta: {messages: {create: create('beta')}}, messages: {create: create('std')}})});
  const out = await ai.complete({system: 's', messages: [{role: 'user', content: [{type: 'image', mediaType: 'image/png', data: 'AAAA'}, {type: 'text', text: 'merhaba'}]}], effort: 'low'});
  assert.equal(out.text, 'hazır');
  assert.equal(calls[0].kind, 'beta');
  assert.deepEqual(calls[0].betas, ['server-side-fallback-2026-07-01']);
  assert.equal(calls[0].fallbacks, 'default');
  assert.deepEqual(calls[0].output_config, {effort: 'low'});
  assert.equal(calls[0].messages[0].content[0].source.media_type, 'image/png');
  assert.equal(calls[1].model, 'claude-sonnet-5', 'model yoksa sıradaki model');
  assert.equal(calls[1].kind, 'std');
});

test('Kalemlik AI: anahtar yoksa AI_DISABLED, ret durumunda anlaşılır hata, JSON ayıklama', async () => {
  const off = createAi({ocr: {apiKey: '', model: '', openaiKey: '', openaiModel: ''}});
  assert.equal(off.configured, false);
  await assert.rejects(off.complete({system: '', messages: []}), e => e.code === 'AI_DISABLED');
  const refused = createAi({ocr: {apiKey: 'sk-ant-x', model: '', openaiKey: '', openaiModel: ''}, ai: {model: 'claude-haiku-4-5'}}, {anthropicFactory: () => ({messages: {create: async () => ({stop_reason: 'refusal', content: []})}})});
  await assert.rejects(refused.complete({system: '', messages: [{role: 'user', content: [{type: 'text', text: 'x'}]}]}), e => e.code === 'AI_REFUSED');
  assert.deepEqual(extractJson('Tabii!\n```json\n{"a": [1, 2]}\n```\nİyi çalışmalar.'), {a: [1, 2]});
  assert.deepEqual(extractJson('önce {"b": "}"} sonra'), {b: '}'});
  assert.throws(() => extractJson('json yok'), e => e.code === 'AI_FORMAT');
});

import {createAnthropicClient, createWorkspaceResolver, discoverWorkspace, isWorkspaceError} from '../../server/anthropicClient.mjs';

const WS_MESSAGE = 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use. Add the header, or use an API key that is scoped to a workspace.';
const wsError = () => new Anthropic.BadRequestError(400, {type: 'error', error: {type: 'invalid_request_error', message: WS_MESSAGE}}, WS_MESSAGE, new Headers());

test('çalışma alanı: anthropic-workspace-id başlığı gerçekten gönderilir', async () => {
  let headers;
  const fetchImpl = async (url, init) => { headers = new Headers(init.headers); return new Response(JSON.stringify({id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{type: 'text', text: 'ok'}], stop_reason: 'end_turn', usage: {input_tokens: 1, output_tokens: 1}}), {status: 200, headers: {'content-type': 'application/json'}}); };
  await createAnthropicClient('sk-ant-x', {workspaceId: 'wrkspc_01Test', fetch: fetchImpl}).messages.create({model: 'claude-opus-5', max_tokens: 10, messages: [{role: 'user', content: 'x'}]});
  assert.equal(headers.get('anthropic-workspace-id'), 'wrkspc_01Test');
  assert.equal(headers.get('x-api-key'), 'sk-ant-x');
  await createAnthropicClient('sk-ant-x', {fetch: fetchImpl}).messages.create({model: 'claude-opus-5', max_tokens: 10, messages: [{role: 'user', content: 'x'}]});
  assert.equal(headers.get('anthropic-workspace-id'), null, 'kimlik yoksa başlık yok');
});

test('çalışma alanı hatası: anlaşılır Türkçe mesaj, panelden kimlik, otomatik bulma ve kaydetme', async () => {
  assert.equal(isWorkspaceError(wsError()), true);
  assert.equal(isWorkspaceError(new Error('invalid x-api-key')), false);
  const e = explainProviderError(400, WS_MESSAGE);
  assert.equal(e.code, 'OCR_WORKSPACE');
  assert.match(e.message, /çalışma alanı/);
  assert.doesNotMatch(e.message, /geçersiz/, '"anahtar geçersiz" denmez');

  // Kimlik yoksa: hata anlaşılır bildirilir
  const store = new Map();
  const settings = {get: n => store.get(n) || '', set: async (n, v) => { store.set(n, v); }};
  const seen = [];
  const factory = (key, {workspaceId} = {}) => ({messages: {create: async () => { seen.push(workspaceId || ''); if (!workspaceId) throw wsError(); return {stop_reason: 'end_turn', content: [{type: 'text', text: 'merhaba'}]}; }}});
  const noDiscover = createOcr({ocr: {apiKey: 'sk-ant-org', model: 'claude-opus-5', openaiKey: '', openaiModel: ''}}, {appSettings: settings, anthropicFactory: factory, workspace: createWorkspaceResolver({}, settings, async () => '')});
  await assert.rejects(noDiscover.transcribe('AAAA', 'word'), err => err.code === 'OCR_WORKSPACE' && /Workspace ID/.test(err.message));

  // Otomatik bulunursa aynı istek başlıkla tekrarlanır ve kimlik kaydedilir
  seen.length = 0;
  const ai = createAi({ocr: {apiKey: 'sk-ant-org', model: '', openaiKey: '', openaiModel: ''}, ai: {model: 'claude-haiku-4-5'}}, {appSettings: settings, anthropicFactory: factory, workspace: createWorkspaceResolver({}, settings, async () => 'wrkspc_Found')});
  assert.equal((await ai.complete({system: '', messages: [{role: 'user', content: [{type: 'text', text: 'x'}]}]})).text, 'merhaba');
  assert.deepEqual(seen, ['', 'wrkspc_Found']);
  assert.equal(store.get('anthropic_workspace_id'), 'wrkspc_Found');
  assert.equal(ai.status().workspaceId, 'wrkspc_Found');

  // Panelde/ortamda kimlik varsa ilk istekten itibaren kullanılır
  seen.length = 0;
  const ocr = createOcr({ocr: {apiKey: 'sk-ant-org', model: 'claude-opus-5', openaiKey: '', openaiModel: ''}, anthropicWorkspaceId: 'wrkspc_Env'}, {anthropicFactory: factory});
  assert.equal(await ocr.transcribe('AAAA', 'word'), 'merhaba');
  assert.deepEqual(seen, ['wrkspc_Env']);
});

test('çalışma alanı bulma: tek çalışma alanı ya da "Default"; yetki yoksa boş', async () => {
  const lister = items => () => ({beta: {organization: {workspaces: {list: () => (async function* () { yield* items; })()}}}});
  assert.equal(await discoverWorkspace('k', lister([{id: 'wrkspc_A', name: 'Proje', archived_at: null}])), 'wrkspc_A');
  assert.equal(await discoverWorkspace('k', lister([{id: 'wrkspc_A', name: 'Proje', archived_at: null}, {id: 'wrkspc_B', name: 'Default Workspace', archived_at: null}])), 'wrkspc_B');
  assert.equal(await discoverWorkspace('k', lister([{id: 'wrkspc_A', name: 'A', archived_at: null}, {id: 'wrkspc_B', name: 'B', archived_at: null}])), '');
  assert.equal(await discoverWorkspace('k', () => ({beta: {organization: {workspaces: {list: () => { throw new Error('403'); }}}}})), '');
});
