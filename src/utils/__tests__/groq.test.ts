import type { GroqBridgeError } from '../groq';
import {
  GroqBridgeErrorCode,
  listGroqModels,
  sendGroqChatCompletion,
} from '../groq';

function installRuntimeMock(responseFactory: () => unknown): jest.Mock {
  const sendMessageMock = jest.fn(
    (_message: unknown, callback: (response: unknown) => void): void => {
      callback(responseFactory());
    },
  );

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: sendMessageMock,
      },
    } as unknown as typeof chrome,
  });

  return sendMessageMock;
}

describe('groq runtime bridge', () => {
  it('lists Groq models through the background worker', async () => {
    const sendMessageMock = installRuntimeMock(() => ({
      ok: true,
      models: ['groq/compound-mini', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    }));

    const response = await listGroqModels();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: 'GROQ_LIST_MODELS' },
      expect.any(Function),
    );
    expect(response.models).toContain('groq/compound-mini');
  });

  it('requests a Groq chat completion through the background worker', async () => {
    const sendMessageMock = installRuntimeMock(() => ({
      ok: true,
      id: 'chatcmpl-123',
      model: 'groq/compound-mini',
      content: 'Hello from Groq.',
      finishReason: 'stop',
    }));

    const response = await sendGroqChatCompletion({
      model: 'groq/compound-mini',
      messages: [{ role: 'user', content: 'Say hello.' }],
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      {
        type: 'GROQ_CHAT_COMPLETION',
        payload: {
          model: 'groq/compound-mini',
          messages: [{ role: 'user', content: 'Say hello.' }],
        },
      },
      expect.any(Function),
    );
    expect(response.content).toBe('Hello from Groq.');
  });

  it('throws a typed error when the background worker returns a Groq error response', async () => {
    installRuntimeMock(() => ({
      ok: false,
      error: 'Groq authentication failed.',
    }));

    await expect(listGroqModels()).rejects.toMatchObject({
      name: 'GroqBridgeError',
      code: GroqBridgeErrorCode.REQUEST_FAILED,
    } satisfies Partial<GroqBridgeError>);
  });
});
