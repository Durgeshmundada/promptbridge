import { IntentType } from '../../../types';
import { classifyIntent } from '../intentClassifier';

describe('intentClassifier', () => {
  it('classifies debugging requests as coding with strong confidence', () => {
    const result = classifyIntent(
      'Please debug this TypeScript React component. The build is failing with an exception in App.tsx.',
    );

    expect(result.intent).toBe(IntentType.CODING);
    expect(result.subIntent).toBe('debugging');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.needsClarification).toBeUndefined();
  });

  it('classifies medication questions as medical', () => {
    const result = classifyIntent(
      'What dosage of ibuprofen is typically discussed for fever, and what side effects should a patient watch for?',
    );

    expect(result.intent).toBe(IntentType.MEDICAL);
    expect(result.subIntent).toBe('medication-question');
  });

  it('distinguishes factual questions from conceptual ones', () => {
    const factual = classifyIntent('When is the next eclipse visible in India?');
    const conceptual = classifyIntent('How does event bubbling work in JavaScript?');
    const algorithmWalkthrough = classifyIntent('Explain how binary search works in Python.');

    expect(factual.intent).toBe(IntentType.QUESTION_FACTUAL);
    expect(conceptual.intent).toBe(IntentType.QUESTION_CONCEPTUAL);
    expect(algorithmWalkthrough.intent).toBe(IntentType.QUESTION_CONCEPTUAL);
  });

  it('flags vague low-signal input for clarification', () => {
    const result = classifyIntent('Can you help with this thing maybe?');

    expect(result.intent).toBe(IntentType.GENERAL);
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.needsClarification).toBe(true);
  });

  it('treats a bare "fix it" request as coding while still asking for clarification', () => {
    const result = classifyIntent('fix it');

    expect(result.intent).toBe(IntentType.CODING);
    expect(result.subIntent).toBe('debugging');
    expect(result.needsClarification).toBe(true);
  });
});
