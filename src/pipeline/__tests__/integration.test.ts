import type * as ExecutionEngineModule from '../layer6/executionEngine';
import type * as ObjectRelationshipMapperModule from '../layer4/objectRelationshipMapper';
import type * as OcrTextExtractorModule from '../layer4/ocrTextExtractor';
import type * as VisualContentClassifierModule from '../layer4/visualContentClassifier';

jest.mock('../layer6/executionEngine', () => {
  const actual = jest.requireActual('../layer6/executionEngine') as typeof ExecutionEngineModule;

  return {
    ...actual,
    execute: jest.fn(),
  };
});

jest.mock('../layer4/visualContentClassifier', () => {
  const actual =
    jest.requireActual('../layer4/visualContentClassifier') as typeof VisualContentClassifierModule;

  return {
    ...actual,
    classifyVisualContent: jest.fn(),
  };
});

jest.mock('../layer4/ocrTextExtractor', () => {
  const actual = jest.requireActual('../layer4/ocrTextExtractor') as typeof OcrTextExtractorModule;

  return {
    ...actual,
    extractOcrText: jest.fn(),
  };
});

jest.mock('../layer4/objectRelationshipMapper', () => {
  const actual =
    jest.requireActual('../layer4/objectRelationshipMapper') as typeof ObjectRelationshipMapperModule;

  return {
    ...actual,
    mapObjectRelationships: jest.fn(),
  };
});

import type {
  ApiPayload,
  AppSettings,
  Persona,
  PipelineInput,
  PipelineStageId,
  PipelineStatus,
  SessionNode,
} from '../../types';
import {
  ConfidenceLevel,
  ImageType,
  IntentType,
  ModelTarget,
} from '../../types';
import PipelineExecutor, {
  PipelineExecutorErrorCode,
  type ApiKeyManager,
} from '../PipelineExecutor';
import { execute as executePayload } from '../layer6/executionEngine';
import { FACT_FLAG_INSTRUCTION } from '../layer5/factFlagInjector';
import { CITATION_REQUEST_INSTRUCTION } from '../layer5/citationRequestTrigger';
import { classifyVisualContent } from '../layer4/visualContentClassifier';
import { extractOcrText } from '../layer4/ocrTextExtractor';
import { mapObjectRelationships } from '../layer4/objectRelationshipMapper';

const executeMock = executePayload as jest.MockedFunction<typeof executePayload>;
const classifyVisualContentMock =
  classifyVisualContent as jest.MockedFunction<typeof classifyVisualContent>;
const extractOcrTextMock = extractOcrText as jest.MockedFunction<typeof extractOcrText>;
const mapObjectRelationshipsMock =
  mapObjectRelationships as jest.MockedFunction<typeof mapObjectRelationships>;

const TEST_SETTINGS: AppSettings = {
  activePersonaId: 'default-persona',
  targetModel: ModelTarget.GPT4O,
  sessionMemoryDepth: 10,
  vaultTimeoutMinutes: 20,
  theme: 'system',
  abModeEnabled: false,
  enhancedModeEnabled: false,
};

const MEDICAL_DISCLAIMER =
  '[MEDICAL DISCLAIMER: This is AI-generated information only, not medical advice.]';

const IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm4WJ4AAAAASUVORK5CYII=';

const DEV_MODE_PERSONA: Persona = {
  id: 'dev-mode-persona',
  name: 'Dev Mode',
  role: 'Senior Java Engineer',
  expertise: ['Spring Boot', 'transaction management', 'fintech backend'],
  preferredStyle: 'terse technical',
  domainContext: 'fintech backend',
};

const RESEARCH_MODE_PERSONA: Persona = {
  id: 'research-mode-persona',
  name: 'Research Mode',
  role: 'Research Analyst',
  expertise: ['evidence synthesis', 'source comparison'],
  preferredStyle: 'balanced and evidence-aware',
  domainContext: 'General research synthesis and careful source framing.',
};

type StorageMap = Record<string, unknown>;

interface MockStorageAreaControls {
  clear: () => void;
}

function createMockStorageArea(
  runtime: { lastError?: chrome.runtime.LastError },
): { area: chrome.storage.StorageArea; controls: MockStorageAreaControls } {
  const store: StorageMap = {};

  const area = {
    get(
      keys: string | string[] | Record<string, unknown> | null,
      callback: (items: Record<string, unknown>) => void,
    ): void {
      runtime.lastError = undefined;

      if (typeof keys === 'string') {
        callback(keys in store ? { [keys]: store[keys] } : {});
        return;
      }

      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};

        keys.forEach((key) => {
          if (key in store) {
            result[key] = store[key];
          }
        });

        callback(result);
        return;
      }

      if (keys === null) {
        callback({ ...store });
        return;
      }

      const result: Record<string, unknown> = {};

      Object.keys(keys).forEach((key) => {
        result[key] = key in store ? store[key] : keys[key];
      });

      callback(result);
    },
    set(items: Record<string, unknown>, callback?: () => void): void {
      runtime.lastError = undefined;
      Object.assign(store, items);
      callback?.();
    },
  } as unknown as chrome.storage.StorageArea;

  return {
    area,
    controls: {
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key];
        });
      },
    },
  };
}

function installMockChromeStorage(): MockStorageAreaControls {
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const { area: localArea, controls } = createMockStorageArea(runtime);

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime,
      storage: {
        local: localArea,
      },
    } as unknown as typeof chrome,
  });

  return controls;
}

function createApiKeyManager(): jest.Mocked<ApiKeyManager> {
  return {
    ensureReady: jest.fn().mockResolvedValue(undefined),
  };
}

interface CreateExecutorOptions {
  settings?: AppSettings;
  autoCommandConfirmation?: string;
  autoQuestionAnswer?: string;
  autoScopeSelection?: string;
}

function createExecutor(options: CreateExecutorOptions = {}): {
  executor: PipelineExecutor;
  apiKeyManager: jest.Mocked<ApiKeyManager>;
  statuses: PipelineStatus[];
  stages: PipelineStageId[];
} {
  const {
    settings = TEST_SETTINGS,
    autoCommandConfirmation,
    autoQuestionAnswer,
    autoScopeSelection,
  } = options;
  const apiKeyManager = createApiKeyManager();
  const executor = new PipelineExecutor(settings, apiKeyManager);
  const statuses: PipelineStatus[] = [];
  const stages: PipelineStageId[] = [];

  executor.on('status', (status) => {
    statuses.push(status);
  });
  executor.on('stage', (stage) => {
    stages.push(stage);
  });
  if (autoQuestionAnswer) {
    executor.on('question', () => {
      executor.resumeWithAnswer(autoQuestionAnswer);
    });
  }
  if (autoCommandConfirmation) {
    executor.on('commandConfirmation', () => {
      executor.resumeWithAnswer(autoCommandConfirmation);
    });
  }
  if (autoScopeSelection) {
    executor.on('scopeSelection', () => {
      executor.resumeWithAnswer(autoScopeSelection);
    });
  }

  return {
    executor,
    apiKeyManager,
    statuses,
    stages,
  };
}

function buildTemplateGenerationResponse(prompt: string): string {
  const detectedIntent =
    prompt.match(/Detected intent:\s([A-Z_]+)/)?.[1] ??
    IntentType.GENERAL;

  return JSON.stringify({
    id: `generated-${Date.now().toString()}`,
    intentType: detectedIntent,
    description: 'Reusable generated template for similar future requests.',
    template:
      'Task: {{task}}\nContext: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}',
    tags: ['generated', 'reusable', 'prompt'],
    weight: 1,
  });
}

function buildTemplateAdaptationResponse(): string {
  return JSON.stringify({
    id: 'adapted-template',
    intentType: IntentType.GENERAL,
    description: 'Reusable adapted template for similar future requests.',
    template:
      'Task: {{task}}\nContext: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}',
    tags: ['adapted', 'reusable', 'prompt'],
    weight: 1,
  });
}

function buildEnhancedClarificationResponse(): string {
  return JSON.stringify({
    questions: [
      {
        question: 'Who is the audience for this prompt?',
        placeholder: 'For example: beginners, founders, or engineers.',
        defaultAnswer: 'Best professional choice.',
      },
      {
        question: 'What is the main outcome you want?',
        placeholder: 'Describe the practical goal or deliverable.',
        defaultAnswer: 'Best professional choice.',
      },
      {
        question: 'What output format should the answer follow?',
        placeholder: 'For example: blog outline, bullets, or step-by-step guide.',
        defaultAnswer: 'Best professional choice.',
      },
    ],
  });
}

function mockExecutionFlow(finalResponse: string, executionTimeMs: number): void {
  executeMock.mockImplementation(async (payload) => {
    if (payload.prompt.includes('Generate a reusable expert prompt template')) {
      return {
        response: buildTemplateGenerationResponse(payload.prompt),
        executionTimeMs: 60,
      };
    }

    if (payload.prompt.includes('Here is an existing prompt template:')) {
      return {
        response: buildTemplateAdaptationResponse(),
        executionTimeMs: 60,
      };
    }

    if (payload.prompt.includes('Micro-Question Engine')) {
      return {
        response: buildEnhancedClarificationResponse(),
        executionTimeMs: 45,
      };
    }

    return {
      response: finalResponse,
      executionTimeMs,
    };
  });
}

function getLastExecutionPayload(): ApiPayload | undefined {
  return executeMock.mock.calls.at(-1)?.[0];
}

describe('PipelineExecutor integration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the full coding pipeline for a vague bug-fix request', async () => {
    mockExecutionFlow(
      'Problem found in the failing branch logic. [UNVERIFIED]\n```ts\nconst fixed = true;\n```',
      120,
    );

    const { executor, apiKeyManager } = createExecutor({
      autoQuestionAnswer: 'Focus on the broken application code path and provide a concrete fix.',
      autoScopeSelection: '[A] current view',
    });
    const input: PipelineInput = {
      rawInput: 'fix it the bug in my code',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'coding-session',
    };

    const result = await executor.execute(input);

    expect(result.intent.intent).toBe(IntentType.CODING);
    expect(result.template.id).toBe('coding-debug');
    expect(result.enrichedPrompt).toContain('the specific issue');
    expect(result.complexityScore.raw).toBeLessThan(result.complexityScore.enriched);
    expect(result.enrichedPrompt).toContain('fenced code blocks with language hints when possible');
    expect(apiKeyManager.ensureReady).toHaveBeenCalledWith(ModelTarget.GPT4O);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('uses the step-by-step template for binary-search explanations in Python', async () => {
    mockExecutionFlow(
      '1) Concept in plain English\nBinary search repeatedly halves a sorted range to find a target faster than scanning every item.\n\n2) Step-by-step algorithm\n- Start with low and high pointers.\n- Check the middle item.\n- Move left or right depending on the comparison.\n- Stop when the target is found or the range is empty.\n\n3) Python code with inline comments\n```python\ndef binary_search(values, target):\n    low = 0\n    high = len(values) - 1\n\n    while low <= high:\n        mid = (low + high) // 2  # Inspect the current middle item\n        if values[mid] == target:\n            return mid\n        if values[mid] < target:\n            low = mid + 1  # Search the upper half\n        else:\n            high = mid - 1  # Search the lower half\n\n    return -1\n```\n\n4) Time/space complexity\nTime: O(log n)\nSpace: O(1)\n[LIKELY]',
      130,
    );

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Keep it educational and include a clean Python example with complexity analysis.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'explain how binary search works in python',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'binary-search-session',
    });

    expect(result.intent.intent).toBe(IntentType.QUESTION_CONCEPTUAL);
    expect(result.template.id).toBe('step-by-step-explain');
    expect(result.enrichedPrompt).toContain('1) Concept in plain English');
    expect(result.enrichedPrompt).toContain('2) Step-by-step algorithm');
    expect(result.enrichedPrompt).toContain('3) Python code with inline comments');
    expect(result.enrichedPrompt).toContain('4) Time/space complexity');
    expect(result.rawResponse).toContain('```python');
  });

  it('enhances an in-page prompt without executing the final downstream model call', async () => {
    const { executor, apiKeyManager, stages, statuses } = createExecutor();

    const result = await executor.enhancePrompt({
      rawInput: 'explain how binary search works in python',
      targetModel: ModelTarget.GROQ,
      sessionId: 'content-enhance-session',
    });

    expect(result.template.id).toBe('step-by-step-explain');
    expect(result.matchZone).toBe('DIRECT');
    expect(result.rawResponse).toBe('');
    expect(result.processedResponse).toBe('');
    expect(result.executionTimeMs).toBe(0);
    expect(result.enrichedPrompt).toContain('binary search');
    expect(apiKeyManager.ensureReady).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
    expect(stages).toContain('COMPLETE');
    expect(stages).not.toContain('LAYER6_EXECUTE_MODEL');
    expect(statuses.at(-1)).toBe('COMPLETE');
  });

  it('runs the full research pipeline and appends fact and citation instructions', async () => {
    mockExecutionFlow(
      'Quantum computing uses qubits that can encode superposed states. [VERIFIED] [Nielsen, 2010] Scalable error correction remains difficult in practice. [LIKELY] [Preskill, 2018]',
      155,
    );

    const { executor, apiKeyManager } = createExecutor({
      settings: {
        ...TEST_SETTINGS,
        targetModel: ModelTarget.CLAUDE,
      },
      autoQuestionAnswer:
        'Focus on the core concepts, current capabilities, and main limitations.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'tell me about quantum computing',
      targetModel: ModelTarget.CLAUDE,
      sessionId: 'research-session',
    });

    expect(result.intent.intent).toBe(IntentType.RESEARCH);
    expect(result.enrichedPrompt).toContain(FACT_FLAG_INSTRUCTION);
    expect(result.enrichedPrompt).toContain(CITATION_REQUEST_INSTRUCTION);
    expect(Object.values(ConfidenceLevel)).toContain(result.confidenceLevel);
    expect(apiKeyManager.ensureReady).toHaveBeenCalledWith(ModelTarget.CLAUDE);
  });

  it('surfaces hallucination guard markers, citations, tooltip highlights, and low confidence for an alzheimers query', async () => {
    mockExecutionFlow(
      [
        'Lecanemab has shown modest benefit in early Alzheimer\'s disease. [VERIFIED] [van Dyck, 2023]',
        'A universally curative treatment is already available worldwide. [UNVERIFIED] [NO_CITATION]',
        'Another breakthrough reverses all dementia symptoms within days. [UNVERIFIED] [NO_CITATION]',
      ].join(' '),
      170,
    );

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Focus on approved therapies, evidence strength, and major treatment limitations.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: "what are the latest treatments for Alzheimer's disease",
      targetModel: ModelTarget.GPT4O,
      sessionId: 'alzheimers-hallucination-guard-session',
    });

    const verifiedCount = (result.rawResponse.match(/\[VERIFIED\]/g) ?? []).length;
    const unverifiedCount = (result.rawResponse.match(/\[UNVERIFIED\]/g) ?? []).length;

    expect(result.enrichedPrompt).toContain(FACT_FLAG_INSTRUCTION);
    expect(result.enrichedPrompt).toContain(CITATION_REQUEST_INSTRUCTION);
    expect(verifiedCount).toBe(1);
    expect(unverifiedCount).toBe(2);
    expect(result.confidenceLevel).toBe(ConfidenceLevel.LOW);
    expect(result.processedResponse).toContain('pb-confidence-warning');
    expect(result.processedResponse).toContain('pb-unverified');
    expect(result.processedResponse).toContain(
      'title="This claim could not be verified by the model"',
    );
    expect(result.citationList).toEqual(['[van Dyck, 2023]']);
  });

  it('runs the destructive command pipeline with gate and scope confirmation', async () => {
    mockExecutionFlow('Deletion plan reviewed but not executed automatically. [UNVERIFIED]', 95);

    const { executor, statuses, stages } = createExecutor({
      autoQuestionAnswer:
        'Operate only on the requested database records and preserve auditability.',
    });
    const commandPreviews: string[] = [];
    const scopeSelections: string[][] = [];

    executor.on('commandConfirmation', (preview) => {
      commandPreviews.push(preview);
      executor.resumeWithAnswer('yes');
    });
    executor.on('scopeSelection', (options) => {
      scopeSelections.push(options);
      executor.resumeWithAnswer('[B] entire database');
    });

    const result = await executor.execute({
      rawInput: 'delete all users from the database',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'command-session',
    });

    expect(result.intent.intent).toBe(IntentType.COMMAND_DATA);
    expect(commandPreviews).toHaveLength(1);
    expect(commandPreviews[0]?.toLowerCase()).toContain('delete');
    expect(commandPreviews[0]).toContain('This action cannot be undone.');
    expect(scopeSelections).toEqual([
      ['[A] current view', '[B] entire database', '[C] custom'],
    ]);
    expect(statuses).toEqual(
      expect.arrayContaining(['WAITING_FOR_CONFIRMATION', 'COMPLETE']),
    );
    expect(stages).toEqual(
      expect.arrayContaining(['AWAITING_COMMAND_CONFIRMATION', 'AWAITING_SCOPE_CONFIRMATION']),
    );
    expect(result.enrichedPrompt).toContain('Selected Execution Scope');
    expect(result.piiRedactions).toEqual([]);
  });

  it('stops the pipeline entirely when a destructive command is cancelled at the gate', async () => {
    executeMock.mockResolvedValueOnce({
      response: 'This should never execute.',
      executionTimeMs: 10,
    });

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Operate only on the requested database records and preserve auditability.',
    });
    const commandPreviews: string[] = [];

    executor.on('commandConfirmation', (preview) => {
      commandPreviews.push(preview);
      executor.resumeWithAnswer('no');
    });

    await expect(
      executor.execute({
        rawInput: 'delete all users from the production database',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'command-cancel-session',
      }),
    ).rejects.toMatchObject({
      code: PipelineExecutorErrorCode.COMMAND_REJECTED,
    });

    expect(commandPreviews).toHaveLength(1);
    expect(commandPreviews[0]).toContain('This action cannot be undone.');
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('runs the image layer and injects synthesized image context into the final prompt', async () => {
    classifyVisualContentMock.mockResolvedValueOnce({
      type: ImageType.DIAGRAM,
      confidence: 0.96,
      suggestedPipeline: [
        'objectRelationshipMapper',
        'imageToPromptSynthesizer',
        'multimodalPromptBuilder',
      ],
    });
    mapObjectRelationshipsMock.mockResolvedValueOnce({
      elements: ['API Gateway', 'Worker', 'Database'],
      relationships: ['API Gateway sends requests to Worker', 'Worker reads from Database'],
      layout: 'Left-to-right flow diagram',
      summary: 'A request processing flow from client entry to persistence.',
    });
    mockExecutionFlow(
      'The diagram shows a request traveling from an API gateway to a worker and then a database. [VERIFIED] [Architecture Notes]',
      140,
    );

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Focus on what the architecture flow means and summarize the main relationships.',
      autoScopeSelection: '[A] current view',
    });
    const result = await executor.execute({
      rawInput: 'what does this diagram show?',
      imageData: IMAGE_DATA_URL,
      targetModel: ModelTarget.GPT4O,
      sessionId: 'image-session',
    });

    expect(classifyVisualContentMock).toHaveBeenCalledTimes(1);
    expect(extractOcrTextMock).not.toHaveBeenCalled();
    expect(mapObjectRelationshipsMock).toHaveBeenCalledTimes(1);
    expect(result.enrichedPrompt).toContain('Image Guidance:');
    expect(result.enrichedPrompt).toContain('The attached image shows a diagram.');
    expect(result.enrichedPrompt).toContain('API Gateway, Worker, Database');
    expect(getLastExecutionPayload()?.imageData).toBe(IMAGE_DATA_URL);
  });

  it('routes a code screenshot through OCR, surfaces extracted code context, and skips the object mapper', async () => {
    classifyVisualContentMock.mockResolvedValueOnce({
      type: ImageType.SCREENSHOT_CODE,
      confidence: 0.94,
      suggestedPipeline: [
        'ocrTextExtractor',
        'imageToPromptSynthesizer',
        'multimodalPromptBuilder',
      ],
    });
    extractOcrTextMock.mockResolvedValueOnce({
      extractedText:
        'def calculate_total(items):\n    total = 0\n    for item in items:\n        total += item["price"]\n    return total',
      detectedLanguage: 'Python',
      hasCode: true,
      syntaxErrors: ['KeyError risk if "price" key missing'],
    });
    mockExecutionFlow(
      'The function can raise a KeyError if an item is missing the price field. [LIKELY]',
      145,
    );

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Review the code for likely bugs and provide a safe fix with a test case.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'what is wrong with this',
      imageData: IMAGE_DATA_URL,
      targetModel: ModelTarget.GPT4O,
      sessionId: 'code-screenshot-session',
    });

    expect(classifyVisualContentMock).toHaveBeenCalledTimes(1);
    expect(extractOcrTextMock).toHaveBeenCalledTimes(1);
    expect(mapObjectRelationshipsMock).not.toHaveBeenCalled();
    expect(result.enrichedPrompt).toContain('The attached image shows a code screenshot.');
    expect(result.enrichedPrompt).toContain('def calculate_total(items):');
    expect(result.enrichedPrompt).toContain('Code detected in Python.');
    expect(result.enrichedPrompt).toContain('Possible syntax issues: KeyError risk if "price" key missing.');
  });

  it('substitutes a text-only image context block and omits the binary image payload for text-only targets', async () => {
    classifyVisualContentMock.mockResolvedValueOnce({
      type: ImageType.SCREENSHOT_CODE,
      confidence: 0.9,
      suggestedPipeline: [
        'ocrTextExtractor',
        'imageToPromptSynthesizer',
        'multimodalPromptBuilder',
      ],
    });
    extractOcrTextMock.mockResolvedValueOnce({
      extractedText: 'print(total)',
      detectedLanguage: 'Python',
      hasCode: true,
      syntaxErrors: ['No syntax errors detected'],
    });
    mockExecutionFlow('The model used the image summary instead of the raw image. [LIKELY]', 110);

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Summarize the code issue from the OCR output without relying on raw image access.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'what is wrong with this code screenshot',
      imageData: IMAGE_DATA_URL,
      targetModel: ModelTarget.CUSTOM,
      sessionId: 'text-only-image-session',
    });

    expect(result.enrichedPrompt).toContain('Image Context:');
    expect(result.enrichedPrompt).toContain(
      'The model does not support direct image input, so rely on this text-only image summary:',
    );
    expect(getLastExecutionPayload()?.imageData).toBeUndefined();
  });

  it('runs the medical pipeline with PII redaction, disclaimer injection, and confidence extraction', async () => {
    mockExecutionFlow(
      'Chest pain can be associated with urgent conditions and should be evaluated promptly when severe or persistent. [VERIFIED] [Mayo Clinic] Some non-cardiac causes are also possible. [LIKELY] [Cleveland Clinic]',
      175,
    );

    const { executor, apiKeyManager } = createExecutor({
      settings: {
        ...TEST_SETTINGS,
        targetModel: ModelTarget.GEMINI,
      },
      autoQuestionAnswer:
        'Focus on chest pain risks, red flags, and when urgent care is appropriate.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'my email is john@test.com, is chest pain at 45 dangerous?',
      targetModel: ModelTarget.GEMINI,
      sessionId: 'medical-session',
    });

    expect(result.intent.intent).toBe(IntentType.MEDICAL);
    expect(result.template.id).toBe('medical-query');
    expect(result.enrichedPrompt.startsWith(MEDICAL_DISCLAIMER)).toBe(true);
    expect(result.enrichedPrompt).toContain('[EMAIL REDACTED]');
    expect(result.enrichedPrompt).not.toContain('john@test.com');
    expect(result.enrichedPrompt).toContain(FACT_FLAG_INSTRUCTION);
    expect(result.enrichedPrompt).toContain(CITATION_REQUEST_INSTRUCTION);
    const emailRedaction = result.piiRedactions.find((redaction) => redaction.type === 'EMAIL');

    expect(emailRedaction).toBeDefined();
    expect(emailRedaction?.count ?? 0).toBeGreaterThanOrEqual(1);
    expect(Object.values(ConfidenceLevel)).toContain(result.confidenceLevel);
    expect(apiKeyManager.ensureReady).toHaveBeenCalledWith(ModelTarget.GEMINI);
  });

  it('redacts pii before the execution payload is assembled and sent onward', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const rawEmail = 'rahul@company.com';
    const rawApiKey = 'sk-abc123xyz456def789ghi012jkl345mno678';

    mockExecutionFlow('Check your credentials and request configuration. [LIKELY]', 105);

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Focus on likely authentication, permission, and endpoint mismatch issues.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: `my email is ${rawEmail} and my openai key is ${rawApiKey} - why is my API call failing`,
      targetModel: ModelTarget.GPT4O,
      sessionId: 'pii-redaction-session',
    });

    const outboundPrompt = getLastExecutionPayload()?.prompt ?? '';
    const loggedMessages = infoSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    const emailRedaction = result.piiRedactions.find((redaction) => redaction.type === 'EMAIL');
    const apiKeyRedaction = result.piiRedactions.find((redaction) => redaction.type === 'API_KEY');

    expect(emailRedaction?.count ?? 0).toBeGreaterThan(0);
    expect(apiKeyRedaction?.count ?? 0).toBeGreaterThan(0);
    expect(result.enrichedPrompt).toContain('[EMAIL REDACTED]');
    expect(result.enrichedPrompt).toContain('[API_KEY REDACTED]');
    expect(result.enrichedPrompt).not.toContain(rawEmail);
    expect(result.enrichedPrompt).not.toContain(rawApiKey);
    expect(outboundPrompt).toContain('[EMAIL REDACTED]');
    expect(outboundPrompt).toContain('[API_KEY REDACTED]');
    expect(outboundPrompt).not.toContain(rawEmail);
    expect(outboundPrompt).not.toContain(rawApiKey);
    expect(loggedMessages).not.toContain(rawEmail);
    expect(loggedMessages).not.toContain(rawApiKey);
  });

  it('enforces the medical disclaimer and footer structure for chest pain questions', async () => {
    mockExecutionFlow(
      '1) Direct answer\nChest pain at age 45 can be dangerous and should not be ignored. [VERIFIED]\n\n2) Risk factors\nCardiac risk increases with smoking, high blood pressure, diabetes, family history, and exertional symptoms. [LIKELY]\n\n3) When to seek emergency care\nSeek emergency care immediately for severe pain, shortness of breath, fainting, sweating, or pain spreading to the arm or jaw. [VERIFIED]\n\n4) [Consult a healthcare professional for personal medical advice]\n[LIKELY]',
      160,
    );

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Focus on urgency, risk factors, and clear escalation guidance for chest pain.',
      autoScopeSelection: '[A] current view',
    });

    const result = await executor.execute({
      rawInput: 'is chest pain dangerous at age 45',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'medical-acceptance-session',
    });

    expect(result.intent.intent).toBe(IntentType.MEDICAL);
    expect(result.enrichedPrompt.startsWith(MEDICAL_DISCLAIMER)).toBe(true);
    expect(result.enrichedPrompt).toContain('1) Direct answer');
    expect(result.enrichedPrompt).toContain('2) Risk factors');
    expect(result.enrichedPrompt).toContain('3) When to seek emergency care');
    expect(result.enrichedPrompt).toContain(
      '[Consult a healthcare professional for personal medical advice]',
    );
    expect(result.enrichedPrompt).toContain(FACT_FLAG_INSTRUCTION);
  });

  it('keeps standard mode as a one-click flow without pausing for clarification', async () => {
    mockExecutionFlow('Summary completed after the missing report was clarified. [LIKELY]', 115);

    const { executor, statuses, stages } = createExecutor();

    const executionPromise = executor.execute({
      rawInput: 'summarize the report',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'report-gap-session',
    });

    const result = await executionPromise;

    expect(statuses).not.toContain('WAITING_FOR_INPUT');
    expect(stages).not.toContain('AWAITING_MICRO_QUESTION');
    expect(stages).toContain('COMPLETE');
    expect(result.enrichedPrompt).not.toContain('User Clarification:');
    expect(result.enrichedPrompt).not.toContain('Professional Context Answers:');
  });

  it('asks three targeted clarification questions in enhanced mode and injects the answers', async () => {
    mockExecutionFlow('Professional AI blog prompt generated. [LIKELY]', 118);

    const { executor, statuses, stages } = createExecutor({
      settings: {
        ...TEST_SETTINGS,
        enhancedModeEnabled: true,
      },
    });
    const clarificationQuestionSets: string[][] = [];

    executor.on('clarificationSet', (questions) => {
      clarificationQuestionSets.push(questions.map((question) => question.prompt));
      executor.resumeWithClarificationSet([
        {
          questionId: questions[0].id,
          answer: 'Startup founders and product marketers.',
          usedDefault: false,
        },
        {
          questionId: questions[1].id,
          answer: 'Create a high-converting educational blog post.',
          usedDefault: false,
        },
        {
          questionId: questions[2].id,
          answer: '',
          usedDefault: true,
        },
      ]);
    });

    const result = await executor.execute({
      rawInput: 'Write a blog post about AI.',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'enhanced-mode-session',
    });

    expect(clarificationQuestionSets).toHaveLength(1);
    expect(clarificationQuestionSets[0]).toHaveLength(3);
    expect(statuses).toEqual(expect.arrayContaining(['WAITING_FOR_INPUT', 'COMPLETE']));
    expect(stages).toEqual(
      expect.arrayContaining([
        'LAYER2_GENERATE_ENHANCED_QUESTIONS',
        'AWAITING_ENHANCED_CLARIFICATION',
        'COMPLETE',
      ]),
    );
    expect(result.enrichedPrompt).toContain('Professional Context Answers:');
    expect(result.enrichedPrompt).toContain('Startup founders and product marketers.');
    expect(result.enrichedPrompt).toContain('Create a high-converting educational blog post.');
    expect(result.enrichedPrompt).toContain('Best professional choice. (default applied)');
  });

  it('changes the enriched prompt when the selected persona changes', async () => {
    mockExecutionFlow('Use Spring transaction boundaries. [LIKELY]', 125);

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Focus on Spring transaction boundaries, rollback behavior, and microservice safety.',
      autoScopeSelection: '[A] current view',
    });

    executor.setPersonas([DEV_MODE_PERSONA, RESEARCH_MODE_PERSONA]);

    const devModeResult = await executor.execute({
      rawInput: 'how do I handle database transactions',
      targetModel: ModelTarget.GPT4O,
      personaId: DEV_MODE_PERSONA.id,
      sessionId: 'persona-dev-session',
    });

    const researchModeResult = await executor.execute({
      rawInput: 'how do I handle database transactions',
      targetModel: ModelTarget.GPT4O,
      personaId: RESEARCH_MODE_PERSONA.id,
      sessionId: 'persona-research-session',
    });

    expect(devModeResult.enrichedPrompt).toContain('You are assisting Senior Java Engineer');
    expect(devModeResult.enrichedPrompt).toContain('Spring Boot, transaction management, fintech backend');
    expect(devModeResult.enrichedPrompt).toContain('Respond in terse technical style.');
    expect(researchModeResult.enrichedPrompt).toContain('You are assisting Research Analyst');
    expect(researchModeResult.enrichedPrompt).toContain('Respond in balanced and evidence-aware style.');
    expect(devModeResult.enrichedPrompt).not.toBe(researchModeResult.enrichedPrompt);
  });

  it('carries forward related session context across turns and prunes older turns when depth is two', async () => {
    mockExecutionFlow('Continue with the Go REST API plan. [LIKELY]', 90);

    const { executor } = createExecutor({
      settings: {
        ...TEST_SETTINGS,
        sessionMemoryDepth: 2,
      },
      autoQuestionAnswer:
        'Keep the advice scoped to the existing Go REST API and use pragmatic implementation guidance.',
      autoScopeSelection: '[A] current view',
    });
    const sessionId = 'go-rest-session';
    const sessionMemoryAccessor = executor as unknown as {
      sessionMemory: Map<string, SessionNode[]>;
    };

    await executor.execute({
      rawInput: 'I am building a REST API in Go using Gin.',
      targetModel: ModelTarget.GPT4O,
      sessionId,
    });
    const firstNodeId = sessionMemoryAccessor.sessionMemory.get(sessionId)?.[0]?.promptId;

    const secondResult = await executor.execute({
      rawInput: 'How do I add JWT authentication to this Go REST API?',
      targetModel: ModelTarget.GPT4O,
      sessionId,
    });
    const secondNodeId = sessionMemoryAccessor.sessionMemory.get(sessionId)?.[0]?.promptId;

    await executor.execute({
      rawInput: 'How should I validate request payloads in this Go REST API?',
      targetModel: ModelTarget.GPT4O,
      sessionId,
    });
    const thirdNodeId = sessionMemoryAccessor.sessionMemory.get(sessionId)?.[0]?.promptId;

    await executor.execute({
      rawInput: 'How do I add rate limiting to this Go REST API?',
      targetModel: ModelTarget.GPT4O,
      sessionId,
    });

    const finalNodes = sessionMemoryAccessor.sessionMemory.get(sessionId) ?? [];

    expect(secondResult.enrichedPrompt).toContain('Relevant session context:');
    expect(secondResult.enrichedPrompt).toContain('Go');
    expect(secondResult.enrichedPrompt).toContain('REST API');
    expect(finalNodes).toHaveLength(2);
    expect(finalNodes.map((node) => node.promptId)).toContain(thirdNodeId);
    expect(finalNodes.map((node) => node.promptId)).not.toContain(firstNodeId);
    expect(finalNodes.map((node) => node.promptId)).not.toContain(secondNodeId);
  });

  it('promotes a vague query from Zone 3 generation to a direct Zone 1 match on the next identical run', async () => {
    const storageControls = installMockChromeStorage();

    executeMock.mockImplementation(async (payload) => {
      if (payload.prompt.includes('Generate a reusable expert prompt template')) {
        return {
          response: JSON.stringify({
            id: 'generated-fix-it-template',
            intentType: IntentType.CODING,
            description:
              'Reusable fix it template for vague debugging and bug fix requests.',
            template:
              'Fix it request: {{task}}\nIssue: {{issue}}\nCode context: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}',
            tags: ['fix it', 'debugging', 'bug-fix', 'coding'],
            weight: 1,
          }),
          executionTimeMs: 50,
        };
      }

      return {
        response: 'Resolved the vague debugging request. [LIKELY]',
        executionTimeMs: 90,
      };
    });

    const { executor } = createExecutor({
      autoQuestionAnswer:
        'Fix the specific issue in my code and explain the repair clearly.',
    });

    try {
      const firstResult = await executor.execute({
        rawInput: 'fix it',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'zone-promotion-first-run',
      });

      const secondResult = await executor.execute({
        rawInput: 'fix it',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'zone-promotion-second-run',
      });

      expect(firstResult.matchZone).toBe('GENERATE');
      expect(firstResult.isNewTemplate).toBe(true);
      expect(firstResult.template.id).toBe('generated-fix-it-template');
      expect(secondResult.matchZone).toBe('DIRECT');
      expect(secondResult.matchScore).toBeGreaterThanOrEqual(0.8);
      expect(secondResult.isNewTemplate).toBe(false);
      expect(secondResult.template.id).toBe('generated-fix-it-template');
    } finally {
      storageControls.clear();
    }
  });
});
