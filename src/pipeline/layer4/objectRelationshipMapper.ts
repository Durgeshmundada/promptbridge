import type { ImageType } from '../../types';
import {
  normalizeImagePayload,
  parseClaudeJsonResponse,
  sendClaudeVisionRequest,
} from './claudeVisionBridge';

export interface ObjectRelationshipMapperInput {
  imageData: string;
  imageType: ImageType;
}

export interface ObjectRelationshipMapResult {
  elements: string[];
  relationships: string[];
  layout: string;
  summary: string;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value;
  }

  return [];
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Uses Claude Vision via the background worker to map major visual elements and their relationships.
 */
export async function mapObjectRelationships(
  input: ObjectRelationshipMapperInput,
): Promise<ObjectRelationshipMapResult> {
  const normalizedImage = normalizeImagePayload(input.imageData);
  const response = await sendClaudeVisionRequest({
    imageData: normalizedImage.imageData,
    mimeType: normalizedImage.mimeType,
    maxTokens: 700,
    temperature: 0,
    systemPrompt: [
      'You analyze structure in images for a prompt-enrichment pipeline.',
      'Return JSON only with keys: elements, relationships, layout, summary.',
      'For diagrams, identify nodes, edges, labels, clusters, flows, and hierarchies.',
      'For charts and graphs, identify axes, legends, data series, key trends, inflection points, and anomalies.',
      'For screenshots or documents, identify major regions, panels, controls, callouts, and spatial arrangement.',
    ].join(' '),
    userPrompt: `Map the important visual elements and relationships in this ${input.imageType} image.`,
  });

  const parsedResponse = parseClaudeJsonResponse(response.content);

  return {
    elements: normalizeStringArray(parsedResponse.elements),
    relationships: normalizeStringArray(parsedResponse.relationships),
    layout: normalizeString(parsedResponse.layout, 'Layout details were not identified.'),
    summary: normalizeString(parsedResponse.summary, 'A concise visual summary was not available.'),
  };
}
