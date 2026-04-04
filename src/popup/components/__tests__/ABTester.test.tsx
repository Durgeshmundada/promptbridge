import { fireEvent, render, screen } from '@testing-library/react';
import ABTester from '../ABTester';

describe('ABTester', () => {
  it('renders both prompt variants side by side and lets the user choose a winner', () => {
    const chooseWinner = jest.fn();

    render(
      <ABTester
        isWinnerSelectionPending={false}
        onChooseWinner={chooseWinner}
        selectedWinnerHistoryEntryId={null}
        variants={[
          {
            historyEntryId: 'history-a',
            label: 'A',
            executionTimeMs: 1100,
            processedResponse: '<p>Story-led product description.</p>',
            templateId: 'creative-writing',
            weight: 1.12,
          },
          {
            historyEntryId: 'history-b',
            label: 'B',
            executionTimeMs: 980,
            processedResponse: '<p>Specs-led product description.</p>',
            templateId: 'data-analysis',
            weight: 1.08,
          },
        ]}
      />,
    );

    expect(screen.getByText('Template head-to-head')).toBeTruthy();
    expect(screen.getByText('Variant A')).toBeTruthy();
    expect(screen.getByText('Variant B')).toBeTruthy();
    expect(screen.getByText('creative-writing')).toBeTruthy();
    expect(screen.getByText('data-analysis')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Choose this winner' })[1]);

    expect(chooseWinner).toHaveBeenCalledWith('history-b');
  });
});
