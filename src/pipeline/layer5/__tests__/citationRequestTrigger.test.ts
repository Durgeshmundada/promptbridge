import { IntentType } from '../../../types';
import {
  CITATION_REQUEST_INSTRUCTION,
  triggerCitationRequests,
} from '../citationRequestTrigger';

describe('triggerCitationRequests', () => {
  it('appends citation instructions for research prompts', () => {
    const prompt = 'Synthesize the major findings on lithium-ion battery recycling.';
    const result = triggerCitationRequests(prompt, IntentType.RESEARCH);

    expect(result).toBe(`${prompt}\n\n${CITATION_REQUEST_INSTRUCTION}`);
  });

  it('appends citation instructions for medical prompts', () => {
    const result = triggerCitationRequests(
      'Explain common side effects of amoxicillin.',
      IntentType.MEDICAL,
    );

    expect(result.endsWith(CITATION_REQUEST_INSTRUCTION)).toBe(true);
  });

  it('does not modify prompts for unrelated intents', () => {
    const prompt = 'Explain recursion with a simple metaphor.';

    expect(triggerCitationRequests(prompt, IntentType.QUESTION_CONCEPTUAL)).toBe(prompt);
  });
});
