import {
  ConfidenceLevel,
  ModelTarget,
  type IntentType,
  type PipelineStageId,
  type PipelineStatus,
} from '../types';

export const POPUP_MODEL_OPTIONS = [
  ModelTarget.GROQ,
  ModelTarget.GPT4O,
  ModelTarget.CLAUDE,
  ModelTarget.GEMINI,
] as const;

export const POPUP_TEXT = {
  appName: 'PromptBridge',
  versionPrefix: 'v',
  popup: {
    shellAriaLabel: 'PromptBridge popup',
  },
  header: {
    logoAriaLabel: 'PromptBridge home',
    personaLabel: 'Persona',
    personaFallback: 'No persona selected',
    modelLabel: 'Model',
    themeToggleAriaLabel: 'Toggle theme',
    settingsAriaLabel: 'Open settings',
  },
  inputArea: {
    title: 'Input',
    textareaPlaceholder:
      'Paste or type a prompt to run through the seven-layer PromptBridge pipeline.',
    uploadButton: 'Add image',
    removeImageButton: 'Remove image',
    abModeLabel: 'A/B mode',
    enhancedModeLabel: 'Enhanced mode',
    submitButton: 'Submit',
    submittingButton: 'Submitting...',
    imageReadError: 'PromptBridge could not read that image file.',
    emptyPromptError: 'Enter a prompt or attach an image before you submit.',
    imageOnlyFallbackPrompt: 'Analyze the attached image and explain the important details.',
  },
  statusBar: {
    title: 'Pipeline status',
    idleMessage: 'Ready to enrich the next prompt.',
    runningPrefix: 'Current stage',
    waitingInputMessage: 'PromptBridge is waiting for one clarification.',
    waitingConfirmationMessage: 'PromptBridge is waiting for your confirmation.',
    completeMessage: 'PromptBridge finished the latest run.',
    errorMessage: 'PromptBridge stopped because the latest run failed.',
  },
  interactions: {
    microQuestionTitle: 'Need one clarification',
    microQuestionPlaceholder: 'Type the missing detail here.',
    microQuestionSubmit: 'Continue',
    enhancedTitle: 'Enhanced Mode',
    enhancedSubtitle:
      'Answer the questions that matter. Leave any blank and PromptBridge will use the best professional choice.',
    enhancedSubmit: 'Optimize with Context',
    enhancedDefaultHint: 'Blank answers default to "Best professional choice."',
    enhancedQuestionAction: 'Add context',
    enhancedQuestionActionActive: 'Editing',
    commandGateTitle: 'Confirm command request',
    commandGateConfirm: 'Confirm',
    commandGateCancel: 'Cancel',
    scopeTitle: 'Choose execution scope',
    scopeDescription:
      'PromptBridge detected a broad scope. Choose the boundary before execution continues.',
  },
  complexity: {
    title: 'Complexity',
    templateMatchTitle: 'Template match',
    savedToLibrary: 'Saved to your template library',
  },
  diffViewer: {
    eyebrow: 'Prompt diff',
    title: 'Raw versus enriched prompt',
    collapse: 'Collapse diff',
    expand: 'Expand diff',
    added: 'Added guidance',
    neutralized: 'Neutralized ambiguity',
    redacted: 'Redacted data',
    rawLabel: 'Raw input',
    enrichedLabel: 'Enriched prompt',
    readyHint:
      'Expand to inspect raw prompt text, enriched additions, neutralized language, and redactions.',
    loadingHint: 'Preparing the first-use diff view.',
  },
  response: {
    title: 'Response',
    emptyTitle: 'No response yet',
    emptyDescription:
      'Run the pipeline to see the enriched prompt output, confidence, timing, and citations here.',
    bodyLabel: 'Response body',
    intentLabel: 'Intent',
    medicalDisclaimer:
      'MEDICAL DISCLAIMER: This is AI-generated information only, not medical advice.',
    medicalFooter:
      'Consult a healthcare professional for personal medical advice.',
    citationsTitle: 'Citations',
    showCitations: 'Show citations',
    hideCitations: 'Hide citations',
    noCitations: 'No citations were extracted from the latest response.',
  },
  confidence: {
    [ConfidenceLevel.HIGH]: 'HIGH',
    [ConfidenceLevel.MEDIUM]: 'MEDIUM',
    [ConfidenceLevel.LOW]: 'LOW',
  },
  history: {
    title: 'Recent history',
    viewAll: 'View all',
    emptyDescription: 'Recent pipeline runs will appear here after you submit a prompt.',
  },
  rating: {
    eyebrow: 'Response rating',
    title: 'Feed template learning',
    defaultMessage: 'Rate the prompt quality to tune template weighting.',
    chooseRatingFirst: 'Choose thumbs up or thumbs down before you submit.',
    helpful: 'Helpful',
    needsWork: 'Needs work',
    noteLabel: 'Optional note',
    notePlaceholder: 'What made this prompt strong or weak?',
    submit: 'Submit rating',
    submitting: 'Saving...',
    saved: 'Rating saved',
  },
  abTester: {
    title: 'A/B tester',
    heading: 'Template head-to-head',
    unavailable:
      'A/B testing becomes available once PromptBridge has at least two strong template matches for the current prompt.',
    rerun: 'Run again',
    running: 'Running...',
    pendingMessage:
      'Compare the top two templates on the same prompt and keep the winner.',
    completeMessage:
      'Both variants finished. Pick the stronger result to reward its template.',
    variantLabel: 'Variant',
    weightLabelPrefix: 'weight',
    executingMessage: 'Executing this pipeline variant...',
    noTiming: 'No timing',
    chooseWinner: 'Choose this winner',
    winnerSelected: 'Winner selected',
  },
} as const;

export const PIPELINE_STAGE_LABELS: Record<PipelineStageId, string> = {
  IDLE: 'Ready',
  PREPARING: 'Preparing request',
  LAYER1_CLASSIFY_INTENT: 'Classifying intent',
  LAYER1_MATCH_TEMPLATE: 'Matching templates',
  LAYER1_INJECT_CONTEXT: 'Injecting context',
  LAYER1_FILL_SLOTS: 'Filling template slots',
  LAYER1_NEUTRALIZE_AMBIGUITY: 'Neutralizing ambiguity',
  LAYER1_ENFORCE_OUTPUT_FORMAT: 'Enforcing output format',
  LAYER2_DETECT_GAPS: 'Checking for knowledge gaps',
  LAYER2_GENERATE_ENHANCED_QUESTIONS: 'Generating targeted clarifications',
  AWAITING_MICRO_QUESTION: 'Waiting for clarification',
  AWAITING_ENHANCED_CLARIFICATION: 'Waiting for enhanced context',
  LAYER2_INJECT_PERSONA: 'Injecting persona context',
  LAYER2_BUILD_SESSION_MEMORY: 'Building session memory',
  LAYER2_ADAPT_MODEL: 'Adapting for target model',
  LAYER2_SCORE_COMPLEXITY: 'Scoring complexity',
  LAYER3_SCAN_PII: 'Scanning sensitive data',
  AWAITING_COMMAND_CONFIRMATION: 'Waiting for command confirmation',
  AWAITING_SCOPE_CONFIRMATION: 'Waiting for scope selection',
  LAYER4_CLASSIFY_IMAGE: 'Classifying image',
  LAYER4_EXTRACT_IMAGE_TEXT: 'Extracting image text',
  LAYER4_MAP_IMAGE_RELATIONSHIPS: 'Mapping image structure',
  LAYER4_SYNTHESIZE_IMAGE_CONTEXT: 'Synthesizing image context',
  LAYER4_BUILD_MULTIMODAL_PROMPT: 'Building multimodal prompt',
  LAYER5_INJECT_FACT_FLAGS: 'Adding fact markers',
  LAYER5_REQUEST_CITATIONS: 'Requesting citations',
  LAYER6_ASSEMBLE_PAYLOAD: 'Assembling model payload',
  LAYER6_EXECUTE_MODEL: 'Executing model request',
  LAYER5_POSTPROCESS_RESPONSE: 'Post-processing response',
  COMPLETE: 'Complete',
  ERROR: 'Error',
};

export function getModelDisplayLabel(model: ModelTarget): string {
  switch (model) {
    case ModelTarget.GROQ:
      return 'Groq';
    case ModelTarget.GPT4O:
      return 'GPT-4o';
    case ModelTarget.CLAUDE:
      return 'Claude';
    case ModelTarget.GEMINI:
      return 'Gemini';
    case ModelTarget.LLAMA:
      return 'Llama';
    case ModelTarget.CUSTOM:
      return 'Custom';
    default: {
      const unreachableModel: never = model;
      return unreachableModel;
    }
  }
}

export function getPipelineStatusMessage(
  status: PipelineStatus,
  stage: PipelineStageId,
  fallbackMessage: string,
): string {
  if (fallbackMessage.trim().length > 0) {
    return fallbackMessage;
  }

  switch (status) {
    case 'RUNNING':
      return `${POPUP_TEXT.statusBar.runningPrefix}: ${PIPELINE_STAGE_LABELS[stage]}.`;
    case 'WAITING_FOR_INPUT':
      return POPUP_TEXT.statusBar.waitingInputMessage;
    case 'WAITING_FOR_CONFIRMATION':
      return POPUP_TEXT.statusBar.waitingConfirmationMessage;
    case 'COMPLETE':
      return POPUP_TEXT.statusBar.completeMessage;
    case 'ERROR':
      return POPUP_TEXT.statusBar.errorMessage;
    case 'IDLE':
    default:
      return POPUP_TEXT.statusBar.idleMessage;
  }
}

export function formatComplexityLabel(raw: number, enriched: number, delta: number): string {
  const signedDelta = delta >= 0 ? `+${delta.toString()}` : delta.toString();
  return `Raw: ${raw}/10 -> Enriched: ${enriched}/10 (${signedDelta})`;
}

export function formatMatchScoreLabel(score: number): string {
  return `Score: ${Math.round(score * 100).toString()}%`;
}

export function formatExecutionTime(milliseconds: number): string {
  return `Generated in ${(milliseconds / 1000).toFixed(1)}s`;
}

export function formatIntentLabel(intent: IntentType): string {
  return intent.replace(/_/g, ' ');
}

export function formatPiiNotification(redactionCount: number): string {
  const suffix = redactionCount === 1 ? 'item' : 'items';
  return `${redactionCount.toString()} sensitive ${suffix} redacted`;
}

export function formatRatingCount(count: number): string {
  return `${count.toString()} stored ratings`;
}

export function formatSavedRatingMessage(count: number): string {
  return `Saved rating ${count.toString()} of the current feedback cycle.`;
}

export function formatAttachedImageMessage(fileName: string): string {
  return `Attached image: ${fileName}`;
}

export function formatHistoryCount(count: number): string {
  return `${count.toString()} items`;
}
