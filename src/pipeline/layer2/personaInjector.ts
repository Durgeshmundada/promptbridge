import type { Persona } from '../../types';

/**
 * Prepends persona context when a persona is available, otherwise returns the prompt unchanged.
 */
export function injectPersonaContext(prompt: string, persona: Persona | null): string {
  if (!persona) {
    return prompt;
  }

  const expertise = persona.expertise.length > 0 ? persona.expertise.join(', ') : 'general problem solving';
  const personaBlock = `You are assisting ${persona.role} with expertise in ${expertise}. Domain context: ${persona.domainContext}. Respond in ${persona.preferredStyle} style.`;

  return `${personaBlock}\n\n${prompt}`;
}
