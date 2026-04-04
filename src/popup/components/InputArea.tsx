import { useEffect, useRef } from 'react';
import { formatAttachedImageMessage, POPUP_TEXT } from '../constants';
import { usePromptBridgeStore } from '../../store';

export interface InputAreaProps {
  isSubmitting: boolean;
  onAttachImage: (file: File) => void;
  onRemoveImage: () => void;
  onSubmit: () => void;
  onToggleAbMode: (enabled: boolean) => void;
  onToggleEnhancedMode: (enabled: boolean) => void;
}

const TEXTAREA_MAX_HEIGHT = 400;

function UploadIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 16V5.5m0 0L8.5 9m3.5-3.5L15.5 9M5 15.5v2.3A1.7 1.7 0 0 0 6.7 19.5h10.6a1.7 1.7 0 0 0 1.7-1.7v-2.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function InputArea({
  isSubmitting,
  onAttachImage,
  onRemoveImage,
  onSubmit,
  onToggleAbMode,
  onToggleEnhancedMode,
}: InputAreaProps): JSX.Element {
  const { popupDraftInput, popupImageAttachment, setPopupDraftInput, settings } =
    usePromptBridgeStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textAreaElement = textAreaRef.current;

    if (!textAreaElement) {
      return;
    }

    textAreaElement.style.height = '0px';
    textAreaElement.style.height = `${Math.min(textAreaElement.scrollHeight, TEXTAREA_MAX_HEIGHT).toString()}px`;
    textAreaElement.style.overflowY =
      textAreaElement.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [popupDraftInput]);

  return (
    <section className="pb-surface rounded-[26px] border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
          {POPUP_TEXT.inputArea.title}
        </h2>
      </div>

      <textarea
        className="mt-3 w-full resize-none rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm leading-6 text-[var(--pb-text)] outline-none transition placeholder:text-[var(--pb-text-subtle)] focus:border-[var(--pb-border-strong)]"
        onChange={(event) => {
          setPopupDraftInput(event.target.value);
        }}
        placeholder={POPUP_TEXT.inputArea.textareaPlaceholder}
        ref={textAreaRef}
        value={popupDraftInput}
      />

      {popupImageAttachment ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-2">
          <span className="min-w-0 truncate text-xs text-[var(--pb-text-soft)]">
            {formatAttachedImageMessage(popupImageAttachment.name)}
          </span>
          <button
            className="rounded-full bg-[var(--pb-danger-bg)] px-3 py-1 text-xs font-semibold text-[var(--pb-danger)]"
            onClick={onRemoveImage}
            type="button"
          >
            {POPUP_TEXT.inputArea.removeImageButton}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
          onClick={() => {
            fileInputRef.current?.click();
          }}
          type="button"
        >
          <UploadIcon />
          {POPUP_TEXT.inputArea.uploadButton}
        </button>

        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)]">
          <input
            checked={settings.abModeEnabled}
            onChange={(event) => {
              onToggleAbMode(event.target.checked);
            }}
            type="checkbox"
          />
          {POPUP_TEXT.inputArea.abModeLabel}
        </label>

        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)]">
          <input
            checked={settings.enhancedModeEnabled}
            onChange={(event) => {
              onToggleEnhancedMode(event.target.checked);
            }}
            type="checkbox"
          />
          {POPUP_TEXT.inputArea.enhancedModeLabel}
        </label>

        <button
          className="ml-auto rounded-full bg-[var(--pb-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? POPUP_TEXT.inputArea.submittingButton : POPUP_TEXT.inputArea.submitButton}
        </button>
      </div>

      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            onAttachImage(file);
          }

          event.target.value = '';
        }}
        ref={fileInputRef}
        type="file"
      />
    </section>
  );
}
