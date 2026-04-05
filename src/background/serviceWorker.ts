/// <reference lib="webworker" />

import { ModelTarget } from '../types';
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
  CLAUDE_VISION_MODEL,
  type ClaudeVisionRuntimeRequest,
  type ClaudeVisionRuntimeSuccessResponse,
} from '../pipeline/layer4/claudeVisionBridge';
import { retrieveSecret } from '../pipeline/layer3/sensitiveDataVault';
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
  ensureStorageDefaults,
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

type RuntimeRequest =
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

interface ErrorResponse {
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

interface ExecuteLlmErrorResponse extends ErrorResponse {
  code: number;
}

interface OpenAiTextContentPart {
  type: 'text';
  text: string;
}

interface OpenAiImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type OpenAiUserMessageContent = string | Array<OpenAiTextContentPart | OpenAiImageContentPart>;

interface OpenAiChatCompletionRequestBody {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string | OpenAiUserMessageContent;
  }>;
  max_completion_tokens: number;
  temperature?: number;
}

interface OpenAiResponseTextPart {
  type?: string;
  text?: string;
}

interface OpenAiChatCompletionResponseBody {
  choices?: Array<{
    message?: {
      content?: string | OpenAiResponseTextPart[] | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface ClaudeApiImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

interface ClaudeApiImageBlock {
  type: 'image';
  source: ClaudeApiImageSource;
}

interface ClaudeApiTextBlock {
  type: 'text';
  text: string;
}

type ClaudeApiUserContentBlock = ClaudeApiImageBlock | ClaudeApiTextBlock;

interface ClaudeApiRequestBody {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: Array<{
    role: 'user';
    content: ClaudeApiUserContentBlock[];
  }>;
}

interface ClaudeApiResponseContentBlock {
  type: string;
  text?: string;
}

interface ClaudeApiResponseBody {
  model?: string;
  stop_reason?: string | null;
  content?: ClaudeApiResponseContentBlock[];
  error?: {
    message?: string;
  };
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

const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_VAULT_SECRET_KEY = 'anthropicApiKey';
const CLAUDE_API_VERSION = '2023-06-01';
const OPENAI_CHAT_COMPLETIONS_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EXECUTION_MODEL = 'gpt-4o';
const OPENAI_VAULT_SECRET_KEY = 'openaiApiKey';
const CLAUDE_EXECUTION_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown extension error occurred.';
}

function getErrorCode(error: unknown): number | undefined {
  if (error instanceof ServiceWorkerApiError || error instanceof GeminiRotationError) {
    return error.code;
  }

  return undefined;
}

function isRestrictedContentScriptRequest(message: RuntimeRequest): boolean {
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

function normalizeInlineImage(imageData: string): {
  base64Data: string;
  dataUrl: string;
  mimeType: string;
} {
  const dataUrlMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    return {
      mimeType: dataUrlMatch[1],
      base64Data: dataUrlMatch[2],
      dataUrl: imageData,
    };
  }

  return {
    mimeType: 'image/png',
    base64Data: imageData,
    dataUrl: `data:image/png;base64,${imageData}`,
  };
}

async function getVaultApiKey(secretKey: string, providerLabel: string): Promise<string> {
  try {
    const secretValue = await retrieveSecret(secretKey);

    if (secretValue?.trim()) {
      return secretValue.trim();
    }

    throw new ServiceWorkerApiError(
      401,
      `PromptBridge could not find a ${providerLabel} API key in the vault. Store it under "${secretKey}" and unlock the vault before retrying.`,
    );
  } catch (error) {
    if (error instanceof ServiceWorkerApiError) {
      throw error;
    }

    throw new ServiceWorkerApiError(
      401,
      `PromptBridge could not access the vault for the ${providerLabel} API key. Unlock the vault and try again.`,
      error,
    );
  }
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
    chrome.tabs.query(queryInfo, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
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
    chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
      const runtimeError = chrome.runtime.lastError;
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
    chrome.runtime.openOptionsPage(() => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve();
    });
  });
}

function normalizeBase64ImageData(imageData: string): string {
  const dataUrlMatch = imageData.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return dataUrlMatch?.[1] ?? imageData;
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

async function getAnthropicApiKey(): Promise<string> {
  return getVaultApiKey(CLAUDE_VAULT_SECRET_KEY, 'Anthropic');
}

function buildClaudeApiRequestBody(
  message: ClaudeVisionRuntimeRequest,
): ClaudeApiRequestBody {
  return {
    model: CLAUDE_VISION_MODEL,
    max_tokens: message.payload.maxTokens ?? 800,
    temperature: message.payload.temperature ?? 0,
    system: message.payload.systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: message.payload.mimeType ?? 'image/png',
              data: normalizeBase64ImageData(message.payload.imageData),
            },
          },
          {
            type: 'text',
            text: message.payload.userPrompt,
          },
        ],
      },
    ],
  };
}

function buildOpenAiChatRequestBody(payload: ApiPayload): OpenAiChatCompletionRequestBody {
  const userContent: OpenAiUserMessageContent = payload.imageData
    ? [
        {
          type: 'text',
          text: payload.prompt,
        },
        {
          type: 'image_url',
          image_url: {
            url: normalizeInlineImage(payload.imageData).dataUrl,
          },
        },
      ]
    : payload.prompt;

  return {
    model: OPENAI_EXECUTION_MODEL,
    messages: [
      ...(payload.systemPrompt
        ? [
            {
              role: 'system' as const,
              content: payload.systemPrompt,
            },
          ]
        : []),
      {
        role: 'user',
        content: userContent,
      },
    ],
    max_completion_tokens: payload.maxTokens,
    ...(typeof payload.temperature === 'number' ? { temperature: payload.temperature } : {}),
  };
}

function buildClaudeExecutionRequestBody(payload: ApiPayload): ClaudeApiRequestBody {
  return {
    model: CLAUDE_EXECUTION_MODEL,
    max_tokens: payload.maxTokens,
    temperature: payload.temperature ?? 0,
    system: payload.systemPrompt ?? '',
    messages: [
      {
        role: 'user',
        content: payload.imageData
          ? [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: normalizeInlineImage(payload.imageData).mimeType,
                  data: normalizeInlineImage(payload.imageData).base64Data,
                },
              },
              {
                type: 'text',
                text: payload.prompt,
              },
            ]
          : [
              {
                type: 'text',
                text: payload.prompt,
              },
            ],
      },
    ],
  };
}

function extractOpenAiText(responseBody: OpenAiChatCompletionResponseBody): string {
  const messageContent = responseBody.choices?.[0]?.message?.content;

  if (typeof messageContent === 'string' && messageContent.trim()) {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    const textContent = messageContent
      .map((part) => (typeof part.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean)
      .join('\n');

    if (textContent) {
      return textContent;
    }
  }

  throw new ServiceWorkerApiError(502, 'OpenAI returned no assistant text content.');
}

function extractClaudeTextContent(responseBody: ClaudeApiResponseBody): string {
  const contentBlocks = responseBody.content ?? [];
  const textContent = contentBlocks
    .filter(
      (block): block is ClaudeApiTextBlock =>
        block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n');

  if (!textContent) {
    throw new Error('Claude Vision returned no text content.');
  }

  return textContent;
}

async function proxyClaudeVisionRequest(
  message: ClaudeVisionRuntimeRequest,
): Promise<ClaudeVisionRuntimeSuccessResponse> {
  const apiKey = await getAnthropicApiKey();
  const response = await fetch(CLAUDE_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': CLAUDE_API_VERSION,
      'x-api-key': apiKey,
    },
    body: JSON.stringify(buildClaudeApiRequestBody(message)),
  });

  const responseBody = (await response.json()) as ClaudeApiResponseBody;

  if (!response.ok) {
    throw new Error(
      responseBody.error?.message ??
        `Claude Vision request failed with status ${response.status}.`,
    );
  }

  return {
    ok: true,
    content: extractClaudeTextContent(responseBody),
    model: responseBody.model ?? CLAUDE_VISION_MODEL,
    stopReason: responseBody.stop_reason ?? null,
  };
}

/**
 * Executes a normalized LLM payload against the provider mapped from the target model and returns normalized text.
 */
export async function executeApiPayload(
  payload: ApiPayload,
): Promise<{ text: string; executionTimeMs: number }> {
  const startTime = Date.now();

  try {
    switch (payload.model) {
      case ModelTarget.GROQ: {
        const response = await executeGeminiPayload(payload, {
          includeImageData: false,
          operationLabel: 'Groq-compatible Gemini execution',
        });
        const executionTimeMs = Date.now() - startTime;
        console.info(
          `[PromptBridge][LLM] Groq-compatible Gemini completed in ${executionTimeMs}ms using key slot ${response.keySlot}.`,
        );
        return { text: response.text, executionTimeMs };
      }
      case ModelTarget.GPT4O: {
        const apiKey = await getVaultApiKey(OPENAI_VAULT_SECRET_KEY, 'OpenAI');
        const responseBody = await performJsonRequestWithBackoff<OpenAiChatCompletionResponseBody>(
          'OpenAI',
          OPENAI_CHAT_COMPLETIONS_ENDPOINT,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildOpenAiChatRequestBody(payload)),
          },
        );
        const executionTimeMs = Date.now() - startTime;
        const text = extractOpenAiText(responseBody);
        console.info(`[PromptBridge][LLM] OpenAI completed in ${executionTimeMs}ms.`);
        return { text, executionTimeMs };
      }
      case ModelTarget.CLAUDE: {
        const apiKey = await getVaultApiKey(CLAUDE_VAULT_SECRET_KEY, 'Anthropic');
        const responseBody = await performJsonRequestWithBackoff<ClaudeApiResponseBody>(
          'Anthropic',
          CLAUDE_API_ENDPOINT,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'anthropic-version': CLAUDE_API_VERSION,
              'x-api-key': apiKey,
            },
            body: JSON.stringify(buildClaudeExecutionRequestBody(payload)),
          },
        );
        const executionTimeMs = Date.now() - startTime;
        const text = extractClaudeTextContent(responseBody);
        console.info(`[PromptBridge][LLM] Anthropic completed in ${executionTimeMs}ms.`);
        return { text, executionTimeMs };
      }
      case ModelTarget.GEMINI: {
        const response = await executeGeminiPayload(payload, {
          includeImageData: true,
          operationLabel: 'Gemini execution',
        });
        const executionTimeMs = Date.now() - startTime;
        console.info(
          `[PromptBridge][LLM] Gemini completed in ${executionTimeMs}ms using key slot ${response.keySlot}.`,
        );
        return { text: response.text, executionTimeMs };
      }
      case ModelTarget.LLAMA:
      case ModelTarget.CUSTOM:
        throw new ServiceWorkerApiError(
          400,
          `PromptBridge does not have a direct external API mapping for ${payload.model}. Choose GROQ, GPT4O, CLAUDE, or GEMINI for execution.`,
        );
      default: {
        const unreachableModel: never = payload.model;
        return unreachableModel;
      }
    }
  } catch (error) {
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
        version: chrome.runtime.getManifest().version,
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

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrapExtension();
});

void bootstrapExtension();

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  if (sender.tab && isRestrictedContentScriptRequest(message)) {
    sendResponse({
      ok: false,
      error:
        'PromptBridge blocks direct Groq and vision bridge calls from content scripts. Route them through extension pages instead.',
      code: 403,
    } satisfies ExecuteLlmErrorResponse);
    return false;
  }

  void (async () => {
    try {
      const response = await handleRuntimeRequest(message);
      sendResponse(response);
    } catch (error) {
      sendResponse({
        ok: false,
        error: getErrorMessage(error),
        ...(typeof getErrorCode(error) === 'number' ? { code: getErrorCode(error) } : {}),
      } satisfies ErrorResponse);
    }
  })();

  return true;
});
