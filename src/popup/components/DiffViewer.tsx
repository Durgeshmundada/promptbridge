import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import typescript from 'highlight.js/lib/languages/typescript';
import 'highlight.js/styles/github.css';
import { POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';
import type { PIIRedaction } from '../../types';
import {
  loadDiffViewerUsageCount,
  saveDiffViewerUsageCount,
} from '../../utils/storage';
import {
  buildEnrichedSegments,
  buildRawSegments,
  getSegmentClasses,
} from './diffViewerUtils';

const AUTO_EXPAND_LIMIT = 5;

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('typescript', typescript);

function formatRedactionLabel(redaction: PIIRedaction): string {
  return `${redaction.type}: ${redaction.count}`;
}

function highlightPromptText(text: string): string {
  return hljs.highlightAuto(text, [
    'markdown',
    'typescript',
    'json',
    'bash',
    'plaintext',
  ]).value;
}

export default function DiffViewer(): JSX.Element | null {
  const { lastResult, popupLastSubmittedInput } = usePromptBridgeStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const hasTrackedUsage = useRef(false);

  const copyToClipboard = async (value: string, label: string): Promise<void> => {
    await navigator.clipboard.writeText(value);
    setCopiedLabel(label);
    window.setTimeout(() => {
      setCopiedLabel(null);
    }, 1200);
  };

  useEffect(() => {
    if (hasTrackedUsage.current) {
      return;
    }

    hasTrackedUsage.current = true;

    const trackUsage = async (): Promise<void> => {
      try {
        const currentUsageCount = await loadDiffViewerUsageCount();

        if (currentUsageCount < AUTO_EXPAND_LIMIT) {
          setIsExpanded(true);
          await saveDiffViewerUsageCount(currentUsageCount + 1);
        }
      } catch {
        setIsExpanded(true);
      } finally {
        setIsReady(true);
      }
    };

    void trackUsage();
  }, []);

  if (!lastResult || !popupLastSubmittedInput) {
    return null;
  }

  const rawInput = popupLastSubmittedInput.rawInput;
  const rawSegments = buildRawSegments(rawInput);
  const enrichedSegments = buildEnrichedSegments(
    rawInput,
    lastResult.enrichedPrompt,
    lastResult.slotMappings,
  );

  return (
    <section className="pb-surface rounded-[24px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
            {POPUP_TEXT.diffViewer.eyebrow}
          </p>
          <h3 className="mt-2 font-[var(--pb-font-display)] text-xl text-[var(--pb-text)]">
            {POPUP_TEXT.diffViewer.title}
          </h3>
        </div>
        <button
          className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
          onClick={() => {
            setIsExpanded((currentValue) => !currentValue);
          }}
          type="button"
        >
          {isExpanded ? POPUP_TEXT.diffViewer.collapse : POPUP_TEXT.diffViewer.expand}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-[var(--pb-success-bg)] px-3 py-1 font-medium text-[var(--pb-success)]">
          {POPUP_TEXT.diffViewer.added}
        </span>
        <span className="rounded-full bg-[var(--pb-warning-bg)] px-3 py-1 font-medium text-[var(--pb-warning)]">
          {POPUP_TEXT.diffViewer.neutralized}
        </span>
        <span className="rounded-full bg-[var(--pb-danger-bg)] px-3 py-1 font-medium text-[var(--pb-danger)]">
          {POPUP_TEXT.diffViewer.redacted}
        </span>
      </div>

      {lastResult.slotMappings.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--pb-text-soft)]">
          {lastResult.slotMappings.slice(0, 6).map((slotMapping) => (
            <span
              className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1"
              key={`${slotMapping.key}-${slotMapping.source}`}
            >
              {slotMapping.key}: {slotMapping.value}
            </span>
          ))}
        </div>
      ) : null}

      {lastResult.piiRedactions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--pb-danger)]">
          {lastResult.piiRedactions.map((redaction) => (
            <span
              className="rounded-full bg-[var(--pb-danger-bg)] px-3 py-1 font-medium"
              key={`${redaction.type}-${redaction.count}`}
            >
              {formatRedactionLabel(redaction)}
            </span>
          ))}
        </div>
      ) : null}

      {isExpanded ? (
        <div className="mt-5 grid gap-4">
          <article className="rounded-[22px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
                {POPUP_TEXT.diffViewer.rawLabel}
              </p>
              <button
                className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-3 py-1 text-xs font-semibold text-[var(--pb-text)]"
                type="button"
                onClick={() => {
                  void copyToClipboard(rawInput, POPUP_TEXT.diffViewer.rawLabel);
                }}
              >
                {copiedLabel === POPUP_TEXT.diffViewer.rawLabel
                  ? POPUP_TEXT.diffViewer.copied
                  : POPUP_TEXT.diffViewer.copyRaw}
              </button>
            </div>
            <pre className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--pb-text)]">
              {rawSegments.map((segment, index) => (
                <span
                  className={getSegmentClasses(segment.type)}
                  key={`raw-${index.toString()}`}
                  dangerouslySetInnerHTML={{ __html: highlightPromptText(segment.text) }}
                />
              ))}
            </pre>
          </article>

          <article className="rounded-[22px] border border-[var(--pb-border-strong)] bg-[var(--pb-surface-strong)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-accent)]">
                {POPUP_TEXT.diffViewer.enrichedLabel}
              </p>
              <button
                className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--pb-text)]"
                type="button"
                onClick={() => {
                  void copyToClipboard(lastResult.enrichedPrompt, POPUP_TEXT.diffViewer.enrichedLabel);
                }}
              >
                {copiedLabel === POPUP_TEXT.diffViewer.enrichedLabel
                  ? POPUP_TEXT.diffViewer.copied
                  : POPUP_TEXT.diffViewer.copyEnriched}
              </button>
            </div>
            <pre className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--pb-text)]">
              {enrichedSegments.map((segment, index) => (
                <span
                  className={getSegmentClasses(segment.type)}
                  key={`enriched-${index.toString()}`}
                  dangerouslySetInnerHTML={{ __html: highlightPromptText(segment.text) }}
                />
              ))}
            </pre>
          </article>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--pb-text-soft)]">
          {isReady ? POPUP_TEXT.diffViewer.readyHint : POPUP_TEXT.diffViewer.loadingHint}
        </p>
      )}
    </section>
  );
}
