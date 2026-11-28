import { Button, Icon } from '../../components/ui/controls.jsx';
import { isAnswered } from './quiz-state.js';

/** @typedef {import('./quiz-api.js').QuizPublic} QuizPublic */
/** @typedef {import('./quiz-state.js').DraftAnswer} DraftAnswer */

/**
 * @param {{
 *   currentIndex: number,
 *   total: number,
 *   quiz: QuizPublic,
 *   draft: Record<string, DraftAnswer>,
 *   submitting?: boolean,
 *   submitDisabled?: boolean,
 *   onGo: (index: number) => void,
 *   onRequestSubmit: () => void,
 * }} props
 */
export function QuizNavigator({
  currentIndex,
  total,
  quiz,
  draft,
  submitting = false,
  submitDisabled = false,
  onGo,
  onRequestSubmit,
}) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= total - 1;

  return (
    <nav className="ck-quiz-nav" aria-label="Điều hướng câu hỏi">
      <div className="ck-quiz-nav-step">
        <Button
          variant="secondary"
          disabled={isFirst}
          onClick={() => onGo(currentIndex - 1)}
          aria-label="Câu trước"
        >
          Trước
        </Button>
      </div>

      <div
        className="ck-quiz-chips"
        role="group"
        aria-label="Danh sách câu hỏi"
      >
        {quiz.questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const answered = isAnswered(q, draft[q.questionVersionId]);
          const statusText = isCurrent
            ? 'Đang xem'
            : answered
              ? 'Đã trả lời'
              : 'Chưa trả lời';

          return (
            <button
              key={q.questionVersionId}
              type="button"
              className={`ck-quiz-chip ${isCurrent ? 'is-current' : ''} ${answered ? 'is-answered' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Câu ${idx + 1} — ${statusText}`}
              onClick={() => onGo(idx)}
            >
              <span className="ck-quiz-chip-num">{idx + 1}</span>
              {answered && (
                <span className="ck-quiz-chip-icon" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ck-quiz-nav-actions">
        <Button
          variant="secondary"
          disabled={isLast}
          onClick={() => onGo(currentIndex + 1)}
          aria-label="Câu tiếp theo"
        >
          Tiếp
        </Button>
        <Button
          variant="primary"
          loading={submitting}
          disabled={submitDisabled}
          onClick={onRequestSubmit}
        >
          Nộp bài
        </Button>
      </div>
    </nav>
  );
}
