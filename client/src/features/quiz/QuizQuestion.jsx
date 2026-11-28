import { Icon } from '../../components/ui/controls.jsx';
import { Input } from '../../components/ui/forms.jsx';

/** @typedef {import('./quiz-api.js').QuizQuestion} QuizQuestion */
/** @typedef {import('./quiz-state.js').DraftAnswer} DraftAnswer */

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

/**
 * @param {{
 *   question: QuizQuestion,
 *   questionNumber?: number,
 *   answer?: DraftAnswer,
 *   onAnswer: (ans: DraftAnswer) => void,
 *   disabled?: boolean,
 *   promptRef?: import('react').RefObject<HTMLHeadingElement | null>,
 * }} props
 */
export function QuizQuestionView({
  question,
  questionNumber: _questionNumber,
  answer,
  onAnswer,
  disabled = false,
  promptRef,
}) {
  const isMultipleChoice = question.type === 'multipleChoice';
  const instruction = isMultipleChoice
    ? 'Chọn một đáp án đúng'
    : 'Nhập câu trả lời vào ô bên dưới';

  return (
    <div className="ck-quiz-question-card">
      <div className="ck-quiz-question-meta">
        <span className="ck-quiz-question-type">{instruction}</span>
      </div>

      <h2
        ref={promptRef}
        id="ck-quiz-prompt"
        className="ck-quiz-prompt"
        tabIndex={-1}
      >
        {question.prompt}
      </h2>

      {isMultipleChoice ? (
        <div
          className="ck-quiz-options"
          role="radiogroup"
          aria-labelledby="ck-quiz-prompt"
        >
          {(question.options ?? []).map((opt, index) => {
            const isSelected = answer?.optionId === opt.id;
            const letter = OPTION_KEYS[index] ?? String(index + 1);

            return (
              <label
                key={opt.id}
                className={`ck-quiz-option ${isSelected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
              >
                <input
                  type="radio"
                  name={`quiz-q-${question.questionVersionId}`}
                  value={opt.id}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onAnswer({ optionId: opt.id })}
                  className="ck-quiz-radio-input"
                />
                <span className="ck-quiz-option-key" aria-hidden="true">
                  {letter}
                </span>
                <span className="ck-quiz-option-text">{opt.text}</span>
                {isSelected && (
                  <span className="ck-quiz-option-check" aria-hidden="true">
                    <Icon name="check" size={18} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      ) : (
        <div className="ck-quiz-short-answer">
          <Input
            id={`quiz-input-${question.questionVersionId}`}
            label="Câu trả lời của bạn"
            value={answer?.text ?? ''}
            maxLength={500}
            disabled={disabled}
            placeholder="Nhập câu trả lời..."
            onChange={(e) => onAnswer({ text: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
