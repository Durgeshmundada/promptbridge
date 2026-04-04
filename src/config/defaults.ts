import type { Persona } from '../types';

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'default-persona',
    name: 'PromptBridge Core',
    role: 'cross-functional operator',
    expertise: ['software delivery', 'research synthesis', 'structured problem solving'],
    preferredStyle: 'clear, pragmatic, and concise',
    domainContext:
      'General cross-domain prompt orchestration across engineering, research, and operations.',
  },
  {
    id: 'developer-persona',
    name: 'Build Partner',
    role: 'software engineer',
    expertise: ['debugging', 'architecture', 'refactoring', 'testing'],
    preferredStyle: 'precise, implementation-oriented, and direct',
    domainContext:
      'Production software systems, developer workflows, and maintainable code changes.',
  },
  {
    id: 'research-persona',
    name: 'Research Partner',
    role: 'research analyst',
    expertise: ['literature synthesis', 'citation hygiene', 'evidence comparison'],
    preferredStyle: 'structured, evidence-aware, and balanced',
    domainContext: 'Research synthesis, source evaluation, and careful claim framing.',
  },
  {
    id: 'operations-persona',
    name: 'Operations Partner',
    role: 'operations specialist',
    expertise: ['system safety', 'runbooks', 'change control', 'incident response'],
    preferredStyle: 'safety-first, stepwise, and unambiguous',
    domainContext:
      'Operational commands, deployment workflows, and controlled execution in live environments.',
  },
];
