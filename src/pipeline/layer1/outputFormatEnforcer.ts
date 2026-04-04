import { IntentType } from '../../types';

/*
Token budgets by intent:
- CODING: 900
- CREATIVE: 700
- DATA_ANALYSIS: 850
- QUESTION_FACTUAL: 450
- QUESTION_CONCEPTUAL: 650
- COMMAND_SYSTEM: 500
- COMMAND_DATA: 600
- RESEARCH: 1100
- MEDICAL: 750
- LEGAL: 750
- GENERAL: 600
*/
const OUTPUT_POLICY_BY_INTENT: Record<IntentType, { budget: number; format: string }> = {
  [IntentType.CODING]: {
    budget: 900,
    format:
      'Use sections titled Problem, Diagnosis, Proposed Fix, and Validation. Put code or command examples in fenced code blocks with language hints when possible.',
  },
  [IntentType.CREATIVE]: {
    budget: 700,
    format: 'Deliver the creative piece first, then add a brief note on tone or craft only if useful.',
  },
  [IntentType.DATA_ANALYSIS]: {
    budget: 850,
    format: 'Use sections titled Method, Findings, Caveats, and Next Steps.',
  },
  [IntentType.QUESTION_FACTUAL]: {
    budget: 450,
    format: 'Lead with the direct factual answer, then add concise supporting evidence.',
  },
  [IntentType.QUESTION_CONCEPTUAL]: {
    budget: 650,
    format: 'Use sections titled Concept, Mechanism, Example, and Key Takeaway.',
  },
  [IntentType.COMMAND_SYSTEM]: {
    budget: 500,
    format: 'Use a numbered procedure with exact commands, safety notes, and expected results.',
  },
  [IntentType.COMMAND_DATA]: {
    budget: 600,
    format: 'Use a numbered transformation flow with sample query or script fragments where helpful.',
  },
  [IntentType.RESEARCH]: {
    budget: 1100,
    format: 'Use sections titled Thesis, Evidence, Comparison, and Sources or Citation Notes.',
  },
  [IntentType.MEDICAL]: {
    budget: 750,
    format:
      'Use this exact structure: 1) Direct answer 2) Risk factors 3) When to seek emergency care 4) [Consult a healthcare professional for personal medical advice].',
  },
  [IntentType.LEGAL]: {
    budget: 750,
    format: 'Use sections titled Issue, General Principles, Risk Notes, and Counsel Caveat.',
  },
  [IntentType.GENERAL]: {
    budget: 600,
    format: 'Lead with the answer, then add the most helpful supporting points and next step.',
  },
};

const PROGRAMMING_LANGUAGE_PATTERN =
  /\b(TypeScript|JavaScript|Python|Java|C#|C\+\+|Go|Rust|Ruby|PHP|Kotlin|Swift|SQL)\b/i;
const ALGORITHMIC_EXPLANATION_PATTERN =
  /\b(binary search|algorithm|data structure|complexity|runtime|big o|search algorithm|sorting algorithm)\b/i;

function buildConceptualFormat(prompt: string): string {
  const algorithmicRequest =
    ALGORITHMIC_EXPLANATION_PATTERN.test(prompt) || /\bexplain how\b/i.test(prompt);

  if (!algorithmicRequest) {
    return OUTPUT_POLICY_BY_INTENT[IntentType.QUESTION_CONCEPTUAL].format;
  }

  const requestedLanguage =
    prompt.match(PROGRAMMING_LANGUAGE_PATTERN)?.[1] ?? 'pseudocode';

  return `Use this exact structure: 1) Concept in plain English 2) Step-by-step algorithm 3) ${requestedLanguage} code with inline comments 4) Time/space complexity.`;
}

/**
 * Appends PromptBridge output-format instructions and token budgets for a specific intent.
 */
export function enforceOutputFormat(prompt: string, intent: IntentType): string {
  if (prompt.includes('PromptBridge Output Contract:')) {
    return prompt;
  }

  const policy = OUTPUT_POLICY_BY_INTENT[intent];
  const format =
    intent === IntentType.QUESTION_CONCEPTUAL ? buildConceptualFormat(prompt) : policy.format;

  return `${prompt.trim()}\n\nPromptBridge Output Contract:\n- Intent: ${intent}\n- Format: ${format}\n- Token budget: ${policy.budget} tokens maximum.\n- State assumptions explicitly if the request leaves gaps.`;
}
