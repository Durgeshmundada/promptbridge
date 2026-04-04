import { useMemo, useState } from 'react';
import {
  deleteSecret,
  initVault,
  isSessionValid,
  lockVault,
  storeSecret,
} from '../../pipeline/layer3/sensitiveDataVault';
import { usePromptBridgeStore } from '../../store';
import type { AppSettings } from '../../types';
import { DEFAULT_APP_SETTINGS, clearHistory } from '../../utils/storage';
import { API_KEY_FIELDS, SETTINGS_MODEL_OPTIONS } from '../constants';

export interface SettingsPanelProps {}

type ApiKeyFieldId = (typeof API_KEY_FIELDS)[number]['id'];

interface ApiKeyFieldState {
  value: string;
  isVisible: boolean;
  statusMessage: string;
  isSaving: boolean;
}

type ApiKeyFieldStateMap = Record<ApiKeyFieldId, ApiKeyFieldState>;

const EMPTY_API_KEY_STATE: ApiKeyFieldState = {
  value: '',
  isVisible: false,
  statusMessage: '',
  isSaving: false,
};

function createInitialApiKeyStateMap(): ApiKeyFieldStateMap {
  return {
    groqApiKey: { ...EMPTY_API_KEY_STATE },
    openaiApiKey: { ...EMPTY_API_KEY_STATE },
    anthropicApiKey: { ...EMPTY_API_KEY_STATE },
    geminiApiKey: { ...EMPTY_API_KEY_STATE },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PromptBridge could not update this setting.';
}

function downloadTextFile(fileName: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}

function normalizeBoundedInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Math.min(maximum, Math.max(minimum, parsedValue));
}

export default function SettingsPanel(_props: SettingsPanelProps): JSX.Element {
  const { saveSettingsToStorage, setHistory, settings } = usePromptBridgeStore();
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultUnlocked, setVaultUnlocked] = useState(isSessionValid());
  const [vaultStatusMessage, setVaultStatusMessage] = useState(
    isSessionValid()
      ? 'Vault unlocked. API keys can be stored securely.'
      : 'Unlock the vault before saving API keys.',
  );
  const [settingsStatusMessage, setSettingsStatusMessage] = useState(
    'Every settings change is saved to chrome.storage.local immediately.',
  );
  const [apiKeyFields, setApiKeyFields] = useState<ApiKeyFieldStateMap>(
    createInitialApiKeyStateMap(),
  );

  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const selectedTargetModel = SETTINGS_MODEL_OPTIONS.includes(
    settings.targetModel as (typeof SETTINGS_MODEL_OPTIONS)[number],
  )
    ? settings.targetModel
    : SETTINGS_MODEL_OPTIONS[0];

  const persistSettings = async (nextSettings: AppSettings, successMessage: string): Promise<void> => {
    try {
      await saveSettingsToStorage(nextSettings);
      setSettingsStatusMessage(successMessage);
    } catch (error) {
      setSettingsStatusMessage(getErrorMessage(error));
    }
  };

  const updateApiKeyField = (
    key: ApiKeyFieldId,
    patch: Partial<ApiKeyFieldState>,
  ): void => {
    setApiKeyFields((currentValue) => ({
      ...currentValue,
      [key]: {
        ...currentValue[key],
        ...patch,
      },
    }));
  };

  const handleUnlockVault = async (): Promise<void> => {
    if (!vaultPassphrase.trim()) {
      setVaultStatusMessage('Enter a vault passphrase before unlocking.');
      return;
    }

    try {
      await initVault(vaultPassphrase);
      setVaultUnlocked(true);
      setVaultPassphrase('');
      setVaultStatusMessage('Vault unlocked. API keys can now be stored securely.');
    } catch (error) {
      setVaultUnlocked(false);
      setVaultStatusMessage(getErrorMessage(error));
    }
  };

  const handleLockVault = (): void => {
    lockVault();
    setVaultUnlocked(false);
    setVaultStatusMessage('Vault locked. Stored secrets remain encrypted.');
  };

  const handleSaveApiKey = async (key: ApiKeyFieldId): Promise<void> => {
    const fieldValue = apiKeyFields[key].value.trim();

    if (!fieldValue) {
      updateApiKeyField(key, {
        statusMessage: 'Enter a key value before saving.',
      });
      return;
    }

    if (!isSessionValid()) {
      setVaultUnlocked(false);
      setVaultStatusMessage('Unlock the vault before saving API keys.');
      updateApiKeyField(key, {
        statusMessage: 'Vault is locked.',
      });
      return;
    }

    updateApiKeyField(key, {
      isSaving: true,
      statusMessage: '',
    });

    try {
      await storeSecret(key, fieldValue);
      updateApiKeyField(key, {
        value: '',
        isVisible: false,
        isSaving: false,
        statusMessage: 'Key saved securely.',
      });
      setVaultUnlocked(true);
      setVaultStatusMessage('Vault unlocked. Stored API keys remain hidden.');
    } catch (error) {
      updateApiKeyField(key, {
        isSaving: false,
        statusMessage: getErrorMessage(error),
      });
    }
  };

  const handleDeleteApiKey = async (key: ApiKeyFieldId): Promise<void> => {
    if (!isSessionValid()) {
      setVaultUnlocked(false);
      setVaultStatusMessage('Unlock the vault before removing stored API keys.');
      updateApiKeyField(key, {
        statusMessage: 'Vault is locked.',
      });
      return;
    }

    updateApiKeyField(key, {
      isSaving: true,
      statusMessage: '',
    });

    try {
      await deleteSecret(key);
      updateApiKeyField(key, {
        value: '',
        isVisible: false,
        isSaving: false,
        statusMessage: 'Stored key removed.',
      });
    } catch (error) {
      updateApiKeyField(key, {
        isSaving: false,
        statusMessage: getErrorMessage(error),
      });
    }
  };

  const handleExportSettings = (): void => {
    downloadTextFile('promptbridge-settings.json', settingsJson, 'application/json');
    setSettingsStatusMessage('Exported non-secret settings as JSON.');
  };

  const handleResetDefaults = async (): Promise<void> => {
    const shouldReset = window.confirm(
      'Reset PromptBridge settings to their default values?',
    );

    if (!shouldReset) {
      return;
    }

    await persistSettings(
      { ...DEFAULT_APP_SETTINGS },
      'Reset PromptBridge settings to defaults.',
    );
  };

  const handleClearHistory = async (): Promise<void> => {
    const shouldClear = window.confirm(
      'Clear all PromptBridge history from IndexedDB? This cannot be undone.',
    );

    if (!shouldClear) {
      return;
    }

    try {
      await clearHistory();
      setHistory([]);
      setSettingsStatusMessage('Cleared all saved history entries.');
    } catch (error) {
      setSettingsStatusMessage(getErrorMessage(error));
    }
  };

  return (
    <section className="grid gap-6">
      <article className="pb-surface rounded-[28px] border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
              API Keys
            </p>
            <h2 className="mt-2 font-[var(--pb-font-display)] text-2xl text-[var(--pb-text)]">
              Vault-backed provider access
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pb-text-soft)]">
              Unlock the local vault with a passphrase, then save provider keys without ever
              revealing stored values back to the page.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              vaultUnlocked
                ? 'bg-[var(--pb-success-bg)] text-[var(--pb-success)]'
                : 'bg-[var(--pb-warning-bg)] text-[var(--pb-warning)]'
            }`}
          >
            {vaultUnlocked ? 'Vault unlocked' : 'Vault locked'}
          </span>
        </div>

        <div className="mt-5 rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_auto_auto] xl:items-end">
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Vault passphrase
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setVaultPassphrase(event.target.value);
                }}
                placeholder="Enter the passphrase used to unlock this browser vault"
                type="password"
                value={vaultPassphrase}
              />
            </label>
            <button
              className="rounded-full bg-[var(--pb-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
              onClick={() => {
                void handleUnlockVault();
              }}
              type="button"
            >
              Unlock vault
            </button>
            <button
              className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-5 py-3 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
              onClick={handleLockVault}
              type="button"
            >
              Lock vault
            </button>
          </div>
          <p className="mt-3 mb-0 text-sm text-[var(--pb-text-soft)]">{vaultStatusMessage}</p>
        </div>

        <div className="mt-6 grid gap-4">
          {API_KEY_FIELDS.map((field) => {
            const fieldState = apiKeyFields[field.id];

            return (
              <article
                className="rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5"
                key={field.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-lg font-semibold text-[var(--pb-text)]">
                      {field.label}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--pb-text-soft)]">
                      Stored under the secure vault key "{field.id}". PromptBridge never renders
                      the saved value back into this field.
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--pb-border)] px-3 py-2 text-xs font-medium text-[var(--pb-text-soft)]">
                    {field.providerName}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-end">
                  <label className="text-sm font-medium text-[var(--pb-text-soft)]">
                    Key value
                    <input
                      className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                      onChange={(event) => {
                        updateApiKeyField(field.id, {
                          value: event.target.value,
                          statusMessage: '',
                        });
                      }}
                      placeholder={field.placeholder}
                      type={fieldState.isVisible ? 'text' : 'password'}
                      value={fieldState.value}
                    />
                  </label>
                  <button
                    className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
                    onClick={() => {
                      updateApiKeyField(field.id, {
                        isVisible: !fieldState.isVisible,
                      });
                    }}
                    type="button"
                  >
                    {fieldState.isVisible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    className="rounded-full bg-[var(--pb-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={fieldState.isSaving}
                    onClick={() => {
                      void handleSaveApiKey(field.id);
                    }}
                    type="button"
                  >
                    {fieldState.isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="rounded-full bg-[var(--pb-danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--pb-danger)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={fieldState.isSaving}
                    onClick={() => {
                      void handleDeleteApiKey(field.id);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <p className="mt-3 mb-0 text-sm text-[var(--pb-text-soft)]">
                  {fieldState.statusMessage || 'Save to encrypt and store this key locally.'}
                </p>
              </article>
            );
          })}
        </div>
      </article>

      <article className="pb-surface rounded-[28px] border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
              Defaults
            </p>
            <h2 className="mt-2 font-[var(--pb-font-display)] text-2xl text-[var(--pb-text)]">
              Model, memory, and retention
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pb-text-soft)]">
              These values update the Zustand store and persist to chrome.storage.local as soon as
              you change them.
            </p>
          </div>
          <p className="m-0 max-w-xl text-sm leading-6 text-[var(--pb-text-soft)]">
            {settingsStatusMessage}
          </p>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <label className="text-sm font-medium text-[var(--pb-text-soft)]">
            Default target model
            <select
              className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
              onChange={(event) => {
                void persistSettings(
                  {
                    ...settings,
                    targetModel: event.target.value as AppSettings['targetModel'],
                  },
                  `Default model set to ${event.target.value}.`,
                );
              }}
              value={selectedTargetModel}
            >
              {SETTINGS_MODEL_OPTIONS.map((modelTarget) => (
                <option key={modelTarget} value={modelTarget}>
                  {modelTarget}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-[var(--pb-text-soft)]">
            Vault timeout (minutes)
            <input
              className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
              min={1}
              onChange={(event) => {
                const nextValue = normalizeBoundedInteger(event.target.value, 1, 720);

                if (nextValue === null) {
                  return;
                }

                void persistSettings(
                  {
                    ...settings,
                    vaultTimeoutMinutes: nextValue,
                  },
                  `Vault timeout updated to ${nextValue.toString()} minutes.`,
                );
              }}
              type="number"
              value={settings.vaultTimeoutMinutes}
            />
          </label>
        </div>

        <div className="mt-5 rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="m-0 text-sm font-medium text-[var(--pb-text)]">
                Session memory depth
              </p>
              <p className="mt-2 text-sm text-[var(--pb-text-soft)]">
                Controls how many turns PromptBridge keeps in its session-memory graph.
              </p>
            </div>
            <span className="rounded-full bg-[var(--pb-accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--pb-accent)]">
              {settings.sessionMemoryDepth.toString()} turns
            </span>
          </div>
          <input
            className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--pb-bg-accent)]"
            max={20}
            min={1}
            onChange={(event) => {
              const nextValue = normalizeBoundedInteger(event.target.value, 1, 20);

              if (nextValue === null) {
                return;
              }

              void persistSettings(
                {
                  ...settings,
                  sessionMemoryDepth: nextValue,
                },
                `Session memory depth updated to ${nextValue.toString()} turns.`,
              );
            }}
            type="range"
            value={settings.sessionMemoryDepth}
          />
          <div className="mt-2 flex justify-between text-xs text-[var(--pb-text-subtle)]">
            <span>1 turn</span>
            <span>20 turns</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-[var(--pb-accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
            onClick={handleExportSettings}
            type="button"
          >
            Export all settings
          </button>
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-5 py-3 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={() => {
              void handleResetDefaults();
            }}
            type="button"
          >
            Reset to defaults
          </button>
          <button
            className="rounded-full bg-[var(--pb-danger-bg)] px-5 py-3 text-sm font-semibold text-[var(--pb-danger)] transition hover:opacity-80"
            onClick={() => {
              void handleClearHistory();
            }}
            type="button"
          >
            Clear all history
          </button>
        </div>
      </article>
    </section>
  );
}
