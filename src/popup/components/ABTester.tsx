import { POPUP_TEXT, formatExecutionTime } from '../constants';

export interface AbTesterVariant {
  historyEntryId: string;
  label: string;
  executionTimeMs: number;
  processedResponse: string;
  templateId: string;
  weight: number;
}

export interface AbTesterProps {
  isWinnerSelectionPending: boolean;
  selectedWinnerHistoryEntryId: string | null;
  variants: AbTesterVariant[];
  onChooseWinner: (historyEntryId: string) => void;
}

/**
 * Renders a side-by-side A/B comparison so a user can reward the stronger template.
 */
export default function ABTester({
  isWinnerSelectionPending,
  selectedWinnerHistoryEntryId,
  variants,
  onChooseWinner,
}: AbTesterProps): JSX.Element {
  const selectedWinner =
    variants.find((variant) => variant.historyEntryId === selectedWinnerHistoryEntryId) ?? null;

  return (
    <section className="pb-surface-strong rounded-[26px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-accent)]">
            {POPUP_TEXT.abTester.title}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--pb-text)]">
            {POPUP_TEXT.abTester.heading}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--pb-text-soft)]">
            {selectedWinner
              ? `${POPUP_TEXT.abTester.winnerSelected}: ${selectedWinner.label} (${selectedWinner.templateId}).`
              : POPUP_TEXT.abTester.completeMessage}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {variants.map((variant) => {
          const isWinner = variant.historyEntryId === selectedWinnerHistoryEntryId;

          return (
            <article
              className={`rounded-[22px] border p-4 ${
                isWinner
                  ? 'border-[var(--pb-success)] bg-[var(--pb-success-bg)]'
                  : 'border-[var(--pb-border)] bg-[var(--pb-surface-muted)]'
              }`}
              key={variant.historyEntryId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                    {POPUP_TEXT.abTester.variantLabel} {variant.label}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-[var(--pb-text)]">
                    {variant.templateId}
                  </h3>
                </div>
                <span className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--pb-text-soft)]">
                  {POPUP_TEXT.abTester.weightLabelPrefix}: {variant.weight.toFixed(2)}
                </span>
              </div>

              <div
                className="mt-4 rounded-[18px] bg-[var(--pb-surface-strong)] p-4 text-sm leading-7 text-[var(--pb-text)]"
                dangerouslySetInnerHTML={{
                  __html: variant.processedResponse,
                }}
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs font-semibold text-[var(--pb-text-soft)]">
                  {formatExecutionTime(variant.executionTimeMs)}
                </span>
                <button
                  className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isWinnerSelectionPending || Boolean(selectedWinnerHistoryEntryId)}
                  onClick={() => {
                    onChooseWinner(variant.historyEntryId);
                  }}
                  type="button"
                >
                  {isWinner ? POPUP_TEXT.abTester.winnerSelected : POPUP_TEXT.abTester.chooseWinner}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
