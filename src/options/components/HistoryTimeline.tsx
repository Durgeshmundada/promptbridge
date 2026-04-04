import { useDeferredValue, useEffect, useState } from 'react';
import { usePromptBridgeStore } from '../../store';
import { RatingValue } from '../../types';
import type { HistoryEntry, PromptTemplate } from '../../types';
import {
  exportHistoryAsCSV,
  exportHistoryAsJSON,
  getHistoryPage,
  loadHistory,
  searchHistory,
} from '../../utils/storage';

export interface HistoryTimelineProps {}

const PAGE_SIZE = 20;

function downloadTextFile(fileName: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PromptBridge could not load history.';
}

function getRatingEmoji(rating: HistoryEntry['rating']): string {
  if (rating === RatingValue.THUMBS_UP) {
    return '👍';
  }

  if (rating === RatingValue.THUMBS_DOWN) {
    return '👎';
  }

  return '•';
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function getComplexityDeltaLabel(delta: number): string {
  return delta >= 0 ? `+${delta.toString()}` : delta.toString();
}

function resolveTemplateName(templateId: string, templates: PromptTemplate[]): string {
  return templates.find((template) => template.id === templateId)?.id ?? templateId;
}

export default function HistoryTimeline(_props: HistoryTimelineProps): JSX.Element {
  const { setHistory, templates } = usePromptBridgeStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expandedEntryIds, setExpandedEntryIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Browse prompt history from IndexedDB and export the timeline when you need an archive.',
  );
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    const hydrateHistory = async (): Promise<void> => {
      setIsLoading(true);

      try {
        const normalizedQuery = deferredSearchQuery.trim();

        if (normalizedQuery) {
          const matchingEntries = await searchHistory(normalizedQuery);
          const startIndex = (page - 1) * PAGE_SIZE;
          const nextEntries = matchingEntries.slice(startIndex, startIndex + PAGE_SIZE);

          setEntries(nextEntries);
          setTotalCount(matchingEntries.length);
          setStatusMessage(
            `Showing ${matchingEntries.length.toString()} matching history entries for "${normalizedQuery}".`,
          );
          return;
        }

        const [pagedEntries, allEntries] = await Promise.all([
          getHistoryPage(page, PAGE_SIZE),
          loadHistory(),
        ]);

        setEntries(pagedEntries);
        setHistory(allEntries);
        setTotalCount(allEntries.length);
        setStatusMessage('History loaded from PromptBridge IndexedDB.');
      } catch (error) {
        setStatusMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    };

    void hydrateHistory();
  }, [deferredSearchQuery, page, setHistory]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleExportJson = async (): Promise<void> => {
    const json = await exportHistoryAsJSON();
    downloadTextFile('promptbridge-history.json', json, 'application/json');
  };

  const handleExportCsv = async (): Promise<void> => {
    const csv = await exportHistoryAsCSV();
    downloadTextFile('promptbridge-history.csv', csv, 'text/csv;charset=utf-8');
  };

  return (
    <section className="pb-surface rounded-[28px] border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
            History Timeline
          </p>
          <h2 className="mt-2 font-[var(--pb-font-display)] text-2xl text-[var(--pb-text)]">
            Inspect saved prompt runs
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pb-text-soft)]">
            Search, page through, expand, and export history entries written by the pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={() => {
              void handleExportJson();
            }}
            type="button"
          >
            Export JSON
          </button>
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
            onClick={() => {
              void handleExportCsv();
            }}
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <input
          className="w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none transition placeholder:text-[var(--pb-text-subtle)] focus:border-[var(--pb-border-strong)] lg:max-w-md"
          onChange={(event) => {
            setPage(1);
            setSearchQuery(event.target.value);
          }}
          placeholder="Search prompt text, response content, or template id"
          type="search"
          value={searchQuery}
        />
        <p className="m-0 text-sm text-[var(--pb-text-soft)]">{statusMessage}</p>
      </div>

      <div className="mt-6 grid gap-4">
        {isLoading ? (
          <div className="rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5 text-sm text-[var(--pb-text-soft)]">
            Loading PromptBridge history...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5 text-sm text-[var(--pb-text-soft)]">
            No history entries matched the current filter.
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedEntryIds.includes(entry.id);

            return (
              <article
                className="rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5"
                key={entry.id}
              >
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-4 bg-transparent p-0 text-left"
                  onClick={() => {
                    setExpandedEntryIds((currentValue) =>
                      currentValue.includes(entry.id)
                        ? currentValue.filter((entryId) => entryId !== entry.id)
                        : [...currentValue, entry.id],
                    );
                  }}
                  type="button"
                >
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--pb-accent-soft)] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--pb-accent)]">
                        {entry.intent.replace(/_/g, ' ')}
                      </span>
                      <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs text-[var(--pb-text-soft)]">
                        {resolveTemplateName(entry.templateId, templates)}
                      </span>
                    </div>
                    <p className="m-0 text-sm text-[var(--pb-text-soft)]">
                      {formatTimestamp(entry.timestamp)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pb-text-soft)]">
                    <span className="rounded-full border border-[var(--pb-border)] px-3 py-1">
                      {getComplexityDeltaLabel(entry.complexityDelta)}
                    </span>
                    <span className="rounded-full border border-[var(--pb-border)] px-3 py-1">
                      {entry.confidenceLevel}
                    </span>
                    <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-sm">
                      {getRatingEmoji(entry.rating)}
                    </span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[20px] bg-[var(--pb-surface-muted)] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                        Enriched prompt
                      </p>
                      <pre className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--pb-text)]">
                        {entry.enrichedPrompt}
                      </pre>
                    </div>
                    <div className="rounded-[20px] bg-[var(--pb-surface-muted)] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                        Response
                      </p>
                      <pre className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--pb-text)]">
                        {entry.response}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-sm text-[var(--pb-text-soft)]">
          Page {page.toString()} of {totalPages.toString()}
        </p>
        <div className="flex gap-3">
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={page <= 1}
            onClick={() => {
              setPage((currentPage) => Math.max(1, currentPage - 1));
            }}
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={page >= totalPages}
            onClick={() => {
              setPage((currentPage) => Math.min(totalPages, currentPage + 1));
            }}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
