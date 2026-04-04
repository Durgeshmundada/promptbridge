import type { TemplateSlot } from '../../types';

interface DetectedEntities {
  dates: string[];
  versions: string[];
  fileNames: string[];
  urls: string[];
  languages: string[];
  frameworks: string[];
  comparisonItems: string[];
}

interface SlotResolution {
  value: string;
  source: string;
}

const SLOT_PATTERN = /{{\s*([\w-]+)\s*}}/g;

const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},?\s+\d{4}\b/gi,
];

const VERSION_PATTERNS: RegExp[] = [/\bv?\d+(?:\.\d+){1,3}\b/g, /\b(?:version|ver)\s+\d+(?:\.\d+){0,3}\b/gi];

const FILE_NAME_PATTERN =
  /\b(?:[\w-]+[\\/])*(?:[\w-]+\.)+(?:ts|tsx|js|jsx|json|md|py|java|kt|swift|go|rs|rb|php|css|scss|html|sql|yaml|yml|toml|sh)\b/gi;

const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;

const LANGUAGE_NAMES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Java',
  'C#',
  'C++',
  'Go',
  'Rust',
  'Ruby',
  'PHP',
  'Kotlin',
  'Swift',
  'SQL',
];

const FRAMEWORK_NAMES = [
  'React',
  'Next.js',
  'Vue',
  'Nuxt',
  'Angular',
  'Svelte',
  'Express',
  'Django',
  'Flask',
  'FastAPI',
  'Spring',
  'Tailwind',
  'Vite',
  'Jest',
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractMatches(pattern: RegExp, rawInput: string): string[] {
  const matches = rawInput.match(pattern);
  return unique(matches ?? []);
}

function extractKeywordMatches(rawInput: string, candidates: string[]): string[] {
  const normalizedInput = rawInput.toLowerCase();

  return unique(
    candidates.filter((candidate) => normalizedInput.includes(candidate.toLowerCase())),
  );
}

function extractComparisonItems(rawInput: string): string[] {
  const versusPattern = /\b([\w.+#/-]+)\s+(?:vs\.?|versus)\s+([\w.+#/-]+)\b/i;
  const comparePattern = /\bcompare\s+([\w.+#/-]+)\s+(?:and|to)\s+([\w.+#/-]+)\b/i;
  const match = rawInput.match(versusPattern) ?? rawInput.match(comparePattern);

  if (!match) {
    return [];
  }

  return unique([match[1], match[2]]);
}

function detectEntities(rawInput: string): DetectedEntities {
  return {
    dates: unique(DATE_PATTERNS.flatMap((pattern) => extractMatches(pattern, rawInput))),
    versions: unique(VERSION_PATTERNS.flatMap((pattern) => extractMatches(pattern, rawInput))),
    fileNames: extractMatches(FILE_NAME_PATTERN, rawInput),
    urls: extractMatches(URL_PATTERN, rawInput),
    languages: extractKeywordMatches(rawInput, LANGUAGE_NAMES),
    frameworks: extractKeywordMatches(rawInput, FRAMEWORK_NAMES),
    comparisonItems: extractComparisonItems(rawInput),
  };
}

function summarizeInput(rawInput: string): string {
  const normalized = rawInput.replace(/\s+/g, ' ').trim();
  return normalized || 'the user request';
}

function inferIssue(rawInput: string): string {
  const sentence = rawInput
    .split(/[.!?]/)
    .map((segment) => segment.trim())
    .find((segment) => /\b(error|bug|issue|failing|broken|problem)\b/i.test(segment));

  return sentence ?? summarizeInput(rawInput);
}

function deriveSlotValue(slotKey: string, rawInput: string, entities: DetectedEntities): SlotResolution {
  const normalizedSlotKey = slotKey.toLowerCase();

  if (/(date|deadline|timestamp|date_range)/.test(normalizedSlotKey) && entities.dates.length > 0) {
    return { value: entities.dates.join(', '), source: 'detected-date' };
  }

  if (/(version|runtime_version|dependency_version)/.test(normalizedSlotKey) && entities.versions.length > 0) {
    return { value: entities.versions.join(', '), source: 'detected-version' };
  }

  if (/(version|runtime_version|dependency_version)/.test(normalizedSlotKey)) {
    return { value: 'the current version in scope', source: 'default-version' };
  }

  if (/(file|path|module)/.test(normalizedSlotKey) && entities.fileNames.length > 0) {
    return { value: entities.fileNames.join(', '), source: 'detected-file-name' };
  }

  if (/(file|path|module)/.test(normalizedSlotKey)) {
    return { value: 'the referenced file or module', source: 'default-file-name' };
  }

  if (/(url|link|endpoint|resource)/.test(normalizedSlotKey) && entities.urls.length > 0) {
    return { value: entities.urls.join(', '), source: 'detected-url' };
  }

  if (/language|lang/.test(normalizedSlotKey) && entities.languages.length > 0) {
    return { value: entities.languages.join(', '), source: 'detected-language' };
  }

  if (/language|lang/.test(normalizedSlotKey)) {
    return { value: 'the requested programming language', source: 'default-language' };
  }

  if (/(framework|library|stack)/.test(normalizedSlotKey) && entities.frameworks.length > 0) {
    return { value: entities.frameworks.join(', '), source: 'detected-framework' };
  }

  if (/(framework|library|stack)/.test(normalizedSlotKey)) {
    return { value: 'the relevant framework or runtime', source: 'default-framework' };
  }

  if (/comparison_items/.test(normalizedSlotKey) && entities.comparisonItems.length > 0) {
    return { value: entities.comparisonItems.join(' vs '), source: 'derived-comparison-items' };
  }

  if (/(issue|problem|bug)/.test(normalizedSlotKey)) {
    return { value: inferIssue(rawInput), source: 'derived-issue' };
  }

  if (/(task|question|topic|feature_request|project_name|data_source|context|details|summary|content_type|audience)/.test(
    normalizedSlotKey,
  )) {
    return { value: summarizeInput(rawInput), source: 'derived-request-summary' };
  }

  if (/constraints|requirements/.test(normalizedSlotKey)) {
    return {
      value: 'Preserve the user intent, keep the answer accurate, and honor the stated environment.',
      source: 'default-constraints',
    };
  }

  if (/tone/.test(normalizedSlotKey)) {
    return { value: 'clear, practical, and aligned with the request', source: 'default-tone' };
  }

  if (/output_format/.test(normalizedSlotKey)) {
    return { value: 'a structured response with headings and direct action items', source: 'default-output-format' };
  }

  if (/length_constraint/.test(normalizedSlotKey)) {
    return { value: 'keep the answer concise but complete', source: 'default-length-constraint' };
  }

  return { value: summarizeInput(rawInput), source: 'default-request-summary' };
}

/**
 * Fills a template's slots using regex-based entity detection and safe fallback defaults.
 */
export function fillTemplateSlots(
  rawInput: string,
  template: string,
): { filledTemplate: string; slotMappings: TemplateSlot[] } {
  const entities = detectEntities(rawInput);
  const slotMap = new Map<string, SlotResolution>();

  const filledTemplate = template.replace(SLOT_PATTERN, (_match, slotKey: string) => {
    const existingResolution = slotMap.get(slotKey);

    if (existingResolution) {
      return existingResolution.value;
    }

    const resolution = deriveSlotValue(slotKey, rawInput, entities);
    slotMap.set(slotKey, resolution);
    return resolution.value;
  });

  const slotMappings: TemplateSlot[] = [...slotMap.entries()].map(([key, resolution]) => ({
    key,
    value: resolution.value,
    source: resolution.source,
  }));

  return {
    filledTemplate,
    slotMappings,
  };
}
