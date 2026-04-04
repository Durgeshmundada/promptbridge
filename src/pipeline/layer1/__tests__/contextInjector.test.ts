import { IntentType } from '../../../types';
import type { Persona, PromptTemplate } from '../../../types';
import { injectContext } from '../contextInjector';

const PERSONA: Persona = {
  id: 'persona-1',
  name: 'Aria',
  role: 'Senior Engineer',
  expertise: ['TypeScript', 'React', 'DX'],
  preferredStyle: 'clear and pragmatic',
  domainContext: 'Frontend engineering for collaborative product teams.',
};

function createTemplate(template: string, intentType: IntentType = IntentType.CODING): PromptTemplate {
  return {
    id: 'template-under-test',
    intentType,
    template,
    description: 'A template for tests.',
    tags: ['test'],
    weight: 1,
  };
}

describe('contextInjector', () => {
  it('injects persona and domain context fields', () => {
    const injected = injectContext(
      createTemplate('Persona: {{persona_context}}\nDomain: {{domain_context}}\nFormat: {{output_format}}'),
      PERSONA,
      'Fix the React rendering issue in the dashboard.',
    );

    expect(injected).toContain('Aria (Senior Engineer)');
    expect(injected).toContain('Frontend engineering for collaborative product teams.');
    expect(injected).toContain('diagnosis');
  });

  it('fills unknown and generic slots from session context defaults', () => {
    const injected = injectContext(
      createTemplate(
        'Task: {{task}}\nContext: {{context}}\nFile: {{file_name}}\nConstraints: {{constraints}}',
      ),
      PERSONA,
      'Review the build warning in src/dashboard/App.tsx for the upcoming release.',
    );

    expect(injected).toContain('Review the build warning in src/dashboard/App.tsx');
    expect(injected).toContain('the primary artifact referenced by the user');
    expect(injected).not.toContain('{{');
  });

  it('uses safe fallback text when session context is empty', () => {
    const injected = injectContext(
      createTemplate('Question: {{question}}\nLength: {{length_constraint}}', IntentType.QUESTION_FACTUAL),
      PERSONA,
      '',
    );

    expect(injected).toContain('No prior session context was provided.');
    expect(injected).toContain('150 to 250 words');
  });
});
