import type * as ExecutionEngineModule from '../../layer6/executionEngine';

jest.mock('../../layer6/executionEngine', () => {
  const actual = jest.requireActual('../../layer6/executionEngine') as typeof ExecutionEngineModule;

  return {
    ...actual,
    execute: jest.fn(),
  };
});

import type { EnhancedClarificationInput } from '../enhancedClarificationEngine';
import { IntentType, ModelTarget, GapSeverity } from '../../../types';
import { execute } from '../../layer6/executionEngine';
import { generateEnhancedClarificationSet } from '../enhancedClarificationEngine';

const executeMock = execute as jest.MockedFunction<typeof execute>;

function createInput(overrides: Partial<EnhancedClarificationInput> = {}): EnhancedClarificationInput {
  return {
    rawInput: 'Write a blog post about AI.',
    intent: IntentType.GENERAL,
    knowledgeGaps: [
      {
        gap: 'Missing scope or constraints: the prompt lacks explicit limits, priorities, or response boundaries.',
        severity: GapSeverity.MEDIUM,
        suggestedFix: 'Clarify the desired scope and output boundaries.',
      },
    ],
    sessionContext: 'Previous same-session turn discussed AI startup launches.',
    ...overrides,
  };
}

describe('enhancedClarificationEngine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('parses three model-generated clarification questions from JSON', async () => {
    executeMock.mockResolvedValueOnce({
      response: JSON.stringify({
        questions: [
          {
            question: 'Who is the audience for this prompt?',
            placeholder: 'Describe the target audience.',
            defaultAnswer: 'Best professional choice.',
          },
          {
            question: 'What is the main goal?',
            placeholder: 'State the desired business or content outcome.',
            defaultAnswer: 'Best professional choice.',
          },
          {
            question: 'What format should the answer follow?',
            placeholder: 'For example: blog outline or full draft.',
            defaultAnswer: 'Best professional choice.',
          },
        ],
      }),
      executionTimeMs: 40,
    });

    const result = await generateEnhancedClarificationSet(createInput());

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 'enhanced-q1',
      prompt: 'Who is the audience for this prompt?',
      placeholder: 'Describe the target audience.',
      defaultAnswer: 'Best professional choice.',
    });
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: ModelTarget.GROQ,
        maxTokens: 500,
        temperature: 0.3,
      }),
    );
  });

  it('falls back to deterministic questions when the model response is invalid', async () => {
    executeMock.mockResolvedValueOnce({
      response: 'not valid json',
      executionTimeMs: 35,
    });

    const result = await generateEnhancedClarificationSet(
      createInput({
        rawInput: 'fix it',
        intent: IntentType.CODING,
      }),
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.prompt).toContain('code, file, stack, or failing behavior');
    expect(result[1]?.prompt).toContain('diagnosis, fix, refactor, or test coverage');
    expect(result[2]?.defaultAnswer).toBe('Best professional choice.');
  });

  it('asks a domain-disambiguation question first for short ambiguous explanation prompts', async () => {
    const result = await generateEnhancedClarificationSet(
      createInput({
        rawInput: 'explain pipelining',
        intent: IntentType.QUESTION_CONCEPTUAL,
        knowledgeGaps: [],
      }),
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.prompt).toContain('Which kind of pipeline');
    expect(result[1]?.prompt).toContain('What level should the explanation');
    expect(result[2]?.prompt).toContain('include an example, analogy, or use case');
    expect(executeMock).not.toHaveBeenCalled();
  });
});
