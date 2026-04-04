import { IntentType } from '../../types';
import type { ModelTarget, PromptTemplate } from '../../types';
import { saveTemplateToRuntime } from '../../utils/templateServiceRuntime';
import { execute } from '../layer6/executionEngine';
import { getFromLocal, saveToLocal } from '../../utils/storage';

interface TemplateJsonCandidate {
  id?: unknown;
  intentType?: unknown;
  description?: unknown;
  template?: unknown;
  tags?: unknown;
  weight?: unknown;
}

interface TemplateGenerationFailureLog {
  reason: string;
  rawResponse: string;
  timestamp: string;
}

const GENERATED_TEMPLATES_STORAGE_KEY = 'pb_templates_generated';
const TEMPLATE_GENERATION_FAILURES_STORAGE_KEY = 'pb_template_generation_failures';
const MAX_GENERATED_TEMPLATE_COUNT = 500;
const MAX_FAILURE_LOG_COUNT = 50;
const TEMPLATE_REQUEST_MAX_TOKENS = 500;
const TEMPLATE_REQUEST_TEMPERATURE = 0.3;
const TEMPLATE_REQUEST_SYSTEM_PROMPT =
  'You are PromptBridge template generation engine. Return only valid JSON with double-quoted keys and values where required. Do not wrap the JSON in markdown.';

function createTemplateId(prefix: 'adapted' | 'generated'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString()}`;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeWeight(weight: unknown): number {
  return typeof weight === 'number' && Number.isFinite(weight) ? weight : 1;
}

function normalizeTemplateCandidate(
  value: TemplateJsonCandidate,
  fallbackIntent: IntentType,
  id: string,
): PromptTemplate {
  const candidateIntent =
    typeof value.intentType === 'string' &&
    Object.values(IntentType).includes(value.intentType as IntentType)
      ? (value.intentType as IntentType)
      : fallbackIntent;

  return {
    id,
    intentType: candidateIntent,
    description: typeof value.description === 'string' ? value.description.trim() : '',
    template: typeof value.template === 'string' ? value.template.trim() : '',
    tags: normalizeTags(value.tags),
    weight: normalizeWeight(value.weight),
  };
}

function parseTemplateJson(rawResponse: string): TemplateJsonCandidate | null {
  const normalizedResponse = rawResponse.trim();

  try {
    return JSON.parse(normalizedResponse) as TemplateJsonCandidate;
  } catch {
    const extractedJson = normalizedResponse.match(/\{[\s\S]*\}/)?.[0];

    if (!extractedJson) {
      return null;
    }

    try {
      return JSON.parse(extractedJson) as TemplateJsonCandidate;
    } catch {
      return null;
    }
  }
}

async function logTemplateGenerationFailure(
  reason: string,
  rawResponse: string,
): Promise<void> {
  if (!globalThis.chrome?.storage?.local) {
    return;
  }

  try {
    const currentLogs =
      (await getFromLocal<TemplateGenerationFailureLog[]>(
        TEMPLATE_GENERATION_FAILURES_STORAGE_KEY,
      )) ?? [];
    const nextLogs = [
      {
        reason,
        rawResponse,
        timestamp: new Date().toISOString(),
      },
      ...currentLogs,
    ].slice(0, MAX_FAILURE_LOG_COUNT);

    await saveToLocal(TEMPLATE_GENERATION_FAILURES_STORAGE_KEY, nextLogs);
  } catch (error) {
    console.warn('[PromptBridge][TemplateGenerator] Failed to persist generation log.', error);
  }
}

function buildSessionContextBlock(sessionContext: string): string {
  const normalizedSessionContext = sessionContext.trim();

  if (!normalizedSessionContext) {
    return 'Same-session retrieval context:\nNone available.';
  }

  return `Same-session retrieval context:\n${normalizedSessionContext}`;
}

function buildAdaptPrompt(
  baseTemplate: PromptTemplate,
  userInput: string,
  sessionContext: string,
): string {
  return [
    'Here is an existing prompt template:',
    baseTemplate.template,
    '',
    `It partially matches this user request: ${userInput}`,
    '',
    buildSessionContextBlock(sessionContext),
    '',
    'Adapt it to better fit this request.',
    'Keep the same {{slot}} format.',
    'Keep the same JSON structure.',
    'Only modify parts that do not fit.',
    'Return only valid JSON with keys: id, intentType, description, template, tags, weight.',
  ].join('\n');
}

function buildGeneratePrompt(
  userInput: string,
  intent: IntentType,
  sessionContext: string,
): string {
  return [
    `Generate a reusable expert prompt template for this user request: ${userInput}`,
    `Detected intent: ${intent}`,
    '',
    buildSessionContextBlock(sessionContext),
    '',
    'Rules:',
    '- Use {{slot_name}} for every variable part',
    '- Must have at least 2 slots',
    '- Make it reusable for similar future queries',
    '- Keep it under 300 words',
    '',
    'Return ONLY this JSON, no explanation, no markdown:',
    '{',
    '  "id": "generated-template",',
    `  "intentType": "${intent}",`,
    '  "description": "one line description of what this template does",',
    '  "template": "full template text with {{slots}}",',
    '  "tags": ["tag1", "tag2", "tag3"],',
    '  "weight": 1.0',
    '}',
  ].join('\n');
}

/**
 * Validates whether a generated or adapted prompt template is safe to persist and reuse.
 */
export function validateTemplate(template: PromptTemplate): boolean {
  if (!template.id.trim()) {
    return false;
  }

  if (!template.template.includes('{{')) {
    return false;
  }

  if (template.description.trim().length < 10) {
    return false;
  }

  if (!Object.values(IntentType).includes(template.intentType)) {
    return false;
  }

  if (template.template.trim().length < 20) {
    return false;
  }

  return true;
}

/**
 * Saves a generated template to the dedicated generated-template store while capping library growth.
 */
export async function saveTemplateToDatabase(template: PromptTemplate): Promise<void> {
  try {
    await saveTemplateToRuntime(template);
  } catch {
    // Keep local fallback behavior even when the background bridge is unavailable.
  }

  const existingTemplates =
    (await getFromLocal<PromptTemplate[]>(GENERATED_TEMPLATES_STORAGE_KEY)) ?? [];
  const mergedTemplates = [template, ...existingTemplates.filter((entry) => entry.id !== template.id)];
  const cappedTemplates = [...mergedTemplates]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MAX_GENERATED_TEMPLATE_COUNT);

  await saveToLocal(GENERATED_TEMPLATES_STORAGE_KEY, cappedTemplates);
}

/**
 * Adapts an existing template for a partially matched request and persists it when valid.
 */
export async function adaptTemplate(
  baseTemplate: PromptTemplate,
  userInput: string,
  model: ModelTarget,
  sessionContext = '',
): Promise<PromptTemplate> {
  const response = await execute({
    model,
    prompt: buildAdaptPrompt(baseTemplate, userInput, sessionContext),
    systemPrompt: TEMPLATE_REQUEST_SYSTEM_PROMPT,
    maxTokens: TEMPLATE_REQUEST_MAX_TOKENS,
    temperature: TEMPLATE_REQUEST_TEMPERATURE,
  });
  const parsedTemplate = parseTemplateJson(response.response);

  if (!parsedTemplate) {
    await logTemplateGenerationFailure('Invalid JSON returned while adapting template.', response.response);
    throw new Error('PromptBridge could not parse the adapted template JSON.');
  }

  const adaptedTemplate = normalizeTemplateCandidate(
    {
      ...parsedTemplate,
      intentType: baseTemplate.intentType,
      weight: 1,
    },
    baseTemplate.intentType,
    createTemplateId('adapted'),
  );

  if (!validateTemplate(adaptedTemplate)) {
    await logTemplateGenerationFailure(
      'Adapted template failed validation.',
      response.response,
    );
    throw new Error('PromptBridge rejected the adapted template because it was invalid.');
  }

  await saveTemplateToDatabase(adaptedTemplate);
  return adaptedTemplate;
}

/**
 * Generates a brand-new reusable template when no existing template matches well enough.
 */
export async function generateTemplate(
  userInput: string,
  intent: IntentType,
  model: ModelTarget,
  sessionContext = '',
): Promise<PromptTemplate> {
  const response = await execute({
    model,
    prompt: buildGeneratePrompt(userInput, intent, sessionContext),
    systemPrompt: TEMPLATE_REQUEST_SYSTEM_PROMPT,
    maxTokens: TEMPLATE_REQUEST_MAX_TOKENS,
    temperature: TEMPLATE_REQUEST_TEMPERATURE,
  });
  const parsedTemplate = parseTemplateJson(response.response);

  if (!parsedTemplate) {
    await logTemplateGenerationFailure('Invalid JSON returned while generating template.', response.response);
    throw new Error('PromptBridge could not parse the generated template JSON.');
  }

  const generatedTemplate = normalizeTemplateCandidate(
    {
      ...parsedTemplate,
      intentType: intent,
      weight: 1,
    },
    intent,
    typeof parsedTemplate.id === 'string' && parsedTemplate.id.trim()
      ? parsedTemplate.id.trim()
      : createTemplateId('generated'),
  );

  if (!validateTemplate(generatedTemplate)) {
    await logTemplateGenerationFailure(
      'Generated template failed validation.',
      response.response,
    );
    throw new Error('PromptBridge rejected the generated template because it was invalid.');
  }

  await saveTemplateToDatabase(generatedTemplate);
  return generatedTemplate;
}
