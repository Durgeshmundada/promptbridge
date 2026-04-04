import type { PIIRedaction } from '../../types';

export interface PiiScanResult {
  sanitized: string;
  redactions: PIIRedaction[];
}

interface PiiPattern {
  type: PIIRedaction['type'];
  pattern: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    type: 'EMAIL',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g,
    replacement: '[EMAIL REDACTED]',
  },
  {
    type: 'API_KEY',
    pattern: /(sk-[a-zA-Z0-9]{32,}|Bearer [a-zA-Z0-9._-]+|ghp_[a-zA-Z0-9]{36})/g,
    replacement: '[API_KEY REDACTED]',
  },
  {
    type: 'PASSWORD',
    pattern: /(password|pwd|passwd)\s*(is|=|:)\s*\S+/gi,
    replacement: '[PASSWORD REDACTED]',
  },
  {
    type: 'CREDIT_CARD',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[CC REDACTED]',
  },
  {
    type: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN REDACTED]',
  },
  {
    type: 'PHONE',
    pattern: /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g,
    replacement: '[PHONE REDACTED]',
  },
];

function clonePattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}

function logRedaction(type: string, count: number): void {
  if (count > 0) {
    console.info(`[PromptBridge][PII] ${type}: ${count} redaction(s) applied.`);
  }
}

/**
 * Scans a prompt for sensitive values, redacts matching content, and returns per-type redaction counts.
 */
export function scanForPii(prompt: string): PiiScanResult {
  let sanitized = prompt;
  const redactions: PIIRedaction[] = [];

  PII_PATTERNS.forEach(({ type, pattern, replacement }) => {
    const matches = sanitized.match(clonePattern(pattern));
    const count = matches?.length ?? 0;

    if (count > 0) {
      sanitized = sanitized.replace(clonePattern(pattern), replacement);
      redactions.push({ type, count });
    }

    logRedaction(type, count);
  });

  return {
    sanitized,
    redactions,
  };
}
