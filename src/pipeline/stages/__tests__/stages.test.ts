import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfidenceLevel,
  GapSeverity,
  ImageType,
  IntentType,
  ModelTarget,
} from '../../../types';
import type {
  AppSettings,
  IntentClassification,
  Persona,
  PipelineContext,
  PromptTemplate,
  SessionNode,
} from '../../../types';
import {
  fail,
  ok,
  requireContext,
  runStage,
  runStageAdaptForModel,
  runStageAssemblePayload,
  runStageBuildSessionMemory,
  runStageClassifyIntent,
  runStageCommandGate,
  runStageDetectGaps,
  runStageEnforceOutputFormat,
  runStageExecuteModel,
  runStageFillSlots,
  runStageGenerateClarifications,
  runStageInjectContext,
  runStageInjectFactFlags,
  runStageInjectPersona,
  runStageMatchTemplate,
  runStageNeutralizeAmbiguity,
  runStageProcessImage,
  runStageRequestCitations,
  runStageScanPii,
  runStageScopeConfirmation,
  runStageScoreComplexity,
} from '../index';

const stageMocks = vi.hoisted(() => ({
  adaptPromptForModel: vi.fn(),
  assemblePayload: vi.fn(),
  buildMultimodalPrompt: vi.fn(),
  buildSessionMemoryGraph: vi.fn(),
  classifyIntent: vi.fn(),
  classifyVisualContent: vi.fn(),
  detectKnowledgeGaps: vi.fn(),
  enforceOutputFormat: vi.fn(),
  evaluateCommandGate: vi.fn(),
  evaluateScopeConfirmation: vi.fn(),
  execute: vi.fn(),
  extractOcrText: vi.fn(),
  fillTemplateSlots: vi.fn(),
  generateEnhancedClarificationSet: vi.fn(),
  getAllTemplates: vi.fn(),
  getTopMatch: vi.fn(),
  injectContext: vi.fn(),
  injectFactFlags: vi.fn(),
  injectPersonaContext: vi.fn(),
  mapObjectRelationships: vi.fn(),
  neutralizeAmbiguity: vi.fn(),
  scanForPii: vi.fn(),
  scorePromptComplexity: vi.fn(),
  synthesizeImageToPromptContext: vi.fn(),
  triggerCitationRequests: vi.fn(),
}));

vi.mock('../../layer1/intentClassifier', () => ({
  classifyIntent: stageMocks.classifyIntent,
}));

vi.mock('../../layer1/templateMatcher', () => ({
  getAllTemplates: stageMocks.getAllTemplates,
  getTopMatch: stageMocks.getTopMatch,
}));

vi.mock('../../layer1/contextInjector', () => ({
  injectContext: stageMocks.injectContext,
}));

vi.mock('../../layer1/slotFiller', () => ({
  fillTemplateSlots: stageMocks.fillTemplateSlots,
}));

vi.mock('../../layer1/ambiguityNeutralizer', () => ({
  neutralizeAmbiguity: stageMocks.neutralizeAmbiguity,
}));

vi.mock('../../layer1/outputFormatEnforcer', () => ({
  enforceOutputFormat: stageMocks.enforceOutputFormat,
}));

vi.mock('../../layer2/knowledgeGapDetector', () => ({
  detectKnowledgeGaps: stageMocks.detectKnowledgeGaps,
}));

vi.mock('../../layer2/enhancedClarificationEngine', () => ({
  generateEnhancedClarificationSet: stageMocks.generateEnhancedClarificationSet,
}));

vi.mock('../../layer2/personaInjector', () => ({
  injectPersonaContext: stageMocks.injectPersonaContext,
}));

vi.mock('../../layer2/sessionMemoryGraph', () => ({
  buildSessionMemoryGraph: stageMocks.buildSessionMemoryGraph,
}));

vi.mock('../../layer2/modelAwareAdapter', () => ({
  adaptPromptForModel: stageMocks.adaptPromptForModel,
}));

vi.mock('../../layer2/promptComplexityScorer', () => ({
  scorePromptComplexity: stageMocks.scorePromptComplexity,
}));

vi.mock('../../layer3/piiScanner', () => ({
  scanForPii: stageMocks.scanForPii,
}));

vi.mock('../../layer3/commandGate', () => ({
  evaluateCommandGate: stageMocks.evaluateCommandGate,
}));

vi.mock('../../layer3/scopeConfirmation', () => ({
  evaluateScopeConfirmation: stageMocks.evaluateScopeConfirmation,
}));

vi.mock('../../layer4/visualContentClassifier', () => ({
  classifyVisualContent: stageMocks.classifyVisualContent,
}));

vi.mock('../../layer4/ocrTextExtractor', () => ({
  extractOcrText: stageMocks.extractOcrText,
}));

vi.mock('../../layer4/objectRelationshipMapper', () => ({
  mapObjectRelationships: stageMocks.mapObjectRelationships,
}));

vi.mock('../../layer4/imageToPromptSynthesizer', () => ({
  synthesizeImageToPromptContext: stageMocks.synthesizeImageToPromptContext,
}));

vi.mock('../../layer4/multimodalPromptBuilder', () => ({
  buildMultimodalPrompt: stageMocks.buildMultimodalPrompt,
}));

vi.mock('../../layer5/factFlagInjector', () => ({
  injectFactFlags: stageMocks.injectFactFlags,
}));

vi.mock('../../layer5/citationRequestTrigger', () => ({
  triggerCitationRequests: stageMocks.triggerCitationRequests,
}));

vi.mock('../../layer6/executionEngine', () => ({
  assemblePayload: stageMocks.assemblePayload,
  execute: stageMocks.execute,
}));

const TEST_INTENT: IntentClassification = {
  intent: IntentType.CODING,
  confidence: 0.91,
  subIntent: 'debugging',
};

const TEST_TEMPLATE: PromptTemplate = {
  id: 'coding-debug',
  intentType: IntentType.CODING,
  template: 'Debug {{task}}',
  description: 'Debug a coding issue.',
  tags: ['coding'],
  weight: 1,
};

const TEST_PERSONA: Persona = {
  id: 'developer-persona',
  name: 'Build Partner',
  role: 'software engineer',
  expertise: ['TypeScript', 'testing'],
  preferredStyle: 'concise',
  domainContext: 'frontend engineering',
};

const TEST_SETTINGS: AppSettings = {
  activePersonaId: TEST_PERSONA.id,
  targetModel: ModelTarget.GPT4O,
  sessionMemoryDepth: 2,
  vaultTimeoutMinutes: 20,
  theme: 'system',
  abModeEnabled: false,
  enhancedModeEnabled: false,
  onboardingComplete: true,
};

const TEST_SESSION_NODE: SessionNode = {
  promptId: 'prompt-1',
  intent: IntentType.CODING,
  keyEntities: ['TypeScript'],
  timestamp: '2026-06-09T00:00:00.000Z',
  responseQuality: 0.5,
  enrichedPrompt: 'prior prompt',
  rawResponse: 'prior response',
};

function createContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    input: {
      rawInput: 'Fix the failing TypeScript test.',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'stage-session',
    },
    settings: TEST_SETTINGS,
    timestamp: '2026-06-09T00:00:00.000Z',
    promptId: 'stage-prompt',
    persona: TEST_PERSONA,
    ...overrides,
  };
}

function seedStageMocks(): void {
  stageMocks.classifyIntent.mockReturnValue(TEST_INTENT);
  stageMocks.getAllTemplates.mockResolvedValue([TEST_TEMPLATE]);
  stageMocks.getTopMatch.mockReturnValue({
    zone: 'DIRECT',
    template: TEST_TEMPLATE,
    score: 0.92,
    isNewTemplate: false,
  });
  stageMocks.injectContext.mockReturnValue('context prompt');
  stageMocks.fillTemplateSlots.mockReturnValue({
    filledTemplate: 'filled prompt',
    slotMappings: [{ key: 'task', value: 'fix test', source: 'rawInput' }],
  });
  stageMocks.neutralizeAmbiguity.mockReturnValue('neutral prompt');
  stageMocks.enforceOutputFormat.mockReturnValue('formatted prompt');
  stageMocks.detectKnowledgeGaps.mockReturnValue([
    {
      gap: 'Missing expected behavior',
      severity: GapSeverity.HIGH,
      suggestedFix: 'Ask for assertion details.',
    },
  ]);
  stageMocks.generateEnhancedClarificationSet.mockResolvedValue([
    {
      id: 'enhanced-q1',
      prompt: 'What should the test assert?',
      placeholder: 'Expected behavior',
      defaultAnswer: 'Use the closest professional default.',
    },
  ]);
  stageMocks.injectPersonaContext.mockReturnValue('persona prompt');
  stageMocks.buildSessionMemoryGraph.mockReturnValue({
    relevantContext: 'Relevant session context: TypeScript',
    updatedNodes: [TEST_SESSION_NODE],
  });
  stageMocks.adaptPromptForModel.mockReturnValue('adapted prompt');
  stageMocks.scorePromptComplexity.mockReturnValue({
    raw: 3,
    enriched: 8,
    delta: 5,
    breakdown: { context: 8 },
  });
  stageMocks.scanForPii.mockReturnValue({
    sanitized: 'redacted prompt',
    redactions: [{ type: 'email', count: 1 }],
  });
  stageMocks.evaluateCommandGate.mockReturnValue({
    requiresConfirmation: true,
    preview: 'This command may delete data.',
    riskLevel: 'HIGH',
  });
  stageMocks.evaluateScopeConfirmation.mockReturnValue({
    requiresScopeSelection: true,
    options: ['[A] current view'],
  });
  stageMocks.classifyVisualContent.mockResolvedValue({
    type: ImageType.SCREENSHOT_UI,
    confidence: 0.88,
    suggestedPipeline: ['ocrTextExtractor', 'objectRelationshipMapper'],
  });
  stageMocks.extractOcrText.mockResolvedValue({
    extractedText: 'button label',
    hasCode: false,
  });
  stageMocks.mapObjectRelationships.mockResolvedValue({
    elements: ['button'],
    relationships: ['button opens modal'],
    layout: 'single panel',
    summary: 'A UI screenshot.',
  });
  stageMocks.synthesizeImageToPromptContext.mockReturnValue('Image context block');
  stageMocks.buildMultimodalPrompt.mockReturnValue({
    finalPrompt: 'multimodal prompt',
    includeImageInPayload: true,
  });
  stageMocks.injectFactFlags.mockReturnValue('fact-flagged prompt');
  stageMocks.triggerCitationRequests.mockReturnValue('citation prompt');
  stageMocks.assemblePayload.mockReturnValue({
    model: ModelTarget.GPT4O,
    prompt: 'payload prompt',
    maxTokens: 1200,
  });
  stageMocks.execute.mockResolvedValue({
    response: 'model response',
    executionTimeMs: 42,
  });
}

describe('pipeline stages', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seedStageMocks();
  });

  it('wraps stage helper results and failures', async () => {
    expect(ok('ready')).toEqual({ ok: true, data: 'ready' });
    expect(fail('not ready')).toEqual({ ok: false, error: 'not ready' });
    expect(requireContext('value', 'Field')).toBe('value');
    expect(() => requireContext(null, 'Field')).toThrow(
      'Field is required before this pipeline stage can run.',
    );
    await expect(runStage(() => 'done')).resolves.toEqual({ ok: true, data: 'done' });
    await expect(runStage(() => {
      throw new Error('stage broke');
    })).resolves.toEqual({ ok: false, error: 'stage broke' });
  });

  it('runs the text-enrichment stages in order', async () => {
    const ctx = createContext();

    await expect(runStageClassifyIntent(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageMatchTemplate(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageInjectContext(ctx)).resolves.toMatchObject({ data: 'context prompt' });
    await expect(runStageFillSlots(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageNeutralizeAmbiguity(ctx)).resolves.toMatchObject({
      data: 'neutral prompt',
    });
    await expect(runStageEnforceOutputFormat(ctx)).resolves.toMatchObject({
      data: 'formatted prompt',
    });

    expect(ctx.intent).toEqual(TEST_INTENT);
    expect(ctx.template).toEqual(TEST_TEMPLATE);
    expect(ctx.matchBadge).toBe('Template matched directly');
    expect(ctx.workingPrompt).toBe('formatted prompt');
    expect(ctx.slotMappings).toHaveLength(1);
  });

  it('runs clarification, persona, session, model, and complexity stages', async () => {
    const ctx = createContext({
      intent: TEST_INTENT,
      workingPrompt: 'formatted prompt',
    });

    await expect(runStageDetectGaps(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageGenerateClarifications(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageInjectPersona(ctx)).resolves.toMatchObject({ data: 'persona prompt' });
    await expect(runStageBuildSessionMemory(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageAdaptForModel(ctx)).resolves.toMatchObject({ data: 'adapted prompt' });
    await expect(runStageScoreComplexity(ctx)).resolves.toMatchObject({ ok: true });

    expect(ctx.knowledgeGaps).toHaveLength(1);
    expect(ctx.clarificationQuestions?.[0]?.id).toBe('enhanced-q1');
    expect(ctx.sessionMemoryResult?.updatedNodes).toEqual([TEST_SESSION_NODE]);
    expect(ctx.complexityScore?.delta).toBe(5);
  });

  it('runs safety and trust stages', async () => {
    const ctx = createContext({
      intent: TEST_INTENT,
      workingPrompt: 'formatted prompt',
    });

    await expect(runStageScanPii(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageCommandGate(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageScopeConfirmation(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageInjectFactFlags(ctx)).resolves.toMatchObject({
      data: 'fact-flagged prompt',
    });
    await expect(runStageRequestCitations(ctx)).resolves.toMatchObject({
      data: 'citation prompt',
    });

    expect(ctx.workingPrompt).toBe('citation prompt');
    expect(ctx.piiRedactions).toEqual([{ type: 'email', count: 1 }]);
    expect(ctx.commandGateResult?.requiresConfirmation).toBe(true);
    expect(ctx.scopeConfirmationResult?.options).toContain('[A] current view');
  });

  it('skips and runs image processing based on input image data', async () => {
    const textOnlyContext = createContext({ workingPrompt: 'formatted prompt' });

    await expect(runStageProcessImage(textOnlyContext)).resolves.toMatchObject({
      data: {
        finalPrompt: 'formatted prompt',
        includeImageInPayload: false,
      },
    });
    expect(textOnlyContext.includeImageInPayload).toBe(false);

    const imageContext = createContext({
      input: {
        rawInput: 'Explain this screenshot.',
        imageData: 'data:image/png;base64,abc123',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'image-session',
      },
      workingPrompt: 'formatted prompt',
      sessionMemoryResult: {
        relevantContext: 'prior UI context',
        updatedNodes: [TEST_SESSION_NODE],
      },
    });

    await expect(runStageProcessImage(imageContext)).resolves.toMatchObject({
      data: {
        finalPrompt: 'multimodal prompt',
        includeImageInPayload: true,
      },
    });

    expect(stageMocks.classifyVisualContent).toHaveBeenCalledWith({
      imageData: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
    });
    expect(stageMocks.buildMultimodalPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        personaContext: expect.stringContaining('software engineer'),
        sessionContext: 'prior UI context',
        supportsMultimodal: true,
      }),
    );
    expect(imageContext.workingPrompt).toBe('multimodal prompt');
    expect(imageContext.sessionContext).toBe('Image context block');
  });

  it('assembles payloads and executes the selected model', async () => {
    const ensureReady = vi.fn().mockResolvedValue(undefined);
    const ctx = createContext({
      apiKeyManager: { ensureReady },
      intent: TEST_INTENT,
      template: TEST_TEMPLATE,
      workingPrompt: 'final prompt',
      complexityScore: {
        raw: 3,
        enriched: 8,
        delta: 5,
        breakdown: {},
      },
      includeImageInPayload: true,
      input: {
        rawInput: 'Explain this screenshot.',
        imageData: 'data:image/png;base64,abc123',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'payload-session',
      },
      matchZone: 'DIRECT',
      matchScore: 0.92,
      matchBadge: 'Template matched directly',
      result: {
        enrichedPrompt: 'final prompt',
        rawResponse: '',
        processedResponse: '',
        intent: TEST_INTENT,
        template: TEST_TEMPLATE,
        complexityScore: {
          raw: 3,
          enriched: 8,
          delta: 5,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.MEDIUM,
        citationList: [],
        executionTimeMs: 0,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.92,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
        model: ModelTarget.GPT4O,
      },
    });

    await expect(runStageAssemblePayload(ctx)).resolves.toMatchObject({ ok: true });
    await expect(runStageExecuteModel(ctx)).resolves.toMatchObject({
      data: {
        response: 'model response',
        executionTimeMs: 42,
      },
    });

    expect(ctx.payload).toMatchObject({
      model: ModelTarget.GPT4O,
      prompt: 'payload prompt',
      imageData: 'data:image/png;base64,abc123',
    });
    expect(ensureReady).toHaveBeenCalledWith(ModelTarget.GPT4O);
    expect(ctx.executionResult?.response).toBe('model response');
  });

  it('assembles a default pipeline result when no result exists yet', async () => {
    const ctx = createContext({
      intent: TEST_INTENT,
      template: TEST_TEMPLATE,
      workingPrompt: 'final prompt',
      complexityScore: {
        raw: 2,
        enriched: 7,
        delta: 5,
        breakdown: {},
      },
      piiRedactions: [{ type: 'email', count: 1 }],
      slotMappings: [{ key: 'task', value: 'fix test', source: 'rawInput' }],
      matchZone: 'GENERATE',
      matchScore: 0.45,
      matchBadge: 'New template generated and saved',
      isNewTemplate: true,
    });

    await expect(runStageAssemblePayload(ctx)).resolves.toMatchObject({ ok: true });

    expect(ctx.result).toMatchObject({
      enrichedPrompt: 'final prompt',
      rawResponse: '',
      processedResponse: '',
      confidenceLevel: ConfidenceLevel.LOW,
      piiRedactions: [{ type: 'email', count: 1 }],
      matchZone: 'GENERATE',
      matchScore: 0.45,
      isNewTemplate: true,
      model: ModelTarget.GPT4O,
    });
    expect(stageMocks.assemblePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichedPrompt: 'final prompt',
        slotMappings: [{ key: 'task', value: 'fix test', source: 'rawInput' }],
      }),
      ModelTarget.GPT4O,
    );
  });

  it('reports missing prerequisites as stage failures', async () => {
    await expect(runStageInjectContext(createContext())).resolves.toMatchObject({
      ok: false,
      error: 'Selected template is required before this pipeline stage can run.',
    });
    await expect(runStageExecuteModel(createContext())).resolves.toMatchObject({
      ok: false,
      error: 'API payload is required before this pipeline stage can run.',
    });
  });
});
