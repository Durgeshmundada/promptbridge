import { act, fireEvent, render, screen } from '@testing-library/react';
import ResponseView from '../ResponseView';
import { usePromptBridgeStore } from '../../../store';
import {
  ConfidenceLevel,
  IntentType,
} from '../../../types';

describe('ResponseView', () => {
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

  it('shows the medical disclaimer, footer, and MEDICAL intent badge for medical results', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupCurrentPromptId('medical-response-test');
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          '[MEDICAL DISCLAIMER: This is AI-generated information only, not medical advice.]\n\nIs chest pain dangerous at age 45?',
        rawResponse:
          '1) Direct answer\nChest pain can be dangerous. [VERIFIED]\n\n4) [Consult a healthcare professional for personal medical advice]\n[LIKELY]',
        processedResponse:
          '<p>1) Direct answer</p><p>Chest pain can be dangerous. [VERIFIED]</p>',
        intent: {
          intent: IntentType.MEDICAL,
          confidence: 0.94,
          subIntent: 'symptom-question',
        },
        template: {
          id: 'medical-query',
          intentType: IntentType.MEDICAL,
          template: 'Address the medical question: {{question}}',
          description: 'Medical guidance template.',
          tags: ['medical'],
          weight: 1.23,
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
        executionTimeMs: 1600,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.95,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
    });

    render(<ResponseView />);

    expect(
      screen.getByText('MEDICAL DISCLAIMER: This is AI-generated information only, not medical advice.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Consult a healthcare professional for personal medical advice.'),
    ).toBeTruthy();
    expect(screen.getByText('Intent: MEDICAL')).toBeTruthy();
  });

  it('shows the popup redaction count badge when pii is removed', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupCurrentPromptId('redaction-response-test');
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          'Use [EMAIL REDACTED] and [API_KEY REDACTED] placeholders before forwarding the request.',
        rawResponse: 'Your request failed because the credentials were invalid. [LIKELY]',
        processedResponse: '<p>Your request failed because the credentials were invalid.</p>',
        intent: {
          intent: IntentType.CODING,
          confidence: 0.88,
          subIntent: 'api-debugging',
        },
        template: {
          id: 'coding-debug',
          intentType: IntentType.CODING,
          template: 'Debug {{issue}}',
          description: 'Debug a coding issue.',
          tags: ['coding'],
          weight: 1.2,
        },
        complexityScore: {
          raw: 4,
          enriched: 7,
          delta: 3,
          breakdown: {},
        },
        piiRedactions: [
          { type: 'EMAIL', count: 1 },
          { type: 'API_KEY', count: 1 },
          { type: 'PHONE', count: 2 },
        ],
        confidenceLevel: ConfidenceLevel.LOW,
        citationList: [],
        executionTimeMs: 900,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.91,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
    });

    render(<ResponseView />);

    expect(screen.getByText('4 sensitive items redacted')).toBeTruthy();
  });

  it('shows low-confidence warnings, tooltip-enabled highlights, and collapsible citations', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupCurrentPromptId('hallucination-guard-test');
      usePromptBridgeStore.getState().setLastResult({
        enrichedPrompt:
          "What are the latest treatments for Alzheimer's disease?\n\nFor every factual claim you make, append a confidence marker: [VERIFIED], [LIKELY], or [UNVERIFIED].\n\nSupport every major claim with a citation in the format [Author, Year] or [Source Name]. If no citation is available, mark the claim as [NO_CITATION].",
        rawResponse:
          'Lecanemab has shown modest benefit. [VERIFIED] [van Dyck, 2023] A universal cure exists. [UNVERIFIED] [NO_CITATION]',
        processedResponse:
          '<p class="pb-confidence-warning">This response contains significant unverified claims. Consider cross-checking with primary sources.</p><span class="pb-unverified" data-tooltip="This claim could not be verified by the model" title="This claim could not be verified by the model">A universal cure exists. [UNVERIFIED] [NO_CITATION]</span>',
        intent: {
          intent: IntentType.RESEARCH,
          confidence: 0.92,
          subIntent: 'medical-research',
        },
        template: {
          id: 'research-synthesis',
          intentType: IntentType.RESEARCH,
          template: 'Research {{topic}}',
          description: 'Research synthesis template.',
          tags: ['research'],
          weight: 1.4,
        },
        complexityScore: {
          raw: 4,
          enriched: 9,
          delta: 5,
          breakdown: {},
        },
        piiRedactions: [],
        confidenceLevel: ConfidenceLevel.LOW,
        citationList: ['[van Dyck, 2023]', '[NO_CITATION]'],
        executionTimeMs: 1400,
        slotMappings: [],
        matchZone: 'DIRECT',
        matchScore: 0.93,
        matchBadge: 'Template matched directly',
        isNewTemplate: false,
      });
    });

    const { container } = render(<ResponseView />);

    expect(screen.getByText('LOW')).toBeTruthy();
    expect(
      screen.getByText(
        'This response contains significant unverified claims. Consider cross-checking with primary sources.',
      ),
    ).toBeTruthy();

    const highlightedClaim = container.querySelector('.pb-unverified');

    expect(highlightedClaim).not.toBeNull();
    expect(highlightedClaim?.getAttribute('title')).toBe(
      'This claim could not be verified by the model',
    );
    expect(screen.queryByText('[van Dyck, 2023]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show citations' }));

    expect(screen.getByText('[van Dyck, 2023]')).toBeTruthy();
    expect(screen.getByText('[NO_CITATION]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide citations' }));

    expect(screen.queryByText('[van Dyck, 2023]')).toBeNull();
  });
});
