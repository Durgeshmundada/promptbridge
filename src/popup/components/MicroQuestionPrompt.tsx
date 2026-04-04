import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface MicroQuestionPromptProps {
  onSubmit: () => void;
}

export default function MicroQuestionPrompt({
  onSubmit,
}: MicroQuestionPromptProps): JSX.Element | null {
  const { popupPendingInteraction, updatePopupQuestionAnswer } = usePromptBridgeStore();

  if (!popupPendingInteraction || popupPendingInteraction.kind !== 'question') {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[var(--pb-warning)] bg-[var(--pb-warning-bg)] p-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-warning)]">
        {POPUP_TEXT.interactions.microQuestionTitle}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--pb-text)]">
        {popupPendingInteraction.prompt}
      </p>
      <div className="mt-3 flex gap-3">
        <input
          className="min-w-0 flex-1 rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
          onChange={(event) => {
            updatePopupQuestionAnswer(event.target.value);
          }}
          placeholder={POPUP_TEXT.interactions.microQuestionPlaceholder}
          type="text"
          value={popupPendingInteraction.answer}
        />
        <button
          className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
          onClick={onSubmit}
          type="button"
        >
          {POPUP_TEXT.interactions.microQuestionSubmit}
        </button>
      </div>
    </section>
  );
}
