import { IntentType } from '../../../types';
import type { IntentClassification } from '../../../types';
import {
  TEMPLATE_LIBRARY,
  matchTemplates,
  prioritizePinnedTemplates,
} from '../templateMatcher';

function createClassification(intent: IntentType, subIntent: string): IntentClassification {
  return {
    intent,
    confidence: 0.88,
    subIntent,
  };
}

describe('templateMatcher', () => {
  it('ranks the coding-debug template first for debugging requests', () => {
    const templates = matchTemplates(
      createClassification(IntentType.CODING, 'debugging'),
      'Debug the React TypeScript build. App.tsx throws an error after upgrading to v18.3.1.',
    );

    expect(templates).toHaveLength(3);
    expect(templates[0].id).toBe('coding-debug');
    expect(templates[0].tfIdfVector).toBeDefined();
  });

  it('ranks the comparison template first for versus-style prompts', () => {
    const templates = matchTemplates(
      createClassification(IntentType.QUESTION_CONCEPTUAL, 'concept-comparison'),
      'Compare React vs Vue for a dashboard application with long-term maintainability in mind.',
    );

    expect(templates[0].id).toBe('comparison');
  });

  it('ranks the summarization template first for summary requests', () => {
    const templates = matchTemplates(
      createClassification(IntentType.GENERAL, 'general-assistance'),
      'Summarize this research memo into key takeaways for an executive audience.',
    );

    expect(templates[0].id).toBe('summarization');
  });

  it('surfaces the research-synthesis template for evidence-oriented requests', () => {
    const templates = matchTemplates(
      createClassification(IntentType.RESEARCH, 'research-synthesis'),
      'Research and synthesize recent sources on battery recycling policy with citations.',
    );

    expect(templates.map((template) => template.id)).toContain('research-synthesis');
    expect(templates[0].id).toBe('research-synthesis');
  });

  it('selects the step-by-step template for algorithm explanations in a programming language', () => {
    const templates = matchTemplates(
      createClassification(IntentType.QUESTION_CONCEPTUAL, 'mechanism-explanation'),
      'Explain how binary search works in Python.',
    );

    expect(templates[0].id).toBe('step-by-step-explain');
  });

  it('boosts pinned templates so they can be deliberately applied on the next run', () => {
    const prioritizedTemplates = prioritizePinnedTemplates(TEMPLATE_LIBRARY, ['research-synthesis']);
    const templates = matchTemplates(
      createClassification(IntentType.QUESTION_CONCEPTUAL, 'mechanism-explanation'),
      'Explain how binary search works in Python.',
      prioritizedTemplates,
    );

    expect(templates[0].id).toBe('research-synthesis');
  });

  it('ships exactly 15 default templates', () => {
    expect(TEMPLATE_LIBRARY).toHaveLength(15);
  });
});
