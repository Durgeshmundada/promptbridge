import type {
  ClarificationQuestion,
  KnowledgeGap,
} from '../../types';
import {
  GapSeverity,
  IntentType,
  ModelTarget,
} from '../../types';
import { execute } from '../layer6/executionEngine';
import { buildQuestionFromKnowledgeGap } from './microQuestionEngine';

export interface EnhancedClarificationInput {
  rawInput: string;
  intent: IntentType;
  knowledgeGaps: KnowledgeGap[];
  sessionContext: string;
}

interface ModelClarificationQuestion {
  question?: unknown;
  placeholder?: unknown;
  defaultAnswer?: unknown;
}

interface ModelClarificationResponse {
  questions?: unknown;
}

const DEFAULT_ANSWER = 'Best professional choice.';
const QUESTION_GENERATION_MAX_TOKENS = 500;
const QUESTION_GENERATION_TEMPERATURE = 0.3;
const DEFAULT_PLACEHOLDER = 'Add the missing context here.';
const SUBJECT_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'about',
  'any',
  'are',
  'as',
  'at',
  'be',
  'build',
  'create',
  'describe',
  'draft',
  'explain',
  'fix',
  'for',
  'from',
  'generate',
  'give',
  'help',
  'how',
  'improve',
  'in',
  'into',
  'it',
  'learn',
  'make',
  'me',
  'my',
  'of',
  'on',
  'or',
  'please',
  'provide',
  'regarding',
  'review',
  'show',
  'something',
  'summarize',
  'teach',
  'tell',
  'that',
  'the',
  'this',
  'to',
  'understand',
  'using',
  'want',
  'what',
  'with',
  'write',
]);
const AMBIGUOUS_SUBJECT_HINTS: Array<{
  pattern: RegExp;
  question: string;
  placeholder: string;
}> = [
  {
    pattern: /\b(?:pipeline|pipelines|pipelining)\b/i,
    question:
      'Which kind of pipeline do you mean here: data, CI/CD, CPU, prompt, or another workflow?',
    placeholder: 'Name the exact pipeline domain you want explained.',
  },
  {
    pattern: /\barchitecture\b/i,
    question:
      'Which architecture are you referring to: software, system, cloud, data, or another kind?',
    placeholder: 'Name the exact architecture or system in scope.',
  },
  {
    pattern: /\bmodel\b/i,
    question:
      'Which model do you mean here: business model, ML model, data model, or another kind?',
    placeholder: 'Name the exact model or framework you want covered.',
  },
  {
    pattern: /\bagent\b/i,
    question:
      'What kind of agent do you mean: AI agent, support agent, network agent, or something else?',
    placeholder: 'Name the exact agent type or environment involved.',
  },
  {
    pattern: /\bprompt\b/i,
    question:
      'What should this prompt ultimately help produce: code, writing, research, analysis, or something else?',
    placeholder: 'Describe the final outcome you want the prompt to generate.',
  },
];

const INTENT_FALLBACK_QUESTIONS: Record<
  IntentType,
  Array<{ prompt: string; placeholder: string }>
> = {
  [IntentType.CODING]: [
    {
      prompt: 'What exact bug, feature, or code path should this prompt focus on?',
      placeholder: 'Name the bug, feature, file, or stack involved.',
    },
    {
      prompt: 'What constraints should the solution respect?',
      placeholder: 'Mention language, framework, deadlines, or do-not-change rules.',
    },
    {
      prompt: 'What output format would help you most?',
      placeholder: 'For example: patch, explanation, test plan, or checklist.',
    },
  ],
  [IntentType.CREATIVE]: [
    {
      prompt: 'Who is the audience for this creative piece?',
      placeholder: 'Describe the reader or viewer you want to reach.',
    },
    {
      prompt: 'What tone or emotional vibe should it have?',
      placeholder: 'For example: bold, playful, cinematic, or heartfelt.',
    },
    {
      prompt: 'What final format should the output follow?',
      placeholder: 'For example: script, poem, caption set, or story outline.',
    },
  ],
  [IntentType.DATA_ANALYSIS]: [
    {
      prompt: 'What dataset, report, or metrics should the analysis focus on?',
      placeholder: 'Name the table, source, timeframe, or KPI set.',
    },
    {
      prompt: 'What decision or business question should the analysis answer?',
      placeholder: 'State the decision, risk, or opportunity you care about.',
    },
    {
      prompt: 'What output format will be most useful?',
      placeholder: 'For example: summary, dashboard notes, SQL, or slide bullets.',
    },
  ],
  [IntentType.QUESTION_FACTUAL]: [
    {
      prompt: 'What specific angle or subtopic should the answer focus on?',
      placeholder: 'Narrow the question to the most useful slice.',
    },
    {
      prompt: 'How detailed should the answer be?',
      placeholder: 'For example: quick answer, medium overview, or deep dive.',
    },
    {
      prompt: 'What format do you want back?',
      placeholder: 'For example: bullets, short explanation, or comparison table.',
    },
  ],
  [IntentType.QUESTION_CONCEPTUAL]: [
    {
      prompt: 'Who is the explanation for?',
      placeholder: 'For example: beginner, student, engineer, or executive.',
    },
    {
      prompt: 'Should the explanation stay conceptual or include examples?',
      placeholder: 'Mention examples, analogies, math, or implementation depth.',
    },
    {
      prompt: 'What output structure would help most?',
      placeholder: 'For example: step-by-step, FAQ, lesson, or cheat sheet.',
    },
  ],
  [IntentType.COMMAND_SYSTEM]: [
    {
      prompt: 'What exact system or environment should this command target?',
      placeholder: 'Mention OS, shell, tool, or deployment environment.',
    },
    {
      prompt: 'What safety boundaries should the command respect?',
      placeholder: 'Call out destructive actions, backups, or paths to avoid.',
    },
    {
      prompt: 'Do you want execution steps, explanation, or both?',
      placeholder: 'Choose command only, guided steps, rollback notes, or all three.',
    },
  ],
  [IntentType.COMMAND_DATA]: [
    {
      prompt: 'What dataset, table, or records should this command operate on?',
      placeholder: 'Identify the exact scope before proceeding.',
    },
    {
      prompt: 'What safety limits or exclusions should apply?',
      placeholder: 'Mention rows to protect, backup needs, or approval limits.',
    },
    {
      prompt: 'What result format do you want back?',
      placeholder: 'For example: SQL, migration plan, dry run, or audit summary.',
    },
  ],
  [IntentType.RESEARCH]: [
    {
      prompt: 'What audience should this research output serve?',
      placeholder: 'For example: founder, analyst, doctor, or product team.',
    },
    {
      prompt: 'What decision or question should the research answer?',
      placeholder: 'State the main conclusion, comparison, or recommendation needed.',
    },
    {
      prompt: 'How should the output be structured?',
      placeholder: 'For example: brief, source-backed memo, or comparison table.',
    },
  ],
  [IntentType.MEDICAL]: [
    {
      prompt: 'What exact symptom, condition, or treatment question matters most here?',
      placeholder: 'Narrow the medical topic without sharing unnecessary personal data.',
    },
    {
      prompt: 'Should the answer focus on urgency, treatment options, or explanation?',
      placeholder: 'Choose the practical angle you need first.',
    },
    {
      prompt: 'What response format will help you most?',
      placeholder: 'For example: red flags, treatment summary, or question list for a doctor.',
    },
  ],
  [IntentType.LEGAL]: [
    {
      prompt: 'What exact legal issue or document is involved?',
      placeholder: 'Name the agreement, dispute, jurisdiction, or compliance topic.',
    },
    {
      prompt: 'Is the goal explanation, risk spotting, or drafting help?',
      placeholder: 'Choose the practical legal outcome you want.',
    },
    {
      prompt: 'How should the answer be structured?',
      placeholder: 'For example: issue list, clause review, or action checklist.',
    },
  ],
  [IntentType.GENERAL]: [
    {
      prompt: 'Who is the audience for this prompt?',
      placeholder: 'Describe the person or group the final output is for.',
    },
    {
      prompt: 'What is the main goal of the output?',
      placeholder: 'State the decision, outcome, or deliverable you want.',
    },
    {
      prompt: 'What format or tone should the final answer follow?',
      placeholder: 'For example: concise bullets, formal email, or step-by-step guide.',
    },
  ],
};

function normalizeQuestionText(question: string): string {
  const normalizedQuestion = question.replace(/\s+/g, ' ').trim();

  if (!normalizedQuestion) {
    return '';
  }

  return /[?!.]$/.test(normalizedQuestion) ? normalizedQuestion : `${normalizedQuestion}?`;
}

function normalizePlaceholder(placeholder: string): string {
  const normalizedPlaceholder = placeholder.replace(/\s+/g, ' ').trim();
  return normalizedPlaceholder || DEFAULT_PLACEHOLDER;
}

function buildQuestionId(index: number): string {
  return `enhanced-q${(index + 1).toString()}`;
}

function normalizePromptText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractPromptKeywords(rawInput: string): string[] {
  return normalizePromptText(rawInput)
    .toLowerCase()
    .split(/[^a-z0-9+#/-]+/)
    .filter((token) => token.length >= 2 && !SUBJECT_STOP_WORDS.has(token));
}

function buildSubjectLabel(rawInput: string): string {
  const promptKeywords = extractPromptKeywords(rawInput);
  const label = promptKeywords.slice(0, 3).join(' ').trim();

  return label || 'this request';
}

function createClarificationQuestion(
  prompt: string,
  placeholder: string,
  index: number,
): ClarificationQuestion {
  return {
    id: buildQuestionId(index),
    prompt: normalizeQuestionText(prompt),
    placeholder: normalizePlaceholder(placeholder),
    defaultAnswer: DEFAULT_ANSWER,
  };
}

function dedupeQuestions(questions: ClarificationQuestion[]): ClarificationQuestion[] {
  const seenPrompts = new Set<string>();

  return questions.filter((question) => {
    const key = question.prompt.toLowerCase();

    if (seenPrompts.has(key)) {
      return false;
    }

    seenPrompts.add(key);
    return true;
  });
}

function sortKnowledgeGaps(knowledgeGaps: KnowledgeGap[]): KnowledgeGap[] {
  const severityRank: Record<GapSeverity, number> = {
    [GapSeverity.HIGH]: 3,
    [GapSeverity.MEDIUM]: 2,
    [GapSeverity.LOW]: 1,
  };

  return [...knowledgeGaps].sort(
    (left, right) => severityRank[right.severity] - severityRank[left.severity],
  );
}

function buildFallbackClarificationQuestions(
  input: EnhancedClarificationInput,
): ClarificationQuestion[] {
  const promptAwareQuestions = buildPromptAwareClarificationQuestions(input);
  const gapDrivenQuestions = sortKnowledgeGaps(input.knowledgeGaps)
    .map((gap, index) =>
      createClarificationQuestion(
        buildQuestionFromKnowledgeGap(gap),
        'Answer only if this detail matters for the final prompt.',
        index,
      ),
    );
  const intentFallbackQuestions = (INTENT_FALLBACK_QUESTIONS[input.intent] ??
    INTENT_FALLBACK_QUESTIONS[IntentType.GENERAL]).map((question, index) =>
      createClarificationQuestion(question.prompt, question.placeholder, gapDrivenQuestions.length + index),
    );

  return dedupeQuestions([...promptAwareQuestions, ...gapDrivenQuestions, ...intentFallbackQuestions])
    .slice(0, 3)
    .map((question, index) => ({
      ...question,
      id: buildQuestionId(index),
    }));
}

function shouldPreferDeterministicClarificationSet(
  input: EnhancedClarificationInput,
): boolean {
  const promptKeywords = extractPromptKeywords(input.rawInput);

  return (
    AMBIGUOUS_SUBJECT_HINTS.some(({ pattern }) => pattern.test(input.rawInput)) ||
    promptKeywords.length === 0 ||
    input.knowledgeGaps.some((gap) => gap.severity === GapSeverity.HIGH)
  );
}

function buildClarificationPrompt(input: EnhancedClarificationInput): string {
  const serializedGaps =
    input.knowledgeGaps.length > 0
      ? input.knowledgeGaps
          .map((gap) => `- [${gap.severity}] ${gap.gap} -> ${gap.suggestedFix}`)
          .join('\n')
      : '- No critical gaps detected, but refine the prompt professionally.';
  const sessionContext = input.sessionContext.trim() || 'No same-session context available.';

  return [
    'You are PromptBridge Layer 2.2, the Micro-Question Engine.',
    'Analyze the user prompt and return exactly three targeted clarification questions.',
    'Return only valid JSON in this shape:',
    '{"questions":[{"question":"...","placeholder":"...","defaultAnswer":"Best professional choice."}]}',
    '',
    'Rules:',
    '- Always return exactly 3 questions.',
    '- Ask only high-value clarifications that would materially improve the final prompt.',
    '- Prefer audience, objective, scope, constraints, tone, evidence needs, and output format.',
    '- At least one question must explicitly reference the user topic or a direct synonym.',
    '- If the topic could mean multiple domains, ask that disambiguation question first.',
    '- For explanation prompts, prefer level, context, and example questions over generic business framing.',
    '- For writing prompts, prefer audience, objective, tone, and deliverable questions.',
    '- For coding prompts, prefer code context, error context, constraints, and expected output.',
    '- Do not ask for anything already obvious from the prompt.',
    '- Avoid generic questions that could fit almost any prompt.',
    '- Keep each question under 110 characters when possible.',
    '- Keep placeholders short and practical.',
    '- Set every defaultAnswer to "Best professional choice."',
    '',
    `Detected intent: ${input.intent}`,
    `User prompt:\n${input.rawInput.trim()}`,
    '',
    `Knowledge gaps:\n${serializedGaps}`,
    '',
    `Same-session context:\n${sessionContext}`,
  ].join('\n');
}

function extractJsonPayload(responseText: string): string {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fencedMatch?.[1] ?? responseText).trim();
}

function toModelQuestion(
  value: unknown,
  index: number,
): ClarificationQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const questionValue = (value as ModelClarificationQuestion).question;
  const placeholderValue = (value as ModelClarificationQuestion).placeholder;
  const defaultAnswerValue = (value as ModelClarificationQuestion).defaultAnswer;

  if (typeof questionValue !== 'string' || !questionValue.trim()) {
    return null;
  }

  return {
    id: buildQuestionId(index),
    prompt: normalizeQuestionText(questionValue),
    placeholder:
      typeof placeholderValue === 'string'
        ? normalizePlaceholder(placeholderValue)
        : DEFAULT_PLACEHOLDER,
    defaultAnswer:
      typeof defaultAnswerValue === 'string' && defaultAnswerValue.trim()
        ? defaultAnswerValue.trim()
        : DEFAULT_ANSWER,
  };
}

function buildPromptAwareClarificationQuestions(
  input: EnhancedClarificationInput,
): ClarificationQuestion[] {
  const normalizedPrompt = normalizePromptText(input.rawInput);
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const subjectLabel = buildSubjectLabel(input.rawInput);
  const questions: ClarificationQuestion[] = [];
  const isExplanationPrompt =
    /(?:^|\b)(?:explain|teach|understand|what is|what are|how does|how do|walk me through|describe)\b/i.test(
      lowerPrompt,
    ) ||
    input.intent === IntentType.QUESTION_CONCEPTUAL ||
    input.intent === IntentType.QUESTION_FACTUAL;
  const isWritingPrompt =
    /\b(?:write|draft|create|blog|article|post|email|caption|script|copy|newsletter)\b/i.test(
      lowerPrompt,
    ) ||
    input.intent === IntentType.CREATIVE;
  const isCodingPrompt =
    input.intent === IntentType.CODING ||
    /\b(?:bug|debug|error|exception|fix|refactor|code|function|component|api|query|typescript|javascript|python|react)\b/i.test(
      lowerPrompt,
    );
  const isResearchPrompt =
    input.intent === IntentType.RESEARCH ||
    /\b(?:research|compare|latest|trend|market|study|evidence|citation|source)\b/i.test(
      lowerPrompt,
    );

  const ambiguousSubjectHint = AMBIGUOUS_SUBJECT_HINTS.find(({ pattern }) =>
    pattern.test(lowerPrompt),
  );

  if (ambiguousSubjectHint) {
    questions.push(
      createClarificationQuestion(
        ambiguousSubjectHint.question,
        ambiguousSubjectHint.placeholder,
        questions.length,
      ),
    );
  } else if (
    extractPromptKeywords(input.rawInput).length <= 2 &&
    normalizedPrompt.length > 0 &&
    !isExplanationPrompt &&
    !isWritingPrompt &&
    !isCodingPrompt &&
    !isResearchPrompt
  ) {
    questions.push(
      createClarificationQuestion(
        `What exact context or domain should PromptBridge assume for ${subjectLabel}?`,
        'Name the product, domain, file, workflow, or setting you mean.',
        questions.length,
      ),
    );
  }

  if (isExplanationPrompt) {
    questions.push(
      createClarificationQuestion(
        `What level should the explanation of ${subjectLabel} target?`,
        'For example: beginner, interview prep, student, or deep technical.',
        questions.length,
      ),
    );
    questions.push(
      createClarificationQuestion(
        `Should the answer on ${subjectLabel} include an example, analogy, or use case?`,
        'Mention whether you want examples, analogies, diagrams, or just the core concept.',
        questions.length,
      ),
    );
  }

  if (isWritingPrompt) {
    questions.push(
      createClarificationQuestion(
        `Who should this content about ${subjectLabel} speak to?`,
        'Describe the audience or reader you want to reach.',
        questions.length,
      ),
    );
    questions.push(
      createClarificationQuestion(
        `What outcome should this ${/\bemail\b/i.test(lowerPrompt) ? 'email' : 'piece'} achieve?`,
        'For example: educate, persuade, convert, or summarize.',
        questions.length,
      ),
    );
    questions.push(
      createClarificationQuestion(
        'What tone or format should the final content follow?',
        'For example: blog outline, polished article, concise email, or LinkedIn post.',
        questions.length,
      ),
    );
  }

  if (isCodingPrompt) {
    questions.push(
      createClarificationQuestion(
        'What exact code, file, stack, or failing behavior should PromptBridge focus on?',
        'Name the file, language, framework, or error you want addressed.',
        questions.length,
      ),
    );
    questions.push(
      createClarificationQuestion(
        'What kind of help do you want back: diagnosis, fix, refactor, or test coverage?',
        'Choose the main coding outcome you want first.',
        questions.length,
      ),
    );
  }

  if (isResearchPrompt) {
    questions.push(
      createClarificationQuestion(
        `What decision or comparison should the research on ${subjectLabel} help you make?`,
        'State the decision, recommendation, or comparison you care about.',
        questions.length,
      ),
    );
    questions.push(
      createClarificationQuestion(
        'Should PromptBridge prioritize latest sources, broad context, or evidence depth?',
        'Choose freshness, breadth, rigor, or a balanced mix.',
        questions.length,
      ),
    );
  }

  if (
    /\b(?:summarize|review|analyze|audit)\b/i.test(lowerPrompt) &&
    !/\b(?:report|document|paper|memo|article|deck|presentation|brief)\b/i.test(lowerPrompt)
  ) {
    questions.push(
      createClarificationQuestion(
        `What exact material should be summarized or reviewed for ${subjectLabel}?`,
        'Paste or name the document, text, code, or artifact in scope.',
        questions.length,
      ),
    );
  }

  questions.push(
    createClarificationQuestion(
      'What output format would be most useful for you?',
      'For example: bullets, step-by-step guide, table, checklist, or final draft.',
      questions.length,
    ),
  );

  return dedupeQuestions(questions);
}

function isQuestionSetSpecificEnough(
  questions: ClarificationQuestion[],
  input: EnhancedClarificationInput,
): boolean {
  const promptKeywords = extractPromptKeywords(input.rawInput);
  const lowerQuestions = questions.map((question) => question.prompt.toLowerCase());
  const requiresSubjectSpecificQuestion =
    input.knowledgeGaps.some((gap) => gap.severity === GapSeverity.HIGH) ||
    AMBIGUOUS_SUBJECT_HINTS.some(({ pattern }) => pattern.test(input.rawInput));

  if (!requiresSubjectSpecificQuestion || promptKeywords.length === 0) {
    return true;
  }

  return lowerQuestions.some((question) =>
    promptKeywords.some((keyword) => question.includes(keyword)),
  );
}

function parseModelQuestions(
  responseText: string,
  input: EnhancedClarificationInput,
): ClarificationQuestion[] | null {
  try {
    const parsedValue = JSON.parse(extractJsonPayload(responseText)) as
      | ModelClarificationResponse
      | ModelClarificationQuestion[];
    const rawQuestions = Array.isArray(parsedValue)
      ? parsedValue
      : Array.isArray(parsedValue.questions)
        ? parsedValue.questions
        : [];
    const questions = rawQuestions
      .map((question, index) => toModelQuestion(question, index))
      .filter((question): question is ClarificationQuestion => question !== null);

    if (questions.length !== 3) {
      return null;
    }

    if (dedupeQuestions(questions).length !== 3) {
      return null;
    }

    return isQuestionSetSpecificEnough(questions, input) ? questions : null;
  } catch {
    return null;
  }
}

/**
 * Produces a three-question clarification set for Enhanced Mode, falling back deterministically when needed.
 */
export async function generateEnhancedClarificationSet(
  input: EnhancedClarificationInput,
): Promise<ClarificationQuestion[]> {
  if (shouldPreferDeterministicClarificationSet(input)) {
    return buildFallbackClarificationQuestions(input);
  }

  try {
    const response = await execute({
      model: ModelTarget.GROQ,
      prompt: buildClarificationPrompt(input),
      systemPrompt:
        'Return only compact JSON. Do not add markdown, explanations, or any text outside the JSON payload.',
      maxTokens: QUESTION_GENERATION_MAX_TOKENS,
      temperature: QUESTION_GENERATION_TEMPERATURE,
    });
    const parsedQuestions = parseModelQuestions(response.response, input);

    if (parsedQuestions) {
      return parsedQuestions;
    }
  } catch {
    // Fall through to the deterministic fallback below.
  }

  return buildFallbackClarificationQuestions(input);
}
