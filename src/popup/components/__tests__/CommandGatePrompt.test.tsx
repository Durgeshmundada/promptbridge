import { act, fireEvent, render, screen } from '@testing-library/react';
import CommandGatePrompt from '../CommandGatePrompt';
import { usePromptBridgeStore } from '../../../store';

describe('CommandGatePrompt', () => {
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

  it('renders the destructive preview only while a command confirmation is pending', () => {
    const { rerender } = render(
      <CommandGatePrompt onCancel={() => undefined} onConfirm={() => undefined} />,
    );

    expect(screen.queryByText('Confirm command request')).toBeNull();

    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'commandConfirmation',
        prompt:
          'This will permanently delete all users from the production database. This action cannot be undone.',
      });
    });

    rerender(<CommandGatePrompt onCancel={() => undefined} onConfirm={() => undefined} />);

    expect(screen.getByText('Confirm command request')).toBeTruthy();
    expect(screen.getByText(/This will permanently delete all users/i)).toBeTruthy();
  });

  it('requires button clicks for confirmation and blocks enter-key confirmation', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'commandConfirmation',
        prompt:
          'This will permanently delete all users from the production database. This action cannot be undone.',
      });
    });

    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    render(<CommandGatePrompt onCancel={onCancel} onConfirm={onConfirm} />);

    const gateSection = screen.getByText('Confirm command request').closest('section');
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(gateSection).not.toBeNull();

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    const dispatchResult = gateSection?.dispatchEvent(enterEvent);

    expect(dispatchResult).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(confirmButton);
    fireEvent.click(cancelButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
