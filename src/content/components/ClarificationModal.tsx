import { useMemo, useState } from 'react';
import type { ClarificationQuestion, ClarificationResponse } from '../../types';
import { QuestionCard } from './QuestionCard';

interface ClarificationModalProps {
  questions: ClarificationQuestion[];
  onClose: () => void;
  onSubmit: (responses: ClarificationResponse[]) => void;
  onUseDefaults: () => void;
}

function createInitialResponses(questions: ClarificationQuestion[]): ClarificationResponse[] {
  return questions.map((question) => ({
    questionId: question.id,
    answer: '',
    usedDefault: true,
  }));
}

export function ClarificationModal({
  questions,
  onClose,
  onSubmit,
  onUseDefaults,
}: ClarificationModalProps): JSX.Element {
  const initialResponses = useMemo(() => createInitialResponses(questions), [questions]);
  const [responses, setResponses] = useState<ClarificationResponse[]>(initialResponses);

  const updateAnswer = (questionId: string, answer: string): void => {
    setResponses((currentResponses) =>
      currentResponses.map((response) =>
        response.questionId === questionId
          ? {
              ...response,
              answer,
              usedDefault: answer.trim().length === 0,
            }
          : response,
      ),
    );
  };

  return (
    <section className="pb-content-modal" aria-label="PromptBridge clarification questions">
      <header className="pb-content-modal-header">
        <div>
          <h2>PromptBridge Enhanced Mode</h2>
          <p>Answer what matters. Empty fields use the best professional choice.</p>
        </div>
        <button className="pb-content-icon-button" type="button" onClick={onClose}>
          x
        </button>
      </header>
      <div className="pb-content-question-list">
        {questions.map((question) => {
          const response =
            responses.find((entry) => entry.questionId === question.id) ??
            createInitialResponses([question])[0];

          return response ? (
            <QuestionCard
              key={question.id}
              question={question}
              response={response}
              onAnswerChange={updateAnswer}
            />
          ) : null;
        })}
      </div>
      <footer className="pb-content-modal-actions">
        <button className="pb-content-secondary-button" type="button" onClick={onUseDefaults}>
          Use defaults
        </button>
        <button
          className="pb-content-button"
          type="button"
          onClick={() => {
            onSubmit(
              responses.map((response) => {
                const question = questions.find((entry) => entry.id === response.questionId);
                const answer = response.answer.trim() || question?.defaultAnswer || '';

                return {
                  ...response,
                  answer,
                  usedDefault: response.answer.trim().length === 0,
                };
              }),
            );
          }}
        >
          Optimize with Context
        </button>
      </footer>
    </section>
  );
}
