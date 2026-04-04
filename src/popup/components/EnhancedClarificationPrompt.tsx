import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface EnhancedClarificationPromptProps {
  onSubmit: () => void;
}

export default function EnhancedClarificationPrompt({
  onSubmit,
}: EnhancedClarificationPromptProps): JSX.Element | null {
  const {
    popupPendingInteraction,
    setPopupActiveClarificationQuestion,
    updatePopupClarificationAnswer,
  } = usePromptBridgeStore();

  if (!popupPendingInteraction || popupPendingInteraction.kind !== 'clarificationSet') {
    return null;
  }

  const activeQuestionId =
    popupPendingInteraction.questions.some(
      (question) => question.id === popupPendingInteraction.activeQuestionId,
    )
      ? popupPendingInteraction.activeQuestionId
      : (popupPendingInteraction.questions[0]?.id ?? '');

  return (
    <section className="rounded-[24px] border border-[var(--pb-accent)] bg-[var(--pb-accent-soft)]/40 p-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-accent)]">
        {POPUP_TEXT.interactions.enhancedTitle}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--pb-text)]">
        {POPUP_TEXT.interactions.enhancedSubtitle}
      </p>

      <div className="mt-4 grid gap-3">
        {popupPendingInteraction.questions.map((question, index) => {
          const isActive = question.id === activeQuestionId;
          const response = popupPendingInteraction.responses.find(
            (entry) => entry.questionId === question.id,
          );

          return (
            <article
              className={`overflow-hidden rounded-[20px] border transition ${
                isActive
                  ? 'border-[var(--pb-accent)] bg-[var(--pb-surface-strong)]'
                  : 'border-[var(--pb-border)] bg-[var(--pb-surface)]'
              }`}
              key={question.id}
            >
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => {
                  setPopupActiveClarificationQuestion(question.id);
                }}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pb-accent)] text-xs font-semibold text-white">
                    {(index + 1).toString()}
                  </span>
                  <span className="text-sm font-medium leading-6 text-[var(--pb-text)]">
                    {question.prompt}
                  </span>
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pb-text-subtle)]">
                  {isActive
                    ? POPUP_TEXT.interactions.enhancedQuestionActionActive
                    : POPUP_TEXT.interactions.enhancedQuestionAction}
                </span>
              </button>

              <div
                className={`grid transition-all duration-200 ${
                  isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-[var(--pb-border)] px-4 py-4">
                    <textarea
                      className="min-h-[88px] w-full resize-none rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                      onChange={(event) => {
                        updatePopupClarificationAnswer(question.id, event.target.value);
                      }}
                      placeholder={question.placeholder}
                      value={response?.answer ?? ''}
                    />
                    <p className="mt-2 mb-0 text-xs text-[var(--pb-text-subtle)]">
                      {POPUP_TEXT.interactions.enhancedDefaultHint}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          className="rounded-full bg-[var(--pb-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
          onClick={onSubmit}
          type="button"
        >
          {POPUP_TEXT.interactions.enhancedSubmit}
        </button>
      </div>
    </section>
  );
}
