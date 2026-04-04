import { useEffect, useMemo, useState } from 'react';
import HistoryTimeline from './components/HistoryTimeline';
import PersonaManager from './components/PersonaManager';
import SettingsPanel from './components/SettingsPanel';
import TemplateLibrary from './components/TemplateLibrary';
import {
  OPTIONS_ACTIVE_TAB_STORAGE_KEY,
  OPTIONS_TABS,
  isOptionsTabId,
  type OptionsTabId,
} from './constants';
import { usePromptBridgeStore } from '../store';
import { getFromSync, loadHistory, saveToSync } from '../utils/storage';
import {
  applyThemePreference,
  getNextManualTheme,
  type ResolvedTheme,
  subscribeToSystemTheme,
} from '../utils/theme';

function ThemeToggleIcon({ resolvedTheme }: { resolvedTheme: ResolvedTheme }): JSX.Element {
  if (resolvedTheme === 'dark') {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M20 15.5A7.5 7.5 0 1 1 8.5 4a8.8 8.8 0 0 0 11.5 11.5Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23 5.46 5.46"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PromptBridge could not load the options page.';
}

function renderActiveTab(activeTab: OptionsTabId): JSX.Element {
  switch (activeTab) {
    case 'templates':
      return <TemplateLibrary />;
    case 'personas':
      return <PersonaManager />;
    case 'history':
      return <HistoryTimeline />;
    case 'settings':
      return <SettingsPanel />;
    default: {
      const unreachableTab: never = activeTab;
      return unreachableTab;
    }
  }
}

function App(): JSX.Element {
  const {
    activePersona,
    history,
    hydratePersistentState,
    personas,
    ratings,
    saveSettingsToStorage,
    setHistory,
    settings,
    templates,
  } = usePromptBridgeStore();
  const [activeTab, setActiveTab] = useState<OptionsTabId>('templates');
  const [pageStatusMessage, setPageStatusMessage] = useState(
    'PromptBridge keeps templates, personas, and settings local to this browser profile.',
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const hydratePage = async (): Promise<void> => {
      try {
        await hydratePersistentState();
        const [storedTab, storedHistory] = await Promise.all([
          getFromSync<string>(OPTIONS_ACTIVE_TAB_STORAGE_KEY),
          loadHistory(),
        ]);

        if (isOptionsTabId(storedTab)) {
          setActiveTab(storedTab);
        }

        setHistory(storedHistory);
      } catch (error) {
        setPageStatusMessage(getErrorMessage(error));
      }
    };

    void hydratePage();
  }, [hydratePersistentState, setHistory]);

  useEffect(() => {
    setResolvedTheme(applyThemePreference(settings.theme));

    if (settings.theme !== 'system') {
      return () => undefined;
    }

    return subscribeToSystemTheme((nextTheme) => {
      setResolvedTheme(nextTheme);
      applyThemePreference(settings.theme);
    });
  }, [settings.theme]);

  const activeTabDefinition = useMemo(
    () => OPTIONS_TABS.find((tab) => tab.id === activeTab) ?? OPTIONS_TABS[0],
    [activeTab],
  );

  const handleTabSelect = async (tabId: OptionsTabId): Promise<void> => {
    setActiveTab(tabId);
    setPageStatusMessage(
      OPTIONS_TABS.find((tab) => tab.id === tabId)?.description ??
        'PromptBridge options updated.',
    );

    try {
      await saveToSync(OPTIONS_ACTIVE_TAB_STORAGE_KEY, tabId);
    } catch (error) {
      setPageStatusMessage(getErrorMessage(error));
    }
  };

  return (
    <main className="min-h-screen px-5 py-6 lg:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
        <section className="pb-surface-strong rounded-[32px] border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--pb-accent)]">
                PromptBridge Options
              </p>
              <h1 className="mt-2 font-[var(--pb-font-display)] text-4xl leading-none text-[var(--pb-text)]">
                Manage templates, personas, history, and secure defaults.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--pb-text-soft)]">
                {activeTabDefinition.description}
              </p>
            </div>

            <button
              aria-label="Toggle theme"
              className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] p-3 text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
              onClick={() => {
                void saveSettingsToStorage({
                  ...settings,
                  theme: getNextManualTheme(settings.theme, resolvedTheme),
                });
              }}
              type="button"
            >
              <ThemeToggleIcon resolvedTheme={resolvedTheme} />
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <article className="rounded-[24px] bg-[var(--pb-surface-muted)] p-4">
              <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                Active persona
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--pb-text)]">
                {activePersona?.name ?? settings.activePersonaId}
              </h2>
              <p className="mt-2 text-sm text-[var(--pb-text-soft)]">
                {activePersona?.role ?? 'Choose the default persona in the Personas tab.'}
              </p>
            </article>
            <article className="rounded-[24px] bg-[var(--pb-surface-muted)] p-4">
              <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                Personas
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--pb-text)]">
                {personas.length.toString()}
              </h2>
              <p className="mt-2 text-sm text-[var(--pb-text-soft)]">Saved persona profiles.</p>
            </article>
            <article className="rounded-[24px] bg-[var(--pb-surface-muted)] p-4">
              <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                Templates
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--pb-text)]">
                {templates.length.toString()}
              </h2>
              <p className="mt-2 text-sm text-[var(--pb-text-soft)]">Prompt patterns in the library.</p>
            </article>
            <article className="rounded-[24px] bg-[var(--pb-surface-muted)] p-4">
              <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                History
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--pb-text)]">
                {history.length.toString()}
              </h2>
              <p className="mt-2 text-sm text-[var(--pb-text-soft)]">
                {ratings.length.toString()} ratings recorded so far.
              </p>
            </article>
          </div>
        </section>

        <section className="pb-surface rounded-[28px] border p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            {OPTIONS_TABS.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[var(--pb-accent)] text-white'
                      : 'border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] text-[var(--pb-text)] hover:border-[var(--pb-border-strong)]'
                  }`}
                  key={tab.id}
                  onClick={() => {
                    void handleTabSelect(tab.id);
                  }}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 mb-0 text-sm leading-6 text-[var(--pb-text-soft)]">
            {pageStatusMessage}
          </p>
        </section>

        {renderActiveTab(activeTab)}
      </div>
    </main>
  );
}

export default App;
