import { POPUP_MODEL_OPTIONS, POPUP_TEXT, getModelDisplayLabel } from '../constants';
import { usePromptBridgeStore } from '../../store';
import type { ModelTarget } from '../../types';
import type { ResolvedTheme } from '../../utils/theme';

export interface HeaderProps {
  resolvedTheme: ResolvedTheme;
  onOpenOptions: () => void;
  onToggleTheme: () => void;
  onUpdatePersona: (personaId: string) => void;
  onUpdateTargetModel: (targetModel: ModelTarget) => void;
}

function ThemeIcon({ resolvedTheme }: { resolvedTheme: ResolvedTheme }): JSX.Element {
  if (resolvedTheme === 'dark') {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
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
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
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

function SettingsIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m10.1 3.4-.5 2.1a7.9 7.9 0 0 0-1.5.9L6 5.1 3.8 7.3 5.1 9.6a7.9 7.9 0 0 0-.9 1.5L2 11.6v3.1l2.2.5c.2.5.5 1 .9 1.5l-1.3 2.3L6 21l2.1-1.3c.5.4 1 .7 1.5.9l.5 2.1h3.1l.5-2.1c.5-.2 1-.5 1.5-.9L18 21l2.2-2.2-1.3-2.1c.4-.5.7-1 .9-1.5l2.2-.5v-3.1l-2.2-.5a7.9 7.9 0 0 0-.9-1.5L20.2 7 18 4.8l-2.3 1.3a7.9 7.9 0 0 0-1.5-.9l-.5-2.1h-3.6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="13.1" r="2.75" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function LogoMark(): JSX.Element {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--pb-accent)_0%,#f59e0b_140%)] text-sm font-black tracking-[0.16em] text-white shadow-[var(--pb-shadow-soft)]">
      PB
    </div>
  );
}

export default function Header({
  resolvedTheme,
  onOpenOptions,
  onToggleTheme,
  onUpdatePersona,
  onUpdateTargetModel,
}: HeaderProps): JSX.Element {
  const { activePersona, personas, popupVersion, settings } = usePromptBridgeStore();
  const currentTargetModel = POPUP_MODEL_OPTIONS.includes(settings.targetModel as (typeof POPUP_MODEL_OPTIONS)[number])
    ? settings.targetModel
    : POPUP_MODEL_OPTIONS[0];

  return (
    <header className="pb-surface-strong shrink-0 rounded-[28px] border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="m-0 text-sm font-semibold text-[var(--pb-text)]">
              {POPUP_TEXT.appName}
            </p>
            <p className="mt-1 text-xs text-[var(--pb-text-subtle)]">
              {POPUP_TEXT.versionPrefix}
              {popupVersion}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            aria-label={POPUP_TEXT.header.themeToggleAriaLabel}
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] p-2 text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={onToggleTheme}
            type="button"
          >
            <ThemeIcon resolvedTheme={resolvedTheme} />
          </button>
          <button
            aria-label={POPUP_TEXT.header.settingsAriaLabel}
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] p-2 text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={onOpenOptions}
            type="button"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.header.personaLabel}
          </span>
          <div className="flex items-center gap-2 rounded-[20px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-2">
            <span className="inline-flex rounded-full bg-[var(--pb-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--pb-accent)]">
              {activePersona?.name ?? POPUP_TEXT.header.personaFallback}
            </span>
            <select
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--pb-text)] outline-none"
              onChange={(event) => {
                onUpdatePersona(event.target.value);
              }}
              value={settings.activePersonaId}
            >
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.header.modelLabel}
          </span>
          <select
            className="rounded-[20px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-2 text-sm text-[var(--pb-text)] outline-none transition focus:border-[var(--pb-border-strong)]"
            onChange={(event) => {
              onUpdateTargetModel(event.target.value as ModelTarget);
            }}
            value={currentTargetModel}
          >
            {POPUP_MODEL_OPTIONS.map((modelTarget) => (
              <option key={modelTarget} value={modelTarget}>
                {getModelDisplayLabel(modelTarget)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
