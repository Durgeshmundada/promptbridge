import { act, render, screen } from '@testing-library/react';

jest.mock('../../../utils/storage', () => ({
  loadDiffViewerUsageCount: jest.fn().mockResolvedValue(0),
  saveDiffViewerUsageCount: jest.fn().mockResolvedValue(undefined),
}));

import DiffViewer from '../DiffViewer';
import { usePromptBridgeStore } from '../../../store';
import {
  ConfidenceLevel,
  IntentType,
  ModelTarget,
} from '../../../types';

describe('DiffViewer', () => {
  beforeEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          'You are assisting a Go backend engineer.\n\nRelevant session context:\n- [2026-04-04T00:00:00.000Z] CODING (node-1) shared entities: Go, REST API, JWT. Prior prompt: I am building a REST API in Go.',
        rawResponse: 'Use JWT middleware. [LIKELY]',
        processedResponse: '<p>Use JWT middleware.</p>',
        intent: {
          intent: IntentType.CODING,
          confidence: 0.86,
          subIntent: 'authentication',
        },
        template: {
          id: 'coding-debug',
          intentType: IntentType.CODING,
          template: 'Debug {{issue}}',
          description: 'Debug a coding issue.',
          tags: ['coding'],
          weight: 1,
        },
        complexityScore: {
          raw: 4,
          enriched: 8,
          delta: 4,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.MEDIUM,
        citationList: [],
        executionTimeMs: 420,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 1,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
      usePromptBridgeStore.getState().setPopupLastSubmittedInput({
        rawInput: 'how do I add authentication',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'popup-session',
      });
    });
  });

  afterEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('shows prior session entities in the enriched prompt panel', async () => {
    render(<DiffViewer />);

    expect(
      await screen.findByText((_content, element) => {
        return element?.tagName === 'PRE' && element.textContent?.includes('Relevant session context:') === true;
      }),
    ).toBeTruthy();
    expect(
      screen.getByText((_content, element) => {
        return element?.tagName === 'SPAN' && element.textContent?.includes('Go, REST API, JWT') === true;
      }),
    ).toBeTruthy();
  });

  it('shows the selected execution scope in the enriched prompt diff', async () => {
    act(() => {
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          'Remove inactive accounts.\n\nSelected Execution Scope:\n[A] current view',
        rawResponse: 'Scope limited to the current view. [LIKELY]',
        processedResponse: '<p>Scope limited to the current view.</p>',
        intent: {
          intent: IntentType.COMMAND_DATA,
          confidence: 0.9,
          subIntent: 'cleanup',
        },
        template: {
          id: 'command-safe-execution',
          intentType: IntentType.COMMAND_DATA,
          template: 'Run {{task}}',
          description: 'Safe command execution template.',
          tags: ['command'],
          weight: 1,
        },
        complexityScore: {
          raw: 4,
          enriched: 7,
          delta: 3,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.MEDIUM,
        citationList: [],
        executionTimeMs: 380,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.96,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
      usePromptBridgeStore.getState().setPopupLastSubmittedInput({
        rawInput: 'remove all inactive accounts',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'popup-session',
      });
    });

    render(<DiffViewer />);

    expect(
      await screen.findByText((_content, element) => {
        return (
          element?.tagName === 'PRE' &&
          element.textContent?.includes('Selected Execution Scope:') === true
        );
      }),
    ).toBeTruthy();
    expect(
      screen.getByText((_content, element) => {
        return element?.tagName === 'SPAN' && element.textContent?.includes('[A] current view') === true;
      }),
    ).toBeTruthy();
  });

  it('shows image guidance as a green added block in the enriched prompt diff', async () => {
    act(() => {
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          'Image Guidance:\nThe original image will be attached in the multimodal payload.\nUse the following text summary as supplemental context:\nThe attached image shows a code screenshot.',
        rawResponse: 'The image likely shows a Python bug. [LIKELY]',
        processedResponse: '<p>The image likely shows a Python bug.</p>',
        intent: {
          intent: IntentType.CODING,
          confidence: 0.92,
          subIntent: 'code-review',
        },
        template: {
          id: 'coding-debug',
          intentType: IntentType.CODING,
          template: 'Debug {{issue}}',
          description: 'Debug a coding issue.',
          tags: ['coding'],
          weight: 1,
        },
        complexityScore: {
          raw: 2,
          enriched: 8,
          delta: 6,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.MEDIUM,
        citationList: [],
        executionTimeMs: 500,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.92,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
      usePromptBridgeStore.getState().setPopupLastSubmittedInput({
        rawInput: 'what is wrong with this',
        targetModel: ModelTarget.GPT4O,
        sessionId: 'image-diff-session',
      });
    });

    render(<DiffViewer />);

    const imageGuidanceSegment = await screen.findByText((_content, element) => {
      return element?.tagName === 'SPAN' && element.textContent?.includes('Image Guidance:') === true;
    });

    expect(imageGuidanceSegment.className).toContain('bg-[var(--pb-success-bg)]');
  });
});
