import type { ApiPayload } from '../../types';
import type { ProviderConfig, ProviderRequest } from './client';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

export function createAnthropicProviderConfig(apiKey: string): ProviderConfig {
  return {
    label: 'Anthropic',
    buildRequest: (payload: ApiPayload): ProviderRequest => ({
      url: ANTHROPIC_MESSAGES_URL,
      init: {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: payload.maxTokens,
          temperature: payload.temperature ?? 0,
          ...(payload.systemPrompt ? { system: payload.systemPrompt } : {}),
          messages: [{ role: 'user', content: payload.prompt }],
        }),
      },
    }),
    parseResponse: (body: unknown): string => {
      const record = body as Record<string, unknown>;
      const content = Array.isArray(record.content) ? record.content : [];
      return content
        .map((part) => {
          const recordPart = part as Record<string, unknown>;
          return typeof recordPart.text === 'string' ? recordPart.text : '';
        })
        .join('')
        .trim();
    },
  };
}
