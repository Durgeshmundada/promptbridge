import 'fake-indexeddb/auto';
import type { HistoryEntry } from '../../types';
import type { StorageError } from '../storage';
import { ConfidenceLevel, IntentType, RatingValue } from '../../types';
import {
  StorageErrorCode,
  exportHistoryAsCSV,
  exportHistoryAsJSON,
  getFromLocal,
  getFromSync,
  getHistoryPage,
  initHistoryDB,
  saveHistoryEntry,
  saveToLocal,
  saveToSync,
  searchHistory,
  updateHistoryEntryRating,
} from '../storage';

type StorageMap = Record<string, unknown>;

interface MockStorageAreaControls {
  clear: () => void;
  failNextGet: (message: string) => void;
  failNextSet: (message: string) => void;
}

interface MockChromeControls {
  localControls: MockStorageAreaControls;
  syncControls: MockStorageAreaControls;
}

/**
 * Provides a JSON-based structuredClone fallback for the test environment.
 */
function structuredClonePolyfill<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Creates a mock chrome.storage area backed by an in-memory object.
 */
function createMockStorageArea(
  runtime: { lastError?: chrome.runtime.LastError },
): { area: chrome.storage.StorageArea; controls: MockStorageAreaControls } {
  const store: StorageMap = {};
  let nextGetError: string | null = null;
  let nextSetError: string | null = null;

  const area = {
    get(
      keys: string | string[] | Record<string, unknown> | null,
      callback: (items: Record<string, unknown>) => void,
    ): void {
      runtime.lastError = nextGetError ? ({ message: nextGetError } as chrome.runtime.LastError) : undefined;
      nextGetError = null;

      if (runtime.lastError) {
        callback({});
        runtime.lastError = undefined;
        return;
      }

      if (typeof keys === 'string') {
        callback(keys in store ? { [keys]: store[keys] } : {});
      } else if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};

        keys.forEach((key) => {
          if (key in store) {
            result[key] = store[key];
          }
        });

        callback(result);
      } else if (keys === null) {
        callback({ ...store });
      } else {
        const result: Record<string, unknown> = {};

        Object.keys(keys).forEach((key) => {
          result[key] = key in store ? store[key] : keys[key];
        });

        callback(result);
      }
    },
    set(items: Record<string, unknown>, callback?: () => void): void {
      runtime.lastError = nextSetError ? ({ message: nextSetError } as chrome.runtime.LastError) : undefined;
      nextSetError = null;

      if (!runtime.lastError) {
        Object.assign(store, items);
      }

      callback?.();
      runtime.lastError = undefined;
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
      failNextGet: (message: string) => {
        nextGetError = message;
      },
      failNextSet: (message: string) => {
        nextSetError = message;
      },
    },
  };
}

/**
 * Installs a minimal mock chrome object for storage tests.
 */
function installMockChrome(): MockChromeControls {
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const { area: localArea, controls: localControls } = createMockStorageArea(runtime);
  const { area: syncArea, controls: syncControls } = createMockStorageArea(runtime);

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

  return { localControls, syncControls };
}

/**
 * Deletes the PromptBridge history database between tests.
 */
function deleteHistoryDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('promptbridge_history');

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };

    request.onblocked = () => {
      reject(new Error('Database deletion was blocked.'));
    };
  });
}

/**
 * Builds a deterministic history entry for test scenarios.
 */
function createHistoryEntry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: 'entry-default',
    timestamp: '2026-04-04T00:00:00.000Z',
    intent: IntentType.GENERAL,
    templateId: 'template-default',
    complexityDelta: 1,
    confidenceLevel: ConfidenceLevel.MEDIUM,
    rating: RatingValue.THUMBS_UP,
    enrichedPrompt: 'Default enriched prompt.',
    response: 'Default response text.',
    ...overrides,
  };
}

describe('storage utilities', () => {
  let mockChromeControls: MockChromeControls;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: structuredClonePolyfill,
    });
  });

  beforeEach(async () => {
    mockChromeControls = installMockChrome();
    await deleteHistoryDatabase().catch(() => undefined);
  });

  afterEach(async () => {
    await deleteHistoryDatabase().catch(() => undefined);
  });

  it('saves and reads typed values from chrome.storage.local', async () => {
    await saveToLocal('settings', { theme: 'system', abModeEnabled: true });

    const storedValue = await getFromLocal<{ theme: string; abModeEnabled: boolean }>('settings');

    expect(storedValue).toEqual({ theme: 'system', abModeEnabled: true });
  });

  it('saves and reads typed values from chrome.storage.sync', async () => {
    await saveToSync('persona', { id: 'analyst', role: 'Researcher' });

    const storedValue = await getFromSync<{ id: string; role: string }>('persona');

    expect(storedValue).toEqual({ id: 'analyst', role: 'Researcher' });
  });

  it('returns null for a missing chrome.storage key', async () => {
    const storedValue = await getFromLocal<string>('missing-key');

    expect(storedValue).toBeNull();
  });

  it('throws a typed error when a local storage write fails', async () => {
    mockChromeControls.localControls.failNextSet('Simulated local storage failure.');

    await expect(saveToLocal('broken', { value: 1 })).rejects.toMatchObject({
      name: 'StorageError',
      code: StorageErrorCode.CHROME_STORAGE_SET_FAILED,
    } satisfies Partial<StorageError>);
  });

  it('initializes the history database with the required store and indices', async () => {
    const database = await initHistoryDB();
    const transaction = database.transaction('history', 'readonly');
    const store = transaction.objectStore('history');

    expect(database.objectStoreNames.contains('history')).toBe(true);
    expect(store.indexNames.contains('timestamp')).toBe(true);
    expect(store.indexNames.contains('intent')).toBe(true);

    database.close();
  });

  it('saves history entries and paginates them by descending timestamp', async () => {
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-1',
        timestamp: '2026-04-01T00:00:00.000Z',
        intent: IntentType.CODING,
      }),
    );
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-2',
        timestamp: '2026-04-03T00:00:00.000Z',
        intent: IntentType.RESEARCH,
      }),
    );
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-3',
        timestamp: '2026-04-02T00:00:00.000Z',
        intent: IntentType.CREATIVE,
      }),
    );

    const firstPage = await getHistoryPage(1, 2);
    const secondPage = await getHistoryPage(2, 2);

    expect(firstPage.map((entry) => entry.id)).toEqual(['entry-2', 'entry-3']);
    expect(secondPage.map((entry) => entry.id)).toEqual(['entry-1']);
  });

  it('searches history entries across prompt and metadata text', async () => {
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-search-1',
        intent: IntentType.DATA_ANALYSIS,
        enrichedPrompt: 'Analyze the quarterly sales spreadsheet for anomalies.',
        response: 'Sales anomalies were found in the northern region.',
      }),
    );
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-search-2',
        intent: IntentType.CREATIVE,
        enrichedPrompt: 'Write a poetic summary of the launch event.',
        response: 'A lyrical launch recap.',
      }),
    );

    const analysisResults = await searchHistory('spreadsheet');
    const creativeResults = await searchHistory('creative');

    expect(analysisResults.map((entry) => entry.id)).toEqual(['entry-search-1']);
    expect(creativeResults.map((entry) => entry.id)).toEqual(['entry-search-2']);
  });

  it('exports history as JSON and CSV', async () => {
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'entry-export',
        timestamp: '2026-04-04T12:00:00.000Z',
        intent: IntentType.RESEARCH,
        templateId: 'template-research',
        enrichedPrompt: 'Collect citations for the medical device review.',
        response: 'Here are the most relevant citations.',
      }),
    );

    const json = await exportHistoryAsJSON();
    const csv = await exportHistoryAsCSV();

    expect(json).toContain('"id": "entry-export"');
    expect(json).toContain('"intent": "RESEARCH"');
    expect(csv).toContain('id,timestamp,intent,templateId,complexityDelta,confidenceLevel,rating,enrichedPrompt,response');
    expect(csv).toContain('"entry-export"');
    expect(csv).toContain('"Collect citations for the medical device review."');
  });

  it('updates A/B history ratings and includes them in the CSV export', async () => {
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'ab-entry-a',
        timestamp: '2026-04-04T10:00:00.000Z',
        templateId: 'creative-writing',
        rating: null,
        enrichedPrompt: 'A/B Variant A\nPrompt: write a product description for wireless earbuds',
      }),
    );
    await saveHistoryEntry(
      createHistoryEntry({
        id: 'ab-entry-b',
        timestamp: '2026-04-04T10:00:01.000Z',
        templateId: 'data-analysis',
        rating: null,
        enrichedPrompt: 'A/B Variant B\nPrompt: write a product description for wireless earbuds',
      }),
    );

    await updateHistoryEntryRating('ab-entry-a', RatingValue.THUMBS_UP);
    await updateHistoryEntryRating('ab-entry-b', RatingValue.THUMBS_DOWN);

    const csv = await exportHistoryAsCSV();

    expect(csv).toContain('"creative-writing"');
    expect(csv).toContain('"data-analysis"');
    expect(csv).toContain('"THUMBS_UP"');
    expect(csv).toContain('"THUMBS_DOWN"');
  });
});
