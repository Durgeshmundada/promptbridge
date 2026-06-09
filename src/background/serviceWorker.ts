/// <reference lib="webworker" />

import { ModelTarget } from '../types';
import { adaptPromptForModel } from '../pipeline/layer2/modelAwareAdapter';
import type {
  ApiPayload,
  HistoryEntry,
  PipelineResult,
  PromptTemplate,
  PromptRating,
  RatingValue,
} from '../types';
import type {
  LoadTemplatesRuntimeRequest,
  SaveTemplateRuntimeRequest,
} from '../utils/templateServiceRuntime';
import {
  type ClaudeVisionRuntimeRequest,
  type ClaudeVisionRuntimeSuccessResponse,
} from '../pipeline/layer4/claudeVisionBridge';
import { browser } from '../lib/browser';
import { registerMessageRouter } from './messageRouter';
import { callLlm, LlmClientError } from './llm/client';
import { createOllamaProviderConfig } from './llm/ollamaClient';
import {
  executeGeminiPayload,
  GeminiRotationError,
  listGeminiModels,
  proxyGeminiChatCompletion,
} from './geminiRotatingClient';
import type {
  GroqChatCompletionRequest,
  GroqChatCompletionSuccessResponse,
  GroqListModelsRequest,
  GroqListModelsSuccessResponse,
} from '../utils/groq';
import {
  appendHistoryEntry,
  DEFAULT_APP_SETTINGS,
  ensureStorageDefaults,
  loadAppSettings,
  loadPromptTemplates,
  savePromptRating,
  savePromptTemplates,
  updateHistoryEntryRating,
} from '../utils/storage';

interface PageContext {
  title: string;
  url: string;
  selection: string;
  summary: string;
}

interface ExecuteLlmRequest {
  type: 'EXECUTE_LLM';
  payload: ApiPayload;
}

export type RuntimeRequest =
  | { type: 'PING' }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'GET_ACTIVE_CONTEXT' }
  | { type: 'SAVE_PIPELINE_RESULT'; payload: PipelineResult }
  | { type: 'SUBMIT_RATING'; payload: PromptRating }
  | { type: 'UPDATE_HISTORY_RATING'; payload: { entryId: string; rating: RatingValue } }
  | { type: 'CONTENT_READY'; payload: Pick<PageContext, 'title' | 'url'> }
  | ExecuteLlmRequest
  | LoadTemplatesRuntimeRequest
  | SaveTemplateRuntimeRequest
  | ClaudeVisionRuntimeRequest
  | GroqListModelsRequest
  | GroqChatCompletionRequest;

interface SuccessResponse {
  ok: true;
}

export interface ErrorResponse {
  ok: false;
  error: string;
  code?: number;
}

interface PingResponse extends SuccessResponse {
  version: string;
  timestamp: string;
}

interface SavePipelineResultResponse extends SuccessResponse {
  entry: HistoryEntry;
}

interface UpdateHistoryRatingResponse extends SuccessResponse {
  entry: HistoryEntry;
}

interface ExecuteLlmSuccessResponse extends SuccessResponse {
  text: string;
  executionTimeMs: number;
}

interface LoadTemplatesSuccessResponse extends SuccessResponse {
  source: 'cache' | 'remote';
  templates: PromptTemplate[];
}

interface SaveTemplateSuccessResponse extends SuccessResponse {
  template: PromptTemplate;
}

export interface ExecuteLlmErrorResponse extends ErrorResponse {
  code: number;
}

interface TemplateServiceLoadResponse {
  ok?: boolean;
  templates?: PromptTemplate[];
}

interface TemplateServiceSaveResponse {
  ok?: boolean;
  template?: PromptTemplate;
}

type TemplateCacheKey = 'active' | 'all';

interface TemplateCatalogCacheEntry {
  source: 'cache' | 'remote';
  templates: PromptTemplate[];
  updatedAt: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const PROVIDER_FAILOVER_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504]);
const TEMPLATE_SERVICE_ENDPOINT_PATH = '/api/templates';
const TEMPLATE_MEMORY_CACHE_TTL_MS = 60_000;
const templateCatalogMemoryCache = new Map<TemplateCacheKey, TemplateCatalogCacheEntry>();
const templateCatalogPendingLoads = new Map<TemplateCacheKey, Promise<LoadTemplatesSuccessResponse>>();

class ServiceWorkerApiError extends Error {
  code: number;
  cause?: unknown;

  /**
   * Creates a typed service-worker API error.
   */
  constructor(code: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'ServiceWorkerApiError';
    this.code = code;
    this.cause = cause;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown extension error occurred.';
}

export function getErrorCode(error: unknown): number | undefined {
  if (error instanceof ServiceWorkerApiError || error instanceof GeminiRotationError) {
    return error.code;
  }

  return undefined;
}

export function isRestrictedContentScriptRequest(message: RuntimeRequest): boolean {
  return (
    message.type === 'CLAUDE_VISION_REQUEST' ||
    message.type === 'GROQ_LIST_MODELS' ||
    message.type === 'GROQ_CHAT_COMPLETION'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function buildProviderErrorMessage(
  providerLabel: string,
  statusCode: number,
  fallbackMessage: string,
): string {
  if (statusCode === 401 || statusCode === 403) {
    return `${providerLabel} authentication failed. Unlock the vault and verify the stored API key.`;
  }

  if (statusCode === 429) {
    return `${providerLabel} is rate limiting requests right now. PromptBridge retried automatically, but the provider is still busy.`;
  }

  if (statusCode === 503) {
    return `${providerLabel} is temporarily unavailable. Please try again in a moment.`;
  }

  if (statusCode === 504) {
    return `${providerLabel} did not respond within 30 seconds.`;
  }

  return fallbackMessage;
}

function getProviderLabelForModel(model: ModelTarget): string {
  switch (model) {
    case ModelTarget.GROQ:
      return 'Groq-compatible Gemini';
    case ModelTarget.GPT4O:
      return 'OpenAI';
    case ModelTarget.CLAUDE:
      return 'Anthropic';
    case ModelTarget.GEMINI:
      return 'Gemini';
    case ModelTarget.LLAMA:
      return 'Llama';
    case ModelTarget.OLLAMA:
      return 'Ollama';
    case ModelTarget.CUSTOM:
      return 'Custom';
    default: {
      const unreachableModel: never = model;
      return unreachableModel;
    }
  }
}

function getProviderFailoverOrder(model: ModelTarget): ModelTarget[] {
  switch (model) {
    case ModelTarget.OLLAMA:
      return [ModelTarget.OLLAMA, ModelTarget.GEMINI];
    case ModelTarget.GROQ:
    case ModelTarget.GPT4O:
    case ModelTarget.CLAUDE:
    case ModelTarget.GEMINI:
    case ModelTarget.LLAMA:
    case ModelTarget.CUSTOM:
      return [ModelTarget.GEMINI];
    default: {
      const unreachableModel: never = model;
      return [ModelTarget.GEMINI, unreachableModel].slice(0, 1);
    }
  }
}

function shouldFailOverToAnotherProvider(error: unknown): boolean {
  const code = getErrorCode(error);
  return typeof code === 'number' && PROVIDER_FAILOVER_STATUS_CODES.has(code);
}

function buildProviderAttemptPayload(payload: ApiPayload, targetModel: ModelTarget): ApiPayload {
  if (targetModel === payload.model) {
    return payload;
  }

  const basePrompt = payload.originalPrompt ?? payload.prompt;

  return {
    ...payload,
    model: targetModel,
    prompt: adaptPromptForModel(basePrompt, targetModel),
  };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceWorkerApiError(
        504,
        'The upstream model provider did not respond within 30 seconds.',
        error,
      );
    }

    throw new ServiceWorkerApiError(
      502,
      'PromptBridge could not reach the upstream model provider.',
      error,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function performJsonRequestWithBackoff<TResponse>(
  providerLabel: string,
  input: string,
  init: RequestInit,
): Promise<TResponse> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetchWithTimeout(input, init);

    if (response.ok) {
      const responseBody = await parseJsonResponse<TResponse>(response);

      if (responseBody === null) {
        throw new ServiceWorkerApiError(
          502,
          `${providerLabel} returned an unreadable JSON response.`,
        );
      }

      return responseBody;
    }

    const isRetryable =
      RETRYABLE_STATUS_CODES.has(response.status) && attempt < RETRY_DELAYS_MS.length;

    if (isRetryable) {
      await delay(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const errorBody = await parseJsonResponse<Record<string, unknown>>(response);
    const nestedError =
      errorBody && typeof errorBody.error === 'object' && errorBody.error !== null
        ? (errorBody.error as { message?: string })
        : null;
    const fallbackMessage =
      nestedError?.message ??
      (typeof errorBody?.message === 'string' ? errorBody.message : null) ??
      `${providerLabel} request failed with status ${response.status}.`;

    throw new ServiceWorkerApiError(
      response.status,
      buildProviderErrorMessage(providerLabel, response.status, fallbackMessage),
      errorBody ?? undefined,
    );
  }

  throw new ServiceWorkerApiError(
    503,
    `${providerLabel} remained unavailable after multiple retry attempts.`,
  );
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    browser.tabs.query(queryInfo, (tabs) => {
      const runtimeError = browser.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(tabs);
    });
  });
}

function sendTabMessage<TResponse>(tabId: number, message: object): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    browser.tabs.sendMessage(tabId, message, (response: TResponse) => {
      const runtimeError = browser.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response);
    });
  });
}

function openOptionsPage(): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.runtime.openOptionsPage(() => {
      const runtimeError = browser.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve();
    });
  });
}

function cloneTemplate(template: PromptTemplate): PromptTemplate {
  return {
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  };
}

function cloneTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return templates.map(cloneTemplate);
}

function getTemplateCacheKey(includeInactive: boolean): TemplateCacheKey {
  return includeInactive ? 'all' : 'active';
}

function filterActiveTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return cloneTemplates(templates.filter((template) => template.isActive !== false));
}

function cloneTemplateLoadResponse(
  response: LoadTemplatesSuccessResponse,
): LoadTemplatesSuccessResponse {
  return {
    ok: true,
    source: response.source,
    templates: cloneTemplates(response.templates),
  };
}

function isFreshTemplateCatalogCache(entry: TemplateCatalogCacheEntry | undefined): boolean {
  return Boolean(entry && Date.now() - entry.updatedAt < TEMPLATE_MEMORY_CACHE_TTL_MS);
}

function readTemplateCatalogCache(
  includeInactive: boolean,
): LoadTemplatesSuccessResponse | null {
  const cacheEntry = templateCatalogMemoryCache.get(getTemplateCacheKey(includeInactive));

  if (!isFreshTemplateCatalogCache(cacheEntry) || !cacheEntry) {
    return null;
  }

  return {
    ok: true,
    source: cacheEntry.source,
    templates: cloneTemplates(cacheEntry.templates),
  };
}

function writeTemplateCatalogCache(
  includeInactive: boolean,
  source: 'cache' | 'remote',
  templates: PromptTemplate[],
): void {
  const clonedTemplates = cloneTemplates(templates);
  const updatedAt = Date.now();

  templateCatalogMemoryCache.set(getTemplateCacheKey(includeInactive), {
    source,
    templates: clonedTemplates,
    updatedAt,
  });

  if (includeInactive) {
    templateCatalogMemoryCache.set('active', {
      source,
      templates: filterActiveTemplates(clonedTemplates),
      updatedAt,
    });
  }
}

function mergeTemplateSnapshots(
  existingTemplates: PromptTemplate[],
  nextTemplates: PromptTemplate[],
): PromptTemplate[] {
  const mergedTemplates = new Map<string, PromptTemplate>();

  existingTemplates.forEach((template) => {
    mergedTemplates.set(template.id, cloneTemplate(template));
  });

  nextTemplates.forEach((template) => {
    mergedTemplates.set(template.id, cloneTemplate(template));
  });

  return [...mergedTemplates.values()];
}

function syncTemplateCatalogCacheAfterSave(template: PromptTemplate): void {
  const activeTemplate: PromptTemplate = {
    ...cloneTemplate(template),
    isActive: template.isActive ?? true,
  };

  templateCatalogMemoryCache.forEach((entry, cacheKey) => {
    const nextTemplates =
      cacheKey === 'active' && activeTemplate.isActive === false
        ? entry.templates.filter((existingTemplate) => existingTemplate.id !== activeTemplate.id)
        : upsertCachedTemplate(entry.templates, activeTemplate);

    templateCatalogMemoryCache.set(cacheKey, {
      source: entry.source,
      templates: cloneTemplates(nextTemplates),
      updatedAt: Date.now(),
    });
  });
}

function normalizeTemplateServiceBaseUrl(): string {
  const configuredBaseUrl =
    (
      globalThis as typeof globalThis & {
        __PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__?: string;
      }
    ).__PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__?.trim() ?? '';

  return configuredBaseUrl.replace(/\/+$/, '');
}

function hasTemplateServiceConfigured(): boolean {
  return normalizeTemplateServiceBaseUrl().length > 0;
}

function createTemplateServiceUrl(pathname: string): string {
  return `${normalizeTemplateServiceBaseUrl()}${pathname}`;
}

function upsertCachedTemplate(
  existingTemplates: PromptTemplate[],
  nextTemplate: PromptTemplate,
): PromptTemplate[] {
  return [cloneTemplate(nextTemplate), ...existingTemplates.filter((template) => template.id !== nextTemplate.id)];
}

async function proxyClaudeVisionRequest(
  message: ClaudeVisionRuntimeRequest,
): Promise<ClaudeVisionRuntimeSuccessResponse> {
  const response = await executeGeminiPayload(
    {
      model: ModelTarget.GEMINI,
      prompt: message.payload.userPrompt,
      systemPrompt: message.payload.systemPrompt,
      imageData: message.payload.imageData,
      maxTokens: message.payload.maxTokens ?? 800,
      temperature: message.payload.temperature ?? 0,
    },
    {
      includeImageData: true,
      operationLabel: 'Gemini vision bridge execution',
    },
  );

  return {
    ok: true,
    content: response.text,
    model: response.model,
    stopReason: null,
  };
}

/**
 * Executes a normalized LLM payload against a single provider and returns normalized text.
 */
async function executeApiPayloadForSingleProvider(
  payload: ApiPayload,
): Promise<{ text: string; executionTimeMs: number }> {
  const startTime = Date.now();

  try {
    switch (payload.model) {
      case ModelTarget.GROQ:
      case ModelTarget.GPT4O:
      case ModelTarget.CLAUDE:
      case ModelTarget.GEMINI: {
        const response = await executeGeminiPayload(payload, {
          includeImageData: true,
          operationLabel: 'Gemini execution',
        });
        const executionTimeMs = Date.now() - startTime;
        console.info(
          `[PromptBridge][LLM] Gemini completed in ${executionTimeMs}ms using the configured Gemini API key.`,
        );
        return { text: response.text, executionTimeMs };
      }
      case ModelTarget.LLAMA:
      case ModelTarget.CUSTOM: {
        const response = await executeGeminiPayload(
          {
            ...payload,
            model: ModelTarget.GEMINI,
          },
          {
            includeImageData: true,
            operationLabel: 'Gemini execution',
          },
        );
        const executionTimeMs = Date.now() - startTime;
        console.info(
          `[PromptBridge][LLM] Gemini completed in ${executionTimeMs}ms using the configured Gemini API key.`,
        );
        return { text: response.text, executionTimeMs };
      }
      case ModelTarget.OLLAMA: {
        const appSettings = await loadAppSettings().catch(() => DEFAULT_APP_SETTINGS);
        const response = await callLlm(
          payload,
          createOllamaProviderConfig(appSettings.ollamaBaseUrl ?? DEFAULT_APP_SETTINGS.ollamaBaseUrl),
        );

        console.info(
          `[PromptBridge][LLM] Ollama completed in ${response.executionTimeMs}ms using ${appSettings.ollamaBaseUrl ?? DEFAULT_APP_SETTINGS.ollamaBaseUrl}.`,
        );

        return {
          text: response.text,
          executionTimeMs: response.executionTimeMs,
        };
      }
      default: {
        const unreachableModel: never = payload.model;
        return unreachableModel;
      }
    }
  } catch (error) {
    if (error instanceof LlmClientError) {
      throw new ServiceWorkerApiError(
        error.status,
        buildProviderErrorMessage('Ollama', error.status, error.message),
        error.cause ?? error,
      );
    }

    if (error instanceof ServiceWorkerApiError || error instanceof GeminiRotationError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new ServiceWorkerApiError(500, error.message, error);
    }

    throw new ServiceWorkerApiError(
      500,
      'An unknown model execution error occurred.',
      error,
    );
  }
}

/**
 * Executes a normalized LLM payload against the selected provider and automatically fails over to
 * another configured provider when the first choice is unavailable, rate-limited, or misconfigured.
 */
export async function executeApiPayload(
  payload: ApiPayload,
): Promise<{ text: string; executionTimeMs: number }> {
  const providerOrder = getProviderFailoverOrder(payload.model);
  let lastError: unknown = null;

  for (let index = 0; index < providerOrder.length; index += 1) {
    const providerModel = providerOrder[index];
    const providerPayload = buildProviderAttemptPayload(payload, providerModel);

    try {
      return await executeApiPayloadForSingleProvider(providerPayload);
    } catch (error) {
      lastError = error;

      if (index === providerOrder.length - 1 || !shouldFailOverToAnotherProvider(error)) {
        throw error;
      }

      const currentProviderLabel = getProviderLabelForModel(providerModel);
      const nextProviderLabel = getProviderLabelForModel(providerOrder[index + 1]);

      console.warn(
        `[PromptBridge][LLM] ${currentProviderLabel} failed (${getErrorMessage(error)}). Falling back to ${nextProviderLabel}.`,
      );
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new ServiceWorkerApiError(
    503,
    'PromptBridge could not find a working provider for this request.',
    lastError,
  );
}

async function loadTemplatesFromTemplateService(
  includeInactive = false,
): Promise<LoadTemplatesSuccessResponse> {
  const cachedResponse = readTemplateCatalogCache(includeInactive);

  if (cachedResponse) {
    return cachedResponse;
  }

  const cacheKey = getTemplateCacheKey(includeInactive);
  const pendingLoad = templateCatalogPendingLoads.get(cacheKey);

  if (pendingLoad) {
    return cloneTemplateLoadResponse(await pendingLoad);
  }

  const loadPromise = (async (): Promise<LoadTemplatesSuccessResponse> => {
    const cachedTemplates = cloneTemplates(await loadPromptTemplates());
    const localCachedResponse: LoadTemplatesSuccessResponse = {
      ok: true,
      source: 'cache',
      templates: includeInactive ? cachedTemplates : filterActiveTemplates(cachedTemplates),
    };

    if (!hasTemplateServiceConfigured()) {
      writeTemplateCatalogCache(
        includeInactive,
        localCachedResponse.source,
        localCachedResponse.templates,
      );
      return localCachedResponse;
    }

    try {
      const responseBody = await performJsonRequestWithBackoff<TemplateServiceLoadResponse>(
        'PromptBridge Template Service',
        createTemplateServiceUrl(
          `${TEMPLATE_SERVICE_ENDPOINT_PATH}${includeInactive ? '?includeInactive=true' : ''}`,
        ),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        },
      );
      const remoteTemplates = Array.isArray(responseBody.templates)
        ? cloneTemplates(responseBody.templates)
        : [];

      if (remoteTemplates.length > 0) {
        const templatesForStorage = includeInactive
          ? remoteTemplates
          : mergeTemplateSnapshots(
              cachedTemplates.filter((template) => template.isActive === false),
              remoteTemplates,
            );

        await savePromptTemplates(templatesForStorage);
        writeTemplateCatalogCache(includeInactive, 'remote', remoteTemplates);

        return {
          ok: true,
          source: 'remote',
          templates: remoteTemplates,
        };
      }
    } catch (error) {
      console.warn(
        '[PromptBridge][TemplateService] Falling back to cached templates after remote load failure.',
        error,
      );
    }

    writeTemplateCatalogCache(
      includeInactive,
      localCachedResponse.source,
      localCachedResponse.templates,
    );

    return localCachedResponse;
  })();

  templateCatalogPendingLoads.set(cacheKey, loadPromise);

  try {
    return cloneTemplateLoadResponse(await loadPromise);
  } finally {
    templateCatalogPendingLoads.delete(cacheKey);
  }
}

async function saveTemplateToTemplateService(
  template: PromptTemplate,
): Promise<SaveTemplateSuccessResponse> {
  const normalizedTemplate = cloneTemplate(template);
  const activeTemplate = {
    ...normalizedTemplate,
    isActive: normalizedTemplate.isActive ?? true,
  };

  if (hasTemplateServiceConfigured()) {
    try {
      const responseBody = await performJsonRequestWithBackoff<TemplateServiceSaveResponse>(
        'PromptBridge Template Service',
        createTemplateServiceUrl(TEMPLATE_SERVICE_ENDPOINT_PATH),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(normalizedTemplate),
        },
      );

      if (responseBody.template) {
        const cachedTemplates = await loadPromptTemplates();
        await savePromptTemplates(upsertCachedTemplate(cachedTemplates, responseBody.template));
        syncTemplateCatalogCacheAfterSave(responseBody.template);

        return {
          ok: true,
          template: cloneTemplate(responseBody.template),
        };
      }
    } catch (error) {
      console.warn(
        '[PromptBridge][TemplateService] Remote template save failed; keeping local cache in sync only.',
        error,
      );
    }
  }

  const cachedTemplates = await loadPromptTemplates();
  await savePromptTemplates(upsertCachedTemplate(cachedTemplates, activeTemplate));
  syncTemplateCatalogCacheAfterSave(activeTemplate);

  return {
    ok: true,
    template: activeTemplate,
  };
}

async function bootstrapExtension(): Promise<void> {
  await ensureStorageDefaults();
}

async function getActiveContext(): Promise<PageContext> {
  const [activeTab] = await queryTabs({ active: true, lastFocusedWindow: true });

  if (!activeTab?.id) {
    throw new Error('No active tab is available.');
  }

  try {
    return await sendTabMessage<PageContext>(activeTab.id, {
      type: 'COLLECT_PAGE_CONTEXT',
    });
  } catch {
    return {
      title: activeTab.title ?? 'Untitled tab',
      url: activeTab.url ?? '',
      selection: '',
      summary: '',
    };
  }
}

function buildHistoryEntry(result: PipelineResult): HistoryEntry {
  return {
    id: globalThis.crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    intent: result.intent.intent,
    templateId: result.template.id,
    complexityDelta: result.complexityScore.delta,
    confidenceLevel: result.confidenceLevel,
    rating: null,
    enrichedPrompt: result.enrichedPrompt,
    response: result.processedResponse,
    model: result.model ?? ModelTarget.GEMINI,
    matchZone: result.matchZone,
  };
}

export async function handleRuntimeRequest(
  message: RuntimeRequest,
): Promise<
  | PageContext
  | PingResponse
  | SavePipelineResultResponse
  | UpdateHistoryRatingResponse
  | ExecuteLlmSuccessResponse
  | LoadTemplatesSuccessResponse
  | SaveTemplateSuccessResponse
  | ClaudeVisionRuntimeSuccessResponse
  | GroqListModelsSuccessResponse
  | GroqChatCompletionSuccessResponse
  | SuccessResponse
  | ErrorResponse
> {
  switch (message.type) {
    case 'PING':
      return {
        ok: true,
        version: browser.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
      };
    case 'OPEN_OPTIONS':
      await openOptionsPage();
      return { ok: true };
    case 'GET_ACTIVE_CONTEXT':
      return getActiveContext();
    case 'SAVE_PIPELINE_RESULT': {
      const entry = buildHistoryEntry(message.payload);
      await appendHistoryEntry(entry);
      return { ok: true, entry };
    }
    case 'SUBMIT_RATING':
      await savePromptRating(message.payload);
      return { ok: true };
    case 'UPDATE_HISTORY_RATING': {
      const entry = await updateHistoryEntryRating(
        message.payload.entryId,
        message.payload.rating,
      );
      return { ok: true, entry };
    }
    case 'CONTENT_READY':
      return { ok: true };
    case 'EXECUTE_LLM': {
      const result = await executeApiPayload(message.payload);
      return {
        ok: true,
        text: result.text,
        executionTimeMs: result.executionTimeMs,
      };
    }
    case 'LOAD_TEMPLATES':
      return loadTemplatesFromTemplateService(message.includeInactive);
    case 'SAVE_TEMPLATE':
      return saveTemplateToTemplateService(message.payload);
    case 'GROQ_LIST_MODELS':
      return listGeminiModels();
    case 'GROQ_CHAT_COMPLETION':
      return proxyGeminiChatCompletion(message.payload);
    case 'CLAUDE_VISION_REQUEST':
      return proxyClaudeVisionRequest(message);
    default: {
      const unhandledRequest: never = message;
      throw new Error(`Unsupported runtime request: ${JSON.stringify(unhandledRequest)}`);
    }
  }
}

browser.runtime.onInstalled.addListener(() => {
  void bootstrapExtension();
});

browser.runtime.onStartup.addListener(() => {
  void bootstrapExtension();
});

void bootstrapExtension();

registerMessageRouter({
  handleRuntimeRequest,
  isRestrictedContentScriptRequest,
  getErrorMessage,
  getErrorCode,
});
