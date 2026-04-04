import { evaluateScopeConfirmation } from '../scopeConfirmation';

describe('evaluateScopeConfirmation', () => {
  it.each([
    ['all', 'Delete all temporary files from the workspace.'],
    ['every', 'Replace every stale credential in the report.'],
    ['entire', 'Archive the entire tenant export immediately.'],
    ['whole', 'Rebuild the whole search index from scratch.'],
    ['everything', 'Purge everything in the inactive queue.'],
  ])('requires confirmation when the command uses "%s"', (keyword, prompt) => {
    const result = evaluateScopeConfirmation(prompt);

    expect(result.requiresScopeConfirmation).toBe(true);
    expect(result.scopeKeywords).toContain(keyword);
    expect(result.scopeOptions).toEqual([
      '[A] current view',
      '[B] entire database',
      '[C] custom',
    ]);
  });

  it('detects multiple scope-expanding keywords without duplicating the options list', () => {
    const result = evaluateScopeConfirmation('Replace every matching value across the entire export.');

    expect(result.requiresScopeConfirmation).toBe(true);
    expect(result.scopeKeywords).toEqual(['every', 'entire']);
    expect(result.scopeOptions).toHaveLength(3);
  });

  it('returns the fixed options and no scope flag when the command is narrowly scoped', () => {
    const result = evaluateScopeConfirmation('Update the selected record with the new owner.');

    expect(result.requiresScopeConfirmation).toBe(false);
    expect(result.scopeKeywords).toEqual([]);
    expect(result.scopeOptions).toEqual([
      '[A] current view',
      '[B] entire database',
      '[C] custom',
    ]);
  });
});
