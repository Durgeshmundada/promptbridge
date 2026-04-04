import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface HistoryPreviewProps {
  onViewAll: () => void;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

export default function HistoryPreview({
  onViewAll,
}: HistoryPreviewProps): JSX.Element {
  const { history } = usePromptBridgeStore();
  const previewEntries = history.slice(0, 3);

  return (
    <section className="pb-surface rounded-[24px] border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
          {POPUP_TEXT.history.title}
        </h2>
        <button
          className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
          onClick={onViewAll}
          type="button"
        >
          {POPUP_TEXT.history.viewAll}
        </button>
      </div>

      {previewEntries.length > 0 ? (
        <div className="mt-3 grid gap-3">
          {previewEntries.map((entry) => (
            <article
              className="rounded-[20px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-3"
              key={entry.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[var(--pb-accent-soft)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--pb-accent)]">
                  {entry.intent.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-[var(--pb-text-subtle)]">
                  {formatTimestamp(entry.timestamp)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--pb-text-soft)]">
                {truncate(entry.enrichedPrompt, 120)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--pb-text-soft)]">
          {POPUP_TEXT.history.emptyDescription}
        </p>
      )}
    </section>
  );
}
