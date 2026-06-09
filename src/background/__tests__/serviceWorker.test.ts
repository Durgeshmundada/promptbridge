import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type * as ServiceWorkerModule from '../serviceWorker';
import type * as StorageModule from '../../utils/storage';
import { ModelTarget } from '../../types';

const PROMPTBRIDGE_GLOBAL = globalThis as typeof globalThis & {
  __GEMINI_API_KEY__?: string;
};

interface MockEvent {
  addListener: Mock;
}

function createMockEvent(): MockEvent {
  return {
    addListener: vi.fn(),
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
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function clearBundledGeminiKey(): void {
  PROMPTBRIDGE_GLOBAL.__GEMINI_API_KEY__ = undefined;
}

describe('service worker Gemini-only routing', () => {
  let retrieveSecretMock: Mock;
  let ensureStorageDefaultsMock: Mock;
  let fetchMock: Mock;
  let serviceWorkerModule: typeof ServiceWorkerModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    clearBundledGeminiKey();
    installChromeMock();

    retrieveSecretMock = vi.fn(async (secretKey: string) => {
      switch (secretKey) {
        case 'geminiApiKey':
          return 'gemini-test-key';
        default:
          return null;
      }
    });

    ensureStorageDefaultsMock = vi.fn().mockResolvedValue(undefined);
    fetchMock = vi.fn();

    vi.doMock('../../pipeline/layer3/sensitiveDataVault', () => ({
      retrieveSecret: retrieveSecretMock,
    }));
    vi.doMock('../../utils/storage', async () => {
      const actual = await vi.importActual<typeof StorageModule>('../../utils/storage');

      return {
        ...actual,
        appendHistoryEntry: vi.fn(),
        ensureStorageDefaults: ensureStorageDefaultsMock,
        loadAppSettings: vi.fn().mockResolvedValue(actual.DEFAULT_APP_SETTINGS),
        loadPromptTemplates: vi.fn().mockResolvedValue([]),
        savePromptRating: vi.fn(),
        savePromptTemplates: vi.fn(),
        updateHistoryEntryRating: vi.fn(),
      };
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    serviceWorkerModule = await import('../serviceWorker');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearBundledGeminiKey();
  });

  it('calls Gemini directly for Gemini execution requests', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        modelVersion: 'gemini-2.0-flash',
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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
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

  it('routes legacy GPT4O requests through Gemini using Gemini prompt adaptation', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        modelVersion: 'gemini-2.0-flash',
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Gemini routed response.',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GPT4O,
      prompt: 'Legacy adapted prompt that should be replaced.',
      originalPrompt: 'Summarize the migration plan.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 256,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: expect.stringContaining('respond_request({'),
            },
          ],
        },
      ],
    });
    expect(result.text).toBe('Gemini routed response.');
  });

  it('uses the vault Gemini key even when a legacy bundled key global is present', async () => {
    PROMPTBRIDGE_GLOBAL.__GEMINI_API_KEY__ = 'bundled-gemini-key';
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        modelVersion: 'gemini-2.0-flash',
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Bundled key response.',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await serviceWorkerModule.executeApiPayload({
      model: ModelTarget.GEMINI,
      prompt: 'Use the bundled key.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 128,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
    });
    expect(retrieveSecretMock).toHaveBeenCalledWith('geminiApiKey');
    expect(result.text).toBe('Bundled key response.');
  });

  it('routes vision bridge requests through Gemini instead of Anthropic', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        modelVersion: 'gemini-2.0-flash',
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: '{"type":"DIAGRAM","confidence":0.93}',
                },
              ],
            },
          },
        ],
      }),
    );

    const response = await serviceWorkerModule.handleRuntimeRequest({
      type: 'CLAUDE_VISION_REQUEST',
      payload: {
        systemPrompt: 'Classify this image.',
        userPrompt: 'Describe the attached image.',
        imageData: 'data:image/png;base64,abc123',
        mimeType: 'image/png',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
    });
    expect(response).toMatchObject({
      ok: true,
      model: 'gemini-2.0-flash',
      content: '{"type":"DIAGRAM","confidence":0.93}',
      stopReason: null,
    });
  });

  it('surfaces a Gemini key error when no env key or vault key exists', async () => {
    retrieveSecretMock.mockResolvedValueOnce(null);

    await expect(
      serviceWorkerModule.executeApiPayload({
        model: ModelTarget.CLAUDE,
        prompt: 'Explain the key legal risks.',
        originalPrompt: 'Explain the key legal risks.',
        systemPrompt: 'You are PromptBridge.',
        maxTokens: 512,
      }),
    ).rejects.toMatchObject({
      name: 'GeminiRotationError',
      code: 401,
      message: expect.stringContaining('Gemini API key'),
    });
  });
});
