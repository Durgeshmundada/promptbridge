import { IntentType } from '../../types';
import type { IntentClassification } from '../../types';

interface IntentRule {
  intent: IntentType;
  keywords: string[];
  patterns: RegExp[];
  subIntentResolver: (normalizedInput: string) => string;
}

interface ScoredIntent {
  intent: IntentType;
  score: number;
  subIntent: string;
  signalCount: number;
}

const LOW_CONFIDENCE_THRESHOLD = 0.6;

/*
Keyword strategy by intent:
- CODING: programming, debugging, implementation, review, tests, repositories, stack traces.
- CREATIVE: story, poem, script, brainstorm, tone, narrative, lyrics, tagline language.
- DATA_ANALYSIS: dataset, metrics, regression, SQL, trends, charting, statistics, anomalies.
- QUESTION_FACTUAL: direct fact-seeking language such as what/who/when/where/define/capital.
- QUESTION_CONCEPTUAL: explanatory language such as why/how/explain/theory/intuition/difference.
- COMMAND_SYSTEM: shell and OS actions like run/install/delete/move/terminal/bash/powershell/git.
- COMMAND_DATA: structured data verbs like sort/filter/group/transform/aggregate/parse/export.
- RESEARCH: evidence-oriented language like research, citations, literature, sources, investigate.
- MEDICAL: symptoms, diagnosis, medication, treatment, side effects, clinical and patient terms.
- LEGAL: contract, statute, liability, compliance, regulation, clause, rights, jurisdiction.
- GENERAL: generic request terms such as help, advice, improve, overview, plan, assist.
*/
const INTENT_RULES: IntentRule[] = [
  {
    intent: IntentType.CODING,
    keywords: [
      'code',
      'debug',
      'bug',
      'stack trace',
      'error',
      'function',
      'class',
      'typescript',
      'javascript',
      'python',
      'refactor',
      'repository',
      'test',
      'api',
      'compile',
      'build',
      'review',
    ],
    patterns: [
      /\b(?:function|class|interface|const|let|var)\b/i,
      /\b(?:ts|tsx|js|jsx|py|java|go|rs|rb|php|swift|kt)\b/i,
      /`[^`]+`/,
      /\b(?:traceback|exception|segmentation fault|null pointer)\b/i,
      /^\s*fix\s+(?:it|this|that)\b/i,
    ],
    subIntentResolver: (normalizedInput) => {
      if (/\b(debug|bug|fix|error|broken|failing)\b/.test(normalizedInput)) {
        return 'debugging';
      }
      if (/\b(feature|implement|build|add|create)\b/.test(normalizedInput)) {
        return 'feature-implementation';
      }
      if (/\b(refactor|cleanup|simplify|optimize)\b/.test(normalizedInput)) {
        return 'refactoring';
      }
      if (/\b(review|audit|inspect)\b/.test(normalizedInput)) {
        return 'code-review';
      }
      return 'coding-assistance';
    },
  },
  {
    intent: IntentType.CREATIVE,
    keywords: [
      'story',
      'poem',
      'creative',
      'brainstorm',
      'tagline',
      'slogan',
      'narrative',
      'lyrics',
      'character',
      'scene',
      'script',
      'fiction',
      'metaphor',
      'tone',
      'dialogue',
    ],
    patterns: [/\bwrite\b.+\b(?:story|poem|script|scene|song)\b/i, /\bbrainstorm\b/i],
    subIntentResolver: (normalizedInput) => {
      if (/\b(poem|lyrics|song)\b/.test(normalizedInput)) {
        return 'poetic-writing';
      }
      if (/\b(story|fiction|scene|dialogue|character)\b/.test(normalizedInput)) {
        return 'narrative-writing';
      }
      if (/\b(tagline|slogan|brand)\b/.test(normalizedInput)) {
        return 'marketing-creative';
      }
      return 'creative-writing';
    },
  },
  {
    intent: IntentType.DATA_ANALYSIS,
    keywords: [
      'dataset',
      'analyze',
      'analysis',
      'spreadsheet',
      'csv',
      'sql',
      'trend',
      'correlation',
      'regression',
      'anomaly',
      'metric',
      'kpi',
      'histogram',
      'chart',
      'statistics',
      'variance',
    ],
    patterns: [/\bselect\b.+\bfrom\b/i, /\b(?:mean|median|standard deviation)\b/i],
    subIntentResolver: (normalizedInput) => {
      if (/\b(compare|trend|forecast)\b/.test(normalizedInput)) {
        return 'trend-analysis';
      }
      if (/\b(anomaly|outlier)\b/.test(normalizedInput)) {
        return 'anomaly-detection';
      }
      if (/\b(sql|query|table)\b/.test(normalizedInput)) {
        return 'query-analysis';
      }
      return 'data-analysis';
    },
  },
  {
    intent: IntentType.QUESTION_FACTUAL,
    keywords: [
      'what is',
      'who is',
      'when is',
      'where is',
      'which',
      'define',
      'fact',
      'capital',
      'population',
      'release date',
      'founder',
    ],
    patterns: [/^\s*(what|who|when|where|which)\b/i, /\b(?:exactly|factually|specifically)\b/i],
    subIntentResolver: (normalizedInput) => {
      if (/\b(who)\b/.test(normalizedInput)) {
        return 'person-fact';
      }
      if (/\b(when)\b/.test(normalizedInput)) {
        return 'time-fact';
      }
      if (/\b(where)\b/.test(normalizedInput)) {
        return 'location-fact';
      }
      return 'factual-question';
    },
  },
  {
    intent: IntentType.QUESTION_CONCEPTUAL,
    keywords: [
      'why',
      'how',
      'how does',
      'explain',
      'concept',
      'intuition',
      'theory',
      'difference',
      'compare conceptually',
      'mechanism',
      'principle',
      'reasoning',
    ],
    patterns: [
      /^\s*(why|how)\b/i,
      /\b(?:intuition|mental model|conceptually)\b/i,
      /\bexplain how\b/i,
      /\bhow\b.+\bworks?\b/i,
    ],
    subIntentResolver: (normalizedInput) => {
      if (/\b(compare|difference|versus|vs)\b/.test(normalizedInput)) {
        return 'concept-comparison';
      }
      if (/\b(how)\b/.test(normalizedInput)) {
        return 'mechanism-explanation';
      }
      return 'concept-explanation';
    },
  },
  {
    intent: IntentType.COMMAND_SYSTEM,
    keywords: [
      'run',
      'execute',
      'install',
      'terminal',
      'shell',
      'bash',
      'powershell',
      'command',
      'chmod',
      'git',
      'docker',
      'delete file',
      'rename file',
      'move file',
      'kill process',
    ],
    patterns: [
      /\b(?:npm|pnpm|yarn|pip|apt|brew|git|docker|kubectl)\b/i,
      /\b(?:rm|mv|cp|ls|cd|mkdir|chmod)\b/i,
    ],
    subIntentResolver: (normalizedInput) => {
      if (/\b(install|setup|configure)\b/.test(normalizedInput)) {
        return 'environment-setup';
      }
      if (/\b(git|commit|branch|merge)\b/.test(normalizedInput)) {
        return 'version-control';
      }
      return 'system-command';
    },
  },
  {
    intent: IntentType.COMMAND_DATA,
    keywords: [
      'delete',
      'drop',
      'truncate',
      'sort',
      'filter',
      'group',
      'aggregate',
      'parse',
      'transform',
      'database',
      'table',
      'row',
      'rows',
      'record',
      'records',
      'merge rows',
      'dedupe',
      'clean data',
      'json',
      'csv',
      'table',
      'schema',
      'extract',
      'convert',
    ],
    patterns: [
      /\b(?:json|csv|xml|yaml)\b/i,
      /\b(?:group by|order by|join)\b/i,
      /\b(?:delete|drop|truncate|purge)\b.+\b(?:database|table|row|rows|record|records|user|users)\b/i,
    ],
    subIntentResolver: (normalizedInput) => {
      if (/\b(filter|sort|group|aggregate)\b/.test(normalizedInput)) {
        return 'data-transformation';
      }
      if (/\b(parse|extract|convert)\b/.test(normalizedInput)) {
        return 'data-extraction';
      }
      return 'data-command';
    },
  },
  {
    intent: IntentType.RESEARCH,
    keywords: [
      'research',
      'tell me about',
      'citations',
      'sources',
      'literature',
      'study',
      'paper',
      'evidence',
      'investigate',
      'survey the field',
      'synthesize',
      'bibliography',
      'compare studies',
    ],
    patterns: [
      /\b(?:cite|citation|source|doi|paper)\b/i,
      /\b(?:literature review|systematic review)\b/i,
      /\btell me about\b/i,
    ],
    subIntentResolver: (normalizedInput) => {
      if (/\b(compare|synthesize|survey)\b/.test(normalizedInput)) {
        return 'research-synthesis';
      }
      if (/\btell me about\b/.test(normalizedInput)) {
        return 'topic-briefing';
      }
      if (/\b(source|citation|evidence)\b/.test(normalizedInput)) {
        return 'evidence-gathering';
      }
      return 'research';
    },
  },
  {
    intent: IntentType.MEDICAL,
    keywords: [
      'symptom',
      'diagnosis',
      'medical',
      'doctor',
      'nurse',
      'patient',
      'medication',
      'dose',
      'dosage',
      'treatment',
      'side effect',
      'disease',
      'pain',
      'chest pain',
      'fever',
      'clinical',
    ],
    patterns: [/\b(?:symptoms?|dosage|contraindication|side effects?|chest pain)\b/i],
    subIntentResolver: (normalizedInput) => {
      if (/\b(medication|dose|dosage|side effect)\b/.test(normalizedInput)) {
        return 'medication-question';
      }
      if (/\b(symptom|diagnosis|pain|fever)\b/.test(normalizedInput)) {
        return 'symptom-question';
      }
      return 'medical-query';
    },
  },
  {
    intent: IntentType.LEGAL,
    keywords: [
      'legal',
      'law',
      'contract',
      'clause',
      'liability',
      'regulation',
      'compliance',
      'statute',
      'policy',
      'rights',
      'jurisdiction',
      'nda',
      'terms',
      'license',
    ],
    patterns: [/\b(?:contract|liability|statute|regulation|rights?)\b/i],
    subIntentResolver: (normalizedInput) => {
      if (/\b(contract|clause|agreement|nda)\b/.test(normalizedInput)) {
        return 'contract-analysis';
      }
      if (/\b(compliance|regulation|law|statute)\b/.test(normalizedInput)) {
        return 'regulatory-question';
      }
      return 'legal-query';
    },
  },
  {
    intent: IntentType.GENERAL,
    keywords: ['help', 'advice', 'overview', 'plan', 'assist', 'improve', 'general', 'idea'],
    patterns: [/^\s*(help|please help)\b/i],
    subIntentResolver: () => 'general-assistance',
  },
];

function countKeywordMatches(normalizedInput: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => {
    return normalizedInput.includes(keyword) ? count + 1 : count;
  }, 0);
}

function countPatternMatches(rawInput: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => {
    return pattern.test(rawInput) ? count + 1 : count;
  }, 0);
}

function scoreIntent(rawInput: string, normalizedInput: string, rule: IntentRule): ScoredIntent {
  const keywordMatches = countKeywordMatches(normalizedInput, rule.keywords);
  const patternMatches = countPatternMatches(rawInput, rule.patterns);
  const score = keywordMatches * 1.05 + patternMatches * 1.45;

  return {
    intent: rule.intent,
    score,
    subIntent: rule.subIntentResolver(normalizedInput),
    signalCount: keywordMatches + patternMatches,
  };
}

function calculateConfidence(top: ScoredIntent, runnerUp: ScoredIntent): number {
  if (top.score <= 0) {
    return 0.34;
  }

  const dominance = top.score / (top.score + runnerUp.score + 2.5);
  const marginBonus = Math.min(0.18, Math.max(0, top.score - runnerUp.score) * 0.07);
  const signalBonus = Math.min(0.14, top.signalCount * 0.035);
  const confidence = 0.18 + dominance * 0.62 + marginBonus + signalBonus;

  return Number(Math.min(0.97, confidence).toFixed(2));
}

/**
 * Classifies a raw user request into the best matching PromptBridge intent.
 */
export function classifyIntent(rawInput: string): IntentClassification {
  const normalizedInput = rawInput.toLowerCase().trim();
  const scoredIntents = INTENT_RULES.map((rule) => scoreIntent(rawInput, normalizedInput, rule)).sort(
    (left, right) => right.score - left.score,
  );

  const topIntent = scoredIntents[0];
  if (!topIntent || topIntent.score === 0) {
    return {
      intent: IntentType.GENERAL,
      confidence: 0.34,
      subIntent: 'general-assistance',
      needsClarification: true,
    };
  }

  const runnerUp = scoredIntents[1] ?? {
    intent: IntentType.GENERAL,
    score: 0,
    subIntent: 'general-assistance',
    signalCount: 0,
  };

  const confidence = calculateConfidence(topIntent, runnerUp);

  return {
    intent: topIntent.intent,
    confidence,
    subIntent: topIntent.subIntent,
    ...(confidence < LOW_CONFIDENCE_THRESHOLD ? { needsClarification: true } : {}),
  };
}
