import type * as ServiceWorkerModule from '../serviceWorker';
import { ModelTarget } from '../../types';

const PROMPTBRIDGE_GLOBAL = globalThis as typeof globalThis & {
  __PROMPTBRIDGE_GROQ_API_KEY__?: string;
};

interface MockEvent {
  addListener: jest.Mock;
}

function createMockEvent(): MockEvent {
  return {
    addListener: jest.fn(),
  };
}

function installChromeMock(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        id: 'promptbridge-extension-id',
        lastError: undefined,
        getManifest: () => ({ version: '0.1.0' }),
        openOptionsPage: (callback?: () => void) => {
          callback?.();
        },
        onInstalled: createMockEvent(),
        onStartup: createMockEvent(),
        onMessage: createMockEvent(),
      },
      tabs: {
        query: (_queryInfo: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => {
          callback([]);
        },
        sendMessage: (_tabId: number, _message: unknown, callback: (response: unknown) => void) => {
          callback({});
        },
      },
    } as unknown as typeof chrome,
  });
}

function createJsonResponse<T>(status: number, body: T): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('service worker EXECUTE_LLM routing', () => {
  let retrieveSecretMock: jest.Mock;
  let ensureStorageDefaultsMock: jest.Mock;
  let fetchMock: jest.Mock;
  let serviceWorkerModule: typeof ServiceWorkerModule;

  beforeEach(async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    PROMPTBRIDGE_GLOBAL.__PROMPTBRIDGE_GROQ_API_KEY__ = undefined;
    installChromeMock();

    retrieveSecretMock = jest.fn(async (secretKey: string) => {
      switch (secretKey) {
        case 'groqApiKey':
          return 'groq-test-key';
        case 'openaiApiKey':
          return 'openai-test-key';
        case 'anthropicApiKey':
          return 'anthropic-test-key';
        case 'geminiApiKey':
          return 'gemini-test-key';
        default:
          return null;
      }
    });

    ensureStorageDefaultsMock = jest.fn().mockResolvedValue(undefined);
    fetchMock = jest.fn();

    jest.doMock('../../pipeline/layer3/sensitiveDataVault', () => ({
      retrieveSecret: retrieveSecretMock,
    }));
    jest.doMock('../../utils/storage', () => ({
      appendHistoryEntry: jest.fn(),
      ensureStorageDefaults: ensureStorageDefaultsMock,
      savePromptRating: jest.fn(),
      updateHistoryEntryRating: jest.fn(),
    }));

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    serviceWorkerModule = await import('../serviceWorker');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    PROMPTBRIDGE_GLOBAL.__PROMPTBRIDGE_GROQ_API_KEY__ = undefined;
  });

  it('calls OpenAI chat completions and retries once after a 429 response', async () => {
    jest.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(429, {
          error: {
            message: 'Rate limit exceeded.',
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          choices: [
            {
              message: {
                content: 'OpenAI response text.',
              },
            },
          ],
        }),
      );

    const executionPromise = serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GPT4O,
      prompt: 'Summarize the migration plan.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 256,
    });

    await jest.advanceTimersByTimeAsync(1_000);

    const result = await executionPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer openai-test-key',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      model: 'gpt-4o',
      max_completion_tokens: 256,
    });
    expect(result.text).toBe('OpenAI response text.');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('calls the Groq chat completions endpoint and normalizes the assistant text', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        choices: [
          {
            message: {
              content: 'Groq response text.',
            },
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GROQ,
      prompt: 'Tighten this prompt for debugging.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 300,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer groq-test-key',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      max_completion_tokens: 300,
    });
    expect(result.text).toBe('Groq response text.');
  });

  it('uses the bundled Groq key when the vault is empty', async () => {
    PROMPTBRIDGE_GLOBAL.__PROMPTBRIDGE_GROQ_API_KEY__ = 'bundled-groq-key';
    retrieveSecretMock.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        choices: [
          {
            message: {
              content: 'Bundled Groq response text.',
            },
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GROQ,
      prompt: 'Use the bundled key.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 128,
    });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer bundled-groq-key',
    });
    expect(result.text).toBe('Bundled Groq response text.');
  });

  it('calls the Anthropic Messages API and normalizes the text response', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'Anthropic response text.',
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.CLAUDE,
      prompt: 'Explain the key legal risks.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 512,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-api-key': 'anthropic-test-key',
      'anthropic-version': '2023-06-01',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
    });
    expect(result.text).toBe('Anthropic response text.');
  });

  it('calls the Gemini generateContent API and normalizes the candidate text', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Gemini response text.',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GEMINI,
      prompt: 'Extract the main insights.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 384,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      generationConfig: {
        maxOutputTokens: 384,
      },
    });
    expect(result.text).toBe('Gemini response text.');
  });

  it('returns a vault-specific error when the required provider key is unavailable', async () => {
    retrieveSecretMock.mockResolvedValueOnce(null);

    await expect(
      serviceWorkerModule.executeApiPayload({
        model: ModelTarget.CLAUDE,
        prompt: 'Explain the key legal risks.',
        systemPrompt: 'You are PromptBridge.',
        maxTokens: 512,
      }),
    ).rejects.toMatchObject({
      message:
        'PromptBridge could not find a Anthropic API key in the vault. Store it under "anthropicApiKey" and unlock the vault before retrying.',
    });
  });
});
