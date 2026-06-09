import type { ClarificationQuestion, ClarificationResponse } from '../../types';

interface QuestionCardProps {
  question: ClarificationQuestion;
  response: ClarificationResponse;
  onAnswerChange: (questionId: string, answer: string) => void;
}

export function QuestionCard({
  question,
  response,
  onAnswerChange,
}: QuestionCardProps): JSX.Element {
  return (
    <label className="pb-content-question">
      <span>{question.prompt}</span>
      <textarea
        placeholder={question.placeholder}
        value={response.answer}
        onChange={(event) => {
          onAnswerChange(question.id, event.target.value);
        }}
      />
    </label>
  );
}
