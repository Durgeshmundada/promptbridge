interface ContradictionRule {
  patterns: RegExp[];
  resolution: string;
}

const ANCHOR_SANITIZE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bit\b/gi, replacement: 'the request target' },
  { pattern: /\bthis\b/gi, replacement: 'the current context' },
  { pattern: /\bthat\b/gi, replacement: 'the referenced context' },
  { pattern: /\bthings\b/gi, replacement: 'the concrete requirements' },
  { pattern: /\bstuff\b/gi, replacement: 'the concrete details' },
  { pattern: /\bmaybe\b/gi, replacement: 'when supported by evidence' },
  { pattern: /\bkinda\b/gi, replacement: 'approximately' },
  { pattern: /\bsomehow\b/gi, replacement: 'through explicit steps' },
];

function buildAnchorReference(anchor: string): string {
  const sanitizedAnchor = ANCHOR_SANITIZE_RULES.reduce((currentValue, rule) => {
    return currentValue.replace(rule.pattern, rule.replacement);
  }, anchor);

  const normalizedAnchor = normalizeSpacing(sanitizedAnchor);
  return normalizedAnchor || 'the current request context';
}

const VAGUE_REFERENCE_PATTERNS: Array<{ pattern: RegExp; replacement: (anchor: string) => string }> = [
  { pattern: /\bit\b/gi, replacement: () => 'the specific issue' },
  {
    pattern: /\bthis\b/gi,
    replacement: (anchor) => `the specific context (${buildAnchorReference(anchor)})`,
  },
  {
    pattern: /\bthat\b/gi,
    replacement: (anchor) => `the referenced context (${buildAnchorReference(anchor)})`,
  },
  {
    pattern: /\bthings\b/gi,
    replacement: (anchor) => `the concrete requirements from ${buildAnchorReference(anchor)}`,
  },
  {
    pattern: /\bstuff\b/gi,
    replacement: (anchor) => `the concrete details from ${buildAnchorReference(anchor)}`,
  },
  { pattern: /\bmaybe\b/gi, replacement: () => 'if supported by the available evidence' },
  { pattern: /\bkinda\b/gi, replacement: () => 'approximately' },
  { pattern: /\bsomehow\b/gi, replacement: () => 'through explicit steps' },
];

const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    patterns: [/\b(?:brief|short|concise)\b/i, /\b(?:detailed|thorough|comprehensive)\b/i],
    resolution: 'Provide a concise summary first, then detailed supporting points.',
  },
  {
    patterns: [/\b(?:simple|beginner)\b/i, /\b(?:advanced|expert|deep)\b/i],
    resolution: 'Start with a simple explanation, then add advanced detail.',
  },
  {
    patterns: [/\b(?:fast|quick)\b/i, /\b(?:thorough|complete|exhaustive)\b/i],
    resolution: 'Prioritize correctness first, then cover only the highest-impact details.',
  },
  {
    patterns: [/\b(?:bullet|bullets|list)\b/i, /\b(?:paragraph|paragraphs|essay|prose)\b/i],
    resolution: 'Use a short overview paragraph followed by bullets.',
  },
];

function extractContextAnchor(sessionContext: string): string {
  const firstSentence = sessionContext
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .find(Boolean);

  if (!firstSentence) {
    return 'the current request context';
  }

  const compactSentence = firstSentence.replace(/\s+/g, ' ').trim();
  return compactSentence.length > 90 ? `${compactSentence.slice(0, 87)}...` : compactSentence;
}

function normalizeSpacing(value: string): string {
  return value.replace(/\s{2,}/g, ' ').replace(/\s+\./g, '.').trim();
}

/**
 * Rewrites vague prompt language using session context and appends resolved interpretations for contradictions.
 */
export function neutralizeAmbiguity(prompt: string, sessionContext: string): string {
  const anchor = extractContextAnchor(sessionContext);
  let rewrittenPrompt = prompt;

  VAGUE_REFERENCE_PATTERNS.forEach(({ pattern, replacement }) => {
    rewrittenPrompt = rewrittenPrompt.replace(pattern, replacement(anchor));
  });

  const resolutions = CONTRADICTION_RULES.filter((rule) =>
    rule.patterns.every((pattern) => pattern.test(prompt)),
  ).map((rule) => rule.resolution);

  rewrittenPrompt = normalizeSpacing(rewrittenPrompt);

  if (resolutions.length === 0 || rewrittenPrompt.includes('Resolved constraints:')) {
    return rewrittenPrompt;
  }

  return `${rewrittenPrompt}\n\nResolved constraints:\n- ${resolutions.join('\n- ')}`;
}
