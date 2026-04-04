import type { Persona } from '../../../types';
import { injectPersonaContext } from '../personaInjector';

const PERSONA: Persona = {
  id: 'persona-1',
  name: 'Nora',
  role: 'Product Counsel',
  expertise: ['contracts', 'compliance'],
  preferredStyle: 'precise and risk-aware',
  domainContext: 'Commercial SaaS procurement and vendor review.',
};

describe('personaInjector', () => {
  it('prepends the persona block when a persona is present', () => {
    const injected = injectPersonaContext('Review the indemnity clause.', PERSONA);

    expect(injected).toContain('You are assisting Product Counsel with expertise in contracts, compliance.');
    expect(injected).toContain('Domain context: Commercial SaaS procurement and vendor review.');
    expect(injected).toContain('Respond in precise and risk-aware style.');
  });

  it('returns the prompt unchanged when persona is null', () => {
    const prompt = 'Explain the migration strategy.';

    expect(injectPersonaContext(prompt, null)).toBe(prompt);
  });

  it('falls back cleanly when expertise is empty', () => {
    const injected = injectPersonaContext('Summarize the issue.', {
      ...PERSONA,
      expertise: [],
    });

    expect(injected).toContain('general problem solving');
  });
});
