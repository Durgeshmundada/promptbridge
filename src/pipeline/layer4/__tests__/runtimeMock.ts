import { vi, type Mock } from 'vitest';
export function installRuntimeMock(responseFactory: () => unknown): Mock {
  const sendMessageMock = vi.fn(
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
