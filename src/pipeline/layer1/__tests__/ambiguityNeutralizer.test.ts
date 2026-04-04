import { neutralizeAmbiguity } from '../ambiguityNeutralizer';

describe('ambiguityNeutralizer', () => {
  it('replaces vague references using session context', () => {
    const rewritten = neutralizeAmbiguity(
      'Fix it somehow and maybe explain this.',
      'React build failure in src/App.tsx after the routing refactor.',
    );

    expect(rewritten).toContain('React build failure in src/App.tsx after the routing refactor');
    expect(rewritten).not.toContain('somehow');
    expect(rewritten).not.toContain(' maybe ');
  });

  it('adds a resolution note for contradictory constraints', () => {
    const rewritten = neutralizeAmbiguity(
      'Give me a brief but comprehensive explanation in bullets and paragraphs.',
      'OAuth token refresh behavior in a mobile client.',
    );

    expect(rewritten).toContain('Resolved constraints:');
    expect(rewritten).toContain('Provide a concise summary first, then detailed supporting points.');
    expect(rewritten).toContain('Use a short overview paragraph followed by bullets.');
  });

  it('uses a generic anchor when session context is missing', () => {
    const rewritten = neutralizeAmbiguity('Please handle this stuff kinda quickly.', '');

    expect(rewritten).toContain('the current request context');
    expect(rewritten).toContain('approximately');
  });

  it('removes the vague standalone pronoun from a bare fix request', () => {
    const rewritten = neutralizeAmbiguity('fix it', 'fix it');

    expect(rewritten).toContain('fix the specific issue');
    expect(rewritten).not.toMatch(/\bit\b/i);
  });
});
