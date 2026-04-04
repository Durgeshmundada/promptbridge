import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface ScopeConfirmationPromptProps {
  onSelectOption: (option: string) => void;
}

export default function ScopeConfirmationPrompt({
  onSelectOption,
}: ScopeConfirmationPromptProps): JSX.Element | null {
  const { popupPendingInteraction } = usePromptBridgeStore();

  if (!popupPendingInteraction || popupPendingInteraction.kind !== 'scopeSelection') {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[var(--pb-warning)] bg-[var(--pb-warning-bg)] p-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-warning)]">
        {POPUP_TEXT.interactions.scopeTitle}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--pb-text)]">
        {POPUP_TEXT.interactions.scopeDescription}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {popupPendingInteraction.options.map((option) => (
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            key={option}
            onClick={() => {
              onSelectOption(option);
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}
