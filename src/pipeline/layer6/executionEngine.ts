import { adaptPromptForModel } from '../layer2/modelAwareAdapter';
import type { ApiPayload, PipelineResult } from '../../types';
import { ModelTarget } from '../../types';

interface ExecuteLlmRequest {
  type: 'EXECUTE_LLM';
  payload: ApiPayload;
}

interface ExecuteLlmSuccessResponse {
  ok: true;
  text: string;
  executionTimeMs: number;
}

interface ExecuteLlmErrorResponse {
  ok: false;
  error: string;
  code: number;
}

type ExecuteLlmResponse = ExecuteLlmSuccessResponse | ExecuteLlmErrorResponse;

export enum ExecutionEngineErrorCode {
  RUNTIME_UNAVAILABLE = 'RUNTIME_UNAVAILABLE',
  REQUEST_FAILED = 'REQUEST_FAILED',
  TIMEOUT = 'TIMEOUT',
}

export class ExecutionEngineError extends Error {
  code: ExecutionEngineErrorCode;
  statusCode?: number;
  cause?: unknown;

  /**
   * Creates a typed execution-engine error.
   */
  constructor(
    code: ExecutionEngineErrorCode,
    message: string,
    statusCode?: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ExecutionEngineError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000;
const DEFAULT_SYSTEM_PROMPT =
  'You are PromptBridge. Execute the supplied prompt faithfully, follow all included constraints, and return only the requested answer.';

function getRuntime(): typeof chrome.runtime {
  const runtime = globalThis.chrome?.runtime;

  if (!runtime) {
    throw new ExecutionEngineError(
      ExecutionEngineErrorCode.RUNTIME_UNAVAILABLE,
      'chrome.runtime is not available for model execution.',
    );
  }

  return runtime;
}

/**
 * Assembles a normalized API payload for the selected target model.
 */
export function assemblePayload(
  pipelineState: PipelineResult,
  targetModel: ModelTarget,
): ApiPayload {
  const adaptedPrompt = adaptPromptForModel(pipelineState.enrichedPrompt, targetModel);

  switch (targetModel) {
    case ModelTarget.GROQ:
    case ModelTarget.GPT4O:
    case ModelTarget.CLAUDE:
    case ModelTarget.GEMINI:
      return {
        model: targetModel,
        prompt: adaptedPrompt,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        maxTokens: DEFAULT_MAX_TOKENS,
        temperature: 0,
      };
    case ModelTarget.LLAMA:
    case ModelTarget.CUSTOM:
      return {
        model: targetModel,
        prompt: adaptedPrompt,
        maxTokens: DEFAULT_MAX_TOKENS,
        temperature: 0,
      };
    default: {
      const unreachableModel: never = targetModel;
      return unreachableModel;
    }
  }
}

/**
 * Sends a normalized execution request to the background worker and resolves the model response.
 */
export async function execute(
  payload: ApiPayload,
): Promise<{ response: string; executionTimeMs: number }> {
  const runtime = getRuntime();

  try {
    return await new Promise<{ response: string; executionTimeMs: number }>((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        reject(
          new ExecutionEngineError(
            ExecutionEngineErrorCode.TIMEOUT,
            'The model execution request timed out after 30 seconds.',
            504,
          ),
        );
      }, DEFAULT_EXECUTION_TIMEOUT_MS);

      runtime.sendMessage(
        {
          type: 'EXECUTE_LLM',
          payload,
        } satisfies ExecuteLlmRequest,
        (response: ExecuteLlmResponse) => {
          globalThis.clearTimeout(timeoutId);
          const runtimeError = globalThis.chrome?.runtime?.lastError;

          if (runtimeError) {
            reject(
              new ExecutionEngineError(
                ExecutionEngineErrorCode.REQUEST_FAILED,
                runtimeError.message ?? 'The background worker rejected the execution request.',
                500,
                runtimeError,
              ),
            );
            return;
          }

          if (!response || response.ok !== true) {
            reject(
              new ExecutionEngineError(
                ExecutionEngineErrorCode.REQUEST_FAILED,
                response?.error ?? 'The background worker returned an empty execution response.',
                response?.code ?? 500,
              ),
            );
            return;
          }

          resolve({
            response: response.text,
            executionTimeMs: response.executionTimeMs,
          });
        },
      );
    });
  } catch (error) {
    if (error instanceof ExecutionEngineError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new ExecutionEngineError(
        ExecutionEngineErrorCode.REQUEST_FAILED,
        error.message,
        500,
        error,
      );
    }

    throw new ExecutionEngineError(
      ExecutionEngineErrorCode.REQUEST_FAILED,
      'An unknown execution error occurred.',
      500,
      error,
    );
  }
}
