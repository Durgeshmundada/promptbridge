import type {
  ApiPayload,
  AppSettings,
  ClarificationQuestion,
  ComplexityScore,
  IntentClassification,
  KnowledgeGap,
  MatchZone,
  Persona,
  PipelineInput,
  PipelineResult,
  PIIRedaction,
  PromptTemplate,
  SessionNode,
  StageResult,
  TemplateSlot,
} from '../../types';
import type { CommandGateResult } from '../layer3/commandGate';
import type { ScopeConfirmationResult } from '../layer3/scopeConfirmation';
import type { MatchResult } from '../layer1/templateMatcher';

export type PipelineExecutionMode = 'FULL' | 'ENHANCE_ONLY';

export interface PipelineStageApiKeyManager {
  ensureReady(targetModel: PipelineInput['targetModel']): Promise<void>;
}

export interface PipelineContext {
  input: PipelineInput;
  settings: AppSettings;
  apiKeyManager?: PipelineStageApiKeyManager;
  mode?: PipelineExecutionMode;
  timestamp?: string;
  promptId?: string;
  templateOverride?: PromptTemplate;
  existingSessionNodes?: SessionNode[];
  templateLibrary?: PromptTemplate[];
  templateSearchInput?: string;
  templateRetrievalContext?: string;
  sessionContext?: string;
  intent?: IntentClassification;
  topMatch?: MatchResult;
  template?: PromptTemplate;
  matchZone?: MatchZone;
  matchScore?: number;
  matchBadge?: string;
  isNewTemplate?: boolean;
  persona?: Persona | null;
  workingPrompt?: string;
  slotMappings?: TemplateSlot[];
  knowledgeGaps?: KnowledgeGap[];
  clarificationQuestions?: ClarificationQuestion[];
  complexityScore?: ComplexityScore;
  piiRedactions?: PIIRedaction[];
  commandGateResult?: CommandGateResult;
  scopeConfirmationResult?: ScopeConfirmationResult;
  selectedScope?: string;
  sessionMemoryResult?: { relevantContext: string; updatedNodes: SessionNode[] };
  includeImageInPayload?: boolean;
  payload?: ApiPayload;
  executionResult?: { response: string; executionTimeMs: number };
  result?: PipelineResult;
}

export function ok<T>(data: T): StageResult<T> {
  return { ok: true, data };
}

export function fail(error: string): StageResult<never> {
  return { ok: false, error };
}

export function requireContext<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${label} is required before this pipeline stage can run.`);
  }

  return value;
}

export async function runStage<T>(operation: () => T | Promise<T>): Promise<StageResult<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Pipeline stage failed.');
  }
}
