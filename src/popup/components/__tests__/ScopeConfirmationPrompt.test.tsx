import { act, fireEvent, render, screen } from '@testing-library/react';
import ScopeConfirmationPrompt from '../ScopeConfirmationPrompt';
import { usePromptBridgeStore } from '../../../store';

describe('ScopeConfirmationPrompt', () => {
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

  it('renders the scope confirmation choices only while a scope selection is pending', () => {
    const { rerender } = render(
      <ScopeConfirmationPrompt onSelectOption={() => undefined} />,
    );

    expect(screen.queryByText('Choose execution scope')).toBeNull();

    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'scopeSelection',
        options: ['[A] current view', '[B] entire database', '[C] custom'],
      });
    });

    rerender(<ScopeConfirmationPrompt onSelectOption={() => undefined} />);

    expect(screen.getByText('Choose execution scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: '[A] current view' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '[B] entire database' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '[C] custom' })).toBeTruthy();
  });

  it('returns the selected scope option to the caller', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'scopeSelection',
        options: ['[A] current view', '[B] entire database', '[C] custom'],
      });
    });

    const onSelectOption = jest.fn();

    render(<ScopeConfirmationPrompt onSelectOption={onSelectOption} />);

    fireEvent.click(screen.getByRole('button', { name: '[A] current view' }));

    expect(onSelectOption).toHaveBeenCalledWith('[A] current view');
  });
});
