import { act, fireEvent, render, screen } from '@testing-library/react';
import EnhancedClarificationPrompt from '../EnhancedClarificationPrompt';
import { usePromptBridgeStore } from '../../../store';

describe('EnhancedClarificationPrompt', () => {
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

  it('renders the enhanced clarification set and stores typed answers', () => {
    act(() => {
      usePromptBridgeStore.getState().setPopupPendingInteraction({
        kind: 'clarificationSet',
        questions: [
          {
            id: 'enhanced-q1',
            prompt: 'Who is the audience for this prompt?',
            placeholder: 'Describe the target audience.',
            defaultAnswer: 'Best professional choice.',
          },
          {
            id: 'enhanced-q2',
            prompt: 'What is the main outcome you want?',
            placeholder: 'Describe the desired outcome.',
            defaultAnswer: 'Best professional choice.',
          },
          {
            id: 'enhanced-q3',
            prompt: 'What output format should the answer follow?',
            placeholder: 'For example: bullets or a blog outline.',
            defaultAnswer: 'Best professional choice.',
          },
        ],
        responses: [
          {
            questionId: 'enhanced-q1',
            answer: '',
            usedDefault: true,
          },
          {
            questionId: 'enhanced-q2',
            answer: '',
            usedDefault: true,
          },
          {
            questionId: 'enhanced-q3',
            answer: '',
            usedDefault: true,
          },
        ],
        activeQuestionId: 'enhanced-q1',
      });
    });

    const onSubmit = jest.fn();
    render(<EnhancedClarificationPrompt onSubmit={onSubmit} />);

    expect(screen.getByText('Enhanced Mode')).toBeTruthy();
    expect(screen.getByText('Who is the audience for this prompt?')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Describe the target audience.'), {
      target: { value: 'Startup founders.' },
    });

    let interaction = usePromptBridgeStore.getState().popupPendingInteraction;

    expect(interaction?.kind).toBe('clarificationSet');
    expect(
      interaction && interaction.kind === 'clarificationSet'
        ? interaction.responses[0]?.answer
        : '',
    ).toBe('Startup founders.');

    fireEvent.click(screen.getByText('What is the main outcome you want?'));
    interaction = usePromptBridgeStore.getState().popupPendingInteraction;
    expect(
      interaction && interaction.kind === 'clarificationSet'
        ? interaction.activeQuestionId
        : '',
    ).toBe('enhanced-q2');

    fireEvent.click(screen.getByText('Optimize with Context'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
