import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonaManager from '../PersonaManager';
import { usePromptBridgeStore } from '../../../store';
import type { Persona } from '../../../types';

type StorageMap = Record<string, unknown>;

interface MockStorageAreaControls {
  clear: () => void;
}

function structuredClonePolyfill<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Blob reader did not return text content.'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read blob text.'));
    };

    reader.readAsText(blob);
  });
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

function installMockChrome(): void {
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const { area: localArea } = createMockStorageArea(runtime);
  const { area: syncArea } = createMockStorageArea(runtime);

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime,
      storage: {
        local: localArea,
        sync: syncArea,
      },
    } as unknown as typeof chrome,
  });
}

const DEV_MODE_PERSONA: Persona = {
  id: 'dev-mode-persona',
  name: 'Dev Mode',
  role: 'Senior Java Engineer',
  expertise: ['Spring Boot', 'transaction management', 'fintech backend'],
  preferredStyle: 'terse technical',
  domainContext: 'fintech backend',
};

describe('PersonaManager', () => {
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

  it('creates a custom persona and keeps it after store rehydration', async () => {
    render(<PersonaManager />);

    fireEvent.click(screen.getByRole('button', { name: 'New persona' }));
    fireEvent.change(screen.getByLabelText('Id'), {
      target: { value: DEV_MODE_PERSONA.id },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: DEV_MODE_PERSONA.name },
    });
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: DEV_MODE_PERSONA.role },
    });
    fireEvent.change(screen.getByLabelText('Expertise tags'), {
      target: { value: DEV_MODE_PERSONA.expertise.join(', ') },
    });
    fireEvent.change(screen.getByLabelText('Preferred style'), {
      target: { value: DEV_MODE_PERSONA.preferredStyle },
    });
    fireEvent.change(screen.getByLabelText('Domain context'), {
      target: { value: DEV_MODE_PERSONA.domainContext },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save persona' }));
    });

    await screen.findByText('Saved persona "Dev Mode".');

    await act(async () => {
      const state = usePromptBridgeStore.getState();

      await state.saveSettingsToStorage({
        ...state.settings,
        activePersonaId: DEV_MODE_PERSONA.id,
      });
    });

    act(() => {
      usePromptBridgeStore.getState().resetState();
    });

    await act(async () => {
      await usePromptBridgeStore.getState().hydratePersistentState();
    });

    expect(
      usePromptBridgeStore.getState().personas.some((persona) => persona.id === DEV_MODE_PERSONA.id),
    ).toBe(true);
    expect(usePromptBridgeStore.getState().activePersona?.id).toBe(DEV_MODE_PERSONA.id);
  });

  it('exports and imports persona libraries as JSON', async () => {
    let exportedBlob: Blob | null = null;

    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:promptbridge-personas';
      }),
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    act(() => {
      usePromptBridgeStore.getState().setPersonas([
        ...usePromptBridgeStore.getState().personas,
        DEV_MODE_PERSONA,
      ]);
    });

    const { container } = render(<PersonaManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(clickSpy).toHaveBeenCalled();
    expect(exportedBlob).not.toBeNull();

    if (!exportedBlob) {
      throw new Error('Expected the persona export to produce a downloadable blob.');
    }

    await expect(readBlobAsText(exportedBlob)).resolves.toContain('"id": "dev-mode-persona"');

    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput).not.toBeNull();

    const importedPersona: Persona = {
      id: 'risk-review-persona',
      name: 'Risk Review',
      role: 'Payments Risk Engineer',
      expertise: ['ledger integrity', 'rollback controls'],
      preferredStyle: 'risk-first and concise',
      domainContext: 'Payment processing safety reviews.',
    };
    const importFile = new File(
      [JSON.stringify([importedPersona], null, 2)],
      'promptbridge-personas.json',
      { type: 'application/json' },
    );
    const fileContents = JSON.stringify([importedPersona], null, 2);

    Object.defineProperty(importFile, 'text', {
      configurable: true,
      value: jest.fn().mockResolvedValue(fileContents),
    });

    Object.defineProperty(fileInput as HTMLInputElement, 'files', {
      configurable: true,
      value: [importFile],
    });

    await act(async () => {
      fireEvent.change(fileInput as HTMLInputElement);
    });

    await screen.findByText('Imported 1 persona records.');
    await waitFor(() => {
      expect(
        usePromptBridgeStore.getState().personas.some((persona) => persona.id === importedPersona.id),
      ).toBe(true);
    });
  });
});
