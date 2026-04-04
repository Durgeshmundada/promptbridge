import type { TemplateSlot } from '../../types';

export type DiffSegmentType =
  | 'unchanged'
  | 'added'
  | 'neutralized'
  | 'redacted'
  | 'raw-vague'
  | 'raw-pii';

export interface DiffSegment {
  text: string;
  type: DiffSegmentType;
}

interface HighlightRange {
  start: number;
  end: number;
  type: DiffSegmentType;
}

const DIFF_TOKEN_PATTERN = /\S+\s*|\n/g;
const VAGUE_REFERENCE_PATTERN = /\b(it|this|that|things?|stuff|maybe|kinda|somehow)\b/gi;
const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g,
  /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g,
  /(sk-[a-zA-Z0-9]{32,}|Bearer [a-zA-Z0-9._-]+|ghp_[a-zA-Z0-9]{36})/g,
  /(password|pwd|passwd)\s*(is|=|:)\s*\S+/gi,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
];
const REDACTION_MARKER_PATTERN = /\[(?:EMAIL|PHONE|API_KEY|PASSWORD|CC|SSN)\s+REDACTED\]/i;
const NEUTRALIZATION_PATTERN =
  /\b(clarification|clarified|scope|constraint|constraints|specific|explicit|resolved|referent|assumption|context|referenced|issue|requirements|details|evidence|steps)\b/i;
const NEUTRALIZATION_BRIDGE_PATTERN = /^\s*(?:the|a|an|to|of|from|for|with|and|or|current|available)\s*$/i;

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  return segments.reduce<DiffSegment[]>((merged, segment) => {
    const previousSegment = merged[merged.length - 1];

    if (previousSegment && previousSegment.type === segment.type) {
      previousSegment.text += segment.text;
      return merged;
    }

    merged.push({ ...segment });
    return merged;
  }, []);
}

function buildLcsMatrix(left: string[], right: string[]): number[][] {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] =
        left[leftIndex].trim() === right[rightIndex].trim()
          ? matrix[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }

  return matrix;
}

function tokenize(text: string): string[] {
  return text.match(DIFF_TOKEN_PATTERN) ?? [];
}

function classifyAddedSegment(text: string, slotMappings: TemplateSlot[]): DiffSegmentType {
  if (REDACTION_MARKER_PATTERN.test(text)) {
    return 'redacted';
  }

  const normalizedText = text.toLowerCase();
  const containsResolvedSlotValue = slotMappings.some((slotMapping) => {
    const normalizedValue = slotMapping.value.trim().toLowerCase();
    return normalizedValue.length > 3 && normalizedText.includes(normalizedValue);
  });

  if (containsResolvedSlotValue || NEUTRALIZATION_PATTERN.test(text)) {
    return 'neutralized';
  }

  return 'added';
}

function promoteNeutralizationBridgeSegments(segments: DiffSegment[]): DiffSegment[] {
  return segments.map((segment, index) => {
    if (segment.type !== 'added' || !NEUTRALIZATION_BRIDGE_PATTERN.test(segment.text)) {
      return segment;
    }

    const previousSegment = segments[index - 1];
    const nextSegment = segments[index + 1];

    if (previousSegment?.type === 'neutralized' || nextSegment?.type === 'neutralized') {
      return {
        ...segment,
        type: 'neutralized',
      };
    }

    return segment;
  });
}

export function buildEnrichedSegments(
  rawInput: string,
  enrichedPrompt: string,
  slotMappings: TemplateSlot[],
): DiffSegment[] {
  const rawTokens = tokenize(rawInput);
  const enrichedTokens = tokenize(enrichedPrompt);
  const lcsMatrix = buildLcsMatrix(rawTokens, enrichedTokens);
  const segments: DiffSegment[] = [];
  let rawIndex = 0;
  let enrichedIndex = 0;

  while (rawIndex < rawTokens.length && enrichedIndex < enrichedTokens.length) {
    if (rawTokens[rawIndex].trim() === enrichedTokens[enrichedIndex].trim()) {
      segments.push({ text: enrichedTokens[enrichedIndex], type: 'unchanged' });
      rawIndex += 1;
      enrichedIndex += 1;
      continue;
    }

    if (lcsMatrix[rawIndex][enrichedIndex + 1] >= lcsMatrix[rawIndex + 1][enrichedIndex]) {
      segments.push({
        text: enrichedTokens[enrichedIndex],
        type: classifyAddedSegment(enrichedTokens[enrichedIndex], slotMappings),
      });
      enrichedIndex += 1;
      continue;
    }

    rawIndex += 1;
  }

  while (enrichedIndex < enrichedTokens.length) {
    segments.push({
      text: enrichedTokens[enrichedIndex],
      type: classifyAddedSegment(enrichedTokens[enrichedIndex], slotMappings),
    });
    enrichedIndex += 1;
  }

  return mergeSegments(promoteNeutralizationBridgeSegments(segments));
}

function collectRanges(input: string, pattern: RegExp, type: DiffSegmentType): HighlightRange[] {
  return [...input.matchAll(pattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    type,
  }));
}

export function buildRawSegments(rawInput: string): DiffSegment[] {
  const ranges = [
    ...PII_PATTERNS.flatMap((pattern) => collectRanges(rawInput, pattern, 'raw-pii')),
    ...collectRanges(rawInput, VAGUE_REFERENCE_PATTERN, 'raw-vague'),
  ].sort((left, right) => left.start - right.start || left.end - right.end);

  const segments: DiffSegment[] = [];
  let cursor = 0;

  ranges.forEach((range) => {
    if (range.start < cursor) {
      return;
    }

    if (range.start > cursor) {
      segments.push({
        text: rawInput.slice(cursor, range.start),
        type: 'unchanged',
      });
    }

    segments.push({
      text: rawInput.slice(range.start, range.end),
      type: range.type,
    });
    cursor = range.end;
  });

  if (cursor < rawInput.length) {
    segments.push({
      text: rawInput.slice(cursor),
      type: 'unchanged',
    });
  }

  return segments.length > 0 ? mergeSegments(segments) : [{ text: rawInput, type: 'unchanged' }];
}

export function getSegmentClasses(type: DiffSegmentType): string {
  switch (type) {
    case 'added':
      return 'rounded bg-[var(--pb-success-bg)] px-1 text-[var(--pb-success)]';
    case 'neutralized':
    case 'raw-vague':
      return 'rounded bg-[var(--pb-warning-bg)] px-1 text-[var(--pb-warning)]';
    case 'redacted':
    case 'raw-pii':
      return 'rounded bg-[var(--pb-danger-bg)] px-1 text-[var(--pb-danger)]';
    case 'unchanged':
    default:
      return '';
  }
}
