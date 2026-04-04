import type { KeyboardEvent } from 'react';
import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface CommandGatePromptProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CommandGatePrompt({
  onCancel,
  onConfirm,
}: CommandGatePromptProps): JSX.Element | null {
  const { popupPendingInteraction } = usePromptBridgeStore();

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  if (!popupPendingInteraction || popupPendingInteraction.kind !== 'commandConfirmation') {
    return null;
  }

  return (
    <section
      className="rounded-[24px] border border-[var(--pb-danger)] bg-[var(--pb-danger-bg)] p-4"
      onKeyDown={handleKeyDown}
    >
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-danger)]">
        {POPUP_TEXT.interactions.commandGateTitle}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--pb-text)]">
        {popupPendingInteraction.prompt}
      </p>
      <div className="mt-4 flex gap-3">
        <button
          className="flex-1 rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
          onClick={onConfirm}
          type="button"
        >
          {POPUP_TEXT.interactions.commandGateConfirm}
        </button>
        <button
          className="flex-1 rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
          onClick={onCancel}
          type="button"
        >
          {POPUP_TEXT.interactions.commandGateCancel}
        </button>
      </div>
    </section>
  );
}
