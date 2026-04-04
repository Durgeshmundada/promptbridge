export function installRuntimeMock(responseFactory: () => unknown): jest.Mock {
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
