import { act, render, screen } from '@testing-library/react';
import ComplexityBadge from '../ComplexityBadge';
import {
  buildEnrichedSegments,
  buildRawSegments,
  getSegmentClasses,
} from '../diffViewerUtils';
import { usePromptBridgeStore } from '../../../store';
import {
  ConfidenceLevel,
  IntentType,
  ModelTarget,
} from '../../../types';

describe('popup display helpers', () => {
  beforeEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  afterEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('marks a vague raw pronoun and its enriched replacement as amber-highlighted neutralization', () => {
    const rawSegments = buildRawSegments('fix it');
    const enrichedSegments = buildEnrichedSegments('fix it', 'fix the specific issue', []);

    expect(rawSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'it',
          type: 'raw-vague',
        }),
      ]),
    );
    expect(enrichedSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'the specific issue',
          type: 'neutralized',
        }),
      ]),
    );
    expect(getSegmentClasses('neutralized')).toContain('bg-[var(--pb-warning-bg)]');
  });

  it('renders the signed complexity delta badge for the latest result', () => {
    act(() => {
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt: 'fix the specific issue',
        rawResponse: '```java\nSystem.out.println("fixed");\n```',
        processedResponse:
          '<pre><code class="language-java">System.out.println("fixed");</code></pre>',
        intent: {
          intent: IntentType.CODING,
          confidence: 0.72,
          subIntent: 'debugging',
          needsClarification: true,
        },
        template: {
          id: 'coding-debug',
          intentType: IntentType.CODING,
          template: 'Debug {{issue}}',
          description: 'Debug a coding issue.',
          tags: ['coding', 'debug'],
          weight: 1.2,
        },
        complexityScore: {
          raw: 3,
          enriched: 8,
          delta: 5,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.MEDIUM,
        citationList: [],
        executionTimeMs: 2400,
        slotMappings: [],
        matchZone: 'GENERATE',
        matchScore: 0.94,
        matchBadge: 'New template generated and saved',
        isNewTemplate: true,
      });
      usePromptBridgeStore.getState().setPopupLastSubmittedInput({
        rawInput: 'fix it',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'popup-display-test',
      });
    });

    render(<ComplexityBadge />);

    expect(screen.getByText('Raw: 3/10 -> Enriched: 8/10 (+5)')).toBeTruthy();
    expect(screen.getByText('New template generated and saved')).toBeTruthy();
    expect(screen.getByText('Score: 94%')).toBeTruthy();
    expect(screen.getByText('Saved to your template library')).toBeTruthy();
  });
});
