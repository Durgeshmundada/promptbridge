import type { ApiPayload } from '../../types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export interface LlmResult {
  text: string;
  executionTimeMs: number;
  status: number;
}

export interface ProviderRequest {
  url: string;
  init: RequestInit;
}

export interface ProviderConfig {
  label: string;
  buildRequest: (payload: ApiPayload) => ProviderRequest;
  parseResponse: (body: unknown) => string;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}

export class LlmClientError extends Error {
  status: number;
  cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'LlmClientError';
    this.status = status;
    this.cause = cause;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(request: ProviderRequest, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LlmClientError(504, 'The upstream model provider timed out.', error);
    }

    throw new LlmClientError(502, 'PromptBridge could not reach the upstream model provider.', error);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function getErrorText(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const error = record.error;

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      const nestedError = error as Record<string, unknown>;
      if (typeof nestedError.message === 'string') {
        return nestedError.message;
      }
    }

    if (typeof record.message === 'string') {
      return record.message;
    }
  }

  return fallback;
}

export async function callLlm(
  payload: ApiPayload,
  providerConfig: ProviderConfig,
): Promise<LlmResult> {
  const retryDelays = providerConfig.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = providerConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown = null;

  for (let attemptIndex = 0; attemptIndex < retryDelays.length; attemptIndex += 1) {
    const startedAt = performance.now();

    try {
      const request = providerConfig.buildRequest(payload);
      const response = await fetchWithTimeout(request, timeoutMs);
      const body = await parseJson(response);

      if (!response.ok) {
        throw new LlmClientError(
          response.status,
          getErrorText(
            body,
            `${providerConfig.label} request failed with status ${response.status}.`,
          ),
          body,
        );
      }

      return {
        text: providerConfig.parseResponse(body),
        executionTimeMs: Math.round(performance.now() - startedAt),
        status: response.status,
      };
    } catch (error) {
      lastError = error;

      const isFinalAttempt = attemptIndex === retryDelays.length - 1;
      if (isFinalAttempt) {
        break;
      }

      await delay(retryDelays[attemptIndex] ?? retryDelays[retryDelays.length - 1]);
    }
  }

  if (lastError instanceof LlmClientError) {
    throw lastError;
  }

  if (lastError instanceof Error) {
    throw new LlmClientError(500, lastError.message, lastError);
  }

  throw new LlmClientError(500, `${providerConfig.label} request failed.`);
}
