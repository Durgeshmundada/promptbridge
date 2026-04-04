import { ImageType } from '../../types';
import type { ObjectRelationshipMapResult } from './objectRelationshipMapper';
import type { OcrTextExtractionResult } from './ocrTextExtractor';

export interface ImageToPromptSynthesizerInput {
  ocrResult?: OcrTextExtractionResult;
  mapResult?: ObjectRelationshipMapResult;
  imageType: ImageType;
}

function describeImageType(imageType: ImageType): string {
  switch (imageType) {
    case ImageType.DIAGRAM:
      return 'a diagram';
    case ImageType.SCREENSHOT_UI:
      return 'a user interface screenshot';
    case ImageType.SCREENSHOT_CODE:
      return 'a code screenshot';
    case ImageType.DOCUMENT:
      return 'a document';
    case ImageType.PHOTOGRAPH:
      return 'a photograph';
    case ImageType.CHART_GRAPH:
      return 'a chart or graph';
    case ImageType.HANDWRITING:
      return 'handwriting';
    case ImageType.UNKNOWN:
    default:
      return 'an image of unknown type';
  }
}

function formatElements(mapResult?: ObjectRelationshipMapResult): string {
  if (!mapResult || mapResult.elements.length === 0) {
    return 'no clearly identified elements';
  }

  return mapResult.elements.join(', ');
}

function formatRelationships(mapResult?: ObjectRelationshipMapResult): string {
  if (!mapResult || mapResult.relationships.length === 0) {
    return 'no explicit relationships were identified';
  }

  return mapResult.relationships.join('; ');
}

function formatExtractedText(ocrResult?: OcrTextExtractionResult): string {
  if (!ocrResult || !ocrResult.extractedText.trim()) {
    return 'no extractable text was detected';
  }

  const extractedSegments = [ocrResult.extractedText.trim()];

  if (ocrResult.hasCode) {
    extractedSegments.push(
      `Code detected${ocrResult.detectedLanguage ? ` in ${ocrResult.detectedLanguage}` : ''}.`,
    );
  } else if (ocrResult.detectedLanguage) {
    extractedSegments.push(`Detected language: ${ocrResult.detectedLanguage}.`);
  }

  if (ocrResult.syntaxErrors && ocrResult.syntaxErrors.length > 0) {
    extractedSegments.push(`Possible syntax issues: ${ocrResult.syntaxErrors.join('; ')}.`);
  }

  return extractedSegments.join(' ');
}

function formatSummary(
  imageType: ImageType,
  ocrResult?: OcrTextExtractionResult,
  mapResult?: ObjectRelationshipMapResult,
): string {
  if (mapResult?.summary) {
    return mapResult.summary;
  }

  if (ocrResult?.hasCode) {
    return `${describeImageType(imageType)} containing code-oriented content`;
  }

  if (ocrResult?.extractedText.trim()) {
    return `${describeImageType(imageType)} containing text-rich content`;
  }

  return `${describeImageType(imageType)} with limited extracted detail`;
}

function ensureSentencePunctuation(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/**
 * Synthesizes OCR and structural analysis into a single structured image context block for prompt enrichment.
 */
export function synthesizeImageToPromptContext(
  input: ImageToPromptSynthesizerInput,
): string {
  const layoutText = input.mapResult?.layout
    ? `Layout: ${input.mapResult.layout}.`
    : 'Layout: layout details were not identified.';

  return [
    `The attached image shows ${describeImageType(input.imageType)}.`,
    `It contains ${formatElements(input.mapResult)}.`,
    `Key relationships: ${formatRelationships(input.mapResult)}.`,
    layoutText,
    `Extracted text: ${ensureSentencePunctuation(formatExtractedText(input.ocrResult))}`,
    `This appears to depict ${ensureSentencePunctuation(
      formatSummary(input.imageType, input.ocrResult, input.mapResult),
    )}`,
  ].join(' ');
}
