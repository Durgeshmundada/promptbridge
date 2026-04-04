export interface UnverifiableClaimHighlightResult {
  processedHtml: string;
  highlightedCount: number;
}

const TARGET_MARKER_PATTERN = /\[(?:UNVERIFIED|NO_CITATION)\]/;
const SENTENCE_SPLIT_PATTERN =
  /[^.!?]+(?:[.!?]+(?:\s*\[(?:VERIFIED|LIKELY|UNVERIFIED|NO_CITATION)\])?|\s*\[(?:VERIFIED|LIKELY|UNVERIFIED|NO_CITATION)\]|$)/g;
const TOOLTIP_TEXT = 'This claim could not be verified by the model';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps sentences containing unverifiable markers in a tooltip-enabled span for downstream display.
 */
export function highlightUnverifiableClaims(
  rawResponse: string,
): UnverifiableClaimHighlightResult {
  const sentences = rawResponse.match(SENTENCE_SPLIT_PATTERN) ?? [];
  let highlightedCount = 0;
  const escapedTooltipText = escapeHtml(TOOLTIP_TEXT);

  const processedHtml = sentences
    .map((sentence) => {
      const escapedSentence = escapeHtml(sentence);

      if (!TARGET_MARKER_PATTERN.test(sentence)) {
        return escapedSentence;
      }

      highlightedCount += 1;

      return `<span class="pb-unverified" data-tooltip="${escapedTooltipText}" title="${escapedTooltipText}">${escapedSentence}</span>`;
    })
    .join('')
    .trim();

  return {
    processedHtml,
    highlightedCount,
  };
}
