import { ConfidenceLevel } from '../../types';

export interface ConfidenceLevelExtractionResult {
  level: ConfidenceLevel;
  verifiedCount: number;
  likelyCount: number;
  unverifiedCount: number;
  noCitationCount: number;
  warningMessage: string | null;
}

const VERIFIED_PATTERN = /\[VERIFIED\]/g;
const LIKELY_PATTERN = /\[LIKELY\]/g;
const UNVERIFIED_PATTERN = /\[UNVERIFIED\]/g;
const NO_CITATION_PATTERN = /\[NO_CITATION\]/g;
const LOW_CONFIDENCE_WARNING =
  'This response contains significant unverified claims. Consider cross-checking with primary sources.';

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * Extracts confidence markers from an LLM response and derives an overall confidence level.
 */
export function extractConfidenceLevel(
  rawResponse: string,
): ConfidenceLevelExtractionResult {
  const verifiedCount = countMatches(rawResponse, VERIFIED_PATTERN);
  const likelyCount = countMatches(rawResponse, LIKELY_PATTERN);
  const unverifiedCount = countMatches(rawResponse, UNVERIFIED_PATTERN);
  const noCitationCount = countMatches(rawResponse, NO_CITATION_PATTERN);
  const total = verifiedCount + likelyCount + unverifiedCount + noCitationCount;
  const verifiedRatio = total === 0 ? 0 : verifiedCount / total;

  if (verifiedRatio >= 0.8) {
    return {
      level: ConfidenceLevel.HIGH,
      verifiedCount,
      likelyCount,
      unverifiedCount,
      noCitationCount,
      warningMessage: null,
    };
  }

  if (verifiedRatio >= 0.5) {
    return {
      level: ConfidenceLevel.MEDIUM,
      verifiedCount,
      likelyCount,
      unverifiedCount,
      noCitationCount,
      warningMessage: null,
    };
  }

  return {
    level: ConfidenceLevel.LOW,
    verifiedCount,
    likelyCount,
    unverifiedCount,
    noCitationCount,
    warningMessage: LOW_CONFIDENCE_WARNING,
  };
}
