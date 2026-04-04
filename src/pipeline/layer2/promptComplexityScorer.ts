import type { ComplexityScore } from '../../types';

interface ComplexityInput {
  rawInput: string;
  enrichedPrompt: string;
}

/*
Scoring rubric by dimension, each clamped to 1-10:
- Specificity: based on informative keyword density plus concrete markers like files, versions, URLs, or technical nouns.
- Context completeness: based on how many context signals are present and whether placeholders remain unresolved.
- Constraint clarity: based on explicit constraints such as must/avoid/within/focus/include/exclude/budget.
- Output definition: based on explicit response-format instructions such as sections, JSON, XML, bullets, tables, or output contracts.
Overall raw/enriched scores are the average of the four dimension scores, rounded to one decimal place.
*/

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
]);

const SPECIFICITY_MARKERS = [
  /\b(?:[\w-]+[\\/])*(?:[\w-]+\.)+(?:ts|tsx|js|jsx|json|md|py|java|kt|swift|go|rs|rb|php|sql)\b/gi,
  /\bhttps?:\/\/[^\s)]+/gi,
  /\bv?\d+(?:\.\d+){1,3}\b/g,
  /\b(?:React|TypeScript|JavaScript|Python|Node\.js|SQL|GraphQL|Docker|Kubernetes|OAuth)\b/gi,
];

const CONTEXT_SIGNALS = [
  /\bpersona:/i,
  /\bdomain:/i,
  /\bcontext:/i,
  /\btask:/i,
  /\btopic:/i,
  /\bquestion:/i,
  /\bconstraints?:/i,
  /\boutput format:/i,
  /\blength:/i,
  /\baudience:/i,
];

const CONSTRAINT_MARKERS = [
  /\bmust\b/i,
  /\bshould\b/i,
  /\bwithin\b/i,
  /\bunder\b/i,
  /\bonly\b/i,
  /\bavoid\b/i,
  /\binclude\b/i,
  /\bexclude\b/i,
  /\bwithout\b/i,
  /\bfocus on\b/i,
  /\bpreserve\b/i,
  /\bbudget\b/i,
  /\blimit\b/i,
];

const OUTPUT_MARKERS = [
  /\bjson\b/i,
  /\bxml\b/i,
  /\bmarkdown\b/i,
  /\bbullets?\b/i,
  /\btable\b/i,
  /\bsections?\b/i,
  /\bheadings?\b/i,
  /\boutput format:\b/i,
  /\bpromptbridge output contract:\b/i,
  /\brespond with\b/i,
  /\breturn\b/i,
  /\bnumbered\b/i,
];

function clampScore(value: number): number {
  return Number(Math.min(10, Math.max(1, value)).toFixed(1));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+#/-]+/)
    .filter(Boolean);
}

function countRegexHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => {
    pattern.lastIndex = 0;
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

function scoreSpecificity(text: string): number {
  const tokens = tokenize(text);
  const informativeTokens = tokens.filter((token) => token.length > 3 && !STOPWORDS.has(token));
  const density = tokens.length === 0 ? 0 : informativeTokens.length / tokens.length;
  const markerHits = countRegexHits(text, SPECIFICITY_MARKERS);

  return clampScore(1 + density * 7.5 + markerHits * 0.9);
}

function scoreContextCompleteness(text: string): number {
  const placeholderCount = (text.match(/{{\s*[\w-]+\s*}}/g) ?? []).length;
  const contextSignalHits = countRegexHits(text, CONTEXT_SIGNALS);
  const placeholderPenalty = placeholderCount > 0 ? placeholderCount * 1.8 : 0;
  const slotFillBaseline = placeholderCount === 0 ? 2.2 : 0.8;

  return clampScore(1 + slotFillBaseline + contextSignalHits * 0.85 - placeholderPenalty);
}

function scoreConstraintClarity(text: string): number {
  const constraintHits = countRegexHits(text, CONSTRAINT_MARKERS);
  return clampScore(1 + constraintHits * 1.15);
}

function scoreOutputDefinition(text: string): number {
  const outputHits = countRegexHits(text, OUTPUT_MARKERS);
  return clampScore(1 + outputHits * 1.1);
}

function computeCompositeScore(text: string): {
  overall: number;
  specificity: number;
  contextCompleteness: number;
  constraintClarity: number;
  outputDefinition: number;
} {
  const specificity = scoreSpecificity(text);
  const contextCompleteness = scoreContextCompleteness(text);
  const constraintClarity = scoreConstraintClarity(text);
  const outputDefinition = scoreOutputDefinition(text);
  const overall = clampScore(
    (specificity + contextCompleteness + constraintClarity + outputDefinition) / 4,
  );

  return {
    overall,
    specificity,
    contextCompleteness,
    constraintClarity,
    outputDefinition,
  };
}

/**
 * Scores raw and enriched prompts across specificity, context, constraints, and output-definition dimensions.
 */
export function scorePromptComplexity(input: ComplexityInput): ComplexityScore {
  const rawScore = computeCompositeScore(input.rawInput);
  const enrichedScore = computeCompositeScore(input.enrichedPrompt);

  return {
    raw: rawScore.overall,
    enriched: enrichedScore.overall,
    delta: Number((enrichedScore.overall - rawScore.overall).toFixed(1)),
    breakdown: {
      rawSpecificity: rawScore.specificity,
      rawContextCompleteness: rawScore.contextCompleteness,
      rawConstraintClarity: rawScore.constraintClarity,
      rawOutputDefinition: rawScore.outputDefinition,
      enrichedSpecificity: enrichedScore.specificity,
      enrichedContextCompleteness: enrichedScore.contextCompleteness,
      enrichedConstraintClarity: enrichedScore.constraintClarity,
      enrichedOutputDefinition: enrichedScore.outputDefinition,
    },
  };
}
