import type {
  AppSettings,
  HistoryEntry,
  Persona,
  PromptRating,
  PromptTemplate,
  RatingValue,
  ThemePreference,
  VaultEntry,
} from '../types';
import { ModelTarget } from '../types';

/**
 * Error codes used by PromptBridge storage helpers.
 */
export enum StorageErrorCode {
  CHROME_STORAGE_UNAVAILABLE = 'CHROME_STORAGE_UNAVAILABLE',
  CHROME_STORAGE_GET_FAILED = 'CHROME_STORAGE_GET_FAILED',
  CHROME_STORAGE_SET_FAILED = 'CHROME_STORAGE_SET_FAILED',
  INDEXED_DB_UNAVAILABLE = 'INDEXED_DB_UNAVAILABLE',
  INDEXED_DB_OPEN_FAILED = 'INDEXED_DB_OPEN_FAILED',
  INDEXED_DB_TRANSACTION_FAILED = 'INDEXED_DB_TRANSACTION_FAILED',
  INDEXED_DB_REQUEST_FAILED = 'INDEXED_DB_REQUEST_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
}

/**
 * Typed error thrown by PromptBridge storage helpers.
 */
export class StorageError extends Error {
  code: StorageErrorCode;
  cause?: unknown;

  /**
   * Creates a new typed storage error.
   */
  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause;
  }
}

const HISTORY_DB_NAME = 'promptbridge_history';
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE_NAME = 'history';
const HISTORY_TIMESTAMP_INDEX = 'timestamp';
const HISTORY_INTENT_INDEX = 'intent';
const SETTINGS_STORAGE_KEY = 'settings';
const RATINGS_STORAGE_KEY = 'ratings';
const VAULT_STORAGE_KEY = 'vault';
const PERSONAS_STORAGE_KEY = 'personas';
const TEMPLATES_STORAGE_KEY = 'templates';
const PINNED_TEMPLATE_IDS_STORAGE_KEY = 'pinnedTemplateIds';
const DIFF_VIEWER_USAGE_COUNT_STORAGE_KEY = 'diffViewerUsageCount';
const THEME_PREFERENCE_STORAGE_KEY = 'themePreference';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activePersonaId: 'default-persona',
  targetModel: ModelTarget.GROQ,
  sessionMemoryDepth: 8,
  vaultTimeoutMinutes: 20,
  theme: 'system',
  abModeEnabled: false,
  enhancedModeEnabled: false,
};

/**
 * Wraps unknown failures in a typed storage error.
 */
function toStorageError(
  error: unknown,
  code: StorageErrorCode,
  fallbackMessage: string,
): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  if (error instanceof Error) {
    return new StorageError(code, error.message, error);
  }

  return new StorageError(code, fallbackMessage, error);
}

/**
 * Returns a deep-cloned copy of a value.
 */
function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Returns the requested Chrome storage area or throws a typed error when unavailable.
 */
function getChromeStorageArea(area: 'local' | 'sync'): chrome.storage.StorageArea {
  const storageArea = globalThis.chrome?.storage?.[area];

  if (!storageArea) {
    throw new StorageError(
      StorageErrorCode.CHROME_STORAGE_UNAVAILABLE,
      `chrome.storage.${area} is not available in this environment.`,
    );
  }

  return storageArea;
}

/**
 * Returns the IndexedDB factory or throws a typed error when unavailable.
 */
function getIndexedDbFactory(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new StorageError(
      StorageErrorCode.INDEXED_DB_UNAVAILABLE,
      'IndexedDB is not available in this environment.',
    );
  }

  return globalThis.indexedDB;
}

/**
 * Resolves or rejects a Chrome storage callback based on runtime errors.
 */
function completeChromeStorageOperation<T>(
  resolve: (value: T) => void,
  reject: (reason?: unknown) => void,
  successValue: T,
  failureCode: StorageErrorCode,
  failureMessage: string,
): void {
  const runtimeError = globalThis.chrome?.runtime?.lastError;

  if (runtimeError) {
    reject(
      new StorageError(
        failureCode,
        runtimeError.message ?? failureMessage,
        runtimeError,
      ),
    );
    return;
  }

  resolve(successValue);
}

/**
 * Saves a typed value to chrome.storage.local.
 */
export async function saveToLocal<T>(key: string, value: T): Promise<void> {
  try {
    const storageArea = getChromeStorageArea('local');

    await new Promise<void>((resolve, reject) => {
      storageArea.set({ [key]: value }, () => {
        completeChromeStorageOperation(
          resolve,
          reject,
          undefined,
          StorageErrorCode.CHROME_STORAGE_SET_FAILED,
          `Failed to save "${key}" to chrome.storage.local.`,
        );
      });
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.CHROME_STORAGE_SET_FAILED,
      `Failed to save "${key}" to chrome.storage.local.`,
    );
  }
}

/**
 * Retrieves a typed value from chrome.storage.local.
 */
export async function getFromLocal<T>(key: string): Promise<T | null> {
  try {
    const storageArea = getChromeStorageArea('local');

    return await new Promise<T | null>((resolve, reject) => {
      storageArea.get(key, (items) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;

        if (runtimeError) {
          reject(
            new StorageError(
              StorageErrorCode.CHROME_STORAGE_GET_FAILED,
              runtimeError.message ?? `Failed to read "${key}" from chrome.storage.local.`,
              runtimeError,
            ),
          );
          return;
        }

        if (!(key in items)) {
          resolve(null);
          return;
        }

        resolve((items[key] as T | undefined) ?? null);
      });
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.CHROME_STORAGE_GET_FAILED,
      `Failed to read "${key}" from chrome.storage.local.`,
    );
  }
}

/**
 * Saves a typed value to chrome.storage.sync.
 */
export async function saveToSync<T>(key: string, value: T): Promise<void> {
  try {
    const storageArea = getChromeStorageArea('sync');

    await new Promise<void>((resolve, reject) => {
      storageArea.set({ [key]: value }, () => {
        completeChromeStorageOperation(
          resolve,
          reject,
          undefined,
          StorageErrorCode.CHROME_STORAGE_SET_FAILED,
          `Failed to save "${key}" to chrome.storage.sync.`,
        );
      });
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.CHROME_STORAGE_SET_FAILED,
      `Failed to save "${key}" to chrome.storage.sync.`,
    );
  }
}

/**
 * Retrieves a typed value from chrome.storage.sync.
 */
export async function getFromSync<T>(key: string): Promise<T | null> {
  try {
    const storageArea = getChromeStorageArea('sync');

    return await new Promise<T | null>((resolve, reject) => {
      storageArea.get(key, (items) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;

        if (runtimeError) {
          reject(
            new StorageError(
              StorageErrorCode.CHROME_STORAGE_GET_FAILED,
              runtimeError.message ?? `Failed to read "${key}" from chrome.storage.sync.`,
              runtimeError,
            ),
          );
          return;
        }

        if (!(key in items)) {
          resolve(null);
          return;
        }

        resolve((items[key] as T | undefined) ?? null);
      });
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.CHROME_STORAGE_GET_FAILED,
      `Failed to read "${key}" from chrome.storage.sync.`,
    );
  }
}

/**
 * Opens the PromptBridge history database and ensures the required store and indices exist.
 */
export async function initHistoryDB(): Promise<IDBDatabase> {
  try {
    const indexedDb = getIndexedDbFactory();

    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        const historyStore = database.objectStoreNames.contains(HISTORY_STORE_NAME)
          ? request.transaction?.objectStore(HISTORY_STORE_NAME)
          : database.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' });

        if (!historyStore) {
          reject(
            new StorageError(
              StorageErrorCode.INDEXED_DB_OPEN_FAILED,
              'The PromptBridge history store could not be created.',
            ),
          );
          return;
        }

        if (!historyStore.indexNames.contains(HISTORY_TIMESTAMP_INDEX)) {
          historyStore.createIndex(HISTORY_TIMESTAMP_INDEX, HISTORY_TIMESTAMP_INDEX, {
            unique: false,
          });
        }

        if (!historyStore.indexNames.contains(HISTORY_INTENT_INDEX)) {
          historyStore.createIndex(HISTORY_INTENT_INDEX, HISTORY_INTENT_INDEX, {
            unique: false,
          });
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
        };
        resolve(database);
      };

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.INDEXED_DB_OPEN_FAILED,
            request.error?.message ?? 'Failed to open the PromptBridge history database.',
            request.error,
          ),
        );
      };
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_OPEN_FAILED,
      'Failed to initialize the PromptBridge history database.',
    );
  }
}

/**
 * Resolves an IndexedDB transaction or throws a typed storage error.
 */
function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onabort = () => {
      reject(
        new StorageError(
          StorageErrorCode.INDEXED_DB_TRANSACTION_FAILED,
          transaction.error?.message ?? 'The IndexedDB transaction was aborted.',
          transaction.error,
        ),
      );
    };

    transaction.onerror = () => {
      reject(
        new StorageError(
          StorageErrorCode.INDEXED_DB_TRANSACTION_FAILED,
          transaction.error?.message ?? 'The IndexedDB transaction failed.',
          transaction.error,
        ),
      );
    };
  });
}

/**
 * Writes a history entry to IndexedDB.
 */
export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  let database: IDBDatabase | null = null;

  try {
    database = await initHistoryDB();
    const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE_NAME);

    store.put(entry);

    await waitForTransaction(transaction);
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to save a history entry.',
    );
  } finally {
    database?.close();
  }
}

/**
 * Reads all history entries ordered by descending timestamp.
 */
async function getAllHistoryEntries(): Promise<HistoryEntry[]> {
  let database: IDBDatabase | null = null;

  try {
    database = await initHistoryDB();
    const activeDatabase = database;

    return await new Promise<HistoryEntry[]>((resolve, reject) => {
      const transaction = activeDatabase.transaction(HISTORY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(HISTORY_STORE_NAME);
      const index = store.index(HISTORY_TIMESTAMP_INDEX);
      const request = index.openCursor(null, 'prev');
      const entries: HistoryEntry[] = [];

      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor) {
          entries.push(cursor.value as HistoryEntry);
          cursor.continue();
        }
      };

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
            request.error?.message ?? 'Failed to read PromptBridge history.',
            request.error,
          ),
        );
      };

      transaction.oncomplete = () => {
        resolve(entries);
      };

      transaction.onabort = () => {
        reject(
          new StorageError(
            StorageErrorCode.INDEXED_DB_TRANSACTION_FAILED,
            transaction.error?.message ?? 'The history read transaction was aborted.',
            transaction.error,
          ),
        );
      };

      transaction.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.INDEXED_DB_TRANSACTION_FAILED,
            transaction.error?.message ?? 'The history read transaction failed.',
            transaction.error,
          ),
        );
      };
    });
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to read PromptBridge history.',
    );
  } finally {
    database?.close();
  }
}

/**
 * Returns a single page of history results ordered by descending timestamp.
 */
export async function getHistoryPage(page: number, pageSize: number): Promise<HistoryEntry[]> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new StorageError(
      StorageErrorCode.VALIDATION_FAILED,
      'History paging requires positive integer page and pageSize values.',
    );
  }

  try {
    const entries = await getAllHistoryEntries();
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return entries.slice(start, end);
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to page PromptBridge history.',
    );
  }
}

/**
 * Searches history entries by prompt text, response text, template id, intent, or entry id.
 */
export async function searchHistory(query: string): Promise<HistoryEntry[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  try {
    const entries = await getAllHistoryEntries();

    return entries.filter((entry) =>
      [
        entry.id,
        entry.intent,
        entry.templateId,
        entry.enrichedPrompt,
        entry.response,
        entry.confidenceLevel,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to search PromptBridge history.',
    );
  }
}

/**
 * Exports all history entries as a formatted JSON string.
 */
export async function exportHistoryAsJSON(): Promise<string> {
  try {
    return JSON.stringify(await getAllHistoryEntries(), null, 2);
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.SERIALIZATION_FAILED,
      'Failed to export PromptBridge history as JSON.',
    );
  }
}

/**
 * Escapes a single field for CSV export.
 */
function escapeCsvValue(value: string | number | null): string {
  const normalizedValue = value === null ? '' : String(value);
  return `"${normalizedValue.replace(/"/g, '""')}"`;
}

/**
 * Exports all history entries as CSV.
 */
export async function exportHistoryAsCSV(): Promise<string> {
  try {
    const entries = await getAllHistoryEntries();
    const header = [
      'id',
      'timestamp',
      'intent',
      'templateId',
      'complexityDelta',
      'confidenceLevel',
      'rating',
      'enrichedPrompt',
      'response',
    ];

    const rows = entries.map((entry) =>
      [
        entry.id,
        entry.timestamp,
        entry.intent,
        entry.templateId,
        entry.complexityDelta,
        entry.confidenceLevel,
        entry.rating,
        entry.enrichedPrompt,
        entry.response,
      ]
        .map((value) => escapeCsvValue(value))
        .join(','),
    );

    return [header.join(','), ...rows].join('\n');
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.SERIALIZATION_FAILED,
      'Failed to export PromptBridge history as CSV.',
    );
  }
}

/**
 * Ensures required local storage defaults exist for extension bootstrapping.
 */
export async function ensureStorageDefaults(): Promise<void> {
  try {
    const [settings, vaultEntries, ratings] = await Promise.all([
      getFromLocal<AppSettings>(SETTINGS_STORAGE_KEY),
      getFromLocal<VaultEntry[]>(VAULT_STORAGE_KEY),
      getFromLocal<PromptRating[]>(RATINGS_STORAGE_KEY),
    ]);

    if (settings === null) {
      await saveToLocal(SETTINGS_STORAGE_KEY, cloneValue(DEFAULT_APP_SETTINGS));
    }

    if (vaultEntries === null) {
      await saveToLocal(VAULT_STORAGE_KEY, [] as VaultEntry[]);
    }

    if (ratings === null) {
      await saveToLocal(RATINGS_STORAGE_KEY, [] as PromptRating[]);
    }
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.CHROME_STORAGE_SET_FAILED,
      'Failed to ensure PromptBridge storage defaults.',
    );
  }
}

/**
 * Loads app settings from local storage, falling back to defaults.
 */
export async function loadAppSettings(): Promise<AppSettings> {
  const settings = await getFromLocal<AppSettings>(SETTINGS_STORAGE_KEY);
  return settings ?? cloneValue(DEFAULT_APP_SETTINGS);
}

/**
 * Saves app settings to local storage.
 */
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await saveToLocal(SETTINGS_STORAGE_KEY, settings);
}

/**
 * Loads the full PromptBridge history list from IndexedDB.
 */
export async function loadHistory(): Promise<HistoryEntry[]> {
  return getAllHistoryEntries();
}

/**
 * Appends a history entry to the PromptBridge history database.
 */
export async function appendHistoryEntry(entry: HistoryEntry): Promise<void> {
  await saveHistoryEntry(entry);
}

/**
 * Updates the stored rating value for a single history entry.
 */
export async function updateHistoryEntryRating(
  entryId: string,
  rating: RatingValue,
): Promise<HistoryEntry> {
  let database: IDBDatabase | null = null;

  try {
    database = await initHistoryDB();
    const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    const request = store.get(entryId);

    const updatedEntry = await new Promise<HistoryEntry>((resolve, reject) => {
      request.onsuccess = () => {
        const currentEntry = request.result as HistoryEntry | undefined;

        if (!currentEntry) {
          reject(
            new StorageError(
              StorageErrorCode.VALIDATION_FAILED,
              `PromptBridge could not find history entry "${entryId}".`,
            ),
          );
          return;
        }

        const nextEntry: HistoryEntry = {
          ...currentEntry,
          rating,
        };

        store.put(nextEntry);
        resolve(nextEntry);
      };

      request.onerror = () => {
        reject(
          new StorageError(
            StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
            request.error?.message ?? 'Failed to update the history rating.',
            request.error,
          ),
        );
      };
    });

    await waitForTransaction(transaction);
    return updatedEntry;
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to update the PromptBridge history rating.',
    );
  } finally {
    database?.close();
  }
}

/**
 * Clears all history entries from the PromptBridge history database.
 */
export async function clearHistory(): Promise<void> {
  let database: IDBDatabase | null = null;

  try {
    database = await initHistoryDB();
    const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
    transaction.objectStore(HISTORY_STORE_NAME).clear();
    await waitForTransaction(transaction);
  } catch (error) {
    throw toStorageError(
      error,
      StorageErrorCode.INDEXED_DB_REQUEST_FAILED,
      'Failed to clear PromptBridge history.',
    );
  } finally {
    database?.close();
  }
}

/**
 * Loads encrypted vault entries from local storage.
 */
export async function loadVaultEntries(): Promise<VaultEntry[]> {
  return (await getFromLocal<VaultEntry[]>(VAULT_STORAGE_KEY)) ?? [];
}

/**
 * Saves a vault entry to local storage, prepending it to the stored vault list.
 */
export async function saveVaultEntry(entry: VaultEntry): Promise<void> {
  const currentEntries = await loadVaultEntries();
  await saveToLocal(VAULT_STORAGE_KEY, [entry, ...currentEntries]);
}

/**
 * Loads persisted personas from local storage.
 */
export async function loadPersonas(): Promise<Persona[]> {
  return (await getFromLocal<Persona[]>(PERSONAS_STORAGE_KEY)) ?? [];
}

/**
 * Saves the full persona collection to local storage.
 */
export async function savePersonas(personas: Persona[]): Promise<void> {
  await saveToLocal(PERSONAS_STORAGE_KEY, personas);
}

/**
 * Loads persisted prompt templates from local storage.
 */
export async function loadPromptTemplates(): Promise<PromptTemplate[]> {
  return (await getFromLocal<PromptTemplate[]>(TEMPLATES_STORAGE_KEY)) ?? [];
}

/**
 * Saves the full prompt-template library to local storage.
 */
export async function savePromptTemplates(templates: PromptTemplate[]): Promise<void> {
  await saveToLocal(TEMPLATES_STORAGE_KEY, templates);
}

/**
 * Loads pinned template identifiers from local storage.
 */
export async function loadPinnedTemplateIds(): Promise<string[]> {
  return (await getFromLocal<string[]>(PINNED_TEMPLATE_IDS_STORAGE_KEY)) ?? [];
}

/**
 * Saves pinned template identifiers to local storage.
 */
export async function savePinnedTemplateIds(templateIds: string[]): Promise<void> {
  await saveToLocal(PINNED_TEMPLATE_IDS_STORAGE_KEY, templateIds);
}

/**
 * Loads the number of times the diff viewer has auto-expanded.
 */
export async function loadDiffViewerUsageCount(): Promise<number> {
  return (await getFromLocal<number>(DIFF_VIEWER_USAGE_COUNT_STORAGE_KEY)) ?? 0;
}

/**
 * Saves the number of times the diff viewer has auto-expanded.
 */
export async function saveDiffViewerUsageCount(count: number): Promise<void> {
  await saveToLocal(DIFF_VIEWER_USAGE_COUNT_STORAGE_KEY, count);
}

/**
 * Loads the synced theme preference, defaulting to system when unset.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  return (await getFromSync<ThemePreference>(THEME_PREFERENCE_STORAGE_KEY)) ?? 'system';
}

/**
 * Saves the user's synced theme preference.
 */
export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await saveToSync(THEME_PREFERENCE_STORAGE_KEY, preference);
}

/**
 * Loads prompt ratings from local storage.
 */
export async function loadPromptRatings(): Promise<PromptRating[]> {
  return (await getFromLocal<PromptRating[]>(RATINGS_STORAGE_KEY)) ?? [];
}

/**
 * Saves a prompt rating to local storage, prepending it to the stored rating list.
 */
export async function savePromptRating(rating: PromptRating): Promise<void> {
  const currentRatings = await loadPromptRatings();
  await saveToLocal(RATINGS_STORAGE_KEY, [rating, ...currentRatings]);
}
