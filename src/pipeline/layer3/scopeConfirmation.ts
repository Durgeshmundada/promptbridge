export interface ScopeConfirmationResult {
  requiresScopeConfirmation: boolean;
  scopeKeywords: string[];
  scopeOptions: string[];
}

const SCOPE_KEYWORDS = ['all', 'every', 'entire', 'whole', 'everything', 'any'] as const;
const DEFAULT_SCOPE_OPTIONS = ['[A] current view', '[B] entire database', '[C] custom'];

function escapeKeyword(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects scope-expanding language and prepares the fixed scope confirmation options used by the UI layer.
 */
export function evaluateScopeConfirmation(commandPrompt: string): ScopeConfirmationResult {
  const normalizedPrompt = commandPrompt.toLowerCase();
  const scopeKeywords = SCOPE_KEYWORDS.filter((keyword) => {
    const pattern = new RegExp(`\\b${escapeKeyword(keyword)}\\b`, 'i');
    return pattern.test(normalizedPrompt);
  });

  return {
    requiresScopeConfirmation: scopeKeywords.length > 0,
    scopeKeywords,
    scopeOptions: [...DEFAULT_SCOPE_OPTIONS],
  };
}
