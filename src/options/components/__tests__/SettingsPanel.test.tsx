import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../../pipeline/layer3/sensitiveDataVault', () => ({
  deleteSecret: jest.fn(),
  initVault: jest.fn(),
  isSessionValid: jest.fn(() => false),
  lockVault: jest.fn(),
  storeSecret: jest.fn(),
}));

import SettingsPanel from '../SettingsPanel';
import { usePromptBridgeStore } from '../../../store';

type StorageMap = Record<string, unknown>;

function structuredClonePolyfill<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMockStorageArea(
  runtime: { lastError?: chrome.runtime.LastError },
): chrome.storage.StorageArea {
  const store: StorageMap = {};

  return {
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
}

function installMockChrome(): void {
  const runtime: { lastError?: chrome.runtime.LastError } = {};

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime,
      storage: {
        local: createMockStorageArea(runtime),
        sync: createMockStorageArea(runtime),
      },
    } as unknown as typeof chrome,
  });
}

describe('SettingsPanel', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: structuredClonePolyfill,
    });
  });

  beforeEach(() => {
    installMockChrome();
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('persists a lower session memory depth after the settings view is reopened', async () => {
    render(<SettingsPanel />);

    const sessionDepthSlider = screen.getByRole('slider');

    fireEvent.change(sessionDepthSlider, {
      target: { value: '2' },
    });

    await screen.findByText('Session memory depth updated to 2 turns.');
    await waitFor(() => {
      expect(usePromptBridgeStore.getState().settings.sessionMemoryDepth).toBe(2);
    });
    expect(screen.getByText('2 turns')).toBeTruthy();

    act(() => {
      usePromptBridgeStore.getState().resetState();
    });

    await act(async () => {
      await usePromptBridgeStore.getState().hydratePersistentState();
    });

    expect(usePromptBridgeStore.getState().settings.sessionMemoryDepth).toBe(2);
  });
});
