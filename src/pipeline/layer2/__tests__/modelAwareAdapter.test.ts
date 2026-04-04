import { ModelTarget } from '../../../types';
import { adaptPromptForModel } from '../modelAwareAdapter';

describe('modelAwareAdapter', () => {
  it('adapts Groq prompts into concise execution framing', () => {
    const adapted = adaptPromptForModel('Refine this debugging request.', ModelTarget.GROQ);

    expect(adapted).toContain('### GROQ_EXECUTION');
    expect(adapted).toContain('Refine this debugging request.');
  });

  it('adds GPT4O system and user split markers', () => {
    const adapted = adaptPromptForModel('Explain the bug in markdown.', ModelTarget.GPT4O);

    expect(adapted).toContain('### SYSTEM');
    expect(adapted).toContain('### USER');
    expect(adapted).toContain('### MARKDOWN_HINTS');
  });

  it('wraps Claude prompts in XML with constitutional framing', () => {
    const adapted = adaptPromptForModel('Summarize the contract risk.', ModelTarget.CLAUDE);

    expect(adapted).toContain('<promptbridge_request>');
    expect(adapted).toContain('<constitutional_principles>');
    expect(adapted).toContain('<user_request>');
  });

  it('adapts Gemini prompts into concise function-call style', () => {
    const adapted = adaptPromptForModel('Return structured output for this query.', ModelTarget.GEMINI);

    expect(adapted).toContain('respond_request({');
    expect(adapted).toContain('"output_mode": "structured_markdown"');
  });

  it('formats LLAMA prompts in Alpaca-style INST markup', () => {
    const adapted = adaptPromptForModel('Explain the migration plan.', ModelTarget.LLAMA);

    expect(adapted.startsWith('[INST]')).toBe(true);
    expect(adapted).toContain('Respond with only the requested content');
  });

  it('returns CUSTOM prompts unchanged', () => {
    const prompt = 'Leave this prompt untouched.';

    expect(adaptPromptForModel(prompt, ModelTarget.CUSTOM)).toBe(prompt);
  });
});
