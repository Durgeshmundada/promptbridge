import type { ImageType } from '../../types';
import {
  normalizeImagePayload,
  parseClaudeJsonResponse,
  sendClaudeVisionRequest,
} from './claudeVisionBridge';

export interface OcrTextExtractorInput {
  imageData: string;
  imageType: ImageType;
}

export interface OcrTextExtractionResult {
  extractedText: string;
  detectedLanguage?: string;
  hasCode: boolean;
  syntaxErrors?: string[];
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value;
  }

  return undefined;
}

/**
 * Uses Claude Vision via the background worker to extract visible text while preserving layout hints.
 */
export async function extractOcrText(
  input: OcrTextExtractorInput,
): Promise<OcrTextExtractionResult> {
  const normalizedImage = normalizeImagePayload(input.imageData);
  const response = await sendClaudeVisionRequest({
    imageData: normalizedImage.imageData,
    mimeType: normalizedImage.mimeType,
    maxTokens: 900,
    temperature: 0,
    systemPrompt: [
      'You are an OCR and code-detection engine for a multimodal prompt pipeline.',
      'Return JSON only with keys: extractedText, detectedLanguage, hasCode, syntaxErrors.',
      'Preserve visible reading order and line breaks in extractedText when practical.',
      'Set hasCode to true when the image contains source code, terminal commands, stack traces, or structured code-like snippets.',
      'If code is present, detect the likely language and list only likely syntax or OCR corruption issues in syntaxErrors.',
    ].join(' '),
    userPrompt: `Extract all text from this ${input.imageType} image and identify whether it contains code.`,
  });

  const parsedResponse = parseClaudeJsonResponse(response.content);
  const extractedText =
    typeof parsedResponse.extractedText === 'string' ? parsedResponse.extractedText.trim() : '';
  const hasCode = parsedResponse.hasCode === true;
  const detectedLanguage = normalizeOptionalString(parsedResponse.detectedLanguage);
  const syntaxErrors = normalizeStringArray(parsedResponse.syntaxErrors);

  return {
    extractedText,
    ...(detectedLanguage ? { detectedLanguage } : {}),
    hasCode,
    ...(hasCode && syntaxErrors && syntaxErrors.length > 0 ? { syntaxErrors } : {}),
  };
}
