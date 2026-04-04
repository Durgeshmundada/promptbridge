import { IntentType } from '../../types';
import type { Persona, PromptTemplate } from '../../types';

const SLOT_PATTERN = /{{\s*([\w-]+)\s*}}/g;

const FORMAT_BY_INTENT: Record<IntentType, string> = {
  [IntentType.CODING]:
    'Use sections for diagnosis, proposed fix, implementation details, and validation steps.',
  [IntentType.CREATIVE]:
    'Deliver the requested creative artifact directly, then add a brief craft note if useful.',
  [IntentType.DATA_ANALYSIS]:
    'Use sections for methodology, findings, caveats, and recommended next steps.',
  [IntentType.QUESTION_FACTUAL]:
    'Lead with the direct answer, then provide brief supporting evidence.',
  [IntentType.QUESTION_CONCEPTUAL]:
    'Explain the concept progressively with a simple overview, mechanism, and example.',
  [IntentType.COMMAND_SYSTEM]:
    'Use a numbered procedure with exact commands, safety notes, and expected results.',
  [IntentType.COMMAND_DATA]:
    'Use a transformation checklist with inputs, operations, and expected output structure.',
  [IntentType.RESEARCH]:
    'Use sections for thesis, evidence, comparison, and cited takeaways.',
  [IntentType.MEDICAL]:
    'Use sections for context, possible explanations, red flags, and when to seek professional help.',
  [IntentType.LEGAL]:
    'Use sections for issue framing, general legal principles, risk notes, and counsel caveat.',
  [IntentType.GENERAL]:
    'Use a direct answer followed by the most useful supporting details.',
};

const LENGTH_BY_INTENT: Record<IntentType, string> = {
  [IntentType.CODING]: 'Aim for 500 to 700 words plus any code or command snippets.',
  [IntentType.CREATIVE]: 'Aim for 400 to 700 words unless the requested creative form implies otherwise.',
  [IntentType.DATA_ANALYSIS]: 'Aim for 500 to 800 words with concise findings.',
  [IntentType.QUESTION_FACTUAL]: 'Aim for 150 to 250 words unless important nuance is required.',
  [IntentType.QUESTION_CONCEPTUAL]: 'Aim for 300 to 500 words with one concrete example.',
  [IntentType.COMMAND_SYSTEM]: 'Aim for 250 to 450 words plus commands.',
  [IntentType.COMMAND_DATA]: 'Aim for 300 to 500 words plus query or transformation examples.',
  [IntentType.RESEARCH]: 'Aim for 700 to 1000 words with synthesized evidence.',
  [IntentType.MEDICAL]: 'Aim for 350 to 550 words with cautious, non-diagnostic guidance.',
  [IntentType.LEGAL]: 'Aim for 350 to 550 words with careful, general-information framing.',
  [IntentType.GENERAL]: 'Aim for 250 to 450 words.',
};

/*
Default slot policy:
- task/question/topic/context slots fall back to the provided session context or a neutral request summary.
- persona/domain/output/length slots are always injected from persona metadata and intent policy.
- file/language/framework/version slots fall back to neutral placeholders so no slot is left unresolved.
- constraints fall back to correctness, clarity, and alignment with the stated environment.
*/
function getDefaultSlotValue(slotKey: string, template: PromptTemplate, persona: Persona, sessionContext: string): string {
  const normalizedSlotKey = slotKey.toLowerCase();
  const expertiseSummary = persona.expertise.join(', ') || 'general problem solving';
  const normalizedContext = sessionContext.trim() || 'No prior session context was provided.';

  if (normalizedSlotKey === 'persona_context') {
    return `${persona.name} (${persona.role}) with expertise in ${expertiseSummary} and a ${persona.preferredStyle} style.`;
  }

  if (normalizedSlotKey === 'domain_context') {
    return persona.domainContext || 'General cross-domain assistance.';
  }

  if (normalizedSlotKey === 'output_format') {
    return FORMAT_BY_INTENT[template.intentType];
  }

  if (normalizedSlotKey === 'length_constraint') {
    return LENGTH_BY_INTENT[template.intentType];
  }

  if (/(context|session_context)/.test(normalizedSlotKey)) {
    return normalizedContext;
  }

  if (/(task|question|topic|feature_request|content_type|project_name|data_source|audience)/.test(normalizedSlotKey)) {
    return normalizedContext;
  }

  if (/(constraints|tone)/.test(normalizedSlotKey)) {
    return `Respect correctness, clarity, and the user's stated environment while keeping a ${persona.preferredStyle} tone.`;
  }

  if (/(file|path|module)/.test(normalizedSlotKey)) {
    return 'the primary artifact referenced by the user';
  }

  if (/language/.test(normalizedSlotKey)) {
    return 'the relevant implementation language';
  }

  if (/(framework|library|stack)/.test(normalizedSlotKey)) {
    return 'the active framework or runtime';
  }

  if (/version/.test(normalizedSlotKey)) {
    return 'the current version in scope';
  }

  if (/(issue|problem)/.test(normalizedSlotKey)) {
    return normalizedContext;
  }

  if (/comparison_items/.test(normalizedSlotKey)) {
    return 'the main options under consideration';
  }

  return normalizedContext;
}

/**
 * Injects persona and session context into a template and resolves every remaining slot with safe defaults.
 */
export function injectContext(
  template: PromptTemplate,
  persona: Persona,
  sessionContext: string,
): string {
  return template.template.replace(SLOT_PATTERN, (_match, slotKey: string) => {
    return getDefaultSlotValue(slotKey, template, persona, sessionContext);
  });
}
