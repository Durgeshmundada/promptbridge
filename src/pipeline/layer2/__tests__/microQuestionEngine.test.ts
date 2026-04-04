import { GapSeverity } from '../../../types';
import type { KnowledgeGap } from '../../../types';
import { generateMicroQuestion } from '../microQuestionEngine';

function createGap(gap: string, severity: GapSeverity): KnowledgeGap {
  return {
    gap,
    severity,
    suggestedFix: 'Clarify the missing detail.',
  };
}

describe('microQuestionEngine', () => {
  it('returns null when there are no HIGH severity gaps', () => {
    const result = generateMicroQuestion([
      createGap(
        'Missing scope or constraints: the prompt lacks explicit limits, priorities, or response boundaries.',
        GapSeverity.MEDIUM,
      ),
    ]);

    expect(result).toBeNull();
  });

  it('asks for the missing subject when subject information is absent', () => {
    const result = generateMicroQuestion([
      createGap(
        'Missing subject: the prompt does not identify a concrete topic, artifact, or target.',
        GapSeverity.HIGH,
      ),
    ]);

    expect(result?.question).toContain('exact topic, artifact, file, or question');
    expect(result?.targetGap.severity).toBe(GapSeverity.HIGH);
  });

  it('selects the highest severity acronym gap over lower-severity issues', () => {
    const result = generateMicroQuestion([
      createGap(
        'Missing scope or constraints: the prompt lacks explicit limits, priorities, or response boundaries.',
        GapSeverity.MEDIUM,
      ),
      createGap(
        'Undefined acronym: RAG is not expanded or previously defined.',
        GapSeverity.HIGH,
      ),
    ]);

    expect(result?.question).toContain('RAG');
    expect(result?.targetGap.gap).toContain('Undefined acronym');
  });

  it('asks for the specific report when a generic report reference is detected', () => {
    const result = generateMicroQuestion([
      createGap(
        'Missing subject: the prompt references a generic report without identifying which one.',
        GapSeverity.HIGH,
      ),
    ]);

    expect(result?.question).toBe(
      'Which report are you referring to? Please paste the content or describe it.',
    );
  });
});
