import { scorePromptComplexity } from '../promptComplexityScorer';

describe('promptComplexityScorer', () => {
  it('scores enriched prompts higher than sparse raw prompts', () => {
    const score = scorePromptComplexity({
      rawInput: 'Fix this bug.',
      enrichedPrompt:
        'Persona: Senior Engineer\nContext: React checkout flow in src/App.tsx on version 18.3.1.\nConstraints: Preserve behavior, avoid API changes, and explain validation.\nOutput format: Use sections for Problem, Diagnosis, Proposed Fix, and Validation.',
    });

    expect(score.enriched).toBeGreaterThan(score.raw);
    expect(score.delta).toBeGreaterThan(0);
  });

  it('penalizes unresolved placeholders in context completeness', () => {
    const score = scorePromptComplexity({
      rawInput: 'Summarize the memo.',
      enrichedPrompt:
        'Persona: Analyst\nContext: {{context}}\nConstraints: Include only key takeaways.\nOutput format: bullets',
    });

    expect(score.breakdown.enrichedContextCompleteness).toBeLessThan(6);
  });

  it('raises output-definition scores when explicit format instructions are present', () => {
    const structured = scorePromptComplexity({
      rawInput: 'Explain OAuth.',
      enrichedPrompt:
        'Explain OAuth.\n\nPromptBridge Output Contract:\n- Format: Use sections titled Concept, Mechanism, Example, and Key Takeaway.\n- Return Markdown bullets where useful.',
    });

    expect(structured.breakdown.enrichedOutputDefinition).toBeGreaterThan(
      structured.breakdown.rawOutputDefinition,
    );
  });

  it('keeps all scores within the 1-10 range', () => {
    const score = scorePromptComplexity({
      rawInput: '',
      enrichedPrompt:
        'Persona: Research Lead\nDomain: Climate policy\nContext: 2026-04-01 report and https://example.com\nConstraints: include only peer-reviewed evidence, exclude opinion, maximum 700 words.\nOutput format: JSON summary with sections.',
    });

    expect(score.raw).toBeGreaterThanOrEqual(1);
    expect(score.raw).toBeLessThanOrEqual(10);
    expect(score.enriched).toBeGreaterThanOrEqual(1);
    expect(score.enriched).toBeLessThanOrEqual(10);
  });
});
