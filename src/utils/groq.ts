export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatCompletionPayload {
  model: string;
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface GroqListModelsRequest {
  type: 'GROQ_LIST_MODELS';
}

export interface GroqChatCompletionRequest {
  type: 'GROQ_CHAT_COMPLETION';
  payload: GroqChatCompletionPayload;
}

export type GroqRuntimeRequest = GroqListModelsRequest | GroqChatCompletionRequest;

export interface GroqListModelsSuccessResponse {
  ok: true;
  models: string[];
}

export interface GroqChatCompletionSuccessResponse {
  ok: true;
  id: string;
  model: string;
  content: string;
  finishReason: string | null;
}

export interface GroqRuntimeErrorResponse {
  ok: false;
  error: string;
}

export type GroqListModelsResponse = GroqListModelsSuccessResponse | GroqRuntimeErrorResponse;
export type GroqChatCompletionResponse =
  | GroqChatCompletionSuccessResponse
  | GroqRuntimeErrorResponse;

export enum GroqBridgeErrorCode {
  RUNTIME_UNAVAILABLE = 'RUNTIME_UNAVAILABLE',
  REQUEST_FAILED = 'REQUEST_FAILED',
}

export class GroqBridgeError extends Error {
  code: GroqBridgeErrorCode;
  cause?: unknown;

  /**
   * Creates a typed Groq bridge error.
   */
  constructor(code: GroqBridgeErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'GroqBridgeError';
    this.code = code;
    this.cause = cause;
  }
}

function getRuntime(): typeof chrome.runtime {
  const runtime = globalThis.chrome?.runtime;

  if (!runtime) {
    throw new GroqBridgeError(
      GroqBridgeErrorCode.RUNTIME_UNAVAILABLE,
      'chrome.runtime is not available for Groq requests.',
    );
  }

  return runtime;
}

function toGroqBridgeError(
  error: unknown,
  code: GroqBridgeErrorCode,
  fallbackMessage: string,
): GroqBridgeError {
  if (error instanceof GroqBridgeError) {
    return error;
  }

  if (error instanceof Error) {
    return new GroqBridgeError(code, error.message, error);
  }

  return new GroqBridgeError(code, fallbackMessage, error);
}

async function sendGroqRuntimeRequest<TSuccessResponse extends { ok: true }>(
  message: GroqRuntimeRequest,
): Promise<TSuccessResponse> {
  const runtime = getRuntime();

  try {
    return await new Promise<TSuccessResponse>((resolve, reject) => {
      runtime.sendMessage(message, (response: TSuccessResponse | GroqRuntimeErrorResponse) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;

        if (runtimeError) {
          reject(
            new GroqBridgeError(
              GroqBridgeErrorCode.REQUEST_FAILED,
              runtimeError.message ?? 'The Groq runtime request failed.',
              runtimeError,
            ),
          );
          return;
        }

        if (!response || response.ok !== true) {
          reject(
            new GroqBridgeError(
              GroqBridgeErrorCode.REQUEST_FAILED,
              response?.error ?? 'The background worker returned an empty Groq response.',
            ),
          );
          return;
        }

        resolve(response);
      });
    });
  } catch (error) {
    throw toGroqBridgeError(
      error,
      GroqBridgeErrorCode.REQUEST_FAILED,
      'Failed to send a Groq runtime request.',
    );
  }
}

/**
 * Requests the Groq model catalog through the background worker.
 */
export async function listGroqModels(): Promise<GroqListModelsSuccessResponse> {
  return sendGroqRuntimeRequest<GroqListModelsSuccessResponse>({
    type: 'GROQ_LIST_MODELS',
  });
}

/**
 * Requests a Groq chat completion through the background worker.
 */
export async function sendGroqChatCompletion(
  payload: GroqChatCompletionPayload,
): Promise<GroqChatCompletionSuccessResponse> {
  return sendGroqRuntimeRequest<GroqChatCompletionSuccessResponse>({
    type: 'GROQ_CHAT_COMPLETION',
    payload,
  });
}
