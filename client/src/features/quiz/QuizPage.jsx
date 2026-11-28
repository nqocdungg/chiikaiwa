import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import { QuizResultView } from './QuizResult.jsx';
import { QuizRunner } from './QuizRunner.jsx';
import { formatQuizError, readQuiz } from './quiz-api.js';
import { useQuizLifecycle } from './use-quiz-lifecycle.js';
import './quiz.css';

/** @typedef {import('./quiz-api.js').QuizPublic} QuizPublic */
/** @typedef {import('./quiz-api.js').QuizResult} QuizResult */

export function QuizPage() {
  const { id = '' } = useParams();
  const handleLifecycle = useQuizLifecycle();

  const [data, setData] = useState(
    /** @type {QuizPublic|QuizResult|null} */ (null),
  );
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(
    /** @type {{ notFound: boolean, message: string } | null} */ (null),
  );
  const controllerRef = useRef(/** @type {AbortController | null} */ (null));

  const loadQuiz = useCallback(() => {
    if (!id) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setErrorState(null);

    readQuiz(id, controller.signal)
      .then((quiz) => {
        if (controller.signal.aborted) return;
        setData(quiz);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (handleLifecycle(err)) {
          return;
        }
        const status = /** @type {{ status?: number } | null} */ (err)?.status;
        const isNotFound = status === 404 || status === 403 || status === 400;
        setErrorState({
          notFound: isNotFound,
          message: formatQuizError(
            err,
            isNotFound
              ? 'Bài quiz không tồn tại hoặc bạn không có quyền truy cập.'
              : 'Không thể tải bài quiz. Vui lòng thử lại.',
          ),
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [handleLifecycle, id]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) loadQuiz();
    });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [id, loadQuiz]);

  const handleSubmitted = useCallback(
    (/** @type {QuizResult} */ result) => setData(result),
    [],
  );

  const handleQuizUpdated = useCallback(
    (/** @type {QuizPublic} */ updated) => setData(updated),
    [],
  );

  if (!id) {
    return (
      <div className="ck-quiz-layout">
        <main className="ck-quiz-main ck-quiz-state-panel" role="alert">
          <h2>Không tìm thấy bài quiz</h2>
          <p>Thiếu mã lượt quiz hợp lệ.</p>
          <div className="ck-quiz-state-actions">
            <Link to="/topics" className="ck-button ck-button--primary">
              Về danh sách chủ đề
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ck-quiz-layout">
        <main
          className="ck-quiz-main ck-quiz-state-panel"
          role="status"
          aria-live="polite"
        >
          <h2>Đang tải câu hỏi…</h2>
        </main>
      </div>
    );
  }

  if (errorState || !data) {
    const isNotFound = errorState?.notFound ?? true;
    return (
      <div className="ck-quiz-layout">
        <main className="ck-quiz-main ck-quiz-state-panel" role="alert">
          <h2>
            {isNotFound ? 'Không tìm thấy bài quiz' : 'Chưa tải được bài quiz'}
          </h2>
          <p>
            {errorState?.message ||
              'Bài quiz không tồn tại hoặc bạn không có quyền truy cập.'}
          </p>
          <div className="ck-quiz-state-actions">
            {!isNotFound && (
              <Button variant="primary" onClick={loadQuiz}>
                Thử lại
              </Button>
            )}
            <Link
              to="/topics"
              className={`ck-button ${isNotFound ? 'ck-button--primary' : 'ck-button--secondary'}`}
            >
              Về danh sách chủ đề
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (data.status === 'submitted') {
    return (
      <QuizResultView key={data.id} result={/** @type {QuizResult} */ (data)} />
    );
  }

  return (
    <QuizRunner
      key={data.id}
      quiz={/** @type {QuizPublic} */ (data)}
      onSubmitted={handleSubmitted}
      onQuizUpdated={handleQuizUpdated}
    />
  );
}
