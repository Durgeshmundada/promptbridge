import { scanForPii } from '../piiScanner';

describe('scanForPii', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts email and api keys without exposing raw values in logs', () => {
    const infoSpy = jest.spyOn(console, 'info');
    const rawEmail = 'rahul@company.com';
    const rawApiKey = 'sk-abc123xyz456def789ghi012jkl345mno678';

    const result = scanForPii(
      `my email is ${rawEmail} and my openai key is ${rawApiKey} - why is my API call failing`,
    );

    expect(result.sanitized).not.toContain(rawEmail);
    expect(result.sanitized).not.toContain(rawApiKey);
    expect(result.sanitized).toContain('[EMAIL REDACTED]');
    expect(result.sanitized).toContain('[API_KEY REDACTED]');
    expect(result.redactions).toEqual([
      { type: 'EMAIL', count: 1 },
      { type: 'API_KEY', count: 1 },
    ]);
    expect(infoSpy).toHaveBeenCalledWith('[PromptBridge][PII] EMAIL: 1 redaction(s) applied.');
    expect(infoSpy).toHaveBeenCalledWith('[PromptBridge][PII] API_KEY: 1 redaction(s) applied.');

    const loggedMessages = infoSpy.mock.calls.map((args) => args.join(' ')).join('\n');

    expect(loggedMessages).not.toContain(rawEmail);
    expect(loggedMessages).not.toContain(rawApiKey);
  });

  it.each([
    ['phone number', 'Call me at (555) 123-4567 tomorrow.', '[PHONE REDACTED]', 'PHONE'],
    ['credit card', 'Card 4242 4242 4242 4242 should be declined.', '[CC REDACTED]', 'CREDIT_CARD'],
    ['ssn', 'My SSN is 123-45-6789 for the onboarding form.', '[SSN REDACTED]', 'SSN'],
  ] as const)(
    'redacts %s values as standalone checks',
    (_label, prompt, replacement, expectedType) => {
      const infoSpy = jest.spyOn(console, 'info');
      const result = scanForPii(prompt);

      expect(result.sanitized).toContain(replacement);
      expect(result.sanitized).not.toContain(prompt.match(/\d[\d()\s-]{6,}/)?.[0] ?? '');
      expect(result.redactions).toEqual([{ type: expectedType, count: 1 }]);

      const loggedMessages = infoSpy.mock.calls.map((args) => args.join(' ')).join('\n');

      expect(loggedMessages).not.toContain(prompt);
    },
  );

  it('redacts passwords and multiple api-key formats using the required replacements', () => {
    const result = scanForPii(
      [
        'Authorization header Bearer abc.DEF_ghi-123',
        'GitHub key ghp_abcdefghijklmnopqrstuvwxyz1234567890',
        'password = hunter2',
      ].join(' '),
    );

    expect(result.sanitized).toContain('[API_KEY REDACTED]');
    expect(result.sanitized).toContain('[PASSWORD REDACTED]');
    expect(result.redactions).toEqual([
      { type: 'API_KEY', count: 2 },
      { type: 'PASSWORD', count: 1 },
    ]);
  });

  it('returns the original prompt and no redactions when nothing sensitive is present', () => {
    const prompt = 'Summarize the architecture decisions in this repository.';
    const result = scanForPii(prompt);

    expect(result.sanitized).toBe(prompt);
    expect(result.redactions).toEqual([]);
  });
});
