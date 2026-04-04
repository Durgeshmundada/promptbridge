import { IntentType } from '../../types';

const FACT_FLAG_INTENTS = new Set<IntentType>([
  IntentType.QUESTION_FACTUAL,
  IntentType.RESEARCH,
  IntentType.MEDICAL,
  IntentType.LEGAL,
]);

export const FACT_FLAG_INSTRUCTION =
  'For every factual claim you make, append a confidence marker: [VERIFIED], [LIKELY], or [UNVERIFIED]. Do not omit this marker for any factual statement. If you are uncertain, say so explicitly before stating the claim.';

/**
 * Appends mandatory fact-flag instructions for factual, research, medical, and legal prompts.
 */
export function injectFactFlags(prompt: string, intent: IntentType): string {
  if (!FACT_FLAG_INTENTS.has(intent)) {
    return prompt;
  }

  const trimmedPrompt = prompt.trimEnd();
  const separator = trimmedPrompt ? '\n\n' : '';

  return `${trimmedPrompt}${separator}${FACT_FLAG_INSTRUCTION}`;
}
