import { ImageType } from '../../types';

export const CLAUDE_VISION_MODEL = 'claude-3-5-sonnet-20241022';
export const DEFAULT_CLAUDE_VISION_MIME_TYPE = 'image/png';

export interface ClaudeVisionRuntimePayload {
  systemPrompt: string;
  userPrompt: string;
  imageData: string;
  mimeType?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeVisionRuntimeRequest {
  type: 'CLAUDE_VISION_REQUEST';
  payload: ClaudeVisionRuntimePayload;
}

export interface ClaudeVisionRuntimeSuccessResponse {
  ok: true;
  content: string;
  model: string;
  stopReason: string | null;
}

export interface ClaudeVisionRuntimeErrorResponse {
  ok: false;
  error: string;
}

export type ClaudeVisionRuntimeResponse =
  | ClaudeVisionRuntimeSuccessResponse
  | ClaudeVisionRuntimeErrorResponse;

export enum Layer4ErrorCode {
  RUNTIME_UNAVAILABLE = 'RUNTIME_UNAVAILABLE',
  REQUEST_FAILED = 'REQUEST_FAILED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  JSON_PARSE_FAILED = 'JSON_PARSE_FAILED',
}

export class Layer4Error extends Error {
  code: Layer4ErrorCode;
  cause?: unknown;

  /**
   * Creates a typed multimodal pipeline error.
   */
  constructor(code: Layer4ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'Layer4Error';
    this.code = code;
    this.cause = cause;
  }
}

const IMAGE_TYPE_VALUES = new Set<string>(Object.values(ImageType));

function toLayer4Error(error: unknown, code: Layer4ErrorCode, fallbackMessage: string): Layer4Error {
  if (error instanceof Layer4Error) {
    return error;
  }

  if (error instanceof Error) {
    return new Layer4Error(code, error.message, error);
  }

  return new Layer4Error(code, fallbackMessage, error);
}

function getRuntime(): typeof chrome.runtime {
  const runtime = globalThis.chrome?.runtime;

  if (!runtime) {
    throw new Layer4Error(
      Layer4ErrorCode.RUNTIME_UNAVAILABLE,
      'chrome.runtime is not available for Claude Vision requests.',
    );
  }

  return runtime;
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fencedMatch?.[1]?.trim() ?? trimmed;
}

/**
 * Parses a Claude text response that should contain JSON, including fenced JSON blocks.
 */
export function parseClaudeJsonResponse(rawText: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(extractJsonText(rawText)) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Layer4Error(
        Layer4ErrorCode.INVALID_RESPONSE,
        'Claude Vision returned JSON that is not an object.',
      );
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    throw toLayer4Error(
      error,
      Layer4ErrorCode.JSON_PARSE_FAILED,
      'Failed to parse the Claude Vision JSON response.',
    );
  }
}

/**
 * Normalizes raw base64 or data URL image input into a MIME type plus plain base64 payload.
 */
export function normalizeImagePayload(
  imageData: string,
  fallbackMimeType: string = DEFAULT_CLAUDE_VISION_MIME_TYPE,
): { imageData: string; mimeType: string } {
  const dataUrlMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (dataUrlMatch?.[1] && dataUrlMatch[2]) {
    return {
      mimeType: dataUrlMatch[1],
      imageData: dataUrlMatch[2],
    };
  }

  return {
    mimeType: fallbackMimeType,
    imageData,
  };
}

/**
 * Coerces a raw model-returned value into a supported ImageType.
 */
export function coerceImageType(value: unknown): ImageType {
  if (typeof value === 'string' && IMAGE_TYPE_VALUES.has(value)) {
    return value as ImageType;
  }

  return ImageType.UNKNOWN;
}

/**
 * Sends a Claude Vision request through the background service worker and returns the typed success payload.
 */
export async function sendClaudeVisionRequest(
  payload: ClaudeVisionRuntimePayload,
): Promise<ClaudeVisionRuntimeSuccessResponse> {
  const runtime = getRuntime();

  try {
    return await new Promise<ClaudeVisionRuntimeSuccessResponse>((resolve, reject) => {
      runtime.sendMessage(
        {
          type: 'CLAUDE_VISION_REQUEST',
          payload,
        } satisfies ClaudeVisionRuntimeRequest,
        (response: ClaudeVisionRuntimeResponse) => {
          const runtimeError = globalThis.chrome?.runtime?.lastError;

          if (runtimeError) {
            reject(
              new Layer4Error(
                Layer4ErrorCode.REQUEST_FAILED,
                runtimeError.message ?? 'The Claude Vision runtime request failed.',
                runtimeError,
              ),
            );
            return;
          }

          if (!response || response.ok !== true) {
            reject(
              new Layer4Error(
                Layer4ErrorCode.REQUEST_FAILED,
                response?.error ?? 'The background worker returned an empty Claude Vision response.',
              ),
            );
            return;
          }

          resolve(response);
        },
      );
    });
  } catch (error) {
    throw toLayer4Error(
      error,
      Layer4ErrorCode.REQUEST_FAILED,
      'Failed to send a Claude Vision request through the background worker.',
    );
  }
}
