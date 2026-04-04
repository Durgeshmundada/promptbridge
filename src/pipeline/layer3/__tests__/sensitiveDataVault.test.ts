import type { VaultError } from '../sensitiveDataVault';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  deleteSecret,
  initVault,
  isSessionValid,
  lockVault,
  retrieveSecret,
  storeSecret,
  VaultErrorCode,
} from '../sensitiveDataVault';

type StorageMap = Record<string, unknown>;

interface MockStorageAreaControls {
  clear: () => void;
}

interface MockChromeControls {
  localControls: MockStorageAreaControls;
}

function createMockStorageArea(
  runtime: { lastError?: chrome.runtime.LastError },
): { area: chrome.storage.StorageArea; controls: MockStorageAreaControls } {
  const store: StorageMap = {};

  const area = {
    get(
      keys: string | string[] | Record<string, unknown> | null,
      callback: (items: Record<string, unknown>) => void,
    ): void {
      runtime.lastError = undefined;

      if (typeof keys === 'string') {
        callback(keys in store ? { [keys]: store[keys] } : {});
        return;
      }

      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};

        keys.forEach((key) => {
          if (key in store) {
            result[key] = store[key];
          }
        });

        callback(result);
        return;
      }

      if (keys === null) {
        callback({ ...store });
        return;
      }

      const result: Record<string, unknown> = {};
      Object.keys(keys).forEach((key) => {
        result[key] = key in store ? store[key] : keys[key];
      });

      callback(result);
    },
    set(items: Record<string, unknown>, callback?: () => void): void {
      runtime.lastError = undefined;
      Object.assign(store, items);
      callback?.();
    },
  } as unknown as chrome.storage.StorageArea;

  return {
    area,
    controls: {
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key];
        });
      },
    },
  };
}

function installMockChrome(): MockChromeControls {
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const { area, controls } = createMockStorageArea(runtime);

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime,
      storage: {
        local: area,
        sync: area,
      },
    } as unknown as typeof chrome,
  });

  return { localControls: controls };
}

describe('sensitiveDataVault', () => {
  let mockChromeControls: MockChromeControls;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: TextEncoder,
    });
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: TextDecoder,
    });
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    mockChromeControls = installMockChrome();
    lockVault();
  });

  afterEach(() => {
    mockChromeControls.localControls.clear();
    lockVault();
  });

  it('initializes the vault and performs an encrypted store/retrieve round trip', async () => {
    await initVault('vault-passphrase');
    await storeSecret('openai', 'sk-1234567890abcdefghijklmnopqrstuvwxyz');

    const secret = await retrieveSecret('openai');

    expect(isSessionValid()).toBe(true);
    expect(secret).toBe('sk-1234567890abcdefghijklmnopqrstuvwxyz');
  });

  it('locks the vault and blocks secret retrieval until unlocked again', async () => {
    await initVault('vault-passphrase');
    await storeSecret('anthropic', 'claude-secret');
    lockVault();

    await expect(retrieveSecret('anthropic')).rejects.toMatchObject({
      name: 'VaultError',
      code: VaultErrorCode.SESSION_LOCKED,
    } satisfies Partial<VaultError>);
    expect(isSessionValid()).toBe(false);
  });

  it('deletes stored secrets and returns null for missing entries', async () => {
    await initVault('vault-passphrase');
    await storeSecret('gemini', 'gemini-secret');
    await deleteSecret('gemini');

    const deletedSecret = await retrieveSecret('gemini');

    expect(deletedSecret).toBeNull();
  });
});
