import { IntentType } from '../../../types';
import { FACT_FLAG_INSTRUCTION, injectFactFlags } from '../factFlagInjector';

describe('injectFactFlags', () => {
  it('always appends the verbatim fact-flag instruction for factual questions', () => {
    const result = injectFactFlags('What is the capital of France?', IntentType.QUESTION_FACTUAL);

    expect(result).toContain('What is the capital of France?');
    expect(result.endsWith(FACT_FLAG_INSTRUCTION)).toBe(true);
  });

  it('appends the fact-flag instruction for research and preserves existing content', () => {
    const prompt = 'Summarize current evidence on microplastics in drinking water.';
    const result = injectFactFlags(prompt, IntentType.RESEARCH);

    expect(result).toBe(`${prompt}\n\n${FACT_FLAG_INSTRUCTION}`);
  });

  it('leaves non-factual intents unchanged', () => {
    const prompt = 'Write a short fantasy poem about rain.';

    expect(injectFactFlags(prompt, IntentType.CREATIVE)).toBe(prompt);
  });
});
