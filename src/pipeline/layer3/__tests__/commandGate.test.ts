import { IntentType } from '../../../types';
import { evaluateCommandGate } from '../commandGate';

describe('evaluateCommandGate', () => {
  it('summarizes destructive data commands with an irreversible warning', () => {
    const result = evaluateCommandGate(
      'Delete all users from the production database.',
      IntentType.COMMAND_DATA,
    );

    expect(result.requiresGate).toBe(true);
    expect(result.destructiveKeywords).toEqual(['delete']);
    expect(result.previewText).toContain('delete all users from the production database');
    expect(result.previewText).toContain('This action cannot be undone.');
  });

  it.each([
    ['delete', 'Delete all users from the production database.', IntentType.COMMAND_DATA],
    ['drop', 'Drop the analytics schema before reloading it.', IntentType.COMMAND_DATA],
    ['truncate', 'Truncate audit_logs before rerunning the import.', IntentType.COMMAND_DATA],
    ['wipe', 'Wipe the deployment workspace on the build server.', IntentType.COMMAND_SYSTEM],
    ['purge', 'Purge cached assets from the CDN edge.', IntentType.COMMAND_SYSTEM],
  ])('requires a gate for %s operations', (_keyword, prompt, intent) => {
    const result = evaluateCommandGate(prompt, intent);

    expect(result.requiresGate).toBe(true);
    expect(result.previewText).toContain('This action cannot be undone.');
  });

  it('returns a non-destructive preview for safe command intents', () => {
    const result = evaluateCommandGate(
      'Run npm test and collect the coverage report.',
      IntentType.COMMAND_SYSTEM,
    );

    expect(result.requiresGate).toBe(false);
    expect(result.destructiveKeywords).toEqual([]);
    expect(result.previewText).toContain('perform: Run npm test and collect the coverage report.');
  });

  it('skips command gating for non-command intents even if destructive words appear', () => {
    const result = evaluateCommandGate(
      'Explain what the SQL DROP statement does in theory.',
      IntentType.QUESTION_CONCEPTUAL,
    );

    expect(result.requiresGate).toBe(false);
    expect(result.destructiveKeywords).toEqual([]);
    expect(result.previewText).toBe('This prompt does not request a command execution.');
  });
});
