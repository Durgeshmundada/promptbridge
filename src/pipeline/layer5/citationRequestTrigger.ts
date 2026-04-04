import { IntentType } from '../../types';

const CITATION_INTENTS = new Set<IntentType>([
  IntentType.RESEARCH,
  IntentType.MEDICAL,
  IntentType.LEGAL,
]);

export const CITATION_REQUEST_INSTRUCTION =
  'Support every major claim with a citation in the format [Author, Year] or [Source Name]. If no citation is available, mark the claim as [NO_CITATION].';

/**
 * Appends citation requirements for research, medical, and legal prompts.
 */
export function triggerCitationRequests(prompt: string, intent: IntentType): string {
  if (!CITATION_INTENTS.has(intent)) {
    return prompt;
  }

  const trimmedPrompt = prompt.trimEnd();
  const separator = trimmedPrompt ? '\n\n' : '';

  return `${trimmedPrompt}${separator}${CITATION_REQUEST_INSTRUCTION}`;
}
