import { ImageType } from '../../types';
import {
  coerceImageType,
  parseClaudeJsonResponse,
  sendClaudeVisionRequest,
} from './claudeVisionBridge';

export interface VisualContentClassifierInput {
  imageData: string;
  mimeType: string;
}

export interface VisualContentClassification {
  type: ImageType;
  confidence: number;
  suggestedPipeline: string[];
}

const DEFAULT_PIPELINES: Record<ImageType, string[]> = {
  [ImageType.DIAGRAM]: [
    'objectRelationshipMapper',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.SCREENSHOT_UI]: [
    'ocrTextExtractor',
    'objectRelationshipMapper',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.SCREENSHOT_CODE]: [
    'ocrTextExtractor',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.DOCUMENT]: [
    'ocrTextExtractor',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.PHOTOGRAPH]: [
    'objectRelationshipMapper',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.CHART_GRAPH]: [
    'ocrTextExtractor',
    'objectRelationshipMapper',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.HANDWRITING]: [
    'ocrTextExtractor',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
  [ImageType.UNKNOWN]: [
    'ocrTextExtractor',
    'objectRelationshipMapper',
    'imageToPromptSynthesizer',
    'multimodalPromptBuilder',
  ],
};

function normalizeConfidence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1) {
      return Number(Math.min(1, Math.max(0, value / 100)).toFixed(2));
    }

    return Number(Math.min(1, Math.max(0, value)).toFixed(2));
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return normalizeConfidence(parsed);
    }
  }

  return 0.5;
}

function normalizeSuggestedPipeline(value: unknown, imageType: ImageType): string[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value;
  }

  return DEFAULT_PIPELINES[imageType];
}

/**
 * Uses Claude Vision via the background worker to classify the attached image into PromptBridge image types.
 */
export async function classifyVisualContent(
  input: VisualContentClassifierInput,
): Promise<VisualContentClassification> {
  const response = await sendClaudeVisionRequest({
    imageData: input.imageData,
    mimeType: input.mimeType,
    maxTokens: 350,
    temperature: 0,
    systemPrompt: [
      'You classify images for a prompt-enrichment pipeline.',
      'Return JSON only with keys: type, confidence, suggestedPipeline.',
      'Valid type values are exactly: DIAGRAM, SCREENSHOT_UI, SCREENSHOT_CODE, DOCUMENT, PHOTOGRAPH, CHART_GRAPH, HANDWRITING, UNKNOWN.',
      'suggestedPipeline must be an ordered array of PromptBridge module names.',
      'Confidence must be a number from 0 to 1.',
    ].join(' '),
    userPrompt: [
      'Classify this image for downstream processing.',
      'Focus on whether it is a diagram, UI screenshot, code screenshot, document, photograph, chart/graph, handwriting, or unknown.',
      'Prefer SCREENSHOT_CODE when readable source code is dominant.',
      'Prefer CHART_GRAPH when axes, legends, or plotted trends are central.',
    ].join(' '),
  });

  const parsedResponse = parseClaudeJsonResponse(response.content);
  const imageType = coerceImageType(parsedResponse.type);

  return {
    type: imageType,
    confidence: normalizeConfidence(parsedResponse.confidence),
    suggestedPipeline: normalizeSuggestedPipeline(parsedResponse.suggestedPipeline, imageType),
  };
}
