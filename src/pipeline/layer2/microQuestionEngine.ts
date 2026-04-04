import { GapSeverity } from '../../types';
import type { KnowledgeGap } from '../../types';

export interface MicroQuestionResult {
  question: string;
  targetGap: KnowledgeGap;
}

const SEVERITY_RANK: Record<GapSeverity, number> = {
  [GapSeverity.HIGH]: 3,
  [GapSeverity.MEDIUM]: 2,
  [GapSeverity.LOW]: 1,
};

function buildQuestion(targetGap: KnowledgeGap): string {
  const normalizedGap = targetGap.gap.toLowerCase();
  const acronymMatch = targetGap.gap.match(/Undefined acronym:\s*([^ ]+)/i);
  const pronounMatch = targetGap.gap.match(/Ambiguous pronoun:\s*([^ ]+)/i);
  const genericDocumentMatch = targetGap.gap.match(/generic\s+(\w+)\s+without identifying/i);

  if (genericDocumentMatch) {
    return `Which ${genericDocumentMatch[1].toLowerCase()} are you referring to? Please paste the content or describe it.`;
  }

  if (normalizedGap.includes('missing subject')) {
    return 'What exact topic, artifact, file, or question should this prompt focus on?';
  }

  if (normalizedGap.includes('undefined acronym') && acronymMatch) {
    return `What does ${acronymMatch[1].replace(/,$/, '')} stand for in this context?`;
  }

  if (normalizedGap.includes('ambiguous pronoun') && pronounMatch) {
    return `What specific referent should replace "${pronounMatch[1].replace(/,$/, '')}" in the prompt?`;
  }

  if (normalizedGap.includes('scope') || normalizedGap.includes('constraints')) {
    return 'What scope, exclusions, format preferences, or limits should the response follow?';
  }

  return 'What single missing detail should be clarified before proceeding?';
}

/**
 * Chooses the highest-severity blocking gap and converts it into one precise clarification question.
 */
export function generateMicroQuestion(
  knowledgeGaps: KnowledgeGap[],
): MicroQuestionResult | null {
  const highestSeverityGap = [...knowledgeGaps]
    .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])[0];

  if (!highestSeverityGap || highestSeverityGap.severity !== GapSeverity.HIGH) {
    return null;
  }

  return {
    question: buildQuestion(highestSeverityGap),
    targetGap: highestSeverityGap,
  };
}
