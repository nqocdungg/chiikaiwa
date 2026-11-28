import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/controls.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { createIdempotencyKey } from '../../services/api-client.js';
import { QuizLayout } from './QuizLayout.jsx';
import { QuizNavigator } from './QuizNavigator.jsx';
import { QuizQuestionView } from './QuizQuestion.jsx';
import {
  formatQuizError,
  isQuizRetryableError,
  readQuiz,
  submitQuiz,
} from './quiz-api.js';
import {
  countUnanswered,
  createQuizState,
  hasDraft,
  isAnswered,
  quizReducer,
} from './quiz-state.js';
import { useQuizLifecycle } from './use-quiz-lifecycle.js';

/** @typedef {import('./quiz-api.js').QuizPublic} QuizPublic */
/** @typedef {import('./quiz-api.js').QuizResult} QuizResult */

/**
 * @param {{
 *   quiz: QuizPublic,
 *   onSubmitted: (result: QuizResult) => void,
 *   onQuizUpdated?: (quiz: QuizPublic) => void,
 * }} props
 */
export function QuizRunner({ quiz, onSubmitted, onQuizUpdated }) {
  const handleLifecycle = useQuizLifecycle();
  const [state, dispatch] = useState(() => createQuizState());
  const [lockedAfterSubmitConflict, setLockedAfterSubmitConflict] =
    useState(false);
  const [reloadingConflict, setReloadingConflict] = useState(false);
  const promptRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const prevIndexRef = useRef(state.index);
  const conflictReloadRef = useRef(
    /** @type {AbortController | null} */ (null),
  );
  const callbacksRef = useRef({ onSubmitted, onQuizUpdated });

  useEffect(() => {
    callbacksRef.current = { onSubmitted, onQuizUpdated };
  }, [onQuizUpdated, onSubmitted]);

  useEffect(() => () => conflictReloadRef.current?.abort(), []);

  const currentQuestion = quiz.questions[state.index];
  const hasDraftValue =
    !lockedAfterSubmitConflict && hasDraft(quiz, state.draft);
  const answeredCount = quiz.questions.filter((q) =>
    isAnswered(q, state.draft[q.questionVersionId]),
  ).length;

  const announcement = `Câu ${state.index + 1} trên ${quiz.total}`;

  // Move focus to question prompt only when changing questions (04 §8.3)
  useEffect(() => {
    if (prevIndexRef.current !== state.index) {
      prevIndexRef.current = state.index;
      promptRef.current?.focus();
    }
  }, [state.index]);

  const syncAfterConflict = useCallback(
    async (
      /** @type {AbortSignal} */ signal,
      /** @type {boolean} */ wasAlreadySubmitted,
    ) => {
      try {
        const latest = await readQuiz(quiz.id, signal);
        if (signal.aborted) return;
        if (latest.status === 'submitted') {
          callbacksRef.current.onSubmitted(/** @type {QuizResult} */ (latest));
          return;
        }
        callbacksRef.current.onQuizUpdated?.(
          /** @type {QuizPublic} */ (latest),
        );
        dispatch((prev) =>
          quizReducer(prev, {
            type: 'submit-rejected',
            notice:
              'Trạng thái lượt quiz đã được cập nhật từ máy chủ. Vui lòng kiểm tra và nộp lại.',
          }),
        );
      } catch (readErr) {
        if (signal.aborted) return;
        if (handleLifecycle(readErr)) return;
        if (wasAlreadySubmitted) {
          setLockedAfterSubmitConflict(true);
        }
        dispatch((prev) =>
          quizReducer(prev, {
            type: 'submit-rejected',
            notice: wasAlreadySubmitted
              ? 'Lượt quiz đã được nộp trước đó nhưng chưa tải được kết quả. Vui lòng bấm Tải kết quả.'
              : formatQuizError(
                  readErr,
                  'Trạng thái lượt quiz đã thay đổi. Vui lòng tải lại.',
                ),
          }),
        );
      }
    },
    [handleLifecycle, quiz.id],
  );

  // Handle submission effect when phase is 'submitting'
  useEffect(() => {
    if (state.phase !== 'submitting' || !state.intent) return undefined;

    let active = true;
    const controller = new AbortController();

    submitQuiz(quiz.id, state.intent, controller.signal)
      .then((res) => {
        if (!active) return;
        callbacksRef.current.onSubmitted(res);
      })
      .catch(async (err) => {
        if (!active || controller.signal.aborted) return;

        if (handleLifecycle(err)) {
          return;
        }

        const errInfo =
          /** @type {{ status?: number, code?: string } | null} */ (err);

        if (
          errInfo?.status === 409 &&
          (errInfo?.code === 'QUIZ_ALREADY_SUBMITTED' ||
            errInfo?.code === 'VERSION_CONFLICT')
        ) {
          await syncAfterConflict(
            controller.signal,
            errInfo.code === 'QUIZ_ALREADY_SUBMITTED',
          );
          return;
        }

        if (isQuizRetryableError(err)) {
          dispatch((prev) =>
            quizReducer(prev, {
              type: 'submit-uncertain',
              notice:
                'Mạng gián đoạn hoặc quá thời gian chờ. Ý định nộp bài đã được giữ nguyên, vui lòng bấm Thử lại.',
            }),
          );
          return;
        }

        dispatch((prev) =>
          quizReducer(prev, {
            type: 'submit-rejected',
            notice: formatQuizError(err, 'Không thể nộp bài quiz.'),
          }),
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [handleLifecycle, quiz.id, state.intent, state.phase, syncAfterConflict]);

  const handleAnswer = useCallback(
    (/** @type {import('./quiz-state.js').DraftAnswer} */ ans) => {
      if (!currentQuestion || lockedAfterSubmitConflict) return;
      dispatch((prev) =>
        quizReducer(prev, {
          type: 'answer',
          questionVersionId: currentQuestion.questionVersionId,
          answer: ans,
        }),
      );
    },
    [currentQuestion, lockedAfterSubmitConflict],
  );

  const handleGo = useCallback(
    (/** @type {number} */ newIndex) => {
      dispatch((prev) =>
        quizReducer(prev, {
          type: 'go',
          index: newIndex,
          total: quiz.total,
        }),
      );
    },
    [quiz.total],
  );

  const handleRequestSubmit = useCallback(() => {
    if (lockedAfterSubmitConflict) return;
    dispatch((prev) =>
      quizReducer(prev, {
        type: 'request-submit',
        quiz,
        key: createIdempotencyKey(),
      }),
    );
  }, [lockedAfterSubmitConflict, quiz]);

  const handleConfirmSubmit = useCallback(() => {
    dispatch((prev) =>
      quizReducer(prev, {
        type: 'confirm-submit',
        quiz,
        key: createIdempotencyKey(),
      }),
    );
  }, [quiz]);

  const handleRetrySubmit = useCallback(() => {
    dispatch((prev) => quizReducer(prev, { type: 'retry-submit' }));
  }, []);

  const handleReloadAfterConflict = useCallback(async () => {
    if (reloadingConflict) return;
    conflictReloadRef.current?.abort();
    const controller = new AbortController();
    conflictReloadRef.current = controller;
    setReloadingConflict(true);
    try {
      await syncAfterConflict(controller.signal, true);
    } finally {
      if (!controller.signal.aborted) {
        setReloadingConflict(false);
      }
    }
  }, [reloadingConflict, syncAfterConflict]);

  const unansweredCount = countUnanswered(quiz, state.draft);

  return (
    <QuizLayout
      deckVersionId={quiz.deckVersionId}
      sourceSessionId={quiz.sourceSessionId}
      currentIndex={state.index}
      total={quiz.total}
      answeredCount={answeredCount}
      hasDraft={hasDraftValue}
    >
      <div className="ck-sr-only" aria-live="polite">
        {announcement}
      </div>

      {state.notice && (
        <div className="ck-quiz-banner ck-quiz-banner--error" role="alert">
          <span>{state.notice}</span>
          {state.phase === 'submitUnknown' && (
            <Button
              variant="secondary"
              size="compact"
              onClick={handleRetrySubmit}
            >
              Thử lại
            </Button>
          )}
          {lockedAfterSubmitConflict && (
            <Button
              variant="secondary"
              size="compact"
              loading={reloadingConflict}
              onClick={() => void handleReloadAfterConflict()}
            >
              Tải kết quả
            </Button>
          )}
        </div>
      )}

      <div className="ck-quiz-runner-content">
        {currentQuestion && (
          <QuizQuestionView
            question={currentQuestion}
            questionNumber={state.index + 1}
            answer={state.draft[currentQuestion.questionVersionId]}
            onAnswer={handleAnswer}
            promptRef={promptRef}
            disabled={
              lockedAfterSubmitConflict ||
              state.phase === 'submitting' ||
              state.phase === 'submitUnknown'
            }
          />
        )}

        <QuizNavigator
          currentIndex={state.index}
          total={quiz.total}
          quiz={quiz}
          draft={state.draft}
          submitting={state.phase === 'submitting'}
          submitDisabled={
            lockedAfterSubmitConflict || state.phase === 'submitUnknown'
          }
          onGo={handleGo}
          onRequestSubmit={handleRequestSubmit}
        />
      </div>

      {state.phase === 'confirmingBlank' && (
        <Dialog
          open={state.phase === 'confirmingBlank'}
          title="Còn câu chưa trả lời"
          onClose={() =>
            dispatch((prev) => quizReducer(prev, { type: 'cancel-confirm' }))
          }
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  dispatch((prev) =>
                    quizReducer(prev, { type: 'cancel-confirm' }),
                  )
                }
              >
                Quay lại làm tiếp
              </Button>
              <Button variant="primary" onClick={handleConfirmSubmit}>
                Nộp bài
              </Button>
            </>
          }
        >
          <p>
            Còn <strong>{unansweredCount}</strong> câu chưa trả lời. Nếu nộp bài
            bây giờ, các câu này sẽ được tính 0 điểm. Bạn có muốn tiếp tục nộp?
          </p>
        </Dialog>
      )}
    </QuizLayout>
  );
}
