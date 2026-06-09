import { useState } from 'react';
import { initVault, storeSecret } from '../../pipeline/layer3/sensitiveDataVault';

interface OnboardingProps {
  onComplete: () => Promise<void>;
}

type OnboardingStep = 0 | 1 | 2;

export default function Onboarding({ onComplete }: OnboardingProps): JSX.Element {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [passphrase, setPassphrase] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveVault = async (): Promise<void> => {
    if (!passphrase.trim()) {
      setStatusMessage('Enter a vault passphrase to continue.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');

    try {
      await initVault(passphrase);

      if (geminiKey.trim()) {
        await storeSecret('geminiApiKey', geminiKey.trim());
      }

      setPassphrase('');
      setGeminiKey('');
      setStep(2);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'PromptBridge could not set up the vault.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="pb-surface-strong flex min-h-0 flex-1 flex-col justify-between rounded-[24px] p-5">
      {step === 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            Welcome
          </p>
          <h2 className="text-2xl font-semibold text-[var(--pb-text)]">PromptBridge is ready.</h2>
          <p className="text-sm leading-6 text-[var(--pb-text-soft)]">
            Set up the encrypted vault once, then optimize prompts directly from the popup or any
            supported AI chat page.
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            Vault setup
          </p>
          <h2 className="text-xl font-semibold text-[var(--pb-text)]">Protect your API keys.</h2>
          <label className="block text-sm font-semibold text-[var(--pb-text)]">
            Vault passphrase
            <input
              className="mt-2 w-full rounded-[14px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--pb-border-strong)]"
              type="password"
              value={passphrase}
              onChange={(event) => {
                setPassphrase(event.target.value);
              }}
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--pb-text)]">
            Gemini API key
            <input
              className="mt-2 w-full rounded-[14px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--pb-border-strong)]"
              type="password"
              value={geminiKey}
              onChange={(event) => {
                setGeminiKey(event.target.value);
              }}
            />
          </label>
          {statusMessage ? (
            <p className="text-sm font-semibold text-[var(--pb-danger)]">{statusMessage}</p>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            Ready
          </p>
          <h2 className="text-2xl font-semibold text-[var(--pb-text)]">You are set.</h2>
          <p className="text-sm leading-6 text-[var(--pb-text-soft)]">
            PromptBridge will keep keys encrypted locally and enrich prompts before they reach your
            selected model.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-3">
        {step === 0 ? (
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => {
              setStep(1);
            }}
          >
            Continue
          </button>
        ) : null}
        {step === 1 ? (
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={() => {
              void saveVault();
            }}
          >
            {isSaving ? 'Saving...' : 'Save vault'}
          </button>
        ) : null}
        {step === 2 ? (
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => {
              void onComplete();
            }}
          >
            Start optimizing
          </button>
        ) : null}
      </div>
    </section>
  );
}
