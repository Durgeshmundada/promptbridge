import type { ApiPayload } from '../../types';
import type { ProviderConfig, ProviderRequest } from './client';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export function createGroqProviderConfig(apiKey: string): ProviderConfig {
  return {
    label: 'Groq',
    buildRequest: (payload: ApiPayload): ProviderRequest => ({
      url: GROQ_CHAT_COMPLETIONS_URL,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            ...(payload.systemPrompt ? [{ role: 'system', content: payload.systemPrompt }] : []),
            { role: 'user', content: payload.prompt },
          ],
          max_tokens: payload.maxTokens,
          temperature: payload.temperature ?? 0,
        }),
      },
    }),
    parseResponse: (body: unknown): string => {
      const record = body as Record<string, unknown>;
      const choices = Array.isArray(record.choices) ? record.choices : [];
      const firstChoice = choices[0] as Record<string, unknown> | undefined;
      const message = firstChoice?.message as Record<string, unknown> | undefined;
      return typeof message?.content === 'string' ? message.content : '';
    },
  };
}
