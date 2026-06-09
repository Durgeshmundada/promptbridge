import { ModelTarget } from '../../types';
import type { ApiPayload } from '../../types';
import type { ProviderConfig, ProviderRequest } from './client';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

export function createOpenAiProviderConfig(apiKey: string): ProviderConfig {
  return {
    label: 'OpenAI',
    buildRequest: (payload: ApiPayload): ProviderRequest => ({
      url: OPENAI_CHAT_COMPLETIONS_URL,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: payload.model === ModelTarget.GPT4O ? OPENAI_MODEL : payload.model,
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
