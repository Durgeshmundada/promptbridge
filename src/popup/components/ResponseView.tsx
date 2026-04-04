import { useState } from 'react';
import {
  IntentType,
  type ConfidenceLevel,
} from '../../types';
import {
  POPUP_TEXT,
  formatExecutionTime,
  formatIntentLabel,
  formatPiiNotification,
} from '../constants';
import { usePromptBridgeStore } from '../../store';
import RatingWidget from './RatingWidget';

function getConfidenceClasses(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'bg-[var(--pb-success-bg)] text-[var(--pb-success)]';
    case 'MEDIUM':
      return 'bg-[var(--pb-warning-bg)] text-[var(--pb-warning)]';
    case 'LOW':
    default:
      return 'bg-[var(--pb-danger-bg)] text-[var(--pb-danger)]';
  }
}

export default function ResponseView(): JSX.Element {
  const { lastResult, popupCurrentHistoryEntryId, popupCurrentPromptId } = usePromptBridgeStore();
  const [isCitationListOpen, setIsCitationListOpen] = useState(false);

  if (!lastResult) {
    return (
      <section className="pb-surface rounded-[26px] border p-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
          {POPUP_TEXT.response.title}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-[var(--pb-text)]">
          {POPUP_TEXT.response.emptyTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--pb-text-soft)]">
          {POPUP_TEXT.response.emptyDescription}
        </p>
      </section>
    );
  }

  const piiRedactionCount = lastResult.piiRedactions.reduce(
    (count, redaction) => count + redaction.count,
    0,
  );
  const isMedicalIntent = lastResult.intent.intent === IntentType.MEDICAL;

  return (
    <section className="pb-surface-strong rounded-[26px] border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.response.title}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--pb-text)]">
            {lastResult.template.id}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--pb-text)]">
            {POPUP_TEXT.response.intentLabel}: {formatIntentLabel(lastResult.intent.intent)}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getConfidenceClasses(lastResult.confidenceLevel)}`}>
            {POPUP_TEXT.confidence[lastResult.confidenceLevel]}
          </span>
          <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs font-semibold text-[var(--pb-text-soft)]">
            {formatExecutionTime(lastResult.executionTimeMs)}
          </span>
          {piiRedactionCount > 0 ? (
            <span className="rounded-full bg-[var(--pb-danger-bg)] px-3 py-1 text-xs font-semibold text-[var(--pb-danger)]">
              {formatPiiNotification(piiRedactionCount)}
            </span>
          ) : null}
        </div>
      </div>

      {isMedicalIntent ? (
        <div className="mt-4 rounded-[22px] border border-[var(--pb-warning)] bg-[var(--pb-warning-bg)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--pb-warning)]">
          {POPUP_TEXT.response.medicalDisclaimer}
        </div>
      ) : null}

      <div className="mt-4 rounded-[22px] bg-[var(--pb-surface-muted)] p-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
          {POPUP_TEXT.response.bodyLabel}
        </p>
        <div
          className="mt-3 text-sm leading-7 text-[var(--pb-text)]"
          dangerouslySetInnerHTML={{
            __html: lastResult.processedResponse,
          }}
        />

        {isMedicalIntent ? (
          <p className="mt-4 mb-0 rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm font-medium leading-6 text-[var(--pb-text-soft)]">
            {POPUP_TEXT.response.medicalFooter}
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-[22px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.response.citationsTitle}
          </p>
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={() => {
              setIsCitationListOpen((currentValue) => !currentValue);
            }}
            type="button"
          >
            {isCitationListOpen
              ? POPUP_TEXT.response.hideCitations
              : POPUP_TEXT.response.showCitations}
          </button>
        </div>

        {isCitationListOpen ? (
          lastResult.citationList.length > 0 ? (
            <ul className="mt-3 grid gap-2 pl-5 text-sm text-[var(--pb-text-soft)]">
              {lastResult.citationList.map((citation) => (
                <li key={citation}>{citation}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--pb-text-soft)]">
              {POPUP_TEXT.response.noCitations}
            </p>
          )
        ) : null}
      </div>

      <div className="mt-4">
        <RatingWidget
          historyEntryId={popupCurrentHistoryEntryId}
          intentId={lastResult.intent.intent}
          promptId={popupCurrentPromptId}
          templateId={lastResult.template.id}
        />
      </div>
    </section>
  );
}
