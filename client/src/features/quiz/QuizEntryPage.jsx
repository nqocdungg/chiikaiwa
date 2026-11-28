import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/controls.jsx';
import {
  createQuiz,
  formatQuizError,
  isQuizRetryableError,
  releaseCreateKey,
  takeCreateKey,
} from './quiz-api.js';
import { useQuizLifecycle } from './use-quiz-lifecycle.js';
import './quiz.css';

export function QuizEntryPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handleLifecycle = useQuizLifecycle();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const deckVersionId = params.get('deckVersionId') ?? '';
  const sourceSessionId = params.get('sourceSessionId') ?? undefined;

  const [unavailable, setUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, setPending] = useState(false);
  const controllerRef = useRef(/** @type {AbortController | null} */ (null));

  const startCreate = useCallback(() => {
    if (!deckVersionId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const idempotencyKey = takeCreateKey(deckVersionId, sourceSessionId);
    setPending(true);
    setErrorMessage('');
    setUnavailable(false);

    createQuiz(
      { deckVersionId, sourceSessionId },
      { idempotencyKey, signal: controller.signal },
    )
      .then((quiz) => {
        if (controller.signal.aborted) return;
        releaseCreateKey(deckVersionId, sourceSessionId);
        navigateRef.current(`/quiz/${encodeURIComponent(quiz.id)}`, {
          replace: true,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const errInfo =
          /** @type {{ status?: number, code?: string } | null} */ (err);

        if (handleLifecycle(err)) {
          releaseCreateKey(deckVersionId, sourceSessionId);
          return;
        }

        if (errInfo?.status === 409 && errInfo?.code === 'QUIZ_UNAVAILABLE') {
          releaseCreateKey(deckVersionId, sourceSessionId);
          setUnavailable(true);
          return;
        }

        if (!isQuizRetryableError(err)) {
          releaseCreateKey(deckVersionId, sourceSessionId);
        }

        setErrorMessage(
          formatQuizError(err, 'Không thể tạo bài quiz. Vui lòng thử lại.'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPending(false);
        }
      });
  }, [deckVersionId, handleLifecycle, sourceSessionId]);

  useEffect(() => {
    if (!deckVersionId) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) startCreate();
    });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [deckVersionId, startCreate]);

  if (!deckVersionId) {
    return (
      <div className="ck-quiz-layout">
        <main className="ck-quiz-main ck-quiz-state-panel">
          <h2>Thiếu thông tin bài quiz</h2>
          <p>Không tìm thấy mã chủ đề để tạo bài quiz.</p>
          <div className="ck-quiz-state-actions">
            <Link to="/topics" className="ck-button ck-button--primary">
              Về danh sách chủ đề
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="ck-quiz-layout">
        <main className="ck-quiz-main ck-quiz-state-panel">
          <h2>Chưa có câu hỏi</h2>
          <p>Chủ đề này hiện chưa có câu hỏi quiz.</p>
          <div className="ck-quiz-state-actions">
            <Link
              to={`/topics/${encodeURIComponent(deckVersionId)}`}
              className="ck-button ck-button--primary"
            >
              Quay lại chủ đề
            </Link>
            {sourceSessionId ? (
              <Link
                to={`/sessions/${encodeURIComponent(sourceSessionId)}/summary`}
                className="ck-button ck-button--secondary"
              >
                Về tổng kết phiên
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="ck-quiz-layout">
        <main className="ck-quiz-main ck-quiz-state-panel" role="alert">
          <h2>Đã có lỗi xảy ra</h2>
          <p>{errorMessage}</p>
          <div className="ck-quiz-state-actions">
            <Button variant="primary" loading={pending} onClick={startCreate}>
              Thử lại
            </Button>
            <Link
              to={`/topics/${encodeURIComponent(deckVersionId)}`}
              className="ck-button ck-button--secondary"
            >
              Quay lại chủ đề
            </Link>
            {sourceSessionId ? (
              <Link
                to={`/sessions/${encodeURIComponent(sourceSessionId)}/summary`}
                className="ck-button ck-button--secondary"
              >
                Về tổng kết phiên
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="ck-quiz-layout">
      <main
        className="ck-quiz-main ck-quiz-state-panel"
        role="status"
        aria-live="polite"
      >
        <h2>Đang chuẩn bị câu hỏi quiz…</h2>
        <p>Vui lòng đợi trong giây lát.</p>
      </main>
    </div>
  );
}
