/**
 * Canonical intent labels assigned during PromptBridge prompt analysis.
 */
export enum IntentType {
  CODING = 'CODING',
  CREATIVE = 'CREATIVE',
  DATA_ANALYSIS = 'DATA_ANALYSIS',
  QUESTION_FACTUAL = 'QUESTION_FACTUAL',
  QUESTION_CONCEPTUAL = 'QUESTION_CONCEPTUAL',
  COMMAND_SYSTEM = 'COMMAND_SYSTEM',
  COMMAND_DATA = 'COMMAND_DATA',
  RESEARCH = 'RESEARCH',
  MEDICAL = 'MEDICAL',
  LEGAL = 'LEGAL',
  GENERAL = 'GENERAL',
}

/**
 * Supported routing destinations for model-specific prompt delivery.
 */
export enum ModelTarget {
  GROQ = 'GROQ',
  GPT4O = 'GPT4O',
  CLAUDE = 'CLAUDE',
  GEMINI = 'GEMINI',
  LLAMA = 'LLAMA',
  CUSTOM = 'CUSTOM',
}

/**
 * Priority levels used when describing missing context or unresolved knowledge gaps.
 */
export enum GapSeverity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Classification values used for image-aware prompt enrichment and OCR handling.
 */
export enum ImageType {
  DIAGRAM = 'DIAGRAM',
  SCREENSHOT_UI = 'SCREENSHOT_UI',
  SCREENSHOT_CODE = 'SCREENSHOT_CODE',
  DOCUMENT = 'DOCUMENT',
  PHOTOGRAPH = 'PHOTOGRAPH',
  CHART_GRAPH = 'CHART_GRAPH',
  HANDWRITING = 'HANDWRITING',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Confidence bands used across classification, enrichment, and history records.
 */
export enum ConfidenceLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Supported binary rating values for post-response prompt feedback.
 */
export enum RatingValue {
  THUMBS_UP = 'THUMBS_UP',
  THUMBS_DOWN = 'THUMBS_DOWN',
}

/**
 * Available theme preferences for PromptBridge extension pages.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Stable, non-user-facing pipeline stage identifiers used by the popup UI.
 */
export type PipelineStageId =
  | 'IDLE'
  | 'PREPARING'
  | 'LAYER1_CLASSIFY_INTENT'
  | 'LAYER1_MATCH_TEMPLATE'
  | 'LAYER1_INJECT_CONTEXT'
  | 'LAYER1_FILL_SLOTS'
  | 'LAYER1_NEUTRALIZE_AMBIGUITY'
  | 'LAYER1_ENFORCE_OUTPUT_FORMAT'
  | 'LAYER2_DETECT_GAPS'
  | 'LAYER2_GENERATE_ENHANCED_QUESTIONS'
  | 'AWAITING_MICRO_QUESTION'
  | 'AWAITING_ENHANCED_CLARIFICATION'
  | 'LAYER2_INJECT_PERSONA'
  | 'LAYER2_BUILD_SESSION_MEMORY'
  | 'LAYER2_ADAPT_MODEL'
  | 'LAYER2_SCORE_COMPLEXITY'
  | 'LAYER3_SCAN_PII'
  | 'AWAITING_COMMAND_CONFIRMATION'
  | 'AWAITING_SCOPE_CONFIRMATION'
  | 'LAYER4_CLASSIFY_IMAGE'
  | 'LAYER4_EXTRACT_IMAGE_TEXT'
  | 'LAYER4_MAP_IMAGE_RELATIONSHIPS'
  | 'LAYER4_SYNTHESIZE_IMAGE_CONTEXT'
  | 'LAYER4_BUILD_MULTIMODAL_PROMPT'
  | 'LAYER5_INJECT_FACT_FLAGS'
  | 'LAYER5_REQUEST_CITATIONS'
  | 'LAYER6_ASSEMBLE_PAYLOAD'
  | 'LAYER6_EXECUTE_MODEL'
  | 'LAYER5_POSTPROCESS_RESPONSE'
  | 'COMPLETE'
  | 'ERROR';

/**
 * Lifecycle states emitted while a pipeline request is being processed.
 */
export type PipelineStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_CONFIRMATION'
  | 'COMPLETE'
  | 'ERROR';

/**
 * Represents the detected high-level intent for a user request.
 */
export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  subIntent: string;
  needsClarification?: boolean;
}

/**
 * Defines a reusable prompt scaffold that can be populated with slot values.
 */
export interface PromptTemplate {
  id: string;
  intentType: IntentType;
  template: string;
  description: string;
  tags: string[];
  tfIdfVector?: number[];
  weight: number;
  category?: string;
  importGroup?: string;
  isActive?: boolean;
  originTitle?: string;
  originUrl?: string;
  source?: 'seed' | 'generated' | 'custom' | 'external';
}

/**
 * Indicates whether a prompt directly matched, partially matched, or required a generated template.
 */
export type MatchZone = 'DIRECT' | 'PARTIAL' | 'GENERATE';

/**
 * Captures a single resolved slot value used while populating a prompt template.
 */
export interface TemplateSlot {
  key: string;
  value: string;
  source: string;
}

/**
 * Describes a missing piece of knowledge detected during enrichment and how to address it.
 */
export interface KnowledgeGap {
  gap: string;
  severity: GapSeverity;
  suggestedFix: string;
}

/**
 * Represents one targeted clarification PromptBridge can ask before building a richer prompt.
 */
export interface ClarificationQuestion {
  id: string;
  prompt: string;
  placeholder: string;
  defaultAnswer: string;
}

/**
 * Stores a user's answer for a clarification question, including whether PromptBridge used a default.
 */
export interface ClarificationResponse {
  questionId: string;
  answer: string;
  usedDefault: boolean;
}

/**
 * Stores persona metadata used to tailor prompt framing and response style.
 */
export interface Persona {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  preferredStyle: string;
  domainContext: string;
}

/**
 * Represents a single node in session memory, including prompt, response, and quality context.
 */
export interface SessionNode {
  promptId: string;
  intent: IntentType;
  keyEntities: string[];
  timestamp: string;
  responseQuality: number;
  enrichedPrompt: string;
  rawResponse: string;
}

/**
 * Captures the before-and-after complexity analysis for a prompt enrichment cycle.
 */
export interface ComplexityScore {
  raw: number;
  enriched: number;
  delta: number;
  breakdown: Record<string, number>;
}

/**
 * Summarizes how many sensitive values were removed for a particular PII category.
 */
export interface PIIRedaction {
  type: string;
  count: number;
}

/**
 * Normalized input payload passed into the PromptBridge processing pipeline.
 */
export interface PipelineInput {
  rawInput: string;
  imageData?: string;
  targetModel: ModelTarget;
  personaId?: string;
  sessionId: string;
}

/**
 * Aggregates the final output of the enrichment pipeline, including metadata and scoring.
 */
export interface PipelineResult {
  enrichedPrompt: string;
  rawResponse: string;
  processedResponse: string;
  intent: IntentClassification;
  template: PromptTemplate;
  complexityScore: ComplexityScore;
  piiRedactions: PIIRedaction[];
  confidenceLevel: ConfidenceLevel;
  citationList: string[];
  executionTimeMs: number;
  slotMappings: TemplateSlot[];
  matchZone: MatchZone;
  matchScore: number;
  matchBadge: string;
  isNewTemplate: boolean;
}

/**
 * Stores explicit user feedback for a generated prompt and the template used to build it.
 */
export interface PromptRating {
  promptId: string;
  templateId: string;
  intentId: IntentType;
  rating: RatingValue;
  comment: string;
  timestamp: string;
}

/**
 * Represents a durable history record for a processed prompt and its response outcome.
 */
export interface HistoryEntry {
  id: string;
  timestamp: string;
  intent: IntentType;
  templateId: string;
  complexityDelta: number;
  confidenceLevel: ConfidenceLevel;
  rating: RatingValue | null;
  enrichedPrompt: string;
  response: string;
}

/**
 * Holds encrypted secret material stored in the local vault layer.
 */
export interface VaultEntry {
  key: string;
  encryptedValue: string;
  iv: string;
  timestamp: string;
}

/**
 * Defines persisted application preferences that shape PromptBridge behavior.
 */
export interface AppSettings {
  activePersonaId: string;
  targetModel: ModelTarget;
  sessionMemoryDepth: number;
  vaultTimeoutMinutes: number;
  theme: ThemePreference;
  abModeEnabled: boolean;
  enhancedModeEnabled: boolean;
}

/**
 * Represents the normalized outbound payload used by the execution engine before provider-specific translation.
 */
export interface ApiPayload {
  model: ModelTarget;
  prompt: string;
  systemPrompt?: string;
  imageData?: string;
  maxTokens: number;
  temperature?: number;
}
