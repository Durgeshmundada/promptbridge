import { IntentType } from '../../../types';
import { enforceOutputFormat } from '../outputFormatEnforcer';

describe('outputFormatEnforcer', () => {
  it('appends coding-specific output instructions and budget', () => {
    const result = enforceOutputFormat('Investigate the runtime bug in the checkout service.', IntentType.CODING);

    expect(result).toContain('PromptBridge Output Contract:');
    expect(result).toContain('Problem, Diagnosis, Proposed Fix, and Validation');
    expect(result).toContain('900 tokens maximum');
  });

  it('appends medical safety-oriented formatting', () => {
    const result = enforceOutputFormat(
      'Explain what a patient should watch for after starting a new medication.',
      IntentType.MEDICAL,
    );

    expect(result).toContain('1) Direct answer');
    expect(result).toContain('2) Risk factors');
    expect(result).toContain('3) When to seek emergency care');
    expect(result).toContain('[Consult a healthcare professional for personal medical advice]');
    expect(result).toContain('750 tokens maximum');
  });

  it('does not duplicate the output contract when applied twice', () => {
    const once = enforceOutputFormat('Summarize the migration plan.', IntentType.GENERAL);
    const twice = enforceOutputFormat(once, IntentType.GENERAL);

    expect(once).toBe(twice);
    expect((twice.match(/PromptBridge Output Contract:/g) ?? []).length).toBe(1);
  });

  it('uses the four-part walkthrough format for algorithm explanations with a language target', () => {
    const result = enforceOutputFormat(
      'Explain how binary search works in Python.',
      IntentType.QUESTION_CONCEPTUAL,
    );

    expect(result).toContain('1) Concept in plain English');
    expect(result).toContain('2) Step-by-step algorithm');
    expect(result).toContain('3) Python code with inline comments');
    expect(result).toContain('4) Time/space complexity');
  });
});
