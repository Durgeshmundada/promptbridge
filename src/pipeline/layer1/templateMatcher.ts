import { IntentType } from '../../types';
import { RatingValue } from '../../types';
import type {
  IntentClassification,
  MatchZone as SharedMatchZone,
  PromptRating,
  PromptTemplate,
} from '../../types';
import { loadTemplatesFromRuntime } from '../../utils/templateServiceRuntime';
import { getFromLocal } from '../../utils/storage';

interface RankedTemplate {
  template: PromptTemplate;
  similarity: number;
}

interface TemplateRatingAggregate {
  upVotes: number;
  downVotes: number;
}

export type MatchZone = SharedMatchZone;

export interface MatchResult {
  zone: MatchZone;
  template: PromptTemplate | null;
  score: number;
  isNewTemplate: boolean;
}

const PINNED_TEMPLATE_WEIGHT_BOOST = 8;
const GENERATED_TEMPLATES_STORAGE_KEY = 'pb_templates_generated';
const LEGACY_TEMPLATES_STORAGE_KEY = 'templates';

const TEMPLATE_LIBRARY: PromptTemplate[] = [
  {
    id: 'coding-debug',
    intentType: IntentType.CODING,
    template:
      'Persona: {{persona_context}}\nDomain: {{domain_context}}\nTask: Debug {{file_name}} in a {{language}} / {{framework}} project.\nIssue: {{issue}}\nRelevant version: {{version}}\nContext: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Diagnose coding failures, isolate likely root causes, and propose a concrete fix with validation steps.',
    tags: ['coding', 'debug', 'bug-fix', 'stack-trace', 'validation'],
    weight: 1.22,
  },
  {
    id: 'coding-feature',
    intentType: IntentType.CODING,
    template:
      'Persona: {{persona_context}}\nBuild a {{feature_request}} for {{project_name}} using {{language}} and {{framework}}.\nPrimary files: {{file_name}}\nRequirements: {{constraints}}\nReference context: {{context}}\nExpected output: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Implement a new software feature with explicit requirements, project context, and delivery expectations.',
    tags: ['coding', 'feature', 'implementation', 'project', 'requirements'],
    weight: 1.18,
  },
  {
    id: 'coding-refactor',
    intentType: IntentType.CODING,
    template:
      'Persona: {{persona_context}}\nRefactor {{file_name}} in {{language}} / {{framework}}.\nGoal: {{task}}\nTechnical debt: {{issue}}\nConstraints: {{constraints}}\nRelevant context: {{context}}\nDesired output: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Restructure existing code for clarity, maintainability, and performance without changing intended behavior.',
    tags: ['coding', 'refactor', 'cleanup', 'maintainability', 'optimization'],
    weight: 1.14,
  },
  {
    id: 'coding-review',
    intentType: IntentType.CODING,
    template:
      'Persona: {{persona_context}}\nReview {{file_name}} for a {{language}} / {{framework}} codebase.\nFocus areas: {{constraints}}\nCode context: {{context}}\nUser request: {{task}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Perform a code review that highlights bugs, regressions, risks, and test gaps with prioritized findings.',
    tags: ['coding', 'review', 'audit', 'bugs', 'tests'],
    weight: 1.16,
  },
  {
    id: 'creative-writing',
    intentType: IntentType.CREATIVE,
    template:
      'Persona: {{persona_context}}\nCreate a {{content_type}} about {{topic}}.\nTone: {{tone}}\nAudience: {{audience}}\nCreative constraints: {{constraints}}\nReference context: {{context}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Generate polished creative writing with a specific tone, audience, and artistic constraint set.',
    tags: ['creative', 'writing', 'tone', 'audience', 'narrative'],
    weight: 1.08,
  },
  {
    id: 'step-by-step-explain',
    intentType: IntentType.QUESTION_CONCEPTUAL,
    template:
      'Persona: {{persona_context}}\nExplain {{topic}} step by step.\nLanguage focus: {{language}}\nCurrent context: {{context}}\nUser goal: {{task}}\nUse domain context: {{domain_context}}\nRequired structure: 1) Concept in plain English 2) Step-by-step algorithm 3) {{language}} code with inline comments when a language is provided 4) Time/space complexity.\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Teach a concept progressively with a simple starting point, mechanism breakdown, and practical examples.',
    tags: ['explain', 'step-by-step', 'concept', 'teaching', 'walkthrough'],
    weight: 1.1,
  },
  {
    id: 'factual-qa',
    intentType: IntentType.QUESTION_FACTUAL,
    template:
      'Persona: {{persona_context}}\nAnswer the factual question: {{question}}\nContext available: {{context}}\nIf relevant, mention date {{date}} and source link {{url}}.\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Return a concise factual answer with direct evidence, dates, and source-friendly wording.',
    tags: ['factual', 'qa', 'facts', 'date', 'source'],
    weight: 1.12,
  },
  {
    id: 'research-synthesis',
    intentType: IntentType.RESEARCH,
    template:
      'Persona: {{persona_context}}\nSynthesize research on {{topic}}.\nScope: {{constraints}}\nKnown context: {{context}}\nCitations or source hints: {{url}}\nRequired output: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Survey a topic, compare evidence, and synthesize findings into a structured research brief.',
    tags: ['research', 'synthesis', 'sources', 'citations', 'evidence'],
    weight: 1.24,
  },
  {
    id: 'command-execution',
    intentType: IntentType.COMMAND_SYSTEM,
    template:
      'Persona: {{persona_context}}\nProvide safe execution steps for {{task}}.\nEnvironment: {{context}}\nRelevant files or paths: {{file_name}}\nVersion details: {{version}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Produce actionable shell or environment commands with safety notes, ordering, and expected outcomes.',
    tags: ['command', 'terminal', 'execution', 'shell', 'system'],
    weight: 1.15,
  },
  {
    id: 'data-analysis',
    intentType: IntentType.DATA_ANALYSIS,
    template:
      'Persona: {{persona_context}}\nAnalyze {{data_source}} for {{topic}}.\nMetrics of interest: {{constraints}}\nContext: {{context}}\nRelevant date range: {{date}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Inspect structured data, identify patterns, and summarize findings with methodology and caveats.',
    tags: ['data', 'analysis', 'metrics', 'dataset', 'insights'],
    weight: 1.18,
  },
  {
    id: 'medical-query',
    intentType: IntentType.MEDICAL,
    template:
      'Persona: {{persona_context}}\nAddress the medical question: {{question}}\nSymptoms or topic: {{topic}}\nKnown context: {{context}}\nRelevant date or duration: {{date}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Provide careful medical information with symptom framing, practical next steps, and safety boundaries.',
    tags: ['medical', 'symptoms', 'health', 'treatment', 'safety'],
    weight: 1.23,
  },
  {
    id: 'legal-query',
    intentType: IntentType.LEGAL,
    template:
      'Persona: {{persona_context}}\nAddress the legal question: {{question}}\nJurisdiction or policy context: {{context}}\nDocument or clause: {{file_name}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Provide careful legal analysis with issue framing, relevant principles, and practical risk notes.',
    tags: ['legal', 'contract', 'compliance', 'liability', 'policy'],
    weight: 1.23,
  },
  {
    id: 'comparison',
    intentType: IntentType.QUESTION_CONCEPTUAL,
    template:
      'Persona: {{persona_context}}\nCompare {{comparison_items}} for {{topic}}.\nKnown context: {{context}}\nDecision criteria: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Compare options side by side, highlight tradeoffs, and recommend when each option fits best.',
    tags: ['comparison', 'tradeoffs', 'versus', 'decision', 'options'],
    weight: 1.1,
  },
  {
    id: 'summarization',
    intentType: IntentType.GENERAL,
    template:
      'Persona: {{persona_context}}\nSummarize {{topic}}.\nSource context: {{context}}\nAudience: {{audience}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Condense source material into a clear summary that preserves the most important points and actions.',
    tags: ['summary', 'summarize', 'condense', 'overview', 'key-points'],
    weight: 1.05,
  },
  {
    id: 'general',
    intentType: IntentType.GENERAL,
    template:
      'Persona: {{persona_context}}\nHelp with {{task}}.\nContext: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
    description:
      'Handle open-ended requests with a balanced, clear, and adaptable response structure.',
    tags: ['general', 'help', 'assist', 'overview', 'support'],
    weight: 1,
  },
];

function tokenize(text: string): string[] {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9.+#/\s-]/g, ' ');
  return normalizedText.split(/\s+/).filter((token) => token.length > 1);
}

function buildDocument(template: PromptTemplate): string {
  return [
    template.id.replace(/-/g, ' '),
    template.intentType.replace(/_/g, ' '),
    template.description,
    template.tags.join(' '),
    template.template,
  ].join(' ');
}

function cloneTemplateLibrary(templateLibrary: PromptTemplate[]): PromptTemplate[] {
  return templateLibrary.map((template) => ({
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  }));
}

function normalizeScore(score: number): number {
  return Number(Math.min(1, Math.max(0, (score - 0.2) / 0.4)).toFixed(2));
}

function computeTermFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();

  tokens.forEach((token) => {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  });

  return frequencies;
}

function buildVocabulary(documents: string[][]): string[] {
  const vocabulary = new Set<string>();

  documents.forEach((documentTokens) => {
    documentTokens.forEach((token) => {
      vocabulary.add(token);
    });
  });

  return [...vocabulary];
}

function computeInverseDocumentFrequency(documents: string[][], vocabulary: string[]): Map<string, number> {
  const documentCount = documents.length;
  const idf = new Map<string, number>();

  vocabulary.forEach((term) => {
    const containingDocuments = documents.reduce((count, documentTokens) => {
      return documentTokens.includes(term) ? count + 1 : count;
    }, 0);

    idf.set(term, Math.log((documentCount + 1) / (containingDocuments + 1)) + 1);
  });

  return idf;
}

function vectorize(tokens: string[], vocabulary: string[], idf: Map<string, number>): number[] {
  const termFrequency = computeTermFrequency(tokens);
  const tokenCount = tokens.length || 1;

  return vocabulary.map((term) => {
    const tf = (termFrequency.get(term) ?? 0) / tokenCount;
    return tf * (idf.get(term) ?? 0);
  });
}

function cosineSimilarity(left: number[], right: number[]): number {
  const dotProduct = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (leftMagnitude * rightMagnitude);
}

function rankTemplates(
  intentClassification: IntentClassification,
  rawInput: string,
  templateLibrary: PromptTemplate[],
): RankedTemplate[] {
  const library = templateLibrary.length > 0 ? templateLibrary : TEMPLATE_LIBRARY;
  const templateDocuments = library.map((template) => tokenize(buildDocument(template)));
  const queryDocument = tokenize(buildQueryText(intentClassification, rawInput));
  const vocabulary = buildVocabulary([...templateDocuments, queryDocument]);
  const idf = computeInverseDocumentFrequency([...templateDocuments, queryDocument], vocabulary);
  const queryVector = vectorize(queryDocument, vocabulary, idf);

  return library
    .map((template, index) => {
      const tfIdfVector = vectorize(templateDocuments[index], vocabulary, idf);
      const similarity = cosineSimilarity(queryVector, tfIdfVector);
      const weightedSimilarity =
        similarity * 0.74 +
        computeIntentBonus(template, intentClassification, rawInput) +
        template.weight * 0.08;

      return {
        template: {
          ...template,
          tfIdfVector,
        },
        similarity: weightedSimilarity,
      };
    })
    .sort((left, right) => right.similarity - left.similarity);
}

function mergeTemplateSources(
  generatedTemplates: PromptTemplate[],
  legacyTemplates: PromptTemplate[],
): PromptTemplate[] {
  const mergedTemplates = cloneTemplateLibrary(TEMPLATE_LIBRARY);
  const protectedTemplateIds = new Set(mergedTemplates.map((template) => template.id));
  const appendableTemplates = [...generatedTemplates, ...legacyTemplates];

  appendableTemplates.forEach((template) => {
    if (!template.id.trim() || protectedTemplateIds.has(template.id)) {
      return;
    }

    protectedTemplateIds.add(template.id);
    mergedTemplates.push({
      ...template,
      tags: [...template.tags],
      ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
    });
  });

  return mergedTemplates;
}

function buildQueryText(intentClassification: IntentClassification, rawInput: string): string {
  return [
    rawInput,
    intentClassification.intent.replace(/_/g, ' '),
    intentClassification.subIntent,
    intentClassification.needsClarification ? 'clarify ambiguity' : 'confident intent match',
  ].join(' ');
}

function computeIntentBonus(
  template: PromptTemplate,
  intentClassification: IntentClassification,
  rawInput: string,
): number {
  let bonus = template.intentType === intentClassification.intent ? 0.18 : 0;
  const normalizedInput = rawInput.toLowerCase();

  if (template.id === 'comparison' && /\b(compare|comparison|difference|versus|vs)\b/.test(normalizedInput)) {
    bonus += 0.16;
  }

  if (template.id === 'summarization' && /\b(summary|summarize|recap|condense)\b/.test(normalizedInput)) {
    bonus += 0.16;
  }

  if (template.id === 'coding-review' && /\b(review|audit|inspect)\b/.test(normalizedInput)) {
    bonus += 0.14;
  }

  if (template.id === 'coding-debug' && /\b(error|bug|debug|failing|broken)\b/.test(normalizedInput)) {
    bonus += 0.14;
  }

  if (
    template.id === 'step-by-step-explain' &&
    /\b(explain|walk me through|step by step|how)\b/.test(normalizedInput)
  ) {
    bonus += 0.18;
  }

  if (
    template.id === 'step-by-step-explain' &&
    /\b(binary search|algorithm|data structure|complexity|runtime|big o)\b/.test(normalizedInput)
  ) {
    bonus += 0.16;
  }

  return bonus;
}

/**
 * Matches a classified request against the PromptBridge template library and returns the top 3 templates.
 */
export function matchTemplates(
  intentClassification: IntentClassification,
  rawInput: string,
  templateLibrary: PromptTemplate[] = TEMPLATE_LIBRARY,
): PromptTemplate[] {
  return rankTemplates(intentClassification, rawInput, templateLibrary)
    .slice(0, 3)
    .map((entry) => entry.template);
}

/**
 * Maps a numeric match score into one of the three template-resolution zones.
 */
export function getMatchZone(score: number): MatchZone {
  if (score >= 0.8) {
    return 'DIRECT';
  }

  if (score >= 0.5) {
    return 'PARTIAL';
  }

  return 'GENERATE';
}

/**
 * Returns the highest-ranked template match and its derived zone metadata.
 */
export function getTopMatch(
  intentClassification: IntentClassification,
  rawInput: string,
  templateLibrary: PromptTemplate[] = TEMPLATE_LIBRARY,
): MatchResult {
  const topRankedTemplate = rankTemplates(intentClassification, rawInput, templateLibrary)[0];
  const score = normalizeScore(topRankedTemplate?.similarity ?? 0);

  return {
    zone: getMatchZone(score),
    template: topRankedTemplate?.template ?? null,
    score,
    isNewTemplate: false,
  };
}

function aggregateRatings(ratings: PromptRating[]): Map<string, TemplateRatingAggregate> {
  return ratings.reduce<Map<string, TemplateRatingAggregate>>((aggregateMap, rating) => {
    const currentAggregate = aggregateMap.get(rating.templateId) ?? {
      upVotes: 0,
      downVotes: 0,
    };

    if (rating.rating === RatingValue.THUMBS_UP) {
      currentAggregate.upVotes += 1;
    } else {
      currentAggregate.downVotes += 1;
    }

    aggregateMap.set(rating.templateId, currentAggregate);
    return aggregateMap;
  }, new Map<string, TemplateRatingAggregate>());
}

/**
 * Adjusts template weights based on accumulated prompt ratings.
 */
export function adjustWeights(
  ratings: PromptRating[],
  templateLibrary: PromptTemplate[] = TEMPLATE_LIBRARY,
): PromptTemplate[] {
  const ratingMap = aggregateRatings(ratings);

  return cloneTemplateLibrary(templateLibrary).map((template) => {
    const aggregate = ratingMap.get(template.id);

    if (!aggregate) {
      return template;
    }

    const totalVotes = aggregate.upVotes + aggregate.downVotes;
    const sentiment = (aggregate.upVotes - aggregate.downVotes) / Math.max(1, totalVotes);
    const engagementLift = Math.min(0.08, totalVotes * 0.01);
    const nextWeight = template.weight + sentiment * 0.18 + engagementLift;

    return {
      ...template,
      weight: Number(Math.min(1.8, Math.max(0.8, nextWeight)).toFixed(2)),
    };
  });
}

/**
 * Boosts pinned templates for popup execution so a user can deliberately steer the next match.
 */
export function prioritizePinnedTemplates(
  templateLibrary: PromptTemplate[],
  pinnedTemplateIds: string[],
): PromptTemplate[] {
  if (pinnedTemplateIds.length === 0) {
    return cloneTemplateLibrary(templateLibrary);
  }

  const pinnedTemplateIdSet = new Set(pinnedTemplateIds);

  return cloneTemplateLibrary(templateLibrary)
    .map((template) => {
      if (!pinnedTemplateIdSet.has(template.id)) {
        return template;
      }

      return {
        ...template,
        weight: Number((template.weight + PINNED_TEMPLATE_WEIGHT_BOOST).toFixed(2)),
      };
    })
    .sort((left, right) => {
      const leftPinned = pinnedTemplateIdSet.has(left.id);
      const rightPinned = pinnedTemplateIdSet.has(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return right.weight - left.weight;
    });
}

/**
 * Loads the effective template library by merging the protected base templates with generated ones.
 */
export async function getAllTemplates(): Promise<PromptTemplate[]> {
  const runtimeTemplates = await loadTemplatesFromRuntime();

  if (runtimeTemplates && runtimeTemplates.length > 0) {
    return cloneTemplateLibrary(runtimeTemplates);
  }

  try {
    const [generatedTemplates, legacyTemplates] = await Promise.all([
      getFromLocal<PromptTemplate[]>(GENERATED_TEMPLATES_STORAGE_KEY),
      getFromLocal<PromptTemplate[]>(LEGACY_TEMPLATES_STORAGE_KEY),
    ]);

    return mergeTemplateSources(generatedTemplates ?? [], legacyTemplates ?? []);
  } catch {
    return cloneTemplateLibrary(TEMPLATE_LIBRARY);
  }
}

export { TEMPLATE_LIBRARY };
