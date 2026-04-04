import type { PipelineResult } from '../../../types';
import type { ExecutionEngineError } from '../executionEngine';
import {
  ConfidenceLevel,
  IntentType,
  ModelTarget,
} from '../../../types';
import {
  assemblePayload,
  execute,
  ExecutionEngineErrorCode,
} from '../executionEngine';

function createPipelineResult(): PipelineResult {
  return {
    enrichedPrompt: 'Explain the migration plan with risks and mitigations.',
    rawResponse: '',
    processedResponse: '',
    intent: {
      intent: IntentType.RESEARCH,
      confidence: 0.91,
      subIntent: 'research-synthesis',
    },
    template: {
      id: 'research-synthesis',
      intentType: IntentType.RESEARCH,
      template: 'Template body',
      description: 'Research template',
      tags: ['research'],
      weight: 1,
    },
    complexityScore: {
      raw: 4,
      enriched: 7,
      delta: 3,
      breakdown: {
        specificity: 2,
        contextCompleteness: 2,
        constraintClarity: 2,
        outputDefinition: 1,
      },
    },
    piiRedactions: [],
    confidenceLevel: ConfidenceLevel.HIGH,
    citationList: [],
    executionTimeMs: 0,
    slotMappings: [],
    matchZone: 'DIRECT',
    matchScore: 1,
    matchBadge: 'Template matched directly',
    isNewTemplate: false,
  };
}

function installRuntimeMock(responseFactory: () => unknown): jest.Mock {
  const sendMessageMock = jest.fn(
    (_message: unknown, callback: (response: unknown) => void): void => {
      callback(responseFactory());
    },
  );

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: sendMessageMock,
      },
    } as unknown as typeof chrome,
  });

  return sendMessageMock;
}

describe('execution engine', () => {
  it('assembles a Groq payload with a system prompt', () => {
    const payload = assemblePayload(createPipelineResult(), ModelTarget.GROQ);

    expect(payload.model).toBe(ModelTarget.GROQ);
    expect(payload.systemPrompt).toContain('You are PromptBridge');
    expect(payload.maxTokens).toBe(2048);
    expect(payload.prompt).toContain('### GROQ_EXECUTION');
  });

  it('assembles a GPT-4o payload with a system prompt', () => {
    const payload = assemblePayload(createPipelineResult(), ModelTarget.GPT4O);

    expect(payload.model).toBe(ModelTarget.GPT4O);
    expect(payload.systemPrompt).toContain('You are PromptBridge');
    expect(payload.maxTokens).toBe(2048);
    expect(payload.prompt).toContain('### SYSTEM');
  });

  it('executes a payload through the background worker and normalizes the response', async () => {
    const sendMessageMock = installRuntimeMock(() => ({
      ok: true,
      text: 'Normalized model response.',
      executionTimeMs: 912,
    }));

    const result = await execute({
      model: ModelTarget.CLAUDE,
      prompt: 'Summarize the evidence.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 1024,
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      {
        type: 'EXECUTE_LLM',
        payload: {
          model: ModelTarget.CLAUDE,
          prompt: 'Summarize the evidence.',
          systemPrompt: 'You are PromptBridge.',
          maxTokens: 1024,
        },
      },
      expect.any(Function),
    );
    expect(result).toEqual({
      response: 'Normalized model response.',
      executionTimeMs: 912,
    });
  });

  it('throws a typed error when the background worker returns an execution error', async () => {
    installRuntimeMock(() => ({
      ok: false,
      error: 'The requested model is not supported.',
      code: 400,
    }));

    await expect(
      execute({
        model: ModelTarget.LLAMA,
        prompt: 'Do something unsupported.',
        maxTokens: 256,
      }),
    ).rejects.toMatchObject({
      name: 'ExecutionEngineError',
      code: ExecutionEngineErrorCode.REQUEST_FAILED,
      statusCode: 400,
    } satisfies Partial<ExecutionEngineError>);
  });

  it('passes Groq execution requests through the background worker', async () => {
    const sendMessageMock = installRuntimeMock(() => ({
      ok: true,
      text: 'Groq execution response.',
      executionTimeMs: 440,
    }));

    const result = await execute({
      model: ModelTarget.GROQ,
      prompt: 'Sharpen this prompt.',
      systemPrompt: 'You are PromptBridge.',
      maxTokens: 512,
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      {
        type: 'EXECUTE_LLM',
        payload: {
          model: ModelTarget.GROQ,
          prompt: 'Sharpen this prompt.',
          systemPrompt: 'You are PromptBridge.',
          maxTokens: 512,
        },
      },
      expect.any(Function),
    );
    expect(result).toEqual({
      response: 'Groq execution response.',
      executionTimeMs: 440,
    });
  });
});
