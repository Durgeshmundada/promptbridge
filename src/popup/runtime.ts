import type { HistoryEntry, PipelineResult, RatingValue } from '../types';

export interface SavePipelineResultResponse {
  ok: boolean;
  entry: HistoryEntry;
}

export interface UpdateHistoryRatingResponse {
  ok: boolean;
  entry: HistoryEntry;
}

export type PopupRuntimeRequest =
  | {
      type: 'SAVE_PIPELINE_RESULT';
      payload: PipelineResult;
    }
  | {
      type: 'UPDATE_HISTORY_RATING';
      payload: {
        entryId: string;
        rating: RatingValue;
      };
    };

/**
 * Sends a typed message to the PromptBridge background runtime.
 */
export function sendRuntimeMessage<TResponse>(message: PopupRuntimeRequest): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response);
    });
  });
}
