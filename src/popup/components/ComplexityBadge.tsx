import {
  formatComplexityLabel,
  formatMatchScoreLabel,
  POPUP_TEXT,
} from '../constants';
import { usePromptBridgeStore } from '../../store';

export default function ComplexityBadge(): JSX.Element | null {
  const { lastResult } = usePromptBridgeStore();

  if (!lastResult) {
    return null;
  }

  const { raw, enriched, delta } = lastResult.complexityScore;

  return (
    <section className="pb-surface rounded-[24px] border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
          {POPUP_TEXT.complexity.title}
        </p>
        <span className="rounded-full bg-[var(--pb-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--pb-accent)]">
          {formatComplexityLabel(raw, enriched, delta)}
        </span>
      </div>

      {lastResult.matchBadge || typeof lastResult.matchScore === 'number' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.complexity.templateMatchTitle}
          </p>
          {lastResult.matchBadge ? (
            <span className="rounded-full bg-[var(--pb-success-bg)] px-3 py-1 text-xs font-semibold text-[var(--pb-success)]">
              {lastResult.matchBadge}
            </span>
          ) : null}
          {typeof lastResult.matchScore === 'number' ? (
            <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs font-semibold text-[var(--pb-text-soft)]">
              {formatMatchScoreLabel(lastResult.matchScore)}
            </span>
          ) : null}
        </div>
      ) : null}

      {lastResult.isNewTemplate ? (
        <p className="mt-3 mb-0 text-sm font-medium text-[var(--pb-success)]">
          {POPUP_TEXT.complexity.savedToLibrary}
        </p>
      ) : null}
    </section>
  );
}
