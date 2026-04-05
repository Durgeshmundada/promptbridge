import type { ApiPayload } from '../types';
import { retrieveSecret } from '../pipeline/layer3/sensitiveDataVault';
import type {
  GroqChatCompletionPayload,
  GroqChatCompletionSuccessResponse,
  GroqListModelsSuccessResponse,
} from '../utils/groq';

interface GeminiApiError {
  code?: number;
  message?: string;
  status?: string;
}

interface GeminiGenerateContentTextPart {
  text?: string;
}

interface GeminiInlineDataPart {
  inline_data: {
    mime_type: string;
    data: string;
  };
}

type GeminiContentPart = GeminiGenerateContentTextPart | GeminiInlineDataPart;

interface GeminiGenerateContentRequestBody {
  system_instruction?: {
    parts: GeminiGenerateContentTextPart[];
  };
  contents: Array<{
    role: 'user' | 'model';
    parts: GeminiContentPart[];
  }>;
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiGenerateContentResponseBody {
  candidates?: Array<{
    finishReason?: string | null;
    content?: {
      parts?: GeminiGenerateContentTextPart[];
    };
  }>;
  modelVersion?: string;
  error?: GeminiApiError;
}

interface GeminiModelDescriptor {
  name?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiListModelsResponseBody {
  models?: GeminiModelDescriptor[];
  error?: GeminiApiError;
}

interface GeminiExecutionResult {
  text: string;
  model: string;
  keySlot: number;
}

interface GeminiApiKeyRecord {
  slot: number;
  value: string;
  source: 'env' | 'vault';
}

export class GeminiRotationError extends Error {
  code: number;
  cause?: unknown;

  constructor(code: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'GeminiRotationError';
    this.code = code;
    this.cause = cause;
  }
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_EXECUTION_MODEL = 'gemini-2.0-flash';
const GEMINI_LIST_MODELS_ENDPOINT = '/models';
const GEMINI_VAULT_SECRET_KEY = 'geminiApiKey';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const ROTATABLE_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504]);
const GEMINI_LIMIT_ERROR_PATTERNS = [
  /quota/i,
  /rate[\s-]?limit/i,
  /too many requests/i,
  /resource exhausted/i,
  /limit exceeded/i,
  /billing/i,
  /exceeded/i,
] as const;
const GEMINI_KEY_GLOBAL_NAMES = [
  '__PROMPTBRIDGE_GEMINI_API_KEY_1__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_2__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_3__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_4__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_5__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_6__',
  '__PROMPTBRIDGE_GEMINI_API_KEY_7__',
] as const;

let currentKeyIndex = 0;
let keyRotationLock: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function normalizeInlineImage(imageData: string): {
  base64Data: string;
  mimeType: string;
} {
  const dataUrlMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    return {
      mimeType: dataUrlMatch[1],
      base64Data: dataUrlMatch[2],
    };
  }

  return {
    mimeType: 'image/png',
    base64Data: imageData,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
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
      throw new GeminiRotationError(
        504,
        'Gemini did not respond within 30 seconds.',
        error,
      );
    }

    throw new GeminiRotationError(
      502,
      'PromptBridge could not reach Gemini.',
      error,
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function withKeyRotationLock<T>(action: () => Promise<T> | T): Promise<T> {
  const previousLock = keyRotationLock;
  let releaseLock!: () => void;

  keyRotationLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;

  try {
    return await action();
  } finally {
    releaseLock();
  }
}

async function getCurrentKeyIndex(totalKeys: number): Promise<number> {
  return withKeyRotationLock(() => {
    if (currentKeyIndex >= totalKeys) {
      currentKeyIndex = 0;
    }

    return currentKeyIndex;
  });
}

async function updateCurrentKeyIndex(nextIndex: number): Promise<void> {
  await withKeyRotationLock(() => {
    currentKeyIndex = nextIndex;
  });
}

function getGeminiApiUrl(pathname: string): string {
  return `${GEMINI_API_BASE_URL}${pathname}`;
}

function getConfiguredGeminiEnvKeys(): GeminiApiKeyRecord[] {
  const globalScope = globalThis as typeof globalThis & Record<string, unknown>;

  return GEMINI_KEY_GLOBAL_NAMES.flatMap((globalName, index) => {
    const keyValue = typeof globalScope[globalName] === 'string' ? globalScope[globalName].trim() : '';

    if (!keyValue) {
      return [];
    }

    return [
      {
        slot: index + 1,
        value: keyValue,
        source: 'env' as const,
      },
    ];
  });
}

async function getGeminiApiKeys(): Promise<GeminiApiKeyRecord[]> {
  const configuredEnvKeys = getConfiguredGeminiEnvKeys();

  if (configuredEnvKeys.length > 0) {
    return configuredEnvKeys;
  }

  const vaultKey = await retrieveSecret(GEMINI_VAULT_SECRET_KEY);

  if (vaultKey?.trim()) {
    return [
      {
        slot: 1,
        value: vaultKey.trim(),
        source: 'vault',
      },
    ];
  }

  throw new GeminiRotationError(
    401,
    'PromptBridge could not find any Gemini API keys. Add PROMPTBRIDGE_GEMINI_API_KEY_1 through PROMPTBRIDGE_GEMINI_API_KEY_7 to .env.local or store geminiApiKey in the vault.',
  );
}

function extractGeminiErrorText(
  statusCode: number,
  responseBody: { error?: GeminiApiError } | null,
): string {
  const apiMessage = responseBody?.error?.message?.trim();
  const apiStatus = responseBody?.error?.status?.trim();

  return [apiMessage, apiStatus, `status ${statusCode}`].filter(Boolean).join(' | ');
}

function isGeminiLimitError(
  statusCode: number,
  responseBody: { error?: GeminiApiError } | null,
): boolean {
  if (statusCode === 429) {
    return true;
  }

  const errorText = extractGeminiErrorText(statusCode, responseBody);
  return GEMINI_LIMIT_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

function shouldRotateKey(
  statusCode: number,
  responseBody: { error?: GeminiApiError } | null,
): boolean {
  if (isGeminiLimitError(statusCode, responseBody)) {
    return true;
  }

  return ROTATABLE_STATUS_CODES.has(statusCode);
}

function buildGeminiErrorMessage(
  statusCode: number,
  responseBody: { error?: GeminiApiError } | null,
): string {
  const providerMessage =
    responseBody?.error?.message?.trim() ??
    `Gemini request failed with status ${statusCode}.`;

  if (statusCode === 401 || statusCode === 403) {
    return 'Gemini authentication failed. Verify the configured API keys.';
  }

  if (isGeminiLimitError(statusCode, responseBody)) {
    return 'Gemini quota or rate limits were reached across the available API keys.';
  }

  if (statusCode === 503) {
    return 'Gemini is temporarily unavailable. Please try again in a moment.';
  }

  if (statusCode === 504) {
    return 'Gemini did not respond within 30 seconds.';
  }

  return providerMessage;
}

function getGenerationConfig(
  maxTokens: number | undefined,
  temperature: number | undefined,
): GeminiGenerateContentRequestBody['generationConfig'] | undefined {
  const generationConfig = {
    ...(typeof maxTokens === 'number' ? { maxOutputTokens: maxTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
  };

  return Object.keys(generationConfig).length > 0 ? generationConfig : undefined;
}

function buildGeminiPayloadRequestBody(
  payload: ApiPayload,
  options: {
    includeImageData: boolean;
  },
): GeminiGenerateContentRequestBody {
  const imagePart =
    options.includeImageData && payload.imageData
      ? [
          {
            inline_data: {
              mime_type: normalizeInlineImage(payload.imageData).mimeType,
              data: normalizeInlineImage(payload.imageData).base64Data,
            },
          } satisfies GeminiInlineDataPart,
        ]
      : [];

  return {
    ...(payload.systemPrompt
      ? {
          system_instruction: {
            parts: [{ text: payload.systemPrompt }],
          },
        }
      : {}),
    contents: [
      {
        role: 'user',
        parts: [
          ...imagePart,
          {
            text: payload.prompt,
          },
        ],
      },
    ],
    ...(getGenerationConfig(payload.maxTokens, payload.temperature)
      ? {
          generationConfig: getGenerationConfig(payload.maxTokens, payload.temperature),
        }
      : {}),
  };
}

function buildGeminiChatRequestBody(
  payload: GroqChatCompletionPayload,
): GeminiGenerateContentRequestBody {
  const systemInstruction = payload.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

  const contents = payload.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: message.content }],
    }));

  return {
    ...(systemInstruction
      ? {
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
        }
      : {}),
    contents:
      contents.length > 0
        ? contents
        : [
            {
              role: 'user',
              parts: [{ text: '' }],
            },
          ],
    ...(getGenerationConfig(payload.maxTokens, payload.temperature)
      ? {
          generationConfig: getGenerationConfig(payload.maxTokens, payload.temperature),
        }
      : {}),
  };
}

function extractGeminiText(responseBody: GeminiGenerateContentResponseBody): string {
  const textContent = (responseBody.candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text.trim() : ''))
    .filter(Boolean)
    .join('\n');

  if (!textContent) {
    throw new GeminiRotationError(502, 'Gemini returned no assistant text content.');
  }

  return textContent;
}

async function performRotatingGeminiJsonRequest<TResponse extends { error?: GeminiApiError }>(
  operationLabel: string,
  pathname: string,
  buildRequestInit: (apiKey: string) => RequestInit,
): Promise<{ responseBody: TResponse; keySlot: number }> {
  const keyRecords = await getGeminiApiKeys();
  const startIndex = await getCurrentKeyIndex(keyRecords.length);
  let lastError: GeminiRotationError | null = null;

  for (let attempt = 0; attempt < keyRecords.length; attempt += 1) {
    const keyIndex = (startIndex + attempt) % keyRecords.length;
    const keyRecord = keyRecords[keyIndex];

    console.info(
      `[PromptBridge][GeminiRotation] Using Gemini key slot ${keyRecord.slot}/${keyRecords.length} (${keyRecord.source}) for ${operationLabel}.`,
    );

    try {
      const requestInit = buildRequestInit(keyRecord.value);
      const requestHeaders =
        requestInit.headers && typeof requestInit.headers === 'object'
          ? (requestInit.headers as Record<string, string>)
          : {};
      const response = await fetchWithTimeout(getGeminiApiUrl(pathname), {
        ...requestInit,
        headers: {
          ...requestHeaders,
          'x-goog-api-key': keyRecord.value,
        },
      });
      const responseBody = await parseJsonResponse<TResponse>(response);

      if (response.ok && responseBody !== null) {
        await updateCurrentKeyIndex(keyIndex);
        return {
          responseBody,
          keySlot: keyRecord.slot,
        };
      }

      const normalizedError = new GeminiRotationError(
        response.status,
        buildGeminiErrorMessage(response.status, responseBody),
        responseBody ?? undefined,
      );

      if (!shouldRotateKey(response.status, responseBody) || attempt === keyRecords.length - 1) {
        throw normalizedError;
      }

      lastError = normalizedError;

      const nextKeyRecord = keyRecords[(keyIndex + 1) % keyRecords.length];
      console.warn(
        `[PromptBridge][GeminiRotation] Switching from Gemini key slot ${keyRecord.slot} to ${nextKeyRecord.slot} after ${operationLabel} failed with ${response.status}.`,
      );
      await updateCurrentKeyIndex((keyIndex + 1) % keyRecords.length);
      await delay(150);
    } catch (error) {
      const normalizedError =
        error instanceof GeminiRotationError
          ? error
          : new GeminiRotationError(
              500,
              error instanceof Error ? error.message : 'An unknown Gemini request error occurred.',
              error,
            );

      if (attempt === keyRecords.length - 1 || !ROTATABLE_STATUS_CODES.has(normalizedError.code)) {
        throw normalizedError;
      }

      lastError = normalizedError;

      const nextKeyRecord = keyRecords[(keyIndex + 1) % keyRecords.length];
      console.warn(
        `[PromptBridge][GeminiRotation] Switching from Gemini key slot ${keyRecord.slot} to ${nextKeyRecord.slot} after ${operationLabel} failed: ${normalizedError.message}`,
      );
      await updateCurrentKeyIndex((keyIndex + 1) % keyRecords.length);
      await delay(150);
    }
  }

  throw (
    lastError ??
    new GeminiRotationError(
      503,
      'All configured Gemini API keys failed for the current request.',
    )
  );
}

export async function executeGeminiPayload(
  payload: ApiPayload,
  options: {
    includeImageData: boolean;
    operationLabel: string;
  },
): Promise<GeminiExecutionResult> {
  const { responseBody, keySlot } =
    await performRotatingGeminiJsonRequest<GeminiGenerateContentResponseBody>(
      options.operationLabel,
      `/models/${GEMINI_EXECUTION_MODEL}:generateContent`,
      () => ({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          buildGeminiPayloadRequestBody(payload, {
            includeImageData: options.includeImageData,
          }),
        ),
      }),
    );

  return {
    text: extractGeminiText(responseBody),
    model: responseBody.modelVersion ?? GEMINI_EXECUTION_MODEL,
    keySlot,
  };
}

export async function listGeminiModels(): Promise<GroqListModelsSuccessResponse> {
  const { responseBody } = await performRotatingGeminiJsonRequest<GeminiListModelsResponseBody>(
    'Gemini model discovery',
    GEMINI_LIST_MODELS_ENDPOINT,
    () => ({
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }),
  );

  const models = Array.from(
    new Set(
      (responseBody.models ?? [])
        .filter((modelDescriptor) =>
          (modelDescriptor.supportedGenerationMethods ?? []).some(
            (method) => method.toLowerCase() === 'generatecontent',
          ),
        )
        .map((modelDescriptor) => modelDescriptor.name?.replace(/^models\//, '').trim() ?? '')
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    ok: true,
    models: models.length > 0 ? models : [GEMINI_EXECUTION_MODEL],
  };
}

export async function proxyGeminiChatCompletion(
  payload: GroqChatCompletionPayload,
): Promise<GroqChatCompletionSuccessResponse> {
  const { responseBody } =
    await performRotatingGeminiJsonRequest<GeminiGenerateContentResponseBody>(
      'Gemini chat completion proxy',
      `/models/${GEMINI_EXECUTION_MODEL}:generateContent`,
      () => ({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildGeminiChatRequestBody(payload)),
      }),
    );

  return {
    ok: true,
    id: globalThis.crypto.randomUUID(),
    model: payload.model,
    content: extractGeminiText(responseBody),
    finishReason: responseBody.candidates?.[0]?.finishReason ?? null,
  };
}
