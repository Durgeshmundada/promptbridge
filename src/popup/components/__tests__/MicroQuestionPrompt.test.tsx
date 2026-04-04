import { act, fireEvent, render, screen } from '@testing-library/react';
import MicroQuestionPrompt from '../MicroQuestionPrompt';
import { usePromptBridgeStore } from '../../../store';

describe('MicroQuestionPrompt', () => {
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

  it('renders the popup micro-question and stores the typed answer', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'question',
        prompt: 'Which report are you referring to? Please paste the content or describe it.',
        answer: '',
      });
    });

    const onSubmit = jest.fn();
    render(<MicroQuestionPrompt onSubmit={onSubmit} />);

    expect(
      screen.getByText('Which report are you referring to? Please paste the content or describe it.'),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Type the missing detail here.'), {
      target: { value: 'The quarterly operations report for March 2026.' },
    });

    const interaction = usePromptBridgeStore.getState().popupPendingInteraction;

    expect(interaction?.kind).toBe('question');
    expect(interaction && interaction.kind === 'question' ? interaction.answer : '').toBe(
      'The quarterly operations report for March 2026.',
    );

    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
