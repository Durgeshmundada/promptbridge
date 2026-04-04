import { GapSeverity } from '../../types';
import type { KnowledgeGap } from '../../types';

interface RankedGap extends KnowledgeGap {
  rank: number;
}

const SAFE_ACRONYMS = new Set([
  'AI',
  'API',
  'CONCEPTUAL',
  'CONTRACT',
  'CODING',
  'COMMAND',
  'CREATIVE',
  'CPU',
  'CSS',
  'CSV',
  'DATA',
  'FACTUAL',
  'GENERAL',
  'ETL',
  'GPU',
  'HTML',
  'HTTP',
  'HTTPS',
  'IDE',
  'INTENT',
  'JSON',
  'JWT',
  'LEGAL',
  'LLM',
  'MEDICAL',
  'NLP',
  'OAuth',
  'OUTPUT',
  'PROMPTBRIDGE',
  'QUESTION',
  'RESEARCH',
  'SDK',
  'SQL',
  'SYSTEM',
  'UI',
  'URL',
  'URLs',
  'UX',
  'XML',
  'YAML',
]);

const GENERIC_OBJECT_WORDS = new Set([
  'anything',
  'details',
  'issue',
  'item',
  'problem',
  'something',
  'stuff',
  'subject',
  'task',
  'that',
  'thing',
  'things',
  'this',
]);

const VAGUE_PRONOUNS = ['it', 'this', 'that', 'these', 'those', 'they', 'them'];

const FILE_NAME_PATTERN =
  /\b(?:[\w-]+[\\/])*(?:[\w-]+\.)+(?:ts|tsx|js|jsx|json|md|py|java|kt|swift|go|rs|rb|php|css|scss|html|sql|yaml|yml|toml|sh)\b/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/i;
const GENERIC_DOCUMENT_REFERENCE_PATTERN =
  /\b(?:the|this|that|a|an)\s+(report|document|article|paper|memo|deck|presentation|brief|summary)\b/i;
const SUBJECT_MARKER_PATTERN =
  /\b(?:about|regarding|for|on|in|with|using|between|within)\s+(?!it\b|this\b|that\b|these\b|those\b|things\b|stuff\b)([a-z0-9][\w.+#/\-\s]{2,})/i;
const ARTICLE_SUBJECT_PATTERN =
  /\b(?:the|a|an)\s+(?!thing\b|stuff\b|issue\b|problem\b)([a-z][a-z0-9-]{2,})\b/i;
const QUOTED_PHRASE_PATTERN = /["'][^"']{3,80}["']/;
const CONSTRAINT_PATTERN =
  /\b(?:must|should|within|under|only|avoid|include|exclude|without|focus on|preserve|limit|maximum|min(?:imum)?|budget|deadline|scope|constraints?|format|length|exactly)\b/i;
const SCOPE_DETAIL_PATTERN =
  /\b(?:for|within|under|using|between|focused on|with focus on)\s+[a-z0-9][\w.+#/\-\s]{2,}/i;

const SEVERITY_RANK: Record<GapSeverity, number> = {
  [GapSeverity.HIGH]: 3,
  [GapSeverity.MEDIUM]: 2,
  [GapSeverity.LOW]: 1,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getContentTokens(prompt: string): string[] {
  return normalizeText(prompt)
    .toLowerCase()
    .split(/[^a-z0-9.+#/-]+/)
    .filter((token) => token.length > 2 && !GENERIC_OBJECT_WORDS.has(token));
}

function hasConcreteSubject(prompt: string): boolean {
  return (
    SUBJECT_MARKER_PATTERN.test(prompt) ||
    ARTICLE_SUBJECT_PATTERN.test(prompt) ||
    FILE_NAME_PATTERN.test(prompt) ||
    URL_PATTERN.test(prompt) ||
    QUOTED_PHRASE_PATTERN.test(prompt) ||
    getContentTokens(prompt).length >= 6
  );
}

function detectMissingSubject(prompt: string): KnowledgeGap | null {
  const normalizedPrompt = prompt.trim();
  const startsWithTaskVerb = /^(?:please\s+)?(?:help|fix|explain|summarize|analyze|review|write|compare|research|describe|give|provide)\b/i.test(
    normalizedPrompt,
  );
  const startsWithVagueReference = new RegExp(`^(?:${VAGUE_PRONOUNS.join('|')})\\b`, 'i').test(
    normalizedPrompt,
  );

  if ((startsWithTaskVerb || startsWithVagueReference) && !hasConcreteSubject(prompt)) {
    return {
      gap: 'Missing subject: the prompt does not identify a concrete topic, artifact, or target.',
      severity: GapSeverity.HIGH,
      suggestedFix: 'Specify the exact topic, file, system, document, or question that the prompt should address.',
    };
  }

  return null;
}

function detectGenericDocumentReference(prompt: string): KnowledgeGap | null {
  const genericDocumentMatch = prompt.match(GENERIC_DOCUMENT_REFERENCE_PATTERN);

  if (!genericDocumentMatch) {
    return null;
  }

  return {
    gap: `Missing subject: the prompt references a generic ${genericDocumentMatch[1].toLowerCase()} without identifying which one.`,
    severity: GapSeverity.HIGH,
    suggestedFix:
      'Name the exact report, memo, article, or document in scope, or paste the content that should be summarized.',
  };
}

function extractDefinedAcronyms(prompt: string): Set<string> {
  const definedAcronyms = new Set<string>();
  const beforePattern = /\b(?:[A-Za-z][A-Za-z0-9/-]*\s+){1,6}\(([A-Z]{2,})\)/g;
  const afterPattern = /\b([A-Z]{2,})\s*\(([^)]+)\)/g;

  for (const match of prompt.matchAll(beforePattern)) {
    definedAcronyms.add(match[1]);
  }

  for (const match of prompt.matchAll(afterPattern)) {
    definedAcronyms.add(match[1]);
  }

  return definedAcronyms;
}

function detectUndefinedAcronyms(prompt: string): KnowledgeGap | null {
  const definedAcronyms = extractDefinedAcronyms(prompt);
  const acronyms = [...prompt.matchAll(/\b[A-Z]{2,}(?:s)?\b/g)]
    .map((match) => match[0])
    .filter((acronym) => !SAFE_ACRONYMS.has(acronym) && !definedAcronyms.has(acronym));

  const uniqueAcronyms = [...new Set(acronyms)];

  if (uniqueAcronyms.length === 0) {
    return null;
  }

  return {
    gap: `Undefined acronym: ${uniqueAcronyms.join(', ')} is not expanded or previously defined.`,
    severity: GapSeverity.HIGH,
    suggestedFix: `Define ${uniqueAcronyms.join(', ')} before relying on it in the prompt.`,
  };
}

function detectAmbiguousPronouns(prompt: string): KnowledgeGap | null {
  const normalizedPrompt = normalizeText(prompt);
  const pronounPattern = new RegExp(`\\b(${VAGUE_PRONOUNS.join('|')})\\b`, 'gi');
  const pronouns = [...normalizedPrompt.matchAll(pronounPattern)].map((match) => match[0].toLowerCase());

  if (pronouns.length === 0) {
    return null;
  }

  if (!hasConcreteSubject(prompt)) {
    return {
      gap: `Ambiguous pronoun: ${[...new Set(pronouns)].join(', ')} has no clear referent in the prompt.`,
      severity: GapSeverity.HIGH,
      suggestedFix: 'Replace pronouns with the exact object, file, feature, clause, or dataset being referenced.',
    };
  }

  return null;
}

function detectMissingScope(prompt: string): KnowledgeGap | null {
  const normalizedPrompt = normalizeText(prompt);
  const broadRequestPattern =
    /\b(?:help|fix|explain|summarize|analyze|review|write|compare|research|describe|improve)\b/i;

  if (
    broadRequestPattern.test(normalizedPrompt) &&
    !CONSTRAINT_PATTERN.test(normalizedPrompt) &&
    !SCOPE_DETAIL_PATTERN.test(normalizedPrompt)
  ) {
    return {
      gap: 'Missing scope or constraints: the prompt lacks explicit limits, priorities, or response boundaries.',
      severity: GapSeverity.MEDIUM,
      suggestedFix: 'Add scope, exclusions, format preferences, time range, or environment constraints.',
    };
  }

  return null;
}

function rankGaps(gaps: KnowledgeGap[]): KnowledgeGap[] {
  const ranked: RankedGap[] = gaps.map((gap, index) => ({
    ...gap,
    rank: index,
  }));

  return ranked
    .sort((left, right) => {
      const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
      return severityDelta !== 0 ? severityDelta : left.rank - right.rank;
    })
    .map(({ rank: _rank, ...gap }) => gap);
}

/**
 * Detects blocking and non-blocking knowledge gaps in an enriched prompt before it advances further in the pipeline.
 */
export function detectKnowledgeGaps(enrichedPrompt: string): KnowledgeGap[] {
  const candidateGaps = [
    detectGenericDocumentReference(enrichedPrompt),
    detectMissingSubject(enrichedPrompt),
    detectUndefinedAcronyms(enrichedPrompt),
    detectAmbiguousPronouns(enrichedPrompt),
    detectMissingScope(enrichedPrompt),
  ].filter((gap): gap is KnowledgeGap => gap !== null);

  return rankGaps(candidateGaps);
}
