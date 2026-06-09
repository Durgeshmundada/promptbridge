import type { ApiPayload } from '../../types';
import type { ProviderConfig, ProviderRequest } from './client';

import { DEFAULT_OLLAMA_BASE_URL } from '../../utils/storage';

const DEFAULT_OLLAMA_MODEL = 'llama3.1';

export function createOllamaProviderConfig(baseUrl = DEFAULT_OLLAMA_BASE_URL): ProviderConfig {
  return {
    label: 'Ollama',
    buildRequest: (payload: ApiPayload): ProviderRequest => ({
      url: baseUrl,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_OLLAMA_MODEL,
          prompt: [payload.systemPrompt, payload.prompt].filter(Boolean).join('\n\n'),
          stream: false,
          options: {
            temperature: payload.temperature ?? 0,
            num_predict: payload.maxTokens,
          },
        }),
      },
    }),
    parseResponse: (body: unknown): string => {
      const record = body as Record<string, unknown>;
      return typeof record.response === 'string' ? record.response : '';
    },
  };
}
