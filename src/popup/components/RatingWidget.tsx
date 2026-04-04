import { useState } from 'react';
import { adjustWeights } from '../../pipeline/layer1/templateMatcher';
import { usePromptBridgeStore } from '../../store';
import { RatingValue } from '../../types';
import type { IntentType } from '../../types';
import { POPUP_TEXT, formatRatingCount, formatSavedRatingMessage } from '../constants';
import { sendRuntimeMessage } from '../runtime';

export interface RatingWidgetProps {
  historyEntryId: string;
  intentId: IntentType;
  promptId: string;
  templateId: string;
}

function ThumbsUpIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M10 10.2V20H6.5a1.8 1.8 0 0 1-1.8-1.8v-6.1a1.8 1.8 0 0 1 1.8-1.8H10Zm2.2 0 2.1-5.1c.3-.7.9-1.1 1.7-1.1h.3c1 0 1.9.9 1.9 1.9v1.9c0 .3 0 .6-.1.9l-1.1 6.1a2 2 0 0 1-2 1.7H12.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function ThumbsDownIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M10 13.8V4H6.5a1.8 1.8 0 0 0-1.8 1.8v6.1a1.8 1.8 0 0 0 1.8 1.8H10Zm2.2 0 2.1 5.1c.3.7.9 1.1 1.7 1.1h.3c1 0 1.9-.9 1.9-1.9v-1.9c0-.3 0-.6-.1-.9l-1.1-6.1a2 2 0 0 0-2-1.7H12.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : POPUP_TEXT.rating.defaultMessage;
}

export default function RatingWidget({
  historyEntryId,
  intentId,
  promptId,
  templateId,
}: RatingWidgetProps): JSX.Element {
  const {
    ratings,
    templates,
    saveRatingToStorage,
    saveTemplatesToStorage,
    setPopupStatusMessage,
  } = usePromptBridgeStore();
  const [selectedRating, setSelectedRating] = useState<RatingValue | null>(null);
  const [comment, setComment] = useState('');
  const [statusMessage, setStatusMessage] = useState<string>(POPUP_TEXT.rating.defaultMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const submitRating = async (): Promise<void> => {
    if (!selectedRating) {
      setStatusMessage(POPUP_TEXT.rating.chooseRatingFirst);
      return;
    }

    setIsSubmitting(true);

    try {
      const nextRatings = await saveRatingToStorage({
        promptId,
        templateId,
        intentId,
        rating: selectedRating,
        comment: comment.trim(),
        timestamp: new Date().toISOString(),
      });

      if (nextRatings.length >= 10 && nextRatings.length % 10 === 0) {
        const adjustedTemplates = adjustWeights(nextRatings, templates);
        await saveTemplatesToStorage(adjustedTemplates);
      }

      if (historyEntryId) {
        await sendRuntimeMessage({
          type: 'UPDATE_HISTORY_RATING',
          payload: {
            entryId: historyEntryId,
            rating: selectedRating,
          },
        });
      }

      setHasSubmitted(true);
      setStatusMessage(formatSavedRatingMessage(nextRatings.length));
      setPopupStatusMessage(formatSavedRatingMessage(nextRatings.length));
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
      setPopupStatusMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="pb-surface rounded-[24px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
            {POPUP_TEXT.rating.eyebrow}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--pb-text)]">
            {POPUP_TEXT.rating.title}
          </h3>
        </div>
        <span className="rounded-full bg-[var(--pb-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--pb-accent)]">
          {formatRatingCount(ratings.length)}
        </span>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          className={`flex flex-1 items-center gap-2 rounded-[18px] border px-4 py-3 text-left transition ${
            selectedRating === RatingValue.THUMBS_UP
              ? 'border-[var(--pb-success)] bg-[var(--pb-success-bg)] text-[var(--pb-success)]'
              : 'border-[var(--pb-border)] bg-[var(--pb-surface-strong)] text-[var(--pb-text)]'
          }`}
          onClick={() => {
            setSelectedRating(RatingValue.THUMBS_UP);
          }}
          type="button"
        >
          <ThumbsUpIcon />
          <span className="text-sm font-semibold">{POPUP_TEXT.rating.helpful}</span>
        </button>
        <button
          className={`flex flex-1 items-center gap-2 rounded-[18px] border px-4 py-3 text-left transition ${
            selectedRating === RatingValue.THUMBS_DOWN
              ? 'border-[var(--pb-danger)] bg-[var(--pb-danger-bg)] text-[var(--pb-danger)]'
              : 'border-[var(--pb-border)] bg-[var(--pb-surface-strong)] text-[var(--pb-text)]'
          }`}
          onClick={() => {
            setSelectedRating(RatingValue.THUMBS_DOWN);
          }}
          type="button"
        >
          <ThumbsDownIcon />
          <span className="text-sm font-semibold">{POPUP_TEXT.rating.needsWork}</span>
        </button>
      </div>

      <label className="mt-4 block text-sm font-medium text-[var(--pb-text-soft)]" htmlFor="rating-comment">
        {POPUP_TEXT.rating.noteLabel}
      </label>
      <input
        className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none transition placeholder:text-[var(--pb-text-subtle)] focus:border-[var(--pb-border-strong)]"
        id="rating-comment"
        onChange={(event) => {
          setComment(event.target.value);
        }}
        placeholder={POPUP_TEXT.rating.notePlaceholder}
        type="text"
        value={comment}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-[var(--pb-text-soft)]">{statusMessage}</p>
        <button
          className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || hasSubmitted}
          onClick={() => {
            void submitRating();
          }}
          type="button"
        >
          {hasSubmitted
            ? POPUP_TEXT.rating.saved
            : isSubmitting
              ? POPUP_TEXT.rating.submitting
              : POPUP_TEXT.rating.submit}
        </button>
      </div>
    </section>
  );
}
