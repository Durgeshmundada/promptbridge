import { GapSeverity } from '../../../types';
import { detectKnowledgeGaps } from '../knowledgeGapDetector';

describe('knowledgeGapDetector', () => {
  it('detects missing subject, ambiguous pronouns, and missing scope', () => {
    const gaps = detectKnowledgeGaps('Fix this maybe.');

    expect(gaps.map((gap) => gap.severity)).toEqual(
      expect.arrayContaining([GapSeverity.HIGH, GapSeverity.HIGH, GapSeverity.MEDIUM]),
    );
    expect(gaps[0].gap).toContain('Missing subject');
    expect(gaps.some((gap) => gap.gap.includes('Ambiguous pronoun'))).toBe(true);
  });

  it('detects undefined acronyms that are not previously defined', () => {
    const gaps = detectKnowledgeGaps('Summarize the RAG findings for the QBR deck.');

    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe(GapSeverity.HIGH);
    expect(gaps[0].gap).toContain('RAG');
    expect(gaps[0].gap).toContain('QBR');
  });

  it('does not flag acronyms that were defined earlier in the prompt', () => {
    const gaps = detectKnowledgeGaps(
      'Summarize retrieval augmented generation (RAG) results for the architecture review with focus on latency constraints.',
    );

    expect(gaps).toEqual([]);
  });

  it('returns no gaps for a well-scoped structured prompt', () => {
    const gaps = detectKnowledgeGaps(
      'Review src/App.tsx in React with focus on performance, preserve current behavior, and output a table of findings.',
    );

    expect(gaps).toEqual([]);
  });

  it('treats a generic report reference as a HIGH-severity missing subject gap', () => {
    const gaps = detectKnowledgeGaps('Summarize the report.');

    expect(gaps[0]?.severity).toBe(GapSeverity.HIGH);
    expect(gaps[0]?.gap).toContain('generic report');
  });
});
