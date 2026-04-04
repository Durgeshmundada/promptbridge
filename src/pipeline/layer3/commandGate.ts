import { IntentType } from '../../types';

export interface CommandGateResult {
  requiresGate: boolean;
  previewText: string;
  destructiveKeywords: string[];
}

const DESTRUCTIVE_KEYWORDS = [
  'delete',
  'drop',
  'truncate',
  'remove all',
  'wipe',
  'format',
  'override',
  'replace all',
  'purge',
] as const;

const DESTRUCTIVE_ACTION_SUMMARIES: Record<(typeof DESTRUCTIVE_KEYWORDS)[number], string> = {
  delete: 'permanently delete',
  drop: 'permanently drop',
  truncate: 'permanently truncate',
  'remove all': 'remove all matching items from',
  wipe: 'permanently wipe',
  format: 'format and erase data on',
  override: 'override existing values in',
  'replace all': 'replace all matching content in',
  purge: 'permanently purge',
};

function isCommandIntent(intent: IntentType): boolean {
  return intent === IntentType.COMMAND_SYSTEM || intent === IntentType.COMMAND_DATA;
}

function escapeKeyword(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchDestructiveKeywords(prompt: string): string[] {
  const normalizedPrompt = prompt.toLowerCase();

  return DESTRUCTIVE_KEYWORDS.filter((keyword) => {
    const boundaryPattern = new RegExp(`\\b${escapeKeyword(keyword)}\\b`, 'i');
    return boundaryPattern.test(normalizedPrompt);
  });
}

function extractTarget(prompt: string): string | null {
  const targetPattern =
    /\b(?:delete|drop|truncate|remove all|wipe|format|override|replace all|purge)\b\s+([a-z0-9_./-]+(?:\s+[a-z0-9_./-]+){0,5})/i;
  const match = prompt.match(targetPattern);

  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/[.,;:!?]+$/, '').trim();
}

function summarizeNonDestructiveCommand(prompt: string, intent: IntentType): string {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  const snippet = normalizedPrompt.split(/\s+/).slice(0, 12).join(' ');
  const subject = intent === IntentType.COMMAND_SYSTEM ? 'system' : 'data';

  return `This ${subject} command appears to perform: ${snippet}.`;
}

function summarizeDestructiveCommand(
  prompt: string,
  intent: IntentType,
  destructiveKeywords: string[],
): string {
  const phrases = destructiveKeywords.map(
    (keyword) => DESTRUCTIVE_ACTION_SUMMARIES[keyword as keyof typeof DESTRUCTIVE_ACTION_SUMMARIES],
  );
  const defaultTarget =
    intent === IntentType.COMMAND_SYSTEM ? 'the targeted system resources' : 'the targeted data set';
  const target = extractTarget(prompt) ?? defaultTarget;
  const actionText =
    phrases.length === 1
      ? `${phrases[0]} ${target}`
      : `perform destructive actions (${destructiveKeywords.join(', ')}) against ${target}`;

  return `This will ${actionText}. This action cannot be undone.`;
}

/**
 * Detects destructive command language and prepares a plain-English preview for later confirmation UI.
 */
export function evaluateCommandGate(prompt: string, intent: IntentType): CommandGateResult {
  if (!isCommandIntent(intent)) {
    return {
      requiresGate: false,
      previewText: 'This prompt does not request a command execution.',
      destructiveKeywords: [],
    };
  }

  const destructiveKeywords = matchDestructiveKeywords(prompt);
  const requiresGate = destructiveKeywords.length > 0;

  return {
    requiresGate,
    previewText: requiresGate
      ? summarizeDestructiveCommand(prompt, intent, destructiveKeywords)
      : summarizeNonDestructiveCommand(prompt, intent),
    destructiveKeywords,
  };
}
