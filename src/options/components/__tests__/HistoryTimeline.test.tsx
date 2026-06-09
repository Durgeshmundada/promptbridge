import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as StorageModule from '../../../utils/storage';

const loadHistoryMock = vi.fn();
const getHistoryPageMock = vi.fn();
const searchHistoryMock = vi.fn();
const exportHistoryAsJsonMock = vi.fn();
const exportHistoryAsCsvMock = vi.fn();

vi.mock('../../../utils/storage', async () => {
  const actual = await vi.importActual<typeof StorageModule>('../../../utils/storage');

  return {
    ...actual,
    exportHistoryAsCSV: (...args: unknown[]) => exportHistoryAsCsvMock(...args),
    exportHistoryAsJSON: (...args: unknown[]) => exportHistoryAsJsonMock(...args),
    getHistoryPage: (...args: unknown[]) => getHistoryPageMock(...args),
    loadHistory: (...args: unknown[]) => loadHistoryMock(...args),
    searchHistory: (...args: unknown[]) => searchHistoryMock(...args),
  };
});

import HistoryTimeline from '../HistoryTimeline';
import { usePromptBridgeStore } from '../../../store';
import {
  ConfidenceLevel,
  IntentType,
} from '../../../types';
import type { HistoryEntry } from '../../../types';

const SCOPE_HISTORY_ENTRY: HistoryEntry = {
  id: 'history-scope-entry',
  timestamp: '2026-04-04T10:30:00.000Z',
  intent: IntentType.COMMAND_DATA,
  templateId: 'command-safe-execution',
  complexityDelta: 3,
  confidenceLevel: ConfidenceLevel.MEDIUM,
  rating: null,
  enrichedPrompt:
    'Remove inactive accounts.\n\nSelected Execution Scope:\n[A] current view',
  response: 'Inactive accounts limited to the current view were removed.',
};

describe('HistoryTimeline', () => {
  beforeEach(() => {
    loadHistoryMock.mockResolvedValue([SCOPE_HISTORY_ENTRY]);
    getHistoryPageMock.mockResolvedValue([SCOPE_HISTORY_ENTRY]);
    searchHistoryMock.mockResolvedValue([]);
    exportHistoryAsJsonMock.mockResolvedValue('[]');
    exportHistoryAsCsvMock.mockResolvedValue('');

    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('shows the selected scope in the expanded history timeline entry', async () => {
    render(<HistoryTimeline />);

    await screen.findByText('History loaded from PromptBridge IndexedDB.');

    fireEvent.click(
      screen.getByRole('button', {
        name: (_accessibleName, element) =>
          element?.textContent?.includes('COMMAND DATA') === true,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Enriched prompt')).toBeTruthy();
    });
    expect(
      screen.getByText((_content, element) => {
        return element?.tagName === 'PRE' && element.textContent?.includes('Selected Execution Scope:') === true;
      }),
    ).toBeTruthy();
    expect(
      screen.getByText((_content, element) => {
        return element?.tagName === 'PRE' && element.textContent?.includes('[A] current view') === true;
      }),
    ).toBeTruthy();
  });
});
