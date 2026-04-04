import {
  type ClarificationQuestion,
  type ClarificationResponse,
  ConfidenceLevel,
  IntentType,
  ModelTarget,
  type AppSettings,
  type MatchZone,
  type Persona,
  type PipelineInput,
  type PipelineResult,
  type PipelineStageId,
  type PipelineStatus,
  type PromptTemplate,
  type SessionNode,
} from '../types';
import { DEFAULT_PERSONAS } from '../config/defaults';
import { neutralizeAmbiguity } from './layer1/ambiguityNeutralizer';
import { injectContext } from './layer1/contextInjector';
import { classifyIntent } from './layer1/intentClassifier';
import { enforceOutputFormat } from './layer1/outputFormatEnforcer';
import { fillTemplateSlots } from './layer1/slotFiller';
import { adaptTemplate, generateTemplate } from './layer1/templateGenerator';
import { getAllTemplates, getTopMatch } from './layer1/templateMatcher';
import { detectKnowledgeGaps } from './layer2/knowledgeGapDetector';
import { generateEnhancedClarificationSet } from './layer2/enhancedClarificationEngine';
import { adaptPromptForModel } from './layer2/modelAwareAdapter';
import { injectPersonaContext } from './layer2/personaInjector';
import { scorePromptComplexity } from './layer2/promptComplexityScorer';
import { buildSessionMemoryGraph } from './layer2/sessionMemoryGraph';
import { evaluateCommandGate } from './layer3/commandGate';
import { scanForPii } from './layer3/piiScanner';
import { evaluateScopeConfirmation } from './layer3/scopeConfirmation';
import { synthesizeImageToPromptContext } from './layer4/imageToPromptSynthesizer';
import { buildMultimodalPrompt } from './layer4/multimodalPromptBuilder';
import { mapObjectRelationships } from './layer4/objectRelationshipMapper';
import { extractOcrText } from './layer4/ocrTextExtractor';
import { classifyVisualContent } from './layer4/visualContentClassifier';
import { extractConfidenceLevel } from './layer5/confidenceLevelExtractor';
import { triggerCitationRequests } from './layer5/citationRequestTrigger';
import { injectFactFlags } from './layer5/factFlagInjector';
import { highlightUnverifiableClaims } from './layer5/unverifiableClaimHighlighter';
import { assemblePayload, execute as executePayload } from './layer6/executionEngine';

export interface ApiKeyManager {
  ensureReady(targetModel: ModelTarget): Promise<void>;
}

interface PipelineExecutorEvents {
  question: string;
  clarificationSet: ClarificationQuestion[];
  commandConfirmation: string;
  scopeSelection: string[];
  stage: PipelineStageId;
  status: PipelineStatus;
  error: Error;
  complete: PipelineResult;
}

type EventListener<T> = (payload: T) => void;

type PipelineExecutionMode = 'FULL' | 'ENHANCE_ONLY';

type PendingInteraction =
  | {
      kind: 'question';
      resolve: (answer: string) => void;
    }
  | {
      kind: 'clarificationSet';
      resolve: (responses: ClarificationResponse[]) => void;
    }
  | {
      kind: 'commandConfirmation';
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: 'scopeSelection';
      resolve: (selection: string) => void;
    };

export enum PipelineExecutorErrorCode {
  BUSY = 'BUSY',
  NO_PENDING_INTERACTION = 'NO_PENDING_INTERACTION',
  COMMAND_REJECTED = 'COMMAND_REJECTED',
  NO_TEMPLATE_MATCH = 'NO_TEMPLATE_MATCH',
}

export class PipelineExecutorError extends Error {
  code: PipelineExecutorErrorCode;
  cause?: unknown;

  /**
   * Creates a typed pipeline-executor error.
   */
  constructor(code: PipelineExecutorErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PipelineExecutorError';
    this.code = code;
    this.cause = cause;
  }
}

const DEFAULT_RESPONSE_QUALITY = 0.5;
const DEFAULT_IMAGE_MIME_TYPE = 'image/png';
const CITATION_PATTERN = /\[(?!VERIFIED|LIKELY|UNVERIFIED|NO_CITATION)([^\]\r\n]+)\]/g;
const MEDICAL_DISCLAIMER =
  '[MEDICAL DISCLAIMER: This is AI-generated information only, not medical advice.]';
const DIRECT_MATCH_BADGE = 'Template matched directly';
const PARTIAL_MATCH_BADGE = 'Template adapted from existing';
const GENERATED_TEMPLATE_BADGE = 'New template generated and saved';
const POSITIVE_CONFIRMATION_VALUES = new Set([
  'y',
  'yes',
  'true',
  'confirm',
  'confirmed',
  'approve',
  'approved',
  'ok',
  'okay',
  'continue',
  'proceed',
]);
const NEGATIVE_CONFIRMATION_VALUES = new Set([
  'n',
  'no',
  'false',
  'cancel',
  'cancelled',
  'deny',
  'denied',
  'reject',
  'rejected',
  'stop',
  'abort',
]);
const MULTIMODAL_MODEL_TARGETS = new Set<ModelTarget>([
  ModelTarget.GPT4O,
  ModelTarget.CLAUDE,
  ModelTarget.GEMINI,
]);

class TypedEventEmitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<EventListener<Events[keyof Events]>>>();

  /**
   * Registers an event listener and returns an unsubscribe function.
   */
  on<K extends keyof Events>(eventName: K, listener: EventListener<Events[K]>): () => void {
    const existingListeners =
      this.listeners.get(eventName) ?? new Set<EventListener<Events[keyof Events]>>();

    existingListeners.add(listener as EventListener<Events[keyof Events]>);
    this.listeners.set(eventName, existingListeners);

    return () => {
      this.off(eventName, listener);
    };
  }

  /**
   * Removes a previously registered event listener.
   */
  off<K extends keyof Events>(eventName: K, listener: EventListener<Events[K]>): void {
    const existingListeners = this.listeners.get(eventName);

    if (!existingListeners) {
      return;
    }

    existingListeners.delete(listener as EventListener<Events[keyof Events]>);

    if (existingListeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  /**
   * Registers a one-time event listener.
   */
  once<K extends keyof Events>(eventName: K, listener: EventListener<Events[K]>): () => void {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      listener(payload);
    });

    return unsubscribe;
  }

  /**
   * Emits a typed event to all registered listeners.
   */
  protected emit<K extends keyof Events>(eventName: K, payload: Events[K]): void {
    const existingListeners = this.listeners.get(eventName);

    if (!existingListeners) {
      return;
    }

    [...existingListeners].forEach((listener) => {
      (listener as EventListener<Events[K]>)(payload);
    });
  }
}

function createPromptId(sessionId: string): string {
  const generatedId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${sessionId}-${generatedId}`;
}

function truncate(value: string, maxLength: number): string {
  const normalizedValue = value.replace(/\s+/g, ' ').trim();
  return normalizedValue.length <= maxLength
    ? normalizedValue
    : `${normalizedValue.slice(0, Math.max(0, maxLength - 3))}...`;
}

function appendBlock(base: string, heading: string, content: string): string {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return base.trim();
  }

  return `${base.trim()}\n\n${heading}:\n${normalizedContent}`.trim();
}

function formatClarificationResponses(
  questions: ClarificationQuestion[],
  responses: ClarificationResponse[],
): string {
  const responsesByQuestionId = new Map(
    responses.map((response) => [response.questionId, response]),
  );

  return questions
    .map((question) => {
      const response = responsesByQuestionId.get(question.id);
      const answer = response?.answer.trim() || question.defaultAnswer;
      const answerSuffix = response?.usedDefault ? ' (default applied)' : '';

      return `Question: ${question.prompt}\nAnswer: ${answer}${answerSuffix}`;
    })
    .join('\n\n');
}

function prependMedicalDisclaimer(prompt: string): string {
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.startsWith(MEDICAL_DISCLAIMER)) {
    return trimmedPrompt;
  }

  return `${MEDICAL_DISCLAIMER}\n\n${trimmedPrompt}`;
}

function buildPersonaContextBlock(persona: Persona | null): string {
  if (!persona) {
    return '';
  }

  const expertise =
    persona.expertise.length > 0 ? persona.expertise.join(', ') : 'general problem solving';

  return `You are assisting ${persona.role} with expertise in ${expertise}. Domain context: ${persona.domainContext}. Respond in ${persona.preferredStyle} style.`;
}

function inferImageMimeType(imageData: string): string {
  const dataUrlMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return dataUrlMatch?.[1] ?? DEFAULT_IMAGE_MIME_TYPE;
}

function shouldRunLayer4Module(suggestedPipeline: string[], moduleName: string): boolean {
  return suggestedPipeline.includes(moduleName);
}

function buildMatchBadge(zone: MatchZone): string {
  switch (zone) {
    case 'DIRECT':
      return DIRECT_MATCH_BADGE;
    case 'PARTIAL':
      return PARTIAL_MATCH_BADGE;
    case 'GENERATE':
      return GENERATED_TEMPLATE_BADGE;
    default: {
      const unreachableZone: never = zone;
      return unreachableZone;
    }
  }
}

function extractCitations(rawResponse: string): string[] {
  const citationPattern = new RegExp(CITATION_PATTERN.source, CITATION_PATTERN.flags);

  return [...new Set([...rawResponse.matchAll(citationPattern)].map((match) => `[${match[1]}]`))];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapConfidenceToResponseQuality(level: ConfidenceLevel): number {
  switch (level) {
    case ConfidenceLevel.HIGH:
      return 0.9;
    case ConfidenceLevel.MEDIUM:
      return 0.7;
    case ConfidenceLevel.LOW:
    default:
      return 0.45;
  }
}

function toExecutorError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error('An unknown pipeline execution error occurred.');
}

function parseConfirmationAnswer(answer: string): boolean {
  const normalizedAnswer = answer.trim().toLowerCase();

  if (POSITIVE_CONFIRMATION_VALUES.has(normalizedAnswer)) {
    return true;
  }

  if (NEGATIVE_CONFIRMATION_VALUES.has(normalizedAnswer)) {
    return false;
  }

  return normalizedAnswer.length > 0;
}

/**
 * Executes the PromptBridge pipeline by wiring together the seven enrichment and execution layers.
 */
class PipelineExecutor extends TypedEventEmitter<PipelineExecutorEvents> {
  private settings: AppSettings;
  private apiKeyManager: ApiKeyManager;
  private status: PipelineStatus = 'IDLE';
  private stage: PipelineStageId = 'IDLE';
  private pendingInteraction: PendingInteraction | null = null;
  private sessionMemory = new Map<string, SessionNode[]>();
  private personas: Persona[] = DEFAULT_PERSONAS.map((persona) => ({
    ...persona,
    expertise: [...persona.expertise],
  }));
  private templateLibrary: PromptTemplate[] | null = null;

  /**
   * Creates a pipeline executor configured with app settings and an API-key readiness manager.
   */
  constructor(settings: AppSettings, apiKeyManager: ApiKeyManager) {
    super();
    this.settings = { ...settings };
    this.apiKeyManager = apiKeyManager;
  }

  /**
   * Returns the executor's current lifecycle status.
   */
  getStatus(): PipelineStatus {
    return this.status;
  }

  /**
   * Returns the executor's current non-localized pipeline stage identifier.
   */
  getStage(): PipelineStageId {
    return this.stage;
  }

  /**
   * Updates executor settings used by future pipeline runs.
   */
  setSettings(settings: AppSettings): void {
    this.settings = { ...settings };
  }

  /**
   * Updates the persona library used for future executions.
   */
  setPersonas(personas: Persona[]): void {
    this.personas = personas.length > 0
      ? personas.map((persona) => ({
          ...persona,
          expertise: [...persona.expertise],
        }))
      : DEFAULT_PERSONAS.map((persona) => ({
          ...persona,
          expertise: [...persona.expertise],
        }));
  }

  /**
   * Updates the template library used for future executions.
   */
  setTemplateLibrary(templates: PromptTemplate[]): void {
    this.templateLibrary = templates.length > 0
      ? templates.map((template) => ({
          ...template,
          tags: [...template.tags],
          ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
        }))
      : null;
  }

  /**
   * Returns a defensive copy of the stored session nodes for a session identifier.
   */
  getSessionNodesForSession(sessionId: string): SessionNode[] {
    return this.getSessionNodes(sessionId);
  }

  /**
   * Replaces the stored session nodes for a session identifier with a defensive copy.
   */
  replaceSessionNodes(sessionId: string, sessionNodes: SessionNode[]): void {
    this.sessionMemory.set(
      sessionId,
      sessionNodes.map((node) => ({
        ...node,
        keyEntities: [...node.keyEntities],
      })),
    );
  }

  /**
   * Accepts user-provided input for the currently paused pipeline step.
   */
  resumeWithAnswer(answer: string): void {
    if (!this.pendingInteraction) {
      throw new PipelineExecutorError(
        PipelineExecutorErrorCode.NO_PENDING_INTERACTION,
        'There is no paused pipeline step waiting for user input.',
      );
    }

    const pendingInteraction = this.pendingInteraction;
    this.pendingInteraction = null;
    this.updateStatus('RUNNING');

    switch (pendingInteraction.kind) {
      case 'question':
        pendingInteraction.resolve(answer);
        return;
      case 'clarificationSet':
        this.pendingInteraction = pendingInteraction;
        this.updateStatus('WAITING_FOR_INPUT');
        throw new PipelineExecutorError(
          PipelineExecutorErrorCode.NO_PENDING_INTERACTION,
          'Use resumeWithClarificationSet() for Enhanced Mode clarification answers.',
        );
      case 'commandConfirmation':
        pendingInteraction.resolve(parseConfirmationAnswer(answer));
        return;
      case 'scopeSelection':
        pendingInteraction.resolve(answer.trim());
        return;
      default: {
        const unreachableInteraction: never = pendingInteraction;
        throw unreachableInteraction;
      }
    }
  }

  /**
   * Accepts a set of clarification answers for the Enhanced Mode question flow.
   */
  resumeWithClarificationSet(responses: ClarificationResponse[]): void {
    if (!this.pendingInteraction || this.pendingInteraction.kind !== 'clarificationSet') {
      throw new PipelineExecutorError(
        PipelineExecutorErrorCode.NO_PENDING_INTERACTION,
        'There is no enhanced clarification step waiting for answers.',
      );
    }

    const pendingInteraction = this.pendingInteraction;
    this.pendingInteraction = null;
    this.updateStatus('RUNNING');
    pendingInteraction.resolve(
      responses.map((response) => ({
        ...response,
        answer: response.answer.trim(),
      })),
    );
  }

  /**
   * Emits a clarification question and waits for the popup or caller to resume the pipeline with an answer.
   */
  async pauseForQuestion(question: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.assertNoPendingInteraction();
      this.updateStage('AWAITING_MICRO_QUESTION');
      this.pendingInteraction = {
        kind: 'question',
        resolve,
      };
      this.updateStatus('WAITING_FOR_INPUT');
      this.emit('question', question);
    });
  }

  /**
   * Emits a three-question clarification set and waits for the caller to answer it.
   */
  async pauseForClarificationSet(
    questions: ClarificationQuestion[],
  ): Promise<ClarificationResponse[]> {
    return new Promise<ClarificationResponse[]>((resolve) => {
      this.assertNoPendingInteraction();
      this.updateStage('AWAITING_ENHANCED_CLARIFICATION');
      this.pendingInteraction = {
        kind: 'clarificationSet',
        resolve,
      };
      this.updateStatus('WAITING_FOR_INPUT');
      this.emit(
        'clarificationSet',
        questions.map((question) => ({
          ...question,
        })),
      );
    });
  }

  /**
   * Emits a command-preview confirmation request and waits for the caller to approve or reject it.
   */
  async pauseForCommandConfirmation(preview: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.assertNoPendingInteraction();
      this.updateStage('AWAITING_COMMAND_CONFIRMATION');
      this.pendingInteraction = {
        kind: 'commandConfirmation',
        resolve,
      };
      this.updateStatus('WAITING_FOR_CONFIRMATION');
      this.emit('commandConfirmation', preview);
    });
  }

  /**
   * Emits scope options for potentially broad operations and waits for the caller to choose one.
   */
  async pauseForScopeSelection(options: string[]): Promise<string> {
    return new Promise<string>((resolve) => {
      this.assertNoPendingInteraction();
      this.updateStage('AWAITING_SCOPE_CONFIRMATION');
      this.pendingInteraction = {
        kind: 'scopeSelection',
        resolve,
      };
      this.updateStatus('WAITING_FOR_CONFIRMATION');
      this.emit('scopeSelection', [...options]);
    });
  }

  /**
   * Runs the full PromptBridge execution flow and returns the final enriched result.
   */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    return this.runExecution(input, undefined, 'FULL');
  }

  /**
   * Runs the enrichment pipeline without executing the final downstream model call.
   */
  async enhancePrompt(input: PipelineInput): Promise<PipelineResult> {
    return this.runExecution(input, undefined, 'ENHANCE_ONLY');
  }

  /**
   * Runs the full pipeline while forcing a specific template variant.
   */
  async executeWithTemplate(
    input: PipelineInput,
    templateOverride: PromptTemplate,
  ): Promise<PipelineResult> {
    return this.runExecution(input, templateOverride, 'FULL');
  }

  private async runExecution(
    input: PipelineInput,
    templateOverride?: PromptTemplate,
    mode: PipelineExecutionMode = 'FULL',
  ): Promise<PipelineResult> {
    this.assertPipelineCanStart();
    this.updateStage('PREPARING');
    this.updateStatus('RUNNING');

    try {
      const timestamp = new Date().toISOString();
      const promptId = createPromptId(input.sessionId);
      const existingSessionNodes = this.getSessionNodes(input.sessionId);
      const sessionSeed = this.buildSessionSeed(existingSessionNodes);
      this.updateStage('LAYER1_CLASSIFY_INTENT');
      const intent = classifyIntent(input.rawInput);
      this.updateStage('LAYER1_MATCH_TEMPLATE');
      const templateRetrievalContext = this.buildTemplateRetrievalContext(
        input.rawInput,
        intent.intent,
        existingSessionNodes,
      );
      const templateSearchInput = this.buildTemplateSearchInput(
        input.rawInput,
        templateRetrievalContext,
      );
      const templateGenerationScanResult = scanForPii(templateSearchInput);
      let safeTemplateSearchInput = templateGenerationScanResult.sanitized;
      const preflightCommandGateResult = evaluateCommandGate(
        safeTemplateSearchInput,
        intent.intent,
      );
      let commandGateConfirmedEarly = false;
      let preselectedScope = '';

      if (preflightCommandGateResult.requiresGate) {
        const confirmed = await this.pauseForCommandConfirmation(
          preflightCommandGateResult.previewText,
        );

        if (!confirmed) {
          throw new PipelineExecutorError(
            PipelineExecutorErrorCode.COMMAND_REJECTED,
            'The command execution was rejected by the user.',
          );
        }

        commandGateConfirmedEarly = true;
      }

      const preflightScopeConfirmationResult = evaluateScopeConfirmation(safeTemplateSearchInput);

      if (preflightScopeConfirmationResult.requiresScopeConfirmation) {
        preselectedScope = await this.pauseForScopeSelection(
          preflightScopeConfirmationResult.scopeOptions,
        );
        safeTemplateSearchInput = appendBlock(
          safeTemplateSearchInput,
          'Selected Execution Scope',
          preselectedScope,
        );
      }

      const activeTemplateLibrary = await this.loadActiveTemplateLibrary();
      const topMatch = getTopMatch(
        intent,
        safeTemplateSearchInput,
        templateOverride ? [templateOverride, ...activeTemplateLibrary] : activeTemplateLibrary,
      );
      const fallbackTemplate = topMatch.template ?? this.requireTemplate(activeTemplateLibrary);
      let selectedTemplate = templateOverride ?? fallbackTemplate;
      let matchZone: MatchZone = templateOverride ? 'DIRECT' : topMatch.zone;
      const matchScore = templateOverride ? 1 : topMatch.score;
      let matchBadge = buildMatchBadge(matchZone);
      let isNewTemplate = false;

      if (!templateOverride) {
        if (topMatch.zone === 'PARTIAL') {
          try {
            selectedTemplate = await adaptTemplate(
              fallbackTemplate,
              safeTemplateSearchInput,
              input.targetModel,
              templateRetrievalContext,
            );
            matchBadge = buildMatchBadge('PARTIAL');
            isNewTemplate = true;
            this.cacheTemplate(selectedTemplate, activeTemplateLibrary);
          } catch (error) {
            console.warn(
              '[PromptBridge][TemplateGenerator] Falling back to closest template after adaptation failure.',
              error,
            );
            selectedTemplate = fallbackTemplate;
            matchZone = 'DIRECT';
            matchBadge = buildMatchBadge('DIRECT');
            isNewTemplate = false;
          }
        } else if (topMatch.zone === 'GENERATE') {
          try {
            selectedTemplate = await generateTemplate(
              safeTemplateSearchInput,
              intent.intent,
              input.targetModel,
              templateRetrievalContext,
            );
            matchBadge = buildMatchBadge('GENERATE');
            isNewTemplate = true;
            this.cacheTemplate(selectedTemplate, activeTemplateLibrary);
          } catch (error) {
            console.warn(
              '[PromptBridge][TemplateGenerator] Falling back to closest template after generation failure.',
              error,
            );
            selectedTemplate = fallbackTemplate;
            matchZone = 'DIRECT';
            matchBadge = buildMatchBadge('DIRECT');
            isNewTemplate = false;
          }
        }
      }

      const persona = this.resolvePersona(input.personaId, intent.intent);

      this.updateStage('LAYER1_INJECT_CONTEXT');
      const contextInjectedTemplate = injectContext(
        selectedTemplate,
        persona,
        sessionSeed || input.rawInput,
      );
      this.updateStage('LAYER1_FILL_SLOTS');
      const slotFillResult = fillTemplateSlots(input.rawInput, selectedTemplate.template);
      this.updateStage('LAYER1_INJECT_CONTEXT');
      const slotCompletedTemplate = injectContext(
        {
          ...selectedTemplate,
          template: slotFillResult.filledTemplate,
        },
        persona,
        sessionSeed || input.rawInput,
      );

      let workingPrompt = slotCompletedTemplate || contextInjectedTemplate;
      this.updateStage('LAYER1_NEUTRALIZE_AMBIGUITY');
      workingPrompt = neutralizeAmbiguity(workingPrompt, sessionSeed || input.rawInput);
      this.updateStage('LAYER1_ENFORCE_OUTPUT_FORMAT');
      workingPrompt = enforceOutputFormat(workingPrompt, intent.intent);

      this.updateStage('LAYER2_DETECT_GAPS');
      const knowledgeGaps = detectKnowledgeGaps(workingPrompt);

      if (this.settings.enhancedModeEnabled) {
        this.updateStage('LAYER2_GENERATE_ENHANCED_QUESTIONS');
        const clarificationQuestions = await generateEnhancedClarificationSet({
          rawInput: safeTemplateSearchInput,
          intent: intent.intent,
          knowledgeGaps,
          sessionContext: templateRetrievalContext,
        });
        const clarificationResponses = await this.pauseForClarificationSet(clarificationQuestions);

        workingPrompt = appendBlock(
          workingPrompt,
          'Professional Context Answers',
          formatClarificationResponses(clarificationQuestions, clarificationResponses),
        );
      }

      this.updateStage('LAYER2_INJECT_PERSONA');
      const personaInjectedPrompt = injectPersonaContext(workingPrompt, persona);
      const sessionNode: SessionNode = {
        promptId,
        intent: intent.intent,
        keyEntities: [],
        timestamp,
        responseQuality: DEFAULT_RESPONSE_QUALITY,
        enrichedPrompt: personaInjectedPrompt,
        rawResponse: '',
      };
      this.updateStage('LAYER2_BUILD_SESSION_MEMORY');
      const sessionMemoryResult = buildSessionMemoryGraph(
        sessionNode,
        existingSessionNodes,
        this.settings.sessionMemoryDepth,
      );

      workingPrompt = sessionMemoryResult.relevantContext
        ? `${personaInjectedPrompt}\n\n${sessionMemoryResult.relevantContext}`
        : personaInjectedPrompt;

      if (intent.intent === IntentType.MEDICAL) {
        workingPrompt = prependMedicalDisclaimer(workingPrompt);
      }

      this.updateStage('LAYER2_ADAPT_MODEL');
      const modelAwarePreview = adaptPromptForModel(workingPrompt, input.targetModel);
      this.updateStage('LAYER2_SCORE_COMPLEXITY');
      const complexityScore = scorePromptComplexity({
        rawInput: input.rawInput,
        enrichedPrompt: modelAwarePreview,
      });

      this.updateStage('LAYER3_SCAN_PII');
      const piiScanResult = scanForPii(workingPrompt);
      workingPrompt = piiScanResult.sanitized;

      const commandGateResult = evaluateCommandGate(workingPrompt, intent.intent);

      if (!commandGateConfirmedEarly && commandGateResult.requiresGate) {
        const confirmed = await this.pauseForCommandConfirmation(
          commandGateResult.previewText,
        );

        if (!confirmed) {
          throw new PipelineExecutorError(
            PipelineExecutorErrorCode.COMMAND_REJECTED,
            'The command execution was rejected by the user.',
          );
        }
      }

      const scopeConfirmationResult = evaluateScopeConfirmation(workingPrompt);

      if (preselectedScope) {
        workingPrompt = appendBlock(
          workingPrompt,
          'Selected Execution Scope',
          preselectedScope,
        );
      } else if (scopeConfirmationResult.requiresScopeConfirmation) {
        const selectedScope = await this.pauseForScopeSelection(
          scopeConfirmationResult.scopeOptions,
        );

        workingPrompt = appendBlock(
          workingPrompt,
          'Selected Execution Scope',
          selectedScope,
        );
      }

      let includeImageInPayload = false;

      if (input.imageData) {
        this.updateStage('LAYER4_CLASSIFY_IMAGE');
        const visualContent = await classifyVisualContent({
          imageData: input.imageData,
          mimeType: inferImageMimeType(input.imageData),
        });
        let ocrResult:
          | Awaited<ReturnType<typeof extractOcrText>>
          | undefined;
        let mapResult:
          | Awaited<ReturnType<typeof mapObjectRelationships>>
          | undefined;

        if (shouldRunLayer4Module(visualContent.suggestedPipeline, 'ocrTextExtractor')) {
          this.updateStage('LAYER4_EXTRACT_IMAGE_TEXT');
          ocrResult = await extractOcrText({
            imageData: input.imageData,
            imageType: visualContent.type,
          });
        }

        if (shouldRunLayer4Module(visualContent.suggestedPipeline, 'objectRelationshipMapper')) {
          this.updateStage('LAYER4_MAP_IMAGE_RELATIONSHIPS');
          mapResult = await mapObjectRelationships({
            imageData: input.imageData,
            imageType: visualContent.type,
          });
        }

        this.updateStage('LAYER4_SYNTHESIZE_IMAGE_CONTEXT');
        const imageContextBlock = synthesizeImageToPromptContext({
          ocrResult,
          mapResult,
          imageType: visualContent.type,
        });
        this.updateStage('LAYER4_BUILD_MULTIMODAL_PROMPT');
        const multimodalPrompt = buildMultimodalPrompt({
          imageContextBlock,
          userText: input.rawInput,
          enrichedTemplate: workingPrompt,
          personaContext: buildPersonaContextBlock(persona),
          sessionContext: sessionMemoryResult.relevantContext,
          supportsMultimodal: MULTIMODAL_MODEL_TARGETS.has(input.targetModel),
        });

        workingPrompt = multimodalPrompt.finalPrompt;
        includeImageInPayload = multimodalPrompt.includeImageInPayload;
      }

      this.updateStage('LAYER5_INJECT_FACT_FLAGS');
      workingPrompt = injectFactFlags(workingPrompt, intent.intent);
      this.updateStage('LAYER5_REQUEST_CITATIONS');
      workingPrompt = triggerCitationRequests(workingPrompt, intent.intent);

      const pipelineState: PipelineResult = {
        enrichedPrompt: workingPrompt,
        rawResponse: '',
        processedResponse: '',
        intent,
        template: selectedTemplate,
        complexityScore,
        piiRedactions: piiScanResult.redactions,
        confidenceLevel: ConfidenceLevel.LOW,
        citationList: [],
        executionTimeMs: 0,
        slotMappings: slotFillResult.slotMappings,
        matchZone,
        matchScore,
        matchBadge,
        isNewTemplate,
      };

      if (mode === 'ENHANCE_ONLY') {
        const enrichedSessionNode: SessionNode = {
          ...sessionNode,
          enrichedPrompt: workingPrompt,
          rawResponse: '',
          responseQuality: DEFAULT_RESPONSE_QUALITY,
        };
        const enrichedSessionMemory = buildSessionMemoryGraph(
          enrichedSessionNode,
          sessionMemoryResult.updatedNodes.filter((node) => node.promptId !== promptId),
          this.settings.sessionMemoryDepth,
        );

        this.sessionMemory.set(input.sessionId, enrichedSessionMemory.updatedNodes);
        this.updateStage('COMPLETE');
        this.updateStatus('COMPLETE');
        this.emit('complete', pipelineState);

        return pipelineState;
      }

      this.updateStage('LAYER6_ASSEMBLE_PAYLOAD');
      const payload = assemblePayload(pipelineState, input.targetModel);

      if (includeImageInPayload && input.imageData) {
        payload.imageData = input.imageData;
      }

      await this.apiKeyManager.ensureReady(input.targetModel);

      this.updateStage('LAYER6_EXECUTE_MODEL');
      const executionResult = await executePayload(payload);
      this.updateStage('LAYER5_POSTPROCESS_RESPONSE');
      const confidenceExtraction = extractConfidenceLevel(executionResult.response);
      const highlightedClaims = highlightUnverifiableClaims(executionResult.response);
      const processedResponse = confidenceExtraction.warningMessage
        ? `<p class="pb-confidence-warning">${escapeHtml(
            confidenceExtraction.warningMessage,
          )}</p>${highlightedClaims.processedHtml}`
        : highlightedClaims.processedHtml;

      const finalizedSessionNode: SessionNode = {
        ...sessionNode,
        enrichedPrompt: workingPrompt,
        rawResponse: executionResult.response,
        responseQuality: mapConfidenceToResponseQuality(confidenceExtraction.level),
      };
      const finalizedSessionMemory = buildSessionMemoryGraph(
        finalizedSessionNode,
        sessionMemoryResult.updatedNodes.filter((node) => node.promptId !== promptId),
        this.settings.sessionMemoryDepth,
      );

      this.sessionMemory.set(input.sessionId, finalizedSessionMemory.updatedNodes);

      const result: PipelineResult = {
        enrichedPrompt: workingPrompt,
        rawResponse: executionResult.response,
        processedResponse,
        intent,
        template: selectedTemplate,
        complexityScore,
        piiRedactions: piiScanResult.redactions,
        confidenceLevel: confidenceExtraction.level,
        citationList: extractCitations(executionResult.response),
        executionTimeMs: executionResult.executionTimeMs,
        slotMappings: slotFillResult.slotMappings,
        matchZone,
        matchScore,
        matchBadge,
        isNewTemplate,
      };

      this.updateStage('COMPLETE');
      this.updateStatus('COMPLETE');
      this.emit('complete', result);

      return result;
    } catch (error) {
      const executorError = toExecutorError(error);
      this.updateStage('ERROR');
      this.updateStatus('ERROR');
      this.emit('error', executorError);
      throw executorError;
    }
  }

  private updateStage(stage: PipelineStageId): void {
    this.stage = stage;
    this.emit('stage', stage);
  }

  private updateStatus(status: PipelineStatus): void {
    this.status = status;
    this.emit('status', status);
  }

  private assertNoPendingInteraction(): void {
    if (this.pendingInteraction) {
      throw new PipelineExecutorError(
        PipelineExecutorErrorCode.BUSY,
        'Another pipeline interaction is already waiting for user input.',
      );
    }
  }

  private assertPipelineCanStart(): void {
    if (this.status === 'RUNNING' || this.pendingInteraction) {
      throw new PipelineExecutorError(
        PipelineExecutorErrorCode.BUSY,
        'The pipeline is already running or waiting for user input.',
      );
    }
  }

  private resolvePersona(personaId: string | undefined, targetIntent: IntentType): Persona {
    const explicitPersonaId = personaId ?? this.settings.activePersonaId;
    const matchedPersona = this.personas.find((persona) => persona.id === explicitPersonaId);

    if (matchedPersona) {
      return {
        ...matchedPersona,
        expertise: [...matchedPersona.expertise],
      };
    }

    const fallbackPersona =
      targetIntent === IntentType.CODING
        ? this.personas[1] ?? DEFAULT_PERSONAS[1]
        : targetIntent === IntentType.RESEARCH ||
            targetIntent === IntentType.MEDICAL ||
            targetIntent === IntentType.LEGAL
          ? this.personas[2] ?? DEFAULT_PERSONAS[2]
          : targetIntent === IntentType.COMMAND_SYSTEM ||
              targetIntent === IntentType.COMMAND_DATA
            ? this.personas[3] ?? DEFAULT_PERSONAS[3]
            : this.personas[0] ?? DEFAULT_PERSONAS[0];

    return {
      ...fallbackPersona,
      expertise: [...fallbackPersona.expertise],
    };
  }

  private requireTemplate(templates: PromptTemplate[]): PromptTemplate {
    const selectedTemplate = templates[0];

    if (!selectedTemplate) {
      throw new PipelineExecutorError(
        PipelineExecutorErrorCode.NO_TEMPLATE_MATCH,
        'No matching prompt template was available for the current request.',
      );
    }

    return selectedTemplate;
  }

  private buildSessionSeed(existingNodes: SessionNode[]): string {
    if (existingNodes.length === 0) {
      return '';
    }

    return [
      'Prior session references:',
      ...existingNodes.slice(0, Math.max(1, this.settings.sessionMemoryDepth)).map((node) => {
        return `- ${node.intent} (${node.timestamp}): ${truncate(node.enrichedPrompt, 140)}`;
      }),
    ].join('\n');
  }

  private buildTemplateSearchInput(rawInput: string, templateRetrievalContext: string): string {
    const normalizedTemplateRetrievalContext = templateRetrievalContext.trim();

    if (!normalizedTemplateRetrievalContext) {
      return rawInput;
    }

    return `${rawInput}\n\n${normalizedTemplateRetrievalContext}`;
  }

  private buildTemplateRetrievalContext(
    rawInput: string,
    intent: IntentType,
    existingNodes: SessionNode[],
  ): string {
    if (existingNodes.length === 0) {
      return '';
    }

    const provisionalNode: SessionNode = {
      promptId: `template-retrieval-${Date.now().toString()}`,
      intent,
      keyEntities: [],
      timestamp: new Date().toISOString(),
      responseQuality: DEFAULT_RESPONSE_QUALITY,
      enrichedPrompt: rawInput,
      rawResponse: '',
    };
    const relevantGraphContext = buildSessionMemoryGraph(
      provisionalNode,
      existingNodes,
      this.settings.sessionMemoryDepth,
    ).relevantContext;
    const recentTurns = existingNodes.slice(0, 3).map((node) => {
      const priorResponse = node.rawResponse.trim()
        ? ` | Prior response: ${truncate(node.rawResponse, 120)}`
        : '';

      return `- [${node.timestamp}] ${node.intent}: Prior prompt: ${truncate(
        node.enrichedPrompt,
        140,
      )}${priorResponse}`;
    });

    return [relevantGraphContext, recentTurns.length > 0 ? `Recent same-session turns:\n${recentTurns.join('\n')}` : '']
      .filter((entry) => entry.trim().length > 0)
      .join('\n\n');
  }

  private async loadActiveTemplateLibrary(): Promise<PromptTemplate[]> {
    if (this.templateLibrary && this.templateLibrary.length > 0) {
      return this.templateLibrary.map((template) => ({
        ...template,
        tags: [...template.tags],
        ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
      }));
    }

    return getAllTemplates();
  }

  private cacheTemplate(
    template: PromptTemplate,
    currentTemplateLibrary: PromptTemplate[],
  ): void {
    const nextTemplateLibrary = [
      {
        ...template,
        tags: [...template.tags],
        ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
      },
      ...currentTemplateLibrary.filter((entry) => entry.id !== template.id).map((entry) => ({
        ...entry,
        tags: [...entry.tags],
        ...(entry.tfIdfVector ? { tfIdfVector: [...entry.tfIdfVector] } : {}),
      })),
    ];

    this.templateLibrary = nextTemplateLibrary;
  }

  private getSessionNodes(sessionId: string): SessionNode[] {
    const sessionNodes = this.sessionMemory.get(sessionId) ?? [];

    return sessionNodes.map((node) => ({
      ...node,
      keyEntities: [...node.keyEntities],
    }));
  }
}

export default PipelineExecutor;
