import type { ApiPayload } from '../../types';
import type { ProviderConfig, ProviderRequest } from './client';

const GEMINI_GENERATE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export function createGeminiProviderConfig(apiKey: string): ProviderConfig {
  return {
    label: 'Gemini',
    buildRequest: (payload: ApiPayload): ProviderRequest => ({
      url: GEMINI_GENERATE_URL,
      init: {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: [payload.systemPrompt, payload.prompt].filter(Boolean).join('\n\n') }],
            },
          ],
          generationConfig: {
            maxOutputTokens: payload.maxTokens,
            temperature: payload.temperature ?? 0,
          },
        }),
      },
    }),
    parseResponse: (body: unknown): string => {
      const record = body as Record<string, unknown>;
      const candidates = Array.isArray(record.candidates) ? record.candidates : [];
      const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
      const content = firstCandidate?.content as Record<string, unknown> | undefined;
      const parts = Array.isArray(content?.parts) ? content.parts : [];
      return parts
        .map((part) => {
          const recordPart = part as Record<string, unknown>;
          return typeof recordPart.text === 'string' ? recordPart.text : '';
        })
        .join('')
        .trim();
    },
  };
}
